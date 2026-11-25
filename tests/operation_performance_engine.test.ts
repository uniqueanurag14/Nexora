/**
 * NEXORA ERP — Operation-Based Performance, Quality, Readiness, Forecasting & Rewards
 * Automated Verification Suite covering all 11 Acceptance Criteria + Zero-Seed Migration Guard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCORING_POLICY,
  resolveApplicableStandardTime,
  calculateQualityMetrics,
  calculateFairEmployeeScore,
  calculateProductionOrderReadiness,
  calculateForecastAndBottlenecks,
} from '../server/services/manufacturingEngine';
import { NEXORA_MIGRATIONS } from '../server/migrations/migrations';

test('AC-1 & AC-2: Effective-dated standard time resolution preserves historical scores after standard time changes', () => {
  const history = [
    { operation_id: 1, product_id: 10, standard_time_minutes: 6, uom: 'pcs', effective_from: '2026-01-01', effective_to: '2026-02-28' },
    { operation_id: 1, product_id: 10, standard_time_minutes: 4, uom: 'pcs', effective_from: '2026-03-01', effective_to: null },
  ];

  const febStd = resolveApplicableStandardTime(history, 1, 10, '2026-02-15', 1);
  const marStd = resolveApplicableStandardTime(history, 1, 10, '2026-03-10', 1);
  assert.equal(febStd, 6);
  assert.equal(marStd, 4);
});

test('AC-3 & AC-4: Fair standard-time productivity comparison across different operations & multi-operation shifts', () => {
  // Employee A: simple fast operation (2 min/pc), produces 240 pcs in 480 min => 100%
  const empA = calculateFairEmployeeScore({
    employee_id: 1,
    emp_id: 'EMP-0001',
    employee_name: 'Fast Op Worker',
    department: 'Cutting',
    segments: [
      {
        operation_id: 1,
        operation_code: 'CUT',
        operation_name: 'Cutting',
        product_id: 1,
        product_name: 'Teddy Bear',
        uom: 'pcs',
        standard_time_minutes: 2,
        available_productive_minutes: 480,
        submitted_qty: 240,
        first_pass_accepted_qty: 240,
        rejected_qty: 0,
        rework_qty: 0,
        accepted_after_rework_qty: 0,
        pending_inspection_qty: 0,
      },
    ],
    daily_summaries: [{ work_date: '2026-04-01', eligible_working_day: true, productivity_pct: 100, quality_pct: 100 }],
    policy: DEFAULT_SCORING_POLICY,
    period_type: 'daily',
  });

  // Employee B: complex slow operation (12 min/pc), produces 44 pcs in 480 min => 528/480 = 110%
  const empB = calculateFairEmployeeScore({
    employee_id: 2,
    emp_id: 'EMP-0002',
    employee_name: 'Complex Stitcher',
    department: 'Stitching',
    segments: [
      {
        operation_id: 2,
        operation_code: 'STITCH',
        operation_name: 'Embroidery & Stitch',
        product_id: 1,
        product_name: 'Teddy Bear',
        uom: 'pcs',
        standard_time_minutes: 12,
        available_productive_minutes: 480,
        submitted_qty: 44,
        first_pass_accepted_qty: 44,
        rejected_qty: 0,
        rework_qty: 0,
        accepted_after_rework_qty: 0,
        pending_inspection_qty: 0,
      },
    ],
    daily_summaries: [{ work_date: '2026-04-01', eligible_working_day: true, productivity_pct: 110, quality_pct: 100 }],
    policy: DEFAULT_SCORING_POLICY,
    period_type: 'daily',
  });

  // Employee B MUST score higher than Employee A despite fewer raw pieces (44 vs 240)
  assert.equal(empA.actual_productivity_pct, 100);
  assert.equal(empB.actual_productivity_pct, 110);
  assert.ok(empB.final_score > empA.final_score);

  // Multi-operation shift: 240m on Op1 (std 6m, 40 pcs = 240 earned) + 240m on Op2 (std 3m, 90 pcs = 270 earned) => 510/480 = 106.25%
  const multiOp = calculateFairEmployeeScore({
    employee_id: 3,
    emp_id: 'EMP-0003',
    employee_name: 'Multi Op',
    department: 'Production',
    segments: [
      {
        operation_id: 1,
        operation_code: 'OP1',
        operation_name: 'Op 1',
        product_id: 1,
        product_name: 'Bear',
        uom: 'pcs',
        standard_time_minutes: 6,
        available_productive_minutes: 240,
        submitted_qty: 40,
        first_pass_accepted_qty: 40,
        rejected_qty: 0,
        rework_qty: 0,
        accepted_after_rework_qty: 0,
        pending_inspection_qty: 0,
      },
      {
        operation_id: 2,
        operation_code: 'OP2',
        operation_name: 'Op 2',
        product_id: 1,
        product_name: 'Bear',
        uom: 'pcs',
        standard_time_minutes: 3,
        available_productive_minutes: 240,
        submitted_qty: 90,
        first_pass_accepted_qty: 90,
        rejected_qty: 0,
        rework_qty: 0,
        accepted_after_rework_qty: 0,
        pending_inspection_qty: 0,
      },
    ],
    daily_summaries: [{ work_date: '2026-04-01', eligible_working_day: true, productivity_pct: 106.25, quality_pct: 100 }],
    policy: DEFAULT_SCORING_POLICY,
    period_type: 'daily',
  });
  assert.equal(multiOp.actual_productivity_pct, 106.25);
});

test('AC-5 & AC-6: Quality inspection validation prevents double-counting and rejects over-inspection', () => {
  const validQc = calculateQualityMetrics({
    submitted_qty: 100,
    inspected_qty: 100,
    first_pass_accepted_qty: 85,
    rejected_qty: 5,
    rework_qty: 10,
    accepted_after_rework_qty: 8,
  });
  assert.equal(validQc.valid, true);
  assert.equal(validQc.final_accepted_qty, 93); // 85 + 8 (never double-counts)
  assert.equal(validQc.first_pass_quality_pct, 85);
  assert.equal(validQc.final_acceptance_pct, 93);

  // Invalid: accepted_after_rework > rework_qty
  const invalidRework = calculateQualityMetrics({
    submitted_qty: 100,
    inspected_qty: 100,
    first_pass_accepted_qty: 85,
    rejected_qty: 5,
    rework_qty: 10,
    accepted_after_rework_qty: 12,
  });
  assert.equal(invalidRework.valid, false);

  // Invalid: inspected > submitted
  const overInspected = calculateQualityMetrics({
    submitted_qty: 50,
    inspected_qty: 60,
    first_pass_accepted_qty: 60,
    rejected_qty: 0,
    rework_qty: 0,
    accepted_after_rework_qty: 0,
  });
  assert.equal(overInspected.valid, false);
});

test('AC-7 & AC-8: Group product readiness distinguishes component sets from finished approved toys', () => {
  const readiness = calculateProductionOrderReadiness({
    production_order_id: 1,
    order_number: 'ORD-100',
    product_id: 1,
    product_name: 'Soft Bunny',
    target_qty: 100,
    requirements: [
      { operation_id: 1, operation_code: 'BODY', operation_name: 'Body Stitch', component_name: 'Body', required_qty_per_unit: 1, standard_time_minutes: 5, sequence_order: 1, is_mandatory: true, is_assembly_stage: false },
      { operation_id: 2, operation_code: 'EAR', operation_name: 'Ear Stitch', component_name: 'Ear', required_qty_per_unit: 2, standard_time_minutes: 3, sequence_order: 2, is_mandatory: true, is_assembly_stage: false },
    ],
    wip_by_operation: new Map([
      [1, { operation_id: 1, completed_qty: 100, quality_approved_qty: 100, pending_inspection_qty: 0, rejected_qty: 0, rework_qty: 0, transferred_qty: 100, consumed_in_assembly_qty: 0 }],
      [2, { operation_id: 2, completed_qty: 60, quality_approved_qty: 60, pending_inspection_qty: 0, rejected_qty: 0, rework_qty: 0, transferred_qty: 60, consumed_in_assembly_qty: 0 }],
    ]),
    assembled_qty: 0,
    final_approved_finished_qty: 0,
    final_rejected_qty: 0,
    rework_required_qty: 0,
  });

  // 100 bodies & 60 ears (2 per bunny) => ONLY 30 assembly-ready sets, 0 finished toys!
  assert.equal(readiness.potential_assembly_ready_qty, 30);
  assert.equal(readiness.final_approved_finished_qty, 0);
  assert.equal(readiness.finished_product_readiness_pct, 0);
  assert.equal(readiness.finished_product_status, 'Components Available');
});

test('AC-9 & AC-10: Bottleneck-constrained forecasting never sums stage capacities and flags standards-only basis honestly', () => {
  const fc = calculateForecastAndBottlenecks({
    target_qty: 300,
    already_finished_approved_qty: 0,
    working_days_per_week: 6,
    working_days_per_month: 26,
    stages: [
      {
        operation_id: 1,
        operation_code: 'CUT',
        operation_name: 'Cutting',
        component_name: 'Fabric Panel',
        required_qty_per_unit: 1,
        standard_time_minutes: 4,
        is_mandatory: true,
        is_assembly_stage: false,
        assigned_employees_count: 2, // 2 * (480/4) = 240 toys/day
        shift_available_productive_minutes: 480,
        approved_downtime_minutes_per_shift: 0,
        historical_efficiency_ratio: null,
        historical_quality_yield_ratio: null,
        available_wip_qty: 0,
        waiting_between_ops_qty: 0,
      },
      {
        operation_id: 2,
        operation_code: 'ASM',
        operation_name: 'Final Assembly',
        component_name: 'Finished Toy',
        required_qty_per_unit: 1,
        standard_time_minutes: 12,
        is_mandatory: true,
        is_assembly_stage: true,
        assigned_employees_count: 1, // 1 * (480/12) = 40 toys/day (BOTTLENECK)
        shift_available_productive_minutes: 480,
        approved_downtime_minutes_per_shift: 0,
        historical_efficiency_ratio: null,
        historical_quality_yield_ratio: null,
        available_wip_qty: 0,
        waiting_between_ops_qty: 0,
      },
    ],
  });

  assert.equal(fc.is_estimate, true);
  assert.equal(fc.basis, 'standards_only_insufficient_history');
  assert.equal(fc.expected_daily_finished_toys, 40); // Constrained by bottleneck, NOT 280 or 140
  assert.equal(fc.expected_weekly_finished_toys, 240);
  const cuttingRow = fc.stages.find((s) => s.operation_code === 'CUT')!;
  const asmRow = fc.stages.find((s) => s.operation_code === 'ASM')!;
  assert.equal(asmRow.is_bottleneck, true);
  assert.equal(cuttingRow.is_bottleneck, false);
  assert.equal(cuttingRow.expected_daily_toy_gain_with_one_employee, 0);
  assert.ok(asmRow.expected_daily_toy_gain_with_one_employee > 0);
});

test('AC-11: PostgreSQL migrations 004 and 005 contain ZERO seed/dummy INSERT statements', () => {
  const m004 = NEXORA_MIGRATIONS.find((m) => m.version === '004_operation_performance_and_production_readiness');
  const m005 = NEXORA_MIGRATIONS.find((m) => m.version === '005_dashboard_notifications_and_roster_fixes');
  assert.ok(m004, 'Migration 004 must exist');
  assert.ok(m005, 'Migration 005 must exist');

  for (const mig of [m004, m005]) {
    const joined = mig.statements.join('\n').toUpperCase();
    assert.equal(joined.includes('INSERT INTO'), false, `${mig.version} must not insert any seed or dummy data`);
  }
});
