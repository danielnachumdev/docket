from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from docket import __version__
from docket.config import ROOT, get_settings
from docket.db import SessionLocal
from docket.seed import seed_rbac


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(
            parents=True, exist_ok=True
        )
    db = SessionLocal()
    try:
        seed_rbac(db)
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    return app


app = create_app()


def main() -> None:
    import os

    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    reload = os.getenv("RELOAD", "1") not in {"0", "false", "False"}
    uvicorn.run(
        "docket.main:app",
        host=host,
        port=int(os.getenv("PORT", "8000")),
        reload=reload,
        reload_dirs=[str(ROOT / "src")] if reload else None,
    )
