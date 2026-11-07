"""Overview and learning data consumed by Andrew's screens."""

from fastapi import APIRouter, Depends

from kira.api.deps import db
from kira.services import analysis, learning

router = APIRouter(tags=["Overview"])


@router.get("/overview")
def overview(s=Depends(db, scope="function")):
    return analysis.overview(s)


@router.get("/learning")
def get_learning(s=Depends(db, scope="function")):
    return learning.summary(s)
