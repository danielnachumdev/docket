"""HTTP routers."""

from docket.api.artifacts import artifacts_api
from docket.api.auth import auth_api
from docket.api.invites import invites_api
from docket.api.notifications import notifications_api
from docket.api.saved_views import saved_views_api
from docket.api.task_shares import task_shares_api
from docket.api.task_watches import task_watches_api
from docket.api.tasks import tasks_api
from docket.api.tokens import tokens_api
from docket.api.version import version_api
from docket.api.webhooks import webhooks_api

__all__ = [
    "artifacts_api",
    "auth_api",
    "invites_api",
    "notifications_api",
    "saved_views_api",
    "task_shares_api",
    "task_watches_api",
    "tasks_api",
    "tokens_api",
    "version_api",
    "webhooks_api",
]
