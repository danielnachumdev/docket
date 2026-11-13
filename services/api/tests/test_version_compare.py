from docket.version_check.version_compare import is_newer, normalize_version


def test_normalize_strips_v_prefix() -> None:
    assert normalize_version("v0.2.0") == "0.2.0"
    assert normalize_version("  V1.0.0 ") == "1.0.0"


def test_is_newer_semver() -> None:
    assert is_newer("0.2.0", "0.1.0")
    assert is_newer("v0.2.0", "0.1.0")
    assert not is_newer("0.1.0", "0.1.0")
    assert not is_newer("0.1.0", "0.2.0")


def test_is_newer_invalid_is_false() -> None:
    assert not is_newer("not-a-version", "0.1.0")
    assert not is_newer("0.2.0", "bad")
