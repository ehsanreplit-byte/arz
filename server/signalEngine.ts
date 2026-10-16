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

import { dbRepo, IRegisteredSignal, ISignalMethodItem } from './models.js';
import {
  analyzeAllFiveAlBrooksMethods,
  OhlcvCandle,
  FiveMethodsCompleteAnalysis,
} from '../src/utils/alBrooksMethods.js';

// ---------------------------------------------------------------------------
// Configuration (env-overridable so tests / manual runs can be faster)
// ---------------------------------------------------------------------------
const CYCLE_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.SIGNAL_CYCLE_INTERVAL_MS || 30 * 60 * 1000)
);
const REQUEST_GAP_MS = Math.max(
  0,
  Number(process.env.SIGNAL_REQUEST_GAP_MS || 30 * 1000)
);
const SIGNAL_TIMEFRAME = (process.env.SIGNAL_TIMEFRAME || '15m').trim();
const HTF_TIMEFRAME = (process.env.SIGNAL_HTF_TIMEFRAME || '1h').trim();
const MIN_CONSENSUS = Math.max(1, Number(process.env.SIGNAL_MIN_CONSENSUS || 3));
const AI_ENABLED = process.env.SIGNAL_AI_ENABLED !== 'false';
const AI_TIMEOUT_MS = Number(process.env.SIGNAL_AI_TIMEOUT_MS || 25_000);
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
  cycleIntervalMs: number;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  currentSymbol: string | null;
  currentIndex: number;
  totalSymbols: number;
  registeredLastCycle: number;
  dispatchedLastCycle: number;
  evaluatedLastCycle: number;
  lastCycleResults: SignalCycleSymbolResult[];
}

