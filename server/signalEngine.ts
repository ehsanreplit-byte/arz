/**
 * Signals Engine (موتور سیگنال‌ها)
 * ---------------------------------------------------------------------------
 * 1. Every 30 minutes, on the 15m timeframe, iterate over the watchlist symbols
 *    (the coins the admin added on the "قیمت لحظه‌ای بایننس" page).
 * 2. For every symbol, send a request to ChatGPT (AvalAI, OpenAI-compatible)
 *    with a 30 second gap between consecutive requests.
 * 3. Run the deterministic Al Brooks 6-method price action engine locally and
 *    count how many of the 6 signals are BUY (LONG) vs SELL (SHORT).
 * 4. Any symbol that issued at least 3 buy or at least 3 sell signals across
 *    all 6 signals is registered as a consensus (qualified) signal.
 */

import { computeSingleMethodSignal } from './alBrooksSingle.js';
import { dbRepo, IRegisteredSignal, ISignalMethodItem } from './models.js';
import {
  analyzeAllFiveAlBrooksMethods,
  OhlcvCandle,
  FiveMethodsCompleteAnalysis,
} from '../src/utils/alBrooksMethods.js';

// ---------------------------------------------------------------------------
// Configuration (env-overridable so tests / manual runs can be faster)
// ---------------------------------------------------------------------------
/** Parses '15m' / '1h' / '4h' / '1d' into minutes (default 15). */
function parseTimeframeMinutes(tf: string): number {
  const m = /^(\d+)\s*([mhd])$/i.exec(String(tf || '').trim());
  if (!m) return 15;
  const value = Math.max(1, Number(m[1]));
  const unit = m[2].toLowerCase();
  if (unit === 'h') return value * 60;
  if (unit === 'd') return value * 60 * 24;
  return value;
}

/** Timeframe in minutes drives the schedule (15m → 00/15/30/45 …). */
const TIMEFRAME_MINUTES = parseTimeframeMinutes(process.env.SIGNAL_TIMEFRAME || '15m');
/**
 * Align every cycle to the UTC candle close (…:00, :15, :30, :45 for 15m).
 * Set SIGNAL_ALIGN_TO_TIMEFRAME=false to go back to a fixed interval.
 */
const ALIGN_TO_TIMEFRAME = process.env.SIGNAL_ALIGN_TO_TIMEFRAME !== 'false';
/** Small delay after the boundary so the exchange has published the closed candle. */
const BOUNDARY_BUFFER_MS = Math.max(
  0,
  Number(process.env.SIGNAL_BOUNDARY_BUFFER_MS ?? 5000)
);
const CYCLE_INTERVAL_MS = ALIGN_TO_TIMEFRAME
  ? TIMEFRAME_MINUTES * 60 * 1000
  : Math.max(60_000, Number(process.env.SIGNAL_CYCLE_INTERVAL_MS || 30 * 60 * 1000));

/** Timestamps are computed in UTC but recorded/displayed in this timezone. */
const REPORT_TIMEZONE = process.env.SIGNAL_TIMEZONE || 'Asia/Tehran';

/** Next UTC boundary of the configured timeframe (+ a few seconds of buffer). */
function nextUtcBoundary(fromMs: number = Date.now()): number {
  const step = TIMEFRAME_MINUTES * 60 * 1000;
  const boundary = (Math.floor(fromMs / step) + 1) * step;
  return boundary + BOUNDARY_BUFFER_MS;
}

/** Formats a timestamp in the reporting timezone (Asia/Tehran by default). */
function formatReportTime(ms: number | null): string | null {
  if (!ms) return null;
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone: REPORT_TIMEZONE,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}
const REQUEST_GAP_MS = Math.max(
  0,
  Number(process.env.SIGNAL_REQUEST_GAP_MS || 30 * 1000)
);
const SIGNAL_TIMEFRAME = (process.env.SIGNAL_TIMEFRAME || '15m').trim();
const HTF_TIMEFRAME = (process.env.SIGNAL_HTF_TIMEFRAME || '1h').trim();
const MIN_CONSENSUS = Math.max(1, Number(process.env.SIGNAL_MIN_CONSENSUS || 3));
/** Minimum average technical score (0-100) for a signal to be qualified. */
const MIN_SCORE_PCT = Math.min(100, Math.max(0, Number(process.env.SIGNAL_MIN_SCORE_PCT ?? 50)));
const AI_ENABLED = process.env.SIGNAL_AI_ENABLED !== 'false';
const AI_TIMEOUT_MS = Number(process.env.SIGNAL_AI_TIMEOUT_MS || 40_000);
/**
 * How many symbols are analysed per ChatGPT request. Batching cuts a cycle from
 * one request per symbol down to one request per batch, so the whole cycle is
 * much faster. 1 disables batching.
 */
const AI_BATCH_SIZE = Math.max(1, Number(process.env.SIGNAL_AI_BATCH_SIZE || 1));
const RUN_ON_BOOT = process.env.SIGNAL_RUN_ON_BOOT === 'true';

export interface SignalCycleSymbolResult {
  symbol: string;
  label: string;
  buySignalsCount: number;
  sellSignalsCount: number;
  totalSignalsChecked: number;
  matchedSignalsCount: number;
  consensusDirection: 'LONG' | 'SHORT' | 'NO TRADE';
  qualified: boolean;
  recorded: boolean;
  /** true when the signal was handed over to the trade engine right away */
  dispatchedToTrade?: boolean;
  /** machine-readable outcome of the trade hand-off */
  tradeStatus?: string;
  tradeNote?: string;
  chatGptStatus: string;
  aiEngineUsed: string;
  /** true when the ChatGPT verdict was a real AI answer and counted as a vote */
  aiVoteCounted?: boolean;
  /** direction voted by the independent single-method Al Brooks signal */
  singleMethodDirection?: 'LONG' | 'SHORT' | 'NO TRADE';
  /** how many agreeing methods were averaged into the order levels (0 = fallback) */
  levelsAveragedFrom?: number;
  error?: string;
}

