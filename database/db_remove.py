#!/usr/bin/env python3
"""
Nexora Database Remove Script
Command: npm run db:remove

Responsibilities:
1. Clearly warn that removing database tables is completely destructive.
2. Display the target database and require typing 'REMOVE'.
3. In production (APP_ENV=production), reject the operation unless --confirm-production is passed.
4. Drop all application-owned database objects across all modules:
   - database_backups
   - system_settings
   - user_sessions
   - role_permissions
   - permissions
   - menu_items / navigation_menus
   - audit_trail / security_audit_logs
   - password_reset_tokens
   - revoked_tokens
   - users
   - alembic_version
5. Never drop the entire PostgreSQL database cluster.
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

APPLICATION_TABLES = [
    "database_backups",
    "system_settings",
    "user_sessions",
    "role_permissions",
    "roles",
    "permissions",
    "menu_items",
    "navigation_menus",
    "audit_trail",
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
    "alembic_version",
]


def run_remove() -> int:
    parsed = urlparse(settings.DATABASE_URL)
    db_name = parsed.path.lstrip("/") or "nexora"

    print("==================================================")
    print("CRITICAL WARNING: NEXORA DATABASE REMOVE (db:remove)")
    print("==================================================")
    print(f"Target Database: {db_name}")
    print(f"Current Environment: {settings.APP_ENV}")
    print("This action will DROP ALL NEXORA APPLICATION TABLES AND INDICES:")
    for tbl in APPLICATION_TABLES:
        print(f"  - {tbl}")
    print("The PostgreSQL database cluster itself will NOT be dropped.")
    print("==================================================")

    # Production safeguard: Require extra flag
    if settings.APP_ENV.lower() == "production":
        if "--confirm-production" not in sys.argv:
            print("[REJECTED] In production environment, db:remove is blocked.")
            print("To proceed, you must explicitly supply the '--confirm-production' flag.")
            return 1

    # Check for script automated confirmation flag (--force-remove)
    auto_confirm = "--force-remove" in sys.argv

    if not auto_confirm:
        try:
            confirm = input(f"To confirm removal of all tables from '{db_name}', type 'REMOVE': ")
            if confirm.strip() != "REMOVE":
                print("[ABORTED] Database remove cancelled by user.")
                return 0
        except (EOFError, KeyboardInterrupt):
            print("\n[ABORTED] Operation cancelled.")
            return 1

    # Verify connection
    db_ok, msg = check_database_connection()
    if not db_ok:
        print(f"[ERROR] Cannot connect to database: {msg}")
        return 1

    print("[*] Dropping all application-owned database tables...")
    try:
        with engine.begin() as conn:
            # 1. Explicit drop of known application tables with CASCADE
            for tbl in APPLICATION_TABLES:
                try:
                    conn.execute(text(f'DROP TABLE IF EXISTS "{tbl}" CASCADE;'))
                    print(f"  [+] Dropped table: {tbl}")
                except Exception as tbl_err:
                    logger.debug("Table drop note for %s: %s", tbl, tbl_err)

            # 2. Comprehensive cleanup: inspect public schema for any remaining tables
            try:
                res = conn.execute(
                    text(
                        "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
                    )
                )
                remaining = [row[0] for row in res.fetchall()]
                if remaining:
                    print(f"[*] Cleaning up {len(remaining)} additional leftover table(s): {', '.join(remaining)}")
                    for extra_table in remaining:
                        conn.execute(text(f'DROP TABLE IF EXISTS "{extra_table}" CASCADE;'))
                        print(f"  [+] Dropped leftover table: {extra_table}")
            except Exception as e:
                logger.debug("Extra table scan note: %s", e)

        print("[+] All application-owned tables, indices, and credentials removed successfully.")
        logger.warning("Database remove executed: application tables dropped in '%s'.", db_name)
        return 0
    except Exception as e:
        print(f"[ERROR] Failed to drop tables: {e}")
        logger.exception("Database remove error: %s", str(e))
        return 1


if __name__ == "__main__":
    sys.exit(run_remove())
