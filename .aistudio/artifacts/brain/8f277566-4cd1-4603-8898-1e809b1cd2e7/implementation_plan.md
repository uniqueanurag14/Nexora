# Nexora — Supplier & Warehouse Management Implementation Plan

## 1. Objectives & Architectural Scope
Enhance and complete Supplier Management, Warehouse Management, and Cross-Module Integration across the existing Nexora application without modifying unrelated modules, fabricated data, or existing schemas.

- **Supplier Management**:
  - Directory: Code, Name, Contact Person, Payment Terms, Tax/GST, Status, CRUD, and transaction protection check.
  - Purchase Requests: Item, Supplier, Destination Warehouse, Quantity, Unit Price, Expected Delivery Date, Notes, and status lifecycle.
  - Supplier Approvals: Cryptographic token validation, term locking, and inventory segregation rule (supplier quote approval does not increase stock).
  - Email Conversations: Full chronological thread of dispatches, counteroffers, and revisions.
- **Warehouse Management**:
  - Dashboard: Metrics across facilities, total held valuation, total stock units, active transfers, and pending stock audits.
  - Directory: Facility Code, Name, Address, Manager Details, Facility Type, and Storage Capacity. Deletion/disabling blocked if inventory balances exist.
  - Stock Balances: Real-time, warehouse-wise view derived authoritatively from stock balances and transactions.
  - Inter-Warehouse Transfers: Multi-stage lifecycle (Request -> Approval -> Dispatch/In-Transit -> Confirm Physical Receipt). Source stock deducted on dispatch; destination stock credited only upon physical intake.
  - Physical Stock Verification: Controlled audit session with live variance calculation, discrepancy reasons, and supervisor authorization before ledger adjustments.
- **Cross-Module Integration**:
  - Goods Receipt Intake against approved Purchase Requests, incrementing destination warehouse stock and logging auditable stock transactions.

---

## 2. Completed Steps

### Phase 1: Database & Backend Store Enhancements (`server/store.ts`)
- [x] Extended `SupplierEntity` with `contact_person` and `payment_terms`.
- [x] Extended `WarehouseEntity` with `manager_name`, `manager_email`, `manager_phone`, `warehouse_type`, and `capacity`.
- [x] Added `StockTransferEntity` and `StockVerificationEntity` interfaces and persistent schemas.
- [x] Added `canDeleteWarehouse` rule verifying no inventory units exist prior to deletion or deactivation.
- [x] Implemented complete transfer workflow: `createStockTransfer`, `approveStockTransfer`, `dispatchStockTransfer` (deducts source stock), and `receiveStockTransfer` (credits destination stock only upon receipt).
- [x] Implemented physical audit verification: `createStockVerification` and `approveStockVerification` (applies adjustments only upon supervisor authorization).
- [x] Implemented cross-module `receiveGoodsForReorder` validating approved status and updating inventory via `receiveStock`.
- [x] Implemented `getEmailConversations` logging dispatches and supplier counteroffers.

### Phase 2: REST Endpoints & Routing (`server.ts`)
- [x] Registered `/api/warehouses` and `/api/warehouses/:id(\d+)` endpoints.
- [x] Registered `/api/warehouses/dashboard-stats` and `/api/warehouses/stock`.
- [x] Registered `/api/warehouses/transfers` with approval, dispatch, receive, and cancel actions.
- [x] Registered `/api/warehouses/verifications` with audit creation and supervisor approval.
- [x] Registered `/api/inventory/reorders/:id/goods-receipt` (and alias `/api/purchasing/requests/:id/receive`).
- [x] Registered `/api/suppliers/conversations`.
- [x] Constrained parameter routes with regex (`:id(\\d+)`) to prevent collision with sub-resources.

### Phase 3: Frontend API & Types (`frontend/types/index.ts`, `frontend/services/api.ts`)
- [x] Added `StockTransfer`, `StockVerification`, `WarehouseStockItem`, `WarehouseDashboardStats`, and `SupplierConversation` interfaces.
- [x] Added warehouse, transfer, verification, goods receipt, and conversation client methods to `api.ts`.

### Phase 4: Frontend UI Pages (`SuppliersPage.tsx`, `WarehouseManagementPage.tsx`, `Sidebar.tsx`, `App.tsx`)
- [x] Created `WarehouseManagementPage.tsx` with 5 functional tabs: Dashboard, Directory, Stock Balances, Transfers, and Physical Audits.
- [x] Enhanced `SuppliersPage.tsx` with 4 functional tabs: Directory, Purchase Requests, Approvals (with Goods Receipt button), and Email Conversations.
- [x] Added `Warehouse` icon to `Sidebar.tsx`.
- [x] Mapped `/warehouses*`, `/suppliers*`, `/purchasing*`, and `/goods-receipt*` routes in `src/App.tsx`.

### Phase 5: Verification & Testing
- [x] Verified TypeScript compilation (`tsc --noEmit`) passes with 0 errors.
- [x] Verified Vite build (`compile_applet`) succeeds.
- [x] Executed live integration tests verifying warehouse querying, transfer lifecycle, audit sessions, deletion protection check, and goods receipt intake.