export interface SignalEngineState {
  isRunning: boolean;
  isSchedulerEnabled: boolean;
  cycleNumber: number;
  timeframe: string;
  htfTimeframe: string;
  minConsensus: number;
  requestGapMs: number;
  /** symbols analysed per ChatGPT request */
  aiBatchSize: number;
  cycleIntervalMs: number;
  /** timeframe length that drives the schedule, in minutes */
  timeframeMinutes: number;
  /** true when cycles are aligned to UTC candle closes */
  alignedToTimeframe: boolean;
  timezone: string;
  lastRunAt: string | null;
  lastRunAtIran: string | null;
  lastFinishedAt: string | null;
  lastFinishedAtIran: string | null;
  nextRunAt: string | null;
  nextRunAtIran: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  currentSymbol: string | null;
  currentIndex: number;
  totalSymbols: number;
  registeredLastCycle: number;
  dispatchedLastCycle: number;
  evaluatedLastCycle: number;
  /** total number of symbol evaluations ever performed (persistent counter) */
  totalEvaluated: number;
  lastCycleResults: SignalCycleSymbolResult[];
}

interface ChatGptVerdict {
  status: string;
  direction: 'LONG' | 'SHORT' | 'NO TRADE';
  setupName: string;
  reasoning: string;
  engineUsed: string;
}

