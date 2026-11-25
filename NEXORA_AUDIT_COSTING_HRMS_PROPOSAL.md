# NEXORA ERP — Complete Technical Code Audit, Running Project Cost Analysis, Reporting Suite Estimate, Indian HRMS Specification & Commercial Proposal

**Document Reference:** `NEXORA-AUDIT-HRMS-2026-11-20`  
**Prepared Date:** November 20, 2026  
**Audit Mode:** Strictly Read-Only Source Inspection (Zero production files modified)  
**Currency:** Indian Rupee (`₹` / INR) | **Tax Treatment:** 18% GST (SAC 998314) shown separately on all commercial quotations  
**Primary Operating Jurisdiction:** Uttar Pradesh (Jewar) — with All-India Multi-State Statutory Engine  

---

## Deliverable Package Index

This master document consolidates the complete analysis and pairs with a **19-sheet formula-driven Excel financial model (851 live Excel formulas)** and **8 standalone client-ready PDF documents**—all mathematically synchronized to a single source of truth:

| Deliverable | File Path | Format | Audience |
| :--- | :--- | :--- | :--- |
| **Master Consolidated Report** | `/NEXORA_AUDIT_COSTING_HRMS_PROPOSAL.md` | Markdown | Executive / Engineering / Client |
| **19-Sheet Dynamic Financial Model** | `/docs/audit_proposal/Nexora_Audit_Costing_HRMS_Workbook.xlsx` | Excel (`.xlsx`, 851 formulas) | Finance / Management / Pricing |
| **PDF 01 — Technical Audit Report** | `/docs/audit_proposal/pdf/01_Complete_Software_Technical_Audit_Report.pdf` | PDF | CTO / Engineering / Audit |
| **PDF 02 — Reporting Development Proposal** | `/docs/audit_proposal/pdf/02_Existing_Reporting_Development_Proposal.pdf` | PDF | Operations / Management |
| **PDF 03 — Running Project Cost Analysis** | `/docs/audit_proposal/pdf/03_Running_Project_Cost_Analysis.pdf` | PDF | Internal Finance / Leadership |
| **PDF 04 — HRMS Functional Requirements (FRD)** | `/docs/audit_proposal/pdf/04_HRMS_Functional_Requirement_Document.pdf` | PDF | HR / Operations / Client |
| **PDF 05 — HRMS Technical Scope** | `/docs/audit_proposal/pdf/05_HRMS_Technical_Scope.pdf` | PDF | Engineering / Security |
| **PDF 06 — Indian Statutory Compliance Checklist** | `/docs/audit_proposal/pdf/06_HRMS_Indian_Statutory_Compliance_Checklist.pdf` | PDF | HR / CA / Labour Compliance |
| **PDF 07 — Detailed Man-Hour Estimation** | `/docs/audit_proposal/pdf/07_Detailed_Man_Hour_Estimation.pdf` | PDF | PMO / Delivery / Commercial |
| **PDF 08 — Complete Commercial Proposal** | `/docs/audit_proposal/pdf/08_Complete_Commercial_Proposal.pdf` | PDF | Client Decision-Makers |

> **Dynamic Recalculation Note:** In `Nexora_Audit_Costing_HRMS_Workbook.xlsx`, updating any hourly billing rate (`Executive Summary!B6:B9`), GST percentage (`B10`), Option C buffer (`B11`), historical actuals (`Running Project Historical Cost!C5:C17`), monthly OpEx (`Monthly Operating Expenses!C5:C14`), or statutory ceilings (`PF and ESI Calculations!B5:B13`) automatically recalculates all module costs, pricing options, statutory examples, and profitability metrics.

---

## Executive Summary

A comprehensive read-only inspection of the Nexora ERP codebase (~44,080 LOC, 153 active REST/SSE endpoints, 22 PostgreSQL DDL tables, and 26 JSON-store entities) confirms that Nexora has strong core foundations across User Management, RBAC, Dynamic Company Branding, Inventory Operations, Warehouse Management, Suppliers, and Live Performance Tracking. However, the audit uncovered **2 CRITICAL security vulnerabilities** (unauthenticated `/api/performance` routes and direct SQL injection), **4 HIGH-severity defects** (20 endpoints omitting RBAC checks, a blank `/inventory/reports` tab, a department-filter accuracy bug in Performance reports/exports, and dual JSON/PostgreSQL persistence with backup gaps), and **4 MEDIUM defects** (all-time counters mislabeled as "recent", hardcoded fallback secrets, TypeScript lint failures from legacy directories, and an unbuilt `/reports` hub with zero PDF generation).

To harden the existing platform, complete full enterprise reporting and running project cost controls, and launch a **100% database-driven, Indian statutory-compliant HRMS & Payroll platform** (aligned with India's Four Labour Codes effective November 21, 2025, Central Rules May 2026, EPFO's ₹25,000 wage ceiling effective September 17, 2026, ESIC, Income Tax FY 2025–26/2026–27, and multi-state PT/LWF rules), we recommend **Option B (Standard Full Scope — 20 Modules)**:

