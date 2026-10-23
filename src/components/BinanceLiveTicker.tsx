import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Search,
  Radio,
  Code2,
  AlertCircle,
  Link2,
  BarChart2,
  CheckCircle2,
} from 'lucide-react';
import { apiClient, WatchlistSymbol, WatchlistAutoStatus } from '../apiclient';
import { CryptoLiveChart } from './CryptoLiveChart';

export interface LiveTickerData {
  symbol: string;
  price: string;
  rawPrice: number;
  changePercent: string;
  rawChangePercent: number;
  high24h: string;
  low24h: string;
  volumeUsdt: string;
  wsLink: string;
  updatedAt: number;
  direction: 'up' | 'down' | 'neutral';
  /** Where the quote came from — WEEX coins are not listed on Binance. */
  source?: 'binance' | 'weex';
}

/**
 * Exact Single-Symbol BinanceLiveTicker Component (matching user sample pattern)
 * Connects directly to wss://stream.binance.com:9443/ws/<symbol>@ticker
 */
export function BinanceLiveTicker({ symbol = 'btcusdt' }: { symbol?: string }) {
  const [price, setPrice] = useState<string>('...');
  const [changePercent, setChangePercent] = useState<string>('0.00');

  useEffect(() => {
    const cleanSym = symbol.toLowerCase();
    let ws = new WebSocket(`wss://stream.binance.com:9443/ws/${cleanSym}@ticker`);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.c) {
          setPrice(
            parseFloat(data.c).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: parseFloat(data.c) < 1 ? 6 : 2,
            })
          );
          setChangePercent(parseFloat(data.P).toFixed(2));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onmessage = handleMessage;
    ws.onerror = () => {
      try {
        ws.close();
        ws = new WebSocket(`wss://data-stream.binance.vision/ws/${cleanSym}@ticker`);
        ws.onmessage = handleMessage;
      } catch {
        // ignore fallback error
      }
    };

    return () => ws.close();
  }, [symbol]);

  const isPositive = parseFloat(changePercent) >= 0;

  return (
    <div className="inline-flex items-center gap-2 font-mono-tabular text-xs">
      <span className="font-semibold text-slate-900">
        {symbol.toUpperCase()}: ${price}
      </span>
      <span className={isPositive ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
        ({isPositive ? '+' : ''}
        {changePercent}%)
      </span>
    </div>
  );
}

const POPULAR_COINS = [
  { symbol: 'BTCUSDT', label: 'بیت‌کوین (BTC)' },
  { symbol: 'ETHUSDT', label: 'اتریوم (ETH)' },
  { symbol: 'BNBUSDT', label: 'بایننس کوین (BNB)' },
  { symbol: 'SOLUSDT', label: 'سولانا (SOL)' },
  { symbol: 'XRPUSDT', label: 'ریپل (XRP)' },
  { symbol: 'ADAUSDT', label: 'کاردانو (ADA)' },
  { symbol: 'DOGEUSDT', label: 'دوج‌کوین (DOGE)' },
  { symbol: 'TONUSDT', label: 'تون‌کوین (TON)' },
  { symbol: 'TRXUSDT', label: 'ترون (TRX)' },
  { symbol: 'AVAXUSDT', label: 'آوالانچ (AVAX)' },
  { symbol: 'LINKUSDT', label: 'چین‌لینک (LINK)' },
  { symbol: 'LTCUSDT', label: 'لایت‌کوین (LTC)' },
];

interface BinanceMarketPageProps {
  symbols: WatchlistSymbol[];
  tickers: Record<string, LiveTickerData>;
  wsConnected: boolean;
  activeEndpoint: string;
  onSymbolsChange: (updated: WatchlistSymbol[]) => void;
  onReconnectWs: () => void;
}

