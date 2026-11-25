import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ComposedChart,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';

interface EmployeePerformanceChartsProps {
  data: any;
  isLoading: boolean;
  onSelectEmployee?: (employeeId: number) => void;
}

const EmptyChartState: React.FC<{ message?: string }> = ({ message = 'No data available for the selected filters.' }) => (
  <div className="h-64 flex items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-xs text-slate-500">
    {message}
  </div>
);

export const EmployeePerformanceCharts: React.FC<EmployeePerformanceChartsProps> = ({
  data,
  isLoading,
  onSelectEmployee,
}) => {
  const [activeChart, setActiveChart] = useState<'comparison' | 'trend' | 'operations' | 'target'>('comparison');

  if (isLoading) {
    return <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />;
  }

  const charts = data?.charts || {};
  const comparison = charts.productivity_comparison || [];
  const trend = charts.productivity_trend || [];
  const operations = charts.operation_wise_ranking || [];
  const targetVsActual = charts.target_vs_actual || [];

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-700" />
            Employee Performance Analytics (Standard-Time Normalized)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fair cross-operation comparison using Standard Minutes Earned ÷ Available Productive Minutes (never raw counts).
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
          {[
            { id: 'comparison', label: 'Productivity vs Quality' },
            { id: 'trend', label: 'Period Trend' },
            { id: 'operations', label: 'By Operation' },
            { id: 'target', label: 'Target vs Actual' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveChart(tab.id as any)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeChart === tab.id ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeChart === 'comparison' && (
        comparison.length === 0 ? (
          <EmptyChartState />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparison}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
                onClick={(state: any) => {
                  const empId = state?.activePayload?.[0]?.payload?.employee_id;
                  if (empId && onSelectEmployee) onSelectEmployee(Number(empId));
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="employee_name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any, name: any) => [`${value}%`, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#cbd5e1' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={100} stroke="#0f172a" strokeDasharray="4 4" label={{ value: '100% Std', fontSize: 10 }} />
                <Bar dataKey="productivity_pct" name="Productivity %" fill="#0284c7" radius={[0, 4, 4, 0]} />
                <Bar dataKey="quality_pct" name="Quality %" fill="#0f766e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      )}

      {activeChart === 'trend' && (
        trend.length === 0 ? (
          <EmptyChartState />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="work_date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  formatter={(value: any, name: any) => [value === null ? 'N/A' : `${value}%`, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#cbd5e1' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#64748b" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="accepted_productivity_pct"
                  name="Accepted Productivity %"
                  stroke="#0284c7"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="first_pass_quality_pct"
                  name="First-Pass Quality %"
                  stroke="#0f766e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      )}

      {activeChart === 'operations' && (
        operations.length === 0 ? (
          <EmptyChartState />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={operations} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="operation_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#cbd5e1' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="productivity_pct" name="Operation Productivity %" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="quality_pct" name="Operation Quality %" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      )}

      {activeChart === 'target' && (
        targetVsActual.length === 0 ? (
          <EmptyChartState />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={targetVsActual} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="employee_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#cbd5e1' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="actual_accepted" name="Accepted Output" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual_submitted" name="Submitted Output" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="expected_output" name="Standard Target" stroke="#0f172a" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      )}

      {data?.scoring_policy && (
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            Policy: <strong className="text-slate-700">{data.scoring_policy.policy_name}</strong>
          </span>
          <span className="font-mono tabular-nums">
            Weights: Prod {data.scoring_policy.productivity_weight}% / Quality {data.scoring_policy.quality_weight}% / Consistency{' '}
            {data.scoring_policy.consistency_weight}% (Cap {data.scoring_policy.max_productivity_score_cap}%)
          </span>
        </div>
      )}
    </section>
  );
};