| Commercial Option | Modules & Scope | Realistic Timeline | Total Hours | Quote Excl. GST | GST (18%) | Total Incl. GST |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: |
| **Option A — Basic Essential Launch** | 12 Essential Modules (Security, Inv/Perf Reports, Core HRMS, EPFO+ESIC, PG Cutover) | 29 Weeks (~6.8 Mo) | 1,308 hrs | ₹18,57,100 | ₹3,34,278 | **₹21,91,378** |
| **Option B — Standard Full Scope *(Recommended)*** | **20 Complete Modules** (Audit Hardening, All Reporting, Project Costing, All 9 HRMS Core + All 4 Statutory Engines + PG Unification) | **44 Weeks (~10.5 Mo)** | **1,964 hrs** | **₹27,96,800** | **₹5,03,424** | **₹33,00,224** |
| **Option C — Premium Turnkey** | 24 Modules (Option B + 4 Enterprise Add-ons [₹4,52,400] + 10% Fixed-Price Contingency [₹3,24,920]) | 52 Weeks (~12.2 Mo) | 2,290 hrs | ₹35,74,120 | ₹6,43,342 | **₹42,17,462** |
| **Optional Annual Maintenance (MNT-01)** | 12 Months Post-Go-Live SLA, Statutory Rate Updates, Patching & Backup Audits (₹31,600/mo Excl. GST) | 12 Months | 288 hrs | ₹3,79,200 | ₹68,256 | **₹4,47,456** |

---

## Phase 1–3: Existing Application Technical & Security Audit

### 1.1 Verified Active Technology Stack & Footprint
- **Frontend SPA:** React 19, TypeScript 5.7, Vite 8, Tailwind CSS 4, `lucide-react`, `motion`, SheetJS (`xlsx` 0.18.5).
- **Backend Server:** Express 4.21 executed via `tsx server.ts` on Port 3000 (`server.ts`: 5,529 LOC; `server/performanceRoutes.ts`: 1,210 LOC).
- **Active API Surface:** **153 active REST/SSE endpoints** (141 in `server.ts` + 12 in `server/performanceRoutes.ts`; `server/reorderRoutes.ts` has 0 active mounted routes).
- **Authentication & Email:** Centralized JWT (`jsonwebtoken`) + `bcryptjs` (12 rounds) in `server/authService.ts`; SMTP delivery via `nodemailer`.
- **Persistence Architecture (Dual Store):**
  - Core ERP, RBAC, Settings, Audit Trail, Inventory, Warehouses & Suppliers persist in a single flat JSON file (`database/nexora_store.json`) managed by `server/store.ts` (5,338 LOC, **26 entity interfaces**).
  - Employee Performance & Live Hardware Monitoring persist in PostgreSQL (`pg` 8.13, `server/db.ts`, **22 DDL tables**) with a volatile in-memory fallback (`inMemoryPerfEmployees` / `inMemoryPerfEvents`) if PostgreSQL is unreachable.
- **Dead / Legacy Code Footprint:** Unused Python FastAPI folder (`Backend/`), duplicate `src/frontend/` & `src/server/` directories, `*-1.*` backup files, `InvoicesPage.tsx`, and unmounted `server/reorderRoutes.ts`. Because `tsconfig.json` includes `src`, running `npm run lint` (`tsc --noEmit`) currently fails with exit code 2.

### 1.2 Source-Verified Existing Module Inventory (MOD-01 to MOD-14)

| ID | Module Name | Primary Route(s) | Persistence | Status | RBAC / Audit Health |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MOD-01** | Executive Dashboard | `/dashboard` | JSON + PG summary | 85% Complete | Good (JWT); lacks PDF export |
| **MOD-02** | Authentication & Active Sessions | `/login`, `/reset-password`, `/sessions` | JSON Store | 90% Complete | Medium (`authService.ts:37` fallback secret) |
| **MOD-03** | User Management & Profiles | `/administration/users`, `/profile` | JSON + `uploads/` | 92% Complete | Good (Avatars & dynamic name fields fixed) |
| **MOD-04** | Roles & Permissions (RBAC) | `/administration/roles` | JSON Store | 90% Complete | Medium (Engine sound, omitted on 20+ routes) |
| **MOD-05** | Departments & Company Branding | `/administration/departments`, `/settings` | JSON Store | 90% Complete | Good (Branding & SMTP active) |
| **MOD-06** | Audit Trail & Backups | `/administration/audit-trail`, `/backups` | JSON Store only | 75% Complete | **High Risk** (Backups exclude PostgreSQL!) |
| **MOD-07** | Inventory Core (Items & Categories) | `/inventory`, `/inventory/items` | JSON Store | 88% Complete | Medium (`InventoryPage.tsx` 3.7k LOC monolith) |
| **MOD-08** | Stock Operations (Receive/Issue/Adj/Xfer) | `/inventory/stock-operations` | JSON Store | 88% Complete | Good |
| **MOD-09** | Inventory Reports & Valuation | `/inventory/reports` | JSON Store | **15% BROKEN** | **CRITICAL GAP** (Blank screen — no render branch) |
| **MOD-10** | Warehouse Management | `/warehouses` | JSON Store | 85% Complete | **High Risk** (18 routes missing RBAC) |
| **MOD-11** | Suppliers, Reorders & Goods Receipt | `/suppliers`, `/purchase-requests`, `/goods-receipt` | JSON Store | 85% Complete | **High Risk** (GRN & conversations missing RBAC) |
| **MOD-12** | Employee Performance & Live Monitor | `/performance`, `/performance/live` | PG + Memory | 70% At Risk | **CRITICAL** (No Auth/RBAC + SQLi + Dept Bug) |
| **MOD-13** | Unified Reports & Analytics Hub | `/reports` | None | **0% Placeholder** | Renders `PlannedModulePage` (`src/App.tsx:243-258`) |
| **MOD-14** | HRMS & Indian Statutory Payroll | `/hrms` | PostgreSQL (New) | **0% New Scope** | Full 13-module build scoped in Parts C1 & C2 |

### 1.3 Verified Technical & Security Audit Findings (AUD-01 to AUD-10)

