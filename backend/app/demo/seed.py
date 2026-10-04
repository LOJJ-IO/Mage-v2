"""Builds (or rebuilds) the demo hotel's in-memory database.

`get_demo_database` reseeds when the demo is missing or older than
RESEED_AFTER, so its "recent" activity always reads as recent; `force`
rebuilds it now. All timestamps are relative to the moment of seeding."""

import hashlib
import logging
import threading
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import get_settings
from app.demo import DEMO_GUEST_PREFIX, DEMO_STAFF_KEY, demo_scope
from app.models.schemas import (
    ActionType,
    GuestAccountTier,
    GuestProfile,
    KnowledgeMode,
    Property,
    PropertyProfile,
    StaffAction,
    StaffActionEscalationType,
    StaffActionStatus,
    StaffMember,
    StaffMemberStatus,
    StaffRole,
)

logger = logging.getLogger(__name__)

RESEED_AFTER = timedelta(hours=12)
DEMO_MANAGER_ID = "staff-demo-manager"

# Re-entrant: seeding knowledge calls get_database(), which lands back here.
_lock = threading.RLock()
_state: dict = {"db": None, "seeded_at": None}


def get_demo_database(force: bool = False):
    """The demo database, (re)seeding first when needed."""
    with _lock:
        seeded_at: Optional[datetime] = _state["seeded_at"]
        stale = seeded_at is None or datetime.utcnow() - seeded_at >= RESEED_AFTER
        if force or stale:
            _state["db"] = _build()
            _state["seeded_at"] = datetime.utcnow()
            _seed_knowledge()
        return _state["db"]


def is_demo_staff_key(raw_key: str) -> bool:
    """The demo manager key, or a key approved inside the demo (admin flow).
    Never seeds: a real staff request must not build the demo."""
    if raw_key == DEMO_STAFF_KEY:
        return True
    db = _state["db"]
    if db is None:
        return False
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    return any(m.access_key_hash == key_hash for m in db.staff_members.values())


VISITOR_PREFIX = DEMO_GUEST_PREFIX + "v-"
# Every visitor's stay adds tasks to the shared staff board; keep the newest few.
MAX_VISITORS = 5


def create_demo_visitor() -> GuestProfile:
    """A fresh guest for one demo visitor, so visitors' chats don't mix."""
    import uuid

    return ensure_demo_visitor(VISITOR_PREFIX + uuid.uuid4().hex[:8])


def ensure_demo_visitor(guest_id: str) -> GuestProfile:
    """The visitor's guest, created with a stay already under way when missing
    (first entry, after a reseed or pruning, or on another server process).
    The room comes from the id, so a re-created visitor keeps it."""
    db = get_demo_database()
    with _lock:
        guest = db.guests.get(guest_id)
        if guest is not None:
            return guest
        _prune_visitors(db)
        guest = _seed_visitor(db, guest_id)
        db.demo_visitors.append(guest_id)
        return guest


def _prune_visitors(db) -> None:
    while len(db.demo_visitors) >= MAX_VISITORS:
        old = db.demo_visitors.pop(0)
        db.guests.pop(old, None)
        db.conversations.pop(old, None)
        for aid in [a.id for a in db.staff_actions.values() if a.guest_id == old]:
            del db.staff_actions[aid]


