"""Supabase implementations for property/auth/knowledge tables."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import List, Optional

from app.models.schemas import GuestProfile, Property, KnowledgeMode, PropertyProfile

logger = logging.getLogger(__name__)


class PropertyStoreSupabase:
    """Mixin-style helpers for SupabaseDatabase."""

    def list_guests(self, property_id: Optional[str] = None) -> List[GuestProfile]:
        try:
            query = self.client.table("guests").select("*")
            if property_id:
                query = query.eq("property_id", property_id)
            response = query.execute()
            return [GuestProfile(**row) for row in (response.data or [])]
        except Exception as e:
            logger.error("Error listing guests: %s", e)
            return []

    def get_guest_by_booking(
        self, booking_id: str, property_id: Optional[str] = None
    ) -> Optional[GuestProfile]:
        try:
            query = self.client.table("guests").select("*").eq("booking_id", booking_id)
            if property_id:
                query = query.eq("property_id", property_id)
            response = query.execute()
            if response.data:
                return GuestProfile(**response.data[0])
            return None
        except Exception as e:
            logger.error("Error getting guest by booking: %s", e)
            return None

    def upsert_guest(self, guest: GuestProfile) -> GuestProfile:
        try:
            data = guest.model_dump(mode="json")
            for k in ("check_in", "check_out"):
                if isinstance(data.get(k), datetime):
                    data[k] = data[k].isoformat()
            existing = self.get_guest(guest.id)
            if existing:
                response = self.client.table("guests").update(data).eq("id", guest.id).execute()
            else:
                response = self.client.table("guests").insert(data).execute()
            if response.data:
                return GuestProfile(**response.data[0])
            return guest
        except Exception as e:
            logger.error("Error upserting guest: %s", e)
            raise

    def get_property(self, property_id: str) -> Optional[Property]:
        try:
            response = self.client.table("properties").select("*").eq("id", property_id).execute()
            if response.data:
                row = response.data[0]
                if isinstance(row.get("knowledge_mode"), str):
                    row["knowledge_mode"] = KnowledgeMode(row["knowledge_mode"])
                if isinstance(row.get("profile"), str):
                    row["profile"] = PropertyProfile(row["profile"])
                return Property(**row)
            return None
        except Exception as e:
            logger.error("Error getting property: %s", e)
            return None

    def upsert_property(self, prop: Property) -> Property:
        row = {
            "id": prop.id,
            "name": prop.name,
            "slug": prop.slug,
            "timezone": prop.timezone,
            "profile": prop.profile.value,
            "pms_type": prop.pms_type,
            "knowledge_mode": prop.knowledge_mode.value,
            "published_snapshot_id": prop.published_snapshot_id,
        }
        try:
            existing = self.get_property(prop.id)
            if existing:
                response = (
                    self.client.table("properties")
                    .update({k: v for k, v in row.items() if k != "id"})
                    .eq("id", prop.id)
                    .execute()
                )
            else:
                response = self.client.table("properties").insert(row).execute()
            if response.data:
                data = response.data[0]
                if isinstance(data.get("knowledge_mode"), str):
                    data["knowledge_mode"] = KnowledgeMode(data["knowledge_mode"])
                if isinstance(data.get("profile"), str):
                    data["profile"] = PropertyProfile(data["profile"])
                return Property(**data)
            return prop
        except Exception as e:
            logger.error("Error upserting property: %s", e)
            raise

    def set_property_published_snapshot(self, property_id: str, snapshot_id: str) -> None:
        try:
            self.client.table("properties").update(
                {"published_snapshot_id": snapshot_id}
            ).eq("id", property_id).execute()
        except Exception as e:
            logger.error("Error setting published snapshot: %s", e)

    def update_property_knowledge_mode(self, property_id: str, mode: str) -> None:
        try:
            self.client.table("properties").update(
                {"knowledge_mode": mode}
            ).eq("id", property_id).execute()
        except Exception as e:
            logger.error("Error updating knowledge mode: %s", e)

    def create_auth_token(
        self,
        token_hash: str,
        property_id: str,
        booking_id: str,
        expires_at: datetime,
    ) -> None:
        try:
            self.client.table("auth_tokens").insert(
                {
                    "token_hash": token_hash,
                    "property_id": property_id,
                    "booking_id": booking_id,
                    "expires_at": expires_at.isoformat(),
                }
            ).execute()
        except Exception as e:
            logger.error("Error creating auth token: %s", e)
            raise

    def consume_auth_token(self, token_hash: str) -> Optional[dict]:
        try:
            response = (
                self.client.table("auth_tokens")
                .select("*")
                .eq("token_hash", token_hash)
                .is_("used_at", "null")
                .execute()
            )
            if not response.data:
                return None
            row = response.data[0]
            expires = datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00")).replace(tzinfo=None)
            if expires < datetime.utcnow():
                return None
            self.client.table("auth_tokens").update(
                {"used_at": datetime.utcnow().isoformat()}
            ).eq("token_hash", token_hash).execute()
            return {"property_id": row["property_id"], "booking_id": row["booking_id"]}
        except Exception as e:
            logger.error("Error consuming auth token: %s", e)
            return None

    def register_guest_session(self, guest_id: str, property_id: str) -> int:
        try:
            response = (
                self.client.table("guest_sessions")
                .select("session_version")
                .eq("guest_id", guest_id)
                .eq("property_id", property_id)
                .order("session_version", desc=True)
                .limit(1)
                .execute()
            )
            version = (response.data[0]["session_version"] + 1) if response.data else 1
            self.client.table("guest_sessions").insert(
                {
                    "guest_id": guest_id,
                    "property_id": property_id,
                    "session_version": version,
                    "expires_at": (datetime.utcnow()).isoformat(),
                }
            ).execute()
            return version
        except Exception as e:
            logger.error("Error registering guest session: %s", e)
            return 1

    def is_guest_session_revoked(
        self, guest_id: str, property_id: str, session_version: int
    ) -> bool:
        try:
            response = (
                self.client.table("guest_sessions")
                .select("revoked_at")
                .eq("guest_id", guest_id)
                .eq("property_id", property_id)
                .eq("session_version", session_version)
                .execute()
            )
            if not response.data:
                return False
            return response.data[0].get("revoked_at") is not None
        except Exception as e:
            logger.error("Error checking session revoke: %s", e)
            return False

    def revoke_guest_sessions(self, guest_id: str, property_id: str) -> int:
        try:
            response = (
                self.client.table("guest_sessions")
                .update({"revoked_at": datetime.utcnow().isoformat()})
                .eq("guest_id", guest_id)
                .eq("property_id", property_id)
                .is_("revoked_at", "null")
                .execute()
            )
            return len(response.data or [])
        except Exception as e:
            logger.error("Error revoking sessions: %s", e)
            return 0

    def list_property_facts(self, property_id: str) -> List[dict]:
        try:
            response = (
                self.client.table("property_facts")
                .select("*")
                .eq("property_id", property_id)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error("Error listing property facts: %s", e)
            return []

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
        row = {
            "property_id": property_id,
            "slot_key": slot_key,
            "value": value,
            "status": status,
            "confidence": confidence,
            "source_url": source_url,
            "source_snippet": source_snippet,
            "updated_at": datetime.utcnow().isoformat(),
            "updated_by": updated_by,
        }
        if extraction_method is not None:
            row["extraction_method"] = extraction_method
        try:
            existing = (
                self.client.table("property_facts")
                .select("id")
                .eq("property_id", property_id)
                .eq("slot_key", slot_key)
                .execute()
            )
            if existing.data:
                response = (
                    self.client.table("property_facts")
                    .update(row)
                    .eq("property_id", property_id)
                    .eq("slot_key", slot_key)
                    .execute()
                )
            else:
                response = self.client.table("property_facts").insert(row).execute()
            return (response.data or [row])[0]
        except Exception as e:
            logger.error("Error upserting property fact: %s", e)
            raise

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
        try:
            response = self.client.table("knowledge_snapshots").insert(row).execute()
            return (response.data or [row])[0]
        except Exception as e:
            logger.error("Error creating snapshot: %s", e)
            raise

    def get_knowledge_snapshot(self, snapshot_id: str) -> Optional[dict]:
        try:
            response = (
                self.client.table("knowledge_snapshots")
                .select("*")
                .eq("id", snapshot_id)
                .execute()
            )
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error("Error getting snapshot: %s", e)
            return None

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
        }
        try:
            response = self.client.table("crawl_jobs").insert(row).execute()
            return (response.data or [row])[0]
        except Exception as e:
            logger.error("Error creating crawl job: %s", e)
            raise

    def get_crawl_job(self, job_id: str) -> Optional[dict]:
        try:
            response = self.client.table("crawl_jobs").select("*").eq("id", job_id).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error("Error getting crawl job: %s", e)
            return None

    def update_crawl_job(self, job_id: str, **fields) -> None:
        try:
            serializable = {}
            for k, v in fields.items():
                serializable[k] = v.isoformat() if isinstance(v, datetime) else v
            self.client.table("crawl_jobs").update(serializable).eq("id", job_id).execute()
        except Exception as e:
            logger.error("Error updating crawl job: %s", e)

    def create_crawl_page(self, job_id: str, url: str) -> str:
        page_id = str(uuid.uuid4())
        try:
            self.client.table("crawl_pages").insert(
                {"id": page_id, "job_id": job_id, "url": url, "status": "discovered"}
            ).execute()
        except Exception as e:
            logger.error("Error creating crawl page: %s", e)
        return page_id

    def update_crawl_page(self, page_id: str, **fields) -> None:
        try:
            self.client.table("crawl_pages").update(fields).eq("id", page_id).execute()
        except Exception as e:
            logger.error("Error updating crawl page: %s", e)
