import secrets

# URL-safe base62; 12 chars ≈ 71 bits of entropy (nanoid-style, no dashes).
_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
PUBLIC_ID_LENGTH = 12


def new_task_public_id() -> str:
    """Canonical task SOT for APIs, URLs, and sharing (not the per-owner #)."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(PUBLIC_ID_LENGTH))
