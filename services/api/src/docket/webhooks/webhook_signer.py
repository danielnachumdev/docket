import hashlib
import hmac


class WebhookSigner:
    """HMAC-SHA256 signatures for outbound webhook bodies."""

    def sign(self, secret: str, body: bytes) -> str:
        digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def header_name(self) -> str:
        return "X-Docket-Signature"


webhook_signer = WebhookSigner()
