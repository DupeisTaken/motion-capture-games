"""Loopback-only diagnostic control and pull-based frame delivery."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .cameras import discover_cameras
from .floor_calibration_api import router as floor_calibration_router
from .runtime import StartRequest, VisionRuntime

ALLOWED_ORIGINS = {
    f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 4173, 8765)
}


class StopRequest(BaseModel):
    epoch: str = Field(min_length=1, max_length=128)


def create_app(runtime: VisionRuntime | None = None) -> FastAPI:
    vision = runtime or VisionRuntime()
    clients: dict[WebSocket, str | None] = {}
    start_gate = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await asyncio.to_thread(vision.stop)

    app = FastAPI(title="Motion diagnostic vision", lifespan=lifespan)
    app.include_router(floor_calibration_router)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])

    @app.middleware("http")
    async def loopback_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "This local diagnostic service accepts only its local operator interface."
                },
            )
        return await call_next(request)

    @app.get("/api/status")
    async def status():
        return vision.status()

    @app.get("/api/cameras")
    async def cameras():
        try:
            devices = await asyncio.to_thread(discover_cameras)
            return {"cameras": [{"id": item["id"], "name": item["name"]} for item in devices]}
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error

    @app.post("/api/start")
    async def start(settings: StartRequest):
        try:
            async with start_gate:
                return await asyncio.to_thread(vision.start, settings)
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/api/calibration/start")
    async def calibration_start(settings: StartRequest):
        # Share acquisition, but a setup preview must never replace another tab's source.
        async with start_gate:
            if settings.source != "camera":
                raise HTTPException(
                    status_code=422, detail="Calibration requires an explicitly selected camera."
                )
            if vision.status()["state"] != "idle":
                raise HTTPException(
                    status_code=409,
                    detail="Stop the active source in its owning page before starting calibration. Retry camera stop if release failed.",
                )
            try:
                return await asyncio.to_thread(vision.start, settings)
            except RuntimeError as error:
                raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/api/stop")
    async def stop(source: StopRequest | None = None):
        try:
            if source is not None:
                await asyncio.to_thread(vision.stop_if_epoch, source.epoch)
                return vision.status()
            return await asyncio.to_thread(vision.stop)
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    async def stream(socket: WebSocket, kind: str = "paired"):
        origin = socket.headers.get("origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            await socket.close(code=1008, reason="Local operator origin required")
            return
        owned_epoch = vision.status()["epoch"]
        expected_epoch = socket.query_params.get("epoch")
        if expected_epoch is not None and expected_epoch != owned_epoch:
            # A delayed connection from an old Start acknowledgement cannot own a newer source.
            await socket.close(code=1008, reason="Source epoch changed; restart the preview")
            return
        await socket.accept()
        clients[socket] = owned_epoch
        previous_epoch: str | None = None
        after = 0
        try:
            while True:
                message = await socket.receive_text()
                if len(message) > 128:
                    await socket.close(code=1009, reason="Control message too large")
                    break
                try:
                    command = json.loads(message)
                except json.JSONDecodeError:
                    command = None
                if command != {"type": "next"}:
                    await socket.close(code=1008, reason="Expected a next-frame request")
                    break
                current = vision.status()
                if current["epoch"] != previous_epoch:
                    previous_epoch, after = current["epoch"], 0
                next_item = {
                    "paired": vision.next_packet,
                    "preview": vision.next_preview,
                    "observations": vision.next_observation,
                }[kind]
                sequence, packet = await asyncio.to_thread(next_item, after)
                if packet is not None:
                    # One request, one current paired image+pose; never replay a reliable backlog.
                    if kind == "observations":
                        await socket.send_json(packet)
                    else:
                        await socket.send_bytes(packet)
                    after = sequence
                else:
                    status = vision.status()
                    if status["state"] == "stale":
                        await asyncio.sleep(0.2)
                        status = vision.status()
                    await socket.send_json({"type": "status", **status})
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            clients.pop(socket, None)
            if owned_epoch not in clients.values():
                # Closing the final viewer releases capture as well as explicit Stop.
                try:
                    await asyncio.to_thread(vision.stop_if_epoch, owned_epoch)
                except RuntimeError:
                    pass

    @app.websocket("/api/stream")
    async def paired_stream(socket: WebSocket):
        await stream(socket)

    @app.websocket("/api/preview")
    async def preview_stream(socket: WebSocket):
        await stream(socket, "preview")

    @app.websocket("/api/observations")
    async def observation_stream(socket: WebSocket):
        await stream(socket, "observations")

    return app


app = create_app()
