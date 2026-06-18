"""Email delivery service — thin wrapper used by auth flows.

Behaviour:
- DEBUG=true        → log body only, return True (never actually sends)
- RESEND_API_KEY set → POST to Resend API via httpx; True on 2xx, False on error
- Neither           → log warning, return False
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Never raises — logs on failure."""
    settings = get_settings()

    if settings.resend_api_key:
        if settings.debug:
            logger.info("[EMAIL] to=%s subject=%r\n%s", to, subject, body)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": settings.resend_from_email,
                        "to": [to],
                        "subject": subject,
                        "text": body,
                    },
                )
            if resp.is_success:
                logger.info("[EMAIL] sent via Resend to %s subject=%r", to, subject)
                return True
            logger.error(
                "[EMAIL] Resend rejected to %s: %s %s", to, resp.status_code, resp.text
            )
            return False
        except Exception as exc:
            logger.error("[EMAIL] Resend request failed to %s: %s", to, exc)
            return False

    if settings.debug:
        logger.info(
            "[EMAIL] No RESEND_API_KEY — logging only. to=%s subject=%r\n%s",
            to, subject, body,
        )
        return True

    logger.warning(
        "[EMAIL] No provider configured (RESEND_API_KEY unset). Email NOT sent to %s subject=%r",
        to,
        subject,
    )
    return False
