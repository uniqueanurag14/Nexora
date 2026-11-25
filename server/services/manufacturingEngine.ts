/**
 * NEXORA ERP — Operation-Based Employee Performance, Quality,
 * Group Production Readiness, Forecasting & Bottleneck Calculation Engine
 *
 * Pure, deterministic server-side mathematical engine.
 * - Zero dummy/mock/hardcoded business records.
 * - All official scores, rankings, readiness percentages, and forecasts are computed server-side.
 * - Historical accuracy preserved via effective-dated standard time resolution.
 */

export interface StandardTimeHistoryEntry {
  operation_id: number;
  product_id: number | null;
  standard_time_minutes: number;
  uom: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
}

export interface OperationWorkSegment {
  operation_id: number;
  operation_code: string;
  operation_name: string;
  product_id: number | null;
  product_name: string | null;
  uom: string;
  standard_time_minutes: number;
  available_productive_minutes: number;
  submitted_qty: number;
  first_pass_accepted_qty: number;
  rejected_qty: number;
  rework_qty: number;
  accepted_after_rework_qty: number;
  pending_inspection_qty: number;
}

export interface OperationSegmentMetrics {
  operation_id: number;
  operation_code: string;
  operation_name: string;
  product_id: number | null;
  product_name: string | null;
  uom: string;
  standard_time_minutes: number;
  available_productive_minutes: number;
  expected_output: number;
  submitted_qty: number;
  final_accepted_qty: number;
  first_pass_accepted_qty: number;
  rejected_qty: number;
  rework_qty: number;
  accepted_after_rework_qty: number;
  pending_inspection_qty: number;
  standard_minutes_earned_gross: number;
  standard_minutes_earned_accepted: number;
  gross_productivity_pct: number;
  accepted_productivity_pct: number;
  first_pass_quality_pct: number | null;
  final_acceptance_pct: number | null;
}

export interface QualityCalculationInput {
  submitted_qty: number;
  inspected_qty: number;
  first_pass_accepted_qty: number;
  rejected_qty: number;
  rework_qty: number;
  accepted_after_rework_qty: number;
  pending_inspection_qty?: number;
}

export interface QualityCalculationResult {
  valid: boolean;
  error?: string;
  submitted_qty: number;
  inspected_qty: number;
  first_pass_accepted_qty: number;
  rejected_qty: number;
  rework_qty: number;
  accepted_after_rework_qty: number;
  pending_inspection_qty: number;
  final_accepted_qty: number;
  first_pass_quality_pct: number | null;
  final_acceptance_pct: number | null;
}

export interface ScoringBand {
  label: string;
  min_score: number;
  max_score: number;
}

export interface ScoringPolicyConfig {
  policy_name: string;
  productivity_weight: number;
  quality_weight: number;
  consistency_weight: number;
  productivity_metric_mode: 'accepted_output' | 'gross_output';
  quality_metric_mode: 'first_pass' | 'final_acceptance';
  max_productivity_score_cap: number;
  consistency_min_productivity_pct: number;
  consistency_min_quality_pct: number;
  min_eligible_workdays_weekly: number;
  min_eligible_workdays_monthly: number;
  min_reward_productivity_pct: number;
  min_reward_quality_pct: number;
  hardware_debounce_seconds: number;
  scoring_bands: ScoringBand[];
}

export interface DailyDaySummary {
  work_date: string;
  eligible_working_day: boolean;
  productivity_pct: number;
  quality_pct: number | null;
}

export interface EmployeeScoreOutput {
  employee_id: number;
  emp_id: string;
  employee_name: string;
  department: string;
  segments: OperationSegmentMetrics[];
  total_available_productive_minutes: number;
  total_submitted_qty: number;
  total_final_accepted_qty: number;
  total_first_pass_accepted_qty: number;
  total_rejected_qty: number;
  total_rework_qty: number;
  total_accepted_after_rework_qty: number;
  total_pending_inspection_qty: number;
  total_expected_output: number;
  total_standard_minutes_earned_gross: number;
  total_standard_minutes_earned_accepted: number;
  gross_productivity_pct: number;
  accepted_productivity_pct: number;
  actual_productivity_pct: number;
  capped_productivity_score: number;
  first_pass_quality_pct: number | null;
  final_acceptance_pct: number | null;
  effective_quality_score: number;
  eligible_working_days: number;
  consistent_working_days: number;
  consistency_pct: number;
  final_score: number;
  scoring_band: string;
  reward_metric_used: 'accepted_output' | 'gross_output';
  quality_metric_used: 'first_pass' | 'final_acceptance';
  reward_eligible: boolean;
  eligibility_reasons: string[];
}

export interface ProductOperationRequirement {
  operation_id: number;
  operation_code: string;
  operation_name: string;
  component_name: string;
  required_qty_per_unit: number;
  standard_time_minutes: number;
  sequence_order: number;
  is_mandatory: boolean;
  is_assembly_stage: boolean;
}

export interface OperationWipSnapshot {
  operation_id: number;
  completed_qty: number;
  quality_approved_qty: number;
  pending_inspection_qty: number;
  rejected_qty: number;
  rework_qty: number;
  transferred_qty: number;
  consumed_in_assembly_qty: number;
}

export type FinishedProductStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Components Available'
  | 'Assembly Ready'
  | 'Assembly In Progress'
  | 'Awaiting Final Quality Inspection'
  | 'Finished and Quality Approved'
  | 'Rework Required';

