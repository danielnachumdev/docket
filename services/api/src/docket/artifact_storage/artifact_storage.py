from abc import ABC, abstractmethod


class ArtifactStorage(ABC):
    """Opaque byte storage keyed by stable storage keys."""

    @abstractmethod
    def put(self, key: str, data: bytes, *, content_type: str | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def get(self, key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def exists(self, key: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def size(self, key: str) -> int:
        raise NotImplementedError
