"""Staff knowledge onboarding — facts, completeness, publish, crawl."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from urllib.parse import unquote

from app.api.staff import verify_staff_key
from app.core.config import get_settings
from app.knowledge.property_helpers import ensure_property_for_crawl, property_id_from_url
from app.knowledge.pipeline.runner import run_crawl_job
from app.knowledge.schema_loader import get_slots, slot_by_key
from app.knowledge.service import compute_completeness, publish_snapshot, seed_grand_horizon_facts
from app.models.schemas import CrawlJobRequest, PropertyFactPatch
from app.services.database import get_database

router = APIRouter(prefix="/staff/knowledge", tags=["staff-knowledge"])
settings = get_settings()


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


@router.post("/crawl")
async def start_crawl(
    body: CrawlJobRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(verify_staff_key),
):
    db = get_database()
    seed = (body.seed_url or "").strip()
    if not seed:
        raise HTTPException(status_code=400, detail="seed_url is required")

    property_id = (body.property_id or "").strip() or property_id_from_url(seed)
    ensure_property_for_crawl(db, property_id, seed)

    job = db.create_crawl_job(property_id, seed if "://" in seed else f"https://{seed}")
    background_tasks.add_task(run_crawl_job, job["id"])
    return {**job, "property_id": property_id}


@router.get("/crawl/{job_id}")
async def crawl_status(job_id: str, _: None = Depends(verify_staff_key)):
    job = get_database().get_crawl_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
