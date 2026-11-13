from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class WebhookHttpResult:
    status_code: int
    text: str


class WebhookHttpGateway:
    """Raw HTTP POST for webhook delivery."""

    def __init__(self, *, timeout_seconds: float = 3.0) -> None:
        self._timeout = timeout_seconds

    def post(
        self,
        url: str,
        *,
        content: bytes,
        headers: dict[str, str],
    ) -> WebhookHttpResult:
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(url, content=content, headers=headers)
        return WebhookHttpResult(status_code=response.status_code, text=response.text)
