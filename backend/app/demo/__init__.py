"""The sales demo: one seeded hotel that anyone can enter from /demo, signed
in as its manager, with a live-looking day of guests, chats and tasks.

It is fenced off from everything real:
- Its data lives in its own in-memory database (`app.demo.seed`), never in
  Supabase. `get_database()` hands it out only to demo requests (see
  DemoScopeMiddleware), so demo visitors never see real guests and real
  staff never see demo tasks.
- Its keys and guests exist only inside that database, so they open
  nothing outside the demo.

All three sides of the app can be entered: staff and admin with
DEMO_STAFF_KEY (or a key approved inside the demo), guests with a demo
session cookie for a per-visitor guest (ids start with DEMO_GUEST_PREFIX).

State is per server process and shared by every demo visitor; it reseeds
when older than RESEED_AFTER so "recent" activity always reads as recent.
"""

from contextvars import ContextVar

DEMO_STAFF_KEY = "mage-demo-manager"
DEMO_GUEST_PREFIX = "demo-"

_demo_scope: ContextVar[bool] = ContextVar("mage_demo_scope", default=False)


def active_demo_database():
    """The demo database when the current request is a demo request, else None."""
    if not _demo_scope.get():
        return None
    from app.demo.seed import get_demo_database

    return get_demo_database()


def _header(scope, name: bytes) -> bytes | None:
    for key, value in scope.get("headers") or ():
        if key == name:
            return value
    return None


def _demo_guest_id(scope) -> str | None:
    """The demo guest a request's session cookie belongs to, if any."""
    from http.cookies import SimpleCookie

    from app.services.guest_session import SESSION_COOKIE, decode_session_token

    raw = _header(scope, b"cookie")
    if not raw:
        return None
    cookie = SimpleCookie()
    try:
        cookie.load(raw.decode("latin-1"))
    except Exception:
        return None
    morsel = cookie.get(SESSION_COOKIE)
    session = decode_session_token(morsel.value) if morsel else None
    if session and session.guest_id.startswith(DEMO_GUEST_PREFIX):
        return session.guest_id
    return None


def _demo_request(scope) -> tuple[bool, str | None]:
    """(is a demo request, demo guest id). A staff key decides on its own, so a
    real key is never redirected by a leftover demo guest cookie."""
    from app.demo.seed import is_demo_staff_key

    key = _header(scope, b"x-staff-key")
    if key is not None:
        return is_demo_staff_key(key.decode("latin-1")), None
    guest_id = _demo_guest_id(scope)
    return guest_id is not None, guest_id


class DemoScopeMiddleware:
    """Routes every database call in a request to the demo database when the
    request carries a demo staff key or a demo guest's session cookie. Pure
    ASGI so the scope also covers background tasks that run after the
    response."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_demo, guest_id = _demo_request(scope)
        if not is_demo:
            await self.app(scope, receive, send)
            return
        token = _demo_scope.set(True)
        try:
            if guest_id:
                from app.demo.seed import ensure_demo_visitor

                ensure_demo_visitor(guest_id)
            await self.app(scope, receive, send)
        finally:
            _demo_scope.reset(token)


class demo_scope:
    """Context manager for code outside a request (seeding, tests)."""

    def __enter__(self):
        self._token = _demo_scope.set(True)
        return self

    def __exit__(self, *exc):
        _demo_scope.reset(self._token)
        return False
