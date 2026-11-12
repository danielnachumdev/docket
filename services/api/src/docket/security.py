from __future__ import annotations

from pwdlib import PasswordHash

from docket.config import get_settings

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def make_session_serializer():
    from itsdangerous import URLSafeTimedSerializer

    return URLSafeTimedSerializer(
        get_settings().session_secret,
        salt="docket-session",
    )


def dump_session(user_id: int) -> str:
    return make_session_serializer().dumps({"uid": user_id})


def load_session(token: str) -> int | None:
    from itsdangerous import BadSignature, SignatureExpired

    settings = get_settings()
    try:
        data = make_session_serializer().loads(
            token, max_age=settings.session_max_age_seconds
        )
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid")
    return int(uid) if isinstance(uid, int) else None
