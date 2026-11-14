from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import ColumnElement

from docket.models import Artifact, Task


class ArtifactGateway:
    """Raw artifacts table access."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, artifact_id: int) -> Artifact | None:
        return self._db.get(Artifact, artifact_id)

    def get_for_task(self, task_id: int, artifact_id: int) -> Artifact | None:
        artifact = self.get(artifact_id)
        if artifact is None or artifact.task_id != task_id:
            return None
        return artifact

    def list_for_task(self, task_id: int) -> list[Artifact]:
        return list(
            self._db.scalars(
                select(Artifact)
                .where(Artifact.task_id == task_id)
                .order_by(Artifact.created_at.desc(), Artifact.id.desc())
            ).all()
        )

    def list_with_tasks_for_ids(
        self, task_ids: Select[tuple[int]]
    ) -> list[tuple[Artifact, Task]]:
        return list(
            self._db.execute(
                select(Artifact, Task)
                .join(Task, Task.id == Artifact.task_id)
                .where(Artifact.task_id.in_(task_ids))
                .order_by(Artifact.created_at.desc(), Artifact.id.desc())
            ).all()
        )

    def page_with_tasks_for_ids(
        self,
        task_ids: Select[tuple[int]],
        *,
        kind: str | None,
        q: str,
        sort: str,
        mine_user_id: int | None,
        offset: int,
        limit: int,
    ) -> tuple[list[tuple[Artifact, Task]], int]:
        filters = self._library_filters(
            task_ids, kind=kind, q=q, mine_user_id=mine_user_id
        )
        total = self._db.scalar(
            select(func.count(Artifact.id))
            .select_from(Artifact)
            .join(Task, Task.id == Artifact.task_id)
            .where(*filters)
        )
        rows = list(
            self._db.execute(
                select(Artifact, Task)
                .join(Task, Task.id == Artifact.task_id)
                .where(*filters)
                .order_by(*self._order_by(sort))
                .offset(offset)
                .limit(limit)
            ).all()
        )
        return rows, int(total or 0)

    def kind_counts_for_ids(
        self,
        task_ids: Select[tuple[int]],
        *,
        q: str,
        mine_user_id: int | None,
    ) -> dict[str, int]:
        filters = self._library_filters(
            task_ids, kind=None, q=q, mine_user_id=mine_user_id
        )
        rows = self._db.execute(
            select(Artifact.kind, func.count(Artifact.id))
            .select_from(Artifact)
            .join(Task, Task.id == Artifact.task_id)
            .where(*filters)
            .group_by(Artifact.kind)
        ).all()
        counts = {kind: int(count) for kind, count in rows}
        counts["all"] = sum(counts.values())
        return counts

    def add(self, artifact: Artifact) -> Artifact:
        self._db.add(artifact)
        self._db.flush()
        return artifact

    def delete(self, artifact: Artifact) -> None:
        self._db.delete(artifact)

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, obj: object) -> None:
        self._db.refresh(obj)

    def _library_filters(
        self,
        task_ids: Select[tuple[int]],
        *,
        kind: str | None,
        q: str,
        mine_user_id: int | None,
    ) -> list[ColumnElement[bool]]:
        filters: list[ColumnElement[bool]] = [Artifact.task_id.in_(task_ids)]
        if kind is not None:
            filters.append(Artifact.kind == kind)
        if mine_user_id is not None:
            filters.append(Artifact.created_by_user_id == mine_user_id)
        search = self._search_filter(q)
        if search is not None:
            filters.append(search)
        return filters

    def _search_filter(self, q: str) -> ColumnElement[bool] | None:
        if not q:
            return None
        pattern = f"%{q}%"
        clauses: list[ColumnElement[bool]] = [
            Artifact.title.ilike(pattern),
            Artifact.content_text.ilike(pattern),
            Task.title.ilike(pattern),
        ]
        digits = q.lstrip("#").strip()
        if digits.isdigit():
            clauses.append(Task.owner_task_number == int(digits))
        return or_(*clauses)

    def _order_by(self, sort: str) -> tuple:
        if sort == "oldest":
            return (Artifact.created_at.asc(), Artifact.id.asc())
        if sort == "largest":
            return (
                Artifact.byte_size.desc(),
                Artifact.created_at.desc(),
                Artifact.id.desc(),
            )
        if sort == "smallest":
            return (
                Artifact.byte_size.asc(),
                Artifact.created_at.desc(),
                Artifact.id.desc(),
            )
        if sort == "name":
            return (Artifact.title.asc(), Artifact.created_at.desc(), Artifact.id.desc())
        if sort == "task":
            return (
                Task.owner_task_number.asc(),
                Artifact.created_at.desc(),
                Artifact.id.desc(),
            )
        return (Artifact.created_at.desc(), Artifact.id.desc())
