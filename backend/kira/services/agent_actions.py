"""Approved assistant actions share the page's data services and audit trail."""

from urllib.parse import urlencode

from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError

from kira.db import current_client
from kira.services import analysis, state


class ExportScope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    date_from: str = ""
    date_to: str = ""
    outlet: str = ""
    provider: str = ""
    status: str = ""
    reason: str = ""
    q: str = ""
    keys: str = ""
    ids: str = ""
    amount_min: float | None = Field(default=None, allow_inf_nan=False)
    amount_max: float | None = Field(default=None, allow_inf_nan=False)
    pos_only: StrictBool = False
    only_differences: StrictBool = False


def export_results(s, scope, actor):
    try:
        validated = ExportScope.model_validate({} if scope is None else scope).model_dump(
            exclude_defaults=True
        )
    except ValidationError as exc:
        raise state.WorkflowError("Choose valid analysis filters for the export scope.") from exc
    selected = analysis.scope_of(validated)
    # Validate readiness and render with the same export implementation as the page.
    # The CSV stays on the server; only the scoped, client-bound download directive
    # enters the conversation. Clicking the link fetches the current selected data.
    analysis.export(s, selected, actor)
    query = urlencode(
        {
            key: str(value).lower() if isinstance(value, bool) else value
            for key, value in selected.items()
        }
    )
    return {
        "download": "/api/analysis/export" + ("?" + query if query else ""),
        "filename": "kira-results.csv",
        "client_id": current_client.get(),
    }