| Finding ID | Severity | Exact File & Line Reference | Observed Technical Defect | Business / Security Impact | Remediation Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | **CRITICAL** | `server.ts:63`; `server/performanceRoutes.ts` | `app.use('/api/performance', performanceRouter)` is mounted BEFORE `authenticateToken` is defined; 11 of 12 routes enforce zero JWT auth or RBAC. | Any unauthenticated caller can read/modify/delete employee roster, trigger simulations, and download full CSV performance data. | **RPT-01** (Wk 1–3) |
| **AUD-02** | **CRITICAL** | `server/performanceRoutes.ts:866-883, 1160-1168` | Query params `start_date`, `end_date`, and `emp_id` are interpolated directly into PostgreSQL SQL strings via template literals. | Remote SQL injection allowing database exfiltration or corruption. | **RPT-01** (Wk 1–3) |
| **AUD-03** | **HIGH** | `server.ts:5117-5429, 5430, 5460` | All 18 `/api/warehouses/*` routes, `/api/inventory/reorders/:id/goods-receipt`, and `/api/suppliers/conversations` check JWT only and omit `requirePermission()`. | Low-privilege logged-in users can create/delete warehouses, receive stock, or view supplier negotiations. | **RPT-01** (Wk 1–3) |
| **AUD-04** | **HIGH** | `frontend/pages/InventoryPage.tsx:179-183, 895-2240` | Sidebar menu `id: 78` ("Reports & Valuation") routes to `/inventory/reports` setting `activeTab = 'reports'`, but no render branch handles `activeTab === 'reports'`. | Clicking "Reports & Valuation" displays an empty blank page. | **RPT-02** (Wk 4–7) |
| **AUD-05** | **HIGH** | `server/performanceRoutes.ts:893-954, 1139-1186` | `department` filter applies only to `rosterQuery`, NOT to `statsQuery`, `prevRes`, `trendQuery`, `hourlyDistribution`, or CSV export. | Department-filtered views display company-wide KPI totals and export all departments' records. | **RPT-03** (Wk 4–7) |
| **AUD-06** | **MEDIUM** | `server/store.ts:4818-4821` | `getInventoryDashboard()` computes `recent_receipts_count`, `recent_issues_count`, `recent_adjustments_count`, `recent_transfers_count` over ALL-TIME records. | Dashboard mislabels lifetime cumulative counts as "recent" operational activity. | **RPT-02** (Wk 4–7) |
| **AUD-07** | **HIGH** | `server/store.ts` vs `server/db.ts` | Core ERP writes single `nexora_store.json`; Performance uses PostgreSQL with volatile memory fallback; Database Backups archive JSON store only. | Concurrent JSON write corruption risk, silent data loss on fallback restart, and incomplete disaster recovery. | **DEP-01** (Wk 43–44) |
| **AUD-08** | **MEDIUM** | `server/authService.ts:37`; `server/db.ts:5` | Hardcoded fallback JWT secret and fallback `DATABASE_URL` with credentials remain if environment variables are missing. | Misconfigured production environments run silently with predictable secrets instead of failing fast. | **RPT-01** (Wk 1–3) |
| **AUD-09** | **MEDIUM** | `tsconfig.json`; `Backend/`; `src/frontend/`; `src/server/` | Monolithic files (`server.ts` 5.5k LOC, `InventoryPage.tsx` 3.7k LOC) plus legacy Python/TS directories cause `npm run lint` (`tsc --noEmit`) to exit with code 2. | Blocks CI/CD type-safety gates and creates maintenance hazards. | **RPT-01** (Wk 1–3) |
| **AUD-10** | **MEDIUM** | `src/App.tsx:243-258` | `/reports` (Module 10) renders `PlannedModulePage` placeholder; zero branded PDF generation exists anywhere in the application. | Management cannot export branded PDF valuation packs, audit reports, or payslips. | **RPT-04 / RPT-05** |

---

## Phase 4: Part A — Remediation & Reporting Suite Proposal (RPT-01 to RPT-05)

| Code | Deliverable | Key Capabilities & Export Formats | Dev | QA | Coord | Sales | Total Hrs | Cost Excl. GST |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **RPT-01** | Security, SQLi, RBAC & Lint Remediation | Protect `/api/performance` & 20 RBAC-missing endpoints, parameterize SQL, remove fallback secrets, clean `tsconfig` & lint. | 58 | 28 | 8 | 4 | 98 | ₹1,38,800 |
| **RPT-02** | Inventory Reports & Valuation Tab | Build `/inventory/reports`: Weighted Avg/FIFO valuation, ageing (0–30/31–60/90+), dead stock, reorder variance, rolling 7d/30d KPIs (PDF/XLSX/CSV). | 44 | 20 | 7 | 3 | 74 | ₹1,04,900 |
| **RPT-03** | Performance Analytics & Dept-Filter Fix | Fix department filter across all KPIs/trends/exports, shift & employee scorecards, anomaly log, branded PDF/XLSX export. | 40 | 19 | 7 | 3 | 69 | ₹96,800 |
| **RPT-04** | Unified Reporting & Analytics Hub | Replace `/reports` placeholder with cross-module report catalog (Inventory, Procurement, Warehouses, Users, Performance), saved views & PDF engine. | 46 | 19 | 8 | 3 | 76 | ₹1,08,400 |
| **RPT-05** | Scheduled Reports & Audit Exports | Cron-based daily/weekly SMTP email report delivery, tamper-evident Audit Trail PDF/XLSX packs, executive board summary. | 22 | 12 | 4 | 1 | 39 | ₹54,300 |
| **SUBTOTAL** | **Part A — Remediation & Reporting** | **5 Modules** | **210** | **98** | **34** | **14** | **356** | **₹5,03,200** |

---

