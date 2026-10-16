/**
 * Single-method Al Brooks signal (the baseline behind /api/avalai/albrooks-signal).
 * ---------------------------------------------------------------------------
 * This is the ORIGINAL one-signal Al Brooks model: it reads the EMA 20 and the
 * last 20 candles, decides an "Always In" side, then places the order off the
 * signal bar. It is deliberately extracted here so that the chart endpoint and
 * the signals engine share ONE implementation and can never drift apart.
 *
 * The signals engine uses it as an independent voter (see signalEngine.ts).
 */

export interface SingleMethodCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SingleMethodSignal {
  direction: 'LONG' | 'SHORT';
  candlesAnalyzed: number;
  alwaysInState: string;
  marketCycle: string;
  setupName: string;
  signalCandleIndex: number;
  signalCandleTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  ema20Current: number;
  swingHigh20: number;
  swingLow20: number;
  avgRange: number;
  closesAboveEma: number;
}

/**
 * Computes the single-method Al Brooks signal.
 * Returns null when there is not enough data to analyse.
 */
export function computeSingleMethodSignal(
  candles: SingleMethodCandle[]
): SingleMethodSignal | null {
  if (!Array.isArray(candles) || candles.length < 10) return null;

  const analyzedCandles = candles.slice(-candles.length);
  const n = analyzedCandles.length;

  // 1. EMA 20 (Al Brooks core indicator)
  const k = 2 / (20 + 1);
  const ema20List: number[] = [];
  let currentEma = analyzedCandles[0].close;
  for (let i = 0; i < n; i++) {
    currentEma =
      i === 0 ? analyzedCandles[0].close : analyzedCandles[i].close * k + currentEma * (1 - k);
    ema20List.push(currentEma);
  }

  // 2. Baseline price-action read
  const lastCandle = analyzedCandles[n - 1];
  const prevCandle = analyzedCandles[n - 2];
  const emaNow = ema20List[n - 1];
  const ema10Ago = ema20List[Math.max(0, n - 11)];

  const recent20 = analyzedCandles.slice(-20);
  const swingHigh20 = Math.max(...recent20.map((c) => c.high));
  const swingLow20 = Math.min(...recent20.map((c) => c.low));
  const avgRange =
    recent20.reduce((acc, c) => acc + Math.max(c.high - c.low, 0.000001), 0) / recent20.length;

  const closesAboveEma = recent20.filter((c, idx) => c.close >= ema20List[n - 20 + idx]).length;

  const isAlwaysInLong =
    lastCandle.close >= emaNow || (closesAboveEma >= 11 && emaNow >= ema10Ago);
  const direction: 'LONG' | 'SHORT' = isAlwaysInLong ? 'LONG' : 'SHORT';

  // 3. Locate the best recent signal bar in the last 6 candles
  let signalCandleIndex = n - 2;
  if (direction === 'LONG') {
    for (let i = n - 2; i >= Math.max(1, n - 6); i--) {
      const c = analyzedCandles[i];
      const bodyBull = c.close >= c.open;
      const lowerWick = Math.min(c.open, c.close) - c.low;
      if (bodyBull || lowerWick > (c.high - c.low) * 0.35) {
        signalCandleIndex = i;
        break;
      }
    }
  } else {
    for (let i = n - 2; i >= Math.max(1, n - 6); i--) {
      const c = analyzedCandles[i];
      const bodyBear = c.close <= c.open;
      const upperWick = c.high - Math.max(c.open, c.close);
      if (bodyBear || upperWick > (c.high - c.low) * 0.35) {
        signalCandleIndex = i;
        break;
      }
    }
  }

  const sigBar = analyzedCandles[signalCandleIndex] || prevCandle;
  const tickBuffer = avgRange * 0.08;

  let entryPrice = lastCandle.close;
  let stopLoss = lastCandle.low;
  let takeProfit1 = lastCandle.high;
  let takeProfit2 = lastCandle.high;

  if (direction === 'LONG') {
    entryPrice = Math.max(sigBar.high + tickBuffer, lastCandle.close);
    stopLoss = Math.min(sigBar.low - tickBuffer * 2, entryPrice - avgRange * 1.35);
    const risk = Math.max(entryPrice - stopLoss, avgRange * 0.5);
    takeProfit1 = entryPrice + risk * 1.5;
    takeProfit2 = entryPrice + risk * 2.5;
  } else {
    entryPrice = Math.min(sigBar.low - tickBuffer, lastCandle.close);
    stopLoss = Math.max(sigBar.high + tickBuffer * 2, entryPrice + avgRange * 1.35);
    const risk = Math.max(stopLoss - entryPrice, avgRange * 0.5);
    takeProfit1 = Math.max(0.00001, entryPrice - risk * 1.5);
    takeProfit2 = Math.max(0.00001, entryPrice - risk * 2.5);
  }

  const trendStrengthRatio =
    Math.abs(analyzedCandles[n - 1].close - analyzedCandles[0].open) / (avgRange * 15);
  const marketCycle =
    trendStrengthRatio > 0.85
      ? direction === 'LONG'
        ? 'اسپایک و کانال صعودی (Bull Spike & Channel)'
        : 'اسپایک و کانال نزولی (Bear Spike & Channel)'
      : closesAboveEma >= 14 || closesAboveEma <= 6
        ? direction === 'LONG'
          ? 'کانال صعودی (Tight Bull Channel)'
          : 'کانال نزولی (Tight Bear Channel)'
        : 'تریدینگ رنج با تمایل روند (Trading Range / Two-Sided Market)';

  const setupName =
    direction === 'LONG'
      ? 'پولبک دوپایه به میانگین EMA 20 (High 2 Bull Flag / Always In Long)'
      : 'پولبک دوپایه به میانگین EMA 20 (Low 2 Bear Flag / Always In Short)';

  return {
    direction,
    candlesAnalyzed: n,
    alwaysInState:
      direction === 'LONG'
        ? 'Always In Long (برتری خریداران بالای EMA 20)'
        : 'Always In Short (برتری فروشندگان زیر EMA 20)',
    marketCycle,
    setupName,
    signalCandleIndex,
    signalCandleTime: sigBar.time,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    ema20Current: emaNow,
    swingHigh20,
    swingLow20,
    avgRange,
    closesAboveEma,
  };
}
