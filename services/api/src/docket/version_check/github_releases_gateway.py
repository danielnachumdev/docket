import httpx


class GithubReleasesGateway:
    """Raw GitHub Releases HTTP calls."""

    def __init__(
        self,
        *,
        owner: str,
        repo: str,
        timeout_seconds: float = 5.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._owner = owner
        self._repo = repo
        self._timeout = timeout_seconds
        self._client = client

    def get_latest_release(self) -> dict:
        url = f"https://api.github.com/repos/{self._owner}/{self._repo}/releases/latest"
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "docket-version-check",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._client is not None:
            response = self._client.get(url, headers=headers)
        else:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
