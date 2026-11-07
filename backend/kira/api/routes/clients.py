from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from kira.api.deps import default_db
from kira.services import clients

router = APIRouter(tags=["Clients"])


class Client(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    id: str | None = Field(default=None, max_length=40)


@router.get("/clients")
def list_clients(s=Depends(default_db, scope="function")):
    return clients.list_clients(session=s)


@router.post("/clients")
def save_client(body: Client, s=Depends(default_db, scope="function")):
    return clients.save_client(body.name, body.id, session=s)
