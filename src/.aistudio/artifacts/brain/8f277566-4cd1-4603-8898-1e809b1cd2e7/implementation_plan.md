# Nexora Inventory Management & Supplier Reordering Integration

Comprehensive architectural blueprint to complete the existing Inventory Management module (Module 6) under Nexora's active menu structure, integrating real-time PostgreSQL stock tracking, automated low-stock detection, online supplier reordering with expiring cryptographic links, counteroffer negotiations, and Excel spreadsheet import/export.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions guide this implementation based on our alignment and recommended patterns:

- **Confirmed Decision 1 (Navigation Architecture)**: Reorder Management and Supplier Negotiations will be accessible via a dedicated child item `/inventory/reorders` under the existing Inventory navigation menu, while also remaining cross-linked from the Inventory Dashboard and Low Stock Alerts.
- **Confirmed Decision 2 (Valuation Method)**: Inventory valuation reports will use the **Moving Weighted Average Cost (WAC)** calculated from physical goods receipts, with fallback to standard unit cost from item records.
- **Confirmed Decision 3 (Import Validation)**: Excel item imports will execute **strict validation** on categories and units of measure, notifying the operator of any unlisted entities rather than creating unvetted master records.
- **Confirmed Decision 4 (Zero Demo Data Safeguard)**: No demo, sample, seed, or mock records will be injected. All operations persist directly to PostgreSQL with granular audit logging.

---

## 1. Overview & Core Concept

### What It Does
Completes the existing **Inventory Management** menu in Nexora by implementing its 9 sub-pages and transactional workflows:
1. **Inventory Dashboard**: High-level real-time overview displaying total active items, low-stock alerts, out-of-stock items, stock distribution by warehouse, recent dock receipts/issues, pending reorders, and counteroffers awaiting review.
2. **Items / Products Master**: Search, filter, create, view, edit, disable, and delete items with SKU generation, barcode tracking, and safety thresholds.
3. **Categories, Units & Locations**: Complete CRUD and safe-disable workflows for inventory categories, units of measure (UOM), and multi-warehouse locations.
4. **Stock Operations**: Real-time validated transactions for **Stock Receipt** (supplier goods intake), **Stock Issue** (department/production issue), **Stock Adjustment** (physical audit discrepancy reconciliation), and **Stock Transfer** (atomic multi-warehouse balance movement).
5. **Stock Movement Ledger**: Complete auditable transaction history with reference numbers, timestamps, operators, and balance changes.
6. **Low Stock Alerts & Online Reorder Popup**: Dynamic evaluation of `Available Stock <= Minimum Stock Level` enabling the **Reorder** action, opening a prepopulated modal with supplier selection, unit pricing, total calculation, and automated SMTP dispatch.
7. **Supplier Public Response Portal (`/supplier/reorder/:token`)**: Standalone portal for suppliers to Accept, Negotiate (counteroffer price, quantity, delivery date), or Reject (mandatory reason) without Nexora admin credentials.
8. **Reorder Management & Negotiation Console**: Centralized ledger to review supplier counteroffers, accept/reject proposals, issue revisions, cancel orders, or retry emails.
9. **Reports & Valuation / Excel Import-Export**: Moving weighted average valuation summary, low-stock reports, XLSX export with formula injection sanitization, and structured XLSX/CSV batch import with template validation and duplicate policies.

### Target Audience & Persona
- **Warehouse Managers & Procurement Officers**: Track inventory balances, identify shortage risks, issue stock to departments, and dispatch purchasing requests.
- **External Suppliers**: Receive secure email notifications, review reorder proposals, and negotiate terms via a protected link.
- **System Administrators & Auditors**: Enforce RBAC permissions, audit every stock transaction, and reconcile physical inventory.

### Key Value
Eliminates stockouts and manual purchase orders by transforming low-stock alerts into a direct, authenticated supplier communication pipeline backed by an immutable PostgreSQL audit trail.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Low Stock Alert] ──> [Click Reorder] ──> [Prepopulated Modal] ──> [Dispatch SMTP Email]
                                                                          │
                                                                          ▼
[Physical Receipt] <── [Admin Accepts] <── [Supplier Negotiates] <── [72h Secure Link]
       │
       ▼
