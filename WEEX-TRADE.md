# ترید WEEX (WEEX Futures Trading)

بخش جدید «ترید WEEX» در منوی پنل، معامله فیوچرز بر اساس **سیگنال‌های تأییدشده** را فراهم می‌کند؛ هم در حالت **مجازی (Paper)** و هم **واقعی (Live)** روی صرافی WEEX.

## فایل‌های اضافه‌شده / تغییرکرده

| فایل | توضیح |
| --- | --- |
| `server/weexClient.ts` | کلاینت REST رسمی WEEX (Market / Account / Trade) با امضای HMAC-SHA256 |
| `server/weexEngine.ts` | موتور ترید: سفارش مجازی، سفارش واقعی، TP1/TP2/SL، تیک ۱۵ ثانیه‌ای، اتصال به سیگنال |
| `server/models.ts` | مدل‌های `WeexSettings` و `WeexPosition` + متدهای `dbRepo` |
| `server.ts` | روت‌های `/api/weex/*` |
| `server/signalEngine.ts` | تحویل خودکار سیگنال تأییدشده به موتور WEEX (در صورت فعال بودن Auto Trade) |
| `src/components/WeexTradePanel.tsx` | رابط کاربری کامل بخش ترید WEEX |
| `src/apiclient.ts` | تایپ‌ها و متدهای API سمت فرانت |
| `src/App.tsx` | منوی «ترید WEEX» |

## راه‌اندازی

1. در WEEX یک API Key با مجوز **Contract/Futures Trading** بسازید (و در صورت نیاز IP Whitelist).
2. وارد منوی **ترید WEEX → تنظیمات و کلید API** شوید.
3. `API Key`، `Secret Key` و `Passphrase` را وارد و «ذخیره تنظیمات» را بزنید.
4. با «تست اتصال» صحت کلید و موجودی USDT را بررسی کنید.
5. حالت **مجازی** را برای آزمایش انتخاب کنید؛ پس از اطمینان، **واقعی** را فعال کنید.
6. برای اجرای خودکار روی سیگنال‌های تأییدشده، گزینه **«معامله خودکار روی سیگنال‌های تأییدشده»** را روشن کنید.

> Secret و Passphrase فقط سمت سرور ذخیره می‌شوند و در هیچ پاسخ API برگردانده نمی‌شوند.

## منطق معامله

- **ورود**: از `entryPrice` سیگنال (سفارش LIMIT) یا قیمت بازار (MARKET).
- **حد ضرر**: از `stopLoss` سیگنال.
- **حد سود ۱**: از `takeProfit1`؛ درصد بستن آن قابل تنظیم است (پیش‌فرض ۵۰٪).
- **حد سود ۲**: از `takeProfit2`؛ باقی پوزیشن را می‌بندد.
- **اهرم و مارجین**: اهرم پیش‌فرض + درصد مارجین هر معامله از تنظیمات.
- **فیلتر ورود پولبک**: در صورت فعال بودن، ورودهای شکست (Breakout) رد می‌شوند (همان رفتار موتور دمو).
- **کارمزد**: در حالت مجازی، کارمزد تیکر (پیش‌فرض ۰.۰۵٪) روی باز و بسته کردن اعمال می‌شود.

## نگاشت اندپوینت‌های WEEX

| کاربرد | متد و مسیر |
| --- | --- |
| زمان سرور | `GET /capi/v3/market/time` |
| اطلاعات قراردادها | `GET /capi/v3/market/exchangeInfo` |
| قیمت ۲۴ ساعته | `GET /capi/v3/market/ticker/24hr` |
| بهترین خرید/فروش | `GET /capi/v3/market/ticker/bookTicker` |
| کندل | `GET /capi/v3/market/klines` |
| موجودی | `GET /capi/v3/account/balance` |
| تنظیمات حساب | `GET /capi/v3/account/accountConfig` |
| همه پوزیشن‌ها | `GET /capi/v3/account/position/allPosition` |
| ثبت سفارش | `POST /capi/v3/order` |
| لغو سفارش | `DELETE /capi/v3/order` |
| بستن پوزیشن | `POST /capi/v3/closePositions` |
| ثبت TP/SL | `POST /capi/v3/placeTpSlOrder` |
| ویرایش TP/SL | `POST /capi/v3/modifyTpSlOrder` |
| سفارش‌های شرطی باز | `GET /capi/v3/openAlgoOrders` |
| لغو سفارش‌های شرطی | `DELETE /capi/v3/algoOpenOrders` |
| جزئیات معاملات | `GET /capi/v3/userTrades` |