def _seed_visitor(db, guest_id: str) -> GuestProfile:
    from app.services.message_codec import encode_faq_payload

    now = datetime.utcnow()
    ago = lambda minutes: now - timedelta(minutes=minutes)  # noqa: E731
    room = str(500 + int(hashlib.sha256(guest_id.encode()).hexdigest(), 16) % 40)
    guest = GuestProfile(
        id=guest_id,
        name="Alex Morgan",
        room_number=room,
        check_in=now - timedelta(hours=20),
        check_out=now.replace(minute=0, second=0, microsecond=0) + timedelta(days=1, hours=3),
        booking_id=f"GH-{room}-DEMO",
        email=f"{guest_id}@example.com",
        membership_tier="Gold",
        property_id=get_settings().property_id or "grand-horizon",
        account_tier=GuestAccountTier.PILOT_TESTER,
    )
    db.guests[guest_id] = guest

    breakfast = encode_faq_payload(
        intro="Here's what I found about breakfast:",
        faq_items=[
            {"id": "breakfast-hours", "title": "Breakfast buffet",
             "body": "Served in the restaurant from 6:30 AM until 10:30 AM daily."},
            {"id": "room-service", "title": "Breakfast in your room",
             "body": "Room service is available 24/7 — just ask here or dial 0."},
        ],
        trigger_content="What time is breakfast?",
        faq_resolved=True,
    )
    rows = [
        (1150, "user", "Hi! Just got in. What's the wifi password?"),
        (1150, "assistant", f"Welcome to The Grand Horizon, Alex! You're in room {room}. "
                            "The network is HorizonGuest and the password is StayWithHorizon."),
        (1148, "user", "What time is breakfast?"),
        (1148, "assistant", breakfast),
        (1080, "user", "Could I get a margherita pizza and a Caesar salad sent up?"),
        (1080, "assistant", f"Of course — a margherita pizza and a Caesar salad are on their way to room {room}."),
        (1074, "staff", "Hi Alex, Ben from room service here. Your order will be up in about 25 minutes. Enjoy!"),
        (1046, "user", "Just arrived, it was great. Thanks!"),
        (35, "user", "Morning! The shower is barely getting warm. Could someone take a look?"),
        (35, "assistant", f"Sorry about that! I've sent a maintenance request for the shower in room {room}."),
        (21, "staff", "Hi Alex, this is Luis from maintenance. I'll be up within 15 minutes to check the water heater valve."),
        (20, "user", "Perfect, thank you!"),
        (12, "user", "Also, could I get a late checkout tomorrow?"),
        (12, "assistant", "Late checkout is available until 1:00 PM for a $50 fee. "
                          "I've asked the front desk to confirm it for you."),
    ]
    db.conversations[guest_id] = [
        {"role": role, "content": content, "created_at": ago(minutes).isoformat()}
        for minutes, role, content in rows
    ]

    tasks = [
        (ActionType.ROOM_SERVICE, "Margherita pizza + Caesar salad to " + room,
         "Could I get a margherita pizza and a Caesar salad sent up?", StaffActionStatus.RESOLVED, 1080),
        (ActionType.MAINTENANCE, f"Shower not getting hot in {room} — check water heater valve",
         "The shower is barely getting warm. Could someone take a look?", StaffActionStatus.ACKNOWLEDGED, 35),
        (ActionType.CONTACT_FRONT_DESK, "Late checkout until 1 PM tomorrow ($50 fee quoted)",
         "Also, could I get a late checkout tomorrow?", StaffActionStatus.PENDING, 12),
    ]
    for i, (kind, summary, source, status, minutes) in enumerate(tasks):
        aid = f"ACT-{guest_id[len(VISITOR_PREFIX):].upper()}{i}"
        db.staff_actions[aid] = StaffAction(
            id=aid,
            guest_id=guest_id,
            action_type=kind,
            summary=summary,
            source_message=source,
            status=status,
            created_at=ago(minutes),
            guest_name=guest.name,
            room_number=room,
            guest_conversation_thread_id=guest_id,
        )
    return guest


# ------------------------------------------------------------------- data

# (id, name, room, checked in days ago, checks out in days, tier)
GUESTS = [
    ("demo-g01", "Priya Raman", "412", 2, 1, "Gold"),
    ("demo-g02", "Marcus Bell", "305", 1, 3, None),
    ("demo-g03", "Elena Rossi", "1012", 3, 0, "Platinum"),
    ("demo-g04", "Daniel Okafor", "218", 0, 2, None),
    ("demo-g05", "Hannah Weiss", "607", 1, 0, None),
    ("demo-g06", "Tomás Herrera", "921", 4, 1, "Gold"),
    ("demo-g07", "Grace Liu", "514", 2, 2, None),
    ("demo-g08", "Omar Haddad", "330", 0, 4, "Platinum"),
    ("demo-g09", "Sofia Petrov", "702", 5, 0, None),
    ("demo-g10", "Liam Murphy", "115", 1, 5, None),
    ("demo-g11", "Aiko Tanaka", "808", 3, 1, "Gold"),
    ("demo-g12", "Noah Fischer", "426", 2, 2, None),
]