[Stock Balance Increments] ──> [Ledger Entry Recorded]
```

1. **Shortage to Reorder**:
   - Operator navigates to `/inventory/alerts` or `/inventory/items`.
   - Items with `available_stock <= min_stock_level` display an active **Reorder** button (items above threshold display a disabled state).
   - Operator clicks **Reorder**: modal pops up pre-filled with Item Code, Name, Available Stock, Minimum Threshold, Supplier list, and Unit Price.
   - Operator enters Quantity and Delivery Date, submits form.
   - Backend creates `REO-YYYY-XXXX`, generates a 72-hour SHA-256 token, and dispatches an email to the supplier.
2. **Supplier Negotiation & Acceptance**:
   - Supplier clicks the email link to open `/supplier/reorder/:token`.
   - Supplier selects **Accept** (locks terms), **Negotiate** (enters counteroffer price/qty/date), or **Reject** (enters mandatory reason).
   - **Crucial Rule**: Supplier acceptance does NOT alter inventory counts.
3. **Admin Review & Physical Receipt**:
   - Procurement manager opens `/inventory/reorders`, inspects the counteroffer history, and clicks **Accept Counteroffer**.
   - Upon delivery truck arrival, warehouse staff goes to `/inventory/operations` -> **Receive Stock**, enters reference `RCV-YYYY-XXXX`, selects the item and warehouse, and records the received quantity.
   - Physical stock increments atomically, and an immutable ledger entry is written.

### Visual Identity & Theme
- **Theme**: Enterprise Slate & Deep Indigo adhering to Nexora's design language.
- **Color Tokens**:
  - Background: Neutral slate (`bg-slate-50`, dark slate elements `bg-slate-900`)
  - Accent / Primary: Indigo & Sky (`bg-indigo-600`, `text-indigo-600`, `hover:bg-indigo-700`)
  - Status Indicators: Emerald (`#16a34a`) for nominal stock/accepted, Amber (`#d97706`) for low stock/pending negotiation, Crimson (`#dc2626`) for out-of-stock/rejected.
- **Anti-AI Slop & Zero-Pill Discipline**:
  - No static pill capsules around metadata. Statuses and timestamps render as clean, unboxed typography with dot separators (`·`).
  - Interactive filter bars use clean segmented control buttons with clear active/inactive visual states.
  - Tabular figures: Monospace numeric fonts (`font-mono`, `tabular-nums`) for SKUs, counts, prices, and timestamps to eliminate layout jitter.
- **Density**: Compact table rows ($38\text{px}$–$44\text{px}$) with right-aligned numeric metrics and left-aligned textual labels.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Navigation Routing & Existing Menu Extension
- **Chosen Approach**: Enhance `src/App.tsx` and `frontend/pages/InventoryPage.tsx` to directly bind the active route (`/inventory/dashboard`, `/inventory/items`, `/inventory/categories`, `/inventory/warehouses`, `/inventory/operations`, `/inventory/movements`, `/inventory/alerts`, `/inventory/reorders`, `/inventory/reports`, `/inventory/import-export`) to the existing sidebar hierarchy.
- **Why**: The sidebar already contains 9 child menu entries. Synchronizing the page with these existing routes ensures zero menu duplication and gives each child item a dedicated, bookmarkable view.
- **Alternatives Considered**: Keeping a single monolithic tabbed page without URL query/path synchronization was rejected because it breaks back-button navigation and sidebar active highlights.

### Decision 2: Inventory Ledger & Stock Isolation Rule
- **Chosen Approach**: All stock changes are recorded as ledger transactions in `stock_transactions`, which atomically updates `stock_balances`. Reorder acceptance is strictly an agreement of commercial terms and does not touch inventory balances until a physical `receipt` transaction is logged.
- **Why**: Enforces standard accounting and ERP compliance. Prevents ghost stock from inflating inventory before goods physically arrive at the loading dock.
- **Alternatives Considered**: Auto-incrementing stock on supplier acceptance was rejected due to strict instructions and physical audit discrepancies.

### Decision 3: Spreadsheet Formula Sanitization & Strict Validation
- **Chosen Approach**: Excel export sanitizes any cell value starting with `=`, `+`, `-`, or `@` by prefixing a single quote. Excel import enforces strict category and UOM matching, with user-selectable duplicate policy (`skip` or `update`).
- **Why**: Prevents CSV/Excel formula injection vulnerabilities while preserving master data integrity.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Nexora Frontend (React SPA)                     │
│                                                                        │
│  ┌──────────────────────────┐    ┌──────────────────────────────────┐  │
│  │   Existing Sidebar       │    │      Inventory Workspace         │  │
│  │   - Dashboard            │    │  ┌────────────────────────────┐  │  │
│  │   - Items / Products     │    │  │ Active Route View          │  │  │
│  │   - Categories & Units   ├───►│  │ (Dashboard | Items | Alerts│  │  │
│  │   - Stock Operations     │    │  │  Reorders | Reports | etc.)│  │  │
│  │   - Movement Ledger      │    │  └────────────────────────────┘  │  │
│  │   - Low Stock Alerts     │    │  ┌────────────────────────────┐  │  │
│  │   - Reorder Management   │    │  │ ReorderModal (Interactive) │  │  │
│  │   - Reports & Valuation  │    │  └────────────────────────────┘  │  │
│  └──────────────────────────┘    └──────────────────────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                             REST API Calls
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Express Backend & API Layer                         │
│                                                                        │
│  ┌─────────────────────────┐  ┌───────────────────────┐  ┌───────────┐ │
│  │ Inventory Router        │  │ Reorder & Portal      │  │ SMTP      │ │
│  │ - Items CRUD            │  │ - Reference Generator │  │ Email     │ │
│  │ - Categories / UOM      │  │ - Token Hash (SHA256) │  │ Service   │ │
│  │ - Stock Ops (Receipt /  │  │ - Negotiations        │  │ (SSL 465) │ │
│  │   Issue / Adjust / Xfer)│  │ - Public Portal API   │  │           │ │
│  │ - Movements & Reports   │  │                       │  │           │ │
│  └─────────────────────────┘  └───────────────────────┘  └───────────┘ │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                             SQL Queries / Pool
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Relational Storage                       │
│                                                                        │
│  • inventory_categories  • units_of_measure    • warehouses            │
│  • inventory_items       • stock_balances      • stock_transactions    │
│  • reorder_requests      • reorder_negotiations• suppliers             │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Entity Mapping