## Phase 5: Part B — Running Project Cost Analysis & Costing Module (COST-01)

### 5.1 Historical Project Investment Ledger (Strict Non-Invention Disclosure)
> **Audit Integrity Rule:** Historical invoices, payroll records, and past hosting bills do not exist in the codebase. **Zero historical expenses have been invented.** All 13 historical cost lines (`HIST-01` through `HIST-13`) on Sheet 5 (`Running Project Historical Cost`) of the Excel workbook are explicitly set to **`₹0 (PENDING INPUT)`**. Once Finance populates verified actuals, cumulative ROI and net profitability recalculate automatically.

- **Pending Categories:** `HIST-01` Core Platform Dev | `HIST-02` Inventory/Warehouse/Suppliers Dev | `HIST-03` Performance/Hardware Dev | `HIST-04` Historical QA | `HIST-05` Historical PM/Discovery | `HIST-06` Cloud/VPS Hosting To Date | `HIST-07` Domain/SSL | `HIST-08` SMTP/Email Gateway | `HIST-09` Software Licenses | `HIST-10` Hardware Amortization | `HIST-11` External Advisors | `HIST-12` Sales/Demo Travel | `HIST-13` Allocated Admin Overheads.

### 5.2 Benchmark Monthly Recurring Operating Expenses (100–500 Active Users)

| OpEx ID | Operating Expense Category | Monthly (INR) | Annual (INR) | Default Payer |
| :--- | :--- | ---: | ---: | :--- |
| **OPEX-01** | Production Application Server (4 vCPU / 8GB Managed Cloud) | ₹12,000 | ₹1,44,000 | Client (Pass-through) |
| **OPEX-02** | Managed PostgreSQL Database + Daily Automated Backups | ₹10,000 | ₹1,20,000 | Client (Pass-through) |
| **OPEX-03** | Staging / UAT Environment (App + DB) | ₹5,000 | ₹60,000 | Vendor / Shared |
| **OPEX-04** | Encrypted Object Storage (Payslips, KYC Docs, Avatars) | ₹2,500 | ₹30,000 | Client (Pass-through) |
| **OPEX-05** | Transactional Email / SMTP Gateway | ₹2,500 | ₹30,000 | Client (Pass-through) |
| **OPEX-06** | SSL, Domain, Cloudflare WAF & DDoS Protection | ₹3,000 | ₹36,000 | Client (Pass-through) |
| **OPEX-07** | Monitoring, Error Tracking & Uptime Alerts | ₹4,000 | ₹48,000 | Vendor (SLA Ops) |
| **OPEX-08** | CI/CD, Git Repository & Security Scanning | ₹4,000 | ₹48,000 | Vendor Overhead |
| **OPEX-09** | Optional SMS / WhatsApp Notification Credits | ₹5,000 | ₹60,000 | Client Direct |
| **OPEX-10** | Allocated Office, Broadband & Admin Overhead | ₹12,000 | ₹1,44,000 | Vendor Overhead |
| **TOTAL** | **Benchmark Recurring OpEx Stack (Editable Sheet 6)** | **₹60,000** | **₹7,20,000** | **65% Client / 35% Vendor** |

### 5.3 Running Project Cost & Profitability Module (`COST-01`)
- **Scope:** In-app Running Project Cost Ledger, Expense Voucher Tracking, Monthly OpEx Budget vs. Actuals, Department/Project Margin Dashboard, and PDF/XLSX Financial Pack.
- **Estimate:** Dev **64h** | QA **26h** | Coord **10h** | Sales **6h** (Total **106 hrs**) = **₹1,50,800** Excl. GST (**₹1,77,944** Incl. 18% GST).

---

## Phase 6–7: Part C — New Indian HRMS & Statutory Payroll Architecture (13 Modules)

### 6.1 Native Nexora ERP Integration & Unified PostgreSQL Schema
All 13 HRMS & Statutory modules will be built directly inside Nexora on **PostgreSQL (28 normalized, effective-dated tables)**—reusing existing JWT Authentication, RBAC Roles, Departments, Company Branding, SMTP Email, Audit Trail, Hardware Punch Ingestion (`/api/performance/events/hardware`), and Inventory Asset Clearance for exits:

- **Employee & Org (5 tables):** `hrms_branches` (with mandatory `branch_state`), `hrms_employees`, `hrms_employee_kyc` (encrypted PAN, masked Aadhaar last-4, UAN, ESIC IP), `hrms_employee_bank`, `hrms_employee_docs`.
- **Attendance & Shifts (5 tables):** `hrms_shifts`, `hrms_shift_rosters`, `hrms_attendance_punches`, `hrms_attendance_daily`, `hrms_overtime_logs` (2x statutory rule).
- **Leave Management (5 tables):** `hrms_leave_types`, `hrms_leave_policies`, `hrms_leave_balances`, `hrms_leave_requests`, `hrms_holidays`.
- **Salary & Payroll (6 tables):** `hrms_pay_components`, `hrms_salary_structures`, `hrms_salary_revisions`, `hrms_payroll_runs` (Draft → Reviewed → Approved → Locked), `hrms_payroll_items`, `hrms_loans_advances`.
- **Effective-Dated Statutory Engine (6 tables):** `stat_rule_versions`, `stat_epfo_configs`, `stat_esic_configs`, `stat_tax_slabs`, `stat_pt_slabs`, `stat_lwf_configs` — **zero hardcoded rates or thresholds anywhere in code**.
- **Lifecycle & Filings (5 tables):** `hrms_job_requisitions`, `hrms_candidates`, `hrms_appraisals`, `hrms_exit_settlements`, `hrms_statutory_filings`.

