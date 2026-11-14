from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from docket.models import Artifact, Task, User


@dataclass(frozen=True)
class KindAggregate:
    kind: str
    artifact_count: int
    stored_bytes: int


@dataclass(frozen=True)
class UploaderAggregate:
    user_id: int
    email: str | None
    display_name: str
    artifact_count: int
    stored_bytes: int


@dataclass(frozen=True)
class TaskAggregate:
    task_id: int
    public_id: str
    task_number: int
    title: str
    artifact_count: int
    stored_bytes: int


class StorageStatsGateway:
    """Raw aggregation queries over artifacts for admin storage overview."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def totals_by_kind(self) -> list[KindAggregate]:
        rows = self._db.execute(
            select(
                Artifact.kind,
                func.count(Artifact.id),
                func.coalesce(func.sum(Artifact.byte_size), 0),
            ).group_by(Artifact.kind)
        ).all()
        return [
            KindAggregate(
                kind=str(kind),
                artifact_count=int(count),
                stored_bytes=int(stored),
            )
            for kind, count, stored in rows
        ]

    def totals_by_uploader(self) -> list[UploaderAggregate]:
        rows = self._db.execute(
            select(
                User.id,
                User.email,
                User.display_name,
                func.count(Artifact.id),
                func.coalesce(func.sum(Artifact.byte_size), 0),
            )
            .join(User, User.id == Artifact.created_by_user_id)
            .group_by(User.id, User.email, User.display_name)
            .order_by(
                func.coalesce(func.sum(Artifact.byte_size), 0).desc(),
                func.count(Artifact.id).desc(),
                User.id.asc(),
            )
        ).all()
        return [
            UploaderAggregate(
                user_id=int(user_id),
                email=email,
                display_name=str(display_name),
                artifact_count=int(count),
                stored_bytes=int(stored),
            )
            for user_id, email, display_name, count, stored in rows
        ]

    def top_tasks_by_size(self, *, limit: int = 10) -> list[TaskAggregate]:
        rows = self._db.execute(
            select(
                Task.id,
                Task.public_id,
                Task.owner_task_number,
                Task.title,
                func.count(Artifact.id),
                func.coalesce(func.sum(Artifact.byte_size), 0),
            )
            .join(Artifact, Artifact.task_id == Task.id)
            .group_by(
                Task.id,
                Task.public_id,
                Task.owner_task_number,
                Task.title,
            )
            .order_by(
                func.coalesce(func.sum(Artifact.byte_size), 0).desc(),
                func.count(Artifact.id).desc(),
                Task.id.asc(),
            )
            .limit(limit)
        ).all()
        return [
            TaskAggregate(
                task_id=int(task_id),
                public_id=str(public_id),
                task_number=int(task_number),
                title=str(title),
                artifact_count=int(count),
                stored_bytes=int(stored),
            )
            for task_id, public_id, task_number, title, count, stored in rows
        ]
