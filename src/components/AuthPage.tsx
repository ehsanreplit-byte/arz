import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, User, ArrowLeft, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { apiClient, AdminUser } from '../apiclient';

interface AuthPageProps {
  onAuthenticated: (user: AdminUser) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await apiClient.login(email, password);
        onAuthenticated(res.user);
      } else {
        const res = await apiClient.register(name, email, password);
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در احراز هویت');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoAdmin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.login('ehsan', '232111Eee@');
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err?.message || 'خطا در ورود با حساب پیش‌فرض');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between" dir="rtl">
      {/* Top Bar */}
      <header className="w-full bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            پنل مدیریت هوشمند بایننس و تلگرام
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <span className="whitespace-nowrap">احراز هویت JWT</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">دیتابیس MongoDB</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">WebSocket لحظه‌ای بایننس</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">ربات تلگرام مستقیم (بدون وبهوک)</span>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {mode === 'login' ? 'ایجاد حساب ادمین جدید' : 'ورود به حساب موجود'}
          </button>
        </div>
      </header>

      {/* Main Content Split */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Right Column: Editorial Explanation & System Capabilities */}
        <div className="lg:col-span-7 space-y-6">
          <div className="text-xs font-medium text-blue-600 flex items-center gap-2">
            <span>مرکز فرماندهی و مانیتورینگ رمزارز</span>
            <span aria-hidden="true">·</span>
            <span>نسخه سازمانی روشن</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            مدیریت یکپارچه نرخ لحظه‌ای ارزهای بایننس و پیام‌های مستقیم ربات تلگرام
          </h1>

          <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
            از طریق این پنل مدیریتی می‌توانید به صورت بلادرنگ قیمت رمزارزهای دلخواه خود را از استریم رسمی WebSocket بایننس رصد کرده، نمادهای معاملاتی را اضافه یا حذف نمایید و پیام‌های کاربران ربات تلگرام خود را بدون نیاز به راه‌اندازی Webhook به صورت مستقیم دریافت و پاسخ دهید.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>استریم زنده بایننس (WebSocket)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                دریافت آنی قیمت دلاری، درصد تغییرات ۲۴ ساعته و حجم معاملات با قابلیت افزودن و حذف ارزها در دیتابیس MongoDB.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>اتصال مستقیم به تلگرام (Long Polling)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ارتباط مستقیم با سرور تلگرام از طریق متد getUpdates بدون نیاز به وبهوک، به همراه صندوق پیام و ارسال پاسخ آنی.
              </p>
            </div>
          </div>

          {/* Default Admin Credentials Helper Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>حساب ادمین پیش‌فرض آماده ورود سریع:</span>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-3 font-mono-tabular">
                <span>نام کاربری: ehsan</span>
                <span aria-hidden="true">·</span>
                <span>رمز عبور: 232111Eee@</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleQuickDemoAdmin}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ورود سریع با حساب ehsan
            </button>
          </div>
        </div>

        {/* Left Column: Auth Card */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-8">
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2.5 px-4 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ورود به پنل ادمین
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`py-2.5 px-4 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ثبت‌نام ادمین جدید
              </button>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">
                {mode === 'login' ? 'خوش آمدید، وارد حساب خود شوید' : 'ساخت حساب کاربری مدیر سیستم'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'نام کاربری (ehsan) و رمز عبور خود را جهت دریافت توکن امنیتی JWT وارد نمایید.'
                  : 'مشخصات زیر را تکمیل کنید تا حساب شما در دیتابیس MongoDB ثبت شود.'}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    نام و نام خانوادگی مدیر
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثلاً: احسان"
                      className="w-full pr-10 pl-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  نام کاربری یا ایمیل
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ehsan"
                    className="w-full pr-10 pl-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 transition-colors text-left font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  رمز عبور
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-10 pl-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 transition-colors text-left font-mono-tabular"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>
                  {loading
                    ? 'در حال بررسی و صدور توکن...'
                    : mode === 'login'
                    ? 'ورود به پنل مدیریت'
                    : 'ثبت‌نام و ورود به پنل'}
                </span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white px-8 py-4 text-xs text-slate-500 flex items-center justify-between">
        <span>سامانه مدیریت هوشمند ارزهای دیجیتال و ربات تلگرام</span>
        <span>احراز هویت امن JWT و ذخیره‌سازی MongoDB</span>
      </footer>
    </div>
  );
}
