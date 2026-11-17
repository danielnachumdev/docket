import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import TimeoutError as SATimeoutError

logger = logging.getLogger(__name__)


class PoolTimeoutHandler:
    """Map SQLAlchemy pool checkout timeouts to a fast HTTP 503."""

    DETAIL = "Database busy; try again shortly"

    def register(self, app: FastAPI) -> None:
        @app.exception_handler(SATimeoutError)
        async def _handle_pool_timeout(
            _request: Request, exc: SATimeoutError
        ) -> JSONResponse:
            logger.warning("Database pool exhausted: %s", exc)
            return JSONResponse(
                status_code=503,
                content={"detail": self.DETAIL},
            )


pool_timeout_handler = PoolTimeoutHandler()
