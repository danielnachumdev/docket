from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from waymark.db.database import database

DbSession = Annotated[Session, Depends(database.get_db)]