export interface ComponentReadinessLine {
  operation_id: number;
  operation_code: string;
  operation_name: string;
  component_name: string;
  required_qty_per_unit: number;
  total_required_for_order: number;
  completed_qty: number;
  quality_approved_qty: number;
  pending_inspection_qty: number;
  rejected_qty: number;
  rework_qty: number;
  transferred_qty: number;
  consumed_in_assembly_qty: number;
  available_accepted_qty: number;
  remaining_required_qty: number;
  potential_toy_sets_available: number;
  is_mandatory: boolean;
  is_bottleneck: boolean;
}

export interface ProductionOrderReadinessOutput {
  production_order_id: number;
  order_number: string;
  product_id: number;
  product_name: string;
  target_qty: number;
  components: ComponentReadinessLine[];
  potential_assembly_ready_qty: number;
  component_readiness_pct: number;
  assembled_qty: number;
  assembly_readiness_pct: number;
  awaiting_final_inspection_qty: number;
  final_approved_finished_qty: number;
  final_rejected_qty: number;
  rework_required_qty: number;
  remaining_order_qty: number;
  finished_product_readiness_pct: number;
  finished_product_status: FinishedProductStatus;
  limiting_component_operation: string | null;
}

export interface ForecastOperationInput {
  operation_id: number;
  operation_code: string;
  operation_name: string;
  component_name: string;
  required_qty_per_unit: number;
  standard_time_minutes: number;
  is_mandatory: boolean;
  is_assembly_stage: boolean;
  assigned_employees_count: number;
  shift_available_productive_minutes: number;
  approved_downtime_minutes_per_shift: number;
  historical_efficiency_ratio: number | null; // e.g. 1.04 = 104%, null when no history
  historical_quality_yield_ratio: number | null; // e.g. 0.97 = 97%, null when no history
  available_wip_qty: number;
  waiting_between_ops_qty: number;
}

export interface BottleneckStageRow {
  operation_id: number;
  operation_code: string;
  operation_name: string;
  component_name: string;
  is_assembly_stage: boolean;
  assigned_employees: number;
  standard_time_minutes: number;
  required_qty_per_unit: number;
  required_daily_units: number;
  available_daily_units: number;
  available_daily_toy_capacity: number;
  available_wip_qty: number;
  waiting_between_ops_qty: number;
  quality_yield_pct: number;
  efficiency_pct: number;
  shortfall_units_daily: number;
  is_bottleneck: boolean;
  additional_employees_needed: number;
  expected_daily_toy_gain_with_one_employee: number;
  recommendation: string;
}

