/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  LineChart,
  Bot,
  Database,
  LogOut,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  ArrowLeft,
  Radio,
  Plus,
  Menu,
  X,
  Sparkles,
  Activity,
  Wallet,
  Target,
  Zap,
} from 'lucide-react';
import {
  apiClient,
  AdminUser,
  tokenStorage,
  WatchlistSymbol,
  TelegramBotStatusConfig,
  TelegramChatMessage,
} from './apiclient';
import { AuthPage } from './components/AuthPage';
import { BinanceMarketPage, LiveTickerData } from './components/BinanceLiveTicker';
import { TelegramBotManager } from './components/TelegramBotManager';
import { ChatGptAvalAIManager } from './components/ChatGptAvalAIManager';
import { DatabaseSettings } from './components/DatabaseSettings';
import { SignalsPanel } from './components/SignalsPanel';
import { AccountPanel } from './components/AccountPanel';
import { TradePanel } from './components/TradePanel';
import { WeexTradePanel } from './components/WeexTradePanel';
import { TrailingStopPanel } from './components/TrailingStopPanel';

type ActiveMenu =
  | 'dashboard'
  | 'binance'
  | 'signals'
  | 'trade'
  | 'weex'
  | 'trailing'
  | 'account'
  | 'telegram'
  | 'chatgpt'
  | 'database';

const WS_ENDPOINTS = [
  'wss://stream.binance.com:9443/stream?streams=',
  'wss://data-stream.binance.vision/stream?streams=',
];

