import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Loader2,
  RefreshCw,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiClient, PositionInfo, TradeEngineStatus } from '../apiclient';

const usd = (v: number | undefined) => {
  const n = Number(v || 0);
  return `${n >= 0 ? '' : '-'}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pct = (v: number | undefined) => `${Number(v || 0) >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`;

const price = (v: number | undefined) => {
  if (!v) return '—';
  return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: Number(v) < 1 ? 6 : 2,
  });
};

const dt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fa-IR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

function SideBadge({ side }: { side: 'LONG' | 'SHORT' }) {
  if (side === 'LONG') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        <TrendingUp className="w-3 h-3" />
        خرید
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
      <TrendingDown className="w-3 h-3" />
      فروش
    </span>
  );
}

function StatusBadge({ status, tp1Hit }: { status: PositionInfo['status']; tp1Hit: boolean }) {
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
        <Clock className="w-3 h-3" />
        در انتظار ورود
      </span>
    );
  }
  if (status === 'OPEN') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
        <Activity className="w-3 h-3" />
        {tp1Hit ? 'باز (۵۰٪ بسته شد)' : 'باز'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3" />
      بسته شده
    </span>
  );
}

function PnlCell({ pnl, pnlPct }: { pnl: number; pnlPct: number }) {
  const up = pnl >= 0;
  return (
    <div className="flex flex-col items-start">
      <span
        className={`text-xs font-extrabold font-mono-tabular ${up ? 'text-emerald-600' : 'text-red-600'}`}
      >
        {usd(pnl)}
      </span>
      <span className={`text-[11px] font-mono-tabular ${up ? 'text-emerald-500' : 'text-red-500'}`}>
        {pct(pnlPct)}
      </span>
    </div>
  );
}

export function TradePanel() {
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [engine, setEngine] = useState<TradeEngineStatus | null>(null);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [posRes, statusRes] = await Promise.all([
        apiClient.getPositions(),
        apiClient.getTradeStatus(),
      ]);
      setPositions(posRes.positions || []);
      setAccountKey(posRes.userId || null);
      setEngine(statusRes.status);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری پوزیشن‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(true), 6000);
    return () => window.clearInterval(t);
  }, [load]);

  const active = useMemo(
    () => positions.filter((p) => p.status !== 'CLOSED'),
    [positions]
  );
  const history = useMemo(
    () => positions.filter((p) => p.status === 'CLOSED'),
    [positions]
  );

  const filterRows = useCallback(
    (rows: PositionInfo[]) => {
      const q = search.trim().toUpperCase();
      if (!q) return rows;
      return rows.filter(
        (p) => p.symbol.toUpperCase().includes(q) || (p.label || '').toUpperCase().includes(q)
      );
    },
    [search]
  );

  const openTotal = active.filter((p) => p.status === 'OPEN');
  const pendingTotal = active.filter((p) => p.status === 'PENDING');
  const unrealized = openTotal.reduce((a, p) => a + (p.unrealizedPnl || 0), 0);
  const realized = history.reduce((a, p) => a + (p.realizedPnl || 0), 0);
  const wins = history.filter((p) => (p.realizedPnl || 0) > 0).length;
  const winRate = history.length > 0 ? (wins / history.length) * 100 : 0;

  const handleTick = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiClient.runTradeTick();
      const s = res.summary;
      setMessage(
        `اجرای موتور: ${s.pendingCreated} سفارش جدید، ${s.filled} ورود انجام‌شده، ${s.partiallyClosed} بستن جزئی، ${s.closed} بستن کامل.`
      );
      await load(true);
    } catch (err: any) {
      setMessage(err?.message || 'اجرای موتور معاملات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (id: string) => {
    try {
      await apiClient.closePosition(id);
      setMessage('پوزیشن بسته شد و سود/زیان روی حساب اعمال گردید.');
      await load(true);
    } catch (err: any) {
      setMessage(err?.message || 'بستن پوزیشن ناموفق بود.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deletePosition(id);
      await load(true);
    } catch (err: any) {
      setMessage(err?.message || 'حذف رکورد ناموفق بود.');
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('همهٔ پوزیشن‌ها (شامل باز‌ها) حذف شوند؟ موجودی دست‌نخورده می‌ماند.')) return;
    try {
      await apiClient.clearPositions();
      setMessage('همهٔ پوزیشن‌ها پاک شدند.');
      await load(true);
    } catch (err: any) {
      setMessage(err?.message || 'پاک‌سازی ناموفق بود.');
    }
  };

  const rows = filterRows(tab === 'active' ? active : history);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Target className="w-4.5 h-4.5 text-blue-600" />
              معاملات مجازی
            </h2>
            <p className="text-xs text-slate-500 leading-6">
              هر سیگنال واجد شرایط یک سفارش می‌سازد. سفارش به‌محض رسیدن قیمت به نقطهٔ ورود باز
              می‌شود؛ در حد سود اول ۵۰٪ بسته می‌شود و بقیه تا حد سود دوم یا حد ضرر ادامه می‌دهد.
              حد ضرر و حد سودها عیناً از سیگنال گرفته می‌شوند.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleTick}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              اجرای موتور معاملات
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClearHistory}
              className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">موتور معاملات</div>
            <div className="text-sm font-extrabold text-slate-900">
              {engine?.isRunning ? 'فعال' : 'غیرفعال'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular">
              هر {Math.round((engine?.pollIntervalMs || 15000) / 1000)} ثانیه
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">آخرین اجرا</div>
            <div className="text-sm font-extrabold text-slate-900 font-mono-tabular">
              {dt(engine?.lastTickAt)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular">
              اهرم {engine?.leverage || 5}x · بستن TP1:{' '}
              {engine?.tp1ClosePct ?? 50}٪
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">در انتظار ورود</div>
            <div className="text-sm font-extrabold text-amber-600 font-mono-tabular">
              {pendingTotal.length}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">پوزیشن باز</div>
            <div className="text-sm font-extrabold text-blue-600 font-mono-tabular">
              {openTotal.length}
            </div>
          </div>
        </div>

        {/* DIRECT LINK with the signals engine */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                engine?.lastIngestedSignal ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
            />
            اتصال موتور سیگنال
          </span>
          <span className="text-slate-600">
            آخرین سیگنال دریافتی:{' '}
            {engine?.lastIngestedSignal ? (
              <b className="font-mono-tabular">
                {engine.lastIngestedSignal.symbol}{' '}
                <span
                  className={
                    engine.lastIngestedSignal.side === 'LONG'
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }
                >
                  {engine.lastIngestedSignal.side === 'LONG' ? 'خرید' : 'فروش'}
                </span>
              </b>
            ) : (
              <span className="text-slate-400">هنوز سیگنالی نرسیده</span>
            )}
          </span>
          {engine?.lastIngestAt && (
            <span className="text-slate-500 font-mono-tabular">{dt(engine.lastIngestAt)}</span>
          )}
          <span className="text-slate-600">
            مجموع ارسال‌شده:{' '}
            <b className="font-mono-tabular">{engine?.signalsIngestedTotal ?? 0}</b>
          </span>
          <span className="text-slate-600">
            سفارش ساخته‌شده در آخرین دریافت:{' '}
            <b className="font-mono-tabular">{engine?.lastIngestCreated ?? 0}</b>
          </span>
          {engine?.lastIngestNote && (
            <span className="text-slate-500">{engine.lastIngestNote}</span>
          )}
          <span className="text-slate-400 font-mono-tabular">
            شناسه حساب: {(accountKey || '—').slice(0, 10)} · کاربران موتور:{' '}
            {engine?.knownUserIds?.length ?? 0}
          </span>
        </div>

        {engine?.lastError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-800">
              خطای آخرین اجرا: {engine.lastError}
            </span>
          </div>
        )}

        {message && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-xs font-semibold text-slate-700">{message}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-xs font-semibold text-red-700">{error}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">سود / زیان شناور</div>
          <div
            className={`text-2xl font-extrabold font-mono-tabular ${
              unrealized >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {usd(unrealized)}
          </div>
          <div className="text-xs text-slate-500">{openTotal.length} پوزیشن باز</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">سود / زیان محقق‌شده</div>
          <div
            className={`text-2xl font-extrabold font-mono-tabular ${
              realized >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {usd(realized)}
          </div>
          <div className="text-xs text-slate-500">{history.length} معامله بسته‌شده</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">معاملات سودده / زیان‌ده</div>
          <div className="text-2xl font-extrabold font-mono-tabular">
            <span className="text-emerald-600">{wins}</span>
            <span className="text-slate-300"> / </span>
            <span className="text-red-600">{history.length - wins}</span>
          </div>
          <div className="text-xs text-slate-500">نرخ برد {winRate.toFixed(1)}٪</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">سفارش‌های در انتظار</div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono-tabular">
            {pendingTotal.length}
          </div>
          <div className="text-xs text-slate-500">منتظر رسیدن قیمت به نقطهٔ ورود</div>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(
            [
              ['active', `پوزیشن‌های فعال (${active.length})`],
              ['history', `تاریخچه بسته‌شده (${history.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                tab === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نماد..."
            className="w-full pr-9 pl-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-xs font-semibold text-slate-600">در حال بارگذاری...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <History className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              {tab === 'active' ? 'هیچ پوزیشن فعالی وجود ندارد' : 'هنوز معامله‌ای بسته نشده است'}
            </p>
            <p className="text-xs text-slate-500 max-w-lg mx-auto leading-6">
              وقتی سیگنالی واجد شرایط شود و قیمت به نقطهٔ ورودش برسد، سفارش به‌صورت خودکار اینجا
              باز می‌شود.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[1250px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    'نماد',
                    'وضعیت',
                    'جهت',
                    'اهرم',
                    'نقطه ورود',
                    'قیمت ورود',
                    'قیمت لحظه‌ای',
                    'حد ضرر',
                    'هدف ۱',
                    'هدف ۲',
                    'حجم / مارجین',
                    'سود / زیان',
                    'زمان',
                    'عملیات',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isOpen = expandedId === p._id;
                  const showPnl =
                    p.status === 'OPEN'
                      ? { pnl: p.unrealizedPnl || 0, pct: p.unrealizedPnlPct || 0 }
                      : {
                          pnl: p.realizedPnl || 0,
                          pct: p.margin ? ((p.realizedPnl || 0) / p.margin) * 100 : 0,
                        };
                  return (
                    <React.Fragment key={p._id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/70">
                        <td className="px-3 py-3">
                          <div className="text-xs font-bold text-slate-900">{p.symbol}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[130px]">
                            {p.label}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={p.status} tp1Hit={p.tp1Hit} />
                        </td>
                        <td className="px-3 py-3">
                          <SideBadge side={p.side} />
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-bold font-mono-tabular text-slate-700">
                            {p.leverage}x
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono-tabular text-slate-700">
                            {price(p.entryTarget)}
                          </span>
                          {p.status === 'PENDING' && (
                            <div className="text-[10px] text-amber-600 font-mono-tabular">
                              {p.triggerAbove ? 'منتظر صعود' : 'منتظر نزول'} (
                              {pct(p.distanceToEntryPct)})
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono-tabular text-blue-700 font-bold">
                            {price(p.entryPrice)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono-tabular text-slate-700">
                            {price(p.currentPrice)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono-tabular text-red-600">
                            {price(p.stopLoss)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`text-xs font-mono-tabular ${
                              p.tp1Hit ? 'text-slate-400 line-through' : 'text-emerald-600'
                            }`}
                          >
                            {price(p.takeProfit1)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono-tabular text-emerald-600">
                            {price(p.takeProfit2)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-[11px] font-mono-tabular text-slate-600">
                            {p.remainingQuantity.toFixed(6)}
                          </div>
                          <div className="text-[10px] font-mono-tabular text-slate-400">
                            مارجین {usd(p.margin)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <PnlCell pnl={showPnl.pnl} pnlPct={showPnl.pct} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-[10px] text-slate-500 font-mono-tabular whitespace-nowrap">
                            {dt(p.openedAt || p.createdAt)}
                          </div>
                          {p.closedAt && (
                            <div className="text-[10px] text-slate-400 font-mono-tabular whitespace-nowrap">
                              بستن: {dt(p.closedAt)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            {p.status !== 'CLOSED' && (
                              <button
                                type="button"
                                onClick={() => void handleClose(p._id)}
                                title={p.status === 'PENDING' ? 'لغو سفارش' : 'بستن پوزیشن'}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedId(isOpen ? null : p._id)}
                              title="جزئیات"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              {isOpen ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(p._id)}
                              title="حذف رکورد"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-b border-slate-200 bg-slate-50/60">
                          <td colSpan={14} className="px-4 py-4 space-y-3">
                            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                              <span>حجم کل: <span className="font-mono-tabular">{p.quantity.toFixed(6)}</span></span>
                              <span>ارزش قرارداد: <span className="font-mono-tabular">{usd(p.notional)}</span></span>
                              <span>مارجین: <span className="font-mono-tabular">{usd(p.margin)}</span></span>
                              <span>اهرم: <span className="font-mono-tabular">{p.leverage}x</span></span>
                              <span>امتیاز سیگنال: <span className="font-mono-tabular">{p.averageScore}</span></span>
                              <span>چرخه سیگنال: <span className="font-mono-tabular">#{p.signalCycleNumber}</span></span>
                              {p.closeReason && <span>علت بستن: {p.closeReason}</span>}
                            </div>

                            {(p.fills || []).length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-xs font-bold text-slate-900">
                                  ریز معاملات (Fills)
                                </div>
                                <div className="space-y-1">
                                  {p.fills.map((f, i) => (
                                    <div
                                      key={i}
                                      className="flex flex-wrap items-center gap-3 text-[11px] bg-white border border-slate-200 rounded-lg px-3 py-2"
                                    >
                                      <span className="font-bold text-slate-700">
                                        {f.type === 'OPEN'
                                          ? 'ورود'
                                          : f.type === 'PARTIAL_CLOSE'
                                            ? 'بستن جزئی'
                                            : 'بستن کامل'}
                                      </span>
                                      <span className="font-mono-tabular">
                                        قیمت {price(f.price)}
                                      </span>
                                      <span className="font-mono-tabular">
                                        حجم {f.quantity.toFixed(6)}
                                      </span>
                                      <span
                                        className={`font-mono-tabular font-bold ${
                                          f.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'
                                        }`}
                                      >
                                        {usd(f.pnl)}
                                      </span>
                                      <span className="text-slate-500">{f.note}</span>
                                      <span className="text-slate-400 font-mono-tabular mr-auto">
                                        {dt(f.at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