# guest id -> [(minutes ago, role, content)], oldest first
CONVERSATIONS = {
    "demo-g01": [
        (305, "user", "Hi! It's our anniversary tonight. Could we get a bottle of Prosecco and two glasses sent up?"),
        (304, "assistant", "Happy anniversary! I've sent that request to room service — a bottle of Prosecco with two glasses to room 412. They'll be up shortly."),
        (290, "staff", "Delivered! Congratulations to you both from all of us at the front desk."),
        (289, "user", "That was so lovely, thank you!"),
        (19, "user", "Could we get two extra towels and another pillow please?"),
        (18, "assistant", "Of course. Housekeeping has been notified to bring two extra towels and one pillow to room 412."),
    ],
    "demo-g02": [
        (8, "user", "The AC in my room isn't working. It's really hot in here, like 27 degrees."),
        (7, "assistant", "I'm sorry about that — I've logged an urgent maintenance request for the air conditioning in room 305. In the meantime, a fan can be brought up if you'd like."),
        (6, "user", "Yes please. This is really frustrating, I can't sleep in this heat and I have an early meeting tomorrow."),
    ],
    "demo-g03": [
        (98, "user", "Is it possible to check out a bit later tomorrow? My flight isn't until 4."),
        (97, "assistant", "Late checkout is available until 1:00 PM for a $50 fee. Would you like me to ask the front desk to arrange it?"),
        (96, "user", "Yes, that works."),
        (90, "staff", "All set, Elena — your checkout is extended to 1:00 PM. Safe travels!"),
        (89, "user", "Perfect, thanks so much."),
    ],
    "demo-g04": [
        (27, "user", "We're travelling with our baby. Do you have a crib we could use?"),
        (26, "assistant", "We do! I've asked housekeeping to set up a crib in room 218. Is there a time that works best?"),
        (25, "user", "Before 7 PM would be great, that's bedtime."),
    ],
    "demo-g05": [
        (16, "user", "Do you run an airport shuttle? I need to get to the airport for 6 AM tomorrow."),
        (15, "assistant", "Let me connect you with the front desk — they can confirm shuttle times and book you a seat."),
        (14, "user", "Ok thanks, just need to know tonight so I can plan."),
    ],
    "demo-g06": [
        (11, "user", "What's the wifi password?"),
        (11, "assistant", "The network is HorizonGuest and the password is StayWithHorizon."),
        (10, "user", "Thanks! Also can I order a club sandwich and a sparkling water? No tomato please."),
        (9, "assistant", "Done — a club sandwich (no tomato) and a sparkling water are on their way to room 921."),
    ],
    "demo-g07": [
        (75, "user", "The bathroom sink is draining really slowly."),
        (74, "assistant", "Thanks for letting us know. I've sent a maintenance request for the sink in room 514."),
        (53, "user", "Any update on the sink? It's still not draining."),
        (52, "assistant", "I've flagged this with maintenance as a follow-up. Someone will be with you soon."),
        (45, "staff", "Hi Grace, Luis from maintenance is on his way up now. Sorry for the wait!"),
    ],
    "demo-g08": [
        (5, "user", "I was charged twice for valet parking on my folio. Can I talk to someone?"),
        (4, "assistant", "I'm sorry about that. I'm connecting you with the front desk so they can review your folio."),
        (3, "user", "Thanks. Kind of annoying to deal with on day one honestly."),
    ],
    "demo-g09": [
        (36, "user", "The room next to mine has been really loud for the past hour. I can't sleep."),
        (35, "assistant", "I'm really sorry. I've escalated this to the front desk so they can address it right away."),
        (30, "staff", "Hi Sofia, we've spoken with the neighbouring room and security will check back in 15 minutes. Please let us know if it continues."),
        (28, "user", "It's quieter now. Thank you."),
    ],
    "demo-g10": [
        (142, "user", "The TV remote isn't working."),
        (141, "assistant", "Sorry about that! Maintenance will bring a replacement remote to room 115."),
        (128, "user", "Got it, works now. Thanks!"),
    ],
    "demo-g11": [
        (212, "user", "Please skip housekeeping today, I'm working from the room until 2."),
        (211, "assistant", "No problem — I've let housekeeping know to skip room 808 until after 2 PM."),
    ],
    "demo-g12": [
        (60, "user", "What time does the pool open?"),
        (60, "assistant", "The pool on the 3rd floor is open from 6:00 AM to 10:00 PM."),
        (42, "user", "Great. Could we get breakfast for two delivered at 7:30 tomorrow morning?"),
        (41, "assistant", "Absolutely — breakfast for two at 7:30 AM to room 426 has been sent to room service."),
    ],
}