### 6.2 Payroll Component Governance (Statutory vs. Company Policy)
- **Core Statutory "Wages" (`Basic + DA + Retaining Allowance`):** Validated automatically against the **Code on Wages 50% Rule**—if excluded allowances exceed 50% of total remuneration, the excess is added back to the Statutory Wages base for PF/Gratuity/Bonus calculations.
- **House Rent Allowance (HRA):** Explicitly modeled as a **configurable company-policy salary component**—NOT a universal statutory mandate. Tax exemption under Section 10(13A) applies only under the **Old Income Tax Regime** upon verified rent proofs.
- **Group Mediclaim vs. ESIC:** Strictly separated so optional corporate medical insurance never overlaps with or alters statutory ESIC eligibility, caps, or portal returns.
- **Row-Level ESS Security:** Employee Self-Service routes enforce `req.user.employee_id === record.employee_id` server-side, ensuring strict confidentiality of payslips, tax declarations, and Form 16 PDFs.

---

## Phase 8: Indian Statutory Compliance Matrix (Verified as of November 20, 2026)

> **Professional Compliance Disclaimer:** All rules below were verified against official Government of India sources as of **November 20, 2026** and architected as editable effective-dated database records. Final statutory filing sign-off and branch-state applicability **must be confirmed by the client's Chartered Accountant (CA) and Labour Law Consultant** prior to live government filings.

| Law / Statutory Code | Applicability | Verified Rules & Rates (Nov 20, 2026) | System Output & Due Date | Official Source & Verification Flag |
| :--- | :--- | :--- | :--- | :--- |
| **Four Labour Codes (Wages, SS, IR, OSHWC)** | Universal / Est. threshold | **Enforced Nov 21, 2025; Final Central Rules notified May 8–9, 2026.** Uniform 50% "Wages" rule; monthly wages by 7th; F&F within 2 working days; digital appointment letters; 2x OT. | 50% Wage Validator, Wage Register, Wage Slip PDF, Muster Roll, OT Register | Ministry of Labour & Employment / PIB — *Verify State Rules per Branch* |
| **EPFO (PF / EPS / EDLI / Admin)** | ≥20 employees (mandatory) | **Gazette S.O. 5109(E) effective Sept 17, 2026 raised statutory wage ceiling from ₹15,000 to ₹25,000/month.** Emp **12%** (max ₹3,000); Er **8.33% EPS** (max ₹2,083) + **3.67% EPF** (max ₹917) + **0.50% EDLI** (max ₹125) + **0.50% Admin** (max ₹125). Supports capped & actual-wage opt-in. | Unified Portal ECR `#~#` text file + Challan Summary (Due 15th) | EPFO / Gazette S.O. 5109(E) — *Active & Verified Nov 2026* |
| **ESIC** | ≥10 employees in ESIC-notified areas | Wage ceiling **₹21,000/month** (**₹25,000** for Persons with Benchmark Disabilities). Emp **0.75%** + Er **3.25%** (Total 4.00%). Contribution period lock (Apr–Sep / Oct–Mar). Strictly separate from Group Mediclaim. | ESIC Monthly Contribution Upload Excel + IP Pack (Due 15th) | ESIC / Code on Social Security 2020 — *Verify Notified Area per Branch* |
| **Gratuity (CSS 2020 Sec 53)** | ≥10 employees | `(15/26) × Last Drawn Wages × Completed Years`. Permanent employees ≥5 yrs continuous service; **Fixed-Term Employees (FTEs) eligible pro-rata after 1 year**. | Monthly Provision Ledger + F&F Gratuity Calculator (Within 30 days) | Code on Social Security, 2020 Sec 53 — *Confirm Actuarial Valuation w/ CA* |
| **Statutory Bonus (Code on Wages Ch. IV)** | ≥20 employees; ≥30 days worked | Min **8.33%** to Max **20%** on DB-configured statutory bonus wage ceiling. | Annual Bonus Register (Within 8 mo of FY close) | Code on Wages, 2019 — *Confirm State-Notified Ceiling* |
| **Maternity Benefit** | ≥10 employees; ≥80 days in 12 mo | **26 weeks** paid leave (first 2 children), 12 weeks (3rd+); crèche facility for ≥50 employees. | Maternity Leave Tracker & Paid Continuity | Code on Social Security, 2020 Ch. VI — *Verified* |
| **Income Tax TDS (FY 2025–26 & FY 2026–27)** | All salaried employers | **New Regime (Default):** `0–4L: 0%`, `4–8L: 5%`, `8–12L: 10%`, `12–16L: 15%`, `16–20L: 20%`, `20–24L: 25%`, `>24L: 30%`; **₹75,000 Standard Deduction**; **Sec 87A rebate up to ₹60,000** for taxable income ≤₹12,00,000 (effective ₹12.75L tax-free for salaried) + 4% Health & Education Cess. **Old Regime** opt-in (HRA 10(13A), 80C/80D) retained. | Monthly TDS Working, Form 16 Part B PDF & Form 24Q Data (7th / Quarterly) | CBDT / Finance Act 2025 & 2026 — *Review Annually Post Union Budget* |
| **Professional Tax (PT) & Labour Welfare Fund (LWF)** | Evaluated by employee's **physical work-branch state** | **Uttar Pradesh (Jewar) = ₹0 (Nil) for both PT and LWF.** Multi-state configurable slab/cycle engine included for MH, KA, HR, DL, GJ, TN, KL, AP, TS, WB, etc. | State-Wise PT & LWF Challan Statements (State Cycle) | Respective State Commercial Tax & LWF Acts — *Verify on New Branch* |

### 8.1 Illustrative Monthly EPFO & ESIC Calculations (New ₹25,000 PF Ceiling, UP Branch: PT/LWF Nil)

