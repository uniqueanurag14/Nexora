#!/usr/bin/env python3
"""
Nexora Database Clean Script
Command: npm run db:clean

Responsibilities:
1. Clearly warn that application data will be deleted.
2. Require explicit confirmation before proceeding.
3. Show the configured database name.
4. Truncate/delete application records while preserving schema tables and alembic_version.
5. Respect foreign key dependencies.
6. Never run automatically on startup.
"""

import os
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from urllib.parse import urlparse
from sqlalchemy import text
from Backend.core.config import settings
from Backend.core.database import check_database_connection, engine
from Backend.core.logging import logger

DATA_TABLES_TO_CLEAN = [
    "database_backups",
    "user_sessions",
    "security_audit_logs",
    "password_reset_tokens",
    "revoked_tokens",
    "stock_transactions",
    "stock_balances",
    "inventory_items",
    "warehouses",
    "units_of_measure",
    "inventory_categories",
    "suppliers",
    "user_roles",
    "users",
]


def run_clean() -> int:
    parsed = urlparse(settings.DATABASE_URL)
    db_name = parsed.path.lstrip("/") or "nexora"

    print("========================================")
    print("WARNING: NEXORA DATABASE CLEAN (db:clean)")
    print("========================================")
    print(f"Target Database: {db_name}")
    print("This action will DELETE ALL APPLICATION RECORDS from:")
    for tbl in DATA_TABLES_TO_CLEAN:
        print(f"  - {tbl}")
    print("Database schema, settings, navigation configurations, and Alembic tracking will be preserved.")
    print("========================================")

    # Check for non-interactive flag (--yes or --force)
    auto_confirm = "--yes" in sys.argv or "--force" in sys.argv

    if not auto_confirm:
        try:
            confirm = input(f"Are you sure you want to clean application data from '{db_name}'? Type 'YES' to confirm: ")
            if confirm.strip() != "YES":
                print("[ABORTED] Database clean cancelled by user.")
                return 0
        except (EOFError, KeyboardInterrupt):
            print("\n[ABORTED] Operation cancelled.")
            return 1

    # Verify connection
    db_ok, msg = check_database_connection()
    if not db_ok:
        print(f"[ERROR] Cannot connect to database: {msg}")
        return 1

    print("[*] Performing dependency-aware table cleanup...")
    try:
        with engine.begin() as conn:
            for table in DATA_TABLES_TO_CLEAN:
                try:
                    conn.execute(
                        text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;")
                    )
                except Exception as tbl_err:
                    logger.debug("Table %s truncate note (may not exist yet): %s", table, tbl_err)

        print("[+] All application records successfully deleted. Schema preserved.")
        logger.warning("Database cleaned: all records truncated in database '%s'.", db_name)
        return 0
    except Exception as e:
        print(f"[ERROR] Failed to clean database tables: {e}")
        logger.exception("Database clean error: %s", str(e))
        return 1


if __name__ == "__main__":
    sys.exit(run_clean())
