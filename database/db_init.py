#!/usr/bin/env python3
"""
Nexora Database Initialization Script
Command: npm run db:init

Responsibilities:
1. Validate environment configuration and DATABASE_URL.
2. Establish PostgreSQL connection.
3. Run Alembic migrations to apply pending schema changes idempotently.
4. Report applied, skipped, or failed status.
5. Bootstrap initial Super Admin from .env if enabled and not already created.
6. Safely exit with non-zero status on any failure.
"""

import os
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from Backend.core.config import settings
    from Backend.core.database import check_database_connection, engine, SessionLocal
    from Backend.core.logging import logger
    from Backend.services.auth_service import AuthService
    from Backend.services.seed_service import SeedService
except ImportError as err:
    print(f"[ERROR] Required Python dependencies missing: {err}")
    print("[HINT] Run 'pip install -r requirements.txt' or install psycopg2-binary, sqlalchemy, and alembic.")
    sys.exit(1)


def run_init() -> int:
    print("========================================")
    print("Nexora Database Initialization (db:init)")
    print("========================================")

    # 1. Environment & Database Configuration Check
    try:
        url = settings.DATABASE_URL
        print(f"[*] Validating database configuration: PostgreSQL dialect detected.")
    except Exception as e:
        print(f"[ERROR] Environment configuration invalid: {e}")
        return 1

    # 2. Connection Verification
    print("[*] Testing PostgreSQL connection...")
    db_ok, msg = check_database_connection()
    if not db_ok:
        print(f"[ERROR] Connection failed: {msg}")
        return 1
    print("[+] PostgreSQL connection verified successfully.")

    # 3. Clean up obsolete duplicate migration files if present locally
    versions_dir = os.path.join(os.path.dirname(__file__), "migrations", "versions")
    obsolete_files = [
        "004_inventory_and_reorders.py",
        "005_inventory_and_reorders.py",
        "011_performance_roster_and_events.py",
    ]
    for obs in obsolete_files:
        obs_path = os.path.join(versions_dir, obs)
        if os.path.exists(obs_path):
            try:
                os.remove(obs_path)
                print(f"[*] Cleaned up obsolete migration file: {obs}")
            except Exception as e:
                print(f"[!] Warning: Could not remove {obs}: {e}")

    # 4. Apply Alembic Migrations
    print("[*] Checking and applying version-controlled migrations...")
    try:
        alembic_cfg = Config("database/alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
        command.upgrade(alembic_cfg, "heads")
        print("[+] Migrations applied successfully (schema at HEADS).")
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        logger.exception("Migration execution error: %s", str(e))
        return 1

    # 4. Bootstrap Initial Super Admin (if enabled)
    print("[*] Checking Initial Super Admin account...")
    db = SessionLocal()
    try:
        created, admin_msg = AuthService.bootstrap_super_admin(db)
        if created:
            print(f"[+] {admin_msg}")
        else:
            print(f"[*] {admin_msg}")

        # 5. Seed System Settings, Navigation Menus, and Permissions
        print("[*] Seeding default system settings, navigation menus, and permissions...")
        SeedService.seed_all(db)
        print("[+] System configurations and navigation menu entries seeded successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to initialize Super Admin or Seed Data: {e}")
        logger.exception("Super Admin / Seed error: %s", str(e))
        db.rollback()
        return 1
    finally:
        db.close()

    print("========================================")
    print("Nexora Database Initialization: COMPLETE")
    print("========================================")
    return 0


if __name__ == "__main__":
    exit_code = run_init()
    sys.exit(exit_code)
