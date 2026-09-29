"""SPJ draft persist, read, confirm + gated HTML export (Phase B3)."""

from __future__ import annotations

import time
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.models.file import File
from app.models.knowledge import Knowledge, KnowledgeFile
from app.models.spj_draft import SpjDraft
from app.core.config import get_settings
from app.services.spj_fields import compute_document_total, render_accountability_stub, with_threshold

router = APIRouter(tags=["spj"])


async def _get_owned_kb(db: AsyncSession, user_id: str, knowledge_id: str) -> Knowledge:
    kb = await db.get(Knowledge, knowledge_id)
    if kb is None or kb.user_id != user_id:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    return kb


def _build_snapshot(member_files: list[File]) -> dict[str, Any]:
    """Concat ready member files' stored `data.fields`: lines in file order,
    first non-null vendor/date wins. Files without parseable fields are skipped.
    Then annotate with mean line confidence and below_threshold via settings."""
    lines: list[dict[str, Any]] = []
    vendor: str | None = None
    date: str | None = None
    for row in member_files:
        fields = row.data.get("fields") if isinstance(row.data, dict) else None
        if not isinstance(fields, dict) or "lines" not in fields:
            continue
        lines.extend(fields.get("lines") or [])
        vendor = vendor if vendor is not None else fields.get("vendor")
        date = date if date is not None else fields.get("date")
    snapshot = {"vendor": vendor, "date": date, "currency": "IDR", "lines": lines}
    return with_threshold(snapshot, get_settings().spj_extract_min_confidence)


def _to_body(draft: SpjDraft) -> dict[str, Any]:
    fields = draft.fields if isinstance(draft.fields, dict) else {}
    lines = fields.get("lines")
    total = compute_document_total({"lines": lines}) if isinstance(lines, list) else 0
    return {
        "id": draft.id,
        "knowledge_id": draft.knowledge_id,
        "fields": draft.fields,
        "document_total_computed": total,
        "confirmed": draft.confirmed,
    }


@router.post("/api/knowledge/{knowledge_id}/spj/draft")
async def create_spj_draft(
    knowledge_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    await _get_owned_kb(db, current_user.id, knowledge_id)
    member_files: list[File] = (
        (
            await db.execute(
                select(File)
                .join(KnowledgeFile, KnowledgeFile.file_id == File.id)
                .where(
                    KnowledgeFile.knowledge_id == knowledge_id,
                    File.status == "ready",
                )
                .order_by(KnowledgeFile.created_at, File.created_at)
            )
        )
        .scalars()
        .all()
    )
    now = int(time.time())
    draft = SpjDraft(
        id=str(uuid4()),
        user_id=current_user.id,
        knowledge_id=knowledge_id,
        fields=_build_snapshot(member_files),
        confirmed=False,
        created_at=now,
        updated_at=now,
    )
    db.add(draft)
    await db.commit()
    return _to_body(draft)


@router.get("/api/spj/drafts/{draft_id}")
async def get_spj_draft(
    draft_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    draft = await db.get(SpjDraft, draft_id)
    if draft is None or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _to_body(draft)


@router.post("/api/spj/drafts/{draft_id}/confirm")
async def confirm_spj_draft(
    draft_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    draft = await db.get(SpjDraft, draft_id)
    if draft is None or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    fields = draft.fields if isinstance(draft.fields, dict) else {}
    if fields.get("below_threshold"):
        raise HTTPException(status_code=422, detail="Confidence below threshold")
    draft.confirmed = True  # idempotent: re-confirm just bumps updated_at
    draft.updated_at = int(time.time())
    await db.commit()
    return _to_body(draft)


def _recompute_line_totals(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Recompute line_total from qty * unit_price for each line. Coerce numbers safely.
    Writes back coerced qty/unit_price (clamped >= 0) so stored values match what was used."""
    out: list[dict[str, Any]] = []
    for line in lines:
        if not isinstance(line, dict):
            continue
        try:
            qty = int(line.get("qty", 1) or 1)
        except (TypeError, ValueError):
            qty = 1
        try:
            unit_price = int(line.get("unit_price", 0) or 0)
        except (TypeError, ValueError):
            unit_price = 0
        qty = max(0, qty)
        unit_price = max(0, unit_price)
        new_line = dict(line)
        new_line["qty"] = qty
        new_line["unit_price"] = unit_price
        new_line["line_total"] = qty * unit_price
        out.append(new_line)
    return out


@router.patch("/api/spj/drafts/{draft_id}")
async def update_spj_draft(
    draft_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: dict[str, Any],
) -> dict[str, Any]:
    draft = await db.get(SpjDraft, draft_id)
    if draft is None or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.confirmed:
        raise HTTPException(status_code=409, detail="Draft already confirmed")

    lines = body.get("lines") if isinstance(body.get("lines"), list) else []
    fields = draft.fields if isinstance(draft.fields, dict) else {}
    fields = dict(fields)
    fields["lines"] = _recompute_line_totals(lines)
    draft.fields = fields
    draft.updated_at = int(time.time())
    await db.commit()
    return _to_body(draft)


@router.get("/api/spj/drafts/{draft_id}/export")
async def export_spj_draft(
    draft_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HTMLResponse:
    draft = await db.get(SpjDraft, draft_id)
    if draft is None or draft.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    fields = draft.fields if isinstance(draft.fields, dict) else {}
    if fields.get("below_threshold"):
        raise HTTPException(status_code=422, detail="Confidence below threshold")
    if not draft.confirmed:
        raise HTTPException(status_code=409, detail="Draft not confirmed")
    total = compute_document_total(fields)
    html = render_accountability_stub(fields, total)
    return HTMLResponse(
        content=html,
        headers={"Content-Disposition": f'attachment; filename="spj-{draft_id}.html"'},
    )
