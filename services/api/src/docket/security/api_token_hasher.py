import hashlib

from docket.config import get_settings


class ApiTokenHasher:
    def hash(self, raw_token: str) -> str:
        pepper = get_settings().token_pepper
        return hashlib.sha256(f"{pepper}:{raw_token}".encode()).hexdigest()


api_token_hasher = ApiTokenHasher()
