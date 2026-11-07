"""Record decisions; the matching owner adds the learning summary."""

from sqlalchemy.orm import Session

from kira.models import now
from kira.services import state

KEY = "learning"


def note(s: Session, kind: str, **data) -> None:
    """Append an event in the caller's transaction for a later per-close summary."""
    events = state.get(s, KEY, [])
    events.append({**data, "kind": kind, "at": now().isoformat()})
    state.put(s, KEY, events)
