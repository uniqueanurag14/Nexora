import React from 'react';
import {
  Award,
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  ArrowRight,
} from 'lucide-react';

interface LeaderboardNotificationsPanelProps {
  empPerfData: any;
  notificationsData: any;
  recentActivity: any[];
  quickActions: Array<{ id: string; label: string; route: string; category: string }>;
  showLeaderboard: boolean;
  showNotifications: boolean;
  showRecentActivity: boolean;
  rewardCategory: string;
  onRewardCategoryChange: (cat: string) => void;
  page: number;
  onPageChange: (nextPage: number) => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onNavigate: (route: string) => void;
}

const REWARD_CATEGORY_LABELS: Record<string, string> = {
  overall_best_employee: 'Overall Best Employee',
  best_employee_day: 'Best Employee of the Day',
  best_employee_week: 'Best Employee of the Week',
  best_employee_month: 'Best Employee of the Month',
  best_performer_operation: 'Best Performer per Operation',
  best_quality_performer: 'Best Quality Performer',
  most_consistent_employee: 'Most Consistent Employee',
};

export const LeaderboardNotificationsPanel: React.FC<LeaderboardNotificationsPanelProps> = ({
  empPerfData,
  notificationsData,
  recentActivity,
  quickActions,
  showLeaderboard,
  showNotifications,
  showRecentActivity,
  rewardCategory,
  onRewardCategoryChange,
  page,
  onPageChange,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}) => {
  const leaderboard: any[] = empPerfData?.leaderboard || [];
  const pagination = empPerfData?.pagination || { page: 1, total_pages: 1, total: 0 };
  const notifications: any[] = notificationsData?.notifications || [];
  const unreadCount: number = Number(notificationsData?.unread_count || 0);

  return (
    <div className="space-y-6">
      {/* Interactive Employee Performance Leaderboard */}
      {showLeaderboard && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                Employee Performance & Reward Leaderboard
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ranked using fair standard-time productivity, quality, and consistency scores (server-side paginated).
              </p>
            </div>

            <select
              value={rewardCategory}
              onChange={(e) => onRewardCategoryChange(e.target.value)}
              aria-label="Reward Category"
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-600"
            >
              {Object.entries(REWARD_CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {leaderboard.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
              No employee performance records available for the selected filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 pr-3 font-semibold">Rank</th>
                      <th className="py-2.5 px-3 font-semibold">Employee</th>
                      <th className="py-2.5 px-3 font-semibold">Department</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Productivity</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Quality</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Consistency</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Final Score</th>
                      <th className="py-2.5 pl-3 font-semibold">Reward Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard.map((row) => (
                      <tr key={row.employee_id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-3 font-mono tabular-nums font-bold text-slate-700">#{row.rank}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{row.employee_name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{row.emp_id}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.department}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-sky-700">
                          {row.standard_time_productivity_pct}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {row.first_pass_quality_pct !== null ? `${row.first_pass_quality_pct}%` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.consistency_pct}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {row.final_score}
                        </td>
                        <td className="py-2.5 pl-3">
                          <span
                            className={`text-[11px] font-semibold ${
                              row.reward_eligible ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {row.reward_eligible ? 'Eligible' : 'Not Eligible'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                <span className="font-mono tabular-nums">
                  Showing page {pagination.page} of {pagination.total_pages} ({pagination.total} employee(s))
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= pagination.total_pages}
                    onClick={() => onPageChange(page + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Notifications Centre + Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Notification Centre */}
        {showNotifications && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-700" />
                  Notifications
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-mono tabular-nums font-bold text-rose-700">
                      ({unreadCount} unread)
                    </span>
                  )}
                </h2>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                  No active operational notifications.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        n.is_read ? 'border-slate-100 bg-white' : 'border-sky-200 bg-sky-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900">{n.title}</span>
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => onMarkRead(n.id)}
                            className="text-[11px] font-medium text-sky-700 hover:text-sky-900 inline-flex items-center gap-0.5 shrink-0"
                            title="Mark as read"
                          >
                            <Check className="w-3 h-3" /> Read
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">{n.message}</p>
                      {n.target_route && (
                        <button
                          type="button"
                          onClick={() => onNavigate(n.target_route)}
                          className="text-[11px] font-semibold text-sky-700 hover:underline inline-flex items-center gap-1 pt-0.5"
                        >
                          Inspect <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Recent Authorized Activity */}
        {showRecentActivity && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-700" />
                Recent Operational Activity
              </h2>

              {recentActivity.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                  No recent activity records found.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recentActivity.slice(0, 8).map((act) => (
                    <div key={act.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/40 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 truncate">{act.action}</span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {act.timestamp ? new Date(act.timestamp).toLocaleTimeString() : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{act.details}</p>
                      <span className="text-[10px] text-slate-400">{act.actor} • {act.module}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Permission-Gated Quick Actions */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-4 h-4 text-sky-700" />
            Authorized Quick Actions
          </h2>

          {quickActions.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
              No quick actions assigned for your current role.
            </div>
          ) : (
            <div className="space-y-2">
              {quickActions.map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={() => onNavigate(qa.route)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 hover:border-sky-500 hover:bg-sky-50/40 text-xs font-semibold text-slate-800 transition-colors"
                >
                  <span>{qa.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-sky-700" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
