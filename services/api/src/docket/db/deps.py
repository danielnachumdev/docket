from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from docket.db.database import database

DbSession = Annotated[Session, Depends(database.get_db)]
