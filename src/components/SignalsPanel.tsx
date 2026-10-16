import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  MinusCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  apiClient,
  RegisteredSignalInfo,
  SignalEngineStatus,
  SignalMethodItem,
} from '../apiclient';

const formatPrice = (val: number | undefined) => {
  if (val === undefined || val === null || isNaN(val) || val === 0) return '—';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: val < 1 ? 6 : 2,
  });
};

const formatDateTimeFa = (iso: string | null) => {
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

const formatCountdown = (targetIso: string | null) => {
  if (!targetIso) return '—';
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return 'در حال اجرا...';
  const totalSec = Math.floor(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')} دقیقه`;
};

function DirectionBadge({ direction }: { direction: 'LONG' | 'SHORT' | 'NO TRADE' }) {
  if (direction === 'LONG') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        <TrendingUp className="w-3 h-3" />
        خرید (LONG)
      </span>
    );
  }
  if (direction === 'SHORT') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
        <TrendingDown className="w-3 h-3" />
        فروش (SHORT)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
      بدون معامله
    </span>
  );
}

function SignalsBreakdown({ items }: { items: SignalMethodItem[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-slate-500">جزئیات سیگنال ثبت نشده است.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {items.map((s) => (
        <div
          key={s.id}
          className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-900 leading-5">
              {s.title}
              {s.isSummary && (
                <span className="mr-1 text-[9px] font-bold text-slate-400">(بدون رأی)</span>
              )}
            </span>
            <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
              {s.score}
            </span>
          </div>
          <DirectionBadge direction={s.direction} />
          <div className="text-[11px] text-slate-500 leading-5">{s.setupName}</div>
          <div className="text-[10px] font-mono-tabular text-slate-400">
            {formatPrice(s.entryPrice)} → {formatPrice(s.takeProfit1)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SignalsPanel() {
  const [signals, setSignals] = useState<RegisteredSignalInfo[]>([]);
  const [status, setStatus] = useState<SignalEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<
    'ALL' | 'QUALIFIED' | 'LONG' | 'SHORT'
  >('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const pollRef = useRef<number | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [signalsRes, statusRes] = await Promise.all([
        apiClient.getSignals(),
        apiClient.getSignalsStatus(),
      ]);
      setSignals(signalsRes.signals || []);
      setStatus(statusRes.status);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری سیگنال‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const interval = window.setInterval(() => {
      void loadAll(true);
    }, 5000);
    pollRef.current = interval;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loadAll]);

  // 1s ticker for the "next run" countdown
  useEffect(() => {
    const t = window.setInterval(() => forceTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const handleRunNow = async () => {
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await apiClient.runSignalsNow();
      setActionMessage(res.message || 'چرخه سیگنال‌ها آغاز شد.');
      void loadAll(true);
    } catch (err: any) {
      setActionMessage(err?.message || 'اجرای چرخه سیگنال ناموفق بود.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleScheduler = async () => {
    setActionBusy(true);
    try {
      const res = await apiClient.toggleSignalsScheduler();
      setStatus(res.status);
      setActionMessage(
        res.isSchedulerEnabled
          ? 'زمان‌بند خودکار ۳۰ دقیقه‌ای فعال شد.'
          : 'زمان‌بند خودکار غیرفعال شد.'
      );
    } catch (err: any) {
      setActionMessage(err?.message || 'تغییر وضعیت زمان‌بند ناموفق بود.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiClient.deleteSignal(id);
      setSignals(res.signals || []);
      setActionMessage('سیگنال حذف شد.');
    } catch (err: any) {
      setActionMessage(err?.message || 'حذف سیگنال ناموفق بود.');
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('آیا از پاک‌سازی تمام سیگنال‌های ثبت‌شده مطمئن هستید؟')) return;
    try {
      await apiClient.clearSignals();
      setSignals([]);
      setActionMessage('تمام سیگنال‌ها پاک شدند.');
    } catch (err: any) {
      setActionMessage(err?.message || 'پاک‌سازی سیگنال‌ها ناموفق بود.');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return signals
      .filter((s) => {
        if (directionFilter === 'QUALIFIED' && !s.isQualified) return false;
        if (
          (directionFilter === 'LONG' || directionFilter === 'SHORT') &&
          s.consensusDirection !== directionFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          s.symbol.toUpperCase().includes(q) || (s.label || '').toUpperCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Qualified rows always float to the top, then newest first.
        if (a.isQualified !== b.isQualified) return a.isQualified ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [signals, search, directionFilter]);

  const qualifiedCount = signals.filter((s) => s.isQualified).length;
  const buyCount = signals.filter(
    (s) => s.isQualified && s.consensusDirection === 'LONG'
  ).length;
  const sellCount = signals.filter(
    (s) => s.isQualified && s.consensusDirection === 'SHORT'
  ).length;
  const isRunning = status?.isRunning || false;

  return (
    <div className="space-y-6">
      {/* Header / Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-blue-600" />
              سیگنال‌های توافقی ال بروکس
            </h2>
            <p className="text-xs text-slate-500 leading-6">
              هر {Math.round((status?.cycleIntervalMs || 1800000) / 60000)} دقیقه روی تایم‌فریم{' '}
              <span className="font-mono-tabular font-bold">{status?.timeframe || '15m'}</span> برای
              تمام ارزهای لیست قیمت لحظه‌ای، درخواست تحلیل به ChatGPT با فاصله زمانی{' '}
              <span className="font-mono-tabular font-bold">
                {Math.round((status?.requestGapMs || 30000) / 1000)} ثانیه
              </span>{' '}
              ارسال می‌شود. نتیجهٔ هر ۶ سیگنال برای <span className="font-bold text-slate-900">تمام ارزهای اضافه‌شده</span> در جدول زیر
              ثبت می‌شود و ارزهایی که حداقل{' '}
              <span className="font-bold text-blue-600">{status?.minConsensus || 3}</span> سیگنال خرید
              یا فروش صادر کنند با برچسب «واجد شرایط» مشخص می‌شوند.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleScheduler}
              disabled={actionBusy}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                status?.isSchedulerEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{status?.isSchedulerEnabled ? 'زمان‌بند فعال' : 'زمان‌بند غیرفعال'}</span>
            </button>

            <button
              type="button"
              onClick={handleRunNow}
              disabled={actionBusy || isRunning}
              className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{isRunning ? 'در حال اجرا...' : 'اجرای فوری چرخه'}</span>
            </button>

            <button
              type="button"
              onClick={() => void loadAll()}
              className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live cycle status strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">شماره چرخه</div>
            <div className="text-sm font-extrabold font-mono-tabular text-slate-900">
              #{status?.cycleNumber ?? 0}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">اجرای بعدی</div>
            <div className="text-sm font-extrabold font-mono-tabular text-blue-600">
              {status?.isSchedulerEnabled ? formatCountdown(status?.nextRunAt || null) : 'غیرفعال'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">وضعیت فعلی</div>
            <div className="text-sm font-extrabold text-slate-900">
              {isRunning
                ? `در حال پردازش ${status?.currentSymbol || ''} (${status?.currentIndex}/${
                    status?.totalSymbols
                  })`
                : 'آماده'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[11px] text-slate-500">آخرین چرخه</div>
            <div className="text-sm font-extrabold text-slate-900">
              {status?.lastFinishedAt
                ? `${status?.registeredLastCycle ?? 0} ثبت از ${
                    status?.evaluatedLastCycle ?? 0
                  } ارزیابی`
                : 'هنوز اجرا نشده'}
            </div>
            <div className="text-[11px] font-semibold text-emerald-600 font-mono-tabular">
              ارسال مستقیم به ترید: {status?.dispatchedLastCycle ?? 0}
            </div>
          </div>
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            <span className="text-xs font-semibold text-blue-800">
              چرخه در حال اجراست. با توجه به فاصله ۳۰ ثانیه‌ای بین درخواست‌های ChatGPT، تکمیل هر
              چرخه چند دقیقه طول می‌کشد.
            </span>
          </div>
        )}

        {actionMessage && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-xs font-semibold text-slate-700">{actionMessage}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
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

        {status?.lastError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-800">
              خطای آخرین چرخه: {status.lastError}
            </span>
          </div>
        )}
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">کل ارزهای بررسی‌شده</div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono-tabular">
            {signals.length}
          </div>
          <div className="text-xs text-slate-500">از لیست قیمت لحظه‌ای</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">
            واجد شرایط (حداقل {status?.minConsensus || 3} سیگنال)
          </div>
          <div className="text-2xl font-extrabold text-blue-600 font-mono-tabular">
            {qualifiedCount}
          </div>
          <div className="text-xs text-blue-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>توافق تأییدشده</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">سیگنال خرید (LONG)</div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono-tabular">
            {buyCount}
          </div>
          <div className="text-xs text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>اکثریت صعودی</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">سیگنال فروش (SHORT)</div>
          <div className="text-2xl font-extrabold text-red-600 font-mono-tabular">{sellCount}</div>
          <div className="text-xs text-red-600 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>اکثریت نزولی</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نماد یا نام ارز..."
            className="w-full pr-9 pl-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              ['ALL', 'همه'],
              ['QUALIFIED', 'واجد شرایط'],
              ['LONG', 'خرید'],
              ['SHORT', 'فروش'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDirectionFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                directionFilter === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 font-mono-tabular">
          {filtered.length} / {signals.length}
        </div>
      </div>

      {/* Signals table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-xs font-semibold text-slate-600">
              در حال بارگذاری سیگنال‌ها...
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Target className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              هنوز ارزی بررسی نشده است
            </p>
            <p className="text-xs text-slate-500 max-w-lg mx-auto leading-6">
              با دکمه «اجرای فوری چرخه» اولین ارزیابی را انجام دهید. تمام ارزهای لیست قیمت
              لحظه‌ای بررسی می‌شوند و با قیمت لحظه‌ای و وضعیت ۶ سیگنال ال بروکس در این جدول
              نمایش داده می‌شوند.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    ارز
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    وضعیت
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    جهت توافق
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    سیگنال خرید
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    سیگنال فروش
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    توافق
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    امتیاز
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    قیمت لحظه‌ای
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    ورود
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    حد ضرر
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    هدف ۱
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    هدف ۲
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    R:R
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    ChatGPT
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    زمان ثبت
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sig) => {
                  const isOpen = expandedId === sig._id;
                  const isLong = sig.consensusDirection === 'LONG';
                  return (
                    <React.Fragment key={sig._id}>
                      <tr
                        className={`border-b border-slate-100 hover:bg-slate-50/70 ${
                          sig.isQualified ? '' : 'bg-slate-50/40'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="text-xs font-bold text-slate-900">{sig.symbol}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                            {sig.label}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {sig.isQualified ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3" />
                                واجد شرایط
                              </span>
                              {sig.dispatchedToTrade ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                  <ArrowRightLeft className="w-3 h-3" />
                                  به ترید ارسال شد
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap max-w-[220px] truncate"
                                  title={sig.tradeDispatchNote || ''}
                                >
                                  {sig.tradeStatus === 'BREAKOUT_REJECTED'
                                    ? 'رد شد: ورود شکست (فقط پولبک)'
                                    : sig.tradeStatus === 'SYMBOL_ACTIVE_OR_NO_MARGIN'
                                    ? 'نماد فعال دارد / مارجین کم'
                                    : sig.tradeDispatchNote || 'سفارش ساخته نشد'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                              <MinusCircle className="w-3 h-3" />
                              رد شده
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <DirectionBadge direction={sig.consensusDirection} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-extrabold text-emerald-600 font-mono-tabular">
                            {sig.buySignalsCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-extrabold text-red-600 font-mono-tabular">
                            {sig.sellSignalsCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-bold font-mono-tabular ${
                              isLong ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {sig.matchedSignalsCount}/{sig.totalSignalsChecked}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold font-mono-tabular text-slate-700">
                            {sig.averageScore}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono-tabular text-slate-700">
                            {formatPrice(sig.currentPrice)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono-tabular text-blue-700 font-bold">
                            {formatPrice(sig.entryPrice)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono-tabular text-red-600">
                            {formatPrice(sig.stopLoss)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono-tabular text-emerald-600">
                            {formatPrice(sig.takeProfit1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono-tabular text-emerald-600">
                            {formatPrice(sig.takeProfit2)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono-tabular text-slate-700 whitespace-nowrap">
                            {sig.riskRewardRatio}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Sparkles
                              className={`w-3.5 h-3.5 shrink-0 ${
                                sig.chatGptStatus === 'موفق'
                                  ? 'text-blue-600'
                                  : 'text-amber-500'
                              }`}
                            />
                            <span className="text-[11px] text-slate-600 whitespace-nowrap">
                              {sig.chatGptDirection === 'NO TRADE'
                                ? sig.chatGptStatus
                                : sig.chatGptDirection}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] text-slate-500 font-mono-tabular whitespace-nowrap">
                            {formatDateTimeFa(sig.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isOpen ? null : sig._id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="جزئیات"
                            >
                              {isOpen ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(sig._id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-b border-slate-200 bg-slate-50/60">
                          <td colSpan={16} className="px-4 py-4 space-y-4">
                            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                تایم‌فریم: <span className="font-mono-tabular">{sig.interval}</span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5" />
                                چرخه شماره <span className="font-mono-tabular">{sig.cycleNumber}</span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                موتور: {sig.aiEngineUsed}
                              </span>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs font-bold text-slate-900">
                                جزئیات ۶ سیگنال ال بروکس
                              </div>
                              <SignalsBreakdown items={sig.signalsBreakdown} />
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-slate-500" />
                                سیگنال تک‌روش ال بروکس (رأی مستقل)
                              </div>
                              <div className="text-[11px] text-slate-500">
                                جهت:{' '}
                                {!sig.singleMethodDirection ||
                                sig.singleMethodDirection === 'NO TRADE'
                                  ? 'بدون رأی'
                                  : sig.singleMethodDirection === 'LONG'
                                  ? 'خرید (LONG)'
                                  : 'فروش (SHORT)'}
                              </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                نظر ChatGPT — {sig.chatGptSetupName || 'بدون ستاپ'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                وضعیت: {sig.chatGptStatus} · جهت:{' '}
                                {sig.chatGptDirection === 'NO TRADE'
                                  ? 'بدون معامله'
                                  : sig.chatGptDirection}
                              </div>
                              <p className="text-xs text-slate-700 leading-6">
                                {sig.chatGptReasoning || '—'}
                              </p>
                            </div>
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
