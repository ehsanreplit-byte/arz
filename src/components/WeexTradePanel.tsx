import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Gauge,
  History,
  KeyRound,
  Layers,
  Loader2,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  apiClient,
  WeexApprovedSignalInfo,
  WeexPositionInfo,
  WeexSettingsInfo,
  WeexSnapshotInfo,
  WeexTickerInfo,
} from '../apiclient';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const fmtUsd = (v: number | undefined) =>
  `${Number(v || 0) >= 0 ? '' : '-'}$${Math.abs(Number(v || 0)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtPrice = (v: number | undefined) => {
  const n = Number(v || 0);
  if (!n) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 8 : n < 100 ? 4 : 2,
  });
};

const fmtPct = (v: number | undefined) => `${Number(v || 0) >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`;

const fmtDate = (iso: string | null | undefined) => {
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

const toNum = (value: string) => {
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function SideBadge({ side }: { side: 'LONG' | 'SHORT' }) {
  return side === 'LONG' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
      <TrendingUp className="w-3 h-3" /> خرید (LONG)
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
      <TrendingDown className="w-3 h-3" /> فروش (SHORT)
    </span>
  );
}

function ModeBadge({ mode }: { mode: 'paper' | 'live' }) {
  return mode === 'live' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-600 text-white whitespace-nowrap">
      <Radio className="w-3 h-3" /> واقعی
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
      <ShieldCheck className="w-3 h-3" /> مجازی
    </span>
  );
}

function StatusBadge({ status, tp1Hit }: { status: WeexPositionInfo['status']; tp1Hit: boolean }) {
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
        <Clock className="w-3 h-3" /> در انتظار ورود
      </span>
    );
  }
  if (status === 'OPEN') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
        <Activity className="w-3 h-3" /> {tp1Hit ? 'باز (TP1 زده شد)' : 'باز'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3" /> بسته شده
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'up' | 'down' | 'accent';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const valueTone =
    tone === 'up'
      ? 'text-emerald-600'
      : tone === 'down'
        ? 'text-red-600'
        : tone === 'accent'
          ? 'text-blue-600'
          : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className={`text-xl font-extrabold font-mono-tabular ${valueTone}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 leading-relaxed">{hint}</div>}
    </div>
  );
}

