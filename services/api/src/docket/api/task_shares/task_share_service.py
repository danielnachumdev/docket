from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.auth.rbac import RbacService
from docket.auth.task_access_service import TaskAccessService
from docket.events import task_event_recorder
from docket.models import Membership, Role, User
from docket.schemas import TaskShareCreate, TaskShareOut


class TaskShareService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._access = TaskAccessService(db)
        self._rbac = RbacService(db)

    def list_shares(self, principal: Principal, task_ref: str) -> list[TaskShareOut]:
        task = self._access.get_task(principal, task_ref, "tasks:read")
        rows = self._db.execute(
            select(Membership, User, Role)
            .join(User, User.id == Membership.user_id)
            .join(Role, Role.id == Membership.role_id)
            .where(
                Membership.scope_type == "task",
                Membership.scope_task_id == task.id,
            )
            .order_by(Membership.id.asc())
        ).all()
        return [self._share_out(m, u, r) for m, u, r in rows]

    def create_share(
        self, principal: Principal, task_ref: str, body: TaskShareCreate
    ) -> TaskShareOut:
        task = self._access.require_owner(principal, task_ref)
        role = self._rbac.shareable_role_by_name(body.role)
        if role is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Role must be viewer or editor",
            )

        email = body.email.strip().lower()
        user = self._db.scalar(select(User).where(User.email == email))
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        if user.id == task.owner_user_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Cannot share a task with its owner"
            )

        membership = self._upsert_membership(user.id, task.id, role.id)
        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="shared",
            actor=principal,
            payload={
                "membership_id": membership.id,
                "user_id": user.id,
                "email": user.email,
                "role": role.name,
            },
        )
        self._db.commit()
        self._db.refresh(membership)
        return self._share_out(membership, user, role)

    def delete_share(
        self, principal: Principal, task_ref: str, membership_id: int
    ) -> None:
        task = self._access.require_owner(principal, task_ref)
        membership = self._db.get(Membership, membership_id)
        if (
            membership is None
            or membership.scope_type != "task"
            or membership.scope_task_id != task.id
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")

        task_event_recorder.record(
            self._db,
            task_id=task.id,
            event_type="unshared",
            actor=principal,
            payload={
                "membership_id": membership.id,
                "user_id": membership.user_id,
            },
        )
        self._db.delete(membership)
        self._db.commit()

    def _upsert_membership(
        self, user_id: int, task_id: int, role_id: int
    ) -> Membership:
        existing = list(
            self._db.scalars(
                select(Membership).where(
                    Membership.user_id == user_id,
                    Membership.scope_type == "task",
                    Membership.scope_task_id == task_id,
                )
            ).all()
        )
        membership = existing[0] if existing else None
        for extra in existing[1:]:
            self._db.delete(extra)

        if membership is None:
            membership = Membership(
                user_id=user_id,
                role_id=role_id,
                scope_type="task",
                scope_task_id=task_id,
            )
            self._db.add(membership)
        else:
            membership.role_id = role_id

        self._db.flush()
        return membership

    def _share_out(
        self, membership: Membership, user: User, role: Role
    ) -> TaskShareOut:
        return TaskShareOut(
            id=membership.id,
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=role.name,
            created_at=membership.created_at,
        )
