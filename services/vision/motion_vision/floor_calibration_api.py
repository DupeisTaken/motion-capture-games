"""Bounded, camera-free planar geometry control endpoint."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request

from .floor_calibration import fit_floor_calibration

router = APIRouter()


@router.post("/api/calibration/floor")
async def calibrate_floor(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 32768:
            raise HTTPException(
                status_code=413,
                detail="Calibration exceeds 32 KiB. Use at most 32 reference placements.",
            )
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError("Calibration must be an object.")
        return await asyncio.to_thread(fit_floor_calibration, payload)
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