function WinLossCard({
  wins,
  losses,
}: {
  wins: number;
  losses: number;
  winRate: number;
}) {
  const total = wins + losses;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">تعداد سود / تعداد ضرر</span>
        <Layers className="w-4 h-4 text-slate-400" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            سود (برد)
          </div>
          <div className="text-xl font-extrabold font-mono-tabular text-emerald-600">{wins}</div>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <div className="text-[10px] font-bold text-red-700 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            ضرر (باخت)
          </div>
          <div className="text-xl font-extrabold font-mono-tabular text-red-600">{losses}</div>
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden flex" dir="ltr">
        <div
          className="h-full bg-emerald-500"
          style={{ width: total > 0 ? `${(wins / total) * 100}%` : '0%' }}
        />
        <div
          className="h-full bg-red-500"
          style={{ width: total > 0 ? `${(losses / total) * 100}%` : '0%' }}
        />
      </div>
      <div className="text-[11px] text-slate-500">
        از {total} معامله بسته‌شده · نرخ برد {total > 0 ? Math.round((wins / total) * 1000) / 10 : 0}%
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Position row
// ---------------------------------------------------------------------------
function PositionCard({
  pos,
  busy,
  onClose,
  onDelete,
  onSaveProtection,
}: {
  pos: WeexPositionInfo;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSaveProtection: (payload: {
    stopLoss?: number;
    takeProfit1?: number;
    takeProfit2?: number;
  }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState(String(pos.stopLoss || ''));
  const [tp1, setTp1] = useState(String(pos.takeProfit1 || ''));
  const [tp2, setTp2] = useState(String(pos.takeProfit2 || ''));

  useEffect(() => {
    setSl(String(pos.stopLoss || ''));
    setTp1(String(pos.takeProfit1 || ''));
    setTp2(String(pos.takeProfit2 || ''));
  }, [pos.stopLoss, pos.takeProfit1, pos.takeProfit2]);

  const up = (pos.displayPnl ?? pos.unrealizedPnl) >= 0;

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-extrabold text-slate-900">{pos.symbol}</span>
          <SideBadge side={pos.side} />
          <StatusBadge status={pos.status} tp1Hit={pos.tp1Hit} />
          <ModeBadge mode={pos.mode} />
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono-tabular">
            {pos.leverage}x
          </span>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
            {pos.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {pos.status === 'OPEN' && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              title="ویرایش حد ضرر / حد سود"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {pos.status !== 'CLOSED' && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {pos.status === 'PENDING' ? 'لغو سفارش' : 'بستن پوزیشن'}
            </button>
          )}
          {pos.status === 'CLOSED' && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
              title="حذف از تاریخچه"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div>
          <div className="text-[10px] text-slate-500">ورود (هدف / انجام‌شده)</div>
          <div className="font-mono-tabular font-bold text-slate-900">
            {fmtPrice(pos.entryTarget)}
            {pos.entryPrice > 0 && (
              <span className="text-slate-500 font-normal"> / {fmtPrice(pos.entryPrice)}</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">قیمت فعلی</div>
          <div className="font-mono-tabular font-bold text-slate-900">{fmtPrice(pos.currentPrice)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">حد ضرر</div>
          <div className="font-mono-tabular font-bold text-red-600">{fmtPrice(pos.stopLoss)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">حد سود ۱ / ۲</div>
          <div className="font-mono-tabular font-bold text-emerald-600">
            {fmtPrice(pos.takeProfit1)} / {fmtPrice(pos.takeProfit2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">حجم / مارجین</div>
          <div className="font-mono-tabular font-bold text-slate-900">
            {pos.remainingQuantity} / {fmtUsd(pos.margin)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">{pos.status === 'PENDING' ? 'فاصله تا ورود' : 'سود/زیان'}</div>
          {pos.status === 'PENDING' ? (
            <div className="font-mono-tabular font-bold text-amber-600">
              {fmtPct(pos.distanceToEntryPct)}
            </div>
          ) : (
            <div className={`font-mono-tabular font-extrabold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmtUsd(pos.displayPnl ?? pos.unrealizedPnl)}{' '}
              <span className="text-[10px] font-bold">
                ({fmtPct(pos.displayPnlPct ?? pos.unrealizedPnlPct)})
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>R:R {pos.riskRewardRatio}</span>
        <span>کارمزد: {fmtUsd(pos.feePaid)}</span>
        <span>سود محقق‌شده: {fmtUsd(pos.realizedPnl)}</span>
        <span>باز شده: {fmtDate(pos.openedAt || pos.createdAt)}</span>
        {pos.closedAt && <span>بسته شده: {fmtDate(pos.closedAt)}</span>}
        {pos.closeReason && <span className="text-slate-600">دلیل: {pos.closeReason}</span>}
        {pos.exchangeOrderId && (
          <span className="font-mono-tabular">شناسه صرافی: {pos.exchangeOrderId}</span>
        )}
      </div>

      {editing && (
        <div className="mt-1 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-600">حد ضرر</span>
              <input
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-600">حد سود ۱</span>
              <input
                value={tp1}
                onChange={(e) => setTp1(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-600">حد سود ۲</span>
              <input
                value={tp2}
                onChange={(e) => setTp2(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await onSaveProtection({
                  stopLoss: toNum(sl),
                  takeProfit1: toNum(tp1),
                  takeProfit2: toNum(tp2),
                });
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> ذخیره
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <span className="text-[10px] text-slate-500">
              در حالت واقعی، سفارش‌های TP/SL صرافی هم بازنویسی می‌شوند.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function WeexTradePanel() {
  const [snap, setSnap] = useState<WeexSnapshotInfo | null>(null);
  const [market, setMarket] = useState<WeexTickerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<'active' | 'history' | 'signals'>('active');

  // settings form
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'simulation'>('production');
  const [testResult, setTestResult] = useState<string | null>(null);

  // order form
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [limitPrice, setLimitPrice] = useState('');
  const [margin, setMargin] = useState('');
  const [leverage, setLeverage] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit1, setTakeProfit1] = useState('');
  const [takeProfit2, setTakeProfit2] = useState('');
  const [formSignalId, setFormSignalId] = useState<string | null>(null);

  const settings: WeexSettingsInfo | null = snap?.settings || null;
  const mode = snap?.mode || 'paper';
  const marketPrice = useMemo(
    () => market.find((t) => t.symbol === symbol.toUpperCase())?.lastPrice || 0,
    [market, symbol]
  );
  const positionSymbols = useMemo(
    () => (snap?.positions || []).map((p) => p.symbol),
    [snap]
  );

  // ---------------------------------------------------------------- loading
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiClient.getWeexSnapshot();
      setSnap(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری پنل WEEX');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMarket = useCallback(async () => {
    try {
      const res = await apiClient.getWeexMarket();
      setMarket(res.tickers || []);
    } catch {
      /* market list is optional */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMarket();
    const snapTimer = window.setInterval(() => void load(true), 8000);
    const marketTimer = window.setInterval(() => void loadMarket(), 30000);
    return () => {
      window.clearInterval(snapTimer);
      window.clearInterval(marketTimer);
    };
  }, [load, loadMarket]);

  // seed form defaults from settings / market
  const seededRef = useRef(false);
  useEffect(() => {
    if (!settings) return;
    setEnvironment(settings.environment);
    if (!seededRef.current) {
      seededRef.current = true;
      setLeverage(String(settings.leverage));
      const defaultMargin =
        settings.marginPerTradeUsd > 0
          ? settings.marginPerTradeUsd
          : settings.mode === 'live'
            ? Math.max(1, Math.round((snap?.stats.freeMargin || 100) * (settings.marginPerTradePct / 100)))
            : Math.max(1, Math.round(settings.paperBalance * (settings.marginPerTradePct / 100)));
      setMargin(String(defaultMargin));
    }
  }, [settings, snap?.stats.freeMargin]);

  useEffect(() => {
    if (!limitPrice && marketPrice > 0) setLimitPrice(String(marketPrice));
  }, [marketPrice, limitPrice]);

  useEffect(() => {
    if (!marketPrice) return;
    // keep untouched entry field in sync with the market while switching symbols
    if (orderType === 'MARKET') setLimitPrice(String(marketPrice));
  }, [marketPrice, orderType]);

  // ---------------------------------------------------------------- actions
  const run = async (fn: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (successMessage) setMessage(successMessage);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'عملیات ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  // keep the newest result visible even when the list is scrolled far down
  useEffect(() => {
    if (message) setToast({ type: 'ok', text: message });
    else if (error) setToast({ type: 'err', text: error });
  }, [message, error]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const saveSettings = (patch: Parameters<typeof apiClient.saveWeexSettings>[0], msg: string) =>
    run(async () => {
      await apiClient.saveWeexSettings(patch);
      if (patch.apiKey || patch.apiSecret || patch.passphrase || patch.clearCredentials) {
        setApiKey('');
        setApiSecret('');
        setPassphrase('');
      }
    }, msg);

  const handlePlaceOrder = () =>
    run(async () => {
      const entry =
        orderType === 'LIMIT' ? toNum(limitPrice) : marketPrice;
      if (!entry) throw new Error('قیمت ورود مشخص نیست.');
      const res = await apiClient.placeWeexOrder({
        symbol: symbol.toUpperCase(),
        side,
        orderType,
        margin: toNum(margin) || undefined,
        leverage: toNum(leverage) || undefined,
        limitPrice: orderType === 'LIMIT' ? entry : undefined,
        stopLoss: toNum(stopLoss),
        takeProfit1: toNum(takeProfit1),
        takeProfit2: toNum(takeProfit2) || undefined,
        signalId: formSignalId || undefined,
        note: formSignalId ? 'سفارش دستی از سیگنال' : 'سفارش دستی',
        mode,
      });
      setMessage(res.message);
      setFormSignalId(null);
    });

  const fillFromSignal = (signal: WeexApprovedSignalInfo) => {
    setSymbol(signal.symbol);
    setSide(signal.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG');
    setOrderType('LIMIT');
    setLimitPrice(String(signal.entryPrice));
    setStopLoss(String(signal.stopLoss));
    setTakeProfit1(String(signal.takeProfit1));
    setTakeProfit2(String(signal.takeProfit2 || ''));
    setFormSignalId(signal._id);
    setMessage(`سطوح سیگنال ${signal.symbol} در فرم بارگذاری شد.`);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tradeSignalNow = (signal: WeexApprovedSignalInfo) =>
    run(async () => {
      const res = await apiClient.tradeWeexSignal(signal._id, { mode });
      setMessage(res.message);
    });

  const applyRisk = (riskPct: number, rr: number) => {
    const entry = orderType === 'LIMIT' ? toNum(limitPrice) || marketPrice : marketPrice;
    if (!entry) return;
    const risk = (entry * riskPct) / 100;
    if (side === 'LONG') {
      setStopLoss((entry - risk).toFixed(entry < 1 ? 6 : 2));
      setTakeProfit1((entry + risk * rr).toFixed(entry < 1 ? 6 : 2));
      setTakeProfit2((entry + risk * rr * 1.6).toFixed(entry < 1 ? 6 : 2));
    } else {
      setStopLoss((entry + risk).toFixed(entry < 1 ? 6 : 2));
      setTakeProfit1((entry - risk * rr).toFixed(entry < 1 ? 6 : 2));
      setTakeProfit2((entry - risk * rr * 1.6).toFixed(entry < 1 ? 6 : 2));
    }
    setMessage(null);
  };

  if (loading && !snap) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 flex items-center justify-center gap-3 text-slate-600">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">در حال دریافت وضعیت ترید WEEX...</span>
      </div>
    );
  }

  const stats = snap?.stats;
  const positions = snap?.positions || [];
  const history = snap?.history || [];
  const approvedSignals = snap?.approvedSignals || [];
  const netUp = (stats?.netPnl || 0) >= 0;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header / mode */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-amber-400 text-slate-900 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </span>
              ترید WEEX — معامله فیوچرز با سیگنال‌های تأییدشده
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              ورود، حد ضرر و حد سود از سیگنال‌های تأییدشده گرفته می‌شود. حالت «مجازی» روی قیمت
              واقعی WEEX شبیه‌سازی می‌کند و حالت «واقعی» سفارش را با کلید API شما در صرافی ثبت
              می‌کند.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => void saveSettings({ mode: 'paper' }, 'حالت مجازی فعال شد.')}
                className={`px-3 py-2 text-[11px] font-bold transition-colors cursor-pointer ${
                  mode === 'paper' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                مجازی (Paper)
              </button>
              <button
                type="button"
                onClick={() => void saveSettings({ mode: 'live' }, 'حالت واقعی فعال شد.')}
                className={`px-3 py-2 text-[11px] font-bold transition-colors cursor-pointer ${
                  mode === 'live' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                واقعی (Live)
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                showSettings
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" /> تنظیمات و کلید API
            </button>
            <button
              type="button"
              onClick={() => void run(async () => { await apiClient.runWeexTick(); }, 'موتور یک بار اجرا شد.')}
              disabled={busy}
              className="px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> اجرای موتور
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${mode === 'live' ? 'bg-red-500' : 'bg-blue-500'}`} />
            حالت: {mode === 'live' ? 'واقعی' : 'مجازی'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Server className="w-3 h-3" />
            محیط: {environment === 'production' ? 'Production' : 'Simulation'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Radio className="w-3 h-3" />
            منبع قیمت: {snap?.engine.priceSource === 'weex' ? 'WEEX' : snap?.engine.priceSource === 'binance' ? 'Binance (پشتیبان)' : '—'}
          </span>
          <span>آخرین اجرا: {fmtDate(snap?.engine.lastTickAt)}</span>
          {snap?.engine.lastError && (
            <span className="text-amber-600 truncate max-w-full">{snap.engine.lastError}</span>
          )}
        </div>

        {message && (
          <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {message}
          </div>
        )}
        {error && (
          <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {settings && !settings.autoTrade && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-[11px] text-amber-800 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                <b>ارسال خودکار به پوزیشن خاموش است.</b> با این وضعیت، سیگنال‌های تأییدشده به‌صورت
                خودکار به پوزیشن/سفارش WEEX تبدیل نمی‌شوند. روشنش کنید تا هر سیگنال یک سفارش
                LIMIT روی نقطه ورود بسازد و با رسیدن قیمت، معامله فعال شود.
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSettings({ autoTrade: true }, 'ارسال خودکار سیگنال‌ها به پوزیشن فعال شد.')}
              className="px-3 py-2 rounded-lg text-[11px] font-extrabold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              روشن کردن ارسال خودکار
            </button>
          </div>
        )}
      </div>

      {/* Settings */}
      {showSettings && settings && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">کلید API صرافی WEEX (دسترسی کامل)</h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            کلید را در WEEX با مجوز Futures/Contract Trading بسازید. Secret و Passphrase فقط روی
            سرور ذخیره می‌شوند و هرگز در پاسخ API برگردانده نمی‌شوند.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">API Key</span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings.hasApiKey ? settings.maskedApiKey : 'وارد کنید...'}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">Secret Key</span>
              <input
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                type="password"
                placeholder={settings.hasApiSecret ? '•••••••• (ذخیره شده)' : 'وارد کنید...'}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">Passphrase</span>
              <input
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                type="password"
                placeholder={settings.hasPassphrase ? '•••••••• (ذخیره شده)' : 'وارد کنید...'}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">محیط</span>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as 'production' | 'simulation')}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-blue-500"
              >
                <option value="production">Production</option>
                <option value="simulation">Simulation</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">اهرم پیش‌فرض</span>
              <input
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                type="number"
                min={1}
                max={125}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">مارجین ثابت هر معامله ($)</span>
              <input
                key={`musd-${settings.marginPerTradeUsd}`}
                defaultValue={settings.marginPerTradeUsd}
                onBlur={(e) =>
                  void saveSettings(
                    { marginPerTradeUsd: toNum(e.target.value) },
                    'مارجین ثابت هر معامله ذخیره شد.'
                  )
                }
                type="number"
                min={0}
                step="1"
                placeholder="0 = استفاده از درصد"
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">TP1 (% پوزیشن)</span>
              <input
                key={`tp1-${settings.tp1ClosePct}`}
                defaultValue={settings.tp1ClosePct}
                onBlur={(e) => void saveSettings({ tp1ClosePct: toNum(e.target.value) }, 'درصد TP1 ذخیره شد.')}
                type="number"
                min={1}
                max={100}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">کارمزد (%)</span>
              <input
                key={`fee-${settings.feeRatePct}`}
                defaultValue={settings.feeRatePct}
                onBlur={(e) => void saveSettings({ feeRatePct: toNum(e.target.value) }, 'کارمزد ذخیره شد.')}
                type="number"
                step="0.01"
                min={0}
                max={5}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">سرمایه مجازی ($)</span>
              <input
                key={`bal-${settings.paperInitialBalance}`}
                defaultValue={settings.paperInitialBalance}
                onBlur={(e) => void saveSettings({ paperInitialBalance: toNum(e.target.value) }, 'سرمایه مجازی ذخیره شد.')}
                type="number"
                min={10}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoTrade}
                onChange={(e) => void saveSettings({ autoTrade: e.target.checked }, e.target.checked ? 'معامله خودکار فعال شد.' : 'معامله خودکار غیرفعال شد.')}
                className="w-4 h-4 accent-blue-600"
              />
              معامله خودکار روی سیگنال‌های تأییدشده
            </label>
            <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.pullbackOnly}
                onChange={(e) => void saveSettings({ pullbackOnly: e.target.checked }, 'فیلتر ورود ذخیره شد.')}
                className="w-4 h-4 accent-blue-600"
              />
              فقط ورود پولبک (رد شکست)
            </label>
            <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-700">
              مارجین درصدی (اگر مبلغ ثابت صفر باشد):
              <input
                key={`margin-${settings.marginPerTradePct}`}
                defaultValue={settings.marginPerTradePct}
                onBlur={(e) => void saveSettings({ marginPerTradePct: toNum(e.target.value) }, 'درصد مارجین ذخیره شد.')}
                type="number"
                min={1}
                max={100}
                className="w-16 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
              %
              {settings.marginPerTradeUsd > 0 && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  مبلغ ثابت {settings.marginPerTradeUsd}$ فعال است
                </span>
              )}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  await apiClient.saveWeexSettings({
                    apiKey: apiKey || undefined,
                    apiSecret: apiSecret || undefined,
                    passphrase: passphrase || undefined,
                    environment,
                    leverage: toNum(leverage) || undefined,
                  });
                  setApiKey('');
                  setApiSecret('');
                  setPassphrase('');
                }, 'تنظیمات WEEX ذخیره شد.')
              }
              disabled={busy}
              className="px-3.5 py-2 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> ذخیره تنظیمات
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  const res = await apiClient.testWeexConnection({
                    apiKey: apiKey || undefined,
                    apiSecret: apiSecret || undefined,
                    passphrase: passphrase || undefined,
                    environment,
                  });
                  setTestResult(res.message);
                  if (!res.ok) throw new Error(res.message);
                }, 'اتصال به WEEX تأیید شد.')
              }
              disabled={busy}
              className="px-3.5 py-2 rounded-lg text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} تست اتصال
            </button>
            <button
              type="button"
              onClick={() => void saveSettings({ clearCredentials: true }, 'کلیدهای API پاک شدند.')}
              disabled={busy}
              className="px-3.5 py-2 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              پاک کردن کلیدها
            </button>
            {testResult && (
              <span className="text-[11px] text-slate-600 max-w-full">{testResult}</span>
            )}
            {settings.lastTestMessage && !testResult && (
              <span
                className={`text-[11px] ${
                  settings.lastTestStatus === 'success' ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                آخرین تست: {settings.lastTestMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={mode === 'live' ? 'موجودی آزاد USDT (صرافی)' : 'موجودی آزاد (مجازی)'}
              value={fmtUsd(stats.balance)}
              hint={mode === 'live' ? 'خوانده‌شده از حساب واقعی WEEX' : `سرمایه اولیه: ${fmtUsd(stats.initialBalance)}`}
              icon={Wallet}
              tone="accent"
            />
            <StatCard
              label="ارزش خالص حساب"
              value={fmtUsd(stats.equity)}
              hint={`مارجین درگیر: ${fmtUsd(stats.usedMargin)}`}
              icon={Gauge}
            />
            <StatCard
              label="سود/زیان باز"
              value={fmtUsd(stats.unrealizedPnl)}
              hint={`${stats.openPositions} پوزیشن باز · ${stats.pendingOrders} سفارش در انتظار`}
              icon={stats.unrealizedPnl >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={stats.unrealizedPnl >= 0 ? 'up' : 'down'}
            />
            <StatCard
              label="سود/زیان کل"
              value={fmtUsd(stats.netPnl)}
              hint={`${stats.closedTrades} معامله بسته · نرخ برد ${stats.winRate}%`}
              icon={netUp ? TrendingUp : TrendingDown}
              tone={netUp ? 'up' : 'down'}
            />
          </div>

          {/* Closed-trades PnL + win/loss counters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="سود/زیان پوزیشن‌های بسته‌شده"
              value={fmtUsd(stats.realizedPnl)}
              hint={`مجموع ${stats.closedTrades} معامله بسته‌شده · کارمزد پرداخت‌شده: ${fmtUsd(stats.totalFees)}`}
              icon={stats.realizedPnl >= 0 ? TrendingUp : TrendingDown}
              tone={stats.realizedPnl >= 0 ? 'up' : 'down'}
            />
            <WinLossCard
              wins={stats.winCount}
              losses={stats.lossCount}
              winRate={stats.winRate}
            />
          </div>
        </div>
      )}

      {/* Order ticket + signals */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" /> ثبت سفارش / معامله سیگنال
            </h4>
            <span className="text-[10px] font-bold text-slate-500 font-mono-tabular">
              قیمت بازار: {fmtPrice(marketPrice)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="block col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-600">نماد</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                list="weex-symbols"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular font-bold outline-none focus:border-blue-500"
              />
              <datalist id="weex-symbols">
                {market.slice(0, 120).map((t) => (
                  <option key={t.symbol} value={t.symbol} />
                ))}
                {positionSymbols.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-600">جهت</span>
              <div className="mt-1 grid grid-cols-2 rounded-lg border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSide('LONG')}
                  className={`py-2 text-[11px] font-extrabold transition-colors cursor-pointer ${
                    side === 'LONG' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  خرید
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SHORT')}
                  className={`py-2 text-[11px] font-extrabold transition-colors cursor-pointer ${
                    side === 'SHORT' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  فروش
                </button>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-600">نوع سفارش</span>
              <div className="mt-1 grid grid-cols-2 rounded-lg border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOrderType('LIMIT')}
                  className={`py-2 text-[11px] font-bold transition-colors cursor-pointer ${
                    orderType === 'LIMIT' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  LIMIT
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('MARKET')}
                  className={`py-2 text-[11px] font-bold transition-colors cursor-pointer ${
                    orderType === 'MARKET' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  MARKET
                </button>
              </div>
            </div>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">مارجین ($)</span>
              <input
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                type="number"
                min={1}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">قیمت ورود</span>
              <input
                value={orderType === 'MARKET' ? String(marketPrice || '') : limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                disabled={orderType === 'MARKET'}
                type="number"
                step="any"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-600">اهرم</span>
              <input
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                type="number"
                min={1}
                max={125}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-red-600">حد ضرر (SL)</span>
              <input
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                type="number"
                step="any"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-xs font-mono-tabular outline-none focus:border-red-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-emerald-600">حد سود ۱ (TP1)</span>
              <input
                value={takeProfit1}
                onChange={(e) => setTakeProfit1(e.target.value)}
                type="number"
                step="any"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-emerald-200 bg-white text-xs font-mono-tabular outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            <label className="block">
              <span className="text-[11px] font-bold text-emerald-600">حد سود ۲ (TP2 — اختیاری)</span>
              <input
                value={takeProfit2}
                onChange={(e) => setTakeProfit2(e.target.value)}
                type="number"
                step="any"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-emerald-200 bg-white text-xs font-mono-tabular outline-none focus:border-emerald-500"
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500">سریع:</span>
              {[
                { r: 0.5, rr: 2 },
                { r: 1, rr: 2 },
                { r: 2, rr: 2 },
                { r: 1, rr: 3 },
                { r: 2, rr: 3 },
              ].map((opt) => (
                <button
                  key={`${opt.r}-${opt.rr}`}
                  type="button"
                  onClick={() => applyRisk(opt.r, opt.rr)}
                  className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {opt.r}% / 1:{opt.rr}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handlePlaceOrder()}
              disabled={busy}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-2 ${
                side === 'LONG' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {side === 'LONG' ? 'ثبت خرید' : 'ثبت فروش'} ({mode === 'live' ? 'واقعی' : 'مجازی'})
            </button>
            {formSignalId && (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                متصل به سیگنال
              </span>
            )}
            <span className="text-[10px] text-slate-500 leading-relaxed">
              حجم به‌صورت خودکار از مارجین × اهرم محاسبه و به stepSize نماد گرد می‌شود.
              مارجین پیش‌فرض از تنظیمات خوانده می‌شود
              {settings?.marginPerTradeUsd ? ` (${settings.marginPerTradeUsd}$ ثابت)` : ' (درصدی)'}.
            </span>
          </div>
        </div>

        {/* Approved signals */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> سیگنال‌های تأییدشده
            </h4>
            <span className="text-[10px] font-bold text-slate-500">{approvedSignals.length}</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
            {approvedSignals.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 leading-relaxed">
                هنوز سیگنال تأییدشده‌ای در ۲۴ ساعت گذشته ثبت نشده است.
                <br />
                از منوی «سیگنال‌ها» یک چرخه اجرا کنید.
              </div>
            ) : (
              approvedSignals.map((signal) => (
                <div key={signal._id} className="p-3 space-y-2 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900">{signal.symbol}</span>
                      <SideBadge side={signal.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG'} />
                      {signal.alreadyTraded ? (
                        <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                          در پوزیشن است
                        </span>
                      ) : signal.tradable ? (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                          قابل ارسال
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                          قابل معامله نیست
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">{fmtDate(signal.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono-tabular">
                    <div>
                      <span className="text-slate-400 block">ورود</span>
                      <span className="font-bold text-slate-900">{fmtPrice(signal.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">SL</span>
                      <span className="font-bold text-red-600">{fmtPrice(signal.stopLoss)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">TP1</span>
                      <span className="font-bold text-emerald-600">{fmtPrice(signal.takeProfit1)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>R:R {signal.riskRewardRatio}</span>
                    <span>
                      فاصله تا ورود: {fmtPct(signal.distanceToEntryPct)}
                    </span>
                  </div>
                  {!signal.tradable && signal.tradeBlockReason && (
                    <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-relaxed">
                      {signal.tradeBlockReason}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy || !signal.tradable}
                      title={signal.tradeBlockReason || undefined}
                      onClick={() => void tradeSignalNow(signal)}
                      className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-extrabold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      ارسال به پوزیشن
                    </button>
                    <button
                      type="button"
                      onClick={() => fillFromSignal(signal)}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      در فرم
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live exchange state */}
      {mode === 'live' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-500" /> وضعیت حساب واقعی WEEX
          </h4>
          {snap?.live.error && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {snap.live.error}
            </div>
          )}
          {snap?.live.connected ? (
            <>
              <div className="flex flex-wrap gap-2">
                {snap.live.balances.map((b) => (
                  <span
                    key={b.asset}
                    className="text-[11px] font-mono-tabular bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  >
                    <b className="text-slate-900">{b.asset}</b> — آزاد {b.availableBalance} / کل {b.balance}
                  </span>
                ))}
                {snap.live.accountConfig && (
                  <span className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    اجازه معامله: {snap.live.accountConfig.canTrade ? 'دارد' : 'ندارد'} · حالت هج:
                    {snap.live.accountConfig.dualSidePosition ? ' دوطرفه' : ' یک‌طرفه'}
                  </span>
                )}
              </div>
              {snap.live.accountConfig && !snap.live.accountConfig.dualSidePosition && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                  حساب شما در حالت یک‌طرفه (One-way) است. برای ثبت سفارش با جهت LONG/SHORT
                  پیشنهاد می‌شود در تنظیمات WEEX حالت پوزیشن را روی «دوطرفه / Hedge» بگذارید.
                </div>
              )}
              {snap.live.exchangePositions.length === 0 ? (
                <p className="text-xs text-slate-500">هیچ پوزیشن باز واقعی روی صرافی وجود ندارد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-right py-2">نماد</th>
                        <th className="text-right py-2">جهت</th>
                        <th className="text-right py-2">حجم</th>
                        <th className="text-right py-2">ورود</th>
                        <th className="text-right py-2">اهرم</th>
                        <th className="text-right py-2">سود/زیان</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.live.exchangePositions.map((p) => (
                        <tr key={`${p.symbol}-${p.side}`} className="border-b border-slate-100">
                          <td className="py-2 font-bold">{p.symbol}</td>
                          <td className="py-2">{p.side}</td>
                          <td className="py-2 font-mono-tabular">{p.size}</td>
                          <td className="py-2 font-mono-tabular">{fmtPrice(p.entryPrice)}</td>
                          <td className="py-2 font-mono-tabular">{p.leverage}x</td>
                          <td
                            className={`py-2 font-mono-tabular font-bold ${
                              p.unrealizedPnl >= 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {fmtUsd(p.unrealizedPnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            !snap?.live.error && <p className="text-xs text-slate-500">در حال دریافت اطلاعات حساب...</p>
          )}
        </div>
      )}

      {/* Positions / history tabs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {[
              { id: 'active' as const, label: `پوزیشن‌ها (${positions.length})`, icon: Activity },
              { id: 'history' as const, label: `تاریخچه (${history.length})`, icon: History },
              { id: 'signals' as const, label: `سیگنال‌ها (${approvedSignals.length})`, icon: Zap },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    tab === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {item.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {mode === 'paper' && (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await apiClient.resetWeexPaper();
                  }, 'حساب مجازی WEEX ریست شد.')
                }
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                ریست حساب مجازی
              </button>
            )}
            {tab === 'signals' && approvedSignals.length > 0 && (
              <button
                type="button"
                disabled={busy || !approvedSignals.some((s) => s.tradable)}
                onClick={() =>
                  void run(async () => {
                    const res = await apiClient.tradeAllWeexSignals({ mode, orderType: 'LIMIT' });
                    setMessage(
                      `${res.created} سیگنال به پوزیشن ارسال شد` +
                        (res.skipped > 0 ? ` — ${res.skipped} مورد رد شد` : '') +
                        (res.notes.length > 0 ? ` | ${res.notes[0]}` : '')
                    );
                  })
                }
                className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                ارسال همه به پوزیشن
              </button>
            )}
            {tab === 'history' && history.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await apiClient.clearWeexHistory();
                  }, 'تاریخچه پاک شد.')
                }
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                پاک کردن تاریخچه
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {tab === 'active' &&
            (positions.length === 0 ? (
              <div className="p-8 text-center space-y-1.5">
                <p className="text-xs font-bold text-slate-700">هیچ سفارش فعالی وجود ندارد</p>
                <p className="text-[11px] text-slate-500">
                  از فرم بالا یا از لیست سیگنال‌های تأییدشده یک معامله بسازید.
                </p>
              </div>
            ) : (
              positions.map((pos) => (
                <PositionCard
                  key={pos._id}
                  pos={pos}
                  busy={busy}
                  onClose={() =>
                    void run(async () => {
                      const res = await apiClient.closeWeexPosition(pos._id);
                      setMessage(res.message);
                    })
                  }
                  onDelete={() =>
                    void run(async () => {
                      await apiClient.deleteWeexPosition(pos._id);
                    }, 'پوزیشن حذف شد.')
                  }
                  onSaveProtection={async (payload) => {
                    setBusy(true);
                    try {
                      const res = await apiClient.updateWeexProtection(pos._id, payload);
                      setMessage(res.message);
                      await load(true);
                    } catch (err: any) {
                      setError(err?.message || 'ذخیره حدود ناموفق بود');
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ))
            ))}

          {tab === 'signals' &&
            (approvedSignals.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">سیگنال تأییدشده‌ای موجود نیست.</p>
            ) : (
              <div className="space-y-2">
                {approvedSignals.map((signal) => (
                  <div
                    key={signal._id}
                    className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold">{signal.symbol}</span>
                      <SideBadge side={signal.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG'} />
                      <span className="text-[10px] text-slate-500">
                        ورود {fmtPrice(signal.entryPrice)} · SL {fmtPrice(signal.stopLoss)} · TP1{' '}
                        {fmtPrice(signal.takeProfit1)} · TP2 {fmtPrice(signal.takeProfit2)}
                      </span>
                      {!signal.tradable && signal.tradeBlockReason && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                          {signal.tradeBlockReason}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fillFromSignal(signal)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 border border-slate-200 hover:bg-slate-200 cursor-pointer"
                      >
                        در فرم
                      </button>
                      <button
                        type="button"
                        disabled={busy || !signal.tradable}
                        title={signal.tradeBlockReason || undefined}
                        onClick={() => void tradeSignalNow(signal)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                      >
                        ارسال به پوزیشن
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'history' &&
            (history.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">تاریخچه‌ای ثبت نشده است.</p>
            ) : (
              history.map((pos) => (
                <PositionCard
                  key={pos._id}
                  pos={pos}
                  busy={busy}
                  onClose={() => undefined}
                  onDelete={() =>
                    void run(async () => {
                      await apiClient.deleteWeexPosition(pos._id);
                    }, 'رکورد حذف شد.')
                  }
                  onSaveProtection={async () => undefined}
                />
              ))
            ))}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-5 z-50 max-w-[92vw] sm:max-w-md px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-start gap-2 ${
            toast.type === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="mr-auto text-white/80 hover:text-white cursor-pointer"
            aria-label="بستن"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