| Employee Profile | Monthly Gross | Basic+DA (50%) | PF Base (Capped) | Emp PF (12%) | Er EPS (8.33%) | Er EPF (3.67%) | EDLI (0.5%) | Admin (0.5%) | Emp ESI (0.75%) | Er ESI (3.25%) | Total Statutory |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Entry Operator (ESI + PF) | ₹15,000 | ₹7,500 | ₹7,500 | ₹900 | ₹625 | ₹275 | ₹38 | ₹38 | ₹113 | ₹488 | **₹2,477** |
| Warehouse Exec (ESI Boundary) | ₹21,000 | ₹10,500 | ₹10,500 | ₹1,260 | ₹875 | ₹385 | ₹53 | ₹53 | ₹158 | ₹683 | **₹3,467** |
| Supervisor (No ESI, New PF) | ₹25,000 | ₹12,500 | ₹12,500 | ₹1,500 | ₹1,041 | ₹459 | ₹63 | ₹63 | ₹0 | ₹0 | **₹3,126** |
| Senior Exec (Hits ₹25K Cap) | ₹50,000 | ₹25,000 | ₹25,000 | ₹3,000 | ₹2,083 | ₹917 | ₹125 | ₹125 | ₹0 | ₹0 | **₹6,250** |
| Dept Manager (Capped ₹25K) | ₹85,000 | ₹42,500 | ₹25,000 | ₹3,000 | ₹2,083 | ₹917 | ₹125 | ₹125 | ₹0 | ₹0 | **₹6,250** |
| **5-Employee Sample Total** | **₹1,96,000** | **₹98,000** | **₹80,500** | **₹9,660** | **₹6,707** | **₹2,953** | **₹404** | **₹404** | **₹271** | **₹1,171** | **₹21,570** |

---

## Phase 9–10: Zero-Overlap 3-Person Team Man-Hour & Module Cost Estimation

### 9.1 Resource Roles, Rates & Anti-Double-Counting Controls
- **Resource 1 — Senior Developer / Technical Lead (`₹1,800/hr`):** Architecture, Backend APIs, Frontend UI, Statutory Calculation Engine, Migrations, and Tech Lead/PR Reviews (distinct non-overlapping column in Excel Sheet 12).
- **Resource 2 — Dual Role (Strictly Partitioned, Zero Overlap):**
  - **QA Engineer Hat (`₹900/hr`):** Test Planning, Functional, API/RBAC, Statutory Calculation Verification, Regression, Bug Retest, UAT Support & Security Testing (Excel Sheet 13).
  - **Project Coordinator Hat (`₹800/hr`):** Sprint Planning, Standups, Client Demos, UAT Coordination & Milestone Sign-offs (Excel Sheet 14).
- **Resource 3 — Sales Person (`₹700/hr`):** Commercial alignment, scope reviews, executive demos & contract handover only — **zero Developer or QA hours**.

### 9.2 Complete Module-Wise Man-Hour & Cost Schedule (Option B — 20 Modules)

| Code | Module Name | Dev (₹1,800) | QA (₹900) | Coord (₹800) | Sales (₹700) | Realistic Total | Min (-10%) | Max (+15%) | Cost Excl. GST | Conf. | Opt A? |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |
| **RPT-01** | Critical Security, SQLi, RBAC & Lint Remediation | 58 | 28 | 8 | 4 | 98 | 88 | 113 | ₹1,38,800 | High | Yes |
| **RPT-02** | Inventory Reports & Valuation Tab (`/inventory/reports`) | 44 | 20 | 7 | 3 | 74 | 67 | 85 | ₹1,04,900 | High | Yes |
| **RPT-03** | Performance Dept-Filter Fix & Branded PDF/XLSX Export | 40 | 19 | 7 | 3 | 69 | 62 | 79 | ₹96,800 | High | Yes |
| **RPT-04** | Unified Reporting & Analytics Hub (`/reports`) | 46 | 19 | 8 | 3 | 76 | 68 | 87 | ₹1,08,400 | High | No |
| **RPT-05** | Scheduled Email Reports & Audit Trail Exports | 22 | 12 | 4 | 1 | 39 | 35 | 45 | ₹54,300 | High | No |
| **COST-01** | Running Project Cost Ledger, OpEx & Profitability | 64 | 26 | 10 | 6 | 106 | 95 | 122 | ₹1,50,800 | High | No |
| **HRMS-01** | Employee Master, Org Hierarchy & Document Vault | 78 | 32 | 10 | 4 | 124 | 112 | 143 | ₹1,80,000 | High | Yes |
| **HRMS-02** | Attendance, Shift Rosters, Biometric Sync & Overtime | 82 | 34 | 10 | 4 | 130 | 117 | 150 | ₹1,89,000 | Med | Yes |
| **HRMS-03** | Leave Management, Accrual Rules & Holiday Calendars | 56 | 24 | 8 | 3 | 91 | 82 | 105 | ₹1,30,900 | High | Yes |
| **HRMS-04** | Salary Structure & CTC Builder (50% Wage Guardrail) | 68 | 28 | 10 | 4 | 110 | 99 | 127 | ₹1,58,400 | High | Yes |
| **HRMS-05** | Monthly Payroll Engine, Arrears, Loans & Bank NEFT | 98 | 42 | 13 | 4 | 157 | 141 | 181 | ₹2,27,400 | Med | Yes |
| **HRMS-06** | Payslip PDF Generator, SMTP Dispatch & ESS Portal | 62 | 25 | 8 | 3 | 98 | 88 | 113 | ₹1,42,600 | High | Yes |
| **HRMS-07** | Recruitment ATS, Offer Letters & 1-Click Onboarding | 42 | 18 | 7 | 3 | 70 | 63 | 81 | ₹99,500 | High | No |
| **HRMS-08** | Appraisals, KRA/KPI Reviews & Exit / F&F Settlement | 54 | 23 | 8 | 3 | 88 | 79 | 101 | ₹1,26,400 | Med | No |
| **HRMS-09** | HRMS Master Reports, Salary Registers & GL Export | 44 | 18 | 6 | 2 | 70 | 63 | 81 | ₹1,01,600 | High | No |
| **STAT-01** | EPFO Engine (₹25K Ceiling, PF/EPS/EDLI & ECR) | 74 | 35 | 10 | 3 | 122 | 110 | 140 | ₹1,74,800 | Med | Yes |
| **STAT-02** | ESIC Engine (0.75%/3.25%, ₹21K/₹25K & Return) | 54 | 24 | 8 | 3 | 89 | 80 | 102 | ₹1,27,300 | High | Yes |
| **STAT-03** | Income Tax TDS (FY25–27 New/Old, Form 16 & 24Q) | 80 | 36 | 10 | 3 | 129 | 116 | 148 | ₹1,86,500 | Med | No |
| **STAT-04** | Multi-State PT/LWF (UP Nil), Gratuity, Bonus & Registers | 48 | 21 | 6 | 3 | 78 | 70 | 90 | ₹1,12,200 | Med | No |
| **DEP-01** | PostgreSQL Unification, E2E UAT, Training & Rollout | 66 | 46 | 22 | 12 | 146 | 131 | 168 | ₹1,86,200 | Med | Yes |
| **TOTAL-B** | **GRAND TOTAL — OPTION B (20 MODULES)** | **1,180** | **530** | **180** | **74** | **1,964** | **1,766** | **2,261** | **₹27,96,800** | **High** | — |