**امضا (طبق مستندات):**

```
signature = BASE64( HMAC_SHA256( secret,
  timestamp + METHOD + requestPath + ("?" + queryString) + body ) )
```

هدرها: `ACCESS-KEY`، `ACCESS-SIGN`، `ACCESS-TIMESTAMP`، `ACCESS-PASSPHRASE`.

محیط‌ها: `https://api-contract.weex.com` (Production) و `https://api-sim.weex.com` (Simulation).

## APIهای داخلی

| مسیر | کار |
| --- | --- |
| `GET /api/weex/snapshot` | وضعیت کامل (تنظیمات، آمار، پوزیشن‌ها، تاریخچه، سیگنال‌ها، حساب واقعی) |
| `POST /api/weex/settings` | ذخیره کلیدها و تنظیمات |
| `POST /api/weex/test` | تست اتصال و خواندن موجودی |
| `GET /api/weex/market` | تیکرهای بازار (WEEX، با پشتیبان Binance) |
| `POST /api/weex/order` | ثبت سفارش مجازی/واقعی |
| `GET /api/weex/signals` | سیگنال‌های تأییدشده ۲۴ ساعت گذشته |
| `POST /api/weex/signals/:id/trade` | معامله یک سیگنال خاص |
| `POST /api/weex/positions/:id/close` | بستن/لغو |
| `POST /api/weex/positions/:id/protection` | ویرایش SL/TP |
| `DELETE /api/weex/history` | پاک کردن تاریخچه |
| `POST /api/weex/reset-paper` | ریست حساب مجازی |
| `POST /api/weex/tick` | اجرای دستی موتور |

## متغیرهای محیطی (اختیاری)

```env
WEEX_API_KEY=""
WEEX_API_SECRET=""
WEEX_API_PASSPHRASE=""
```

اگر خالی باشند، می‌توانید کلیدها را از داخل پنل وارد کنید.

## به‌روزرسانی: تبدیل خودکار سیگنال به پوزیشن

- **ارسال خودکار پیش‌فرض روشن است.** هر سیگنال تأییدشده بلافاصله یک سفارش **LIMIT** روی نقطه ورود سیگنال می‌سازد؛ وقتی قیمت به آن سطح برسد، پوزیشن در صرافی فعال می‌شود.
- دکمه **«ارسال همه به پوزیشن»** در تب سیگنال‌ها، تمام سیگنال‌های قابل معامله ۲۴ ساعت گذشته را یک‌جا تبدیل می‌کند.
- هر سیگنال در لیست وضعیت خودش را نشان می‌دهد: «قابل ارسال»، «در پوزیشن است» یا دلیل عدم امکان معامله (مثلاً «این نماد در WEEX فهرست نشده است»).
- فیلتر «فقط ورود پولبک» فقط برای سفارش **MARKET** اعمال می‌شود؛ سفارش LIMIT همیشه روی نقطه ورود منتظر می‌ماند.

### حد ضرر و حد سود در حالت واقعی

- هنگام ثبت سفارش ورود، `slTriggerPrice` (حد ضرر) و `tpTriggerPrice` (TP2 یا در نبود آن TP1) به‌صورت **بومی روی همان سفارش** به صرافی ارسال می‌شوند.
- وقتی قیمت به **TP1** برسد، موتور با یک سفارش `reduceOnly MARKET` درصد تعیین‌شده (پیش‌فرض ۵۰٪) را می‌بندد و بقیه تا TP2 یا حد ضرر ادامه می‌دهد.
- اگر صرافی سفارش را بلافاصله لغو کند (مثلاً مارجین کافی نبود)، پوزیشن «فیک» ساخته نمی‌شود و خطای فارسی نمایش داده می‌شود.

### نکات مهم نمادها

- فقط نمادهایی قابل معامله‌اند که هم در `exchangeInfo` و هم در `apiTradingSymbols` صرافی WEEX باشند (مثلاً `GTCUSDT` در WEEX فعال نیست).
- اندازهٔ سفارش به **stepSize** قرارداد گرد می‌شود؛ WEEX برای بعضی نمادها `quantityPrecision` منفی دارد (مثلاً XLMUSDT با step=100). مقدارها به‌درستی گرد می‌شوند.
