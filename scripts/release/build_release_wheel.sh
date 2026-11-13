#!/usr/bin/env bash
# Stamp semver into services/api packaging and build a wheel with uv.
#
# Usage: build_release_wheel.sh <vX.Y.Z> [out-dir]
#
# Monorepo layout: publishable package lives under services/api (src/docket).
# The actions hub default wheel script only globs */__init__.py, so we stamp
# and build from services/api explicitly.
set -euo pipefail

TAG="${1:?usage: build_release_wheel.sh <vX.Y.Z> [out-dir]}"
OUT_DIR_INPUT="${2:-dist}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="${ROOT}/services/api"
VERSION="${TAG#v}"

if [[ "${OUT_DIR_INPUT}" = /* ]]; then
  OUT_DIR="${OUT_DIR_INPUT}"
else
  OUT_DIR="${ROOT}/${OUT_DIR_INPUT}"
fi

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "build_release_wheel.sh: expected tag vX.Y.Z, got ${TAG}" >&2
  exit 1
fi

cd "${API_DIR}"

python3 - "${VERSION}" <<'PY'
import pathlib
import re
import sys

version = sys.argv[1]


def replace_once(path: pathlib.Path, pattern: str, replacement: str) -> None:
    text = path.read_text(encoding="utf-8")
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.M)
    if count != 1:
        raise SystemExit(f"{path}: failed to update version ({count} matches for {pattern!r})")
    path.write_text(new, encoding="utf-8")


replace_once(pathlib.Path("pyproject.toml"), r'^version = "[^"]+"', f'version = "{version}"')
replace_once(
    pathlib.Path("src/docket/__init__.py"),
    r'^__version__ = "[^"]+"',
    f'__version__ = "{version}"',
)
print(f"stamped services/api → {version}")
PY

# Also seed root pyproject when present (first-release fallback only).
ROOT_PYPROJECT="${ROOT}/pyproject.toml"
if [[ -f "${ROOT_PYPROJECT}" ]]; then
  python3 - "${ROOT_PYPROJECT}" "${VERSION}" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
version = sys.argv[2]
text = path.read_text(encoding="utf-8")
new, count = re.subn(r'^version = "[^"]+"', f'version = "{version}"', text, count=1, flags=re.M)
if count != 1:
    raise SystemExit(f"{path}: failed to update version ({count} matches)")
path.write_text(new, encoding="utf-8")
print(f"stamped root pyproject → {version}")
PY
fi

mkdir -p "${OUT_DIR}"
rm -f "${OUT_DIR}"/docket-"${VERSION}"-*.whl

echo "Building wheel for docket==${VERSION}…"
uv build --wheel --out-dir "${OUT_DIR}"

WHEEL="$(ls -1 "${OUT_DIR}"/docket-"${VERSION}"-*.whl 2>/dev/null | head -1 || true)"
[[ -n "${WHEEL}" && -f "${WHEEL}" ]] || {
  echo "build_release_wheel.sh: no wheel for version ${VERSION} in ${OUT_DIR}" >&2
  ls -la "${OUT_DIR}" >&2 || true
  exit 1
}

printf 'wheel=%s\n' "${WHEEL}"
