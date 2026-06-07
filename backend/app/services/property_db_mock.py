"""Property, auth, and knowledge store — shared mock implementation."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Dict, List, Optional

from app.models.schemas import GuestProfile, Property, KnowledgeMode, PropertyProfile


class PropertyStoreMixin:
    """In-memory property/auth/knowledge tables for MockDatabase."""

    def _init_property_stores(self) -> None:
        settings_property = "grand-horizon"
        self.properties: Dict[str, Property] = {
            settings_property: Property(
                id=settings_property,
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
        self.auth_tokens: Dict[str, dict] = {}
        self.guest_session_versions: Dict[str, int] = {}
        self.revoked_session_versions: Dict[str, set] = {}
        self.property_facts: Dict[str, dict] = {}
        self.knowledge_snapshots: Dict[str, dict] = {}
        self.crawl_jobs: Dict[str, dict] = {}
        self.crawl_pages: Dict[str, dict] = {}

    def list_guests(self, property_id: Optional[str] = None) -> List[GuestProfile]:
        guests = list(self.guests.values())
        if property_id:
            guests = [g for g in guests if getattr(g, "property_id", None) == property_id]
        return guests

    def get_guest_by_booking(
        self, booking_id: str, property_id: Optional[str] = None
    ) -> Optional[GuestProfile]:
        for guest in self.guests.values():
            if guest.booking_id != booking_id:
                continue
            if property_id and getattr(guest, "property_id", None) not in (None, property_id):
                continue
            return guest
        return None

    def upsert_guest(self, guest: GuestProfile) -> GuestProfile:
        self.guests[guest.id] = guest
        return guest

    def get_property(self, property_id: str) -> Optional[Property]:
        return self.properties.get(property_id)

    def upsert_property(self, prop: Property) -> Property:
        self.properties[prop.id] = prop
        return prop

    def set_property_published_snapshot(self, property_id: str, snapshot_id: str) -> None:
        prop = self.properties.get(property_id)
        if prop:
            prop.published_snapshot_id = snapshot_id

    def update_property_knowledge_mode(self, property_id: str, mode: str) -> None:
        prop = self.properties.get(property_id)
        if prop:
            prop.knowledge_mode = KnowledgeMode(mode)

    def create_auth_token(
        self,
        token_hash: str,
        property_id: str,
        booking_id: str,
        expires_at: datetime,
    ) -> None:
        self.auth_tokens[token_hash] = {
            "property_id": property_id,
            "booking_id": booking_id,
            "expires_at": expires_at,
            "used_at": None,
        }

    def validate_auth_token(self, token_hash: str) -> Optional[dict]:
        row = self.auth_tokens.get(token_hash)
        if not row:
            return None
        if row["expires_at"] < datetime.utcnow():
            return None
        return {"property_id": row["property_id"], "booking_id": row["booking_id"]}

    def revoke_auth_tokens_for_booking(self, property_id: str, booking_id: str) -> int:
        removed = 0
        for token_hash, row in list(self.auth_tokens.items()):
            if row["property_id"] == property_id and row["booking_id"] == booking_id:
                del self.auth_tokens[token_hash]
                removed += 1
        return removed

    def register_guest_session(self, guest_id: str, property_id: str) -> int:
        key = f"{property_id}:{guest_id}"
        version = self.guest_session_versions.get(key, 0) + 1
        self.guest_session_versions[key] = version
        self.revoked_session_versions.setdefault(key, set())
        return version

    def is_guest_session_revoked(
        self, guest_id: str, property_id: str, session_version: int
    ) -> bool:
        key = f"{property_id}:{guest_id}"
        return session_version in self.revoked_session_versions.get(key, set())

    def revoke_guest_sessions(self, guest_id: str, property_id: str) -> int:
        key = f"{property_id}:{guest_id}"
        version = self.guest_session_versions.get(key, 0)
        if version <= 0:
            return 0
        revoked = self.revoked_session_versions.setdefault(key, set())
        for v in range(1, version + 1):
            revoked.add(v)
        return version

    def list_property_facts(self, property_id: str) -> List[dict]:
        prefix = f"{property_id}:"
        return [v for k, v in self.property_facts.items() if k.startswith(prefix)]

    def upsert_property_fact(
        self,
        property_id: str,
        slot_key: str,
        value: object,
        status: str = "filled",
        *,
        confidence: Optional[float] = None,
        source_url: Optional[str] = None,
        source_snippet: Optional[str] = None,
        extraction_method: Optional[str] = None,
        updated_by: Optional[str] = None,
    ) -> dict:
        key = f"{property_id}:{slot_key}"
        row = {
            "property_id": property_id,
            "slot_key": slot_key,
            "value": value,
            "status": status,
            "confidence": confidence,
            "source_url": source_url,
            "source_snippet": source_snippet,
            "extraction_method": extraction_method,
            "updated_at": datetime.utcnow().isoformat(),
            "updated_by": updated_by,
        }
        self.property_facts[key] = row
        return row

    def create_knowledge_snapshot(
        self,
        snapshot_id: str,
        property_id: str,
        schema_version: str,
        markdown: str,
        tree_json: list,
        faq_json: list,
        facts_json: dict,
        published_by: str,
    ) -> dict:
        row = {
            "id": snapshot_id,
            "property_id": property_id,
            "schema_version": schema_version,
            "markdown": markdown,
            "tree_json": tree_json,
            "faq_json": faq_json,
            "facts_json": facts_json,
            "published_at": datetime.utcnow().isoformat(),
            "published_by": published_by,
        }
        self.knowledge_snapshots[snapshot_id] = row
        return row

    def get_knowledge_snapshot(self, snapshot_id: str) -> Optional[dict]:
        return self.knowledge_snapshots.get(snapshot_id)

    def create_crawl_job(
        self,
        property_id: str,
        seed_url: str,
        *,
        seed_urls: list[str] | None = None,
    ) -> dict:
        job_id = str(uuid.uuid4())
        urls = seed_urls or [seed_url]
        row = {
            "id": job_id,
            "property_id": property_id,
            "seed_url": seed_url,
            "seed_urls": urls,
            "status": "pending",
            "pages_discovered": 0,
            "pages_extracted": 0,
            "created_at": datetime.utcnow().isoformat(),
        }
        self.crawl_jobs[job_id] = row
        return row

    def get_crawl_job(self, job_id: str) -> Optional[dict]:
        return self.crawl_jobs.get(job_id)

    def update_crawl_job(self, job_id: str, **fields) -> None:
        if job_id in self.crawl_jobs:
            self.crawl_jobs[job_id].update(fields)

    def create_crawl_page(self, job_id: str, url: str) -> str:
        page_id = str(uuid.uuid4())
        self.crawl_pages[page_id] = {
            "id": page_id,
            "job_id": job_id,
            "url": url,
            "status": "discovered",
        }
        return page_id

    def update_crawl_page(self, page_id: str, **fields) -> None:
        if page_id in self.crawl_pages:
            self.crawl_pages[page_id].update(fields)