interface ChatGptVerdict {
  status: string;
  direction: 'LONG' | 'SHORT' | 'NO TRADE';
  setupName: string;
  reasoning: string;
  engineUsed: string;
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
    cycleIntervalMs: CYCLE_INTERVAL_MS,
    lastRunAt: null,
    lastFinishedAt: null,
    nextRunAt: null,
    lastDurationMs: null,
    lastError: null,
    currentSymbol: null,
    currentIndex: 0,
    totalSymbols: 0,
    registeredLastCycle: 0,
    dispatchedLastCycle: 0,
    evaluatedLastCycle: 0,
    lastCycleResults: [],
  };

  public getState(): SignalEngineState {
    return { ...this.state, lastCycleResults: [...this.state.lastCycleResults] };
  }

  public initialize(): void {
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

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.runCycle('schedule');
    }, CYCLE_INTERVAL_MS);
    this.state.nextRunAt = new Date(Date.now() + CYCLE_INTERVAL_MS).toISOString();
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
    this.state.lastCycleResults = [];

    const cycleNumber = this.state.cycleNumber;

    try {
      const symbols = await dbRepo.getSymbols();
      this.state.totalSymbols = symbols.length;
      this.state.currentIndex = 0;

      let registered = 0;
      let evaluated = 0;
      let dispatched = 0;

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
          const [candles, htfCandles] = await Promise.all([
            fetchKlines(symbol, SIGNAL_TIMEFRAME, 401),
            fetchKlines(symbol, HTF_TIMEFRAME, 401),
          ]);

          if (candles.length < 30) {
            result.error = 'داده کندل کافی از بایننس دریافت نشد.';
            result.chatGptStatus = 'لغو شد (بدون داده)';
            this.state.lastCycleResults.push(result);
            if (i < symbols.length - 1) await waitForRequestGap(requestStartedAt);
            continue;
          }

          const analysis = analyzeAllFiveAlBrooksMethods({
            symbol,
            interval: SIGNAL_TIMEFRAME,
            rawCandles: candles,
            htfCandles,
            higherTimeframeInterval: HTF_TIMEFRAME,
          });

          const breakdown = buildSignalsBreakdown(analysis);

          // ---- who gets to vote ----
          // Method 6 is a SUMMARY of the other five, so counting it would double
          // count the same opinion. It is shown in the UI but never votes.
          const votingMethods = breakdown.filter((s) => s.id !== 'summary');
          const methodBuy = votingMethods.filter((s) => s.direction === 'LONG').length;
          const methodSell = votingMethods.filter((s) => s.direction === 'SHORT').length;

          // --- Request to ChatGPT for this symbol (30s gap between send times) ---
          const verdict = await askChatGptVerdict({
            symbol,
            label: result.label,
            analysis,
            breakdown: votingMethods,
            buySignalsCount: methodBuy,
            sellSignalsCount: methodSell,
          });

          // The AI opinion is a real, independent sixth vote — but ONLY when it
          // is an actual ChatGPT answer. When the endpoint is unreachable the
          // verdict falls back to the local consensus, and counting that would
          // be double counting all over again.
          const aiIsReal = verdict.engineUsed.startsWith('ChatGPT');
          const aiVote: 'LONG' | 'SHORT' | 'NO TRADE' =
            aiIsReal && verdict.direction !== 'NO TRADE' ? verdict.direction : 'NO TRADE';

          const votes: Array<'LONG' | 'SHORT' | 'NO TRADE'> = [
            ...votingMethods.map((s) => s.direction),
            aiVote,
          ];
          const buySignalsCount = votes.filter((d) => d === 'LONG').length;
          const sellSignalsCount = votes.filter((d) => d === 'SHORT').length;
          const totalSignalsChecked = votes.length;
          const matchedSignalsCount = Math.max(buySignalsCount, sellSignalsCount);
          const isQualified = matchedSignalsCount >= MIN_CONSENSUS;
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

          // Record EVERY evaluated watchlist symbol (qualified or not) so the
          // table shows the live price and signal status of all added coins.
          const matching = breakdown.filter((s) => s.direction === consensusDirection);
          const primary =
            matching.find((s) => s.id === 'summary') || matching[0] || breakdown[0];
          const avgScore =
            breakdown.reduce((acc, s) => acc + (Number(s.score) || 0), 0) /
            Math.max(1, breakdown.length);

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
            entryPrice: Number(primary?.entryPrice) || analysis.currentLivePrice,
            stopLoss: Number(primary?.stopLoss) || 0,
            takeProfit1: Number(primary?.takeProfit1) || 0,
            takeProfit2: Number(primary?.takeProfit2) || 0,
            riskRewardRatio: analysis.method6Summary.trade.riskRewardFormatted || '—',
            averageScore: Math.round(avgScore * 10) / 10,
            signalsBreakdown: breakdown,
            chatGptStatus: verdict.status,
            chatGptDirection: verdict.direction,
            chatGptSetupName: verdict.setupName,
            chatGptReasoning: verdict.reasoning,
            aiEngineUsed: verdict.engineUsed,
            aiVoteCounted: aiIsReal && aiVote !== 'NO TRADE',
            cycleNumber,
          };

          const savedSignal = await dbRepo.addRegisteredSignal(payload);
          result.recorded = true;

          if (isQualified) {
            registered += 1;

            // ---- DIRECT LINK: hand the qualified signal to the trade engine ----
            try {
              const { tradeEngine } = await import('./tradeEngine.js');
              const ingest = await tradeEngine.ingestSignal(savedSignal);
              // "sent to trade" must mean an order really exists — a rejected
              // breakout is NOT a hand-off.
              result.dispatchedToTrade = ingest.created > 0;
              result.tradeStatus = ingest.code;
              result.tradeNote = ingest.note;
              if (ingest.created > 0) dispatched += 1;
            } catch (linkErr: any) {
              result.dispatchedToTrade = false;
              result.tradeNote = linkErr?.message || 'ارسال سیگنال به موتور ترید ناموفق بود.';
              console.warn('[signals] trade hand-off failed:', result.tradeNote);
            }

            // remember the hand-off outcome on the stored signal so the
            // signals table can show it
            try {
              await dbRepo.markSignalDispatched(
                savedSignal._id,
                Boolean(result.dispatchedToTrade),
                result.tradeNote || '',
                result.tradeStatus || ''
              );
            } catch {
              // non fatal
            }
          }

          evaluated += 1;
          this.state.lastCycleResults.push(result);
        } catch (err: any) {
          result.error = err?.message || 'خطای غیرمنتظره در تحلیل نماد';
          this.state.lastCycleResults.push(result);
        }

        // Keep consecutive ChatGPT requests REQUEST_GAP_MS (default 30s) apart.
        if (i < symbols.length - 1) {
          await waitForRequestGap(requestStartedAt);
        }
      }

      const durationMs = Date.now() - startedAt;
      this.state.registeredLastCycle = registered;
      this.state.dispatchedLastCycle = dispatched;
      this.state.evaluatedLastCycle = evaluated;
      this.state.lastDurationMs = durationMs;
      this.state.lastFinishedAt = new Date().toISOString();
      this.state.currentSymbol = null;
      this.state.currentIndex = 0;
      this.state.isRunning = false;

      if (this.state.isSchedulerEnabled) {
        this.scheduleNext();
      }

      console.log(
        `[signals] cycle #${cycleNumber} (${trigger}) finished in ${Math.round(
          durationMs / 1000
        )}s — evaluated ${evaluated}, registered ${registered}, sent to trade ${dispatched}`
      );

      return { ok: true, cycleNumber, evaluated, registered, dispatched, durationMs };
    } catch (err: any) {
      this.state.isRunning = false;
      this.state.lastError = err?.message || 'خطای غیرمنتظره در چرخه سیگنال';
      this.state.lastFinishedAt = new Date().toISOString();
      this.state.currentSymbol = null;
      if (this.state.isSchedulerEnabled) {
        this.scheduleNext();
      }
      return { ok: false, error: this.state.lastError || 'خطای غیرمنتظره در چرخه سیگنال' };
    }
  }
}

export const signalEngine = new SignalEngine();
