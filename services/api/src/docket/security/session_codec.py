from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from docket.config import get_settings


class SessionCodec:
    """Signed session cookie encode/decode."""

    def __init__(self) -> None:
        self._salt = "docket-session"

    def _serializer(self) -> URLSafeTimedSerializer:
        return URLSafeTimedSerializer(
            get_settings().session_secret,
            salt=self._salt,
        )

    def dump(self, user_id: int) -> str:
        return self._serializer().dumps({"uid": user_id})

    def load(self, token: str) -> int | None:
        settings = get_settings()
        try:
            data = self._serializer().loads(
                token, max_age=settings.session_max_age_seconds
            )
        except (BadSignature, SignatureExpired):
            return None
        uid = data.get("uid")
        return int(uid) if isinstance(uid, int) else None


session_codec = SessionCodec()
