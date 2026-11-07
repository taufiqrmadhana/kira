from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, StrictBool

from kira.api.deps import chat_user

router = APIRouter(prefix="/agent", tags=["Kira agent"])


class Message(BaseModel):
    session_id: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1)
    context: dict | None = None


class Confirmation(BaseModel):
    session_id: str = Field(min_length=1, max_length=200)
    answers: dict[str, StrictBool]


@router.post("/chat")
async def chat(body: Message, who=Depends(chat_user)):
    from kira.agent.chat import send

    return await send(body.session_id, who, body.message, body.context)


@router.post("/confirm")
async def confirm(body: Confirmation, who=Depends(chat_user)):
    from kira.agent.chat import confirm as answer

    return await answer(body.session_id, who, body.answers)


@router.get("/history")
async def history(session_id: str = Query(min_length=1, max_length=200), who=Depends(chat_user)):
    from kira.agent.chat import history as get_history

    return await get_history(session_id, who)
