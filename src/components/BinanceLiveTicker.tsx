import React, { useState } from 'react';
import { Plus, Trash2, Search, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { apiClient, WatchlistSymbol } from '../apiclient';

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
}

interface BinanceMarketPageProps {
  symbols: WatchlistSymbol[];
  tickers: Record<string, LiveTickerData>;
  onSymbolsChange: (updated: WatchlistSymbol[]) => void;
}

/**
 * مدیریت دستی ارزها:
 *   - افزودن ارز جدید (نماد + عنوان نمایشی)
 *   - لیست ارزها همراه قیمت لحظه‌ای بایننس و حذف
 */
export function BinanceMarketPage({
  symbols,
  tickers,
  onSymbolsChange,
}: BinanceMarketPageProps) {
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [newLabelInput, setNewLabelInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbolInput.trim()) return;
    setError(null);
    setAdding(true);
    try {
      const res = await apiClient.addWatchlistSymbol(newSymbolInput.trim(), newLabelInput.trim() || undefined);
      onSymbolsChange(res.symbols);
      setNewSymbolInput('');
      setNewLabelInput('');
    } catch (err: any) {
      setError(err?.message || 'خطا در افزودن ارز');
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
    } catch (err: any) {
      setError(err?.message || 'خطا در حذف ارز');
    } finally {
      setRemovingSymbol(null);
    }
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

  return (
    <div className="space-y-6">
      {/* افزودن ارز جدید */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">افزودن ارز جدید</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            نماد ارز (مانند <span className="font-mono-tabular">BTCUSDT</span> یا فقط{' '}
            <span className="font-mono-tabular">TON</span>) را وارد کنید تا به استریم بایننس اضافه شود.
          </p>
        </div>

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
      </div>

      {/* لیست ارزها */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span>لیست ارزها</span>
            <span aria-hidden="true">·</span>
            <span className="text-xs font-normal text-slate-500">{symbols.length} نماد</span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در نمادها..."
              className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>

        {filteredSymbols.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">هیچ ارزی در لیست مشاهده نشد</p>
            <p className="text-xs text-slate-500">از فرم بالا یک نماد جدید مانند BTCUSDT اضافه کنید.</p>
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-right border-collapse block sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-2 sm:px-6">نام و نماد ارز</th>
                  <th className="py-3 px-2 sm:px-4 text-left">قیمت لحظه‌ای (USDT)</th>
                  <th className="py-3 px-2 sm:px-4 text-left">تغییر ۲۴ ساعته (%)</th>
                  <th className="py-3 px-2 sm:px-6 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group divide-y divide-slate-200 text-sm">
                {filteredSymbols.map((item) => {
                  const ticker = tickers[item.symbol.toUpperCase()];
                  const isPositive = ticker ? ticker.rawChangePercent >= 0 : true;

                  return (
                    <tr
                      key={item._id || item.symbol}
                      className="grid grid-cols-3 gap-x-2 gap-y-1.5 items-center px-3 pt-3 pb-2.5 border-b sm:table-row sm:border-0 sm:p-0 hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="col-span-3 sm:table-cell sm:py-3 sm:px-6">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="flex w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono-tabular text-xs font-bold text-slate-800 shrink-0">
                            {item.baseAsset.slice(0, 4)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-[11px] sm:text-sm truncate max-w-[120px] sm:max-w-none">{item.label}</div>
                            <div className="text-[11px] sm:text-xs text-slate-500 font-mono-tabular">
                              {item.baseAsset}/{item.quoteAsset}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="sm:table-cell sm:py-3 sm:px-4 text-left font-mono-tabular">
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

                      <td className="sm:table-cell sm:py-3 sm:px-4 text-left font-mono-tabular">
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

                      <td className="sm:table-cell sm:py-3 sm:px-6 text-left">
                        <button
                          type="button"
                          onClick={() => handleRemoveSymbol(item.symbol)}
                          disabled={removingSymbol === item.symbol}
                          className="px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{removingSymbol === item.symbol ? 'حذف...' : 'حذف ارز'}</span>
                        </button>
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