### 9.3 Option C Premium Add-Ons & Optional Annual Maintenance Retainer

| Code | Scope Description | Dev | QA | Coord | Sales | Total Hrs | Cost Excl. GST |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **PRM-01** | Mobile-First ESS PWA, Geo-Fenced Punch-In & WhatsApp/SMS Alerts | 68 | 35 | 13 | 5 | 121 | ₹1,67,800 |
| **PRM-02** | Automated Tally / Zoho Books Payroll & Inventory GL Connector | 52 | 25 | 10 | 3 | 90 | ₹1,26,200 |
| **PRM-03** | Multi-Branch / Multi-Entity Consolidated BI & Board Pack | 46 | 21 | 9 | 3 | 79 | ₹1,11,000 |
| **PRM-04** | Zero-Downtime HA Setup, Automated PG Backups & DR Drills | 18 | 9 | 6 | 3 | 36 | ₹47,400 |
| **PRM-SUB** | **Subtotal — 4 Option C Add-Ons** *(+10% Buffer applied on Option C)* | **184** | **90** | **38** | **14** | **326** | **₹4,52,400** |
| **MNT-01** | **Optional Annual Maintenance Retainer (12 Months SLA — Separate)** | **144** | **72** | **48** | **24** | **288** | **₹3,79,200** |

---

## Phase 11: 10-Phase Realistic Delivery Timeline (44 Weeks / ~10.5 Months)

Calibrated honestly to **1 Senior Developer** (~27 sustained productive build hours/week after code reviews, UAT support, Indian public holidays, and buffer):

| Phase | Phase Title | Modules | Timeline | Dev | QA | Coord | Sales | Payment Milestone |
| :--- | :--- | :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| **Phase 1** | Discovery, Freeze, Security & SQLi Hardening | `RPT-01` | Wks 1–3 (3w) | 58 | 28 | 8 | 4 | **M1: 15% Advance on Kickoff** |
| **Phase 2** | Inventory & Performance Reporting Remediation | `RPT-02, RPT-03` | Wks 4–7 (4w) | 84 | 39 | 14 | 6 | **M2: 10% on Phase 1–2 UAT** |
| **Phase 3** | Unified `/reports` Hub & Project Cost Module | `RPT-04, RPT-05, COST-01` | Wks 8–12 (5w) | 132 | 57 | 22 | 10 | **M3: 15% on Phase 3 UAT** |
| **Phase 4** | HRMS Foundation: Employee Master & Vault | `HRMS-01` | Wks 13–16 (4w) | 78 | 32 | 10 | 4 | — |
| **Phase 5** | Attendance, Shifts, Biometric & Leave Engine | `HRMS-02, HRMS-03` | Wks 17–22 (6w) | 138 | 58 | 18 | 7 | **M4: 15% on Phase 4–5 UAT** |
| **Phase 6** | CTC Builder (50% Rule) & Monthly Payroll Run | `HRMS-04, HRMS-05` | Wks 23–28 (6w) | 166 | 70 | 23 | 8 | **M5: 15% on Payroll Dry-Run** |
| **Phase 7** | Payslips, ESS, Recruitment ATS & Appraisals/F&F | `HRMS-06, HRMS-07, HRMS-08` | Wks 29–34 (6w) | 158 | 66 | 23 | 9 | **M6: 10% on ESS/ATS UAT** |
| **Phase 8** | Indian Statutory Engine: EPFO (₹25K) & ESIC | `STAT-01, STAT-02` | Wks 35–38 (4w) | 128 | 59 | 18 | 6 | — |
| **Phase 9** | Income Tax TDS, Multi-State PT/LWF & Reports | `STAT-03, STAT-04, HRMS-09` | Wks 39–42 (4w) | 172 | 75 | 22 | 8 | **M7: 10% on Statutory UAT** |
| **Phase 10** | PG Unification, Parallel Payroll Run & Go-Live | `DEP-01` | Wks 43–44 (2w) | 66 | 46 | 22 | 12 | **M8: 10% Final Go-Live Sign-off** |
| **TOTAL** | **10 Phases Complete (Option B)** | **20 Modules** | **44 Weeks** | **1,180** | **530** | **180** | **74** | **100% Contract Value** |