# (id, guest, type, summary, source message, status, minutes ago, escalation, staff may jump in)
ACTIONS = [
    ("ACT-DEMO0001", "demo-g08", ActionType.CONTACT_FRONT_DESK,
     "Charged twice for valet parking — wants folio reviewed",
     "I was charged twice for valet parking on my folio. Can I talk to someone?",
     StaffActionStatus.PENDING, 3, StaffActionEscalationType.CONTACT, True),
    ("ACT-DEMO0002", "demo-g02", ActionType.MAINTENANCE,
     "AC not cooling in 305 (room at 27°C); guest also wants a fan",
     "The AC in my room isn't working. It's really hot in here, like 27 degrees.",
     StaffActionStatus.PENDING, 7, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0003", "demo-g06", ActionType.ROOM_SERVICE,
     "Club sandwich (no tomato) + sparkling water to 921",
     "Can I order a club sandwich and a sparkling water? No tomato please.",
     StaffActionStatus.PENDING, 9, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0004", "demo-g05", ActionType.HANDOFF,
     "Needs airport shuttle for 6 AM tomorrow — no shuttle info in knowledge base",
     "Do you run an airport shuttle? I need to get to the airport for 6 AM tomorrow.",
     StaffActionStatus.PENDING, 15, StaffActionEscalationType.ESCALATED, True),
    ("ACT-DEMO0005", "demo-g01", ActionType.HOUSEKEEPING,
     "2 extra towels and 1 extra pillow to 412",
     "Could we get two extra towels and another pillow please?",
     StaffActionStatus.ACKNOWLEDGED, 18, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0006", "demo-g04", ActionType.HOUSEKEEPING,
     "Set up a crib in 218 before 7 PM",
     "We're travelling with our baby. Do you have a crib we could use?",
     StaffActionStatus.PENDING, 26, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0007", "demo-g09", ActionType.CONTACT_FRONT_DESK,
     "Noise complaint about neighbouring room of 702",
     "The room next to mine has been really loud for the past hour. I can't sleep.",
     StaffActionStatus.ACKNOWLEDGED, 35, StaffActionEscalationType.ESCALATED, True),
    ("ACT-DEMO0008", "demo-g12", ActionType.ROOM_SERVICE,
     "Breakfast for two at 7:30 AM tomorrow to 426",
     "Could we get breakfast for two delivered at 7:30 tomorrow morning?",
     StaffActionStatus.PENDING, 41, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0009", "demo-g07", ActionType.MAINTENANCE,
     "Bathroom sink draining slowly in 514; guest followed up",
     "The bathroom sink is draining really slowly.",
     StaffActionStatus.ACKNOWLEDGED, 74, StaffActionEscalationType.STATUS_CHECK, True),
    ("ACT-DEMO0010", "demo-g03", ActionType.CONTACT_FRONT_DESK,
     "Late checkout until 1 PM ($50 fee quoted)",
     "Is it possible to check out a bit later tomorrow? My flight isn't until 4.",
     StaffActionStatus.RESOLVED, 97, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0011", "demo-g10", ActionType.MAINTENANCE,
     "Replace TV remote in 115",
     "The TV remote isn't working.",
     StaffActionStatus.RESOLVED, 141, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0012", "demo-g11", ActionType.HOUSEKEEPING,
     "Skip service in 808 until after 2 PM",
     "Please skip housekeeping today, I'm working from the room until 2.",
     StaffActionStatus.RESOLVED, 211, StaffActionEscalationType.NORMAL, True),
    ("ACT-DEMO0013", "demo-g01", ActionType.ROOM_SERVICE,
     "Prosecco + 2 glasses to 412 (anniversary)",
     "It's our anniversary tonight. Could we get a bottle of Prosecco and two glasses sent up?",
     StaffActionStatus.RESOLVED, 304, StaffActionEscalationType.NORMAL, True),
]

