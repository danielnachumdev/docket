from sqlalchemy import select
from sqlalchemy.orm import Session

from docket.models import Artifact


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
