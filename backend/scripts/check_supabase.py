#!/usr/bin/env python3
"""Probe Supabase tables required for guest chat. Run from backend/: python -m scripts.check_supabase"""
from __future__ import annotations

import sys


def main() -> int:
    from app.core.config import get_settings
    from app.services.database import get_database

    settings = get_settings()
    print(f"database_type={settings.database_type}")

    if settings.database_type != "supabase":
        print("Set DATABASE_TYPE=supabase and SUPABASE_URL/SUPABASE_KEY to probe Supabase.")
        return 1

    db = get_database()
    client = getattr(db, "client", None)
    if client is None:
        print("ERROR: SupabaseDatabase has no client (init failed?)")
        return 1

    tables = [
        "guests",
        "conversations",
        "staff_actions",
        "properties",
        "guest_sessions",
    ]
    ok = True
    for table in tables:
        try:
            client.table(table).select("*").limit(1).execute()
            print(f"  OK  {table}")
        except Exception as exc:
            ok = False
            print(f"  FAIL {table}: {exc}")

    if ok:
        print("Supabase schema looks ready for chat.")
        return 0

    print("\nRun migrations in Supabase SQL editor (see docs/supabase_core_migration.sql).")
    return 2


if __name__ == "__main__":
    sys.exit(main())
