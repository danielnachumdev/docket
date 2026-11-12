from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from docket.auth.principal import Principal
from docket.events import task_event_recorder
from docket.models import Task, TaskLink


class TaskLinkService:
    """Create, list, and delete graph edges between same-owner tasks."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def list_for_task(self, *, user_id: int, task_id: int) -> list[TaskLink]:
        self._require_owned_task(user_id, task_id)
        stmt = (
            select(TaskLink)
            .where(
                or_(
                    TaskLink.from_task_id == task_id,
                    TaskLink.to_task_id == task_id,
                )
            )
            .order_by(TaskLink.id.asc())
        )
        return list(self._db.scalars(stmt).all())

    def create(
        self,
        *,
        principal: Principal,
        from_task_id: int,
        to_task_id: int,
        kind: str,
    ) -> TaskLink:
        kind = kind.strip()
        if from_task_id == to_task_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Cannot link a task to itself"
            )

        from_task = self._require_owned_task(principal.user_id, from_task_id)
        to_task = self._require_owned_task(principal.user_id, to_task_id)
        if from_task.owner_user_id != to_task.owner_user_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Tasks must share the same owner"
            )

        link = TaskLink(
            from_task_id=from_task_id,
            to_task_id=to_task_id,
            kind=kind,
            created_by_user_id=principal.user_id,
            created_by_token_id=principal.token_id,
        )
        self._db.add(link)
        try:
            self._db.flush()
        except IntegrityError as exc:
            self._db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Link already exists"
            ) from exc

        payload = {
            "link_id": link.id,
            "from_task_id": from_task_id,
            "to_task_id": to_task_id,
            "kind": kind,
        }
        self._emit_on_endpoints(
            from_task_id=from_task_id,
            to_task_id=to_task_id,
            event_type="linked",
            actor=principal,
            payload=payload,
        )
        self._db.commit()
        self._db.refresh(link)
        return link

    def delete(
        self, *, principal: Principal, task_id: int, link_id: int
    ) -> None:
        self._require_owned_task(principal.user_id, task_id)
        link = self._db.get(TaskLink, link_id)
        if link is None or task_id not in (link.from_task_id, link.to_task_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")

        other_id = (
            link.to_task_id if link.from_task_id == task_id else link.from_task_id
        )
        other = self._db.get(Task, other_id)
        if other is None or other.owner_user_id != principal.user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")

        payload = {
            "link_id": link.id,
            "from_task_id": link.from_task_id,
            "to_task_id": link.to_task_id,
            "kind": link.kind,
        }
        from_id, to_id = link.from_task_id, link.to_task_id
        self._db.delete(link)
        self._db.flush()
        self._emit_on_endpoints(
            from_task_id=from_id,
            to_task_id=to_id,
            event_type="unlinked",
            actor=principal,
            payload=payload,
        )
        self._db.commit()

    def _require_owned_task(self, user_id: int, task_id: int) -> Task:
        task = self._db.get(Task, task_id)
        if task is None or task.owner_user_id != user_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        return task

    def _emit_on_endpoints(
        self,
        *,
        from_task_id: int,
        to_task_id: int,
        event_type: str,
        actor: Principal,
        payload: dict,
    ) -> None:
        for endpoint_id in {from_task_id, to_task_id}:
            task_event_recorder.record(
                self._db,
                task_id=endpoint_id,
                event_type=event_type,
                actor=actor,
                payload=payload,
            )
