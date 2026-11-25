# NEXORA ERP — Operations Engine & Role-Based Dashboard API Reference

## 1. Performance Employee Roster API (`/api/performance`)
- `GET /api/performance/options` — Active departments, roles, employee types (`performance.view` or `performance.manage`).
- `GET /api/performance/roster` — Paginated employee roster (`page`, `limit`, `search`, `status`, `department_id`, `role_id`, `employee_type`); department-restricted users are scoped to their own department (`403` on cross-department query).
- `POST /api/performance/roster` — Registers employee with backend auto-generated `emp_id` and active hardware uniqueness check (`performance.manage` required; department-restricted users get `403` on foreign departments).
- `PUT /api/performance/roster/:id` — Updates employee while enforcing `emp_id` immutability and department scope (`performance.manage` required).

## 2. Dynamic Role-Based Visual Dashboard API (`/api/dashboard`)
Every endpoint requires JWT authentication and enforces default-deny permissions + data scope (`company` | `department` | `self`):

| Endpoint | Required Permission(s) | Description |
|---|---|---|
| `GET /api/dashboard/config` | Authenticated | Effective `widget_access`, `scope`, scoped filter dropdowns, authorized `quick_actions` |
| `GET /api/dashboard/summary` | `dashboard.view` / section perms | Permission-gated Employee, Production, Finished Product, and Forecast KPI cards with previous-period deltas |
| `GET /api/dashboard/employee-performance` | `dashboard.employee_performance.view` / `performance.view` | Fair standard-time productivity charts, trends, operation rankings, paginated leaderboard & 7 reward categories |
| `GET /api/dashboard/production` | `dashboard.production_summary.view` / `production.view` | Daily/product/shift/order production analytics & clickable Manufacturing Process Pipeline |
| `GET /api/dashboard/quality` | `dashboard.quality_reports.view` / `operations.quality.view` | First-pass vs final acceptance quality analytics (zero double-counting), operation defects, employee quality |
| `GET /api/dashboard/product-readiness` | `dashboard.product_readiness.view` / `operations.readiness.view` | Component WIP sets vs assembled vs awaiting final QC vs final approved finished products |
| `GET /api/dashboard/forecast` | `dashboard.production_forecast.view` / `operations.forecasting.view` | Daily/Weekly/Monthly bottleneck-constrained estimates (`is_estimate: true`) & capacity recommendations |
| `GET /api/dashboard/notifications` | `dashboard.notifications.view` / `dashboard.view` | Real PostgreSQL-persisted operational alerts filtered by permission & scope with per-user read state |
| `POST /api/dashboard/notifications/:id/read` | `dashboard.notifications.view` / `dashboard.view` | Marks single notification read for authenticated user |
| `POST /api/dashboard/notifications/read-all` | `dashboard.notifications.view` / `dashboard.view` | Marks all active notifications read for authenticated user |
| `GET /api/dashboard/recent-activity` | `dashboard.recent_activity.view` / `dashboard.view` | Authorized operational & audit activity events |
| `GET /api/dashboard/export?format=xlsx\|pdf` | `reports.export.excel` (xlsx) / `reports.export.pdf` (pdf) | Exports scoped dashboard report in Excel or PDF with separate format-level permission enforcement |

## 3. Common Query Parameters
- `period`: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_quarter`, `this_year`, `custom`
- `start_date`, `end_date` (`YYYY-MM-DD` when `period=custom`)
- `department_id`, `employee_id`, `operation_id`, `product_id`, `production_order_id`, `shift_id`, `workstation`, `quality_status`
- `page`, `limit`, `reward_category`