/** One symbol, fully fetched and analysed once per cycle. */
interface PreparedSymbol {
  symbol: string;
  label: string;
  error: string | null;
  candles: OhlcvCandle[];
  analysis: FiveMethodsCompleteAnalysis | null;
  breakdown: ISignalMethodItem[];
  votingMethods: ISignalMethodItem[];
  methodBuy: number;
  methodSell: number;
  verdict: ChatGptVerdict | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ensures the NEXT ChatGPT request is sent at least REQUEST_GAP_MS after the
 * PREVIOUS one was sent (default 30 seconds between send times, not after the
 * response arrives).
 */
async function waitForRequestGap(requestStartedAt: number): Promise<void> {
  const elapsed = Date.now() - requestStartedAt;
  const remaining = REQUEST_GAP_MS - elapsed;
  if (remaining > 0) await sleep(remaining);
}

// ---------------------------------------------------------------------------
// Binance klines (public, no auth)
// ---------------------------------------------------------------------------
async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 401
): Promise<OhlcvCandle[]> {
  const endpoints = [
    'https://data-api.binance.vision/api/v3/klines',
    'https://api.binance.com/api/v3/klines',
  ];

  for (const base of endpoints) {
    try {
      const url = `${base}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(
        interval
      )}&limit=${limit}`;
      const res = await fetch(url);
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr.length >= 30) {
          return arr.map((k: any) => ({
            time: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
        }
      }
    } catch {
      // try the next endpoint
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Extract the 6 method signals from a local Al Brooks analysis
// ---------------------------------------------------------------------------
function buildSignalsBreakdown(
  analysis: FiveMethodsCompleteAnalysis
): ISignalMethodItem[] {
  const m1 = analysis.method1Trend;
  const m2 = analysis.method2Range;
  const m3 = analysis.method3Reversal;
  const m4 = analysis.method4Breakout;
  const m5 = analysis.method5Pullback;
  const m6 = analysis.method6Summary;

  return [
    {
      id: 'trend',
      title: m1.titleFa,
      direction: m1.trade.direction,
      setupName: m1.trendDirectionFa || m1.signalStatusFa,
      score: m1.score.total,
      entryPrice: m1.trade.entryPrice,
      stopLoss: m1.trade.stopLoss,
      takeProfit1: m1.trade.takeProfit1,
      takeProfit2: m1.trade.takeProfit2,
    },
    {
      id: 'range',
      title: m2.titleFa,
      direction: m2.trade.direction,
      setupName: m2.currentPriceZoneFa || m2.signalStatusFa,
      score: m2.score.total,
      entryPrice: m2.trade.entryPrice,
      stopLoss: m2.trade.stopLoss,
      takeProfit1: m2.trade.takeProfit1,
      takeProfit2: m2.trade.takeProfit2,
    },
    {
      id: 'reversal',
      title: m3.titleFa,
      direction: m3.trade.direction,
      setupName: m3.reversalPatternFa || m3.signalStatusFa,
      score: m3.score.total,
      entryPrice: m3.trade.entryPrice,
      stopLoss: m3.trade.stopLoss,
      takeProfit1: m3.trade.takeProfit1,
      takeProfit2: m3.trade.takeProfit2,
    },
    {
      id: 'breakout',
      title: m4.titleFa,
      direction: m4.trade.direction,
      setupName: m4.breakoutLevelTypeFa || m4.signalStatusFa,
      score: m4.score.total,
      entryPrice: m4.trade.entryPrice,
      stopLoss: m4.trade.stopLoss,
      takeProfit1: m4.trade.takeProfit1,
      takeProfit2: m4.trade.takeProfit2,
    },
    {
      id: 'pullback',
      title: m5.titleFa,
      direction: m5.trade.direction,
      setupName: m5.detectedPatternFa || m5.signalStatusFa,
      score: m5.score.total,
      entryPrice: m5.trade.entryPrice,
      stopLoss: m5.trade.stopLoss,
      takeProfit1: m5.trade.takeProfit1,
      takeProfit2: m5.trade.takeProfit2,
    },
    {
      id: 'summary',
      // shown for information only — it summarises the five methods above and
      // must never be counted as an independent vote
      isSummary: true,
      title: m6.titleFa,
      direction: m6.recommendedDirection,
      setupName: m6.selectedMethodTitleFa || 'جمع‌بندی',
      score: m6.score.total,
      entryPrice: m6.trade.entryPrice,
      stopLoss: m6.trade.stopLoss,
      takeProfit1: m6.trade.takeProfit1,
      takeProfit2: m6.trade.takeProfit2,
    },
  ];
}

// ---------------------------------------------------------------------------
// ChatGPT (AvalAI) verdict for one symbol
// ---------------------------------------------------------------------------
async function askChatGptVerdict(params: {
  symbol: string;
  label: string;
  analysis: FiveMethodsCompleteAnalysis;
  breakdown: ISignalMethodItem[];
  buySignalsCount: number;
  sellSignalsCount: number;
}): Promise<ChatGptVerdict> {
  const { symbol, label, analysis, breakdown, buySignalsCount, sellSignalsCount } = params;

  const localFallback = (status: string, reasoning: string): ChatGptVerdict => {
    const consensus: 'LONG' | 'SHORT' | 'NO TRADE' =
      buySignalsCount > sellSignalsCount
        ? 'LONG'
        : sellSignalsCount > buySignalsCount
          ? 'SHORT'
          : 'NO TRADE';
    return {
      status,
      direction: consensus,
      setupName: analysis.method6Summary.selectedMethodTitleFa || 'تحلیل محلی ال بروکس',
      reasoning,
      engineUsed: 'Local Al Brooks 6-Method Engine',
    };
  };

  if (!AI_ENABLED) {
    return localFallback(
      'غیرفعال (تحلیل محلی)',
      'ارسال درخواست به ChatGPT غیرفعال است؛ نتیجه بر اساس موتور محلی ال بروکس ثبت شد.'
    );
  }

  let cfg;
  try {
    cfg = await dbRepo.getAvalAIConfig();
  } catch {
    return localFallback('تنظیمات ChatGPT در دسترس نیست', 'خواندن تنظیمات AvalAI ممکن نشد.');
  }

  const apiKey = (cfg.apiKey || '').trim();
  if (!apiKey || apiKey === 'MY_AVALAI_API_KEY' || apiKey.startsWith('MY_')) {
    return localFallback(
      'بدون کلید API',
      'کلید AvalAI تنظیم نشده است؛ نتیجه بر اساس موتور محلی ال بروکس ثبت شد.'
    );
  }

  const baseUrl = (cfg.baseUrl || 'https://api.avalai.ir/v1').replace(/\/+$/, '');
  const modelName = cfg.modelName || 'gpt-4o-mini';

  const signalLines = breakdown
    .map((s) => `- ${s.title}: ${s.direction} (${s.setupName}, امتیاز ${s.score})`)
    .join('\n');

  const prompt = [
    `نماد: ${symbol} (${label})`,
    `تایم‌فریم: ${analysis.interval}`,
    `قیمت لحظه‌ای: ${analysis.currentLivePrice}`,
    `EMA20: ${analysis.ema20} | ATR14: ${analysis.atr14}`,
    `تعداد سیگنال خرید (LONG): ${buySignalsCount}`,
    `تعداد سیگنال فروش (SHORT): ${sellSignalsCount}`,
    'سیگنال‌های ۶ گانه ال بروکس:',
    signalLines,
    '',
    'بر اساس این داده‌ها فقط یک JSON با این ساختار برگردان:',
    '{"direction":"LONG" | "SHORT" | "NO TRADE","setupName":"نام کوتاه فارسی ستاپ","reasoning":"یک تا دو جمله فارسی"}',
  ].join('\n');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'شما یک تحلیل‌گر حرفه‌ای پرایس اکشن ال بروکس هستید و فقط JSON معتبر برمی‌گردانید.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return localFallback(
        `خطای ChatGPT (HTTP ${res.status})`,
        'درخواست به ChatGPT ناموفق بود؛ نتیجه بر اساس موتور محلی ال بروکس ثبت شد.'
      );
    }

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return localFallback(
        'پاسخ نامعتبر ChatGPT',
        'پاسخ ChatGPT قابل تفسیر نبود؛ نتیجه بر اساس موتور محلی ثبت شد.'
      );
    }
    const parsed = JSON.parse(match[0]);
    const dir: 'LONG' | 'SHORT' | 'NO TRADE' =
      parsed.direction === 'LONG' || parsed.direction === 'SHORT'
        ? parsed.direction
        : 'NO TRADE';
    return {
      status: 'موفق',
      direction: dir,
      setupName: String(parsed.setupName || '').trim() || 'بدون ستاپ',
      reasoning: String(parsed.reasoning || '').trim() || '—',
      engineUsed: `ChatGPT (${modelName})`,
    };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'Timeout' : err?.message || 'خطای شبکه';
    return localFallback(
      `خطای ChatGPT: ${msg}`,
      'ارتباط با ChatGPT برقرار نشد؛ نتیجه بر اساس موتور محلی ال بروکس ثبت شد.'
    );
  }
}

