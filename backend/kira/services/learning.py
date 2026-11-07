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


def summary(s: Session) -> dict:
    """Read decisions per close, without counting a reused rule as another decision."""
    from sqlalchemy import func, select

    from kira.models import CleaningRules, FollowUp, ManualLink, MatchingRule, RawFile, UploadRule

    closes, asked = [], []
    for event in state.get(s, KEY, []):
        kind = event.get("kind")
        if kind in {"close", "l2", "matching_run"}:
            closes.append(
                {
                    "questions": len(asked),
                    "asked": asked,
                    "reused": event.get("reused", []),
                    "files": event.get(
                        "files", s.scalar(select(func.count()).select_from(RawFile))
                    ),
                    "at": event["at"],
                    "pos": event.get("pos", 0),
                    "matched": event.get("matched", 0),
                    "rules_used": event.get("rules_used", []),
                }
            )
            asked = []
        elif kind in {"upload", "upload_rule"}:
            asked.append(
                f"{str(event.get('choice', 'create')).capitalize()} the {event.get('table', event.get('type', 'file'))} upload rule"
            )
        elif kind in {"clean", "cleaning", "cleaning_card"}:
            cards = event.get("cards")
            asked.extend(
                [f"Save cleaning: {c}" for c in cards]
                if isinstance(cards, list)
                else [f"Save cleaning: {event.get('name', event.get('id', 'recommendation'))}"]
            )
        elif kind in {"matching_rule", "match_rule"}:
            asked.append(f"Save matching rule: {event.get('name', event.get('rule', ''))}")
    rules = s.scalar(select(CleaningRules).order_by(CleaningRules.version.desc()).limit(1))
    knowledge = {
        "file_formats": s.scalar(select(func.count(func.distinct(UploadRule.type)))),
        "cleaning_values": sum(len(v) for v in (rules.maps if rules else {}).values()),
        "bank_kinds": len((rules.exclude if rules else {}).get("bank", {})),
        "matching_rules": s.scalar(select(func.count()).select_from(MatchingRule)),
        "manual_links": s.scalar(select(func.count()).select_from(ManualLink)),
        "resolved_follow_ups": s.scalar(
            select(func.count()).select_from(FollowUp).where(FollowUp.status == "resolved")
        ),
    }
    return {
        "closes": closes,
        "open": {"questions": len(asked), "asked": asked} if asked else None,
        "knowledge": knowledge,
    }
