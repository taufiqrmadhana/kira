"""Optional Outlet Insights router; registered by the integration owner."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from kira.api.deps import actor
from kira.db import session_scope
from kira.services import performance

router = APIRouter(prefix="/performance", tags=["performance"])


def db():
    # The shared GET dependency rolls back. Insights seeds profile metadata on
    # first read, so this dependency commits it under the usual write lock.
    with session_scope(write=True) as s:
        yield s


def filters(
    date_from: str = "",
    date_to: str = "",
    outlet: str = "",
    city: str = "",
    region: str = "",
    period: str = "",
):
    return {
        "date_from": date_from,
        "date_to": date_to,
        "outlet": outlet,
        "city": city,
        "region": region,
        "period": period,
    }


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    outlet: str = Field(min_length=1, max_length=300)
    city: str = Field(default="", max_length=100)
    region: str = Field(default="", max_length=100)


class ProfilesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profiles: list[ProfileIn]


@router.get("/outlets")
def outlets(f=Depends(filters), s=Depends(db, scope="function")):
    return performance.outlets(s, f)


@router.get("/anomalies")
def anomalies(f=Depends(filters), s=Depends(db, scope="function")):
    return performance.anomalies(s, f)


@router.get("/outlet-profiles")
def profiles(s=Depends(db, scope="function")):
    return performance.profiles(s)


@router.put("/outlet-profiles")
def save_profiles(body: ProfilesIn, s=Depends(db, scope="function"), user=Depends(actor)):
    return performance.save_profiles(s, [p.model_dump() for p in body.profiles], user)
