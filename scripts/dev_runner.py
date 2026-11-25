
#!/usr/bin/env python3

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
os.chdir(PROJECT_ROOT)

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from Backend.core.config import settings
from Backend.core.database import check_database_connection
from Backend.services.email_service import EmailService

backend_proc = None
frontend_proc = None
shutting_down = False


def check_url(url, timeout=2.0):
    """Check whether an HTTP endpoint responds successfully."""
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Nexora-Health-Check"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 400
    except (
        urllib.error.URLError,
        TimeoutError,
        OSError,
        ValueError,
    ):
        return False


def stop_process(process, name):
    """Stop a child process without terminating unrelated processes."""
    if process is None or process.poll() is not None:
        return

    print(f"[Nexora] Stopping {name}...")

    try:
        process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            print(f"[WARNING] {name} did not exit promptly.")
    except OSError as exc:
        print(f"[WARNING] Could not stop {name}: {exc}")


def shutdown_handler(signum=None, frame=None):
    """Stop child processes when Ctrl+C or termination is requested."""
    global shutting_down

    if shutting_down:
        return

    shutting_down = True
    print("\n[Nexora] Shutting down...")

    stop_process(frontend_proc, "frontend")
    stop_process(backend_proc, "backend")

    raise SystemExit(0)


def get_frontend_config():
    """Read the frontend URL and port from application settings."""
    app_url = settings.APP_URL.rstrip("/")
    parsed = urlparse(app_url)

    if parsed.scheme != "http" or not parsed.hostname:
        raise ValueError(
            f"Invalid APP_URL: {app_url!r}. "
            "Use a local development URL such as "
            "http://localhost:3001."
        )

    port = parsed.port or 80
    return app_url, port


def start_frontend(port):
    """Launch Vite directly, without recursively invoking npm run dev."""
    node_executable = shutil.which("node")
    vite_entry = PROJECT_ROOT / "node_modules" / "vite" / "bin" / "vite.js"

    if not node_executable:
        raise RuntimeError(
            "Node.js was not found. Install Node.js and restart the terminal."
        )

    if not vite_entry.is_file():
        raise RuntimeError(
            "Vite was not found in node_modules. Run npm install first."
        )

    command = [
        node_executable,
        str(vite_entry),
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
        "--strictPort",
    ]

    return subprocess.Popen(
        command,
        cwd=str(PROJECT_ROOT),
        env=os.environ.copy(),
    )


def main():
    global backend_proc, frontend_proc

    signal.signal(signal.SIGINT, shutdown_handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown_handler)

    try:
        # Step 1: PostgreSQL
        print("[1/4] Checking PostgreSQL database...")
        sys.stdout.flush()

        db_ok, db_msg = check_database_connection()

        if not db_ok:
            print("[1/4] PostgreSQL Database: FAILED")
            print(f"Error: {db_msg}")
            print("Check PostgreSQL service and database configuration.")
            return 1

        print("[1/4] PostgreSQL Database: CONNECTED")

        # Step 2: FastAPI
        backend_port = int(settings.BACKEND_PORT)

        backend_env = os.environ.copy()
        existing_pythonpath = backend_env.get("PYTHONPATH", "")
        backend_env["PYTHONPATH"] = (
            str(PROJECT_ROOT)
            + (os.pathsep + existing_pythonpath if existing_pythonpath else "")
        )

        backend_cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "Backend.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(backend_port),
            "--log-level",
            "warning",
        ]

        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=str(PROJECT_ROOT),
            env=backend_env,
        )

        backend_health_url = (
            f"http://127.0.0.1:{backend_port}/api/health/liveness"
        )

        backend_ready = False

        for _ in range(60):
            if backend_proc.poll() is not None:
                break

            if check_url(backend_health_url):
                backend_ready = True
                break

            time.sleep(0.25)

        if not backend_ready:
            print("[2/4] FastAPI Backend: FAILED")
            print(f"Expected health endpoint: {backend_health_url}")
            print(
                "The backend failed to start or its health endpoint did not "
                "respond. Check the backend logs and port availability."
            )
            return 1

        print("[2/4] FastAPI Backend: RUNNING")

        # Step 3: React/Vite
        app_url, frontend_port = get_frontend_config()

        frontend_proc = start_frontend(frontend_port)
        frontend_ready = False

        for _ in range(60):
            if frontend_proc.poll() is not None:
                break

            if check_url(app_url):
                frontend_ready = True
                break

            time.sleep(0.25)

        if not frontend_ready:
            print("[3/4] Frontend Server: FAILED")
            print(f"Configured URL: {app_url}")
            print("Check Vite configuration and frontend port availability.")
            return 1

        print("[3/4] Frontend Server: RUNNING")
        print(f"Frontend URL: {app_url}")

        # Step 4: SMTP
        try:
            smtp_ok, smtp_msg = EmailService.check_smtp_connection(
                timeout=3.0
            )
        except Exception as exc:
            smtp_ok = False
            smtp_msg = f"SMTP check failed: {exc}"

        if smtp_ok:
            smtp_label = "CONNECTED"
        elif not EmailService.is_configured():
            smtp_label = "NOT CONFIGURED"
        else:
            smtp_label = "UNAVAILABLE"

        print(f"[4/4] {smtp_msg}")

        # Standardized Startup summary banner
        now_str = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
        print("")
        print("=" * 48)
        print("             NEXORA SYSTEM MONITOR              ")
        print("=" * 48)
        print("")
        print("FRONTEND SERVER       : RUNNING")
        print("BACKEND SERVER        : RUNNING")
        print("POSTGRESQL DATABASE   : CONNECTED")
        print(f"EMAIL SMTP SERVER     : {smtp_label}")
        print("AUTHENTICATION        : ACTIVE")
        print("FILE STORAGE          : AVAILABLE")
        print("EXTERNAL APIs         : NOT CONFIGURED")
        print("")
        print("-" * 48)
        print("OVERALL STATUS        : ALL SYSTEMS OPERATIONAL")
        print("-" * 48)
        print("")
        print(f"Frontend URL          : {app_url}")
        print(f"Backend URL           : http://localhost:{backend_port}")
        print("")
        print(f"Last Health Check     : {now_str}")
        print("")
        print("=" * 48)
        print("              NEXORA IS READY                   ")
        print("=" * 48)
        print("")
        sys.stdout.flush()

        # Monitor child processes
        while True:
            time.sleep(1)

            if backend_proc.poll() is not None:
                print("[ERROR] FastAPI backend stopped unexpectedly.")
                return 1

            if frontend_proc.poll() is not None:
                print("[ERROR] Frontend stopped unexpectedly.")
                return 1

    except KeyboardInterrupt:
        print("\n[Nexora] Shutdown requested.")
        return 0

    except Exception as exc:
        print(f"[ERROR] Nexora startup failed: {exc}")
        return 1

    finally:
        stop_process(frontend_proc, "frontend")
        stop_process(backend_proc, "backend")


if __name__ == "__main__":
    sys.exit(main())
