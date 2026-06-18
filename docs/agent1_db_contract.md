# Agent 1 DB Contract — Onboarding Data Layer

**For use by Agents 2, 3, 4, 6, and 8.** All methods are available on both `MockDatabase` (local dev) and `SupabaseDatabase` (production) via `get_database()`.

## Migration run order

1. `docs/supabase_core_migration.sql`
2. `docs/supabase_properties_auth_knowledge_migration.sql`
3. `docs/supabase_staff_actions_migration.sql`
4. `docs/supabase_metrics_migration.sql`
5. **`docs/supabase_onboarding_migration.sql`** ← new

## Conventions

- **staff_code format**: `STF-` + 4 uppercase alphanumeric chars (e.g. `STF-A7K2`). Unique per `property_id`.
- **access_key_hash**: SHA-256 hex of the raw one-time access key. Callers (Agent 3) compute the hash before calling DB methods. Raw key is never stored.
- **token_hash** (email verifications): SHA-256 hex of the raw email token. Same pattern.
- All datetime fields are `datetime` objects (timezone-naive UTC) in method signatures. The Supabase layer handles ISO serialization internally.
- Error semantics: read methods return `None` / `[]` on not-found. Write methods raise on unexpected DB errors.
- Dev seed (mock only): approved manager `staff-dev-manager-001` for `grand-horizon`. Raw key: `dev-manager-key-grand-horizon`.

---

## Staff members

### `create_staff_request(property_id, display_name, requested_role) → StaffMember`
Creates a pending staff access request. Generates a unique `staff_code`.
- `requested_role`: one of `manager | front_desk | maintenance | housekeeping | room_service`
- Returns `StaffMember` with `status="pending"`, `access_key_hash=None`, `approved_role=None`
- Raises on DB error

### `get_staff_member_by_id(id: str) → Optional[StaffMember]`
Lookup by UUID. Returns `None` if not found.

### `get_staff_member_by_code(property_id, staff_code) → Optional[StaffMember]`
Lookup by property-scoped staff code. Returns `None` if not found.

### `get_staff_member_by_access_key_hash(hash: str) → Optional[StaffMember]`
Lookup approved staff by SHA-256 hex of their access key. Returns `None` if not found.
- **Agent 3/4**: use this after hashing the key the staff member enters at sign-in.

### `list_pending_staff(property_id) → List[StaffMember]`
All staff with `status="pending"` for this property. Used by manager admin portal.

### `list_staff_members(property_id, status=None) → List[StaffMember]`
All staff for a property. Pass `status="approved"` / `"pending"` / `"rejected"` to filter.

### `approve_staff_member(id, approved_role, access_key_hash, approved_by) → Optional[StaffMember]`
Sets `status="approved"`, stores the hashed access key, records `approved_at` and `approved_by`.
- `access_key_hash`: SHA-256 hex computed by Agent 3 from the generated raw key
- Returns updated `StaffMember` or `None` if `id` not found

### `reject_staff_member(id, approved_by=None) → Optional[StaffMember]`
Sets `status="rejected"`. Returns updated `StaffMember` or `None` if not found.

---

## Email verifications

### `create_email_verification(email, property_id, booking_id, token_hash, expires_at) → EmailVerification`
Creates a pending email verification record. `token_hash` is SHA-256 hex of the raw token Agent 2 sends by email.
- Raises on DB error

### `consume_email_verification(token_hash) → Optional[EmailVerification]`
Atomically marks the token as verified and returns the record.
- Returns `None` if: token not found, token expired (`expires_at < now`), or already verified (`verified_at` is set).
- After this call, a subsequent call with the same `token_hash` returns `None`.

---

## Task-assist threads

### `get_task_assist_thread(action_id, staff_member_id) → Optional[dict]`
Get the help-desk chat thread for a task. `staff_member_id` may be `None` (anonymous thread).
- Returns dict with keys: `id`, `action_id`, `staff_member_id`, `property_id`, `messages_json` (list), `created_at`, `updated_at`

### `upsert_task_assist_thread(action_id, staff_member_id, property_id, messages_json) → dict`
Create or overwrite the messages list for a task-assist thread. `messages_json` is the full ordered list of chat turns (Agent 6 manages the shape).
- Raises on DB error

---

## Guest extensions

### `get_guest_by_name_and_booking(name, booking_id, property_id=None) → Optional[GuestProfile]`
Returning-guest sign-in lookup. Name comparison is case-insensitive and trims whitespace.
- Used by Agent 2 for the "name + booking ID" sign-in flow.

---

## Auth token extension

### `mark_auth_token_used(token_hash) → None`
Marks a magic-link token as consumed. After this call, `validate_auth_token(token_hash)` returns `None`.
- **Note**: `validate_auth_token` already rejects tokens where `used_at` is set. Callers should call `mark_auth_token_used` immediately after successfully exchanging the token.

---

## Pydantic models (from `app.models.schemas`)

```python
class StaffRole(str, Enum):
    MANAGER = "manager"
    FRONT_DESK = "front_desk"
    MAINTENANCE = "maintenance"
    HOUSEKEEPING = "housekeeping"
    ROOM_SERVICE = "room_service"

class StaffMemberStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class StaffMember(BaseModel):
    id: str
    property_id: str
    staff_code: str
    display_name: str
    requested_role: StaffRole
    approved_role: Optional[StaffRole]
    status: StaffMemberStatus
    access_key_hash: Optional[str]    # SHA-256 hex; never expose in API responses
    created_at: datetime
    approved_at: Optional[datetime]
    approved_by: Optional[str]

class EmailVerification(BaseModel):
    id: str
    email: str
    property_id: str
    booking_id: str
    token_hash: str                   # SHA-256 hex; never expose in API responses
    expires_at: datetime
    verified_at: Optional[datetime]
    created_at: datetime
```

---

## Security notes

- **Never return `access_key_hash` or `token_hash` in API responses.** These are internal storage fields.
- **Never store raw access keys or raw tokens.** Hash with SHA-256 before calling any DB method.
- The raw dev seed key (`dev-manager-key-grand-horizon`) is only for local mock — never used in production.
