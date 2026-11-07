from fastapi import APIRouter, Depends, Query

from kira.api.deps import db
from kira.services import status

router = APIRouter(tags=["Workflow"])


@router.get("/status")
def get_status(s=Depends(db, scope="function")):
    return status.status(s)


@router.get("/workflow")
def workflow(rows: int = Query(100, ge=0, le=1000), s=Depends(db, scope="function")):
    return status.workflow(s, rows=rows)


@router.get("/audit")
def audit(limit: int = Query(100, ge=1, le=1000), s=Depends(db, scope="function")):
    return status.audit_log(s, limit=limit)
