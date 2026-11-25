# NEXORA ERP — Fair Performance, Quality, Readiness & Forecast Calculation Specification

All official scores, quality rates, readiness percentages, and bottleneck forecasts are calculated deterministically on the server in `server/services/manufacturingEngine.ts`.

## 1. Fair Standard-Time Productivity (Cross-Operation Normalization)
Raw piece counts are **never** compared across different operations.

- `Standard Minutes Earned (Accepted) = Σ (Final Accepted Qty × Effective Standard Time Minutes)`
- `Available Productive Minutes = Shift Minutes − Approved Downtime Minutes`
- `Accepted Productivity % = (Standard Minutes Earned (Accepted) ÷ Available Productive Minutes) × 100`
- Effective-dated standard time history (`resolveApplicableStandardTime`) guarantees historical periods remain unchanged when standard times are updated later.

## 2. Quality Calculation (Zero Double-Counting)
- `Inspected Qty = First-Pass Accepted + Rejected + Rework`
- `First-Pass Quality % = (First-Pass Accepted ÷ Inspected Qty) × 100`
- `Final Accepted Qty = First-Pass Accepted + Accepted After Rework` (validated: `Accepted After Rework ≤ Rework Qty`)
- `Final Acceptance % = (Final Accepted Qty ÷ Inspected Qty) × 100`

## 3. Composite Score & Reward Eligibility
Configurable via `performance_scoring_policies` (default weights: Productivity 50%, Quality 35%, Consistency 15%, productivity cap 125%):
- `Final Score = (Capped Productivity × Wp) + (Effective Quality × Wq) + (Consistency % × Wc)`
- Consistency counts eligible working days meeting configured productivity & quality thresholds.

## 4. Product Readiness (Components vs Finished Toys)
- Component output is **never** counted as finished products.
- `Available Accepted Component Qty = Quality Approved Qty − Consumed in Assembly Qty`
- `Assembly-Ready Sets = min(floor(Available Accepted Component Qty ÷ Required Qty Per Unit))` across all mandatory component operations.
- `Finished Product Readiness % = (Final Approved Finished Qty ÷ Order Target Qty) × 100`.

## 5. Bottleneck-Constrained Production Forecasting (Estimate)
- Stage capacities are **never** summed or averaged.
- `Stage Daily Toy Capacity = (Net Shift Minutes ÷ Standard Time × Efficiency × Quality Yield × Assigned Employees) ÷ Required Qty Per Unit`
- `Steady-State Daily Finished Forecast = min(min(Mandatory Component Stages), Assembly Stage)`
- Existing WIP sets are factored once and capped by assembly capacity.
- When historical production/QC data is absent, the engine transparently returns `basis: 'standards_only_insufficient_history'` and `is_estimate: true`.
