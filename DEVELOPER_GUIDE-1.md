# Nexora — Developer Technical Guide

## 1. Project Overview and Fixed Directory Structure

Nexora is an enterprise-grade web application platform implementing **Module 1 (Foundation & Configuration)** and **Module 2 (Authentication & Account Security)**.

The project adheres strictly to the mandatory root directory structure:

```text
ROOT/
├── frontend/             # React + TypeScript frontend code (components, pages, context, hooks)
├── Backend/              # FastAPI Python backend (core, api, models, schemas, services, tests)
├── database/             # Alembic migrations, SQLAlchemy database models, and CLI management scripts
├── public/               # Static assets
│   └── image/            # Shared brand images, SVG logos, and icons
├── scripts/              # Development orchestration and health checks
├── .env.example          # Safe configuration template (no secrets)
├── package.json          # Root orchestration, dependencies, and test scripts
├── USER_MANUAL.md        # Non-technical end-user manual
└── DEVELOPER_GUIDE.md    # Technical architectural guide
```

*Rule: This root directory structure is fixed. Future modules must reside within `Backend/`, `frontend/`, `database/`, and `public/image/` without restructuring.*

---

## 2. Technology Stack Actually Used

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React + TypeScript | React 19, TS 5.x | Client single-page application |
| **Styling** | Tailwind CSS | Tailwind v4 | Responsive utility design system |
| **Icons** | Lucide React | ^0.546.0 | Semantic accessible UI icons |
| **Build Tool & Dev Server**| Vite | Vite 8 | Frontend HMR, bundling, and `/api` proxying |
| **Backend API** | FastAPI + Uvicorn | FastAPI 0.143, Uvicorn 0.54 | High-performance asynchronous REST API |
| **Data Validation** | Pydantic v2 | Pydantic 2.14, Pydantic-Settings | Request/response schema and config validation |
| **Database** | PostgreSQL | PostgreSQL 15 | Relational persistence with connection pooling |
| **ORM** | SQLAlchemy 2.0 | SQLAlchemy 2.0.54 | Object relational mapping & declarative models |
| **Database Migrations** | Alembic | Alembic 1.20 | Version-controlled schema migrations |
| **Authentication** | PyJWT + Bcrypt | PyJWT 2.15, Bcrypt 5.0 | Cryptographic JWT signatures & password hashing |
| **Testing** | Node test & Pytest | Node:test, Pytest 9.1 | Fast logic unit tests and backend API tests |

---

## 3. Prerequisites and Installation

### Prerequisites
- Node.js >= 22.0.0
- Python >= 3.10
- PostgreSQL >= 14
- Git

### Installation Steps
From the project root directory:

```bash
# 1. Install Node.js frontend dependencies
npm install

# 2. Install Python backend dependencies
pip3 install -r <(cat << 'EOF'
fastapi>=0.100.0
uvicorn[standard]
sqlalchemy>=2.0.0
alembic
pydantic>=2.0.0
pydantic-settings
email-validator
psycopg2-binary
pyjwt[crypto]
bcrypt
httpx
aiosmtplib
pytest
EOF
)

# 3. Copy and configure the environment file
cp .env.example .env
```

---

## 4. Environment Variable Configuration

Nexora uses `.env` as the single source of application configuration:

```dotenv
# Application
APP_NAME=Nexora
APP_ENV=development
APP_URL=http://localhost:3000
APP_TIMEZONE=Asia/Kolkata

# Database (PostgreSQL only)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nexora

# Initial Super Admin (Bootstrapped during npm run db:init)
SUPER_ADMIN_NAME=System Administrator
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=NexoraAdmin2026!SecureKey
SUPER_ADMIN_ENABLED=true

# Authentication
JWT_ACCESS_SECRET=replace-with-a-strong-random-secret-at-least-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_ISSUER=nexora
JWT_AUDIENCE=nexora-application

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@example.com

# Future Module Configurations (Preserved as required)
WORK_EVENT_COOLDOWN_SECONDS=60
SUPPLIER_LINK_EXPIRY_HOURS=72
```

---

## 5. Secure Secret Generation and Management

In production:
1. Generate `JWT_ACCESS_SECRET` with high entropy (e.g., `openssl rand -hex 32`).
2. Passwords must comply with complexity policies (at least 8 chars, uppercase, lowercase, digit, and symbol).
3. Secrets must **never** be hardcoded, committed to Git, or exposed in client responses.

---

## 6. Starting the Application with `npm run dev`

