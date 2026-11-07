"""An explicit, demo-only reset; the response is sent after the commit."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from kira.api.deps import actor, db
from kira.db import current_client
from kira.services import reset

router = APIRouter(tags=["Workflow"])


class ResetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: str = Field(max_length=40)


@router.post("/reset")
def reset_demo(body: ResetIn, s=Depends(db, scope="function"), who=Depends(actor)):
    return reset.reset_demo(s, current_client.get(), body.confirmation, who)
