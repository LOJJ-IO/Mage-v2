"""Helpers for property rows used by crawl and onboarding."""
from __future__ import annotations

from typing import Optional

from app.knowledge.pipeline.crawl_scope import (
    crawl_scope_from_seed,
    display_name_from_url,
    property_id_from_url,
)
from app.models.schemas import KnowledgeMode, Property, PropertyProfile

_DEMO_PROPERTIES: dict[str, Property] = {
    "grand-horizon": Property(
        id="grand-horizon",
        name="The Grand Horizon Hotel",
        slug="grand-horizon",
        timezone="America/Edmonton",
        profile=PropertyProfile.FULL_SERVICE,
        pms_type="mock",
        knowledge_mode=KnowledgeMode.DEMO_FILE,
    ),
    "comfort-inn-pilot": Property(
        id="comfort-inn-pilot",
        name="Comfort Inn Pilot",
        slug="comfort-inn-pilot",
        timezone="America/Edmonton",
        profile=PropertyProfile.LIMITED_SERVICE,
        pms_type="mock",
        knowledge_mode=KnowledgeMode.DEMO_FILE,
    ),
}


def ensure_demo_property(db, property_id: str) -> Optional[Property]:
    """Return property row, seeding built-in demo hotels when missing (e.g. fresh Supabase)."""
    existing = db.get_property(property_id)
    if existing:
        return existing
    template = _DEMO_PROPERTIES.get(property_id)
    if not template:
        return None
    return db.upsert_property(template)


def ensure_property_for_crawl(db, property_id: str, seed_url: str) -> Property:
    """Create property row if missing (pilot / ad-hoc hotel crawl)."""
    existing = db.get_property(property_id)
    if existing:
        return existing
    scope = crawl_scope_from_seed(seed_url)
    prop = Property(
        id=property_id,
        name=scope.display_name or display_name_from_url(seed_url, property_id),
        slug=property_id,
        profile=PropertyProfile.LIMITED_SERVICE,
        pms_type="mock",
        knowledge_mode=KnowledgeMode.DEMO_FILE,
    )
    return db.upsert_property(prop)
