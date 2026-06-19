"""Property, auth, and knowledge store — shared mock implementation."""
from __future__ import annotations

import hashlib
import random
import string
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from app.models.schemas import (
    EmailVerification,
    GuestProfile,
    KnowledgeMode,
    Property,
    PropertyProfile,
    StaffMember,
    StaffMemberStatus,
    StaffRole,
)


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

        # --- Onboarding stores ---
        # staff_members stores StaffMember objects (keyed by id)
        self.staff_members: Dict[str, StaffMember] = {}
        self.email_verifications: Dict[str, dict] = {}  # keyed by token_hash
        self.task_assist_threads: Dict[str, dict] = {}  # keyed by "{action_id}:{staff_member_id}"

        # Dev seed: approved manager for "grand-horizon" — raw key is "dev-manager-key-grand-horizon"
        _mgr_id = "staff-dev-manager-001"
        _key_hash = hashlib.sha256(b"dev-manager-key-grand-horizon").hexdigest()
        self.staff_members[_mgr_id] = StaffMember(
            id=_mgr_id,
            property_id="grand-horizon",
            staff_code="STF-MGR0",
            display_name="Dev Manager",
            requested_role=StaffRole.MANAGER,
            approved_role=StaffRole.MANAGER,
            status=StaffMemberStatus.APPROVED,
            access_key_hash=_key_hash,
            created_at=datetime.utcnow(),
            approved_at=datetime.utcnow(),
            approved_by="system",
        )

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

    def get_guest_by_email(
        self, email: str, property_id: Optional[str] = None
    ) -> Optional[GuestProfile]:
        email_lower = email.strip().lower()
        if not email_lower:
            return None
        for guest in self.guests.values():
            guest_email = (getattr(guest, "email", None) or "").strip().lower()
            if guest_email != email_lower:
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
        if row.get("used_at") is not None:
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

    # --- Onboarding: staff members ---

    def _next_staff_code(self, property_id: str) -> str:
        chars = string.ascii_uppercase + string.digits
        for _ in range(100):
            code = "STF-" + "".join(random.choices(chars, k=4))
            if not any(
                m.property_id == property_id and m.staff_code == code
                for m in self.staff_members.values()
            ):
                return code
        return f"STF-{str(uuid.uuid4())[:4].upper()}"

    def create_staff_request(
        self, property_id: str, display_name: str, requested_role: str,
        email: Optional[str] = None,
    ) -> StaffMember:
        member = StaffMember(
            id=str(uuid.uuid4()),
            property_id=property_id,
            staff_code=self._next_staff_code(property_id),
            display_name=display_name,
            email=email,
            requested_role=StaffRole(requested_role),
            status=StaffMemberStatus.PENDING,
            created_at=datetime.utcnow(),
        )
        self.staff_members[member.id] = member
        return member

    def get_staff_member_by_id(self, id: str) -> Optional[StaffMember]:
        return self.staff_members.get(id)

    def get_staff_member_by_code(
        self, property_id: str, staff_code: str
    ) -> Optional[StaffMember]:
        for m in self.staff_members.values():
            if m.property_id == property_id and m.staff_code == staff_code:
                return m
        return None

    def get_staff_member_by_access_key_hash(self, hash: str) -> Optional[StaffMember]:
        for m in self.staff_members.values():
            if m.access_key_hash == hash:
                return m
        return None

    def list_pending_staff(self, property_id: str) -> List[StaffMember]:
        return [
            m for m in self.staff_members.values()
            if m.property_id == property_id and m.status == StaffMemberStatus.PENDING
        ]

    def list_staff_members(
        self, property_id: str, status: Optional[str] = None
    ) -> List[StaffMember]:
        return [
            m for m in self.staff_members.values()
            if m.property_id == property_id
            and (status is None or m.status.value == status)
        ]

    def approve_staff_member(
        self,
        id: str,
        approved_role: str,
        access_key_hash: str,
        approved_by: str,
    ) -> Optional[StaffMember]:
        member = self.staff_members.get(id)
        if member is None:
            return None
        updated = member.model_copy(update={
            "approved_role": StaffRole(approved_role),
            "access_key_hash": access_key_hash,
            "status": StaffMemberStatus.APPROVED,
            "approved_at": datetime.utcnow(),
            "approved_by": approved_by,
        })
        self.staff_members[id] = updated
        return updated

    def reject_staff_member(
        self, id: str, approved_by: Optional[str] = None
    ) -> Optional[StaffMember]:
        member = self.staff_members.get(id)
        if member is None:
            return None
        patch: dict = {"status": StaffMemberStatus.REJECTED}
        if approved_by:
            patch["approved_by"] = approved_by
        updated = member.model_copy(update=patch)
        self.staff_members[id] = updated
        return updated

    # --- Onboarding: email verifications ---

    def create_email_verification(
        self,
        email: str,
        property_id: str,
        booking_id: str,
        token_hash: str,
        expires_at: datetime,
        guest_data: dict = {},
    ) -> None:
        row = {
            "id": str(uuid.uuid4()),
            "email": email,
            "property_id": property_id,
            "booking_id": booking_id,
            "guest_data": guest_data,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "verified_at": None,
            "created_at": datetime.utcnow(),
        }
        self.email_verifications[token_hash] = row

    def consume_email_verification(self, token_hash: str) -> Optional[dict]:
        row = self.email_verifications.get(token_hash)
        if not row:
            return None
        expires = row["expires_at"]
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires < datetime.utcnow():
            return None
        if row["verified_at"] is not None:
            return None
        row["verified_at"] = datetime.utcnow()
        return row

    # --- Onboarding: task-assist threads ---

    def get_task_assist_thread(
        self, action_id: str, staff_member_id: Optional[str]
    ) -> Optional[dict]:
        key = f"{action_id}:{staff_member_id}"
        return self.task_assist_threads.get(key)

    def upsert_task_assist_thread(
        self,
        action_id: str,
        staff_member_id: Optional[str],
        property_id: str,
        messages_json: list,
    ) -> dict:
        key = f"{action_id}:{staff_member_id}"
        existing = self.task_assist_threads.get(key)
        now = datetime.utcnow().isoformat()
        if existing:
            existing["messages_json"] = messages_json
            existing["updated_at"] = now
            return existing
        row = {
            "id": str(uuid.uuid4()),
            "action_id": action_id,
            "staff_member_id": staff_member_id,
            "property_id": property_id,
            "messages_json": messages_json,
            "created_at": now,
            "updated_at": now,
        }
        self.task_assist_threads[key] = row
        return row

    # --- Guest extension ---

    def get_guest_by_name_and_booking(
        self, name: str, booking_id: str, property_id: Optional[str] = None
    ) -> Optional[GuestProfile]:
        name_lower = name.strip().lower()
        for guest in self.guests.values():
            if guest.booking_id != booking_id:
                continue
            if property_id and getattr(guest, "property_id", None) not in (None, property_id):
                continue
            if guest.name.strip().lower() == name_lower:
                return guest
        return None

    # --- Auth token extension ---

    def mark_auth_token_used(self, token_hash: str) -> None:
        row = self.auth_tokens.get(token_hash)
        if row:
            row["used_at"] = datetime.utcnow()
