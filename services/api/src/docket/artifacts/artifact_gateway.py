from sqlalchemy import Select, select
from sqlalchemy.orm import Session

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
