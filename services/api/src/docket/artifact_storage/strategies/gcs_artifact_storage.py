try:
    from google.cloud import storage as gcs_storage
except ImportError:  # pragma: no cover - optional extra
    gcs_storage = None

from docket.artifact_storage.artifact_storage import ArtifactStorage


class GcsArtifactStorage(ArtifactStorage):
    """Store blobs in a Google Cloud Storage bucket."""

    def __init__(
        self,
        bucket: str,
        prefix: str = "",
        *,
        client: object | None = None,
    ) -> None:
        if not bucket.strip():
            raise ValueError("GCS bucket is required when artifact_storage=gcs")
        self._client = client if client is not None else self._default_client()
        self._bucket = self._client.bucket(bucket)  # type: ignore[union-attr]
        self._prefix = prefix.strip("/")

    def put(self, key: str, data: bytes, *, content_type: str | None = None) -> None:
        blob = self._blob(key)
        blob.upload_from_string(data, content_type=content_type)

    def get(self, key: str) -> bytes:
        blob = self._blob(key)
        if not blob.exists():
            raise FileNotFoundError(key)
        return blob.download_as_bytes()

    def delete(self, key: str) -> None:
        blob = self._blob(key)
        if blob.exists():
            blob.delete()

    def exists(self, key: str) -> bool:
        return bool(self._blob(key).exists())

    def size(self, key: str) -> int:
        blob = self._blob(key)
        if not blob.exists():
            raise FileNotFoundError(key)
        blob.reload()
        return int(blob.size)

    def _blob(self, key: str):
        return self._bucket.blob(self._object_name(key))

    def _object_name(self, key: str) -> str:
        cleaned = key.lstrip("/")
        if not self._prefix:
            return cleaned
        return f"{self._prefix}/{cleaned}"

    def _default_client(self):
        if gcs_storage is None:
            raise RuntimeError(
                "google-cloud-storage is required for GCS artifact storage; "
                "install with: uv sync --extra gcs"
            )
        return gcs_storage.Client()