export function BinanceMarketPage({
  symbols,
  tickers,
  wsConnected,
  activeEndpoint,
  onSymbolsChange,
  onReconnectWs,
}: BinanceMarketPageProps) {
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [newLabelInput, setNewLabelInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string>('BTCUSDT');
  const [adding, setAdding] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [autoStatus, setAutoStatus] = useState<WatchlistAutoStatus | null>(null);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [seedingWeex, setSeedingWeex] = useState(false);
  const [weexSeedMessage, setWeexSeedMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getWatchlistAutoStatus()
      .then((res) => {
        if (!cancelled) setAutoStatus(res.status);
      })
      .catch(() => {
        /* status is informational only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAutoRefresh = async () => {
    setError(null);
    setAutoMessage(null);
    setAutoRefreshing(true);
    try {
      const res = await apiClient.refreshWatchlistAuto();
      onSymbolsChange(res.symbols);
      setAutoStatus(res.status);
      const s = res.summary;
      setAutoMessage(
        s
          ? `لیست به‌روزرسانی شد: ${s.marketCapSymbols.length} ارز برتر مارکت‌کپ + ${s.volatileSymbols.length} ارز پرنوسان (${s.total} نماد).`
          : 'لیست به‌روزرسانی شد.'
      );
    } catch (err: any) {
      setError(err?.message || 'خطا در به‌روزرسانی خودکار لیست ارزها');
    } finally {
      setAutoRefreshing(false);
    }
  };

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbolInput.trim()) return;
    setError(null);
    setAdding(true);

    try {
      const res = await apiClient.addWatchlistSymbol(newSymbolInput.trim(), newLabelInput.trim() || undefined);
      onSymbolsChange(res.symbols);
      setSelectedChartSymbol(res.symbol.symbol);
      setNewSymbolInput('');
      setNewLabelInput('');
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err?.message || 'خطا در افزودن ارز به لیست');
    } finally {
      setAdding(false);
    }
  };

  const handleQuickAdd = async (coinSymbol: string, coinLabel: string) => {
    setError(null);
    setAdding(true);
    try {
      const res = await apiClient.addWatchlistSymbol(coinSymbol, coinLabel);
      onSymbolsChange(res.symbols);
      setSelectedChartSymbol(coinSymbol);
    } catch (err: any) {
      setError(err?.message || 'خطا در افزودن سریع ارز');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSymbol = async (symbol: string) => {
    setError(null);
    setRemovingSymbol(symbol);
    try {
      const res = await apiClient.removeWatchlistSymbol(symbol);
      onSymbolsChange(res.symbols);
      if (selectedChartSymbol === symbol && res.symbols.length > 0) {
        setSelectedChartSymbol(res.symbols[0].symbol);
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در حذف ارز');
    } finally {
      setRemovingSymbol(null);
    }
  };

  /** Re-adds the 142 WEEX demo (SUSDT) coins that are missing from the list. */
  const handleSeedWeexDemo = async () => {
    setWeexSeedMessage(null);
    setError(null);
    setSeedingWeex(true);
    try {
      const res = await apiClient.seedWeexDemoWatchlist();
      onSymbolsChange(res.symbols);
      setWeexSeedMessage(
        res.added > 0
          ? `${res.added} ارز WEEX به لیست اضافه شد (مجموع ${res.totalDemoCoins} ارز دمو).`
          : `همه ${res.totalDemoCoins} ارز WEEX از قبل در لیست موجود بودند.`
      );
    } catch (err: any) {
      setError(err?.message || 'خطا در افزودن ارزهای WEEX');
    } finally {
      setSeedingWeex(false);
    }
  };

  const handleCopyWsLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const filteredSymbols = symbols.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.symbol.toLowerCase().includes(q) ||
      s.baseAsset.toLowerCase().includes(q) ||
      s.label.toLowerCase().includes(q)
    );
  });

  const existingSymbolSet = new Set(symbols.map((s) => s.symbol.toUpperCase()));

  return (
    <div className="space-y-6">
      {/* Header & Connection Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <h2 className="text-base sm:text-xl font-bold text-slate-900">
              مانیتورینگ، چارت زنده و دریافت لینک لحظه‌ای ارزهای بایننس
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                wsConnected ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>{wsConnected ? 'متصل به استریم زنده بایننس' : 'در حال برقراری اتصال...'}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            تمامی قیمت‌ها و کندل‌ها به صورت بلادرنگ از طریق WebSocket رسمی بایننس دریافت شده و لیست ارزهای شما در دیتابیس MongoDB ذخیره می‌شود.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowCodeModal(!showCodeModal)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Code2 className="w-4 h-4" />
            <span>{showCodeModal ? 'بستن نمونه کد و لینک‌ها' : 'مشاهده کد اتصال و لینک استریم'}</span>
          </button>

          <button
            type="button"
            onClick={onReconnectWs}
            className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>اتصال مجدد سوکت</span>
          </button>
        </div>
      </div>

      {/* Expandable Live WebSocket Code & Link Inspector */}
      {showCodeModal && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              لینک مستقیم WebSocket بایننس و کامپوننت نمونه (BinanceLiveTicker)
            </h3>
            <span className="text-xs text-slate-500 font-mono-tabular">{activeEndpoint}</span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800 ml-2">خروجی زنده کامپوننت تک‌ارزی نمونه شما:</span>
              <BinanceLiveTicker symbol="btcusdt" />
            </div>
            <button
              type="button"
              onClick={() => handleCopyWsLink('wss://stream.binance.com:9443/ws/btcusdt@ticker')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedLink === 'wss://stream.binance.com:9443/ws/btcusdt@ticker' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی لینک مستقیم BTCUSDT</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Live Interactive Chart Component (Binance Native Klines + TradingView Widget) */}
      <CryptoLiveChart
        symbols={symbols}
        selectedSymbol={selectedChartSymbol}
        onSelectSymbol={(sym) => setSelectedChartSymbol(sym)}
      />

      {/* Automatic Watchlist (top market cap + most volatile, daily 08:00) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>لیست خودکار بازار (۳۰ ارز برتر + ۲۰ ارز پرنوسان)</span>
            </h3>
            <p className="text-xs text-slate-500">
              هر روز ساعت{' '}
              <span className="font-mono-tabular">
                {String(autoStatus?.refreshHour ?? 8).padStart(2, '0')}:
                {String(autoStatus?.refreshMinute ?? 0).padStart(2, '0')}
              </span>{' '}
              به وقت {autoStatus?.refreshTimezone || 'Asia/Tehran'} به‌صورت خودکار از ۳۰ ارز اول بازار (مارکت‌کپ)
              و ۲۰ ارز پرنوسان ۲۴ ساعت گذشته بازسازی می‌شود. ارزهایی که دستی اضافه کرده‌اید حفظ می‌شوند.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoRefresh}
            disabled={autoRefreshing}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshing ? 'animate-spin' : ''}`} />
            <span>{autoRefreshing ? 'در حال به‌روزرسانی...' : 'به‌روزرسانی همین حالا'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-600">
          <span>
            آخرین به‌روزرسانی:{' '}
            <span className="font-semibold text-slate-800">
              {autoStatus?.lastRefreshAt
                ? new Date(autoStatus.lastRefreshAt).toLocaleString('fa-IR')
                : 'هنوز اجرا نشده'}
            </span>
          </span>
          <span>
            به‌روزرسانی بعدی:{' '}
            <span className="font-semibold text-slate-800">
              {autoStatus?.nextRefreshAt
                ? new Date(autoStatus.nextRefreshAt).toLocaleString('fa-IR')
                : '—'}
            </span>
          </span>
          {autoStatus?.lastSummary && (
            <span>
              ترکیب فعلی:{' '}
              <span className="font-semibold text-slate-800">
                {autoStatus.lastSummary.marketCapSymbols.length} برتر +{' '}
                {autoStatus.lastSummary.volatileSymbols.length} پرنوسان
              </span>
            </span>
          )}
        </div>

        {autoStatus?.lastError && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
            آخرین خطای به‌روزرسانی خودکار: {autoStatus.lastError}
          </div>
        )}
        {autoMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            {autoMessage}
          </div>
        )}
      </div>

      {/* Add New Coin Form + Quick Suggestions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">افزودن ارز جدید به لیست رصد لحظه‌ای</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              نماد ارز (مانند <span className="font-mono-tabular">BTCUSDT</span>،{' '}
              <span className="font-mono-tabular">DOGEUSDT</span> یا فقط{' '}
              <span className="font-mono-tabular">TON</span>) را وارد کنید تا بلافاصله به WebSocket بایننس متصل شود.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSeedWeexDemo}
            disabled={seedingWeex}
            title="افزودن ۱۴۲ ارز قابل ترید در حساب دمو WEEX (SUSDT) که در لیست نیستند"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{seedingWeex ? 'در حال افزودن...' : 'افزودن ۱۴۲ ارز WEEX (SUSDT)'}</span>
          </button>
        </div>

        {weexSeedMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{weexSeedMessage}</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAddSymbol} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              نماد ارز در بایننس (Symbol)
            </label>
            <input
              ref={inputRef}
              type="text"
              dir="ltr"
              required
              value={newSymbolInput}
              onChange={(e) => setNewSymbolInput(e.target.value.toUpperCase())}
              placeholder="e.g. DOGEUSDT, TON, PEPEUSDT"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-mono-tabular text-left"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              عنوان نمایشی (اختیاری)
            </label>
            <input
              type="text"
              value={newLabelInput}
              onChange={(e) => setNewLabelInput(e.target.value)}
              placeholder="مثلاً: دوج‌کوین (Dogecoin)"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={adding || !newSymbolInput.trim()}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 h-[42px] whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{adding ? 'در حال ثبت...' : 'افزودن ارز'}</span>
            </button>
          </div>
        </form>

        {/* Quick Popular Coins Bar */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-2.5">افزودن سریع ارزهای پرطرفدار بایننس:</div>
          <div className="flex flex-wrap gap-2">
            {POPULAR_COINS.map((coin) => {
              const alreadyAdded = existingSymbolSet.has(coin.symbol);
              return (
                <button
                  key={coin.symbol}
                  type="button"
                  disabled={alreadyAdded || adding}
                  onClick={() => handleQuickAdd(coin.symbol, coin.label)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    alreadyAdded
                      ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-default'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-600 hover:text-blue-600'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  <span>{coin.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Binance Ticker Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span>لیست ارزهای فعال (بایننس + WEEX)</span>
            <span aria-hidden="true">·</span>
            <span className="text-xs font-normal text-slate-500">{symbols.length} نماد فعال</span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در نمادها (مثلاً BTC یا سولانا)..."
              className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>

        {filteredSymbols.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">هیچ ارزی در لیست مشاهده نشد</p>
            <p className="text-xs text-slate-500">
              از فرم بالا یک نماد جدید مانند BTCUSDT یا ETHUSDT اضافه کنید.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-right border-collapse min-w-[700px] sm:min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3.5 px-3 sm:px-6">نام و نماد ارز</th>
                  <th className="py-3.5 px-3 sm:px-4 text-left">قیمت لحظه‌ای (USDT)</th>
                  <th className="py-3.5 px-3 sm:px-4 text-left">تغییر ۲۴ ساعته (%)</th>
                  <th className="py-3.5 px-3 sm:px-4 text-left hidden md:table-cell">بالاترین / پایین‌ترین (۲۴h)</th>
                  <th className="py-3.5 px-3 sm:px-4 text-left hidden lg:table-cell">لینک مستقیم WebSocket</th>
                  <th className="py-3.5 px-3 sm:px-6 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredSymbols.map((item) => {
                  const ticker = tickers[item.symbol.toUpperCase()];
                  const isWeex = ticker?.source === 'weex';
                  const wsUrl = isWeex
                    ? ticker!.wsLink
                    : `wss://stream.binance.com:9443/ws/${item.symbol.toLowerCase()}@ticker`;
                  const isPositive = ticker ? ticker.rawChangePercent >= 0 : true;

                  return (
                    <tr
                      key={item._id || item.symbol}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Coin Info */}
                      <td className="py-3.5 px-3 sm:px-6">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono-tabular text-xs font-bold text-slate-800 shrink-0">
                            {item.baseAsset.slice(0, 4)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                              <span>{item.label}</span>
                              {isWeex && (
                                <span
                                  title="این ارز روی بایننس لیست نیست؛ قیمت از WEEX خوانده می‌شود"
                                  className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 leading-none"
                                >
                                  WEEX
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 font-mono-tabular">
                              {item.baseAsset}/{item.quoteAsset}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Live Price */}
                      <td className="py-3.5 px-3 sm:px-4 text-left font-mono-tabular">
                        {ticker ? (
                          <span
                            className={`text-xs sm:text-sm font-bold transition-colors duration-200 ${
                              ticker.direction === 'up'
                                ? 'text-emerald-600'
                                : ticker.direction === 'down'
                                ? 'text-red-600'
                                : 'text-slate-900'
                            }`}
                          >
                            ${ticker.price}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">در حال دریافت...</span>
                        )}
                      </td>

                      {/* 24h Change % */}
                      <td className="py-3.5 px-3 sm:px-4 text-left font-mono-tabular">
                        {ticker ? (
                          <div
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              isPositive ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>
                              {isPositive ? '+' : ''}
                              {ticker.changePercent}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">0.00%</span>
                        )}
                      </td>

                      {/* 24h High / Low */}
                      <td className="py-3.5 px-3 sm:px-4 text-left font-mono-tabular hidden md:table-cell">
                        {ticker ? (
                          <div className="text-xs text-slate-600">
                            <span className="text-emerald-700">H: ${ticker.high24h}</span>
                            <span className="mx-1.5 text-slate-300">/</span>
                            <span className="text-red-700">L: ${ticker.low24h}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Direct WebSocket Stream Link */}
                      <td className="py-3.5 px-3 sm:px-4 text-left hidden lg:table-cell">
                        <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                          <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono-tabular text-xs text-slate-600 truncate max-w-[200px] xl:max-w-[230px]">
                            {wsUrl}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyWsLink(wsUrl)}
                            title="کپی لینک مستقیم WebSocket این ارز"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            {copiedLink === wsUrl ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Chart & Delete Actions */}
                      <td className="py-3.5 px-3 sm:px-6 text-left">
                        <div className="inline-flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedChartSymbol(item.symbol)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                              selectedChartSymbol.toUpperCase() === item.symbol.toUpperCase()
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'text-blue-600 bg-blue-50/70 hover:bg-blue-100 border-blue-200'
                            }`}
                          >
                            <BarChart2 className="w-3.5 h-3.5" />
                            <span>چارت زنده</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveSymbol(item.symbol)}
                            disabled={removingSymbol === item.symbol}
                            className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{removingSymbol === item.symbol ? 'حذف...' : 'حذف ارز'}</span>
                          </button>
                        </div>
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