# (id, code, name, role); only the manager has a key
TEAM = [
    (DEMO_MANAGER_ID, "STF-DEMO", "Maya Chen", StaffRole.MANAGER),
    ("staff-demo-fd", "STF-FD01", "Jordan Blake", StaffRole.FRONT_DESK),
    ("staff-demo-mt", "STF-MT01", "Luis Ortega", StaffRole.MAINTENANCE),
    ("staff-demo-hk", "STF-HK01", "Amara Nwosu", StaffRole.HOUSEKEEPING),
    ("staff-demo-rs", "STF-RS01", "Ben Carter", StaffRole.ROOM_SERVICE),
]


# ------------------------------------------------------------------- seed


def _build():
    from app.services.database import MockDatabase
    from app.services.sentiment import compute_happiness_score

    property_id = get_settings().property_id or "grand-horizon"
    now = datetime.utcnow()
    ago = lambda minutes: now - timedelta(minutes=minutes)  # noqa: E731
    # Checkout is at 11:00 local; "0 days" means later today.
    today_checkout = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=3)

    db = MockDatabase()
    db.demo_visitors = []  # visitor guest ids, oldest first
    db.guests = {}
    db.staff_members = {}
    db.properties.setdefault(
        property_id,
        Property(
            id=property_id,
            name="The Grand Horizon Hotel",
            slug=property_id,
            timezone="America/Edmonton",
            profile=PropertyProfile.FULL_SERVICE,
            pms_type="mock",
            knowledge_mode=KnowledgeMode.DEMO_FILE,
        ),
    )

    for gid, name, room, in_days, out_days, tier in GUESTS:
        first, last = name.split(" ", 1)
        db.guests[gid] = GuestProfile(
            id=gid,
            name=name,
            room_number=room,
            check_in=now - timedelta(days=in_days, hours=4),
            check_out=today_checkout + timedelta(days=out_days),
            booking_id=f"GH-{room}-{gid[-2:]}",
            email=f"{first.lower()}.{last.lower().replace(' ', '')}@example.com",
            membership_tier=tier,
            property_id=property_id,
            account_tier=GuestAccountTier.PILOT_TESTER,
        )

    for gid, rows in CONVERSATIONS.items():
        db.conversations[gid] = [
            {"role": role, "content": content, "created_at": ago(minutes).isoformat()}
            for minutes, role, content in rows
        ]
        try:
            db.guests[gid].happiness_score = compute_happiness_score(db.conversations[gid])
        except Exception as exc:
            logger.warning("Demo sentiment scoring failed for %s: %s", gid, exc)

    for aid, gid, kind, summary, source, status, minutes, escalation, jump_in in ACTIONS:
        guest = db.guests[gid]
        db.staff_actions[aid] = StaffAction(
            id=aid,
            guest_id=gid,
            action_type=kind,
            summary=summary,
            source_message=source,
            status=status,
            created_at=ago(minutes),
            guest_name=guest.name,
            room_number=guest.room_number,
            escalation_type=escalation,
            allow_staff_jump_in=jump_in,
            guest_conversation_thread_id=gid,
        )

    for sid, code, name, role in TEAM:
        db.staff_members[sid] = StaffMember(
            id=sid,
            property_id=property_id,
            staff_code=code,
            display_name=name,
            requested_role=role,
            approved_role=role,
            status=StaffMemberStatus.APPROVED,
            access_key_hash=(
                hashlib.sha256(DEMO_STAFF_KEY.encode()).hexdigest() if sid == DEMO_MANAGER_ID else None
            ),
            created_at=now - timedelta(days=60),
            approved_at=now - timedelta(days=60),
            approved_by="system",
        )
    db.staff_members["staff-demo-pending"] = StaffMember(
        id="staff-demo-pending",
        property_id=property_id,
        staff_code="STF-HK02",
        display_name="Riley Park",
        requested_role=StaffRole.HOUSEKEEPING,
        status=StaffMemberStatus.PENDING,
        created_at=ago(90),
    )
    return db


def _seed_knowledge() -> None:
    """Fills the help desk and knowledge tabs, through the regular knowledge
    service pointed at the demo database."""
    from app.knowledge.service import publish_snapshot, seed_grand_horizon_facts

    property_id = get_settings().property_id or "grand-horizon"
    with demo_scope():
        try:
            seed_grand_horizon_facts(property_id)
            publish_snapshot(property_id, published_by="seed")
        except Exception as exc:  # knowledge is a nice-to-have in the demo
            logger.warning("Demo knowledge seed failed: %s", exc)
