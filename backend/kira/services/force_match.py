"""Explicit payout approval, bound to the complete evidence shown to the user."""

import json

from kira.core import analysis as core
from kira.models import ForceMatchApproval, ManualLink
from kira.services import analysis, manual, match, state
from kira.services.state import WorkflowError


def create(
    s, group_id, withdrawal_n, bank_n, max_days, evidence_token, note, accept_difference, actor
):
    if not note.strip() or len(note) > 2000:
        raise WorkflowError("Enter a reason of 1 to 2,000 characters")
    if not accept_difference:
        raise WorkflowError("Confirm that the displayed payout difference is expected")
    T, _, records = analysis._need(s)
    groups = core.payout_comparison(records, records, T, max_days=max_days)
    group = next((g for g in groups if g["id"] == group_id), None)
    if not group or not group["force_match_eligible"]:
        raise WorkflowError("This payout is no longer eligible. Refresh the comparison")
    withdrawal = group["withdrawals"][0]
    bank = next((b for b in group["candidates"] if b["bank_n"] == bank_n), None)
    if withdrawal["n"] != withdrawal_n or not bank or bank["linked"]:
        raise WorkflowError(
            "Choose the unlinked credit and complete payout shown in the comparison"
        )
    if bank["evidence_token"] != evidence_token:
        raise WorkflowError("The payout evidence changed. Refresh and review it again")
    link = manual.create(s, "l2", group["settlement_indices"], [bank_n], note.strip(), actor)
    details = {
        "group_id": group_id,
        "outlet": group["outlet"],
        "day": group["day"],
        "entity_id": group["entity_id"],
        "withdrawal_n": withdrawal_n,
        "withdrawal_fingerprint": manual.fingerprint(T["settlement"]["rows"][withdrawal_n]),
        "net_settled": group["net_settled"],
        "withdrawal_amount": withdrawal["amount"],
        "bank_credit": bank["bank_credit"],
        "bank_day": bank["day"],
        "delay_days": bank["delay_days"],
        "difference": withdrawal["amount"] - bank["bank_credit"],
        "accept_difference": True,
    }
    approval = ForceMatchApproval(manual_link_id=link["id"], details=details)
    s.add(approval)
    s.flush()
    state.audit(
        s,
        actor,
        "Force matched payout",
        str(link["id"]),
        json.dumps({**details, "note": note.strip(), "settlement_count": group["group_count"]}),
    )
    s.info.pop("analysis", None)
    return manual.describe(s.get(ManualLink, link["id"]), T, approval)


def list_approvals(s):
    loaded = match._links(s)
    active = set()
    if loaded:
        T, a, b = loaded
        manual.apply(s, T, a, b)
        active = {link.get("manual_id") for link in b["links"]}
    return [
        {**link, "active": link["id"] in active}
        for link in manual.list_links(s)
        if "force_match" in link
    ]
