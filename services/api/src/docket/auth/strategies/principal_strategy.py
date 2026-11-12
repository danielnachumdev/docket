from abc import ABC, abstractmethod

from sqlalchemy.orm import Session
from starlette.requests import Request

from docket.auth.principal import Principal


class PrincipalStrategy(ABC):
    """Resolve a Principal from an HTTP request, or return None."""

    @abstractmethod
    def resolve(self, request: Request, db: Session) -> Principal | None:
        raise NotImplementedError
