from pathlib import Path

import pytest

from docket.artifact_storage import (
    ArtifactStorageFactory,
    GcsArtifactStorage,
    LocalFilesystemArtifactStorage,
)
from docket.config import Settings


class _FakeBlob:
    def __init__(self, store: dict[str, bytes], name: str) -> None:
        self._store = store
        self.name = name

    def upload_from_string(self, data: bytes, content_type: str | None = None) -> None:
        self._store[self.name] = data

    def download_as_bytes(self) -> bytes:
        return self._store[self.name]

    def exists(self) -> bool:
        return self.name in self._store

    def delete(self) -> None:
        self._store.pop(self.name, None)


class _FakeBucket:
    def __init__(self, store: dict[str, bytes]) -> None:
        self._store = store

    def blob(self, name: str) -> _FakeBlob:
        return _FakeBlob(self._store, name)


class _FakeClient:
    def __init__(self) -> None:
        self._store: dict[str, bytes] = {}

    def bucket(self, _name: str) -> _FakeBucket:
        return _FakeBucket(self._store)


def test_local_filesystem_put_get_delete_exists(tmp_path: Path) -> None:
    storage = LocalFilesystemArtifactStorage(tmp_path)
    key = "42/demo.bin"
    storage.put(key, b"hello", content_type="text/plain")
    assert storage.exists(key)
    assert storage.get(key) == b"hello"
    storage.delete(key)
    assert not storage.exists(key)


def test_local_filesystem_rejects_path_escape(tmp_path: Path) -> None:
    storage = LocalFilesystemArtifactStorage(tmp_path)
    with pytest.raises(ValueError):
        storage.put("../escape.bin", b"nope")


def test_gcs_storage_with_fake_client() -> None:
    client = _FakeClient()
    storage = GcsArtifactStorage("demo-bucket", prefix="artifacts", client=client)
    key = "7/note.txt"
    storage.put(key, b"payload", content_type="text/plain")
    assert storage.exists(key)
    assert storage.get(key) == b"payload"
    assert "artifacts/7/note.txt" in client._store
    storage.delete(key)
    assert not storage.exists(key)


def test_factory_builds_local(tmp_path: Path) -> None:
    settings = Settings(
        artifact_storage="local",
        artifact_local_root=str(tmp_path),
    )
    storage = ArtifactStorageFactory().build(settings)
    assert isinstance(storage, LocalFilesystemArtifactStorage)
    storage.put("1/a", b"x")
    assert storage.get("1/a") == b"x"


def test_factory_rejects_unknown_backend() -> None:
    settings = Settings(artifact_storage="s3")
    with pytest.raises(ValueError, match="Unknown artifact storage"):
        ArtifactStorageFactory().build(settings)
