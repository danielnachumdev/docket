from packaging.version import InvalidVersion, Version


def normalize_version(raw: str) -> str:
    return raw.strip().lstrip("vV").strip()


def is_newer(candidate: str, current: str) -> bool:
    try:
        return Version(normalize_version(candidate)) > Version(normalize_version(current))
    except InvalidVersion:
        return False
