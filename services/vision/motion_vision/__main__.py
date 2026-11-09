"""Start the local diagnostic vision service without opening a camera."""

import os

# Bound native CPU pools before importing inference libraries.
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "motion_vision.server:app", host="127.0.0.1", port=8765, ws_max_size=4096, ws_max_queue=1
    )