The primary development launcher starts both frontend and backend and prints the mandatory 3-step health check:

```bash
npm run dev
```

### Mandatory Startup Output Sequence:
```text
[1/3] PostgreSQL Database: CONNECTED
[2/3] Frontend Server: RUNNING
Frontend URL: http://localhost:3000
[3/3] SMTP Server: NOT CONFIGURED
========================================
Nexora Startup Summary
========================================
PostgreSQL Database : CONNECTED
Frontend Server     : RUNNING
SMTP Server         : NOT CONFIGURED
Application         : READY

Server is running on: Nexora
Application URL: http://localhost:3000
========================================
```

---

## 7. Starting Frontend and Backend Independently

For debugging:

### Start FastAPI Backend:
```bash
PYTHONPATH=. uvicorn Backend.main:app --host 0.0.0.0 --port 8001 --reload
```

### Start Vite Frontend:
```bash
npx vite --port 3000 --host 0.0.0.0
```

---

## 8. PostgreSQL Setup and Connection Testing

Test PostgreSQL connectivity programmatically or with CLI:

```bash
pg_isready -h 127.0.0.1 -U postgres
python3 -c "from Backend.core.database import check_database_connection; print(check_database_connection())"
```

Connection pooling uses SQLAlchemy `QueuePool` with:
- `pool_size = 10`
- `max_overflow = 20`
- `pool_timeout = 15`
- `pool_pre_ping = True`

---

## 9. Database Migrations and Migration Conventions

Alembic manages all schema migrations under `database/migrations/`:
- Configuration: `database/alembic.ini`
- Environment: `database/migrations/env.py`
- Versions: `database/migrations/versions/`

All models inherit from `Backend.core.database.Base`.

---

## 10. Precise Behavior of `npm run db:init`

Command:
```bash
npm run db:init
```

1. Validates `DATABASE_URL` format.
2. Checks PostgreSQL connectivity.
3. Automatically applies pending Alembic migrations in order (`alembic upgrade head`).
4. Checks if `SUPER_ADMIN_ENABLED=true`.
5. If no user with `SUPER_ADMIN_EMAIL` exists, creates the account with role `super_admin` and bcrypt password hash.
6. If the account already exists, preserves existing password and state (never overwrites).
7. Fully idempotent: safe to execute repeatedly.

---

## 11. Precise Behavior and Risks of `npm run db:clean`

Command:
```bash
npm run db:clean
```

- **Warning**: Clears all application rows while preserving database schema and Alembic migration metadata.
- **Safety Prompt**: Displays database name and asks the operator to type `YES` to confirm. (Accepts `--yes` for CI pipelines).
- **Execution**: Runs `TRUNCATE TABLE password_reset_tokens, revoked_tokens, security_audit_logs, users RESTART IDENTITY CASCADE;`.
- **Startup Protection**: Never executed automatically during startup.

---

## 12. Precise Behavior and Risks of `npm run db:remove`

Command:
```bash
npm run db:remove
```

- **Warning**: Completely drops all Nexora application tables, indices, and Alembic tracking.
- **Safety Prompt**: Requires typing `REMOVE` to proceed. (Accepts `--force-remove` for tests).
- **Production Guard**: In `APP_ENV=production`, blocked unless `--confirm-production` is supplied.
- **Cluster Protection**: Never drops the PostgreSQL database or cluster itself.

---

## 13. Authentication Architecture and JWT Verification

- **Token Format**: HS256 JWT signed with `JWT_ACCESS_SECRET`.
- **Payload Claims**:
  - `sub`: User email address
  - `uid`: User ID in PostgreSQL
  - `role`: User role (`super_admin`, `admin`, `user`)
  - `jti`: Unique token UUID for revocation tracking
  - `iss`: `nexora`
  - `aud`: `nexora-application`
  - `exp`: Configured expiration timestamp
- **Transport**: Stored in `HttpOnly`, `SameSite=Lax` cookies, with Bearer header fallback.
- **Revocation**:
  - When a user logs out or changes password, their token `jti` is added to `revoked_tokens`.
  - Every authenticated request checks `AuthService.is_token_revoked(db, jti)`.
  - Fails closed on any signature, expiry, or revocation failure.

---

## 14. Email Service Configuration and SMTP Troubleshooting

Configured via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`.
- Standard ports: 587 (STARTTLS), 465 (SSL), 25.
- Timeouts: 5s connection timeout, 10s operation timeout.
- Troubleshooting:
  - If SMTP is unconfigured, the app logs recovery links safely in the server log and reports `NOT CONFIGURED`.
  - To test connection: `python3 -c "from Backend.services.email_service import EmailService; print(EmailService.check_smtp_connection())"`

---

## 15. API Response, Validation, Logging, and Error Handling Conventions

### Unified API Envelope:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "errors": null
}
```

