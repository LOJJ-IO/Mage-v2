"""PMS provider factory — resolves adapter from property config."""
from __future__ import annotations

import logging
from typing import Dict, Type

from app.core.config import get_settings
from app.integrations.pms.base import PMSProvider
from app.integrations.pms.mock import MockPMS
from app.services.database import get_database

logger = logging.getLogger(__name__)

_ADAPTERS: Dict[str, Type[MockPMS]] = {
    "mock": MockPMS,
}

_provider_cache: Dict[str, PMSProvider] = {}


class PMSAdapterNotInstalledError(Exception):
    """Raised when property references a PMS type with no adapter in this deployment."""


def get_pms_provider(property_id: str | None = None) -> PMSProvider:
    """
    Return cached PMS adapter for property.
    Falls back to mock when property unknown (dev).
    """
    settings = get_settings()
    pid = property_id or settings.property_id or "grand-horizon"

    if pid in _provider_cache:
        return _provider_cache[pid]

    db = get_database()
    prop = db.get_property(pid)
    pms_type = (prop.pms_type if prop else None) or "mock"

    adapter_cls = _ADAPTERS.get(pms_type.lower())
    if adapter_cls is None:
        raise PMSAdapterNotInstalledError(
            f"PMS adapter '{pms_type}' is not installed for property '{pid}'. "
            "Configure pms_type=mock or ship the vendor adapter."
        )

    provider = adapter_cls()
    _provider_cache[pid] = provider
    logger.info("PMS provider %s for property %s", pms_type, pid)
    return provider
