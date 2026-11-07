"""Shared data schema; rows and rules are populated by the owning services."""

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from kira.db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class RawFile(Base):
    __tablename__ = "raw_files"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(300))
    folder: Mapped[str] = mapped_column(String(300), default="")
    sheet: Mapped[str | None] = mapped_column(String(100))
    sha256: Mapped[str] = mapped_column(String(140), unique=True)
    size: Mapped[int] = mapped_column(Integer)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    text: Mapped[str] = mapped_column(Text)
    looks_like: Mapped[str | None] = mapped_column(String(20))
    uploaded_by: Mapped[str] = mapped_column(String(100))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UploadRule(Base):
    __tablename__ = "upload_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    version: Mapped[int] = mapped_column(Integer)
    delimiter: Mapped[str] = mapped_column(String(4))
    columns: Mapped[list] = mapped_column(JSON)
    rename: Mapped[dict | None] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ParsedRow(Base):
    __tablename__ = "parsed_rows"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    row_no: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)


class CleaningRules(Base):
    __tablename__ = "cleaning_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True)
    maps: Mapped[dict] = mapped_column(JSON)
    exclude: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CleanRow(Base):
    __tablename__ = "clean_rows"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    row_no: Mapped[int] = mapped_column(Integer)
    source_row: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)
    was: Mapped[dict | None] = mapped_column(JSON)


class MatchingRule(Base):
    __tablename__ = "matching_rules"
    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    stage: Mapped[str] = mapped_column(String(4), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    params: Mapped[dict] = mapped_column(JSON)
    name: Mapped[str] = mapped_column(String(100))
    position: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MatchRun(Base):
    __tablename__ = "match_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    stage: Mapped[str] = mapped_column(String(4), index=True)
    rule_ids: Mapped[list] = mapped_column(JSON)
    summary: Mapped[dict] = mapped_column(JSON)
    current: Mapped[bool] = mapped_column(Boolean, default=True)
    run_by: Mapped[str] = mapped_column(String(100))
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MatchLink(Base):
    __tablename__ = "match_links"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("match_runs.id"), index=True)
    rule_id: Mapped[str] = mapped_column(String(10))
    left_rows: Mapped[list] = mapped_column(JSON)
    right_rows: Mapped[list] = mapped_column(JSON)
    review: Mapped[bool] = mapped_column(Boolean, default=False)


class ManualLink(Base):
    __tablename__ = "manual_links"
    id: Mapped[int] = mapped_column(primary_key=True)
    stage: Mapped[str] = mapped_column(String(4), index=True)
    left_rows: Mapped[list] = mapped_column(JSON)
    right_rows: Mapped[list] = mapped_column(JSON)
    fingerprints: Mapped[dict] = mapped_column(JSON)
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class FollowUp(Base):
    __tablename__ = "follow_ups"
    id: Mapped[int] = mapped_column(primary_key=True)
    rid: Mapped[str] = mapped_column(String(300), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    note: Mapped[str] = mapped_column(Text, default="")
    assignee: Mapped[str] = mapped_column(String(100), default="")
    updated_by: Mapped[str] = mapped_column(String(100))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class WorkflowState(Base):
    __tablename__ = "workflow_state"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict | list | None] = mapped_column(JSON)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    object: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str] = mapped_column(Text, default="")