### Error Responses:
```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": [{ "field": "email", "message": "Invalid email" }]
}
```

### Logging Redaction:
All loggers pass through `RedactingFilter` in `Backend/core/logging.py`, redacting passwords, JWT tokens, reset tokens, and connection strings.

---

## 16. Folder Responsibilities and Naming Conventions

- `Backend/api/routes/`: Route controllers (`auth.py`, `users.py`, `health.py`).
- `Backend/models/`: SQLAlchemy database entity models.
- `Backend/schemas/`: Pydantic request and response models.
- `Backend/services/`: Business logic operations (`auth_service.py`, `email_service.py`).
- `frontend/components/`: Reusable presentation components.
- `frontend/pages/`: Route view pages.
- `frontend/context/`: State providers (`AuthContext.tsx`).
- `frontend/services/`: Frontend API clients (`api.ts`).

---

## 17. How to Add a New Module

To add Module 3 (e.g., Workforce Management):
1. **Schema**: Add `Backend/models/workforce.py` inheriting from `Base`.
2. **Migrations**: Run `alembic revision --autogenerate -m "add_workforce_tables"` in `database/`.
3. **Services**: Add `Backend/services/workforce_service.py`.
4. **API Router**: Add `Backend/api/routes/workforce.py` and register in `Backend/main.py`.
5. **Frontend View**: Add `frontend/pages/WorkforcePage.tsx` and route in `src/App.tsx`.
6. Root structure remains untouched!

---

## 18. How to Create and Apply New Migrations

```bash
# 1. Define model in Backend/models/
# 2. Generate migration script
alembic -c database/alembic.ini revision --autogenerate -m "describe_change"

# 3. Apply migration to PostgreSQL
alembic -c database/alembic.ini upgrade head
```

---

## 19. How to Extend Authorization Safely

Use the reusable role guards in `Backend/api/deps.py`:

```python
from Backend.api.deps import require_role

# Restrict to specific roles:
@router.post("/audit-purge")
def purge_logs(admin=Depends(require_role("super_admin"))):
    ...
```

---

## 20. Automated Test Commands and Actual Test Results

Run all test suites:

```bash
npm test
```

### Actual Test Run Results:
- **Client Validation (`node:test`)**:
  - `validateEmail validates RFC compliant emails`: PASS
  - `validatePassword rejects weak passwords`: PASS
  - `validateName validates length boundaries`: PASS
  - `validatePasswordConfirmation checks equality`: PASS
  - **4/4 passed (0 failures)**
- **Backend API (`pytest`)**:
  - `test_settings_load_defaults`: PASS
  - `test_invalid_database_url`: PASS
  - `test_jwt_expiry_minutes_parser`: PASS
  - `test_password_hashing_and_verification`: PASS
  - `test_password_complexity`: PASS
  - `test_jwt_issuance_and_decoding`: PASS
  - `test_secure_token_generation_and_hashing`: PASS
  - `test_health_liveness`: PASS
  - `test_health_readiness`: PASS
  - `test_login_failure_invalid_credentials`: PASS
  - `test_super_admin_login_success`: PASS
  - `test_forgot_password_generic_response`: PASS
  - **12/12 passed (0 failures)**

---

## 21. Build, Lint, and Type-Check Commands

- **Type Check**: `npm run lint` (`tsc --noEmit`) — Checked: 0 errors.
- **Production Build**: `npm run build` (`vite build`) — Built in 666ms.
- **Database Init**: `npm run db:init`
- **Database Clean**: `npm run db:clean`
- **Database Remove**: `npm run db:remove`

---

## 22. Security Requirements for Code Reviews

- Never return `password_hash` in any schema or response.
- Never log raw authorization tokens, passwords, or SMTP secrets.
- Always validate inputs both client-side and server-side with Pydantic.
- Ensure all destructive database operations require explicit confirmation.
- Ensure protected endpoints enforce `Depends(get_current_user)`.

---

## 23. Known Limitations and Unresolved Issues

- Local development runs on HTTP `http://localhost:3000` with proxying to backend port 8001. In production, configure TLS certificates for HTTPS and set `APP_URL=https://your-domain`.
- If SMTP credentials are not configured, password reset tokens are safely recorded in audit logs but not dispatched via external email.
