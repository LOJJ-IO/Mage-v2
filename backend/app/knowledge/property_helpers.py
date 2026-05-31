"""Helpers for property rows used by crawl and onboarding."""
from __future__ import annotations

import re
from urllib.parse import urlparse

from app.models.schemas import KnowledgeMode, Property, PropertyProfile


def property_id_from_url(seed_url: str) -> str:
    """Derive a stable property id from a hotel website URL."""
    raw = (seed_url or "").strip()
    if not raw:
        return "pilot-hotel"
    if "://" not in raw:
        raw = f"https://{raw}"
    host = urlparse(raw).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    slug = re.sub(r"[^a-z0-9]+", "-", host).strip("-")
    return (slug[:48] or "pilot-hotel")


def display_name_from_url(seed_url: str, property_id: str) -> str:
    raw = (seed_url or "").strip()
    if "://" not in raw:
        raw = f"https://{raw}"
    host = urlparse(raw).netloc
    if host.startswith("www."):
        host = host[4:]
    if host:
        base = host.split(".")[0].replace("-", " ").replace("_", " ")
        return base.title() if base else property_id.replace("-", " ").title()
    return property_id.replace("-", " ").title()


def ensure_property_for_crawl(db, property_id: str, seed_url: str) -> Property:
    """Create property row if missing (pilot / ad-hoc hotel crawl)."""
    existing = db.get_property(property_id)
    if existing:
        return existing
    prop = Property(
        id=property_id,
        name=display_name_from_url(seed_url, property_id),
        slug=property_id,
        profile=PropertyProfile.LIMITED_SERVICE,
        pms_type="mock",
        knowledge_mode=KnowledgeMode.DEMO_FILE,
    )
    return db.upsert_property(prop)
