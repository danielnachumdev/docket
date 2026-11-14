from waymark.artifact_storage.artifact_storage import ArtifactStorage
from waymark.artifact_storage.artifact_storage_factory import ArtifactStorageFactory
from waymark.artifact_storage.strategies import (
    GcsArtifactStorage,
    LocalFilesystemArtifactStorage,
)

__all__ = [
    "ArtifactStorage",
    "ArtifactStorageFactory",
    "GcsArtifactStorage",
    "LocalFilesystemArtifactStorage",
]
