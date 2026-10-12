import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Loader2,
  Lock,
  Percent,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AccountSnapshot, apiClient } from '../apiclient';

const usd = (v: number | undefined) => {
  const n = Number(v || 0);
  return `${n >= 0 ? '' : '-'}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const pct = (v: number | undefined) => `${Number(v || 0).toFixed(2)}%`;

export function AccountPanel() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leverage, setLeverage] = useState('5');
  const [marginPct, setMarginPct] = useState('20');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.getAccount();
      setSnapshot(res);
      setLeverage(String(res.account.leverage));
      setMarginPct(String(res.account.marginPerTradePct));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری حساب کاربری');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiClient.saveAccountSettings({
        leverage: Number(leverage),
        marginPerTradePct: Number(marginPct),
      });
      setSnapshot(res);
      setMessage('تنظیمات حساب ذخیره شد.');
    } catch (err: any) {
      setMessage(err?.message || 'ذخیره تنظیمات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        'حساب به ۱۰۰ دلار بازگردانده و همهٔ پوزیشن‌ها پاک می‌شوند. مطمئن هستید؟'
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiClient.resetAccount();
      setSnapshot(res);
      setMessage('حساب با ۱۰۰ دلار مجازی شارژ مجدد شد.');
    } catch (err: any) {
      setMessage(err?.message || 'شارژ مجدد ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center gap-2">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        <span className="text-xs font-semibold text-slate-600">در حال بارگذاری حساب...</span>
      </div>
    );
  }

  const s = snapshot?.stats;
  const totalPnl = (s?.realizedPnl || 0) + (s?.unrealizedPnl || 0);
  const isUp = totalPnl >= 0;

  return (
    <div className="space-y-6">
      {/* Main balance card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs text-slate-500">حساب معاملاتی مجازی</div>
              <div className="text-lg font-extrabold text-slate-900">
                موجودی کل: <span className="font-mono-tabular">{usd(s?.equity)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              بروزرسانی
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="px-3.5 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              شارژ مجدد ۱۰۰ دلاری
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              موجودی نقدی (واقعی‌شده)
            </div>
            <div className="text-xl font-extrabold text-slate-900 font-mono-tabular">
              {usd(s?.balance)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular">
              موجودی اولیه: {usd(s?.initialBalance)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500">سود / زیان محقق‌شده</div>
            <div
              className={`text-xl font-extrabold font-mono-tabular ${
                (s?.realizedPnl || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {usd(s?.realizedPnl)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular">
              {s?.initialBalance
                ? pct(((s?.realizedPnl || 0) / s.initialBalance) * 100)
                : '0%'}{' '}
              از حساب
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500">سود / زیان شناور (باز)</div>
            <div
              className={`text-xl font-extrabold font-mono-tabular ${
                (s?.unrealizedPnl || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {usd(s?.unrealizedPnl)}
            </div>
            <div className="text-[11px] text-slate-500">
              {s?.openPositions || 0} پوزیشن باز
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500">سود / زیان کل</div>
            <div
              className={`text-xl font-extrabold font-mono-tabular flex items-center gap-1 ${
                isUp ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {isUp ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              {usd(totalPnl)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular">
              {s?.initialBalance
                ? pct((totalPnl / s.initialBalance) * 100)
                : '0%'}{' '}
              بازده
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              مارجین درگیر
            </div>
            <div className="text-base font-extrabold text-slate-900 font-mono-tabular">
              {usd(s?.usedMargin)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500">مارجین آزاد</div>
            <div className="text-base font-extrabold text-slate-900 font-mono-tabular">
              {usd(s?.freeMargin)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500">پوزیشن‌های بسته‌شده</div>
            <div className="text-base font-extrabold text-slate-900 font-mono-tabular">
              {s?.closedPositions || 0}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span className="text-emerald-600 font-mono-tabular">
                {s?.winCount || 0} سود
              </span>
              <span className="text-red-600 font-mono-tabular">{s?.lossCount || 0} ضرر</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 space-y-1">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5" />
              نرخ برد
            </div>
            <div className="text-base font-extrabold text-blue-600 font-mono-tabular">
              {pct(s?.winRate)}
            </div>
            <div className="text-[11px] text-slate-500">
              در انتظار ورود: {s?.pendingPositions || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">تنظیمات معاملات</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              اهرم (Leverage)
            </label>
            <input
              type="number"
              min={1}
              max={125}
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <p className="text-[11px] text-slate-500 leading-5">
              با اهرم {leverage || 0}x، هر ۱٪ حرکت قیمت برابر با{' '}
              <span className="font-mono-tabular font-bold">{leverage || 0}٪</span> سود یا زیان
              روی مارجین است.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              درصد موجودی برای هر پوزیشن (مارجین)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <p className="text-[11px] text-slate-500 leading-5">
              مارجین هر سفارش = {marginPct || 0}٪ از موجودی، و حجم سفارش = مارجین × اهرم.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          ذخیره تنظیمات
        </button>
      </div>

      {message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-semibold text-slate-700">{message}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-xs font-semibold text-red-700">{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h3 className="text-sm font-bold text-slate-900">این حساب چطور کار می‌کند؟</h3>
        <ul className="text-xs text-slate-600 leading-6 list-disc pr-5 space-y-1">
          <li>
            حساب با <span className="font-bold">۱۰۰ دلار مجازی</span> شارژ می‌شود و هیچ پول واقعی
            درگیر نیست.
          </li>
          <li>
            هر سیگنال <span className="font-bold text-blue-600">واجد شرایط</span> (حداقل ۲ سیگنال
            خرید یا فروش) یک سفارش در انتظار ورود می‌سازد.
          </li>
          <li>
            سفارش فقط زمانی باز می‌شود که قیمت بازار به <span className="font-bold">نقطهٔ ورود</span>{' '}
            سیگنال برسد — درست مثل صرافی واقعی.
          </li>
          <li>
            حد ضرر و حد سودها <span className="font-bold">عیناً از خود سیگنال</span> گرفته می‌شوند.
          </li>
          <li>
            در حد سود اول <span className="font-bold">۵۰٪ سفارش</span> بسته می‌شود و بقیه تا حد سود
            دوم یا حد ضرر ادامه می‌دهد.
          </li>
          <li>سود و زیان محقق‌شده بلافاصله روی موجودی همین حساب اعمال می‌شود.</li>
        </ul>
      </div>
    </div>
  );
}
