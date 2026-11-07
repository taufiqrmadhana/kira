"""Human links remain valid only while the selected source rows are unchanged."""

from sqlalchemy import select

from kira.core.analysis import STAGE_TABLES, row_print
from kira.core.matching import is_sale, num
from kira.models import ManualLink
from kira.services import state
from kira.services.state import WorkflowError


def fingerprint(row):
    return row_print(row)


def version(s):
    return tuple(s.scalars(select(ManualLink.id).order_by(ManualLink.id)))


def _valid(link, T):
    for area, indices in zip(STAGE_TABLES[link.stage], (link.left_rows, link.right_rows)):
        if any(
            i < 0
            or i >= len(T[area]["rows"])
            or link.fingerprints.get(f"{area}:{i}") != fingerprint(T[area]["rows"][i])
            for i in indices
        ):
            return False
    return True


def apply(s, T, res1, res2):
    count = 0
    for link in s.scalars(select(ManualLink).order_by(ManualLink.id)):
        result = res1 if link.stage == "l1" else res2
        left = {i for x in result["links"] for i in x["left"]}
        right = {i for x in result["links"] for i in x["right"]}
        if (
            _valid(link, T)
            and not left.intersection(link.left_rows)
            and not right.intersection(link.right_rows)
        ):
            result["links"].append(
                {
                    "rule": "Manual",
                    "left": link.left_rows,
                    "right": link.right_rows,
                    "review": False,
                    "via": None,
                }
            )
            result["ambiguous"] = [
                i for i in result.get("ambiguous", []) if i not in link.left_rows
            ]
            count += 1
    return count


def describe(link, T):
    valid = _valid(link, T)
    keys = []
    for area, indices in zip(STAGE_TABLES[link.stage], (link.left_rows, link.right_rows)):
        keys.append(
            [
                str(
                    T[area]["rows"][i].get("sales_number")
                    or T[area]["rows"][i].get("reference")
                    or T[area]["rows"][i].get("id")
                    or i
                )
                for i in indices
                if 0 <= i < len(T[area]["rows"])
            ]
        )
    return {
        "id": link.id,
        "stage": link.stage,
        "left": link.left_rows,
        "right": link.right_rows,
        "left_keys": keys[0],
        "right_keys": keys[1],
        "note": link.note,
        "by": link.created_by,
        "at": link.created_at.isoformat(),
        "valid": valid,
    }


def create(s, stage, left, right, note, actor):
    from kira.services import match

    match._check_stage(stage)
    loaded = match._links(s)
    if loaded is None:
        raise WorkflowError("Run both stages before linking rows by hand")
    T, a, b = loaded
    if not left or len(right) != 1 or stage == "l1" and len(left) != 1 or not note.strip():
        raise WorkflowError("Choose valid rows and explain why they belong together")
    if len(set(left)) != len(left) or len(set(right)) != len(right):
        raise WorkflowError("Select each row only once")
    fingerprints = {}
    for area, indices in zip(STAGE_TABLES[stage], (left, right)):
        for i in indices:
            if isinstance(i, bool) or not isinstance(i, int) or i < 0 or i >= len(T[area]["rows"]):
                raise WorkflowError("Selected row does not exist")
            row = T[area]["rows"][i]
            if (
                area == "settlement"
                and not is_sale(row)
                or area == "bank"
                and num(row.get("kredit")) <= 0
            ):
                raise WorkflowError("Select settlement sales and positive bank credits")
            fingerprints[f"{area}:{i}"] = fingerprint(row)
    apply(s, T, a, b)
    result = a if stage == "l1" else b
    if any(set(left) & set(x["left"]) or set(right) & set(x["right"]) for x in result["links"]):
        raise WorkflowError("A selected row is already linked")
    link = ManualLink(
        stage=stage,
        left_rows=left,
        right_rows=right,
        fingerprints=fingerprints,
        note=note,
        created_by=actor,
    )
    s.add(link)
    s.flush()
    state.audit(s, actor, "Linked rows by hand", str(link.id), note)
    return describe(link, T)


def list_links(s):
    T = state.clean_tables(s)
    return [describe(x, T) for x in s.scalars(select(ManualLink).order_by(ManualLink.id))]


def delete(s, link_id, actor):
    link = s.get(ManualLink, link_id)
    if link is None:
        raise WorkflowError("Manual link does not exist")
    s.delete(link)
    state.audit(s, actor, "Removed manual link", str(link_id))
