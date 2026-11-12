"""HTTP routers."""

from docket.api.auth import auth_api
from docket.api.tasks import tasks_api

__all__ = ["auth_api", "tasks_api"]
