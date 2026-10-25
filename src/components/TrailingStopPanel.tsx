import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  apiClient,
  TrailingStopEventInfo,
  TrailingStopSummaryInfo,
} from '../apiclient';

const fmtPrice = (value: number) => {
  if (!value || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 8 : 4,
  });
};

const fmtPct = (value: number) => `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('fa-IR');
  const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `${date} — ${time}`;
};

export function TrailingStopPanel() {
  const [summary, setSummary] = useState<TrailingStopSummaryInfo | null>(null);
  const [events, setEvents] = useState<TrailingStopEventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'live' | 'paper'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [summaryRes, eventsRes] = await Promise.all([
        apiClient.getTrailingStopSummary(),
        apiClient.getTrailingStopEvents(300),
      ]);
      setSummary(summaryRes);
      setEvents(eventsRes.events);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'خطا در خواندن گزارش حد سود شناور');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const handleClear = async () => {
    if (!window.confirm('همه رکوردهای گزارش حد سود شناور حذف شوند؟')) return;
    setClearing(true);
    try {
      await apiClient.clearTrailingStopEvents();
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'خطا در پاک‌سازی گزارش');
    } finally {
      setClearing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return events.filter((e) => {
      if (filter !== 'all' && e.mode !== filter) return false;
      if (!q) return true;
      return (
        e.symbol.toUpperCase().includes(q) ||
        String(e.label || '').toUpperCase().includes(q)
      );
    });
  }, [events, filter, search]);

  const config = summary?.config;
  const stats = summary?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <span>حد سود شناور</span>
          </h2>
          <p className="text-xs text-slate-500">
            گزارش جابه‌جایی خودکار حد ضرر پوزیشن‌های WEEX — از سربه‌سر تا قفل پله‌های سود
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>به‌روزرسانی</span>
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={clearing || events.length === 0}
            className="px-3.5 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{clearing ? 'در حال حذف...' : 'پاک‌سازی گزارش'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      {/* Ladder + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>نردبان حد ضرر</span>
            <span
              className={`mr-auto text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                config?.enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {config?.enabled ? 'فعال' : 'غیرفعال'}
            </span>
          </div>

          <ul className="space-y-2 text-xs text-slate-600">
            <li className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
              <span>سود {config?.breakevenAt ?? 6}٪</span>
              <span className="font-bold text-slate-900">حد ضرر روی نقطه ورود (سربه‌سر)</span>
            </li>
            <li className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
              <span>سود {config?.firstLockAt ?? 10}٪</span>
              <span className="font-bold text-emerald-600">
                قفل {config?.step ?? 5}٪ سود
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
              <span>هر +{config?.step ?? 5}٪</span>
              <span className="font-bold text-emerald-600">قفل پله ۵٪ قبلی</span>
            </li>
          </ul>

          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-500">
            <BadgePercent className="w-3.5 h-3.5" />
            <span>
              مبنای درصد:{' '}
              <span className="font-mono-tabular font-bold text-slate-700">
                {config?.basis === 'price' ? 'حرکت قیمت' : 'سود روی مارجین (ROE)'}
              </span>
            </span>
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Activity className="w-4 h-4 text-blue-600" />}
            label="کل جابه‌جایی‌ها"
            value={stats?.totalMoves ?? 0}
          />
          <StatCard
            icon={<Clock className="w-4 h-4 text-amber-600" />}
            label="امروز"
            value={stats?.todayMoves ?? 0}
          />
          <StatCard
            icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
            label="پوزیشن‌های محافظت‌شده"
            value={stats?.positionsProtected ?? 0}
          />
          <StatCard
            icon={<Lock className="w-4 h-4 text-violet-600" />}
            label="واقعی / مجازی"
            value={`${stats?.liveMoves ?? 0} / ${stats?.paperMoves ?? 0}`}
          />
          <div className="col-span-2 sm:col-span-4 text-[11px] text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              آخرین جابه‌جایی: {stats?.lastMoveAt ? fmtDate(stats.lastMoveAt) : 'هنوز ثبت نشده'}
            </span>
          </div>
        </div>
      </div>

      {/* Events table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span>گزارش جابه‌جایی حد ضرر</span>
            <span aria-hidden="true">·</span>
            <span className="text-xs font-normal text-slate-500">{filtered.length} رکورد</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {([
                ['all', 'همه'],
                ['live', 'واقعی'],
                ['paper', 'مجازی'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                    filter === id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نماد..."
              className="w-40 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>

        {loading && events.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">در حال بارگذاری گزارش...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-700">هنوز جابه‌جایی ثبت نشده</p>
            <p className="text-xs text-slate-500">
              وقتی سود یک پوزیشن WEEX به {config?.breakevenAt ?? 6}٪ برسد، حد ضرر جابه‌جا و
              همین‌جا ثبت می‌شود.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-right border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">زمان</th>
                  <th className="py-3 px-4">نماد</th>
                  <th className="py-3 px-4">جهت</th>
                  <th className="py-3 px-4">حالت</th>
                  <th className="py-3 px-4 text-left">قیمت ورود</th>
                  <th className="py-3 px-4 text-left">قیمت لحظه</th>
                  <th className="py-3 px-4 text-left">سود</th>
                  <th className="py-3 px-4 text-left">قفل‌شده</th>
                  <th className="py-3 px-4 text-left">حد ضرر</th>
                  <th className="py-3 px-4">توضیح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((e) => {
                  const isLong = e.side === 'LONG';
                  return (
                    <tr key={e._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono-tabular">
                        {fmtDate(e.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{e.symbol}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {e.label}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isLong
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {isLong ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            e.mode === 'live'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {e.mode === 'live' ? 'واقعی' : 'مجازی'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-left font-mono-tabular text-slate-600">
                        {fmtPrice(e.entryPrice)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-tabular text-slate-600">
                        {fmtPrice(e.marketPrice)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-tabular font-bold text-emerald-600">
                        {fmtPct(e.profitPct)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-tabular font-bold text-violet-600">
                        {e.lockPct > 0 ? `${e.lockPct}%` : 'سربه‌سر'}
                      </td>
                      <td className="py-3 px-4 text-left font-mono-tabular whitespace-nowrap">
                        <span className="text-slate-400">{fmtPrice(e.previousStop)}</span>
                        <span className="mx-1 text-slate-300">→</span>
                        <span className="font-bold text-slate-900">{fmtPrice(e.newStop)}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[240px]">
                        <span className="line-clamp-2" title={e.reason}>
                          {e.reason || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-extrabold text-slate-900 font-mono-tabular">{value}</div>
    </div>
  );
}
