"""POST /recognize — suggest canonical tracks for a GPS trace.

SUGGEST mode ONLY (per the WS3 v1 scope): the endpoint returns ranked
canonical_track_id candidates with confidence; it never writes
canonical_track_id on a session. Auto-accept stays out of scope until
the 0.85 similarity / 5 % length thresholds are validated on real
traces beyond the GT-anchored eval set.

No-match traces are fed into unresolved_canonicals for curator triage,
carrying the best below-threshold similarity as recognition_confidence
(NULL when no candidate even passed the length gate).

Known limitation (documented, not fixed here): when the desktop's LUT
snapshot is AHEAD of the backend's (desktop fetched a newer registry
than this deployment has applied), recognition runs against the older
backend fingerprint set, so drift detection has a blind spot — a track
the desktop already resolves can still land in unresolved_canonicals.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app import models, schemas
from app.auth import DeviceIdentity, current_device
from app.database import get_db
from app.fingerprint import (
    MIN_SIMILARITY,
    fingerprint_from_latlon,
    match_fingerprints,
)

router = APIRouter(tags=["recognize"])


@router.post("/recognize", response_model=schemas.RecognizeOut)
async def recognize_track(
    body: schemas.RecognizeIn,
    ident: DeviceIdentity = Depends(current_device),
    db: AsyncSession = Depends(get_db),
) -> schemas.RecognizeOut:
    target_fp, target_len = fingerprint_from_latlon(body.lat, body.lon)

    rows = (await db.execute(
        select(models.TrackFingerprint, models.Track)
        .join(models.Track, models.Track.canonical_id == models.TrackFingerprint.canonical_track_id)
    )).all()

    suggestions: list[schemas.TrackSuggestion] = []
    best_below_threshold: float | None = None
    for fp_row, track in rows:
        similarity = match_fingerprints(
            target_fp, fp_row.fingerprint, target_len, fp_row.length_m,
        )
        if similarity >= MIN_SIMILARITY:
            avg_len = (target_len + fp_row.length_m) / 2.0
            suggestions.append(schemas.TrackSuggestion(
                canonical_track_id=track.canonical_id,
                canonical_name=track.canonical_name,
                similarity=round(similarity, 4),
                confidence=round(similarity, 4),
                length_diff_pct=round(
                    abs(target_len - fp_row.length_m) / avg_len * 100.0, 2,
                ),
            ))
        elif similarity > 0.0 and (
            best_below_threshold is None or similarity > best_below_threshold
        ):
            best_below_threshold = similarity

    suggestions.sort(key=lambda s: s.similarity, reverse=True)

    if not suggestions:
        await _feed_unresolved(db, body, best_below_threshold)

    return schemas.RecognizeOut(
        mode="suggest",
        length_m=round(target_len, 1),
        suggestions=suggestions,
    )


async def _feed_unresolved(
    db: AsyncSession,
    body: schemas.RecognizeIn,
    confidence: float | None,
) -> None:
    """Upsert the (sim, raw_track, layout) triple into the triage table."""
    stmt = pg_insert(models.UnresolvedCanonical).values(
        sim_id=body.sim,
        # "" not NULL: NULLs never collide in the unresolved_unique
        # constraint, which would break the ON CONFLICT occurrence upsert.
        raw_car="",
        raw_track=body.raw_track,
        raw_track_layout=body.raw_layout,
        occurrence_count=1,
        recognition_confidence=confidence,
    ).on_conflict_do_update(
        constraint="unresolved_unique",
        set_={
            "occurrence_count": models.UnresolvedCanonical.occurrence_count + 1,
            "recognition_confidence": confidence,
            "last_seen_at": func.now(),
        },
    )
    await db.execute(stmt)
    await db.commit()