| Entity | Primary Key | Key Fields & Constraints | Purpose |
| :--- | :--- | :--- | :--- |
| `inventory_items` | `id` | `code` (Unique), `name`, `category_id`, `uom_id`, `min_stock_level`, `reorder_quantity`, `cost_price`, `selling_price`, `status` | Item catalog and threshold configuration |
| `stock_balances` | `id` | `item_id`, `warehouse_id`, `quantity`, `reserved_quantity`, Unique(`item_id`, `warehouse_id`) | Location-specific inventory balances |
| `stock_transactions` | `id` | `reference_no`, `item_id`, `transaction_type` (`receipt`/`issue`/`adjustment`/`transfer`), `quantity`, `user_id` | Immutable inventory movement audit ledger |
| `reorder_requests` | `id` | `reference_no` (`REO-YYYY-XXXX`), `item_id`, `supplier_id`, `token_hash` (SHA-256), `token_expiry` (72h), `status` | Supplier reorder requests and tracking |
| `reorder_negotiations` | `id` | `reorder_id`, `sender_type` (`supplier`/`admin`), `proposed_quantity`, `proposed_unit_price`, `notes` | Negotiation counteroffer history |

### Interactive Components to Implement

1. **`InventoryDashboardView`**:
   - 4 summary cards: Active Items, Low Stock Items, Out-of-Stock Items, Total Reorder Proposals.
   - Warehouse stock distribution breakdown.
   - Recent stock movement table with receipt/issue badges.
   - Quick access to reorders awaiting supplier response and counteroffers awaiting review.
2. **`InventoryItemsView`**:
   - Search by SKU/name, category filter, active/disabled filter.
   - Item details modal with warehouse balance breakdown and recent movement history.
   - Add/Edit Item modal with code auto-generation (`ITEM-YYYY-XXXX`) and initial warehouse stock option.
   - Safe disable/delete action with confirmation prompt.
3. **`InventoryCategoriesAndLocationsView`**:
   - Categories tab: CRUD for item categories.
   - Units of Measure (UOM) tab: CRUD for units and symbols (kg, pcs, ltr, etc.).
   - Warehouses tab: CRUD for storage locations.
4. **`InventoryOperationsView`**:
   - 4 operation tabs: Receive Stock, Issue Stock, Adjust Stock, Transfer Stock.
   - Real-time stock validation preventing accidental negative balances.
   - Sequential reference generation (`RCV-YYYY-XXXX`, `ISS-YYYY-XXXX`, `ADJ-YYYY-XXXX`, `TRF-YYYY-XXXX`).
5. **`InventoryMovementsView`**:
   - Filterable movement ledger by item, transaction type, warehouse, and date range.
6. **`InventoryLowStockView`**:
   - Filtered view of all items where `available_stock <= min_stock_level`.
   - Conditional **Reorder** button opening the populated `ReorderModal`.
7. **`InventoryReordersView`**:
   - Status filters: All, Pending, Negotiating, Accepted, Rejected, Cancelled.
   - Negotiation review drawer: View counteroffer terms, accept counteroffer, reject with feedback, send revision, or retry email dispatch.
8. **`InventoryReportsView`**:
   - Stock valuation calculation using Moving Weighted Average Cost.
   - Excel export of current stock balances and movement reports.
9. **`InventoryImportExportView`**:
   - Download standardized import template (.xlsx).
   - Drag-and-drop Excel upload with preview table showing valid rows, duplicate detection, and commit with duplicate policy (`skip` or `update`).

---

## 5. Verification Plan

1. **Automated Compilation & Lint**:
   - Run `npm run lint` (`tsc --noEmit`) to verify strict TypeScript compliance across all components.
   - Run `compile_applet` (`npm run build`) to ensure successful Vite bundling.
2. **End-to-End Workflow Verification**:
   - Verify navigation to each existing child route under `/inventory/*`.
   - Create an item with low minimum threshold, verify it appears in `/inventory/alerts`.
   - Click Reorder, verify modal pre-population, submit request, and verify `REO-YYYY-XXXX` generation and SMTP dispatch.
   - Open `/supplier/reorder/:token`, submit a counteroffer, verify status update to `negotiating`.
   - Review counteroffer in `/inventory/reorders`, accept it, verify stock remains unchanged (`total_on_hand: 0`).
   - Log a Goods Receipt in `/inventory/operations`, verify stock updates atomically to the received quantity.
   - Verify Excel export and import roundtrip.
