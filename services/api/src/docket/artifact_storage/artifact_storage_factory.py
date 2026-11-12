from pathlib import Path

from docket.artifact_storage.artifact_storage import ArtifactStorage
from docket.artifact_storage.strategies.gcs_artifact_storage import GcsArtifactStorage
from docket.artifact_storage.strategies.local_filesystem_artifact_storage import (
    LocalFilesystemArtifactStorage,
)
from docket.config import Settings


class ArtifactStorageFactory:
    """Build the configured artifact storage backend."""

    def build(self, settings: Settings) -> ArtifactStorage:
        backend = settings.artifact_storage.strip().lower()
        if backend == "local":
            return LocalFilesystemArtifactStorage(Path(settings.artifact_local_root))
        if backend == "gcs":
            return GcsArtifactStorage(
                bucket=settings.gcs_bucket,
                prefix=settings.gcs_prefix,
            )
        raise ValueError(f"Unknown artifact storage backend: {backend!r}")