// ---------------------------------------------------------------------------
// Batched ChatGPT verdicts (several symbols in ONE request)
// ---------------------------------------------------------------------------
export interface BatchVerdictItem {
  symbol: string;
  label: string;
  analysis: FiveMethodsCompleteAnalysis;
  breakdown: ISignalMethodItem[];
  buySignalsCount: number;
  sellSignalsCount: number;
}

/** The offline verdict for one symbol, used whenever the AI is unavailable. */
function buildLocalVerdict(item: BatchVerdictItem, status: string, reasoning: string): ChatGptVerdict {
  const consensus: 'LONG' | 'SHORT' | 'NO TRADE' =
    item.buySignalsCount > item.sellSignalsCount
      ? 'LONG'
      : item.sellSignalsCount > item.buySignalsCount
        ? 'SHORT'
        : 'NO TRADE';
  return {
    status,
    direction: consensus,
    setupName: item.analysis.method6Summary.selectedMethodTitleFa || 'تحلیل محلی ال بروکس',
    reasoning,
    engineUsed: 'Local Al Brooks 6-Method Engine',
  };
}

/** Strips markdown fences and pulls the first JSON array out of a reply. */
function parseVerdictArray(raw: string): any[] {
  let text = String(raw || '').trim();
  text = text.replace(/```json/gi, '```').replace(/```/g, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Asks ChatGPT for a verdict on SEVERAL symbols in a single request and returns
 * one verdict per input item, in the same order. Any symbol the model failed to
 * answer (or answered unusably) falls back to the local Al Brooks verdict, so a
 * bad batch never costs the whole cycle.
 */
async function askChatGptVerdictsBatch(items: BatchVerdictItem[]): Promise<ChatGptVerdict[]> {
  const fallbacks = items.map((it) =>
    buildLocalVerdict(it, 'غیرفعال (تحلیل محلی)', 'نتیجه بر اساس موتور محلی ال بروکس ثبت شد.')
  );
  if (items.length === 0) return [];

  const cfg = await dbRepo.getAvalAIConfig();
  const apiKey = String(cfg.apiKey || '').trim();
  const baseUrl = String(cfg.baseUrl || 'https://api.avalai.ir/v1').replace(/\/+$/, '');
  const modelName = cfg.modelName || 'gpt-4o-mini';

  if (!AI_ENABLED || !apiKey) {
    return items.map((it) =>
      buildLocalVerdict(
        it,
        AI_ENABLED ? 'تنظیمات ChatGPT در دسترس نیست' : 'غیرفعال (تحلیل محلی)',
        AI_ENABLED
          ? 'کلید API یا آدرس سرویس تنظیم نشده است؛ نتیجه بر اساس موتور محلی ثبت شد.'
          : 'ارسال درخواست به ChatGPT غیرفعال است؛ نتیجه بر اساس موتور محلی ال بروکس ثبت شد.'
      )
    );
  }

  const blocks = items.map((it, idx) => {
    const signalLines = it.breakdown
      .map((s) => `   - ${s.title}: ${s.direction} (${s.setupName}, امتیاز ${s.score})`)
      .join('\n');
    return [
      `${idx + 1}) نماد: ${it.symbol} (${it.label})`,
      `   تایم‌فریم: ${it.analysis.interval} | قیمت لحظه‌ای: ${it.analysis.currentLivePrice}`,
      `   EMA20: ${it.analysis.ema20} | ATR14: ${it.analysis.atr14}`,
      `   تعداد سیگنال خرید: ${it.buySignalsCount} | تعداد سیگنال فروش: ${it.sellSignalsCount}`,
      '   سیگنال‌های ال بروکس:',
      signalLines,
    ].join('\n');
  });

  const prompt = [
    'برای هر نماد زیر یک تحلیل جدا انجام بده.',
    '',
    ...blocks,
    '',
    'فقط یک آرایه JSON با این ساختار برگردان (برای هر نماد یک عضو، به همان ترتیب):',
    '[{"symbol":"نماد","direction":"LONG" | "SHORT" | "NO TRADE","setupName":"نام کوتاه فارسی ستاپ","reasoning":"یک تا دو جمله فارسی"}]',
  ].join('\n');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'شما یک تحلیل‌گر حرفه‌ای پرایس اکشن ال بروکس هستید و فقط JSON معتبر برمی‌گردانید.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content || '');
    const parsed = parseVerdictArray(raw);

    if (parsed.length === 0) {
      throw new Error('پاسخ مدل آرایه JSON معتبر نبود');
    }

    // match each answer back to its symbol
    const bySymbol = new Map<string, any>();
    for (const row of parsed) {
      const key = String(row?.symbol || '').trim().toUpperCase();
      if (key) bySymbol.set(key, row);
    }

    return items.map((it, idx) => {
      const row =
        bySymbol.get(it.symbol.toUpperCase()) ||
        parsed[idx] ||
        null;
      if (!row) {
        return buildLocalVerdict(
          it,
          'پاسخ ناقص از ChatGPT',
          'مدل برای این نماد پاسخی برنگرداند؛ نتیجه بر اساس موتور محلی ثبت شد.'
        );
      }
      const dir: 'LONG' | 'SHORT' | 'NO TRADE' = ['LONG', 'SHORT'].includes(
        String(row.direction || '').toUpperCase()
      )
        ? (String(row.direction).toUpperCase() as 'LONG' | 'SHORT')
        : 'NO TRADE';
      return {
        status: 'موفق',
        direction: dir,
        setupName: String(row.setupName || '').trim() || 'بدون ستاپ',
        reasoning: String(row.reasoning || '').trim() || '—',
        engineUsed: `ChatGPT (${modelName})`,
      };
    });
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'Timeout' : err?.message || 'خطای شبکه';
    return items.map((it) =>
      buildLocalVerdict(
        it,
        `خطای ChatGPT: ${msg}`,
        'ارتباط با ChatGPT برقرار نشد؛ نتیجه بر اساس موتور محلی ال بروکس ثبت شد.'
      )
    );
  }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

class SignalEngine {
  private timer: NodeJS.Timeout | null = null;
  private state: SignalEngineState = {
    isRunning: false,
    isSchedulerEnabled: true,
    cycleNumber: 0,
    timeframe: SIGNAL_TIMEFRAME,
    htfTimeframe: HTF_TIMEFRAME,
    minConsensus: MIN_CONSENSUS,
    requestGapMs: REQUEST_GAP_MS,
    aiBatchSize: AI_BATCH_SIZE,
    cycleIntervalMs: CYCLE_INTERVAL_MS,
    timeframeMinutes: TIMEFRAME_MINUTES,
    alignedToTimeframe: ALIGN_TO_TIMEFRAME,
    timezone: REPORT_TIMEZONE,
    lastRunAt: null,
    lastRunAtIran: null,
    lastFinishedAt: null,
    lastFinishedAtIran: null,
    nextRunAt: null,
    nextRunAtIran: null,
    lastDurationMs: null,
    lastError: null,
    currentSymbol: null,
    currentIndex: 0,
    totalSymbols: 0,
    registeredLastCycle: 0,
    dispatchedLastCycle: 0,
    evaluatedLastCycle: 0,
    totalEvaluated: 0,
    lastCycleResults: [],
  };

  public getState(): SignalEngineState {
    return { ...this.state, lastCycleResults: [...this.state.lastCycleResults] };
  }

  public initialize(): void {
    void dbRepo
      .getCounter('signalEvaluations')
      .then((value) => {
        this.state.totalEvaluated = value;
      })
      .catch(() => undefined);
    this.startScheduler();
    if (RUN_ON_BOOT) {
      setTimeout(() => {
        void this.runCycle('boot');
      }, 8_000);
    }
  }

  public startScheduler(): void {
    this.stopScheduler();
    this.state.isSchedulerEnabled = true;
    this.scheduleNext();
  }

  public stopScheduler(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.isSchedulerEnabled = false;
    this.state.nextRunAt = null;
  }

  public toggleScheduler(enabled?: boolean): boolean {
    const next = enabled === undefined ? !this.state.isSchedulerEnabled : enabled;
    if (next) {
      this.startScheduler();
    } else {
      this.stopScheduler();
    }
    return this.state.isSchedulerEnabled;
  }

  /**
   * Arms the timer for the NEXT UTC candle close of the configured timeframe
   * (e.g. 15m → 00, 15, 30, 45 minutes past the hour, UTC).
   */
  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);

    const runAt = ALIGN_TO_TIMEFRAME
      ? nextUtcBoundary()
      : Date.now() + CYCLE_INTERVAL_MS;

    this.state.nextRunAt = new Date(runAt).toISOString();
    this.state.nextRunAtIran = formatReportTime(runAt);

    this.timer = setTimeout(() => {
      void this.onScheduledTick();
    }, Math.max(1000, runAt - Date.now()));
  }

  /**
   * Fires exactly on the candle boundary. A manual cycle never postpones it:
   * if one is still running we wait for it (up to 10 minutes) and then run the
   * scheduled cycle anyway.
   */
  private async onScheduledTick(): Promise<void> {
    this.timer = null;
    const deadline = Date.now() + 10 * 60 * 1000;
    while (this.state.isRunning && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    try {
      await this.runCycle('schedule');
    } finally {
      if (this.state.isSchedulerEnabled) this.scheduleNext();
    }
  }

  /**
   * Runs a full evaluation cycle over the watchlist symbols.
   * Requests to ChatGPT are spaced REQUEST_GAP_MS (default 30s) apart.
   */
  public async runCycle(
    trigger: 'schedule' | 'manual' | 'boot' = 'manual'
  ): Promise<{
    ok: boolean;
    error?: string;
    cycleNumber?: number;
    evaluated?: number;
    registered?: number;
    dispatched?: number;
    durationMs?: number;
  }> {
    if (this.state.isRunning) {
      return { ok: false, error: 'یک چرخه سیگنال در حال اجراست. لطفاً منتظر بمانید.' };
    }

    const startedAt = Date.now();
    this.state.isRunning = true;
    this.state.lastError = null;
    this.state.cycleNumber += 1;
    this.state.lastRunAt = new Date(startedAt).toISOString();
    this.state.lastRunAtIran = formatReportTime(startedAt);
    this.state.lastCycleResults = [];

    const cycleNumber = this.state.cycleNumber;

    try {
      const symbols = await dbRepo.getSymbols();
      this.state.totalSymbols = symbols.length;
      this.state.currentIndex = 0;

      let registered = 0;
      let evaluated = 0;
      let dispatched = 0;

      // =====================================================================
      // PHASE 1 — fetch and analyse every symbol once
      // =====================================================================
      const prepared = new Map<string, PreparedSymbol>();
      for (const sym of symbols) {
        const symbol = String(sym.symbol || '').toUpperCase();
        const entry: PreparedSymbol = {
          symbol,
          label: sym.label || symbol,
          error: null,
          candles: [],
          analysis: null,
          breakdown: [],
          votingMethods: [],
          methodBuy: 0,
          methodSell: 0,
          verdict: null,
        };
        try {
          const [candles, htfCandles] = await Promise.all([
            fetchKlines(symbol, SIGNAL_TIMEFRAME, 401),
            fetchKlines(symbol, HTF_TIMEFRAME, 401),
          ]);
          if (candles.length < 30) {
            entry.error = 'داده کندل کافی از بایننس دریافت نشد.';
          } else {
            entry.candles = candles;
            entry.analysis = analyzeAllFiveAlBrooksMethods({
              symbol,
              interval: SIGNAL_TIMEFRAME,
              rawCandles: candles,
              htfCandles,
              higherTimeframeInterval: HTF_TIMEFRAME,
            });
            entry.breakdown = buildSignalsBreakdown(entry.analysis);
            entry.votingMethods = entry.breakdown.filter((s) => s.id !== 'summary');
            entry.methodBuy = entry.votingMethods.filter((s) => s.direction === 'LONG').length;
            entry.methodSell = entry.votingMethods.filter((s) => s.direction === 'SHORT').length;
          }
        } catch (err: any) {
          entry.error = err?.message || 'خطا در تحلیل نماد';
        }
        prepared.set(symbol, entry);
      }

      // =====================================================================
      // PHASE 2 — ask the AI in batches (AI_BATCH_SIZE symbols per request)
      // =====================================================================
      const readyForAi = [...prepared.values()].filter((p) => !p.error && p.analysis);
      for (let b = 0; b < readyForAi.length; b += AI_BATCH_SIZE) {
        const batch = readyForAi.slice(b, b + AI_BATCH_SIZE);
        const batchStartedAt = Date.now();
        this.state.currentSymbol = batch.map((x) => x.symbol).join(' , ');
        this.state.currentIndex = Math.min(b + batch.length, readyForAi.length);

        const verdicts = await askChatGptVerdictsBatch(
          batch.map((p) => ({
            symbol: p.symbol,
            label: p.label,
            analysis: p.analysis as FiveMethodsCompleteAnalysis,
            breakdown: p.votingMethods,
            buySignalsCount: p.methodBuy,
            sellSignalsCount: p.methodSell,
          }))
        );
        batch.forEach((p, k) => {
          p.verdict = verdicts[k] || null;
        });

        // Only space requests out when a REAL AI request was actually made —
        // otherwise (AI disabled / unreachable) the wait would be pure delay.
        const aiAnswered = verdicts.some((v) => v.engineUsed.startsWith('ChatGPT'));
        if (aiAnswered && b + AI_BATCH_SIZE < readyForAi.length) {
          await waitForRequestGap(batchStartedAt);
        }
      }

      // =====================================================================
      // PHASE 3 — record every symbol and hand qualified ones to the trade engine
      // =====================================================================
      for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i];
        const symbol = String(sym.symbol || '').toUpperCase();
        this.state.currentIndex = i + 1;
        this.state.currentSymbol = symbol;

        const requestStartedAt = Date.now();

        const result: SignalCycleSymbolResult = {
          symbol,
          label: sym.label || symbol,
          buySignalsCount: 0,
          sellSignalsCount: 0,
          totalSignalsChecked: 0,
          matchedSignalsCount: 0,
          consensusDirection: 'NO TRADE',
          qualified: false,
          recorded: false,
          dispatchedToTrade: false,
          tradeStatus: '',
          tradeNote: '',
          chatGptStatus: 'در انتظار',
          aiEngineUsed: '—',
        };

        try {
          const prep = prepared.get(symbol);

          if (!prep || prep.error || !prep.analysis) {
            result.error = prep?.error || 'داده کندل کافی از بایننس دریافت نشد.';
            result.chatGptStatus = 'لغو شد (بدون داده)';
            this.state.lastCycleResults.push(result);
            continue;
          }

          const candles = prep.candles;
          const analysis = prep.analysis;
          const breakdown = prep.breakdown;
          const votingMethods = prep.votingMethods;

          // verdict came from the batched AI request in PHASE 2
          const verdict: ChatGptVerdict =
            prep.verdict ||
            buildLocalVerdict(
              {
                symbol,
                label: result.label,
                analysis,
                breakdown: votingMethods,
                buySignalsCount: prep.methodBuy,
                sellSignalsCount: prep.methodSell,
              },
              'بدون پاسخ هوش مصنوعی',
              'پاسخی از ChatGPT ثبت نشد؛ نتیجه بر اساس موتور محلی ال بروکس است.'
            );

          // The AI opinion is a real, independent sixth vote — but ONLY when it
          // is an actual ChatGPT answer. When the endpoint is unreachable the
          // verdict falls back to the local consensus, and counting that would
          // be double counting all over again.
          const aiIsReal = verdict.engineUsed.startsWith('ChatGPT');
          const aiVote: 'LONG' | 'SHORT' | 'NO TRADE' =
            aiIsReal && verdict.direction !== 'NO TRADE' ? verdict.direction : 'NO TRADE';

          // The single-method Al Brooks signal (the one drawn on the chart) is a
          // genuinely independent seventh voter: it reads the EMA 20 alone
          // instead of the five-method breakdown.
          const singleMethod = computeSingleMethodSignal(candles as any);
          const singleVote: 'LONG' | 'SHORT' | 'NO TRADE' = singleMethod
            ? singleMethod.direction
            : 'NO TRADE';

          const votes: Array<'LONG' | 'SHORT' | 'NO TRADE'> = [
            ...votingMethods.map((s) => s.direction),
            singleVote,
            aiVote,
          ];
          const buySignalsCount = votes.filter((d) => d === 'LONG').length;
          const sellSignalsCount = votes.filter((d) => d === 'SHORT').length;
          const totalSignalsChecked = votes.length;
          const matchedSignalsCount = Math.max(buySignalsCount, sellSignalsCount);
          const avgScore =
            breakdown.reduce((acc, s) => acc + (Number(s.score) || 0), 0) /
            Math.max(1, breakdown.length);
          const scoreOk = avgScore >= MIN_SCORE_PCT;
          const isQualified = matchedSignalsCount >= MIN_CONSENSUS && scoreOk;
          const consensusDirection: 'LONG' | 'SHORT' | 'NO TRADE' =
            buySignalsCount === sellSignalsCount
              ? 'NO TRADE'
              : buySignalsCount > sellSignalsCount
                ? 'LONG'
                : 'SHORT';

          result.buySignalsCount = buySignalsCount;
          result.sellSignalsCount = sellSignalsCount;
          result.totalSignalsChecked = totalSignalsChecked;
          result.matchedSignalsCount = matchedSignalsCount;
          result.consensusDirection = consensusDirection;
          result.qualified = isQualified;
          result.chatGptStatus = verdict.status;
          result.aiEngineUsed = verdict.engineUsed;
          result.aiVoteCounted = aiIsReal && aiVote !== 'NO TRADE';
          result.singleMethodDirection = singleVote;

          // Record EVERY evaluated watchlist symbol (qualified or not) so the
          // table shows the live price and signal status of all added coins.
          // ---- consensus levels: AVERAGE the agreeing methods ----
          // Every method that agrees with the consensus direction contributes its
          // own entry / stop / targets and the order uses the average of them,
          // instead of the levels of one single method. Method 6 is excluded: it
          // only mirrors the others and would double-weight the same opinion.
          type LevelSource = {
            entryPrice?: number;
            stopLoss?: number;
            takeProfit1?: number;
            takeProfit2?: number;
          };

          const agreeing: LevelSource[] = breakdown
            .filter((s) => s.direction === consensusDirection && s.id !== 'summary')
            .map((s) => ({
              entryPrice: s.entryPrice,
              stopLoss: s.stopLoss,
              takeProfit1: s.takeProfit1,
              takeProfit2: s.takeProfit2,
            }));

          // the independent single-method signal joins the average when it agrees
          if (singleMethod && singleVote === consensusDirection) {
            agreeing.push({
              entryPrice: singleMethod.entryPrice,
              stopLoss: singleMethod.stopLoss,
              takeProfit1: singleMethod.takeProfit1,
              takeProfit2: singleMethod.takeProfit2,
            });
          }

          const averageOf = (pick: (s: LevelSource) => number | undefined): number | null => {
            const vals = agreeing
              .map(pick)
              .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
            if (vals.length === 0) return null;
            return vals.reduce((a, b) => a + b, 0) / vals.length;
          };

          const primary =
            breakdown.find((s) => s.id === 'summary' && s.direction === consensusDirection) ||
            breakdown.find((s) => s.direction === consensusDirection) ||
            breakdown[0];

          let entryPrice =
            averageOf((s) => s.entryPrice) ??
            (Number(primary?.entryPrice) || analysis.currentLivePrice);
          let stopLoss = averageOf((s) => s.stopLoss) ?? Number(primary?.stopLoss) ?? 0;
          let takeProfit1 = averageOf((s) => s.takeProfit1) ?? Number(primary?.takeProfit1) ?? 0;
          let takeProfit2 = averageOf((s) => s.takeProfit2) ?? Number(primary?.takeProfit2) ?? 0;

          // ---- sanity check: averaged levels must stay on the right side ----
          const levelsValid =
            consensusDirection === 'LONG'
              ? stopLoss > 0 &&
                stopLoss < entryPrice &&
                takeProfit1 > entryPrice &&
                takeProfit2 > takeProfit1
              : consensusDirection === 'SHORT'
                ? stopLoss > entryPrice &&
                  takeProfit1 > 0 &&
                  takeProfit1 < entryPrice &&
                  takeProfit2 < takeProfit1
                : false;

          if (!levelsValid) {
            // fall back to a single method's levels when the average is incoherent
            entryPrice = Number(primary?.entryPrice) || analysis.currentLivePrice;
            stopLoss = Number(primary?.stopLoss) || 0;
            takeProfit1 = Number(primary?.takeProfit1) || 0;
            takeProfit2 = Number(primary?.takeProfit2) || 0;
          }

          // ---- cap an over-wide stop loss at 10% of the entry price ----
          const maxStopPct = Math.max(0.1, Number(process.env.TRADE_MAX_STOP_PCT || 10));
          if (entryPrice > 0 && stopLoss > 0) {
            const maxDistance = (entryPrice * maxStopPct) / 100;
            if (consensusDirection === 'LONG' && entryPrice - stopLoss > maxDistance) {
              stopLoss = Math.round((entryPrice - maxDistance) * 1e8) / 1e8;
            } else if (consensusDirection === 'SHORT' && stopLoss - entryPrice > maxDistance) {
              stopLoss = Math.round((entryPrice + maxDistance) * 1e8) / 1e8;
            }
          }

          result.levelsAveragedFrom = levelsValid ? agreeing.length : 0;
          const payload: Omit<IRegisteredSignal, '_id' | 'createdAt'> = {
            symbol,
            label: result.label,
            interval: SIGNAL_TIMEFRAME,
            consensusDirection,
            isQualified,
            buySignalsCount,
            sellSignalsCount,
            totalSignalsChecked,
            matchedSignalsCount,
            currentPrice: analysis.currentLivePrice,
            entryPrice,
            stopLoss,
            takeProfit1,
            takeProfit2,
            levelsAveragedFrom: levelsValid ? agreeing.length : 0,
            riskRewardRatio: analysis.method6Summary.trade.riskRewardFormatted || '—',
            averageScore: Math.round(avgScore * 10) / 10,
            signalsBreakdown: breakdown,
            chatGptStatus: verdict.status,
            chatGptDirection: verdict.direction,
            chatGptSetupName: verdict.setupName,
            chatGptReasoning: verdict.reasoning,
            aiEngineUsed: verdict.engineUsed,
            aiVoteCounted: aiIsReal && aiVote !== 'NO TRADE',
            singleMethodDirection: singleVote,
            cycleNumber,
          };

          // The signal is only persisted when a real trade was created for it.
          // Storing every evaluated symbol (qualified or not) was the main
          // source of database growth (thousands of rows per day).
          const createdAtMs = Date.now();
          const createdAtIso = new Date(createdAtMs).toISOString();
          const tempSignal: IRegisteredSignal = {
            ...payload,
            _id: dbRepo.newSignalId(),
            createdAt: createdAtIso,
            createdAtIran: formatReportTime(createdAtMs) || undefined,
          };

          let sentToDemo = false;
          let sentToWeex = false;
          let tradeStatus = '';
          let tradeNote = '';

          if (isQualified) {
            // ---- DIRECT LINK: hand the qualified signal to the trade engine ----
            try {
              const { tradeEngine } = await import('./tradeEngine.js');
              const ingest = await tradeEngine.ingestSignal(tempSignal);
              sentToDemo = ingest.created > 0;
              tradeStatus = ingest.code;
              tradeNote = ingest.note;
            } catch (linkErr: any) {
              tradeStatus = 'ERROR';
              tradeNote = linkErr?.message || 'ارسال سیگنال به موتور ترید ناموفق بود.';
              console.warn('[signals] trade hand-off failed:', tradeNote);
            }

            // ---- WEEX auto-trade hand-off (paper or live, per user settings) ----
            try {
              const { weexEngine } = await import('./weexEngine.js');
              const weexResult = await weexEngine.ingestSignal(tempSignal);
              sentToWeex = weexResult.created > 0;
              // Keep the WEEX note even when it failed: it is the only place the
              // rejection reason (pullback filter, 400 from the exchange, ...)
              // becomes visible in the signals table.
              if (weexResult.note) {
                tradeNote = `${tradeNote ? `${tradeNote} | ` : ''}WEEX: ${weexResult.note}`;
              }
            } catch (weexErr: any) {
              console.warn('[signals] WEEX hand-off failed:', weexErr?.message || weexErr);
            }
          }

          const dispatchedNow = isQualified && (sentToDemo || sentToWeex);
          result.dispatchedToTrade = dispatchedNow;
          result.tradeStatus = tradeStatus || (sentToWeex ? 'WEEX_CREATED' : '');
          result.tradeNote = tradeNote || (isQualified ? 'سفارشی ساخته نشد؛ سیگنال ذخیره نمی‌شود.' : '');

          if (dispatchedNow) {
            result.recorded = true;
            result.tradeNote = tradeNote;
            await dbRepo.addRegisteredSignal({
              ...payload,
              _id: tempSignal._id,
              createdAt: createdAtIso,
              dispatchedToTrade: true,
              tradeStatus: result.tradeStatus || 'CREATED',
              tradeDispatchNote: result.tradeNote || '',
              tradeDispatchedAt: createdAtIso,
            });
            registered += 1;
            dispatched += 1;
          } else {
            result.recorded = false;
          }

          evaluated += 1;
          this.state.lastCycleResults.push(result);
        } catch (err: any) {
          result.error = err?.message || 'خطای غیرمنتظره در تحلیل نماد';
          this.state.lastCycleResults.push(result);
        }

        // No per-symbol wait here: every AI call already happened in PHASE 2.
      }

      const durationMs = Date.now() - startedAt;

      // Persistent evaluation counter: "checked coins" is the number of
      // analyses performed, not the number of rows stored in the DB.
      if (evaluated > 0) {
        try {
          this.state.totalEvaluated = await dbRepo.incrementCounter(
            'signalEvaluations',
            evaluated
          );
        } catch {
          this.state.totalEvaluated += evaluated;
        }
      }

      this.state.registeredLastCycle = registered;
      this.state.dispatchedLastCycle = dispatched;
      this.state.evaluatedLastCycle = evaluated;
      this.state.lastDurationMs = durationMs;
      const finishedMs = Date.now();
      this.state.lastFinishedAt = new Date(finishedMs).toISOString();
      this.state.lastFinishedAtIran = formatReportTime(finishedMs);
      this.state.currentSymbol = null;
      this.state.currentIndex = 0;
      this.state.isRunning = false;

      console.log(
        `[signals] cycle #${cycleNumber} (${trigger}) finished in ${Math.round(
          durationMs / 1000
        )}s — evaluated ${evaluated}, registered ${registered}, sent to trade ${dispatched}`
      );

      return { ok: true, cycleNumber, evaluated, registered, dispatched, durationMs };
    } catch (err: any) {
      this.state.isRunning = false;
      this.state.lastError = err?.message || 'خطای غیرمنتظره در چرخه سیگنال';
      const failedMs = Date.now();
      this.state.lastFinishedAt = new Date(failedMs).toISOString();
      this.state.lastFinishedAtIran = formatReportTime(failedMs);
      this.state.currentSymbol = null;
      return { ok: false, error: this.state.lastError || 'خطای غیرمنتظره در چرخه سیگنال' };
    }
  }
}

export const signalEngine = new SignalEngine();