export interface ProductionForecastOutput {
  is_estimate: true;
  basis: 'historical_and_standards' | 'standards_only_insufficient_history';
  basis_note: string;
  target_qty: number;
  remaining_target_qty: number;
  working_days_per_week: number;
  working_days_per_month: number;
  expected_daily_finished_toys: number;
  expected_weekly_finished_toys: number;
  expected_monthly_finished_toys: number;
  expected_daily_assembly_capacity: number;
  expected_daily_component_supported_toys: number;
  expected_daily_quality_approved_toys: number;
  existing_wip_assembly_ready_toys: number;
  daily_shortfall_vs_target: number;
  bottleneck_operation: string | null;
  estimated_completion_days: number | null;
  estimated_completion_date: string | null;
  additional_employee_capacity_required: number;
  stages: BottleneckStageRow[];
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export const DEFAULT_SCORING_POLICY: ScoringPolicyConfig = {
  policy_name: 'Standard Manufacturing Evaluation Policy',
  productivity_weight: 60,
  quality_weight: 30,
  consistency_weight: 10,
  productivity_metric_mode: 'accepted_output',
  quality_metric_mode: 'final_acceptance',
  max_productivity_score_cap: 120,
  consistency_min_productivity_pct: 85,
  consistency_min_quality_pct: 95,
  min_eligible_workdays_weekly: 4,
  min_eligible_workdays_monthly: 15,
  min_reward_productivity_pct: 90,
  min_reward_quality_pct: 95,
  hardware_debounce_seconds: 2,
  scoring_bands: [
    { label: 'Outstanding', min_score: 100, max_score: 200 },
    { label: 'Exceeds Target', min_score: 90, max_score: 99.99 },
    { label: 'Meets Target', min_score: 80, max_score: 89.99 },
    { label: 'Needs Coaching', min_score: 65, max_score: 79.99 },
    { label: 'Below Standard', min_score: 0, max_score: 64.99 },
  ],
};

/**
 * Resolves the exact historical standard time (in minutes) effective at `eventTimestamp`.
 * Prefers a product-specific standard time entry over a general operation entry if both were active.
 */
export function resolveApplicableStandardTime(
  historyEntries: StandardTimeHistoryEntry[],
  operationId: number,
  productId: number | null,
  eventTimestamp: Date | string,
  fallbackStandardMinutes: number
): number {
  const ts = new Date(eventTimestamp).getTime();
  if (Number.isNaN(ts)) return fallbackStandardMinutes;

  const activeAtTimestamp = historyEntries.filter((entry) => {
    if (entry.operation_id !== operationId) return false;
    const fromMs = new Date(entry.effective_from).getTime();
    const toMs = entry.effective_to ? new Date(entry.effective_to).getTime() : Infinity;
    return fromMs <= ts && ts < toMs;
  });

  // 1. Prefer product-specific standard active at eventTimestamp (latest effective_from wins)
  if (productId !== null) {
    const prodSpecific = activeAtTimestamp
      .filter((e) => e.product_id === productId)
      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
    if (prodSpecific.length > 0) {
      return Number(prodSpecific[0].standard_time_minutes);
    }
  }

  // 2. Fallback to operation-level standard active at eventTimestamp
  const opDefault = activeAtTimestamp
    .filter((e) => e.product_id === null)
    .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
  if (opDefault.length > 0) {
    return Number(opDefault[0].standard_time_minutes);
  }

  return fallbackStandardMinutes;
}

/**
 * Validates and calculates quality metrics strictly without double-counting rejected or reworked units.
 *
 * Rules:
 * - first_pass_accepted + rejected + rework <= inspected_qty
 * - accepted_after_rework <= rework_qty
 * - final_accepted_qty = min(submitted_qty, first_pass_accepted + accepted_after_rework)
 * - First-Pass Quality % = (first_pass_accepted / inspected_qty) * 100
 * - Final Acceptance % = (final_accepted / submitted_qty) * 100
 */
export function calculateQualityMetrics(input: QualityCalculationInput): QualityCalculationResult {
  const submitted = Math.max(0, Number(input.submitted_qty) || 0);
  const inspected = Math.max(0, Number(input.inspected_qty) || 0);
  const firstPass = Math.max(0, Number(input.first_pass_accepted_qty) || 0);
  const rejected = Math.max(0, Number(input.rejected_qty) || 0);
  const rework = Math.max(0, Number(input.rework_qty) || 0);
  const acceptedAfterRework = Math.max(0, Number(input.accepted_after_rework_qty) || 0);
  const pending =
    input.pending_inspection_qty !== undefined
      ? Math.max(0, Number(input.pending_inspection_qty) || 0)
      : Math.max(0, round4(submitted - inspected));

  if (inspected > submitted + 0.0001) {
    return {
      valid: false,
      error: 'Inspected quantity cannot exceed total submitted quantity.',
      submitted_qty: submitted,
      inspected_qty: inspected,
      first_pass_accepted_qty: firstPass,
      rejected_qty: rejected,
      rework_qty: rework,
      accepted_after_rework_qty: acceptedAfterRework,
      pending_inspection_qty: pending,
      final_accepted_qty: 0,
      first_pass_quality_pct: null,
      final_acceptance_pct: null,
    };
  }

  if (firstPass + rejected + rework > inspected + 0.0001) {
    return {
      valid: false,
      error: 'First-pass accepted + rejected + rework quantities cannot exceed inspected quantity.',
      submitted_qty: submitted,
      inspected_qty: inspected,
      first_pass_accepted_qty: firstPass,
      rejected_qty: rejected,
      rework_qty: rework,
      accepted_after_rework_qty: acceptedAfterRework,
      pending_inspection_qty: pending,
      final_accepted_qty: 0,
      first_pass_quality_pct: null,
      final_acceptance_pct: null,
    };
  }

  if (acceptedAfterRework > rework + 0.0001) {
    return {
      valid: false,
      error: 'Accepted quantity after rework cannot exceed rework quantity (prevents double-counting).',
      submitted_qty: submitted,
      inspected_qty: inspected,
      first_pass_accepted_qty: firstPass,
      rejected_qty: rejected,
      rework_qty: rework,
      accepted_after_rework_qty: acceptedAfterRework,
      pending_inspection_qty: pending,
      final_accepted_qty: 0,
      first_pass_quality_pct: null,
      final_acceptance_pct: null,
    };
  }

  // Final accepted counts each accepted unit ONCE: first-pass accepted + rework units that passed re-inspection
  const finalAccepted = round4(Math.min(submitted, firstPass + acceptedAfterRework));
  const firstPassPct = inspected > 0 ? round2((firstPass / inspected) * 100) : null;
  const finalAcceptancePct = submitted > 0 ? round2((finalAccepted / submitted) * 100) : null;

  return {
    valid: true,
    submitted_qty: round4(submitted),
    inspected_qty: round4(inspected),
    first_pass_accepted_qty: round4(firstPass),
    rejected_qty: round4(rejected),
    rework_qty: round4(rework),
    accepted_after_rework_qty: round4(acceptedAfterRework),
    pending_inspection_qty: round4(pending),
    final_accepted_qty: finalAccepted,
    first_pass_quality_pct: firstPassPct,
    final_acceptance_pct: finalAcceptancePct,
  };
}

/**
 * Computes standard-time-based productivity for a single operation segment.
 */
export function calculateOperationSegmentMetrics(segment: OperationWorkSegment): OperationSegmentMetrics {
  const stdMin = Math.max(0.0001, Number(segment.standard_time_minutes) || 0);
  const availMin = Math.max(0, Number(segment.available_productive_minutes) || 0);
  const submitted = Math.max(0, Number(segment.submitted_qty) || 0);
  const firstPass = Math.max(0, Number(segment.first_pass_accepted_qty) || 0);
  const rejected = Math.max(0, Number(segment.rejected_qty) || 0);
  const rework = Math.max(0, Number(segment.rework_qty) || 0);
  const acceptedRework = Math.min(rework, Math.max(0, Number(segment.accepted_after_rework_qty) || 0));
  const pending = Math.max(0, Number(segment.pending_inspection_qty) || 0);

  const inspected = round4(firstPass + rejected + rework);
  // Final accepted units counted strictly once (first-pass + accepted-after-rework)
  const finalAccepted = round4(Math.min(submitted, firstPass + acceptedRework));

  const expectedOutput = availMin > 0 ? round2(availMin / stdMin) : 0;
  const stdMinGross = round2(submitted * stdMin);
  const stdMinAccepted = round2(finalAccepted * stdMin);

  const grossProdPct = availMin > 0 ? round2((stdMinGross / availMin) * 100) : 0;
  const acceptedProdPct = availMin > 0 ? round2((stdMinAccepted / availMin) * 100) : 0;

  const firstPassQualityPct = inspected > 0 ? round2((firstPass / inspected) * 100) : null;
  const finalAcceptancePct = submitted > 0 ? round2((finalAccepted / submitted) * 100) : null;

  return {
    operation_id: segment.operation_id,
    operation_code: segment.operation_code,
    operation_name: segment.operation_name,
    product_id: segment.product_id,
    product_name: segment.product_name,
    uom: segment.uom,
    standard_time_minutes: stdMin,
    available_productive_minutes: round2(availMin),
    expected_output: expectedOutput,
    submitted_qty: round4(submitted),
    final_accepted_qty: finalAccepted,
    first_pass_accepted_qty: round4(firstPass),
    rejected_qty: round4(rejected),
    rework_qty: round4(rework),
    accepted_after_rework_qty: round4(acceptedRework),
    pending_inspection_qty: round4(pending),
    standard_minutes_earned_gross: stdMinGross,
    standard_minutes_earned_accepted: stdMinAccepted,
    gross_productivity_pct: grossProdPct,
    accepted_productivity_pct: acceptedProdPct,
    first_pass_quality_pct: firstPassQualityPct,
    final_acceptance_pct: finalAcceptancePct,
  };
}

/**
 * Calculates fair, normalised performance score across one or more operations
 * (automatically handles employees who change operations mid-shift or work on multiple products).
 */
export function calculateFairEmployeeScore(params: {
  employee_id: number;
  emp_id: string;
  employee_name: string;
  department: string;
  segments: OperationWorkSegment[];
  total_available_productive_minutes?: number;
  daily_summaries: DailyDaySummary[];
  period_type: 'daily' | 'weekly' | 'monthly' | 'custom';
  policy: ScoringPolicyConfig;
}): EmployeeScoreOutput {
  const { policy } = params;
  const computedSegments = params.segments.map(calculateOperationSegmentMetrics);

  const totalAvailMin =
    params.total_available_productive_minutes !== undefined
      ? Math.max(0, Number(params.total_available_productive_minutes))
      : computedSegments.reduce((acc, s) => acc + s.available_productive_minutes, 0);

  const totalSubmitted = computedSegments.reduce((acc, s) => acc + s.submitted_qty, 0);
  const totalFinalAccepted = computedSegments.reduce((acc, s) => acc + s.final_accepted_qty, 0);
  const totalFirstPass = computedSegments.reduce((acc, s) => acc + s.first_pass_accepted_qty, 0);
  const totalRejected = computedSegments.reduce((acc, s) => acc + s.rejected_qty, 0);
  const totalRework = computedSegments.reduce((acc, s) => acc + s.rework_qty, 0);
  const totalAcceptedRework = computedSegments.reduce((acc, s) => acc + s.accepted_after_rework_qty, 0);
  const totalPending = computedSegments.reduce((acc, s) => acc + s.pending_inspection_qty, 0);
  const totalExpected = round2(computedSegments.reduce((acc, s) => acc + s.expected_output, 0));

  const totalStdMinGross = round2(computedSegments.reduce((acc, s) => acc + s.standard_minutes_earned_gross, 0));
  const totalStdMinAccepted = round2(computedSegments.reduce((acc, s) => acc + s.standard_minutes_earned_accepted, 0));

  const grossProductivityPct = totalAvailMin > 0 ? round2((totalStdMinGross / totalAvailMin) * 100) : 0;
  const acceptedProductivityPct = totalAvailMin > 0 ? round2((totalStdMinAccepted / totalAvailMin) * 100) : 0;

  // Transparent policy choice: avoid silently penalising quality twice if policy selects gross_output;
  // both gross & accepted productivity are always exposed side-by-side.
  const actualProductivityPct =
    policy.productivity_metric_mode === 'gross_output' ? grossProductivityPct : acceptedProductivityPct;

  const cappedProductivityScore = round2(
    Math.min(Math.max(0, actualProductivityPct), policy.max_productivity_score_cap)
  );

  const totalInspected = totalFirstPass + totalRejected + totalRework;
  const firstPassQualityPct = totalInspected > 0 ? round2((totalFirstPass / totalInspected) * 100) : null;
  const finalAcceptancePct = totalSubmitted > 0 ? round2((totalFinalAccepted / totalSubmitted) * 100) : null;

  const selectedQuality =
    policy.quality_metric_mode === 'first_pass'
      ? (firstPassQualityPct ?? finalAcceptancePct ?? 0)
      : (finalAcceptancePct ?? firstPassQualityPct ?? 0);
  const effectiveQualityScore = round2(Math.min(100, Math.max(0, selectedQuality)));

  // Consistency across ONLY eligible working days
  const eligibleDays = params.daily_summaries.filter((d) => d.eligible_working_day);
  const consistentDays = eligibleDays.filter((d) => {
    const q = d.quality_pct !== null ? d.quality_pct : effectiveQualityScore;
    return d.productivity_pct >= policy.consistency_min_productivity_pct && q >= policy.consistency_min_quality_pct;
  });
  const consistencyPct =
    eligibleDays.length > 0 ? round2((consistentDays.length / eligibleDays.length) * 100) : 0;

  // Weighted final score
  const finalScore = round2(
    (cappedProductivityScore * policy.productivity_weight +
      effectiveQualityScore * policy.quality_weight +
      consistencyPct * policy.consistency_weight) /
      100
  );

  const bands = policy.scoring_bands?.length ? policy.scoring_bands : DEFAULT_SCORING_POLICY.scoring_bands;
  const matchedBand = bands.find((b) => finalScore >= b.min_score && finalScore <= b.max_score);
  const scoringBand = matchedBand ? matchedBand.label : finalScore >= 100 ? 'Outstanding' : 'Evaluated';

  // Reward eligibility rules (never rank someone as Best of Week/Month off a single day!)
  const minWorkdaysRequired =
    params.period_type === 'monthly'
      ? policy.min_eligible_workdays_monthly
      : params.period_type === 'weekly'
        ? policy.min_eligible_workdays_weekly
        : 1;

  const eligibilityReasons: string[] = [];
  if (eligibleDays.length < minWorkdaysRequired) {
    eligibilityReasons.push(
      `Minimum ${minWorkdaysRequired} eligible working day(s) required (recorded: ${eligibleDays.length}).`
    );
  }
  if (actualProductivityPct < policy.min_reward_productivity_pct) {
    eligibilityReasons.push(
      `Productivity ${actualProductivityPct}% is below minimum ${policy.min_reward_productivity_pct}%.`
    );
  }
  if (effectiveQualityScore < policy.min_reward_quality_pct) {
    eligibilityReasons.push(
      `Quality ${effectiveQualityScore}% is below minimum ${policy.min_reward_quality_pct}%.`
    );
  }

  return {
    employee_id: params.employee_id,
    emp_id: params.emp_id,
    employee_name: params.employee_name,
    department: params.department,
    segments: computedSegments,
    total_available_productive_minutes: round2(totalAvailMin),
    total_submitted_qty: round4(totalSubmitted),
    total_final_accepted_qty: round4(totalFinalAccepted),
    total_first_pass_accepted_qty: round4(totalFirstPass),
    total_rejected_qty: round4(totalRejected),
    total_rework_qty: round4(totalRework),
    total_accepted_after_rework_qty: round4(totalAcceptedRework),
    total_pending_inspection_qty: round4(totalPending),
    total_expected_output: totalExpected,
    total_standard_minutes_earned_gross: totalStdMinGross,
    total_standard_minutes_earned_accepted: totalStdMinAccepted,
    gross_productivity_pct: grossProductivityPct,
    accepted_productivity_pct: acceptedProductivityPct,
    actual_productivity_pct: actualProductivityPct,
    capped_productivity_score: cappedProductivityScore,
    first_pass_quality_pct: firstPassQualityPct,
    final_acceptance_pct: finalAcceptancePct,
    effective_quality_score: effectiveQualityScore,
    eligible_working_days: eligibleDays.length,
    consistent_working_days: consistentDays.length,
    consistency_pct: consistencyPct,
    final_score: finalScore,
    scoring_band: scoringBand,
    reward_metric_used: policy.productivity_metric_mode,
    quality_metric_used: policy.quality_metric_mode,
    reward_eligible: eligibilityReasons.length === 0,
    eligibility_reasons: eligibilityReasons,
  };
}

/**
 * Calculates Group Production Component Readiness, Assembly Readiness,
 * and Final Quality-Approved Finished Product Readiness separately.
 * Never counts component quantities as finished toys.
 */
export function calculateProductionOrderReadiness(params: {
  production_order_id: number;
  order_number: string;
  product_id: number;
  product_name: string;
  target_qty: number;
  requirements: ProductOperationRequirement[];
  wip_by_operation: Map<number, OperationWipSnapshot>;
  assembled_qty: number;
  final_approved_finished_qty: number;
  final_rejected_qty: number;
  rework_required_qty: number;
}): ProductionOrderReadinessOutput {
  const targetQty = Math.max(0, Number(params.target_qty) || 0);
  const componentReqs = params.requirements.filter((r) => !r.is_assembly_stage);

  const lines: ComponentReadinessLine[] = componentReqs.map((req) => {
    const wip = params.wip_by_operation.get(req.operation_id) || {
      operation_id: req.operation_id,
      completed_qty: 0,
      quality_approved_qty: 0,
      pending_inspection_qty: 0,
      rejected_qty: 0,
      rework_qty: 0,
      transferred_qty: 0,
      consumed_in_assembly_qty: 0,
    };

    const availableAccepted = Math.max(0, round4(wip.quality_approved_qty - wip.consumed_in_assembly_qty));
    const totalRequired = round4(targetQty * req.required_qty_per_unit);
    const remainingReq = Math.max(0, round4(totalRequired - wip.quality_approved_qty));
    const toySets = req.required_qty_per_unit > 0 ? Math.floor(availableAccepted / req.required_qty_per_unit) : 0;

    return {
      operation_id: req.operation_id,
      operation_code: req.operation_code,
      operation_name: req.operation_name,
      component_name: req.component_name,
      required_qty_per_unit: req.required_qty_per_unit,
      total_required_for_order: totalRequired,
      completed_qty: round4(wip.completed_qty),
      quality_approved_qty: round4(wip.quality_approved_qty),
      pending_inspection_qty: round4(wip.pending_inspection_qty),
      rejected_qty: round4(wip.rejected_qty),
      rework_qty: round4(wip.rework_qty),
      transferred_qty: round4(wip.transferred_qty),
      consumed_in_assembly_qty: round4(wip.consumed_in_assembly_qty),
      available_accepted_qty: availableAccepted,
      remaining_required_qty: remainingReq,
      potential_toy_sets_available: toySets,
      is_mandatory: req.is_mandatory,
      is_bottleneck: false,
    };
  });

  const mandatoryLines = lines.filter((l) => l.is_mandatory);
  let potentialAssemblyReadyQty = 0;
  let limitingComponentOp: string | null = null;

  if (mandatoryLines.length > 0) {
    potentialAssemblyReadyQty = Math.min(...mandatoryLines.map((l) => l.potential_toy_sets_available));
    const limiter = mandatoryLines.find((l) => l.potential_toy_sets_available === potentialAssemblyReadyQty);
    if (limiter) {
      limiter.is_bottleneck = true;
      limitingComponentOp = `${limiter.component_name} (${limiter.operation_name})`;
    }
  }

  const assembledQty = Math.max(0, round4(params.assembled_qty));
  const finalApproved = Math.max(0, round4(params.final_approved_finished_qty));
  const finalRejected = Math.max(0, round4(params.final_rejected_qty));
  const reworkRequired = Math.max(0, round4(params.rework_required_qty));
  const awaitingFinalInspection = Math.max(0, round4(assembledQty - finalApproved - finalRejected - reworkRequired));
  const remainingOrderQty = Math.max(0, round4(targetQty - finalApproved));

  // Total complete component sets achieved (already assembled + currently ready for assembly)
  const totalSupportedSets = Math.min(targetQty, assembledQty + potentialAssemblyReadyQty);
  const componentReadinessPct = targetQty > 0 ? round2((totalSupportedSets / targetQty) * 100) : 0;
  const assemblyReadinessPct = targetQty > 0 ? round2((Math.min(targetQty, assembledQty) / targetQty) * 100) : 0;
  const finishedProductReadinessPct = targetQty > 0 ? round2((finalApproved / targetQty) * 100) : 0;

  // Determine exact 8-state Finished Product Status
  const anyComponentCompleted = lines.some((l) => l.completed_qty > 0 || l.quality_approved_qty > 0);
  let status: FinishedProductStatus = 'Not Started';

  if (targetQty > 0 && finalApproved >= targetQty) {
    status = 'Finished and Quality Approved';
  } else if (reworkRequired > 0 && awaitingFinalInspection === 0 && potentialAssemblyReadyQty === 0) {
    status = 'Rework Required';
  } else if (awaitingFinalInspection > 0) {
    status = 'Awaiting Final Quality Inspection';
  } else if (assembledQty > 0 && finalApproved < targetQty) {
    status = 'Assembly In Progress';
  } else if (potentialAssemblyReadyQty > 0) {
    status = potentialAssemblyReadyQty >= remainingOrderQty ? 'Assembly Ready' : 'Components Available';
  } else if (anyComponentCompleted) {
    status = 'In Progress';
  }

  return {
    production_order_id: params.production_order_id,
    order_number: params.order_number,
    product_id: params.product_id,
    product_name: params.product_name,
    target_qty: targetQty,
    components: lines,
    potential_assembly_ready_qty: potentialAssemblyReadyQty,
    component_readiness_pct: componentReadinessPct,
    assembled_qty: assembledQty,
    assembly_readiness_pct: assemblyReadinessPct,
    awaiting_final_inspection_qty: awaitingFinalInspection,
    final_approved_finished_qty: finalApproved,
    final_rejected_qty: finalRejected,
    rework_required_qty: reworkRequired,
    remaining_order_qty: remainingOrderQty,
    finished_product_readiness_pct: finishedProductReadinessPct,
    finished_product_status: status,
    limiting_component_operation: limitingComponentOp,
  };
}

/**
 * Calculates Daily, Weekly, and Monthly Production Forecasts & Bottleneck Analysis.
 *
 * Guarantees:
 * - Never sums or averages operation capacities.
 * - Constrains finished toy forecast by the slowest mandatory component stage AND final assembly stage.
 * - Incorporates existing WIP stock.
 * - Clearly labels estimates and transparently states when insufficient historical data exists
 *   (falling back to approved operation standards without fabricating history).
 * - Only recommends adding employees when the capacity math supports a real gain in finished toy output.
 */
export function calculateForecastAndBottlenecks(params: {
  target_qty: number;
  already_finished_approved_qty: number;
  daily_target_qty?: number;
  working_days_per_week: number;
  working_days_per_month: number;
  stages: ForecastOperationInput[];
  reference_date?: Date;
}): ProductionForecastOutput {
  const targetQty = Math.max(0, Number(params.target_qty) || 0);
  const remainingTargetQty = Math.max(0, targetQty - Math.max(0, Number(params.already_finished_approved_qty) || 0));
  const workingDaysPerWeek = Math.max(1, Math.min(7, Number(params.working_days_per_week) || 6));
  const workingDaysPerMonth = Math.max(1, Math.min(31, Number(params.working_days_per_month) || 26));
  const dailyTarget = Math.max(
    1,
    Number(params.daily_target_qty) || (remainingTargetQty > 0 ? Math.ceil(remainingTargetQty / workingDaysPerWeek) : 1)
  );

  const mandatoryStages = params.stages.filter((s) => s.is_mandatory);
  const componentStages = mandatoryStages.filter((s) => !s.is_assembly_stage);
  const assemblyStages = mandatoryStages.filter((s) => s.is_assembly_stage);

  const hasAnyHistory = params.stages.some(
    (s) => s.historical_efficiency_ratio !== null || s.historical_quality_yield_ratio !== null
  );

  const basis: ProductionForecastOutput['basis'] = hasAnyHistory
    ? 'historical_and_standards'
    : 'standards_only_insufficient_history';

  const basisNote = hasAnyHistory
    ? 'Estimate derived from approved operation standard times adjusted by recorded historical efficiency, quality yield, shift capacity, and current WIP.'
    : 'Standards-based estimate only: insufficient historical production/QC data exists yet. Calculated strictly from approved operation standards, active employee assignments, shift schedules, and current WIP.';

  // Existing WIP assembly-ready sets across mandatory component stages
  const existingWipSets =
    componentStages.length > 0
      ? Math.min(
          ...componentStages.map((s) =>
            s.required_qty_per_unit > 0 ? Math.floor(Math.max(0, s.available_wip_qty) / s.required_qty_per_unit) : 0
          )
        )
      : 0;

  // Per-stage daily unit capacity & equivalent daily finished toy capacity
  const stageMetrics = params.stages.map((s) => {
    const netShiftMinutes = Math.max(
      0,
      Number(s.shift_available_productive_minutes) - Math.max(0, Number(s.approved_downtime_minutes_per_shift) || 0)
    );
    const effRatio = s.historical_efficiency_ratio !== null ? Math.max(0.1, s.historical_efficiency_ratio) : 1.0;
    const yieldRatio = s.historical_quality_yield_ratio !== null ? Math.min(1.0, Math.max(0.05, s.historical_quality_yield_ratio)) : 1.0;
    const stdMin = Math.max(0.0001, Number(s.standard_time_minutes));

    const singleEmpDailyUnits = (netShiftMinutes / stdMin) * effRatio * yieldRatio;
    const totalDailyUnits = singleEmpDailyUnits * Math.max(0, Number(s.assigned_employees_count) || 0);
    const reqPerToy = Math.max(0.0001, Number(s.required_qty_per_unit) || 1);
    const dailyToyCapacity = totalDailyUnits / reqPerToy;
    const singleEmpToyCapacity = singleEmpDailyUnits / reqPerToy;
    const requiredDailyUnits = dailyTarget * reqPerToy;

    return {
      input: s,
      netShiftMinutes,
      effRatio,
      yieldRatio,
      singleEmpDailyUnits,
      totalDailyUnits,
      dailyToyCapacity,
      singleEmpToyCapacity,
      requiredDailyUnits,
    };
  });

  const mandatoryMetrics = stageMetrics.filter((m) => m.input.is_mandatory);
  const componentMetrics = mandatoryMetrics.filter((m) => !m.input.is_assembly_stage);
  const assemblyMetrics = mandatoryMetrics.filter((m) => m.input.is_assembly_stage);

  const componentDailyToys =
    componentMetrics.length > 0 ? Math.min(...componentMetrics.map((m) => m.dailyToyCapacity)) : 0;
  const assemblyDailyToys =
    assemblyMetrics.length > 0
      ? Math.min(...assemblyMetrics.map((m) => m.dailyToyCapacity))
      : componentDailyToys;

  // Steady-state daily finished toy capacity (bounded by BOTH components and assembly)
  const steadyStateDailyToys =
    mandatoryMetrics.length > 0 ? Math.min(componentDailyToys, assemblyDailyToys) : 0;

  // Day-1 forecast accounts for existing WIP stock (capped by assembly capacity if assembly stage is configured)
  const day1ComponentSupported = componentDailyToys + existingWipSets;
  const expectedDailyFinishedToys = Math.floor(
    assemblyMetrics.length > 0
      ? Math.min(day1ComponentSupported, assemblyDailyToys)
      : day1ComponentSupported
  );

  // Weekly & monthly forecasts incorporate existing WIP once + steady-state daily output across working days
  const weeklyComponentSupported = componentDailyToys * workingDaysPerWeek + existingWipSets;
  const weeklyAssemblyCap = assemblyMetrics.length > 0 ? assemblyDailyToys * workingDaysPerWeek : weeklyComponentSupported;
  const expectedWeeklyFinishedToys = Math.floor(Math.min(weeklyComponentSupported, weeklyAssemblyCap));

  const monthlyComponentSupported = componentDailyToys * workingDaysPerMonth + existingWipSets;
  const monthlyAssemblyCap = assemblyMetrics.length > 0 ? assemblyDailyToys * workingDaysPerMonth : monthlyComponentSupported;
  const expectedMonthlyFinishedToys = Math.floor(Math.min(monthlyComponentSupported, monthlyAssemblyCap));

  // Identify the true bottleneck stage (lowest daily toy capacity among mandatory stages)
  let minStageToyCap = Infinity;
  let bottleneckStageId: number | null = null;
  let bottleneckName: string | null = null;
  for (const m of mandatoryMetrics) {
    if (m.dailyToyCapacity < minStageToyCap) {
      minStageToyCap = m.dailyToyCapacity;
      bottleneckStageId = m.input.operation_id;
      bottleneckName = `${m.input.operation_name} (${m.input.component_name})`;
    }
  }

  // Second-lowest capacity determines the ceiling gain of adding 1 employee to the bottleneck
  const sortedMandatoryCaps = mandatoryMetrics.map((m) => m.dailyToyCapacity).sort((a, b) => a - b);
  const nextLimitingCap = sortedMandatoryCaps.length > 1 ? sortedMandatoryCaps[1] : Infinity;

  let totalAdditionalEmployees = 0;

  const bottleneckRows: BottleneckStageRow[] = stageMetrics.map((m) => {
    const isBottleneck = m.input.operation_id === bottleneckStageId && mandatoryMetrics.length > 0;
    const shortfallUnits = Math.max(0, round2(m.requiredDailyUnits - m.totalDailyUnits));
    const additionalEmpsNeeded =
      shortfallUnits > 0 && m.singleEmpDailyUnits > 0 ? Math.ceil(shortfallUnits / m.singleEmpDailyUnits) : 0;

    // Adding 1 employee ONLY improves finished toy throughput if this stage IS the bottleneck (or tied for it)
    let expectedToyGainWithOneEmp = 0;
    if (m.input.is_mandatory && m.dailyToyCapacity <= minStageToyCap + 0.0001) {
      const raisedCap = m.dailyToyCapacity + m.singleEmpToyCapacity;
      expectedToyGainWithOneEmp = Math.max(0, Math.floor(Math.min(raisedCap, nextLimitingCap) - minStageToyCap));
    }

    if (isBottleneck && additionalEmpsNeeded > 0) {
      totalAdditionalEmployees += additionalEmpsNeeded;
    }

    const recParts: string[] = [];
    if (m.input.assigned_employees_count === 0 && m.input.is_mandatory) {
      recParts.push(`Zero employees currently assigned; assign at least ${Math.max(1, additionalEmpsNeeded)} operator(s) to unlock production.`);
    } else if (isBottleneck) {
      if (m.yieldRatio < 0.95) {
        recParts.push(
          `Quality yield (${round2(m.yieldRatio * 100)}%) is reducing net output; resolve defects before expanding headcount.`
        );
      }
      if (expectedToyGainWithOneEmp > 0) {
        recParts.push(
          `Primary bottleneck: adding 1 employee increases finished toy throughput by ~${expectedToyGainWithOneEmp} toy(s)/day.`
        );
      } else if (shortfallUnits > 0) {
        recParts.push(`Primary bottleneck: requires ${shortfallUnits} additional unit(s)/day to meet daily target.`);
      } else {
        recParts.push('Tightest capacity stage, currently sufficient for daily target.');
      }
    } else if (m.input.waiting_between_ops_qty > 0) {
      recParts.push(
        `${round2(m.input.waiting_between_ops_qty)} unit(s) waiting between operations; clear handoff/QC backlog rather than adding staff.`
      );
    } else {
      recParts.push('Non-bottleneck stage: adding employees here will not increase finished toy output.');
    }

    return {
      operation_id: m.input.operation_id,
      operation_code: m.input.operation_code,
      operation_name: m.input.operation_name,
      component_name: m.input.component_name,
      is_assembly_stage: m.input.is_assembly_stage,
      assigned_employees: m.input.assigned_employees_count,
      standard_time_minutes: m.input.standard_time_minutes,
      required_qty_per_unit: m.input.required_qty_per_unit,
      required_daily_units: round2(m.requiredDailyUnits),
      available_daily_units: round2(m.totalDailyUnits),
      available_daily_toy_capacity: round2(m.dailyToyCapacity),
      available_wip_qty: round2(m.input.available_wip_qty),
      waiting_between_ops_qty: round2(m.input.waiting_between_ops_qty),
      quality_yield_pct: round2(m.yieldRatio * 100),
      efficiency_pct: round2(m.effRatio * 100),
      shortfall_units_daily: shortfallUnits,
      is_bottleneck: isBottleneck,
      additional_employees_needed: additionalEmpsNeeded,
      expected_daily_toy_gain_with_one_employee: expectedToyGainWithOneEmp,
      recommendation: recParts.join(' '),
    };
  });

  // Estimated completion date based on remaining target, existing WIP, and steady-state daily capacity
  let estimatedCompletionDays: number | null = null;
  let estimatedCompletionDate: string | null = null;
  if (remainingTargetQty === 0) {
    estimatedCompletionDays = 0;
    estimatedCompletionDate = (params.reference_date || new Date()).toISOString().slice(0, 10);
  } else if (steadyStateDailyToys > 0) {
    const netAfterWip = Math.max(
      0,
      remainingTargetQty - (assemblyMetrics.length > 0 ? Math.min(existingWipSets, assemblyDailyToys) : existingWipSets)
    );
    const days = Math.max(1, Math.ceil(netAfterWip / steadyStateDailyToys) + (existingWipSets > 0 && netAfterWip < remainingTargetQty ? 1 : 0));
    estimatedCompletionDays = Math.ceil(remainingTargetQty <= expectedDailyFinishedToys ? 1 : days);
    const ref = new Date(params.reference_date || new Date());
    const calendarDays = Math.ceil((estimatedCompletionDays / workingDaysPerWeek) * 7);
    ref.setUTCDate(ref.getUTCDate() + calendarDays);
    estimatedCompletionDate = ref.toISOString().slice(0, 10);
  }

  // Final quality yield for expected quality-approved finished toys
  const finalAssemblyYield =
    assemblyMetrics.length > 0
      ? Math.min(...assemblyMetrics.map((m) => m.yieldRatio))
      : 1.0;

  return {
    is_estimate: true,
    basis,
    basis_note: basisNote,
    target_qty: targetQty,
    remaining_target_qty: remainingTargetQty,
    working_days_per_week: workingDaysPerWeek,
    working_days_per_month: workingDaysPerMonth,
    expected_daily_finished_toys: expectedDailyFinishedToys,
    expected_weekly_finished_toys: expectedWeeklyFinishedToys,
    expected_monthly_finished_toys: expectedMonthlyFinishedToys,
    expected_daily_assembly_capacity: Math.floor(assemblyDailyToys),
    expected_daily_component_supported_toys: Math.floor(componentDailyToys),
    expected_daily_quality_approved_toys: Math.floor(expectedDailyFinishedToys * finalAssemblyYield),
    existing_wip_assembly_ready_toys: existingWipSets,
    daily_shortfall_vs_target: Math.max(0, round2(dailyTarget - expectedDailyFinishedToys)),
    bottleneck_operation: bottleneckName,
    estimated_completion_days: estimatedCompletionDays,
    estimated_completion_date: estimatedCompletionDate,
    additional_employee_capacity_required: totalAdditionalEmployees,
    stages: bottleneckRows,
  };
}
