"""Supabase implementations for property/auth/knowledge tables."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import List, Optional

import random
import string

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
        }
        if prop.published_snapshot_id is not None:
            row["published_snapshot_id"] = prop.published_snapshot_id
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

    def revoke_auth_tokens_for_booking(self, property_id: str, booking_id: str) -> int:
        try:
            response = (
                self.client.table("auth_tokens")
                .delete()
                .eq("property_id", property_id)
                .eq("booking_id", booking_id)
                .execute()
            )
            return len(response.data or [])
        except Exception as e:
            logger.error("Error revoking auth tokens: %s", e)
            return 0

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

    def mark_auth_token_used(self, token_hash: str) -> None:
        try:
            self.client.table("auth_tokens").update(
                {"used_at": datetime.utcnow().isoformat()}
            ).eq("token_hash", token_hash).execute()
        except Exception as e:
            logger.error("Error marking auth token used: %s", e)

    def validate_auth_token(self, token_hash: str) -> Optional[dict]:
        try:
            response = (
                self.client.table("auth_tokens")
                .select("*")
                .eq("token_hash", token_hash)
                .execute()
            )
            if not response.data:
                return None
            row = response.data[0]
            expires = datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00")).replace(tzinfo=None)
            if expires < datetime.utcnow():
                return None
            if row.get("used_at") is not None:
                return None
            return {"property_id": row["property_id"], "booking_id": row["booking_id"]}
        except Exception as e:
            logger.error("Error validating auth token: %s", e)
            return None

    def create_email_verification(
        self,
        email: str,
        property_id: str,
        booking_id: str,
        token_hash: str,
        expires_at: datetime,
        guest_data: dict = {},
    ) -> None:
        try:
            row = {
                "email": email,
                "property_id": property_id,
                "booking_id": booking_id,
                "guest_data": guest_data,
                "token_hash": token_hash,
                "expires_at": expires_at.isoformat(),
            }
            self.client.table("email_verifications").insert(row).execute()
        except Exception as e:
            logger.error("Error creating email verification: %s", e)
            raise

    def consume_email_verification(self, token_hash: str) -> Optional[dict]:
        try:
            response = (
                self.client.table("email_verifications")
                .select("*")
                .eq("token_hash", token_hash)
                .execute()
            )
            if not response.data:
                return None
            row = response.data[0]
            expires = datetime.fromisoformat(
                str(row["expires_at"]).replace("Z", "+00:00")
            ).replace(tzinfo=None)
            if expires < datetime.utcnow():
                return None
            if row.get("verified_at") is not None:
                return None
            now = datetime.utcnow().isoformat()
            self.client.table("email_verifications").update(
                {"verified_at": now}
            ).eq("token_hash", token_hash).execute()
            row["verified_at"] = now
            return row
        except Exception as e:
            logger.error("Error consuming email verification: %s", e)
            return None

    def get_guest_by_name_and_booking(
        self, name: str, booking_id: str, property_id: Optional[str] = None
    ) -> Optional[GuestProfile]:
        try:
            query = (
                self.client.table("guests")
                .select("*")
                .eq("booking_id", booking_id)
            )
            if property_id:
                query = query.eq("property_id", property_id)
            response = query.execute()
            name_lower = name.strip().lower()
            for row in (response.data or []):
                if row.get("name", "").strip().lower() == name_lower:
                    return GuestProfile(**row)
            return None
        except Exception as e:
            logger.error("Error getting guest by name and booking: %s", e)
            return None

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

    # --- Onboarding helpers ---

    def _generate_staff_code(self, property_id: str) -> str:
        for _ in range(20):
            code = "STF-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
            resp = (
                self.client.table("staff_members")
                .select("id")
                .eq("property_id", property_id)
                .eq("staff_code", code)
                .execute()
            )
            if not resp.data:
                return code
        raise RuntimeError("Could not generate unique staff_code after 20 attempts")

    def _staff_member_from_row(self, row: dict) -> StaffMember:
        data = dict(row)
        if isinstance(data.get("requested_role"), str):
            data["requested_role"] = StaffRole(data["requested_role"])
        if data.get("approved_role") and isinstance(data["approved_role"], str):
            data["approved_role"] = StaffRole(data["approved_role"])
        if isinstance(data.get("status"), str):
            data["status"] = StaffMemberStatus(data["status"])
        for dt_field in ("created_at", "approved_at"):
            if data.get(dt_field) and isinstance(data[dt_field], str):
                data[dt_field] = datetime.fromisoformat(
                    str(data[dt_field]).replace("Z", "+00:00")
                ).replace(tzinfo=None)
        return StaffMember(**{k: v for k, v in data.items() if k in StaffMember.model_fields})

    def _email_verification_from_row(self, row: dict) -> EmailVerification:
        data = dict(row)
        for dt_field in ("expires_at", "verified_at", "created_at"):
            if data.get(dt_field) and isinstance(data[dt_field], str):
                data[dt_field] = datetime.fromisoformat(
                    str(data[dt_field]).replace("Z", "+00:00")
                ).replace(tzinfo=None)
        return EmailVerification(**{k: v for k, v in data.items() if k in EmailVerification.model_fields})

    # --- Onboarding: staff members ---

    def create_staff_request(
        self, property_id: str, display_name: str, requested_role: str,
        email: Optional[str] = None,
    ) -> StaffMember:
        try:
            staff_code = self._generate_staff_code(property_id)
            row = {
                "property_id": property_id,
                "staff_code": staff_code,
                "display_name": display_name,
                "requested_role": requested_role,
                "status": "pending",
            }
            if email is not None:
                row["email"] = email
            response = self.client.table("staff_members").insert(row).execute()
            data = response.data[0] if response.data else row
            return self._staff_member_from_row(data)
        except Exception as e:
            logger.error("Error creating staff request: %s", e)
            raise

    def get_staff_member_by_id(self, id: str) -> Optional[StaffMember]:
        try:
            response = (
                self.client.table("staff_members").select("*").eq("id", id).execute()
            )
            if response.data:
                return self._staff_member_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error("Error getting staff member by id: %s", e)
            return None

    def get_staff_member_by_code(
        self, property_id: str, staff_code: str
    ) -> Optional[StaffMember]:
        try:
            response = (
                self.client.table("staff_members")
                .select("*")
                .eq("property_id", property_id)
                .eq("staff_code", staff_code)
                .execute()
            )
            if response.data:
                return self._staff_member_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error("Error getting staff member by code: %s", e)
            return None

    def get_staff_member_by_access_key_hash(self, hash: str) -> Optional[StaffMember]:
        try:
            response = (
                self.client.table("staff_members")
                .select("*")
                .eq("access_key_hash", hash)
                .execute()
            )
            if response.data:
                return self._staff_member_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error("Error getting staff member by access key hash: %s", e)
            return None

    def list_pending_staff(self, property_id: str) -> List[StaffMember]:
        try:
            response = (
                self.client.table("staff_members")
                .select("*")
                .eq("property_id", property_id)
                .eq("status", "pending")
                .execute()
            )
            return [self._staff_member_from_row(r) for r in (response.data or [])]
        except Exception as e:
            logger.error("Error listing pending staff: %s", e)
            return []

    def list_staff_members(
        self, property_id: str, status: Optional[str] = None
    ) -> List[StaffMember]:
        try:
            query = (
                self.client.table("staff_members")
                .select("*")
                .eq("property_id", property_id)
            )
            if status is not None:
                query = query.eq("status", status)
            response = query.execute()
            return [self._staff_member_from_row(r) for r in (response.data or [])]
        except Exception as e:
            logger.error("Error listing staff members: %s", e)
            return []

    def approve_staff_member(
        self,
        id: str,
        approved_role: str,
        access_key_hash: str,
        approved_by: str,
    ) -> Optional[StaffMember]:
        try:
            updates = {
                "approved_role": approved_role,
                "access_key_hash": access_key_hash,
                "status": "approved",
                "approved_at": datetime.utcnow().isoformat(),
                "approved_by": approved_by,
            }
            response = (
                self.client.table("staff_members")
                .update(updates)
                .eq("id", id)
                .execute()
            )
            if response.data:
                return self._staff_member_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error("Error approving staff member: %s", e)
            return None

    def reject_staff_member(
        self, id: str, approved_by: Optional[str] = None
    ) -> Optional[StaffMember]:
        try:
            updates: dict = {"status": "rejected"}
            if approved_by is not None:
                updates["approved_by"] = approved_by
            response = (
                self.client.table("staff_members")
                .update(updates)
                .eq("id", id)
                .execute()
            )
            if response.data:
                return self._staff_member_from_row(response.data[0])
            return None
        except Exception as e:
            logger.error("Error rejecting staff member: %s", e)
            return None

    # --- Onboarding: task-assist threads ---

    def get_task_assist_thread(
        self, action_id: str, staff_member_id: Optional[str]
    ) -> Optional[dict]:
        try:
            query = self.client.table("staff_task_assist_threads").select("*").eq(
                "action_id", action_id
            )
            if staff_member_id is None:
                query = query.is_("staff_member_id", "null")
            else:
                query = query.eq("staff_member_id", staff_member_id)
            response = query.execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error("Error getting task assist thread: %s", e)
            return None

    def upsert_task_assist_thread(
        self,
        action_id: str,
        staff_member_id: Optional[str],
        property_id: str,
        messages_json: list,
    ) -> dict:
        try:
            now = datetime.utcnow().isoformat()
            existing = self.get_task_assist_thread(action_id, staff_member_id)
            if existing:
                response = (
                    self.client.table("staff_task_assist_threads")
                    .update({"messages_json": messages_json, "updated_at": now})
                    .eq("id", existing["id"])
                    .execute()
                )
                return response.data[0] if response.data else existing
            row: dict = {
                "action_id": action_id,
                "property_id": property_id,
                "messages_json": messages_json,
                "created_at": now,
                "updated_at": now,
            }
            if staff_member_id is not None:
                row["staff_member_id"] = staff_member_id
            response = (
                self.client.table("staff_task_assist_threads").insert(row).execute()
            )
            return response.data[0] if response.data else row
        except Exception as e:
            logger.error("Error upserting task assist thread: %s", e)
            raise
