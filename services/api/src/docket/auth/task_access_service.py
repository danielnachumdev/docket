from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from docket.auth.principal import Principal
from docket.auth.rbac import RbacService
from docket.models import Membership, Task


class TaskAccessService:
    """Authorize task reads/writes via ownership or task-scoped memberships."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._rbac = RbacService(db)

    def accessible_task_ids_select(self, user_id: int) -> Select[tuple[int]]:
        shared = select(Membership.scope_task_id).where(
            Membership.user_id == user_id,
            Membership.scope_type == "task",
            Membership.scope_task_id.is_not(None),
        )
        return select(Task.id).where(
            or_(Task.owner_user_id == user_id, Task.id.in_(shared))
        )

    def list_visible_tasks_stmt(self, user_id: int) -> Select[tuple[Task]]:
        return select(Task).where(Task.id.in_(self.accessible_task_ids_select(user_id)))

    def get_task(
        self, principal: Principal, task_id: int, permission: str
    ) -> Task:
        task = self._db.get(Task, task_id)
        if task is None or not self._may_access(principal, task, permission):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        return task

    def require_owner(self, principal: Principal, task_id: int) -> Task:
        task = self._db.get(Task, task_id)
        if task is None or task.owner_user_id != principal.user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        return task

    def _may_access(
        self, principal: Principal, task: Task, permission: str
    ) -> bool:
        if task.owner_user_id == principal.user_id:
            return self._rbac.principal_has_permission(principal, permission)
        return self._rbac.principal_has_task_permission(
            principal, task.id, permission
        )
