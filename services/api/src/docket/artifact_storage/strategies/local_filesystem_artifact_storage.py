from pathlib import Path

from docket.artifact_storage.artifact_storage import ArtifactStorage


class LocalFilesystemArtifactStorage(ArtifactStorage):
    """Store blobs under a configurable local root directory."""

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, data: bytes, *, content_type: str | None = None) -> None:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        path = self._path_for(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path.read_bytes()

    def delete(self, key: str) -> None:
        path = self._path_for(key)
        if path.is_file():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path_for(key).is_file()

    def _path_for(self, key: str) -> Path:
        relative = Path(key)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Invalid storage key: {key!r}")
        path = (self._root / relative).resolve()
        if not path.is_relative_to(self._root):
            raise ValueError(f"Invalid storage key: {key!r}")
        return path
