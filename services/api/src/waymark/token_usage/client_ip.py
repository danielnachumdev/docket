from starlette.types import Scope


class ClientIp:
    """Resolve the caller IP from ASGI scope (X-Forwarded-For first hop)."""

    @staticmethod
    def from_scope(scope: Scope) -> str | None:
        for key, value in scope.get("headers") or ():
            if key.lower() == b"x-forwarded-for":
                first = value.decode("latin-1", errors="replace").split(",")[0].strip()
                return ClientIp._clip(first)
        client = scope.get("client")
        if client and client[0]:
            return ClientIp._clip(str(client[0]))
        return None

    @staticmethod
    def _clip(value: str) -> str | None:
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned[:45]
