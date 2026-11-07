"""Optional Insights metadata; import before init_db to register its table."""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from kira.db import Base
from kira.models import now


class OutletProfile(Base):
    __tablename__ = "outlet_profiles"

    outlet: Mapped[str] = mapped_column(String(300), primary_key=True)
    city: Mapped[str] = mapped_column(String(100), default="")
    region: Mapped[str] = mapped_column(String(100), default="")
    updated_by: Mapped[str] = mapped_column(String(100))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
