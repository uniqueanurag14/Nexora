# NEXORA ERP — Operation Performance, Roster Fix & Dashboard Gap Analysis

## 1. Audited Modules
- `server/performanceRoutes.ts` (`POST/GET/PUT /api/performance/roster`, `/options`, `/next-id`)
- `server/db.ts` & `server/migrations/migrations.ts`
- `server/store.ts` (Permissions Catalog & Role Mappings)
- `server/services/manufacturingEngine.ts` & `server/operationsPerformanceRoutes.ts`
- `server/dashboardRoutes.ts` & `frontend/pages/DashboardPage.tsx`

## 2. Root Causes Identified & Resolved for `POST /api/performance/roster` `500 Internal Server Error`
1. **Schema Drift (`departments.is_active`)**: `server/db.ts` bootstrapped `departments` with `status VARCHAR(20)` without `is_active`, while `POST /roster` queried `WHERE is_active = TRUE`, throwing PostgreSQL `42703`. Fixed via idempotent schema alignment in `server/db.ts` and Migration `005_dashboard_notifications_and_roster_fixes`.
2. **PostgreSQL Transaction Abort (`25P02`)**: `generateNextPerformanceEmployeeId` executed an optional `SELECT employee_id FROM users` inside `BEGIN ... COMMIT` without a PostgreSQL `SAVEPOINT`, poisoning the outer transaction whenever the optional column did not exist. Fixed by wrapping every fallback check in `SAVEPOINT` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT`.
3. **Unique Key Collisions During Sync (`23505`)**: Store-to-PG department/role synchronization used `ON CONFLICT (id)` without checking `code`/`name` collisions. Fixed by lookup-by-code/name before insert.
4. **Missing Performance Roster Columns on Fresh DB**: Added idempotent `ALTER TABLE performance_employees ADD COLUMN IF NOT EXISTS` for `hardware_id`, `employee_type`, `department_id`, `role_id` plus unique active hardware index.
5. **Overly Permissive Write RBAC on `/api/performance`**: `server.ts` previously allowed `dashboard.view` / `performance.view` on mutating `POST`/`PUT` routes. Tightened so writes strictly require `performance.manage`, and added department-restricted scoping on `GET/POST/PUT /roster`.
6. **Error Leakage**: Hardened `sendRouteError` to log details server-side and return safe, structured error messages without exposing SQL text or stack traces.

## 3. Visual Role-Based Dashboard Gaps Closed
- Replaced static summary cards on `DashboardPage.tsx` with dynamic permission-driven visual analytics (`recharts`), interactive date/business filters, clickable process pipeline, component-vs-finished readiness, bottleneck-constrained forecasts, paginated fair leaderboard, PostgreSQL-persisted per-user notifications, and separately permissioned Excel/PDF exports.
- Enforced 100% real PostgreSQL data with zero seed/dummy/placeholder records.