---

## Phase 12–13: Commercial Milestone Schedule & Internal Profitability

### 12.1 Option B Milestone Payment Schedule (Recommended)

| Milestone | Deliverable Trigger | % | Excl. GST | GST (18%) | Total Payable |
| :--- | :--- | ---: | ---: | ---: | ---: |
| **M1** | Contract Sign-off & Discovery Scope Freeze | 15% | ₹4,19,520 | ₹75,514 | ₹4,95,034 |
| **M2** | Phase 1–2 UAT Sign-off (Security + Inv/Perf Reports) | 10% | ₹2,79,680 | ₹50,342 | ₹3,30,022 |
| **M3** | Phase 3 UAT Sign-off (`/reports` Hub + Project Costing) | 15% | ₹4,19,520 | ₹75,514 | ₹4,95,034 |
| **M4** | Phase 4–5 UAT Sign-off (Employee, Attendance, Leave) | 15% | ₹4,19,520 | ₹75,514 | ₹4,95,034 |
| **M5** | Phase 6 UAT Sign-off (CTC 50% Rule + Payroll Dry-Run) | 15% | ₹4,19,520 | ₹75,514 | ₹4,95,034 |
| **M6** | Phase 7 UAT Sign-off (Payslips, ESS, ATS, F&F) | 10% | ₹2,79,680 | ₹50,342 | ₹3,30,022 |
| **M7** | Phase 8–9 UAT Sign-off (EPFO, ESIC, TDS, PT/LWF) | 10% | ₹2,79,680 | ₹50,342 | ₹3,30,022 |
| **M8** | Phase 10 PG Cutover, Parallel Run, Training & Go-Live | 10% | ₹2,79,680 | ₹50,342 | ₹3,30,022 |
| **TOTAL** | **Option B Recommended Commercial Value** | **100%** | **₹27,96,800** | **₹5,03,424** | **₹33,00,224** |

### 13.1 Internal Project Profitability Analysis *(Management Internal View — Do Not Share with Client)*
Modeled using separate editable internal loaded hourly costs (Sheet 18: Dev ₹950/hr, QA ₹450/hr, Coord ₹450/hr, Sales ₹400/hr):

| Profitability Metric (Excl. GST) | Option B Build Only | Option B + Year 1 AMC |
| :--- | ---: | ---: |
| **Contract Revenue (Excl. GST)** | ₹27,96,800 | ₹31,76,000 |
| **Direct Internal Delivery Labor Cost** | ₹14,70,100 | ₹16,70,500 |
| **Gross Profit (Direct Contribution)** | **₹13,26,700** | **₹15,05,500** |
| **Gross Margin (%)** | **47.4%** | **47.4%** |
| **Vendor Share of OpEx (35% × ₹60,000/mo)** | ₹2,20,500 (10.5 mo) | ₹4,72,500 (22.5 mo) |
| **Historical Sunk Investment (Sheet 5)** | ₹0 *(PENDING INPUT)* | ₹0 *(PENDING INPUT)* |
| **Net Operating Profit** | **₹11,06,200 (39.6%)** | **₹10,33,000 (32.5%)** |

---

## Phase 14: Commercial Terms, Risk Register, Warranty, SLA & Exclusions

1. **Proposal Validity & Tax:** Valid 30 calendar days from November 20, 2026. All fees exclude 18% GST (SAC 998314); milestone invoices due within 15 calendar days.
2. **Warranty Period:** 30 calendar days of free bug-fix warranty post Phase 10 Production Go-Live for defects against the signed FRD.
3. **Optional Annual Maintenance SLA (`MNT-01` — ₹3,79,200/yr + GST):** Covers P1 outage response ≤4 business hours, P2 ≤1 business day, P3 ≤3 business days, Union Budget / EPFO / ESIC / State PT statutory rate updates, security patches, and quarterly backup restore drills.
4. **Change Request Policy:** Out-of-scope additions are estimated in writing and billed at standard rate cards (Dev ₹1,800/hr, QA ₹900/hr, Coord ₹800/hr, Sales ₹700/hr) only after written client PO approval.
5. **Client Exclusions & Pass-Through Costs:** Cloud VPS/managed PostgreSQL hosting, domain/SSL, SMTP relay, DLT SMS/WhatsApp credits, biometric hardware purchases/SDK licenses, and external Chartered Accountant / Labour Law statutory filing fees are borne directly by the client.
6. **Mandatory Parallel Payroll Gate:** Before switching live salary disbursement to Nexora in Phase 10, 1 complete parallel payroll cycle must reconcile to `₹0` variance against existing CA/payroll spreadsheets.
7. **Key Risks & Mitigations:**
   - **Single-Developer Bottleneck (HIGH):** Mitigated via modular architecture, automated Vitest suite, Git docs, and realistic 27-hr/wk velocity planning.
   - **State Labour Code Rollout Variations (HIGH):** Mitigated via 100% effective-dated database statutory tables + mandatory CA sign-off before live filing.
   - **JSON → PostgreSQL Cutover (HIGH):** Mitigated via idempotent migration scripts, row-count/balance checksums, and 2 staging dry runs.
   - **Live `/api/performance` Security Exposure (CRITICAL):** Mitigated by executing `RPT-01` as Priority #1 in Weeks 1–3.
