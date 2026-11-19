"""HTTP routers."""

from waymark.api.admin import admin_backup_api, admin_storage_api
from waymark.api.artifacts import artifacts_api
from waymark.api.auth import auth_api
from waymark.api.contacts import contacts_api
from waymark.api.invites import invites_api
from waymark.api.me_stats import me_stats_api
from waymark.api.notifications import notifications_api
from waymark.api.preferences import preferences_api
from waymark.api.saved_views import saved_views_api
from waymark.api.task_activity import task_activity_api
from waymark.api.task_comments import task_comments_api
from waymark.api.task_external_shares import (
    public_external_shares_api,
    task_external_shares_api,
)
from waymark.api.task_shares import task_shares_api
from waymark.api.task_watches import task_watches_api
from waymark.api.tasks import tasks_api
from waymark.api.tokens import tokens_api
from waymark.api.version import version_api
from waymark.api.webhooks import webhooks_api

__all__ = [
    "admin_backup_api",
    "admin_storage_api",
    "artifacts_api",
    "auth_api",
    "contacts_api",
    "invites_api",
    "me_stats_api",
    "notifications_api",
    "preferences_api",
    "public_external_shares_api",
    "saved_views_api",
    "task_activity_api",
    "task_comments_api",
    "task_external_shares_api",
    "task_shares_api",
    "task_watches_api",
    "tasks_api",
    "tokens_api",
    "version_api",
    "webhooks_api",
]