export default function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Shared Live State
  const [symbols, setSymbols] = useState<WatchlistSymbol[]>([]);
  const [tickers, setTickers] = useState<Record<string, LiveTickerData>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [endpointIdx, setEndpointIdx] = useState(0);

  // Telegram Summary State for Dashboard & Badge
  const [tgConfig, setTgConfig] = useState<TelegramBotStatusConfig | null>(null);
  const [tgMessages, setTgMessages] = useState<TelegramChatMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const prevPricesRef = useRef<Record<string, number>>({});

  // 1. Check JWT session on initial load
  useEffect(() => {
    const checkSession = async () => {
      const token = tokenStorage.getToken();
      if (!token) {
        setAuthChecking(false);
        return;
      }
      try {
        const res = await apiClient.getCurrentUser();
        setUser(res.user);
      } catch {
        tokenStorage.clearToken();
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    void checkSession();
  }, []);

  // 2. Load Watchlist Symbols & Telegram Summary when logged in
  useEffect(() => {
    if (!user) return;

    const fetchInitialData = async () => {
      try {
        const [watchlistRes, tgStatusRes, tgMsgRes] = await Promise.all([
          apiClient.getWatchlist(),
          apiClient.getTelegramStatus(),
          apiClient.getTelegramMessages(),
        ]);
        setSymbols(watchlistRes.symbols);
        setTgConfig(tgStatusRes.config);
        setTgMessages(tgMsgRes.messages);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      }
    };

    void fetchInitialData();
    const timer = setInterval(async () => {
      try {
        const [tgStatusRes, tgMsgRes] = await Promise.all([
          apiClient.getTelegramStatus(),
          apiClient.getTelegramMessages(),
        ]);
        setTgConfig(tgStatusRes.config);
        setTgMessages(tgMsgRes.messages);
      } catch {
        // ignore background poll error
      }
    }, 4500);

    return () => clearInterval(timer);
  }, [user]);

  // 3. Live Multi-Symbol Binance WebSocket Connection
  useEffect(() => {
    if (!user || symbols.length === 0) {
      setWsConnected(false);
      return;
    }

    const streamNames = symbols
      .map((s) => `${s.symbol.toLowerCase()}@ticker`)
      .join('/');
    const baseUrl = WS_ENDPOINTS[endpointIdx % WS_ENDPOINTS.length];
    const fullWsUrl = `${baseUrl}${streamNames}`;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(fullWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload.data || payload;
        if (!data || !data.s || !data.c) return;

        const symUpper = String(data.s).toUpperCase();
        const rawPrice = parseFloat(data.c);
        const rawChangePercent = parseFloat(data.P || '0');
        const prevPrice = prevPricesRef.current[symUpper];

        let direction: 'up' | 'down' | 'neutral' = 'neutral';
        if (prevPrice !== undefined && rawPrice !== prevPrice) {
          direction = rawPrice > prevPrice ? 'up' : 'down';
        }
        prevPricesRef.current[symUpper] = rawPrice;

        const formatNum = (val: string | number) => {
          const num = typeof val === 'string' ? parseFloat(val) : val;
          if (isNaN(num)) return '0.00';
          return num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: num < 1 ? 6 : 2,
          });
        };

        setTickers((prev) => ({
          ...prev,
          [symUpper]: {
            symbol: symUpper,
            price: formatNum(rawPrice),
            rawPrice,
            changePercent: rawChangePercent.toFixed(2),
            rawChangePercent,
            high24h: formatNum(data.h),
            low24h: formatNum(data.l),
            volumeUsdt: formatNum(data.q),
            wsLink: `wss://stream.binance.com:9443/ws/${symUpper.toLowerCase()}@ticker`,
            updatedAt: Date.now(),
            direction,
          },
        }));
      } catch {
        // ignore malformed frame
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
      setEndpointIdx((prev) => (prev + 1) % WS_ENDPOINTS.length);
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [user, symbols, endpointIdx]);

  const handleLogout = () => {
    tokenStorage.clearToken();
    setUser(null);
    setMobileMenuOpen(false);
  };

  const handleSelectMenu = (id: ActiveMenu) => {
    setActiveMenu(id);
    setMobileMenuOpen(false);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-sm font-semibold text-slate-600">
          در حال بررسی نشست امنیتی ادمین...
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={(loggedInUser) => setUser(loggedInUser)} />;
  }

  const unreadTelegramCount = tgMessages.filter(
    (m) => m.direction === 'incoming' && !m.isRead
  ).length;

  const menuItems: {
    id: ActiveMenu;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'پیشخوان مدیریت', icon: LayoutDashboard },
    { id: 'binance', label: 'قیمت لحظه‌ای بایننس', icon: LineChart, badge: symbols.length },
    { id: 'signals', label: 'سیگنال‌ها', icon: Activity },
    { id: 'trade', label: 'ترید', icon: Target },
    { id: 'weex', label: 'ترید WEEX', icon: Zap },
    { id: 'trailing', label: 'حد سود شناور', icon: TrendingUp },
    { id: 'account', label: 'حساب کاربری', icon: Wallet },
    {
      id: 'telegram',
      label: 'اتصال مستقیم ربات تلگرام',
      icon: Bot,
      badge: unreadTelegramCount > 0 ? unreadTelegramCount : undefined,
    },
    { id: 'chatgpt', label: 'اتصال به ChatGPT', icon: Sparkles },
    { id: 'database', label: 'دیتابیس MongoDB و حساب‌ها', icon: Database },
  ];

  const activeMenuTitle = menuItems.find((m) => m.id === activeMenu)?.label || 'پیشخوان مدیریت';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" dir="rtl">
      {/* 1. Desktop Fixed Right Sidebar (ثابت در سمت راست در حالت دسکتاپ) */}
      <aside className="hidden lg:flex lg:flex-col lg:justify-between lg:fixed lg:top-0 lg:right-0 lg:bottom-0 lg:w-[270px] bg-white border-l border-slate-200 p-4 z-30">
        <div className="space-y-6">
          {/* Sidebar Brand Header */}
          <div className="flex items-center gap-2.5 px-2 py-1.5 border-b border-slate-100 pb-4">
            <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-slate-900 truncate">
              پنل مدیریت هوشمند
            </span>
          </div>

          {/* Admin Profile Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-xs font-bold text-slate-900 truncate">{user.name}</div>
            <div className="text-[11px] text-slate-500 font-mono-tabular truncate">
              {user.email}
            </div>
            <div className="text-[11px] text-blue-600 font-medium pt-0.5">{user.role}</div>
          </div>

          {/* Sidebar Navigation Menu */}
          <div className="space-y-1">
            <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400">
              منوهای مدیریت سیستم
            </div>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectMenu(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`font-mono-tabular text-[11px] font-bold ${
                        isActive ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Logout Button */}
        <div className="pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-4 h-4" />
              <span>خروج از حساب کاربری</span>
            </div>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* 2. Mobile Right-Side Hamburger Drawer (منوی همبرگری کشویی از سمت راست در موبایل) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop Scrim */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Panel Anchored to Right */}
          <aside className="relative mr-0 ml-auto w-[280px] max-w-[85vw] bg-white h-full border-l border-slate-200 p-4 flex flex-col justify-between z-10 shadow-xl">
            <div className="space-y-5">
              {/* Mobile Drawer Top Header with Close Button */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-extrabold text-slate-900">منوی پنل ادمین</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="بستن منو"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Admin Profile Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-xs font-bold text-slate-900 truncate">{user.name}</div>
                <div className="text-[11px] text-slate-500 font-mono-tabular truncate">
                  {user.email}
                </div>
                <div className="text-[11px] text-blue-600 font-medium pt-0.5">{user.role}</div>
              </div>

              {/* Mobile Navigation Links */}
              <div className="space-y-1">
                <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400">
                  بخش‌های سامانه
                </div>
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeMenu === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectMenu(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 whitespace-nowrap">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span
                          className={`font-mono-tabular text-[11px] font-bold ${
                            isActive ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Logout Button */}
            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut className="w-4 h-4" />
                  <span>خروج از حساب کاربری</span>
                </div>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 3. Main Content Column (با فاصله از سایدبار ثابت راست در دسکتاپ: lg:mr-[270px]) */}
      <div className="lg:mr-[270px] min-h-screen flex flex-col">
        {/* Top Header Bar */}
        <header className="w-full bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-20">
          {/* Right Zone: Hamburger Button (Mobile) + Brand / Page Title */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منوی ادمین"
              className="lg:hidden p-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <a
              href="#dashboard"
              onClick={(e) => {
                e.preventDefault();
                handleSelectMenu('dashboard');
              }}
              className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              پنل مدیریت هوشمند بایننس و تلگرام
            </a>
          </div>

          {/* Center Zone: Quick Navigation Links */}
          <nav className="hidden xl:flex items-center gap-6 text-xs font-semibold text-slate-600">
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectMenu(item.id)}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                  activeMenu === item.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Left Zone: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectMenu(activeMenu === 'binance' ? 'telegram' : 'binance')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeMenu === 'binance' ? 'مدیریت ربات تلگرام' : 'مدیریت ارزهای بایننس'}
            </button>
          </div>
        </header>

        {/* Main Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1220px] w-full mx-auto space-y-6">
          {/* Contextual Breadcrumb */}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>پنل ادمین</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900">{activeMenuTitle}</span>
            </div>
            <div className="flex items-center gap-4 font-mono-tabular">
              <span className={wsConnected ? 'text-emerald-600' : 'text-amber-600'}>
                Binance WS: {wsConnected ? 'Connected' : 'Connecting...'}
              </span>
              <span aria-hidden="true">·</span>
              <span className={tgConfig?.isPollingActive ? 'text-blue-600' : 'text-slate-500'}>
                Telegram Direct: {tgConfig?.isPollingActive ? 'Active' : 'Standby'}
              </span>
            </div>
          </div>

          {/* View 1: Dashboard Overview */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
                  <div className="text-xs text-slate-500">ارزهای فعال در استریم بایننس</div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono-tabular">
                    {symbols.length}
                  </div>
                  <div className="text-xs text-emerald-600 flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5" />
                    <span>{wsConnected ? 'دریافت زنده قیمت‌ها فعال است' : 'در حال اتصال به بایننس'}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
                  <div className="text-xs text-slate-500">وضعیت ربات تلگرام (مستقیم)</div>
                  <div className="text-base font-extrabold text-slate-900 truncate">
                    {tgConfig?.hasToken
                      ? `@${tgConfig.botUsername || tgConfig.botFirstName}`
                      : 'هنوز متصل نشده'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {tgConfig?.isPollingActive
                      ? 'متصل با روش Long Polling (بدون Webhook)'
                      : 'آماده ثبت توکن از @BotFather'}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
                  <div className="text-xs text-slate-500">کل پیام‌های تلگرام در دیتابیس</div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono-tabular">
                    {tgMessages.length}
                  </div>
                  <div className="text-xs text-blue-600">
                    {unreadTelegramCount > 0
                      ? `${unreadTelegramCount} پیام خوانده‌نشده از کاربران`
                      : 'تمامی پیام‌ها بررسی شده‌اند'}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
                  <div className="text-xs text-slate-500">نشست امنیتی و دیتابیس</div>
                  <div className="text-base font-extrabold text-emerald-600">
                    JWT + MongoDB
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    ذخیره‌سازی دائمی اطلاعات فعال است
                  </div>
                </div>
              </div>

              {/* Live Binance Top Tickers Preview */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      نرخ لحظه‌ای ارزهای منتخب بایننس (WebSocket)
                    </h3>
                    <p className="text-xs text-slate-500">
                      بروزرسانی مستقیم از استریم رسمی بایننس بدون نیاز به رفرش صفحه
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMenu('binance')}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن / حذف ارزها</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-200">
                  {symbols.slice(0, 6).map((sym) => {
                    const t = tickers[sym.symbol.toUpperCase()];
                    const isPos = t ? t.rawChangePercent >= 0 : true;
                    return (
                      <div key={sym.symbol} className="p-5 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-900">{sym.label}</div>
                          <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                            {sym.baseAsset}/{sym.quoteAsset}
                          </div>
                        </div>
                        <div className="text-left font-mono-tabular">
                          <div className="text-sm font-extrabold text-slate-900">
                            {t ? `$${t.price}` : '...'}
                          </div>
                          <div
                            className={`text-xs font-semibold flex items-center justify-end gap-1 ${
                              isPos ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {isPos ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            <span>
                              {t ? `${isPos ? '+' : ''}${t.changePercent}%` : '0.00%'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Telegram Bot Messages Preview */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      آخرین پیام‌های دریافتی از ربات تلگرام
                    </h3>
                    <p className="text-xs text-slate-500">
                      دریافت مستقیم از طریق Long Polling و ذخیره در دیتابیس MongoDB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMenu('telegram')}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>مدیریت ربات و پاسخگویی</span>
                  </button>
                </div>

                {tgMessages.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      هنوز پیامی در ربات تلگرام ثبت نشده است
                    </p>
                    <p className="text-xs text-slate-500">
                      از منوی «اتصال مستقیم ربات تلگرام» توکن ربات خود را وارد کنید تا پیام‌های کاربران بلافاصله نمایش داده شوند.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {tgMessages
                      .slice(-5)
                      .reverse()
                      .map((m) => (
                        <div
                          key={m._id}
                          className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-bold text-slate-900">
                                {m.direction === 'outgoing'
                                  ? `پاسخ ادمین به (${m.chatId})`
                                  : `${m.senderFirstName} ${m.senderLastName || ''}`}
                              </span>
                              {m.senderUsername && (
                                <span className="text-blue-600 font-mono-tabular">
                                  @{m.senderUsername}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 truncate mt-0.5">{m.text}</p>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono-tabular shrink-0">
                            {new Date(m.createdAt).toLocaleTimeString('fa-IR')}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View 2: Binance Live Ticker & Symbol Manager */}
          {activeMenu === 'binance' && (
            <BinanceMarketPage
              symbols={symbols}
              tickers={tickers}
              onSymbolsChange={(updated) => setSymbols(updated)}
            />
          )}

          {/* View 2B: Consensus Signals Engine (سیگنال‌ها) */}
          {activeMenu === 'signals' && <SignalsPanel />}

          {/* View 2C: Virtual Demo Account (حساب کاربری) */}
          {activeMenu === 'account' && <AccountPanel />}

          {/* View 2D: Demo Trade Terminal (ترید) */}
          {activeMenu === 'trade' && <TradePanel />}

          {/* View 2E: WEEX Futures Trading (ترید WEEX) */}
          {activeMenu === 'weex' && <WeexTradePanel />}

          {/* View 2E: Trailing stop audit log (حد سود شناور) */}
          {activeMenu === 'trailing' && <TrailingStopPanel />}

          {/* View 3: Direct Telegram Bot Connection & Message Inbox */}
          {activeMenu === 'telegram' && <TelegramBotManager tickers={tickers} />}

          {/* View 4: AvalAI (ChatGPT) Connection & Settings */}
          {activeMenu === 'chatgpt' && <ChatGptAvalAIManager tickers={tickers} />}

          {/* View 5: MongoDB Database & Accounts Settings */}
          {activeMenu === 'database' && <DatabaseSettings />}
        </main>
      </div>
    </div>
  );
}
