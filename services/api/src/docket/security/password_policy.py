from fastapi import HTTPException, status


class PasswordPolicy:
    """Shared password rules for bootstrap and invite registration."""

    MIN_LENGTH = 12

    def validate(self, password: str, *, email: str) -> None:
        if len(password) < self.MIN_LENGTH:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Password must be at least {self.MIN_LENGTH} characters",
            )
        if not any(c.isalpha() for c in password):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Password must include at least one letter",
            )
        if not any(c.isdigit() for c in password):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Password must include at least one digit",
            )
        local = email.strip().lower().split("@", 1)[0]
        if local and local in password.lower():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Password must not contain your email local part",
            )


password_policy = PasswordPolicy()
