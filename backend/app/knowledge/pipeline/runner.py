"""Orchestrate crawl jobs: discover → extract → normalize → upsert facts."""
from __future__ import annotations

import json
import logging
from datetime import datetime

from app.knowledge.pipeline.crawl_http import crawl_client
from app.knowledge.pipeline.discover import discover_urls_from_seeds
from app.knowledge.pipeline.extract import extract_facts_from_page
from app.knowledge.pipeline.normalize import gap_report, normalize_facts
from app.knowledge.pipeline.places_enrichment import enrich_from_places
from app.knowledge.schema_loader import tier_keys
from app.services.database import get_database
from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def run_crawl_job(job_id: str) -> dict:
    db = get_database()
    job = db.get_crawl_job(job_id)
    if not job:
        raise ValueError(f"Unknown crawl job: {job_id}")

    property_id = job["property_id"]
    seed_urls = job.get("seed_urls") or [job["seed_url"]]
    if isinstance(seed_urls, str):
        try:
            seed_urls = json.loads(seed_urls)
        except json.JSONDecodeError:
            seed_urls = [job["seed_url"]]
    db.update_crawl_job(job_id, status="running", started_at=datetime.utcnow())

    try:
        batches = []

        # Step 0: Pre-enrichment from Google Places API
        # Non-fatal: even if Places fails, crawling still proceeds.
        settings = get_settings()
        places_api_key = getattr(settings, "google_places_api_key", "") or ""
        if places_api_key:
            try:
                places_facts = await enrich_from_places(
                    seed_url=seed_urls[0],
                    api_key=places_api_key,
                )
                if places_facts:
                    batches.append(places_facts)
                    logger.info("Places pre-enrichment: %d facts for job %s", len(places_facts), job_id)
                    # Best-effort: record enrichment status for the UI.
                    # (If `notes` column doesn't exist yet, the DB layer will just log the error.)
                    try:
                        db.update_crawl_job(
                            job_id,
                            notes=f"places_enriched:{len(places_facts)}_slots",
                        )
                    except Exception:
                        pass
            except Exception as e:
                logger.warning("Places enrichment failed (non-fatal): %s", e)

        # Step 1: Discover URLs for crawling
        urls = await discover_urls_from_seeds(seed_urls)
        db.update_crawl_job(job_id, pages_discovered=len(urls))

        pages_blocked = 0
        pages_with_facts = 0
        async with crawl_client() as client:
            for url in urls:
                page_id = db.create_crawl_page(job_id, url)
                try:
                    resp = await client.get(url)
                    if resp.status_code == 403:
                        pages_blocked += 1
                        logger.warning("Blocked fetching page %s (HTTP 403)", url)
                    html = resp.text if resp.status_code == 200 else ""
                    db.update_crawl_page(page_id, status="fetched", raw_html=html[:50000])
                    facts = extract_facts_from_page(url, html)
                    db.update_crawl_page(page_id, status="extracted", extracted_facts=facts)
                    if facts:
                        pages_with_facts += 1
                        batches.append(facts)
                except Exception as e:
                    logger.warning("Page fetch failed %s: %s", url, e)
                    db.update_crawl_page(page_id, status="error")

        if pages_blocked:
            logger.warning(
                "Crawl blocked on %d/%d pages (HTTP 403 — site may rate-limit rapid requests)",
                pages_blocked,
                len(urls),
            )

        merged = normalize_facts(batches)
        for key, fact in merged.items():
            db.upsert_property_fact(
                property_id=property_id,
                slot_key=key,
                value=fact.get("value"),
                status=fact.get("status", "filled"),
                confidence=fact.get("confidence"),
                source_url=fact.get("source_url"),
                source_snippet=fact.get("source_snippet"),
                updated_by="crawl",
            )

        report = gap_report(
            merged,
            tier_keys("A"),
            tier_keys("B"),
        )
        db.update_crawl_job(
            job_id,
            status="completed",
            pages_extracted=pages_with_facts,
            facts_merged=len(merged),
            gap_report=report,
            completed_at=datetime.utcnow(),
        )
        return {"job_id": job_id, "urls": len(urls), "facts_merged": len(merged), "gap_report": report}
    except Exception as e:
        logger.exception("Crawl job failed: %s", job_id)
        db.update_crawl_job(
            job_id,
            status="failed",
            error_message=str(e)[:500],
            completed_at=datetime.utcnow(),
        )
        raise
