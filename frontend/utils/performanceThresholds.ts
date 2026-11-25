/**
 * Nexora Performance Thresholds & Visual Tier Helpers
 * Determines employee performance-based row colors, status labels, and tier badges.
 * Exclusively uses real persisted performance completion figures.
 */

export type PerformanceTier = 'high' | 'medium' | 'low' | 'inactive';

export interface PerformanceRuleConfig {
  highThreshold: number;
  mediumThreshold: number;
}

export const DEFAULT_TIER_CONFIGS: Record<string, PerformanceRuleConfig> = {
  today: { highThreshold: 5, mediumThreshold: 2 },
  week: { highThreshold: 20, mediumThreshold: 8 },
  month: { highThreshold: 80, mediumThreshold: 30 },
  all: { highThreshold: 50, mediumThreshold: 15 },
};

/**
 * Calculates performance tier based on real recorded completions and period threshold.
 * If count is 0 or unrecorded, strictly returns 'inactive' (neutral state).
 */
export function getPerformanceTier(
  count: number,
  period: string = 'today',
  customConfig?: PerformanceRuleConfig
): PerformanceTier {
  if (!count || count <= 0) {
    return 'inactive';
  }
  const cfg = customConfig || DEFAULT_TIER_CONFIGS[period] || DEFAULT_TIER_CONFIGS.today;
  if (count >= cfg.highThreshold) {
    return 'high';
  }
  if (count >= cfg.mediumThreshold) {
    return 'medium';
  }
  return 'low';
}

export interface TierStyleInfo {
  tier: PerformanceTier;
  label: string;
  badgeClass: string;
  badgeText: string;
  rowClass: string;
  rowHoverClass: string;
  borderLeftClass: string;
  textAccentClass: string;
  dotColorClass: string;
  description: string;
}

export function getTierStyle(tier: PerformanceTier): TierStyleInfo {
  switch (tier) {
    case 'high':
      return {
        tier: 'high',
        label: 'High Output',
        description: 'Exceeding standard performance target',
        badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-600',
        badgeText: 'text-emerald-700',
        rowClass: 'bg-emerald-50/80 dark:bg-emerald-950/20',
        rowHoverClass: 'hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30',
        borderLeftClass: 'border-l-4 border-l-emerald-600 dark:border-l-emerald-400',
        textAccentClass: 'text-emerald-950 dark:text-emerald-100 font-semibold',
        dotColorClass: 'bg-emerald-500',
      };
    case 'medium':
      return {
        tier: 'medium',
        label: 'Medium Output',
        description: 'On-track baseline completion rate',
        badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-600',
        badgeText: 'text-amber-700',
        rowClass: 'bg-amber-50/80 dark:bg-amber-950/20',
        rowHoverClass: 'hover:bg-amber-100/70 dark:hover:bg-amber-900/30',
        borderLeftClass: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
        textAccentClass: 'text-amber-950 dark:text-amber-100 font-semibold',
        dotColorClass: 'bg-amber-500',
      };
    case 'low':
      return {
        tier: 'low',
        label: 'Low Output',
        description: 'Initial activity, below baseline target',
        badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-600',
        badgeText: 'text-rose-700',
        rowClass: 'bg-rose-50/80 dark:bg-rose-950/20',
        rowHoverClass: 'hover:bg-rose-100/70 dark:hover:bg-rose-900/30',
        borderLeftClass: 'border-l-4 border-l-rose-500 dark:border-l-rose-400',
        textAccentClass: 'text-rose-950 dark:text-rose-100 font-semibold',
        dotColorClass: 'bg-rose-500',
      };
    case 'inactive':
    default:
      return {
        tier: 'inactive',
        label: 'No Activity',
        description: 'No completion events recorded in this period',
        badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        badgeText: 'text-slate-500',
        rowClass: 'bg-white dark:bg-slate-900/40',
        rowHoverClass: 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40',
        borderLeftClass: 'border-l-4 border-l-slate-300 dark:border-l-slate-700',
        textAccentClass: 'text-slate-600 dark:text-slate-300',
        dotColorClass: 'bg-slate-400',
      };
  }
}
