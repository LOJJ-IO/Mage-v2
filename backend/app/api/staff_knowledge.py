"""Staff knowledge onboarding — facts, completeness, publish, crawl."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from urllib.parse import unquote

from app.api.staff import verify_staff_key
from app.core.config import get_settings
from app.knowledge.pipeline.booking_seed import augment_seeds_with_booking, suggest_booking_for_seed
from app.knowledge.pipeline.crawl_scope import collect_seed_urls, property_id_from_url
from app.knowledge.property_helpers import ensure_property_for_crawl
from app.knowledge.pipeline.runner import run_crawl_job
from app.knowledge.schema_loader import get_slots, slot_by_key
from app.knowledge.service import compute_completeness, publish_snapshot, seed_grand_horizon_facts
from app.models.schemas import CrawlJobRequest, PropertyFactPatch
from app.services.database import get_database

router = APIRouter(prefix="/staff/knowledge", tags=["staff-knowledge"])
settings = get_settings()
_AUTO_PROPERTY_IDS = {"", "grand-horizon", "pilot-hotel"}


@router.get("/schema")
async def get_schema(_: None = Depends(verify_staff_key)):
    return {"version": "v1", "slots": get_slots("v1")}


@router.get("/facts/{property_id}")
async def list_facts(property_id: str, _: None = Depends(verify_staff_key)):
    db = get_database()
    facts = db.list_property_facts(property_id)
    facts_map = {f["slot_key"]: f for f in facts}
    return {
        "property_id": property_id,
        "facts": facts_map,
        "completeness": compute_completeness(facts_map),
    }


@router.patch("/facts/{property_id}/{slot_key:path}")
async def patch_fact(
    property_id: str,
    slot_key: str,
    body: PropertyFactPatch,
    _: None = Depends(verify_staff_key),
):
    slot_key = unquote(slot_key)
    slots = slot_by_key()
    if slot_key not in slots:
        raise HTTPException(status_code=404, detail="Unknown slot key")

    db = get_database()
    existing = next(
        (f for f in db.list_property_facts(property_id) if f["slot_key"] == slot_key),
        None,
    )
    status = body.status or (existing or {}).get("status", "unknown")
    value = body.value if body.value is not None else (existing or {}).get("value")
    row = db.upsert_property_fact(
        property_id=property_id,
        slot_key=slot_key,
        value=value,
        status=status,
        updated_by="staff",
    )
    return row


@router.post("/publish/{property_id}")
async def publish(property_id: str, _: None = Depends(verify_staff_key)):
    try:
        snapshot = publish_snapshot(property_id, published_by="staff")
        return snapshot
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/seed/{property_id}")
async def seed_demo(property_id: str, _: None = Depends(verify_staff_key)):
    """Seed Grand Horizon-equivalent facts (dev/demo)."""
    seed_grand_horizon_facts(property_id)
    facts = get_database().list_property_facts(property_id)
    facts_map = {f["slot_key"]: f for f in facts}
    return {"seeded": len(facts_map), "completeness": compute_completeness(facts_map)}


@router.get("/tree/{property_id}")
async def staff_help_tree(property_id: str, _: None = Depends(verify_staff_key)):
    from app.knowledge.service import get_runtime_tree

    tree = get_runtime_tree(property_id)
    if tree is None:
        db = get_database()
        from app.knowledge.renderers.tree import render_help_desk_tree

        facts = {f["slot_key"]: f for f in db.list_property_facts(property_id)}
        tree = render_help_desk_tree(facts)
    return {"property_id": property_id, "tree": tree}


@router.get("/booking-suggest")
async def booking_suggest(seed_url: str, _: None = Depends(verify_staff_key)):
    """Suggest Booking.com search + likely hotel listing URL for a hotel website seed."""
    if not (seed_url or "").strip():
        raise HTTPException(status_code=400, detail="seed_url is required")
    return await suggest_booking_for_seed(seed_url.strip(), probe=False, fetch_page_links=False)


@router.post("/crawl")
async def start_crawl(
    body: CrawlJobRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(verify_staff_key),
):
    db = get_database()
    seeds = collect_seed_urls(body.seed_url, body.seed_urls)
    if not seeds:
        raise HTTPException(status_code=400, detail="At least one seed URL is required")

    seeds, booking_meta = await augment_seeds_with_booking(seeds)

    primary_seed = seeds[0]
    suggested_property_id = property_id_from_url(primary_seed)
    requested_property_id = (body.property_id or "").strip()
    property_id = (
        suggested_property_id
        if requested_property_id.lower() in _AUTO_PROPERTY_IDS
        else requested_property_id
    ) or suggested_property_id
    ensure_property_for_crawl(db, property_id, primary_seed)

    job = db.create_crawl_job(property_id, primary_seed, seed_urls=seeds)
    background_tasks.add_task(run_crawl_job, job["id"])
    return {**job, "property_id": property_id, "booking_augment": booking_meta}


@router.get("/crawl/{job_id}")
async def crawl_status(job_id: str, _: None = Depends(verify_staff_key)):
    job = get_database().get_crawl_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
