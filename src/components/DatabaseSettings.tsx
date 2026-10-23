import React, { useEffect, useState } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Shield,
  Users,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import { apiClient, AdminUser, DatabaseStatusInfo } from '../apiclient';

export function DatabaseSettings() {
  const [status, setStatus] = useState<DatabaseStatusInfo | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mongoUriInput, setMongoUriInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const handleDownloadReport = async () => {
    setReportBusy(true);
    setReportFeedback(null);
    try {
      const filename = await apiClient.downloadTextReport();
      setReportFeedback(`گزارش با نام ${filename} دانلود شد.`);
    } catch (err: any) {
      setReportFeedback(err?.message || 'دانلود گزارش ناموفق بود.');
    } finally {
      setReportBusy(false);
    }
  };

  const fetchStatus = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.getDatabaseStatus();
      setStatus(res.status);
      setUsers(res.users);
    } catch (err: any) {
      if (!silent) {
        setFeedback({ type: 'error', text: err?.message || 'خطا در دریافت وضعیت دیتابیس' });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
    // live status: refresh quietly so the indicator always matches reality
    const t = window.setInterval(() => void fetchStatus(true), 15000);
    return () => window.clearInterval(t);
  }, []);

  const handleConnectMongo = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setFeedback(null);
    try {
      const res = await apiClient.connectDatabase(mongoUriInput.trim());
      setStatus(res.status);
      if (res.ok) {
        setFeedback({
          type: 'success',
          text:
            res.mode === 'mongodb_remote'
              ? 'اتصال به سرور خارجی MongoDB با موفقیت برقرار شد. برای پایداری پس از هر دیپلوی، همین URI را در Environment با نام MONGODB_URI هم ثبت کنید.'
              : 'موتور ذخیره‌سازی دائمی MongoDB فعال است.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.error || 'امکان اتصال به سرور خارجی MongoDB وجود نداشت؛ ذخیره‌سازی دائمی داخلی فعال است.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در برقراری اتصال' });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">وضعیت دیتابیس MongoDB و مدیران سیستم</h2>
          </div>
          <p className="text-xs text-slate-500">
            مدیریت رشته اتصال Mongoose / MongoDB و مشاهده آمار کالکشن‌های ذخیره‌شده (کاربران، ارزهای بایننس و پیام‌های تلگرام).
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchStatus()}
          disabled={loading}
          className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>بروزرسانی وضعیت</span>
        </button>
      </div>

      {/* Live connection banner */}
      {status && (
        <div
          className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            status.isRemoteConnected
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {status.isRemoteConnected ? (
              <span className="relative flex h-3 w-3 mt-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <div
                className={`text-base font-extrabold ${
                  status.isRemoteConnected ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {status.statusLabel}
              </div>
              <div
                className={`text-xs ${
                  status.isRemoteConnected ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {status.engineLabel}
              </div>
              {status.isRemoteConnected ? (
                <div className="space-y-1">
                  <div
                    className="text-[11px] text-emerald-800 font-mono-tabular pt-1 break-all"
                    dir="ltr"
                  >
                    {status.clusterHost} / {status.databaseName}
                  </div>
                  {(status.disconnectCount || 0) > 0 && (
                    <div className="text-[10px] text-emerald-800/80 leading-relaxed">
                      قطعی‌های ثبت‌شده: {status.disconnectCount} · اتصال مجدد: {status.reconnectCount || 0}
                      {status.lastDisconnectAt
                        ? ` · آخرین قطعی: ${new Date(status.lastDisconnectAt).toLocaleTimeString('fa-IR')}`
                        : ''}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1 text-[11px] text-amber-800 pt-1 leading-relaxed">
                  <div>
                    {status.lastError
                      ? `آخرین خطا: ${status.lastError}`
                      : status.hasConfiguredUri
                      ? 'رشتهٔ اتصال ثبت شده ولی هنوز برقرار نشده است.'
                      : 'هنوز رشتهٔ اتصال MongoDB وارد نشده است.'}
                  </div>
                  {status.lastDisconnectReason && (
                    <div>آخرین قطع اتصال: {status.lastDisconnectReason}</div>
                  )}
                  {(status.reconnectCount || 0) > 0 && (
                    <div>تعداد اتصال مجدد موفق: {status.reconnectCount}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void fetchStatus()}
            disabled={loading}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto cursor-pointer ${
              status.isRemoteConnected
                ? 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تست اتصال</span>
          </button>
        </div>
      )}

      {/* Collection Counts Grid */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <div className="text-xs text-slate-500">کالکشن مدیران (AdminUser)</div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono-tabular">
              {status.collections.users}
            </div>
            <div className="text-[11px] text-slate-400">حساب کاربری ثبت‌شده با JWT</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <div className="text-xs text-slate-500">کالکشن ارزها (CryptoSymbol)</div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono-tabular">
              {status.collections.symbols}
            </div>
            <div className="text-[11px] text-slate-400">نماد فعال در واچ‌لیست بایننس</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <div className="text-xs text-slate-500">کالکشن پیام‌ها (TelegramMessage)</div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono-tabular">
              {status.collections.telegramMessages}
            </div>
            <div className="text-[11px] text-slate-400">پیام دریافتی و ارسالی ثبت‌شده</div>
          </div>
        </div>
      )}

      {/* Plain-text report download */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">
              دانلود گزارش سیگنال‌ها و خرید و فروش (فایل متنی txt)
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              فایل متنی شامل تمام سیگنال‌های ثبت‌شده و تمام معاملات (خرید/فروش) به‌همراه{" "}
              <span className="font-semibold text-slate-600">
                ساعت دقیق هر مرحله (ثبت، رسیدن قیمت به نقطهٔ ورود، بستن حد سود / حد ضرر)
              </span>{" "}
              است. برای تحلیل آسان‌تر، یک بخش داده خام جداشده با تب (قابل باز کردن در اکسل) هم در
              انتهای فایل قرار دارد.
            </p>
            <div className="text-[11px] text-slate-400 pt-1 leading-6">
              شامل: زمان ISO و زمان ایران · نماد · جهت خرید/فروش · نقطه ورود · حد ضرر · حد سود ۱ و ۲
              · اهرم · مارجین · حجم · رخدادهای پر شدن · سود/زیان محقق‌شده · موجودی نهایی
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={reportBusy}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {reportBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{reportBusy ? 'در حال ساخت گزارش...' : 'دانلود گزارش txt'}</span>
          </button>
          {reportFeedback && (
            <span className="text-xs font-semibold text-slate-600">{reportFeedback}</span>
          )}
        </div>
      </div>

      {/* MongoDB URI Connection Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">
            تنظیم رشته اتصال سرور MongoDB (Atlas یا اختصاصی)
          </h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          تمامی داده‌های شما به صورت پیش‌فرض در موتور دائمی سرور ذخیره می‌شوند. در صورتی که مایل به اتصال مستقیم به کلاستر خارجی MongoDB Atlas یا سرور اختصاصی خود هستید، آدرس{' '}
          <span className="font-mono-tabular">MONGODB_URI</span> را در کادر زیر وارد نمایید تا Mongoose مستقیماً به آن متصل شود:
        </p>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-slate-600">منبع رشتهٔ اتصال:</span>
            {status.uriSource === 'env' ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                متغیر محیطی MONGODB_URI (پایدار)
              </span>
            ) : status.uriSource === 'panel' ? (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                فرم پنل (موقت — با ری‌استارت پاک می‌شود)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                تنظیم نشده
              </span>
            )}
            {status.readyState === 2 && (
              <span className="text-blue-600 font-bold">· در حال اتصال…</span>
            )}
          </div>
        )}

        {feedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {status && status.uriSource === 'panel' && !status.envConfigured && (
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              رشتهٔ اتصال فعلی فقط در فایل موقت همین سرور ذخیره شده است. با هر ری‌استارت،
              دیپلوی یا خواب رفتن سرویس (مثلاً Render free) پاک می‌شود و اتصال «قطعی» به‌نظر
              می‌رسد. برای اتصال پایدار، <span className="font-mono-tabular">MONGODB_URI</span> را
              در بخش Environment سرویس میزبان ثبت کنید.
            </span>
          </div>
        )}

        <form onSubmit={handleConnectMongo} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-9">
            <input
              type="text"
              dir="ltr"
              value={mongoUriInput}
              onChange={(e) => setMongoUriInput(e.target.value)}
              placeholder={
                status?.activeUri || 'mongodb+srv://username:password@cluster.mongodb.net/crypto_admin'
              }
              className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 font-mono-tabular text-left"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={connecting}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors h-[42px] whitespace-nowrap cursor-pointer"
            >
              {connecting ? 'در حال بررسی و اتصال...' : 'ذخیره و اتصال به MongoDB'}
            </button>
          </div>
        </form>
      </div>

      {/* Registered Admin Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">لیست مدیران ثبت‌نام شده در دیتابیس</h3>
          </div>
          <span className="text-xs text-slate-500">{users.length} مدیر</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="py-3 px-6">نام مدیر</th>
                <th className="py-3 px-4 text-left">ایمیل</th>
                <th className="py-3 px-4">سطح دسترسی</th>
                <th className="py-3 px-6 text-left">تاریخ ثبت‌نام</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {users.map((u, idx) => (
                <tr key={u.id || idx} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-6 font-bold text-slate-900">{u.name}</td>
                  <td className="py-3.5 px-4 text-left font-mono-tabular text-xs text-slate-600">
                    {u.email}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-blue-600" />
                      <span>{u.role}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-left font-mono-tabular text-xs text-slate-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('fa-IR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
