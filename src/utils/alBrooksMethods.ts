/**
 * Al Brooks 5 Price Action Trading Methods + Best Setup & Market Summary Engine
 * -----------------------------------------------------------------------------
 * Independent, testable, deterministic algorithms with zero look-ahead bias:
 *   1. Trend Trading (معامله در جهت روند)
 *   2. Trading Ranges (معامله در رنج)
 *   3. Reversals (برگشت روند)
 *   4. Breakouts (معامله روی شکست)
 *   5. Pullbacks — High 1 / High 2 / Low 1 / Low 2 (معامله روی پولبک)
 *   6. Best Setup & Market Summary (جمع‌بندی و انتخاب بهترین ستاپ)
 *
 * Strictly uses closed candles only (excludes current forming candle when evaluating signals).
 * Pivots are confirmed only after `rightStrength` closed candles have passed.
 */

export interface OhlcvCandle {
  time: number; // ms timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlBrooksConfigParams {
  pivotLeftBars: number;
  pivotRightBars: number; // Required closed candles after pivot to confirm (prevents future leak)
  minRiskReward: number; // Default 2.0 (1:2)
  feeRatePct: number; // e.g., 0.1% Binance Spot fee per side
  slippagePct: number; // e.g., 0.05% estimated execution slippage
  doubleTopBottomToleranceAtr: number; // e.g., 0.35 ATR tolerance for DT/DB
  rangeLookbackBars: number; // e.g., 80 closed bars
  scoreWeights: {
    marketStructure: number; // default 20
    signalBarStrength: number; // default 20
    srPosition: number; // default 15
    htfAlignment: number; // default 15
    riskReward: number; // default 15
    entryConfirmation: number; // default 15
  };
}

export const DEFAULT_AL_BROOKS_CONFIG: AlBrooksConfigParams = {
  pivotLeftBars: 3,
  pivotRightBars: 3,
  minRiskReward: 2.0,
  feeRatePct: 0.1,
  slippagePct: 0.05,
  doubleTopBottomToleranceAtr: 0.4,
  rangeLookbackBars: 90,
  scoreWeights: {
    marketStructure: 20,
    signalBarStrength: 20,
    srPosition: 15,
    htfAlignment: 15,
    riskReward: 15,
    entryConfirmation: 15,
  },
};

export interface ConfirmedPivot {
  index: number; // Candle index in closedCandles array
  confirmedAtIndex: number; // index + pivotRightBars (when pivot became known without look-ahead)
  time: number;
  confirmedAtTime: number;
  price: number;
  type: 'HIGH' | 'LOW';
  structureLabel?: 'HH' | 'HL' | 'LH' | 'LL' | 'EQH' | 'EQL';
}

export interface ScoreBreakdown {
  total: number; // 0 to 100
  marketStructure: number;
  signalBarStrength: number;
  srPosition: number;
  htfAlignment: number;
  riskReward: number;
  entryConfirmation: number;
  weights: AlBrooksConfigParams['scoreWeights'];
  explanation: string;
}

export interface TradeCalculationDetails {
  direction: 'LONG' | 'SHORT' | 'NO TRADE';
  entryType: 'STOP_ORDER_BREAKOUT' | 'CLOSE_CONFIRMED' | 'NONE';
  entryPriceMode: 'STOP_TRIGGER_PENDING' | 'MARKET_CURRENT_TRIGGERED' | 'HYPOTHETICAL_BACKTEST';
  entryPriceModeLabel: string;
  signalBarIndex: number;
  signalBarTime: number;
  confirmationBarIndex: number | null;
  confirmationBarTime: number | null;
  rawSignalTriggerPrice: number;
  currentMarketPrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  rawRisk: number;
  rawRewardTp2: number;
  estimatedFeeAndSlippageCost: number;
  netRiskRewardTp1: number;
  netRiskRewardTp2: number;
  netRiskRewardTp3: number;
  riskRewardFormatted: string;
  invalidationPrice: number;
  invalidationCondition: string;
  entryConfirmationCondition: string;
  isValidRiskReward: boolean;
  rejectionReason?: string;
}

export interface ChartMarkerPoint {
  id: string;
  methodId: 'trend' | 'range' | 'reversal' | 'breakout' | 'pullback' | 'summary';
  methodTitle: string;
  candleIndex: number;
  time: number;
  price: number;
  label: string;
  category:
    | 'PIVOT_STRUCTURE'
    | 'H1_H2_L1_L2'
    | 'BREAKOUT'
    | 'FAILED_BREAKOUT'
    | 'ENTRY_LONG'
    | 'ENTRY_SHORT'
    | 'REVERSAL_PATTERN';
  color: string;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  details: string;
}

export interface Method1TrendOutput {
  methodId: 'trend';
  methodNumber: 1;
  titleFa: string;
  titleEn: string;
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendDirectionFa: string;
  trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICTED';
  trendStrengthFa: string;
  signalStatus: 'CONFIRMED' | 'PENDING_BREAKOUT' | 'NO_TRADE';
  signalStatusFa: string;
  lastConfirmedHigh: { price: number; time: number; index: number; label: string } | null;
  lastConfirmedLow: { price: number; time: number; index: number; label: string } | null;
  trendCandleStats: {
    avgBodyToRangeRatio: number;
    consecutiveSameDirCount: number;
    closeNearExtremeRatio: number;
  };
  counterTrendPullbackStatus: string;
  structureBreakDetected: boolean;
  trade: TradeCalculationDetails;
  score: ScoreBreakdown;
  confirmOrRejectReasons: string[];
}

export interface Method2RangeOutput {
  methodId: 'range';
  methodNumber: 2;
  titleFa: string;
  titleEn: string;
  isTradingRange: boolean;
  rangeTop: number;
  rangeBottom: number;
  rangeMidline: number;
  rangeHeightPct: number;
  validTopReactions: number;
  validBottomReactions: number;
  overlapRatio: number;
  currentPriceZone: 'NEAR_BOTTOM' | 'NEAR_TOP' | 'MIDDLE_NO_TRADE' | 'OUTSIDE_BREAKOUT';
  currentPriceZoneFa: string;
  pricePositionPct: number; // 0% = bottom, 50% = midline, 100% = top
  signalStatus: 'CONFIRMED' | 'PENDING_BREAKOUT' | 'NO_TRADE';
  signalStatusFa: string;
  breakoutWarning: boolean;
  trade: TradeCalculationDetails;
  score: ScoreBreakdown;
  confirmOrRejectReasons: string[];
}

export interface Method3ReversalOutput {
  methodId: 'reversal';
  methodNumber: 3;
  titleFa: string;
  titleEn: string;
  priorTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  priorTrendFa: string;
  reversalPatternType:
    | 'DOUBLE_TOP'
    | 'DOUBLE_BOTTOM'
    | 'CLIMAX_EXHAUSTION_REVERSAL'
    | 'FAILED_BREAKOUT_REVERSAL'
    | 'MTR_HIGHER_LOW'
    | 'MTR_LOWER_HIGH'
    | 'NONE';
  reversalPatternFa: string;
  signalStatus: 'CONFIRMED_REVERSAL' | 'PROBABLE_REVERSAL_ONLY' | 'NO_TRADE';
  signalStatusFa: string;
  weaknessSigns: string[];
  confirmationSigns: string[];
  trendlineBrokenOnlyWarning: boolean;
  trade: TradeCalculationDetails;
  score: ScoreBreakdown;
  confirmOrRejectReasons: string[];
}

export interface Method4BreakoutOutput {
  methodId: 'breakout';
  methodNumber: 4;
  titleFa: string;
  titleEn: string;
  breakoutLevel: number;
  breakoutLevelType: 'RESISTANCE' | 'SUPPORT' | 'RANGE_HIGH' | 'RANGE_LOW' | 'PIVOT';
  breakoutLevelTypeFa: string;
  breakoutDirection: 'BULLISH' | 'BEARISH' | 'NONE';
  breakoutDirectionFa: string;
  isClosedBeyondLevel: boolean;
  closeDistancePct: number;
  closeDistanceAtr: number;
  breakoutCandleStrength: {
    bodyToRangeRatio: number;
    rangeToAtrRatio: number;
    closePositionRatio: number;
    strengthLabel: string;
  };
  pullbackToBreakoutLevel: boolean;
  failedBreakoutProbability: 'LOW' | 'MODERATE' | 'HIGH';
  failedBreakoutProbabilityFa: string;
  isFailedBreakout: boolean;
  signalStatus: 'CONFIRMED_BREAKOUT' | 'BREAKOUT_PULLBACK_CONFIRMED' | 'FAILED_BREAKOUT' | 'NO_TRADE';
  signalStatusFa: string;
  trade: TradeCalculationDetails;
  score: ScoreBreakdown;
  confirmOrRejectReasons: string[];
}

export interface Method5PullbackOutput {
  methodId: 'pullback';
  methodNumber: 5;
  titleFa: string;
  titleEn: string;
  mainTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  mainTrendFa: string;
  pullbackZone: {
    startPrice: number;
    endPrice: number;
    startIndex: number;
    endIndex: number;
    startTime: number;
    endTime: number;
    retracementPct: number;
  } | null;
  isPullbackTurningIntoReversal: boolean;
  detectedPattern: 'HIGH_1' | 'HIGH_2' | 'LOW_1' | 'LOW_2' | 'NONE';
  detectedPatternFa: string;
  attemptsCount: number;
  h1h2l1l2Markers: Array<{
    tag: 'H1' | 'H2' | 'L1' | 'L2';
    candleIndex: number;
    time: number;
    price: number;
    description: string;
  }>;
  signalBarSummary: string;
  signalStatus: 'CONFIRMED' | 'PENDING_TRIGGER' | 'NO_TRADE';
  signalStatusFa: string;
  trade: TradeCalculationDetails;
  score: ScoreBreakdown;
  confirmOrRejectReasons: string[];
}

export interface Method6BestSetupSummary {
  methodId: 'summary';
  methodNumber: 6;
  titleFa: string;
  titleEn: string;
  recommendedDirection: 'LONG' | 'SHORT' | 'NO TRADE';
  selectedMethodId: 'trend' | 'range' | 'reversal' | 'breakout' | 'pullback' | 'none';
  selectedMethodTitleFa: string;
  htfTrendAlignment: string;
  supportingMethods: string[];
  conflictingMethods: string[];
  duplicateSignalsFilteredCount: number;
  selectionReasons: string[];
  trade: TradeCalculationDetails;
  score: ScoreBreakdown;
}

export interface ChartAnnotationsBundle {
  supportLevels: Array<{ price: number; label: string; startIndex: number; endIndex: number }>;
  resistanceLevels: Array<{ price: number; label: string; startIndex: number; endIndex: number }>;
  rangeBox: {
    isActive: boolean;
    top: number;
    bottom: number;
    midline: number;
    startIndex: number;
    endIndex: number;
  } | null;
  pullbackZones: Array<{
    startIndex: number;
    endIndex: number;
    startTime: number;
    endTime: number;
    highPrice: number;
    lowPrice: number;
    label: string;
  }>;
  pivots: ConfirmedPivot[];
  markers: ChartMarkerPoint[];
}

export interface FiveMethodsCompleteAnalysis {
  symbol: string;
  interval: string;
  higherTimeframeInterval?: string;
  analyzedAtIso: string;
  closedCandlesCount: number;
  formingCandleExcluded: boolean;
  lastClosedCandleTime: number;
  lastClosedCandlePrice: number;
  currentLivePrice: number;
  atr14: number;
  ema20: number;
  config: AlBrooksConfigParams;
  method1Trend: Method1TrendOutput;
  method2Range: Method2RangeOutput;
  method3Reversal: Method3ReversalOutput;
  method4Breakout: Method4BreakoutOutput;
  method5Pullback: Method5PullbackOutput;
  method6Summary: Method6BestSetupSummary;
  annotations: ChartAnnotationsBundle;
}

// ============================================================================
// Core Mathematical & Technical Helpers (Zero Look-Ahead)
// ============================================================================

export function computeAtr(candles: OhlcvCandle[], period = 14): number {
  if (candles.length === 0) return 0;
  if (candles.length === 1) return Math.max(candles[0].high - candles[0].low, candles[0].close * 0.002);
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return Math.max(sum / Math.max(1, slice.length), candles[candles.length - 1].close * 0.001);
}

export function computeEmaSeries(candles: OhlcvCandle[], period = 20): number[] {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = candles[0].close;
  for (let i = 0; i < candles.length; i++) {
    ema = i === 0 ? candles[0].close : candles[i].close * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export function evaluateCandleMetrics(candle: OhlcvCandle, atr: number) {
  const range = Math.max(candle.high - candle.low, 1e-8);
  const body = Math.abs(candle.close - candle.open);
  const bodyToRange = body / range;
  const isBull = candle.close > candle.open;
  const isBear = candle.close < candle.open;
  // Where did the candle close within its own range? (1.0 = high, 0.0 = low)
  const closePositionInRange = (candle.close - candle.low) / range;
  const upperTailRatio = (candle.high - Math.max(candle.open, candle.close)) / range;
  const lowerTailRatio = (Math.min(candle.open, candle.close) - candle.low) / range;
  const rangeToAtr = atr > 0 ? range / atr : 1;

  const isStrongBullTrendBar =
    isBull && bodyToRange >= 0.55 && closePositionInRange >= 0.68 && rangeToAtr >= 0.6;
  const isStrongBearTrendBar =
    isBear && bodyToRange >= 0.55 && closePositionInRange <= 0.32 && rangeToAtr >= 0.6;

  const isBullReversalBar =
    closePositionInRange >= 0.62 && (lowerTailRatio >= 0.3 || (isBull && bodyToRange >= 0.5));
  const isBearReversalBar =
    closePositionInRange <= 0.38 && (upperTailRatio >= 0.3 || (isBear && bodyToRange >= 0.5));

  return {
    range,
    body,
    bodyToRange,
    isBull,
    isBear,
    closePositionInRange,
    upperTailRatio,
    lowerTailRatio,
    rangeToAtr,
    isStrongBullTrendBar,
    isStrongBearTrendBar,
    isBullReversalBar,
    isBearReversalBar,
  };
}

/**
 * Step 1: Confirmed Pivot / Fractal Detection WITHOUT Future Leak
 * A pivot at index `i` is ONLY confirmed if `i + rightBars <= closedCandles.length - 1`.
 */
export function detectConfirmedPivots(
  closedCandles: OhlcvCandle[],
  leftBars = 3,
  rightBars = 3,
  atr = 0
): ConfirmedPivot[] {
  const pivots: ConfirmedPivot[] = [];
  const maxPivotIdx = closedCandles.length - 1 - rightBars;
  if (maxPivotIdx < leftBars) return pivots;

  for (let i = leftBars; i <= maxPivotIdx; i++) {
    const current = closedCandles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (closedCandles[j].high > current.high) isHigh = false;
      if (closedCandles[j].low < current.low) isLow = false;
    }

    const confirmedAtIdx = i + rightBars;
    const confirmedCandle = closedCandles[confirmedAtIdx];

    if (isHigh) {
      pivots.push({
        index: i,
        confirmedAtIndex: confirmedAtIdx,
        time: current.time,
        confirmedAtTime: confirmedCandle.time,
        price: current.high,
        type: 'HIGH',
      });
    }
    if (isLow) {
      pivots.push({
        index: i,
        confirmedAtIndex: confirmedAtIdx,
        time: current.time,
        confirmedAtTime: confirmedCandle.time,
        price: current.low,
        type: 'LOW',
      });
    }
  }

  // Assign structure labels (HH, LH, EQH / HL, LL, EQL)
  const eqTol = atr * 0.15;
  let prevHigh: number | null = null;
  let prevLow: number | null = null;

  for (const p of pivots) {
    if (p.type === 'HIGH') {
      if (prevHigh === null) {
        p.structureLabel = 'HH';
      } else if (Math.abs(p.price - prevHigh) <= eqTol) {
        p.structureLabel = 'EQH';
      } else if (p.price > prevHigh) {
        p.structureLabel = 'HH';
      } else {
        p.structureLabel = 'LH';
      }
      prevHigh = p.price;
    } else {
      if (prevLow === null) {
        p.structureLabel = 'HL';
      } else if (Math.abs(p.price - prevLow) <= eqTol) {
        p.structureLabel = 'EQL';
      } else if (p.price > prevLow) {
        p.structureLabel = 'HL';
      } else {
        p.structureLabel = 'LL';
      }
      prevLow = p.price;
    }
  }

  return pivots;
}

/**
 * Section 4: Unified Entry, Stop Loss, Take Profit, Fee/Slippage & R/R Calculator
 */
export function calculateTradeScenario(params: {
  direction: 'LONG' | 'SHORT' | 'NO TRADE';
  entryType: 'STOP_ORDER_BREAKOUT' | 'CLOSE_CONFIRMED' | 'NONE';
  signalBar: OhlcvCandle;
  signalBarIndex: number;
  confirmationBar: OhlcvCandle | null;
  confirmationBarIndex: number | null;
  currentLivePrice: number;
  structuralStopLoss: number;
  structuralTargets: [number, number, number];
  invalidationPrice: number;
  invalidationCondition: string;
  entryConfirmationCondition: string;
  atr: number;
  config: AlBrooksConfigParams;
}): TradeCalculationDetails {
  const {
    direction,
    entryType,
    signalBar,
    signalBarIndex,
    confirmationBar,
    confirmationBarIndex,
    currentLivePrice,
    structuralStopLoss,
    structuralTargets,
    invalidationPrice,
    invalidationCondition,
    entryConfirmationCondition,
    atr,
    config,
  } = params;

  const emptyTrade = (reason: string): TradeCalculationDetails => ({
    direction: 'NO TRADE',
    entryType: 'NONE',
    entryPriceMode: 'STOP_TRIGGER_PENDING',
    entryPriceModeLabel: 'بدون ورود (NO TRADE)',
    signalBarIndex,
    signalBarTime: signalBar.time,
    confirmationBarIndex,
    confirmationBarTime: confirmationBar ? confirmationBar.time : null,
    rawSignalTriggerPrice: signalBar.close,
    currentMarketPrice: currentLivePrice,
    entryPrice: 0,
    stopLoss: 0,
    takeProfit1: 0,
    takeProfit2: 0,
    takeProfit3: 0,
    rawRisk: 0,
    rawRewardTp2: 0,
    estimatedFeeAndSlippageCost: 0,
    netRiskRewardTp1: 0,
    netRiskRewardTp2: 0,
    netRiskRewardTp3: 0,
    riskRewardFormatted: '0.00',
    invalidationPrice,
    invalidationCondition,
    entryConfirmationCondition,
    isValidRiskReward: false,
    rejectionReason: reason,
  });

  if (direction === 'NO TRADE') {
    return emptyTrade('ستاپ معاملاتی معتبری در این روش فعال نیست.');
  }

  const tickBuffer = Math.max(atr * 0.05, signalBar.close * 0.0004);
  let rawTriggerPrice = signalBar.close;
  let entryPrice = signalBar.close;
  let entryPriceMode: TradeCalculationDetails['entryPriceMode'] = 'STOP_TRIGGER_PENDING';
  let entryPriceModeLabel = '';

  if (entryType === 'STOP_ORDER_BREAKOUT') {
    // Al Brooks Stop Entry: 1 tick above signal bar high (LONG) or 1 tick below signal bar low (SHORT)
    rawTriggerPrice =
      direction === 'LONG' ? signalBar.high + tickBuffer : signalBar.low - tickBuffer;
    entryPrice = rawTriggerPrice;

    if (confirmationBar) {
      entryPriceMode = 'HYPOTHETICAL_BACKTEST';
      entryPriceModeLabel = 'ورود پس از شکست کندل سیگنال (فعال‌شده در کندل تأیید بسته)';
    } else {
      const alreadyCrossed =
        direction === 'LONG'
          ? currentLivePrice >= rawTriggerPrice
          : currentLivePrice <= rawTriggerPrice;
      if (alreadyCrossed) {
        entryPriceMode = 'MARKET_CURRENT_TRIGGERED';
        entryPriceModeLabel = 'سطح شکست کندل سیگنال در قیمت فعلی بازار لمس شده است';
      } else {
        entryPriceMode = 'STOP_TRIGGER_PENDING';
        entryPriceModeLabel =
          direction === 'LONG'
            ? 'سفارش Stop مشروط به شکست سقف کندل سیگنال (هنوز فعال نشده)'
            : 'سفارش Stop مشروط به شکست کف کندل سیگنال (هنوز فعال نشده)';
      }
    }
  } else {
    // Entry on confirmed breakout close
    rawTriggerPrice = confirmationBar ? confirmationBar.close : signalBar.close;
    entryPrice = rawTriggerPrice;
    entryPriceMode = 'MARKET_CURRENT_TRIGGERED';
    entryPriceModeLabel = 'ورود بر اساس قیمت بسته‌شدن کندل تأیید شکست';
  }

  const stopLoss = structuralStopLoss;
  const [tp1, tp2, tp3] = structuralTargets;

  // Risk & Reward exact formulas from specification:
  // LONG: Risk = Entry - Stop Loss, Reward = Take Profit - Entry
  // SHORT: Risk = Stop Loss - Entry, Reward = Entry - Take Profit
  const rawRisk = direction === 'LONG' ? entryPrice - stopLoss : stopLoss - entryPrice;
  const rawRewardTp1 = direction === 'LONG' ? tp1 - entryPrice : entryPrice - tp1;
  const rawRewardTp2 = direction === 'LONG' ? tp2 - entryPrice : entryPrice - tp2;
  const rawRewardTp3 = direction === 'LONG' ? tp3 - entryPrice : entryPrice - tp3;

  if (rawRisk <= 0 || isNaN(rawRisk)) {
    return emptyTrade('ریسک محاسبه‌شده صفر یا منفی است (حد ضرر نامعتبر نسبت به نقطه ورود).');
  }

  if (rawRewardTp2 <= 0) {
    return emptyTrade('هدف سود ساختاری (Take Profit) قابل دفاع نیست یا منفی است.');
  }

  // Round-trip fee + slippage estimate in price units
  const totalFrictionPct = (config.feeRatePct * 2 + config.slippagePct) / 100;
  const frictionCost = entryPrice * totalFrictionPct;

  const effectiveRisk = rawRisk + frictionCost;
  const netRewardTp1 = Math.max(0, rawRewardTp1 - frictionCost);
  const netRewardTp2 = Math.max(0, rawRewardTp2 - frictionCost);
  const netRewardTp3 = Math.max(0, rawRewardTp3 - frictionCost);

  const rrTp1 = Number((netRewardTp1 / effectiveRisk).toFixed(2));
  const rrTp2 = Number((netRewardTp2 / effectiveRisk).toFixed(2));
  const rrTp3 = Number((netRewardTp3 / effectiveRisk).toFixed(2));
  const grossRrTp2 = Number((rawRewardTp2 / rawRisk).toFixed(2));

  const isValidRiskReward = grossRrTp2 >= config.minRiskReward;

  return {
    direction,
    entryType,
    entryPriceMode,
    entryPriceModeLabel,
    signalBarIndex,
    signalBarTime: signalBar.time,
    confirmationBarIndex,
    confirmationBarTime: confirmationBar ? confirmationBar.time : null,
    rawSignalTriggerPrice: Number(rawTriggerPrice.toFixed(6)),
    currentMarketPrice: Number(currentLivePrice.toFixed(6)),
    entryPrice: Number(entryPrice.toFixed(6)),
    stopLoss: Number(stopLoss.toFixed(6)),
    takeProfit1: Number(tp1.toFixed(6)),
    takeProfit2: Number(tp2.toFixed(6)),
    takeProfit3: Number(tp3.toFixed(6)),
    rawRisk: Number(rawRisk.toFixed(6)),
    rawRewardTp2: Number(rawRewardTp2.toFixed(6)),
    estimatedFeeAndSlippageCost: Number(frictionCost.toFixed(6)),
    netRiskRewardTp1: rrTp1,
    netRiskRewardTp2: rrTp2,
    netRiskRewardTp3: rrTp3,
    riskRewardFormatted: `1 : ${grossRrTp2.toFixed(2)} (خالص با کارمزد: 1:${rrTp2.toFixed(2)})`,
    invalidationPrice: Number(invalidationPrice.toFixed(6)),
    invalidationCondition,
    entryConfirmationCondition,
    isValidRiskReward,
    rejectionReason: isValidRiskReward
      ? undefined
      : `نسبت ریسک به بازده (${grossRrTp2.toFixed(2)}) کمتر از حداقل مجاز (1:${config.minRiskReward}) است.`,
  };
}

/**
 * Section 6: Explainable 0-100 Setup Scoring
 */
export function computeExplainableScore(
  rawScores: {
    marketStructure: number; // 0..1
    signalBarStrength: number; // 0..1
    srPosition: number; // 0..1
    htfAlignment: number; // 0..1
    riskReward: number; // 0..1
    entryConfirmation: number; // 0..1
  },
  config: AlBrooksConfigParams
): ScoreBreakdown {
  const w = config.scoreWeights;
  const totalWeight =
    w.marketStructure +
    w.signalBarStrength +
    w.srPosition +
    w.htfAlignment +
    w.riskReward +
    w.entryConfirmation || 100;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const ms = Math.round(clamp01(rawScores.marketStructure) * w.marketStructure);
  const sb = Math.round(clamp01(rawScores.signalBarStrength) * w.signalBarStrength);
  const sr = Math.round(clamp01(rawScores.srPosition) * w.srPosition);
  const htf = Math.round(clamp01(rawScores.htfAlignment) * w.htfAlignment);
  const rr = Math.round(clamp01(rawScores.riskReward) * w.riskReward);
  const ec = Math.round(clamp01(rawScores.entryConfirmation) * w.entryConfirmation);

  const rawSum = ms + sb + sr + htf + rr + ec;
  const total = Math.round((rawSum / totalWeight) * 100);

  return {
    total: Math.max(0, Math.min(100, total)),
    marketStructure: ms,
    signalBarStrength: sb,
    srPosition: sr,
    htfAlignment: htf,
    riskReward: rr,
    entryConfirmation: ec,
    weights: w,
    explanation: `امتیاز فنی کیفیت ستاپ (${total}/100) — این عدد شاخص وزن‌دار ساختار و تایید پرایس اکشن است و به معنای احتمال قطعی سودآوری نیست.`,
  };
}

// ============================================================================
// METHOD 1: Trend Trading — معامله در جهت روند
// ============================================================================
export function runMethod1TrendTrading(
  closedCandles: OhlcvCandle[],
  pivots: ConfirmedPivot[],
  ema20Series: number[],
  atr: number,
  currentLivePrice: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  config: AlBrooksConfigParams
): Method1TrendOutput {
  const n = closedCandles.length;
  const lastCandle = closedCandles[n - 1];
  const highPivots = pivots.filter((p) => p.type === 'HIGH');
  const lowPivots = pivots.filter((p) => p.type === 'LOW');

  const lastTwoHighs = highPivots.slice(-2);
  const lastTwoLows = lowPivots.slice(-2);

  const hasHH =
    lastTwoHighs.length === 2 && lastTwoHighs[1].price > lastTwoHighs[0].price + atr * 0.1;
  const hasHL =
    lastTwoLows.length === 2 && lastTwoLows[1].price > lastTwoLows[0].price + atr * 0.1;
  const hasLH =
    lastTwoHighs.length === 2 && lastTwoHighs[1].price < lastTwoHighs[0].price - atr * 0.1;
  const hasLL =
    lastTwoLows.length === 2 && lastTwoLows[1].price < lastTwoLows[0].price - atr * 0.1;

  // Evaluate recent 20 closed candles for trend candle strength
  const recent20 = closedCandles.slice(-20);
  let bullBars = 0;
  let bearBars = 0;
  let bodyRatioSum = 0;
  let closeExtremeCount = 0;
  let maxConsecutiveBull = 0;
  let maxConsecutiveBear = 0;
  let curBullRun = 0;
  let curBearRun = 0;

  for (const c of recent20) {
    const m = evaluateCandleMetrics(c, atr);
    bodyRatioSum += m.bodyToRange;
    if (m.isBull) {
      bullBars++;
      curBullRun++;
      curBearRun = 0;
      if (m.closePositionInRange >= 0.65) closeExtremeCount++;
      if (curBullRun > maxConsecutiveBull) maxConsecutiveBull = curBullRun;
    } else if (m.isBear) {
      bearBars++;
      curBearRun++;
      curBullRun = 0;
      if (m.closePositionInRange <= 0.35) closeExtremeCount++;
      if (curBearRun > maxConsecutiveBear) maxConsecutiveBear = curBearRun;
    }
  }

  const avgBodyToRangeRatio = Number((bodyRatioSum / Math.max(1, recent20.length)).toFixed(2));
  const closeNearExtremeRatio = Number(
    (closeExtremeCount / Math.max(1, recent20.length)).toFixed(2)
  );

  const lastHigh = highPivots.length > 0 ? highPivots[highPivots.length - 1] : null;
  const lastLow = lowPivots.length > 0 ? lowPivots[lowPivots.length - 1] : null;
  const emaNow = ema20Series[n - 1] || lastCandle.close;
  const emaPrev10 = ema20Series[Math.max(0, n - 11)] || emaNow;
  const emaSlopeUp = emaNow > emaPrev10 * 1.001;
  const emaSlopeDown = emaNow < emaPrev10 * 0.999;

  // Check structure break (BOS / ChoCH)
  let structureBreakDetected = false;
  let trendDirection: Method1TrendOutput['trendDirection'] = 'NEUTRAL';
  let trendStrength: Method1TrendOutput['trendStrength'] = 'CONFLICTED';

  if (hasHH && hasHL && lastCandle.close >= emaNow * 0.996 && emaSlopeUp) {
    trendDirection = 'BULLISH';
    if (lastLow && lastCandle.close < lastLow.price) {
      structureBreakDetected = true;
      trendDirection = 'NEUTRAL';
    } else {
      trendStrength =
        maxConsecutiveBull >= 3 && avgBodyToRangeRatio >= 0.5 ? 'STRONG' : 'MODERATE';
    }
  } else if (hasLH && hasLL && lastCandle.close <= emaNow * 1.004 && emaSlopeDown) {
    trendDirection = 'BEARISH';
    if (lastHigh && lastCandle.close > lastHigh.price) {
      structureBreakDetected = true;
      trendDirection = 'NEUTRAL';
    } else {
      trendStrength =
        maxConsecutiveBear >= 3 && avgBodyToRangeRatio >= 0.5 ? 'STRONG' : 'MODERATE';
    }
  } else {
    trendDirection = 'NEUTRAL';
    trendStrength = 'CONFLICTED';
  }

  const reasons: string[] = [];
  if (trendDirection === 'BULLISH') {
    reasons.push(
      `ساختار صعودی تاییدشده با سقف بالاتر (HH: $${lastHigh?.price.toFixed(2)}) و کف بالاتر (HL: $${lastLow?.price.toFixed(2)}).`
    );
    reasons.push(
      `میانگین نسبت بدنه به دامنه کندل‌ها ${(avgBodyToRangeRatio * 100).toFixed(0)}% و حداکثر ${maxConsecutiveBull} کندل صعودی متوالی.`
    );
  } else if (trendDirection === 'BEARISH') {
    reasons.push(
      `ساختار نزولی تاییدشده با سقف پایین‌تر (LH: $${lastHigh?.price.toFixed(2)}) و کف پایین‌تر (LL: $${lastLow?.price.toFixed(2)}).`
    );
    reasons.push(
      `میانگین نسبت بدنه به دامنه کندل‌ها ${(avgBodyToRangeRatio * 100).toFixed(0)}% و حداکثر ${maxConsecutiveBear} کندل نزولی متوالی.`
    );
  } else {
    reasons.push(
      'شواهد ساختاری سقف‌ها و کف‌ها متناقض است (عدم تطابق کامل HH/HL یا LH/LL)؛ طبق قوانین آل بروکس وضعیت روند خنثی اعلام می‌شود.'
    );
  }

  // Find a valid multi-candle trend continuation signal bar (never a single random green/red bar)
  let signalIdx = n - 1;
  let confIdx: number | null = null;
  let hasValidSetup = false;

  if (trendDirection === 'BULLISH' && lastLow && lastHigh) {
    // Check last 3 closed candles for pullback near EMA20 / HL followed by strong bull signal bar
    for (let idx = n - 2; idx >= Math.max(5, n - 4); idx--) {
      const c = closedCandles[idx];
      const m = evaluateCandleMetrics(c, atr);
      const nearDynamicSupport = c.low <= ema20Series[idx] + atr * 0.8 && c.low > lastLow.price;
      if (nearDynamicSupport && (m.isStrongBullTrendBar || m.isBullReversalBar)) {
        signalIdx = idx;
        hasValidSetup = true;
        if (idx + 1 < n && closedCandles[idx + 1].high > c.high) {
          confIdx = idx + 1;
        }
        break;
      }
    }
    if (!hasValidSetup) {
      const mLast = evaluateCandleMetrics(lastCandle, atr);
      if (mLast.isStrongBullTrendBar && lastCandle.low > lastLow.price) {
        signalIdx = n - 1;
        hasValidSetup = true;
      } else {
        reasons.push(
          'روند صعودی است اما در کندل‌های بسته اخیر، کندل سیگنال هم‌جهت با استاندارد بدنه آل بروکس نزدیک ناحیه اصلاحی شکل نگرفته است.'
        );
      }
    }
  } else if (trendDirection === 'BEARISH' && lastLow && lastHigh) {
    for (let idx = n - 2; idx >= Math.max(5, n - 4); idx--) {
      const c = closedCandles[idx];
      const m = evaluateCandleMetrics(c, atr);
      const nearDynamicRes = c.high >= ema20Series[idx] - atr * 0.8 && c.high < lastHigh.price;
      if (nearDynamicRes && (m.isStrongBearTrendBar || m.isBearReversalBar)) {
        signalIdx = idx;
        hasValidSetup = true;
        if (idx + 1 < n && closedCandles[idx + 1].low < c.low) {
          confIdx = idx + 1;
        }
        break;
      }
    }
    if (!hasValidSetup) {
      const mLast = evaluateCandleMetrics(lastCandle, atr);
      if (mLast.isStrongBearTrendBar && lastCandle.high < lastHigh.price) {
        signalIdx = n - 1;
        hasValidSetup = true;
      } else {
        reasons.push(
          'روند نزولی است اما در کندل‌های بسته اخیر، کندل سیگنال نزولی معتبر نزدیک مقاومت داینامیک شکل نگرفته است.'
        );
      }
    }
  }

  const sigCandle = closedCandles[signalIdx];
  const confCandle = confIdx !== null ? closedCandles[confIdx] : null;
  const sigMetrics = evaluateCandleMetrics(sigCandle, atr);

  let tradeDirection: 'LONG' | 'SHORT' | 'NO TRADE' =
    !hasValidSetup || trendDirection === 'NEUTRAL'
      ? 'NO TRADE'
      : trendDirection === 'BULLISH'
      ? 'LONG'
      : 'SHORT';

  const stopBuffer = atr * 0.25;
  const structuralStop =
    tradeDirection === 'LONG'
      ? Math.min(sigCandle.low - stopBuffer, (lastLow?.price ?? sigCandle.low) - stopBuffer)
      : Math.max(sigCandle.high + stopBuffer, (lastHigh?.price ?? sigCandle.high) + stopBuffer);

  const legSize =
    lastHigh && lastLow ? Math.abs(lastHigh.price - lastLow.price) : atr * 4;

  const targets: [number, number, number] =
    tradeDirection === 'LONG'
      ? [
          Math.max(lastHigh?.price ?? sigCandle.high + atr * 2, sigCandle.high + atr * 1.8),
          sigCandle.high + Math.max(legSize * 0.85, atr * 3.2),
          sigCandle.high + Math.max(legSize * 1.35, atr * 4.8),
        ]
      : [
          Math.min(lastLow?.price ?? sigCandle.low - atr * 2, sigCandle.low - atr * 1.8),
          sigCandle.low - Math.max(legSize * 0.85, atr * 3.2),
          sigCandle.low - Math.max(legSize * 1.35, atr * 4.8),
        ];

  const trade = calculateTradeScenario({
    direction: tradeDirection,
    entryType: 'STOP_ORDER_BREAKOUT',
    signalBar: sigCandle,
    signalBarIndex: signalIdx,
    confirmationBar: confCandle,
    confirmationBarIndex: confIdx,
    currentLivePrice,
    structuralStopLoss: structuralStop,
    structuralTargets: targets,
    invalidationPrice:
      tradeDirection === 'LONG'
        ? lastLow?.price ?? structuralStop
        : lastHigh?.price ?? structuralStop,
    invalidationCondition:
      tradeDirection === 'LONG'
        ? `بسته‌شدن کندل زیر آخرین کف معتبر ساختاری (HL: $${(lastLow?.price ?? structuralStop).toFixed(2)})`
        : tradeDirection === 'SHORT'
        ? `بسته‌شدن کندل بالای آخرین سقف معتبر ساختاری (LH: $${(lastHigh?.price ?? structuralStop).toFixed(2)})`
        : 'بدون ستاپ فعال',
    entryConfirmationCondition:
      tradeDirection === 'LONG'
        ? `عبور قیمت از سقف کندل سیگنال ($${sigCandle.high.toFixed(2)}) پس از اصلاح به ساختار صعودی`
        : tradeDirection === 'SHORT'
        ? `عبور قیمت از کف کندل سیگنال ($${sigCandle.low.toFixed(2)}) پس از اصلاح به ساختار نزولی`
        : 'نیازمند تشکیل ساختار HH/HL یا LH/LL معتبر',
    atr,
    config,
  });

  if (!trade.isValidRiskReward && tradeDirection !== 'NO TRADE') {
    reasons.push(trade.rejectionReason || 'رد ستاپ به علت نسبت ریسک به بازده نامناسب.');
    trade.direction = 'NO TRADE';
  }

  const htfAligned =
    (trendDirection === 'BULLISH' && htfTrend === 'BULLISH') ||
    (trendDirection === 'BEARISH' && htfTrend === 'BEARISH');

  const score = computeExplainableScore(
    {
      marketStructure:
        trendDirection === 'NEUTRAL' ? 0.25 : trendStrength === 'STRONG' ? 0.92 : 0.72,
      signalBarStrength: trade.direction === 'NO TRADE' ? 0.2 : sigMetrics.bodyToRange,
      srPosition: trade.direction === 'NO TRADE' ? 0.3 : 0.78,
      htfAlignment: htfAligned ? 1.0 : htfTrend === 'NEUTRAL' ? 0.55 : 0.2,
      riskReward: trade.isValidRiskReward ? Math.min(1, trade.netRiskRewardTp2 / 3) : 0.15,
      entryConfirmation: confCandle ? 0.95 : trade.direction !== 'NO TRADE' ? 0.65 : 0.1,
    },
    config
  );

  const signalStatus: Method1TrendOutput['signalStatus'] =
    trade.direction === 'NO TRADE'
      ? 'NO_TRADE'
      : confCandle
      ? 'CONFIRMED'
      : 'PENDING_BREAKOUT';

  return {
    methodId: 'trend',
    methodNumber: 1,
    titleFa: 'روش ۱: Trend Trading (معامله در جهت روند)',
    titleEn: 'Trend Trading',
    trendDirection,
    trendDirectionFa:
      trendDirection === 'BULLISH'
        ? 'روند صعودی (Always In Long)'
        : trendDirection === 'BEARISH'
        ? 'روند نزولی (Always In Short)'
        : 'خنثی / بدون روند مشخص (Neutral)',
    trendStrength,
    trendStrengthFa:
      trendStrength === 'STRONG'
        ? 'قوی (Strong Trend)'
        : trendStrength === 'MODERATE'
        ? 'متوسط (Moderate Channel)'
        : 'متناقض / نامشخص',
    signalStatus,
    signalStatusFa:
      signalStatus === 'CONFIRMED'
        ? 'تأییدشده (ورود فعال)'
        : signalStatus === 'PENDING_BREAKOUT'
        ? 'در انتظار شکست سقف/کف کندل سیگنال'
        : 'NO TRADE (بدون ستاپ معتبر)',
    lastConfirmedHigh: lastHigh
      ? {
          price: lastHigh.price,
          time: lastHigh.time,
          index: lastHigh.index,
          label: lastHigh.structureLabel || 'H',
        }
      : null,
    lastConfirmedLow: lastLow
      ? {
          price: lastLow.price,
          time: lastLow.time,
          index: lastLow.index,
          label: lastLow.structureLabel || 'L',
        }
      : null,
    trendCandleStats: {
      avgBodyToRangeRatio,
      consecutiveSameDirCount: Math.max(maxConsecutiveBull, maxConsecutiveBear),
      closeNearExtremeRatio,
    },
    counterTrendPullbackStatus: structureBreakDetected
      ? 'شکست ساختار (BOS) رخ داده و روند قبلی بی‌اعتبار شده است.'
      : trendDirection !== 'NEUTRAL'
      ? 'اصلاح‌ها منظم بوده و ساختار اصلی روند حفظ شده است.'
      : 'همپوشانی بالای کندل‌ها و نبود دنباله روند.',
    structureBreakDetected,
    trade,
    score,
    confirmOrRejectReasons: reasons,
  };
}

// ============================================================================
// METHOD 2: Trading Ranges — معامله در رنج
// ============================================================================
export function runMethod2TradingRanges(
  closedCandles: OhlcvCandle[],
  pivots: ConfirmedPivot[],
  atr: number,
  currentLivePrice: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  config: AlBrooksConfigParams
): Method2RangeOutput {
  const n = closedCandles.length;
  const lookback = Math.min(config.rangeLookbackBars, n);
  const startIdx = n - lookback;
  const windowCandles = closedCandles.slice(startIdx);
  const lastCandle = closedCandles[n - 1];

  // Calculate 88th percentile of highs and 12th percentile of lows in window for robust range boundaries
  const sortedHighs = [...windowCandles.map((c) => c.high)].sort((a, b) => a - b);
  const sortedLows = [...windowCandles.map((c) => c.low)].sort((a, b) => a - b);

  const rangeTop = sortedHighs[Math.floor(sortedHighs.length * 0.88)] || lastCandle.high;
  const rangeBottom = sortedLows[Math.floor(sortedLows.length * 0.12)] || lastCandle.low;
  const rangeMidline = (rangeTop + rangeBottom) / 2;
  const rangeHeight = Math.max(rangeTop - rangeBottom, atr);
  const rangeHeightPct = Number(((rangeHeight / rangeBottom) * 100).toFixed(2));

  // Count distinct confirmed reactions near rangeTop and rangeBottom
  const reactionTolerance = Math.max(atr * 0.65, rangeHeight * 0.14);
  let validTopReactions = 0;
  let validBottomReactions = 0;
  let lastTopReactionIdx = -10;
  let lastBottomReactionIdx = -10;

  for (let i = startIdx; i < n - 1; i++) {
    const c = closedCandles[i];
    if (Math.abs(c.high - rangeTop) <= reactionTolerance && i - lastTopReactionIdx >= 4) {
      if (closedCandles[i + 1].close < c.high) {
        validTopReactions++;
        lastTopReactionIdx = i;
      }
    }
    if (Math.abs(c.low - rangeBottom) <= reactionTolerance && i - lastBottomReactionIdx >= 4) {
      if (closedCandles[i + 1].close > c.low) {
        validBottomReactions++;
        lastBottomReactionIdx = i;
      }
    }
  }

  // Calculate bar-to-bar overlap ratio (high overlap = trading range behavior)
  let overlapCount = 0;
  for (let i = startIdx + 1; i < n; i++) {
    const cur = closedCandles[i];
    const prev = closedCandles[i - 1];
    const overlap = Math.min(cur.high, prev.high) - Math.max(cur.low, prev.low);
    if (overlap > 0) overlapCount++;
  }
  const overlapRatio = Number((overlapCount / Math.max(1, windowCandles.length - 1)).toFixed(2));

  // Check if price just broke out with a strong candle
  const lastMetrics = evaluateCandleMetrics(lastCandle, atr);
  const brokeAboveTop =
    lastCandle.close > rangeTop + atr * 0.25 && lastMetrics.isStrongBullTrendBar;
  const brokeBelowBottom =
    lastCandle.close < rangeBottom - atr * 0.25 && lastMetrics.isStrongBearTrendBar;
  const breakoutWarning = brokeAboveTop || brokeBelowBottom;

  const isTradingRange =
    validTopReactions >= 2 &&
    validBottomReactions >= 2 &&
    overlapRatio >= 0.55 &&
    !breakoutWarning;

  const rawPosPct = ((lastCandle.close - rangeBottom) / rangeHeight) * 100;
  const pricePositionPct = Number(Math.max(-25, Math.min(125, rawPosPct)).toFixed(1));

  let currentPriceZone: Method2RangeOutput['currentPriceZone'] = 'MIDDLE_NO_TRADE';
  if (breakoutWarning || lastCandle.close > rangeTop + reactionTolerance || lastCandle.close < rangeBottom - reactionTolerance) {
    currentPriceZone = 'OUTSIDE_BREAKOUT';
  } else if (rawPosPct <= 26) {
    currentPriceZone = 'NEAR_BOTTOM';
  } else if (rawPosPct >= 74) {
    currentPriceZone = 'NEAR_TOP';
  } else {
    currentPriceZone = 'MIDDLE_NO_TRADE';
  }

  const reasons: string[] = [];
  reasons.push(
    `سقف رنج: $${rangeTop.toFixed(2)} (${validTopReactions} واکنش معتبر) | کف رنج: $${rangeBottom.toFixed(2)} (${validBottomReactions} واکنش معتبر) | خط میانی: $${rangeMidline.toFixed(2)}.`
  );
  reasons.push(`میزان همپوشانی کندل‌ها در بازه بررسی‌شده: ${(overlapRatio * 100).toFixed(0)}%.`);

  let tradeDirection: 'LONG' | 'SHORT' | 'NO TRADE' = 'NO TRADE';
  let signalIdx = n - 1;
  let confIdx: number | null = null;

  if (breakoutWarning) {
    reasons.push(
      'هشدار شکست رنج: قیمت با کندل قدرتمند خارج از محدوده بسته شده است؛ طبق قانون ۷ روش دوم، بازار دیگر رنج فرض نمی‌شود (NO TRADE در استراتژی رنج).'
    );
  } else if (!isTradingRange) {
    reasons.push(
      'تعداد واکنش‌های رفت‌وبرگشتی به سقف و کف کمتر از حد نصاب رنج معتبر است.'
    );
  } else if (currentPriceZone === 'MIDDLE_NO_TRADE') {
    reasons.push(
      `قیمت فعلی در میانه رنج (${pricePositionPct}% ارتفاع رنج) نزدیک خط میانی قرار دارد؛ به دلیل نسبت ریسک به بازده نامناسب در وسط رنج، NO TRADE صادر می‌شود.`
    );
  } else if (currentPriceZone === 'NEAR_BOTTOM') {
    // Look for valid bullish reversal bar in last 2 closed candles near support
    const prevCandle = closedCandles[n - 2];
    const prevMetrics = evaluateCandleMetrics(prevCandle, atr);
    if (lastMetrics.isBullReversalBar || lastMetrics.isStrongBullTrendBar) {
      tradeDirection = 'LONG';
      signalIdx = n - 1;
      reasons.push(
        'قیمت در یک‌چهارم پایینی رنج (نزدیک حمایت) قرار دارد و کندل برگشتی صعودی معتبر شکل گرفته است (Buy Low در رنج).'
      );
    } else if (
      prevMetrics.isBullReversalBar &&
      lastCandle.high > prevCandle.high &&
      lastCandle.close > prevCandle.open
    ) {
      tradeDirection = 'LONG';
      signalIdx = n - 2;
      confIdx = n - 1;
      reasons.push(
        'واکنش صعودی به کف رنج همراه با کندل سیگنال و شکست سقف آن در کندل بعدی تأیید شد.'
      );
    } else {
      reasons.push(
        'قیمت نزدیک کف رنج است اما هنوز کندل برگشتی صعودی معتبر بسته نشده است (در انتظار نشانه صعودی).'
      );
    }
  } else if (currentPriceZone === 'NEAR_TOP') {
    const prevCandle = closedCandles[n - 2];
    const prevMetrics = evaluateCandleMetrics(prevCandle, atr);
    if (lastMetrics.isBearReversalBar || lastMetrics.isStrongBearTrendBar) {
      tradeDirection = 'SHORT';
      signalIdx = n - 1;
      reasons.push(
        'قیمت در یک‌چهارم بالایی رنج (نزدیک مقاومت) قرار دارد و کندل برگشتی نزولی معتبر شکل گرفته است (Sell High در رنج).'
      );
    } else if (
      prevMetrics.isBearReversalBar &&
      lastCandle.low < prevCandle.low &&
      lastCandle.close < prevCandle.open
    ) {
      tradeDirection = 'SHORT';
      signalIdx = n - 2;
      confIdx = n - 1;
      reasons.push(
        'واکنش نزولی به سقف رنج همراه با کندل سیگنال و شکست کف آن در کندل بعدی تأیید شد.'
      );
    } else {
      reasons.push(
        'قیمت نزدیک سقف رنج است اما هنوز کندل برگشتی نزولی معتبر بسته نشده است (در انتظار نشانه نزولی).'
      );
    }
  }

  const sigCandle = closedCandles[signalIdx];
  const confCandle = confIdx !== null ? closedCandles[confIdx] : null;
  const sigMetrics = evaluateCandleMetrics(sigCandle, atr);

  const structuralStop =
    tradeDirection === 'LONG'
      ? Math.min(rangeBottom, sigCandle.low) - atr * 0.3
      : Math.max(rangeTop, sigCandle.high) + atr * 0.3;

  const targets: [number, number, number] =
    tradeDirection === 'LONG'
      ? [
          rangeMidline,
          rangeTop - rangeHeight * 0.08,
          rangeTop,
        ]
      : [
          rangeMidline,
          rangeBottom + rangeHeight * 0.08,
          rangeBottom,
        ];

  const trade = calculateTradeScenario({
    direction: tradeDirection,
    entryType: 'STOP_ORDER_BREAKOUT',
    signalBar: sigCandle,
    signalBarIndex: signalIdx,
    confirmationBar: confCandle,
    confirmationBarIndex: confIdx,
    currentLivePrice,
    structuralStopLoss: structuralStop,
    structuralTargets: targets,
    invalidationPrice: structuralStop,
    invalidationCondition:
      tradeDirection === 'LONG'
        ? `بسته‌شدن کندل قدرتمند پایین‌تر از کف رنج ($${rangeBottom.toFixed(2)})`
        : tradeDirection === 'SHORT'
        ? `بسته‌شدن کندل قدرتمند بالاتر از سقف رنج ($${rangeTop.toFixed(2)})`
        : 'خروج پرقدرت قیمت از سقف یا کف رنج',
    entryConfirmationCondition:
      tradeDirection === 'LONG'
        ? `شکست سقف کندل سیگنال صعودی ($${sigCandle.high.toFixed(2)}) در مجاورت کف رنج`
        : tradeDirection === 'SHORT'
        ? `شکست کف کندل سیگنال نزولی ($${sigCandle.low.toFixed(2)}) در مجاورت سقف رنج`
        : 'رسیدن قیمت به لبه‌های رنج و تشکیل کندل برگشتی معتبر با R/R حداقل 1:2',
    atr,
    config,
  });

  if (!trade.isValidRiskReward && trade.direction !== 'NO TRADE') {
    reasons.push(trade.rejectionReason || 'نسبت ریسک به بازده در داخل رنج کمتر از 1:2 است.');
    trade.direction = 'NO TRADE';
  }

  const score = computeExplainableScore(
    {
      marketStructure: isTradingRange ? 0.85 : 0.3,
      signalBarStrength: trade.direction !== 'NO TRADE' ? sigMetrics.bodyToRange + 0.2 : 0.2,
      srPosition:
        currentPriceZone === 'NEAR_BOTTOM' || currentPriceZone === 'NEAR_TOP' ? 0.9 : 0.15,
      htfAlignment: htfTrend === 'NEUTRAL' ? 0.9 : 0.6,
      riskReward: trade.isValidRiskReward ? Math.min(1, trade.netRiskRewardTp2 / 2.5) : 0.1,
      entryConfirmation: confCandle ? 0.92 : trade.direction !== 'NO TRADE' ? 0.65 : 0.1,
    },
    config
  );

  const signalStatus: Method2RangeOutput['signalStatus'] =
    trade.direction === 'NO TRADE'
      ? 'NO_TRADE'
      : confCandle
      ? 'CONFIRMED'
      : 'PENDING_BREAKOUT';

  return {
    methodId: 'range',
    methodNumber: 2,
    titleFa: 'روش ۲: Trading Ranges (معامله در رنج)',
    titleEn: 'Trading Ranges',
    isTradingRange,
    rangeTop: Number(rangeTop.toFixed(6)),
    rangeBottom: Number(rangeBottom.toFixed(6)),
    rangeMidline: Number(rangeMidline.toFixed(6)),
    rangeHeightPct,
    validTopReactions,
    validBottomReactions,
    overlapRatio,
    currentPriceZone,
    currentPriceZoneFa:
      currentPriceZone === 'NEAR_BOTTOM'
        ? 'نزدیک کف رنج (ناحیه بررسی خرید)'
        : currentPriceZone === 'NEAR_TOP'
        ? 'نزدیک سقف رنج (ناحیه بررسی فروش)'
        : currentPriceZone === 'OUTSIDE_BREAKOUT'
        ? 'خارج از محدوده رنج (احتمال شکست)'
        : 'وسط محدوده رنج — NO TRADE',
    pricePositionPct,
    signalStatus,
    signalStatusFa:
      signalStatus === 'CONFIRMED'
        ? 'تأییدشده در لبه رنج'
        : signalStatus === 'PENDING_BREAKOUT'
        ? 'ستاپ احتمالی لبه رنج (مشروط به شکست کندل سیگنال)'
        : 'NO TRADE (بدون معامله در وضعیت فعلی رنج)',
    breakoutWarning,
    trade,
    score,
    confirmOrRejectReasons: reasons,
  };
}

// ============================================================================
// METHOD 3: Reversals — برگشت روند (MTR, Double Top/Bottom)
// ============================================================================
export function runMethod3Reversals(
  closedCandles: OhlcvCandle[],
  pivots: ConfirmedPivot[],
  ema20Series: number[],
  atr: number,
  currentLivePrice: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  config: AlBrooksConfigParams
): Method3ReversalOutput {
  const n = closedCandles.length;
  const lastCandle = closedCandles[n - 1];

  // 1. Identify prior trend over bars [n-65 .. n-12]
  const priorStart = Math.max(0, n - 65);
  const priorEnd = Math.max(10, n - 12);
  const startPrice = closedCandles[priorStart].close;
  const peakWindow = closedCandles.slice(priorStart, priorEnd + 1);
  const maxInPrior = Math.max(...peakWindow.map((c) => c.high));
  const minInPrior = Math.min(...peakWindow.map((c) => c.low));

  let priorTrend: Method3ReversalOutput['priorTrend'] = 'NEUTRAL';
  if (maxInPrior - startPrice > atr * 3.2 && closedCandles[priorEnd].close > startPrice + atr * 1.8) {
    priorTrend = 'BULLISH';
  } else if (
    startPrice - minInPrior > atr * 3.2 &&
    closedCandles[priorEnd].close < startPrice - atr * 1.8
  ) {
    priorTrend = 'BEARISH';
  }

  const highPivots = pivots.filter((p) => p.type === 'HIGH');
  const lowPivots = pivots.filter((p) => p.type === 'LOW');
  const dtDbTol = atr * config.doubleTopBottomToleranceAtr;

  const weaknessSigns: string[] = [];
  const confirmationSigns: string[] = [];
  let reversalPatternType: Method3ReversalOutput['reversalPatternType'] = 'NONE';
  let reversalPatternFa = 'بدون الگوی برگشتی معتبر';
  let trendlineBrokenOnlyWarning = false;

  let candidateDirection: 'LONG' | 'SHORT' | 'NO TRADE' = 'NO TRADE';
  let signalIdx = n - 1;
  let confIdx: number | null = null;
  let patternExtremePrice = lastCandle.close;
  let hasFullConfirmation = false;

  if (priorTrend === 'BULLISH' && highPivots.length >= 2) {
    const hPrev = highPivots[highPivots.length - 2];
    const hLast = highPivots[highPivots.length - 1];
    const priceDiff = Math.abs(hLast.price - hPrev.price);

    // Check loss of momentum / reduced progression
    if (hLast.price <= hPrev.price + dtDbTol) {
      weaknessSigns.push(
        `کاهش پیشروی قیمت در سقف جدید ($${hLast.price.toFixed(2)}) نسبت به سقف قبلی ($${hPrev.price.toFixed(2)}).`
      );
    }

    const crossedBelowEma = lastCandle.close < ema20Series[n - 1];
    if (crossedBelowEma) {
      weaknessSigns.push('شکست خط روند صعودی و بسته‌شدن کندل زیر EMA 20.');
    }

    if (priceDiff <= dtDbTol) {
      reversalPatternType = 'DOUBLE_TOP';
      reversalPatternFa = 'سقف دوقلو (Double Top Major Trend Reversal)';
      patternExtremePrice = Math.max(hPrev.price, hLast.price);
    } else if (hLast.price < hPrev.price - dtDbTol) {
      reversalPatternType = 'MTR_LOWER_HIGH';
      reversalPatternFa = 'برگشت روند ماژور با سقف پایین‌تر (Lower High MTR)';
      patternExtremePrice = hLast.price;
    } else if (hLast.price > hPrev.price + dtDbTol && lastCandle.close < hPrev.price) {
      reversalPatternType = 'FAILED_BREAKOUT_REVERSAL';
      reversalPatternFa = 'شکست ناموفق سقف قبلی و بازگشت به داخل محدوده (Failed Breakout Top)';
      patternExtremePrice = hLast.price;
      weaknessSigns.push('شکست ناموفق بالای سقف قبلی و بازگشت سریع فروشندگان.');
    }

    if (reversalPatternType !== 'NONE') {
      // Evaluate reversal bar and opposing move strength
      const lastM = evaluateCandleMetrics(lastCandle, atr);
      const prevCandle = closedCandles[n - 2];
      const prevM = evaluateCandleMetrics(prevCandle, atr);

      if (lastM.isStrongBearTrendBar || (lastM.isBearReversalBar && crossedBelowEma)) {
        candidateDirection = 'SHORT';
        signalIdx = n - 1;
        confirmationSigns.push(
          `تشکیل کندل برگشتی نزولی معتبر با بسته‌شدن در ${(lastM.closePositionInRange * 100).toFixed(0)}% پایینی دامنه کندل.`
        );
        if (crossedBelowEma && reversalPatternType === 'MTR_LOWER_HIGH') {
          hasFullConfirmation = true;
          confirmationSigns.push('تغییر ساختار به سقف پایین‌تر (LH) پس از شکست خط روند.');
        }
      } else if (prevM.isBearReversalBar && lastCandle.low < prevCandle.low && lastM.isBear) {
        candidateDirection = 'SHORT';
        signalIdx = n - 2;
        confIdx = n - 1;
        hasFullConfirmation = true;
        confirmationSigns.push(
          'شکست کف کندل برگشتی نزولی توسط کندل تأیید بسته و تثبیت قدرت فروشندگان.'
        );
      } else if (crossedBelowEma) {
        trendlineBrokenOnlyWarning = true;
        weaknessSigns.push(
          'صرفاً خط روند/EMA شکسته شده اما هنوز کندل برگشتی قدرتمند و آزمون مجدد سقف کامل نشده است.'
        );
      }
    }
  } else if (priorTrend === 'BEARISH' && lowPivots.length >= 2) {
    const lPrev = lowPivots[lowPivots.length - 2];
    const lLast = lowPivots[lowPivots.length - 1];
    const priceDiff = Math.abs(lLast.price - lPrev.price);

    if (lLast.price >= lPrev.price - dtDbTol) {
      weaknessSigns.push(
        `کاهش قدرت فروشندگان و توقف پیشروی نزولی در کف ($${lLast.price.toFixed(2)}) نسبت به کف قبلی ($${lPrev.price.toFixed(2)}).`
      );
    }

    const crossedAboveEma = lastCandle.close > ema20Series[n - 1];
    if (crossedAboveEma) {
      weaknessSigns.push('شکست خط روند نزولی و بسته‌شدن کندل بالای EMA 20.');
    }

    if (priceDiff <= dtDbTol) {
      reversalPatternType = 'DOUBLE_BOTTOM';
      reversalPatternFa = 'کف دوقلو (Double Bottom Major Trend Reversal)';
      patternExtremePrice = Math.min(lPrev.price, lLast.price);
    } else if (lLast.price > lPrev.price + dtDbTol) {
      reversalPatternType = 'MTR_HIGHER_LOW';
      reversalPatternFa = 'برگشت روند ماژور با کف بالاتر (Higher Low MTR)';
      patternExtremePrice = lLast.price;
    } else if (lLast.price < lPrev.price - dtDbTol && lastCandle.close > lPrev.price) {
      reversalPatternType = 'FAILED_BREAKOUT_REVERSAL';
      reversalPatternFa = 'شکست ناموفق کف قبلی و بازگشت خریداران (Failed Breakout Bottom)';
      patternExtremePrice = lLast.price;
      weaknessSigns.push('شکست ناموفق زیر کف قبلی و جذب سفارش‌های فروش.');
    }

    if (reversalPatternType !== 'NONE') {
      const lastM = evaluateCandleMetrics(lastCandle, atr);
      const prevCandle = closedCandles[n - 2];
      const prevM = evaluateCandleMetrics(prevCandle, atr);

      if (lastM.isStrongBullTrendBar || (lastM.isBullReversalBar && crossedAboveEma)) {
        candidateDirection = 'LONG';
        signalIdx = n - 1;
        confirmationSigns.push(
          `تشکیل کندل برگشتی صعودی با بسته‌شدن در ${(lastM.closePositionInRange * 100).toFixed(0)}% بالایی دامنه.`
        );
        if (crossedAboveEma && reversalPatternType === 'MTR_HIGHER_LOW') {
          hasFullConfirmation = true;
          confirmationSigns.push('تغییر ساختار به کف بالاتر (HL) پس از شکست خط روند نزولی.');
        }
      } else if (prevM.isBullReversalBar && lastCandle.high > prevCandle.high && lastM.isBull) {
        candidateDirection = 'LONG';
        signalIdx = n - 2;
        confIdx = n - 1;
        hasFullConfirmation = true;
        confirmationSigns.push(
          'شکست سقف کندل برگشتی صعودی توسط کندل تأیید بسته و تثبیت قدرت خریداران.'
        );
      } else if (crossedAboveEma) {
        trendlineBrokenOnlyWarning = true;
        weaknessSigns.push(
          'صرفاً خط روند شکسته شده که طبق قانون ۵ آل بروکس به‌تنهایی برای تأیید برگشت کافی نیست.'
        );
      }
    }
  } else {
    weaknessSigns.push('روند قبلی واضحی برای تشکیل الگوی برگشت روند ماژور (MTR) وجود ندارد.');
  }

  // Rule 7: If confirmation is not sufficient, only show "PROBABLE_REVERSAL_ONLY" and do not issue a definitive trade signal
  const sigCandle = closedCandles[signalIdx];
  const confCandle = confIdx !== null ? closedCandles[confIdx] : null;
  const sigMetrics = evaluateCandleMetrics(sigCandle, atr);

  const structuralStop =
    candidateDirection === 'LONG'
      ? Math.min(patternExtremePrice, sigCandle.low) - atr * 0.3
      : Math.max(patternExtremePrice, sigCandle.high) + atr * 0.3;

  const priorSwingTarget =
    candidateDirection === 'LONG' ? maxInPrior : minInPrior;
  const moveSpan = Math.max(Math.abs(maxInPrior - minInPrior), atr * 4);

  const targets: [number, number, number] =
    candidateDirection === 'LONG'
      ? [
          sigCandle.high + moveSpan * 0.45,
          Math.max(priorSwingTarget, sigCandle.high + moveSpan * 0.75),
          sigCandle.high + moveSpan * 1.1,
        ]
      : [
          sigCandle.low - moveSpan * 0.45,
          Math.min(priorSwingTarget, sigCandle.low - moveSpan * 0.75),
          sigCandle.low - moveSpan * 1.1,
        ];

  const finalTradeDir: 'LONG' | 'SHORT' | 'NO TRADE' = hasFullConfirmation
    ? candidateDirection
    : 'NO TRADE';

  const trade = calculateTradeScenario({
    direction: finalTradeDir,
    entryType: 'STOP_ORDER_BREAKOUT',
    signalBar: sigCandle,
    signalBarIndex: signalIdx,
    confirmationBar: confCandle,
    confirmationBarIndex: confIdx,
    currentLivePrice,
    structuralStopLoss: structuralStop,
    structuralTargets: targets,
    invalidationPrice: structuralStop,
    invalidationCondition:
      candidateDirection === 'LONG'
        ? `عبور و بسته‌شدن قیمت پایین‌تر از کف الگوی برگشتی ($${structuralStop.toFixed(2)})`
        : candidateDirection === 'SHORT'
        ? `عبور و بسته‌شدن قیمت بالاتر از سقف الگوی برگشتی ($${structuralStop.toFixed(2)})`
        : 'عدم تغییر ساختار سقف و کف',
    entryConfirmationCondition:
      candidateDirection === 'LONG'
        ? `شکست سقف کندل برگشتی ($${sigCandle.high.toFixed(2)}) و تثبیت بالای EMA20`
        : candidateDirection === 'SHORT'
        ? `شکست کف کندل برگشتی ($${sigCandle.low.toFixed(2)}) و تثبیت زیر EMA20`
        : 'نیازمند تشکیل سقف/کف دوقلو و کندل تأیید برگشتی',
    atr,
    config,
  });

  if (!trade.isValidRiskReward && trade.direction !== 'NO TRADE') {
    trade.direction = 'NO TRADE';
    hasFullConfirmation = false;
  }

  let signalStatus: Method3ReversalOutput['signalStatus'] = 'NO_TRADE';
  if (trade.direction !== 'NO TRADE' && hasFullConfirmation) {
    signalStatus = 'CONFIRMED_REVERSAL';
  } else if (reversalPatternType !== 'NONE' || trendlineBrokenOnlyWarning) {
    signalStatus = 'PROBABLE_REVERSAL_ONLY';
  }

  const reasons = [
    ...weaknessSigns,
    ...confirmationSigns,
    ...(signalStatus === 'PROBABLE_REVERSAL_ONLY'
      ? ['طبق قانون ۷ روش برگشت روند: نشانه‌های اولیه ضعف روند دیده می‌شود اما تأیید کامل ورود هنوز صادر نشده است (فقط احتمال برگشت).']
      : []),
  ];

  const score = computeExplainableScore(
    {
      marketStructure: reversalPatternType !== 'NONE' ? 0.82 : 0.25,
      signalBarStrength: candidateDirection !== 'NO TRADE' ? sigMetrics.bodyToRange + 0.15 : 0.2,
      srPosition: reversalPatternType !== 'NONE' ? 0.8 : 0.3,
      htfAlignment:
        (candidateDirection === 'LONG' && htfTrend === 'BULLISH') ||
        (candidateDirection === 'SHORT' && htfTrend === 'BEARISH')
          ? 0.95
          : 0.5,
      riskReward: trade.isValidRiskReward ? Math.min(1, trade.netRiskRewardTp2 / 2.8) : 0.2,
      entryConfirmation:
        signalStatus === 'CONFIRMED_REVERSAL'
          ? 0.92
          : signalStatus === 'PROBABLE_REVERSAL_ONLY'
          ? 0.45
          : 0.1,
    },
    config
  );

  return {
    methodId: 'reversal',
    methodNumber: 3,
    titleFa: 'روش ۳: Reversals (برگشت روند)',
    titleEn: 'Reversals',
    priorTrend,
    priorTrendFa:
      priorTrend === 'BULLISH'
        ? 'روند قبلی صعودی'
        : priorTrend === 'BEARISH'
        ? 'روند قبلی نزولی'
        : 'بدون روند قبلی مشخص',
    reversalPatternType,
    reversalPatternFa,
    signalStatus,
    signalStatusFa:
      signalStatus === 'CONFIRMED_REVERSAL'
        ? 'برگشت روند تأییدشده (سیگنال فعال)'
        : signalStatus === 'PROBABLE_REVERSAL_ONLY'
        ? 'فقط احتمال برگشت (بدون سیگنال قطعی ورود)'
        : 'NO TRADE (بدون الگوی برگشتی)',
    weaknessSigns,
    confirmationSigns,
    trendlineBrokenOnlyWarning,
    trade,
    score,
    confirmOrRejectReasons: reasons,
  };
}

// ============================================================================
// METHOD 4: Breakouts — معامله روی شکست
// ============================================================================
export function runMethod4Breakouts(
  closedCandles: OhlcvCandle[],
  pivots: ConfirmedPivot[],
  atr: number,
  currentLivePrice: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  config: AlBrooksConfigParams
): Method4BreakoutOutput {
  const n = closedCandles.length;
  const lastCandle = closedCandles[n - 1];

  // Key structural levels from confirmed pivots prior to the last 4 bars
  const recentHighPivots = pivots.filter((p) => p.type === 'HIGH' && p.index < n - 3);
  const recentLowPivots = pivots.filter((p) => p.type === 'LOW' && p.index < n - 3);

  const keyResistance =
    recentHighPivots.length > 0
      ? recentHighPivots[recentHighPivots.length - 1].price
      : Math.max(...closedCandles.slice(-45, -3).map((c) => c.high));

  const keySupport =
    recentLowPivots.length > 0
      ? recentLowPivots[recentLowPivots.length - 1].price
      : Math.min(...closedCandles.slice(-45, -3).map((c) => c.low));

  // Scan the last 5 closed candles for a breakout or failed breakout of keyResistance / keySupport
  let breakoutCandleIdx = n - 1;
  let breakoutDirection: Method4BreakoutOutput['breakoutDirection'] = 'NONE';
  let breakoutLevel = keyResistance;
  let breakoutLevelType: Method4BreakoutOutput['breakoutLevelType'] = 'RESISTANCE';
  let isClosedBeyondLevel = false;
  let isFailedBreakout = false;
  let pullbackToBreakoutLevel = false;

  for (let i = Math.max(5, n - 5); i < n; i++) {
    const c = closedCandles[i];
    const prev = closedCandles[i - 1];
    // Bullish breakout check
    if (c.high > keyResistance && prev.close <= keyResistance) {
      breakoutLevel = keyResistance;
      breakoutLevelType = 'RESISTANCE';
      breakoutDirection = 'BULLISH';
      breakoutCandleIdx = i;
      if (c.close > keyResistance + atr * 0.08) {
        isClosedBeyondLevel = true;
        // Check subsequent candles (if any) for pullback or failure
        for (let k = i + 1; k < n; k++) {
          if (closedCandles[k].close < keyResistance - atr * 0.1) {
            isFailedBreakout = true;
          } else if (
            closedCandles[k].low <= keyResistance + atr * 0.35 &&
            closedCandles[k].close > keyResistance
          ) {
            pullbackToBreakoutLevel = true;
          }
        }
      } else {
        // Only intrabar wick pierced resistance and closed back inside
        isFailedBreakout = true;
      }
      break;
    }

    // Bearish breakout check
    if (c.low < keySupport && prev.close >= keySupport) {
      breakoutLevel = keySupport;
      breakoutLevelType = 'SUPPORT';
      breakoutDirection = 'BEARISH';
      breakoutCandleIdx = i;
      if (c.close < keySupport - atr * 0.08) {
        isClosedBeyondLevel = true;
        for (let k = i + 1; k < n; k++) {
          if (closedCandles[k].close > keySupport + atr * 0.1) {
            isFailedBreakout = true;
          } else if (
            closedCandles[k].high >= keySupport - atr * 0.35 &&
            closedCandles[k].close < keySupport
          ) {
            pullbackToBreakoutLevel = true;
          }
        }
      } else {
        isFailedBreakout = true;
      }
      break;
    }
  }

  const boCandle = closedCandles[breakoutCandleIdx];
  const boMetrics = evaluateCandleMetrics(boCandle, atr);

  const closeDistAbs =
    breakoutDirection === 'BULLISH'
      ? Math.max(0, boCandle.close - breakoutLevel)
      : breakoutDirection === 'BEARISH'
      ? Math.max(0, breakoutLevel - boCandle.close)
      : 0;

  const closeDistancePct = Number(((closeDistAbs / breakoutLevel) * 100).toFixed(2));
  const closeDistanceAtr = Number((atr > 0 ? closeDistAbs / atr : 0).toFixed(2));

  const isStrongBoCandle =
    boMetrics.bodyToRange >= 0.58 &&
    boMetrics.rangeToAtr >= 0.85 &&
    ((breakoutDirection === 'BULLISH' && boMetrics.closePositionInRange >= 0.72) ||
      (breakoutDirection === 'BEARISH' && boMetrics.closePositionInRange <= 0.28));

  let failedBreakoutProbability: Method4BreakoutOutput['failedBreakoutProbability'] = 'MODERATE';
  if (isFailedBreakout || !isClosedBeyondLevel) {
    failedBreakoutProbability = 'HIGH';
  } else if (isStrongBoCandle && closeDistanceAtr >= 0.35) {
    failedBreakoutProbability = 'LOW';
  }

  const reasons: string[] = [];
  let tradeDirection: 'LONG' | 'SHORT' | 'NO TRADE' = 'NO TRADE';
  let signalStatus: Method4BreakoutOutput['signalStatus'] = 'NO_TRADE';

  if (breakoutDirection === 'NONE') {
    reasons.push(
      `در کندل‌های بسته اخیر، شکستی روی مقاومت معتبر ($${keyResistance.toFixed(2)}) یا حمایت معتبر ($${keySupport.toFixed(2)}) رخ نداده است.`
    );
  } else if (isFailedBreakout || !isClosedBeyondLevel) {
    signalStatus = 'FAILED_BREAKOUT';
    reasons.push(
      `عبور قیمت از سطح $${breakoutLevel.toFixed(2)} فاقد بسته‌شدن معتبر بیرون از سطح بوده یا به محدوده قبلی بازگشته است (Failed Breakout — طبق قانون روش ۴، عبور لحظه‌ای شکست تأییدشده محسوب نمی‌شود).`
    );
  } else if (pullbackToBreakoutLevel) {
    signalStatus = 'BREAKOUT_PULLBACK_CONFIRMED';
    tradeDirection = breakoutDirection === 'BULLISH' ? 'LONG' : 'SHORT';
    reasons.push(
      `شکست سطح $${breakoutLevel.toFixed(2)} با کندل بسته تأیید شد و پولبک موفق به سطح شکسته‌شده انجام گردید.`
    );
  } else if (isStrongBoCandle) {
    signalStatus = 'CONFIRMED_BREAKOUT';
    tradeDirection = breakoutDirection === 'BULLISH' ? 'LONG' : 'SHORT';
    reasons.push(
      `کندل شکست با بدنه ${(boMetrics.bodyToRange * 100).toFixed(0)}% و فاصله بسته‌شدن ${closeDistanceAtr} برابر ATR بیرون از سطح $${breakoutLevel.toFixed(2)} بسته شده است.`
    );
  } else {
    reasons.push(
      `کندل بالای/پایین سطح $${breakoutLevel.toFixed(2)} بسته شده اما قدرت بدنه آن (${(boMetrics.bodyToRange * 100).toFixed(0)}%) ضعیف است و احتمال شکست ناموفق بالاست؛ منتظر پولبک و کندل تأیید بمانید.`
    );
  }

  const rangeSpan = Math.max(Math.abs(keyResistance - keySupport), atr * 3.5);
  const structuralStop =
    tradeDirection === 'LONG'
      ? Math.min(breakoutLevel - atr * 0.45, boCandle.low - atr * 0.15)
      : Math.max(breakoutLevel + atr * 0.45, boCandle.high + atr * 0.15);

  const targets: [number, number, number] =
    tradeDirection === 'LONG'
      ? [
          boCandle.close + rangeSpan * 0.5,
          boCandle.close + rangeSpan * 1.0,
          boCandle.close + rangeSpan * 1.5,
        ]
      : [
          boCandle.close - rangeSpan * 0.5,
          boCandle.close - rangeSpan * 1.0,
          boCandle.close - rangeSpan * 1.5,
        ];

  const trade = calculateTradeScenario({
    direction: tradeDirection,
    entryType: pullbackToBreakoutLevel ? 'STOP_ORDER_BREAKOUT' : 'CLOSE_CONFIRMED',
    signalBar: boCandle,
    signalBarIndex: breakoutCandleIdx,
    confirmationBar: pullbackToBreakoutLevel ? lastCandle : boCandle,
    confirmationBarIndex: pullbackToBreakoutLevel ? n - 1 : breakoutCandleIdx,
    currentLivePrice,
    structuralStopLoss: structuralStop,
    structuralTargets: targets,
    invalidationPrice: breakoutLevel,
    invalidationCondition:
      breakoutDirection === 'BULLISH'
        ? `بازگشت و بسته‌شدن کندل زیر سطح شکسته‌شده ($${breakoutLevel.toFixed(2)})`
        : breakoutDirection === 'BEARISH'
        ? `بازگشت و بسته‌شدن کندل بالای سطح شکسته‌شده ($${breakoutLevel.toFixed(2)})`
        : 'بازگشت قیمت به داخل محدوده قبلی',
    entryConfirmationCondition:
      breakoutDirection === 'BULLISH'
        ? `بسته‌شدن کندل قدرتمند بالای مقاومت $${breakoutLevel.toFixed(2)} یا شکست سقف کندل پولبک`
        : breakoutDirection === 'BEARISH'
        ? `بسته‌شدن کندل قدرتمند زیر حمایت $${breakoutLevel.toFixed(2)} یا شکست کف کندل پولبک`
        : 'نیازمند شکست معتبر حمایت یا مقاومت با کندل بسته',
    atr,
    config,
  });

  if (!trade.isValidRiskReward && trade.direction !== 'NO TRADE') {
    reasons.push(trade.rejectionReason || 'نسبت ریسک به بازده شکست کمتر از حداقل 1:2 است.');
    trade.direction = 'NO TRADE';
    signalStatus = 'NO_TRADE';
  }

  const score = computeExplainableScore(
    {
      marketStructure: isClosedBeyondLevel && !isFailedBreakout ? 0.85 : 0.25,
      signalBarStrength: boMetrics.bodyToRange,
      srPosition: breakoutDirection !== 'NONE' ? 0.88 : 0.2,
      htfAlignment:
        (tradeDirection === 'LONG' && htfTrend === 'BULLISH') ||
        (tradeDirection === 'SHORT' && htfTrend === 'BEARISH')
          ? 0.95
          : 0.55,
      riskReward: trade.isValidRiskReward ? Math.min(1, trade.netRiskRewardTp2 / 2.8) : 0.15,
      entryConfirmation:
        signalStatus === 'BREAKOUT_PULLBACK_CONFIRMED'
          ? 0.95
          : signalStatus === 'CONFIRMED_BREAKOUT'
          ? 0.82
          : 0.1,
    },
    config
  );

  return {
    methodId: 'breakout',
    methodNumber: 4,
    titleFa: 'روش ۴: Breakouts (معامله روی شکست)',
    titleEn: 'Breakouts',
    breakoutLevel: Number(breakoutLevel.toFixed(6)),
    breakoutLevelType,
    breakoutLevelTypeFa:
      breakoutLevelType === 'RESISTANCE' ? 'مقاومت محوری (Resistance)' : 'حمایت محوری (Support)',
    breakoutDirection,
    breakoutDirectionFa:
      breakoutDirection === 'BULLISH'
        ? 'شکست رو به بالا (Bullish Breakout)'
        : breakoutDirection === 'BEARISH'
        ? 'شکست رو به پایین (Bearish Breakout)'
        : 'بدون شکست در کندل‌های اخیر',
    isClosedBeyondLevel,
    closeDistancePct,
    closeDistanceAtr,
    breakoutCandleStrength: {
      bodyToRangeRatio: Number(boMetrics.bodyToRange.toFixed(2)),
      rangeToAtrRatio: Number(boMetrics.rangeToAtr.toFixed(2)),
      closePositionRatio: Number(boMetrics.closePositionInRange.toFixed(2)),
      strengthLabel: isStrongBoCandle ? 'قوی (کندل شکست استاندارد)' : 'ضعیف / مستعد بازگشت',
    },
    pullbackToBreakoutLevel,
    failedBreakoutProbability,
    failedBreakoutProbabilityFa:
      failedBreakoutProbability === 'LOW'
        ? 'کم (شکست پرقدرت)'
        : failedBreakoutProbability === 'MODERATE'
        ? 'متوسط'
        : 'زیاد (هشدار تله شکست / Failed Breakout)',
    isFailedBreakout,
    signalStatus,
    signalStatusFa:
      signalStatus === 'BREAKOUT_PULLBACK_CONFIRMED'
        ? 'شکست + پولبک تأییدشده'
        : signalStatus === 'CONFIRMED_BREAKOUT'
        ? 'شکست تأییدشده با کندل بسته'
        : signalStatus === 'FAILED_BREAKOUT'
        ? 'شکست ناموفق (Failed Breakout)'
        : 'NO TRADE (بدون شکست معتبر)',
    trade,
    score,
    confirmOrRejectReasons: reasons,
  };
}

// ============================================================================
// METHOD 5: Pullbacks — معامله روی پولبک (High 1 / High 2 / Low 1 / Low 2)
// ============================================================================
/**
 * Documented & Consistent H1 / H2 / L1 / L2 Algorithm:
 * - In a Bullish Main Trend:
 *   1. Identify the highest bar of the impulse leg (`impulsePeakIdx`).
 *   2. A pullback begins when closed candles make lower highs and pull back toward EMA20.
 *   3. `High 1 (H1)` is the FIRST bar during the pullback whose high breaks above the prior closed bar's high (`candle[i].high > candle[i-1].high`), representing the first bullish attempt to resume the trend.
 *   4. If H1 fails to reach a new swing high and price pulls back again (making at least one bar with a lower high `candle[k].high < candle[k-1].high`), the SECOND distinct bullish leg where a bar breaks above the prior bar's high (`candle[m].high > candle[m-1].high`) is `High 2 (H2)`.
 * - Symmetric logic in a Bearish Main Trend for `Low 1 (L1)` and `Low 2 (L2)` (first and second bearish resumption attempts breaking below the prior bar's low after a counter-trend bounce).
 */
export function runMethod5Pullbacks(
  closedCandles: OhlcvCandle[],
  pivots: ConfirmedPivot[],
  ema20Series: number[],
  atr: number,
  currentLivePrice: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  config: AlBrooksConfigParams
): Method5PullbackOutput {
  const n = closedCandles.length;
  const lastCandle = closedCandles[n - 1];
  const emaNow = ema20Series[n - 1] || lastCandle.close;
  const emaPrev15 = ema20Series[Math.max(0, n - 16)] || emaNow;

  const highPivots = pivots.filter((p) => p.type === 'HIGH');
  const lowPivots = pivots.filter((p) => p.type === 'LOW');

  // 1. Identify Main Trend
  let mainTrend: Method5PullbackOutput['mainTrend'] = 'NEUTRAL';
  if (
    emaNow > emaPrev15 * 1.0015 &&
    lowPivots.length >= 2 &&
    lowPivots[lowPivots.length - 1].price >= lowPivots[lowPivots.length - 2].price - atr * 0.2
  ) {
    mainTrend = 'BULLISH';
  } else if (
    emaNow < emaPrev15 * 0.9985 &&
    highPivots.length >= 2 &&
    highPivots[highPivots.length - 1].price <= highPivots[highPivots.length - 2].price + atr * 0.2
  ) {
    mainTrend = 'BEARISH';
  }

  const h1h2l1l2Markers: Method5PullbackOutput['h1h2l1l2Markers'] = [];
  const reasons: string[] = [];
  let detectedPattern: Method5PullbackOutput['detectedPattern'] = 'NONE';
  let detectedPatternFa = 'بدون الگوی پولبک H1/H2/L1/L2';
  let pullbackZone: Method5PullbackOutput['pullbackZone'] = null;
  let isPullbackTurningIntoReversal = false;
  let attemptsCount = 0;
  let signalIdx = n - 1;
  let confIdx: number | null = null;
  let tradeDirection: 'LONG' | 'SHORT' | 'NO TRADE' = 'NO TRADE';

  const scanStart = Math.max(10, n - 32);

  if (mainTrend === 'BULLISH') {
    // Find peak of recent bullish impulse in [scanStart .. n-4]
    let peakIdx = scanStart;
    for (let i = scanStart; i <= n - 3; i++) {
      if (closedCandles[i].high >= closedCandles[peakIdx].high) {
        peakIdx = i;
      }
    }

    const impulseLow =
      lowPivots.length > 0
        ? lowPivots[lowPivots.length - 1].price
        : Math.min(...closedCandles.slice(Math.max(0, peakIdx - 20), peakIdx + 1).map((c) => c.low));
    const impulseHeight = Math.max(closedCandles[peakIdx].high - impulseLow, atr * 2);

    if (peakIdx < n - 2) {
      let lowestPullbackIdx = peakIdx + 1;
      let inDownLeg = true;

      for (let i = peakIdx + 1; i < n; i++) {
        const cur = closedCandles[i];
        const prev = closedCandles[i - 1];
        if (cur.low < closedCandles[lowestPullbackIdx].low) {
          lowestPullbackIdx = i;
        }

        if (inDownLeg && cur.high > prev.high) {
          attemptsCount++;
          inDownLeg = false;
          if (attemptsCount === 1) {
            h1h2l1l2Markers.push({
              tag: 'H1',
              candleIndex: i,
              time: cur.time,
              price: cur.high,
              description: 'High 1 (H1): اولین تلاش خریداران برای پایان اصلاح و بازگشت به روند صعودی',
            });
          } else if (attemptsCount === 2) {
            h1h2l1l2Markers.push({
              tag: 'H2',
              candleIndex: i,
              time: cur.time,
              price: cur.high,
              description: 'High 2 (H2): دومین تلاش صعودی پس از اصلاح دوتایی (ستاپ کلاسیک آل بروکس)',
            });
          }
        } else if (!inDownLeg && cur.high < prev.high && cur.low < prev.low) {
          // Second leg of pullback started
          inDownLeg = true;
        }
      }

      const retracement =
        ((closedCandles[peakIdx].high - closedCandles[lowestPullbackIdx].low) / impulseHeight) * 100;

      pullbackZone = {
        startPrice: closedCandles[peakIdx].high,
        endPrice: closedCandles[lowestPullbackIdx].low,
        startIndex: peakIdx,
        endIndex: lowestPullbackIdx,
        startTime: closedCandles[peakIdx].time,
        endTime: closedCandles[lowestPullbackIdx].time,
        retracementPct: Number(Math.max(0, Math.min(150, retracement)).toFixed(1)),
      };

      if (retracement > 78 || closedCandles[lowestPullbackIdx].low < impulseLow) {
        isPullbackTurningIntoReversal = true;
        reasons.push(
          `عمق اصلاح (${pullbackZone.retracementPct}%) بیش از حد مجاز بوده و ساختار روند صعودی را مخدوش کرده است (تبدیل اصلاح به تغییر روند).`
        );
      } else if (attemptsCount >= 2) {
        detectedPattern = 'HIGH_2';
        detectedPatternFa = 'الگوی High 2 (H2 Bull Flag — دومین تلاش خرید در اصلاح)';
        const h2Marker = h1h2l1l2Markers.find((m) => m.tag === 'H2');
        signalIdx = h2Marker ? Math.max(0, h2Marker.candleIndex - 1) : n - 1;
        confIdx = h2Marker ? h2Marker.candleIndex : null;
        if (n - 1 - signalIdx <= 5) {
          tradeDirection = 'LONG';
          reasons.push(
            `الگوی H2 معتبر پس از اصلاح ${pullbackZone.retracementPct}% به سمت EMA20 شناسایی شد (دومین تلاش صعودی خریداران).`
          );
        } else {
          reasons.push('الگوی H2 در کندل‌های گذشته رخ داده و قیمت از نقطه ورود فاصله گرفته است.');
        }
      } else if (attemptsCount === 1) {
        detectedPattern = 'HIGH_1';
        detectedPatternFa = 'الگوی High 1 (H1 — اولین تلاش خرید در پولبک)';
        const h1Marker = h1h2l1l2Markers.find((m) => m.tag === 'H1');
        signalIdx = h1Marker ? Math.max(0, h1Marker.candleIndex - 1) : n - 1;
        confIdx = h1Marker ? h1Marker.candleIndex : null;
        const sigM = evaluateCandleMetrics(closedCandles[signalIdx], atr);
        if (n - 1 - signalIdx <= 3 && (sigM.isBullReversalBar || sigM.isStrongBullTrendBar)) {
          tradeDirection = 'LONG';
          reasons.push('الگوی H1 در یک روند صعودی قوی همراه با کندل سیگنال معتبر شکل گرفته است.');
        } else {
          reasons.push('اولین تلاش خرید (H1) مشاهده شد اما کندل سیگنال قدرت کافی ندارد؛ انتظار برای H2 توصیه می‌شود.');
        }
      } else {
        reasons.push('قیمت در حال اصلاح است اما هنوز تلاش صعودی معتبری (H1/H2) سقف کندل قبلی را نشکسته است.');
      }
    }
  } else if (mainTrend === 'BEARISH') {
    let troughIdx = scanStart;
    for (let i = scanStart; i <= n - 3; i++) {
      if (closedCandles[i].low <= closedCandles[troughIdx].low) {
        troughIdx = i;
      }
    }

    const impulseHigh =
      highPivots.length > 0
        ? highPivots[highPivots.length - 1].price
        : Math.max(...closedCandles.slice(Math.max(0, troughIdx - 20), troughIdx + 1).map((c) => c.high));
    const impulseHeight = Math.max(impulseHigh - closedCandles[troughIdx].low, atr * 2);

    if (troughIdx < n - 2) {
      let highestPullbackIdx = troughIdx + 1;
      let inUpLeg = true;

      for (let i = troughIdx + 1; i < n; i++) {
        const cur = closedCandles[i];
        const prev = closedCandles[i - 1];
        if (cur.high > closedCandles[highestPullbackIdx].high) {
          highestPullbackIdx = i;
        }

        if (inUpLeg && cur.low < prev.low) {
          attemptsCount++;
          inUpLeg = false;
          if (attemptsCount === 1) {
            h1h2l1l2Markers.push({
              tag: 'L1',
              candleIndex: i,
              time: cur.time,
              price: cur.low,
              description: 'Low 1 (L1): اولین تلاش فروشندگان برای پایان اصلاح صعودی و ادامه روند نزولی',
            });
          } else if (attemptsCount === 2) {
            h1h2l1l2Markers.push({
              tag: 'L2',
              candleIndex: i,
              time: cur.time,
              price: cur.low,
              description: 'Low 2 (L2): دومین تلاش نزولی پس از اصلاح دوتایی در روند نزولی (Bear Flag)',
            });
          }
        } else if (!inUpLeg && cur.low > prev.low && cur.high > prev.high) {
          inUpLeg = true;
        }
      }

      const retracement =
        ((closedCandles[highestPullbackIdx].high - closedCandles[troughIdx].low) / impulseHeight) *
        100;

      pullbackZone = {
        startPrice: closedCandles[troughIdx].low,
        endPrice: closedCandles[highestPullbackIdx].high,
        startIndex: troughIdx,
        endIndex: highestPullbackIdx,
        startTime: closedCandles[troughIdx].time,
        endTime: closedCandles[highestPullbackIdx].time,
        retracementPct: Number(Math.max(0, Math.min(150, retracement)).toFixed(1)),
      };

      if (retracement > 78 || closedCandles[highestPullbackIdx].high > impulseHigh) {
        isPullbackTurningIntoReversal = true;
        reasons.push(
          `اصلاح صعودی (${pullbackZone.retracementPct}%) بیش از حد عمیق شده و ساختار نزولی را نقض کرده است.`
        );
      } else if (attemptsCount >= 2) {
        detectedPattern = 'LOW_2';
        detectedPatternFa = 'الگوی Low 2 (L2 Bear Flag — دومین تلاش فروش در اصلاح)';
        const l2Marker = h1h2l1l2Markers.find((m) => m.tag === 'L2');
        signalIdx = l2Marker ? Math.max(0, l2Marker.candleIndex - 1) : n - 1;
        confIdx = l2Marker ? l2Marker.candleIndex : null;
        if (n - 1 - signalIdx <= 5) {
          tradeDirection = 'SHORT';
          reasons.push(
            `الگوی L2 معتبر پس از اصلاح ${pullbackZone.retracementPct}% به سمت EMA20 شناسایی شد (دومین تلاش فروشندگان).`
          );
        } else {
          reasons.push('الگوی L2 در کندل‌های گذشته رخ داده و اکنون خارج از پنجره ورود اولیه است.');
        }
      } else if (attemptsCount === 1) {
        detectedPattern = 'LOW_1';
        detectedPatternFa = 'الگوی Low 1 (L1 — اولین تلاش فروش در پولبک)';
        const l1Marker = h1h2l1l2Markers.find((m) => m.tag === 'L1');
        signalIdx = l1Marker ? Math.max(0, l1Marker.candleIndex - 1) : n - 1;
        confIdx = l1Marker ? l1Marker.candleIndex : null;
        const sigM = evaluateCandleMetrics(closedCandles[signalIdx], atr);
        if (n - 1 - signalIdx <= 3 && (sigM.isBearReversalBar || sigM.isStrongBearTrendBar)) {
          tradeDirection = 'SHORT';
          reasons.push('الگوی L1 در روند نزولی همراه با کندل سیگنال نزولی معتبر شکل گرفته است.');
        } else {
          reasons.push('اولین تلاش فروش (L1) مشاهده شد اما منتظر تشکیل L2 با کیفیت بالاتر هستیم.');
        }
      } else {
        reasons.push('قیمت در فاز اصلاح است اما هنوز الگوی L1 یا L2 تکمیل نشده است.');
      }
    }
  } else {
    reasons.push('روند اصلی بازار خنثی است؛ ستاپ پولبک H1/H2/L1/L2 نیازمند روند پایه واضح است.');
  }

  const sigCandle = closedCandles[signalIdx];
  const confCandle = confIdx !== null ? closedCandles[confIdx] : null;
  const sigMetrics = evaluateCandleMetrics(sigCandle, atr);

  const structuralStop =
    tradeDirection === 'LONG'
      ? Math.min(pullbackZone?.endPrice ?? sigCandle.low, sigCandle.low) - atr * 0.25
      : Math.max(pullbackZone?.endPrice ?? sigCandle.high, sigCandle.high) + atr * 0.25;

  const targets: [number, number, number] =
    tradeDirection === 'LONG'
      ? [
          Math.max(pullbackZone?.startPrice ?? sigCandle.high + atr * 2, sigCandle.high + atr * 1.8),
          sigCandle.high + atr * 3.4,
          sigCandle.high + atr * 5.0,
        ]
      : [
          Math.min(pullbackZone?.startPrice ?? sigCandle.low - atr * 2, sigCandle.low - atr * 1.8),
          sigCandle.low - atr * 3.4,
          sigCandle.low - atr * 5.0,
        ];

  const trade = calculateTradeScenario({
    direction: tradeDirection,
    entryType: 'STOP_ORDER_BREAKOUT',
    signalBar: sigCandle,
    signalBarIndex: signalIdx,
    confirmationBar: confCandle,
    confirmationBarIndex: confIdx,
    currentLivePrice,
    structuralStopLoss: structuralStop,
    structuralTargets: targets,
    invalidationPrice: structuralStop,
    invalidationCondition:
      tradeDirection === 'LONG'
        ? `شکست کف پولبک ($${structuralStop.toFixed(2)}) و تبدیل اصلاح به تغییر روند`
        : tradeDirection === 'SHORT'
        ? `شکست سقف پولبک ($${structuralStop.toFixed(2)}) و تبدیل اصلاح به تغییر روند`
        : 'نقض ساختار روند اصلی',
    entryConfirmationCondition:
      tradeDirection === 'LONG'
        ? `شکست سقف کندل سیگنال ${detectedPattern === 'HIGH_2' ? 'H2' : 'H1'} در قیمت $${sigCandle.high.toFixed(2)}`
        : tradeDirection === 'SHORT'
        ? `شکست کف کندل سیگنال ${detectedPattern === 'LOW_2' ? 'L2' : 'L1'} در قیمت $${sigCandle.low.toFixed(2)}`
        : 'نیازمند تشکیل H2 در روند صعودی یا L2 در روند نزولی',
    atr,
    config,
  });

  if (!trade.isValidRiskReward && trade.direction !== 'NO TRADE') {
    reasons.push(trade.rejectionReason || 'نسبت ریسک به بازده پولبک کمتر از حداقل 1:2 است.');
    trade.direction = 'NO TRADE';
  }

  const score = computeExplainableScore(
    {
      marketStructure:
        mainTrend === 'NEUTRAL' || isPullbackTurningIntoReversal
          ? 0.2
          : detectedPattern === 'HIGH_2' || detectedPattern === 'LOW_2'
          ? 0.92
          : 0.72,
      signalBarStrength: trade.direction !== 'NO TRADE' ? sigMetrics.bodyToRange + 0.15 : 0.2,
      srPosition: pullbackZone && pullbackZone.retracementPct <= 62 ? 0.88 : 0.35,
      htfAlignment:
        (tradeDirection === 'LONG' && htfTrend === 'BULLISH') ||
        (tradeDirection === 'SHORT' && htfTrend === 'BEARISH')
          ? 1.0
          : 0.5,
      riskReward: trade.isValidRiskReward ? Math.min(1, trade.netRiskRewardTp2 / 2.8) : 0.15,
      entryConfirmation: confCandle ? 0.94 : trade.direction !== 'NO TRADE' ? 0.7 : 0.1,
    },
    config
  );

  const signalStatus: Method5PullbackOutput['signalStatus'] =
    trade.direction === 'NO TRADE'
      ? 'NO_TRADE'
      : confCandle
      ? 'CONFIRMED'
      : 'PENDING_TRIGGER';

  return {
    methodId: 'pullback',
    methodNumber: 5,
    titleFa: 'روش ۵: Pullbacks (معامله روی پولبک H1/H2/L1/L2)',
    titleEn: 'Pullbacks',
    mainTrend,
    mainTrendFa:
      mainTrend === 'BULLISH'
        ? 'روند اصلی صعودی'
        : mainTrend === 'BEARISH'
        ? 'روند اصلی نزولی'
        : 'بدون روند اصلی (خنثی)',
    pullbackZone,
    isPullbackTurningIntoReversal,
    detectedPattern,
    detectedPatternFa,
    attemptsCount,
    h1h2l1l2Markers,
    signalBarSummary: `کندل شماره #${signalIdx + 1} با نسبت بدنه به دامنه ${(sigMetrics.bodyToRange * 100).toFixed(0)}%`,
    signalStatus,
    signalStatusFa:
      signalStatus === 'CONFIRMED'
        ? 'تأییدشده (شکست کندل سیگنال پولبک انجام شد)'
        : signalStatus === 'PENDING_TRIGGER'
        ? 'در انتظار شکست سقف/کف کندل سیگنال پولبک'
        : 'NO TRADE (بدون ستاپ پولبک معتبر)',
    trade,
    score,
    confirmOrRejectReasons: reasons,
  };
}

// ============================================================================
// METHOD 6: Best Setup & Market Summary — جمع‌بندی و انتخاب بهترین ستاپ
// ============================================================================
export function runMethod6BestSetupSummary(
  m1: Method1TrendOutput,
  m2: Method2RangeOutput,
  m3: Method3ReversalOutput,
  m4: Method4BreakoutOutput,
  m5: Method5PullbackOutput,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  config: AlBrooksConfigParams
): Method6BestSetupSummary {
  const allMethods = [
    { id: 'trend' as const, titleFa: m1.titleFa, trade: m1.trade, score: m1.score },
    { id: 'range' as const, titleFa: m2.titleFa, trade: m2.trade, score: m2.score },
    { id: 'reversal' as const, titleFa: m3.titleFa, trade: m3.trade, score: m3.score },
    { id: 'breakout' as const, titleFa: m4.titleFa, trade: m4.trade, score: m4.score },
    { id: 'pullback' as const, titleFa: m5.titleFa, trade: m5.trade, score: m5.score },
  ];

  const activeSetups = allMethods.filter(
    (m) => m.trade.direction !== 'NO TRADE' && m.trade.isValidRiskReward
  );

  // Deduplicate signals originating from the exact same signal bar move (within 1 bar index & same direction)
  const deduplicatedSetups: typeof activeSetups = [];
  let duplicateSignalsFilteredCount = 0;

  for (const candidate of [...activeSetups].sort((a, b) => b.score.total - a.score.total)) {
    const isDuplicateMove = deduplicatedSetups.some(
      (existing) =>
        existing.trade.direction === candidate.trade.direction &&
        Math.abs(existing.trade.signalBarIndex - candidate.trade.signalBarIndex) <= 1
    );
    if (isDuplicateMove) {
      duplicateSignalsFilteredCount++;
    } else {
      deduplicatedSetups.push(candidate);
    }
  }

  const longMethods = allMethods.filter((m) => m.trade.direction === 'LONG');
  const shortMethods = allMethods.filter((m) => m.trade.direction === 'SHORT');

  const htfTrendAlignment =
    htfTrend === 'BULLISH'
      ? 'روند تایم‌فریم بالاتر صعودی است (هم‌جهت با ستاپ‌های LONG)'
      : htfTrend === 'BEARISH'
      ? 'روند تایم‌فریم بالاتر نزولی است (هم‌جهت با ستاپ‌های SHORT)'
      : 'تایم‌فریم بالاتر در فاز خنثی / رنج قرار دارد';

  // Check if there are severe unresolved conflicts
  const hasDirectConflict =
    longMethods.length > 0 &&
    shortMethods.length > 0 &&
    Math.abs(
      Math.max(...longMethods.map((m) => m.score.total)) -
        Math.max(...shortMethods.map((m) => m.score.total))
    ) < 10;

  if (deduplicatedSetups.length === 0 || hasDirectConflict) {
    const noTradeReasons: string[] = [];
    if (hasDirectConflict) {
      noTradeReasons.push(
        'تضاد مستقیم بین سیگنال‌های LONG و SHORT با امتیازهای نزدیک به هم وجود دارد؛ طبق قوانین مدیریت ریسک آل بروکس در شرایط ابهام NO TRADE اعلام می‌شود.'
      );
    } else {
      noTradeReasons.push(
        'هیچ‌یک از ۵ روش معاملاتی در کندل‌های بسته فعلی تمامی شروط ساختار، کندل سیگنال و نسبت ریسک به بازده (حداقل 1:2) را احراز نکرده‌اند.'
      );
      noTradeReasons.push('طبق قانون کارت ششم: صرفاً برای پر کردن کارت، سیگنال مصنوعی تولید نمی‌شود.');
    }

    return {
      methodId: 'summary',
      methodNumber: 6,
      titleFa: 'کارت ۶: Best Setup & Market Summary (بهترین ستاپ و جمع‌بندی بازار)',
      titleEn: 'Best Setup & Market Summary',
      recommendedDirection: 'NO TRADE',
      selectedMethodId: 'none',
      selectedMethodTitleFa: 'بدون ستاپ منتخب (NO TRADE)',
      htfTrendAlignment,
      supportingMethods: [],
      conflictingMethods: [
        ...longMethods.map((m) => `${m.titleFa} (LONG)`),
        ...shortMethods.map((m) => `${m.titleFa} (SHORT)`),
      ],
      duplicateSignalsFilteredCount,
      selectionReasons: noTradeReasons,
      trade: m1.trade.direction === 'NO TRADE' ? m1.trade : { ...m1.trade, direction: 'NO TRADE' },
      score: computeExplainableScore(
        {
          marketStructure: 0.25,
          signalBarStrength: 0.2,
          srPosition: 0.25,
          htfAlignment: 0.4,
          riskReward: 0.1,
          entryConfirmation: 0.1,
        },
        config
      ),
    };
  }

  const best = deduplicatedSetups[0];
  const supportingMethods = allMethods
    .filter((m) => m.id !== best.id && m.trade.direction === best.trade.direction)
    .map((m) => m.titleFa);

  const conflictingMethods = allMethods
    .filter(
      (m) =>
        m.trade.direction !== 'NO TRADE' && m.trade.direction !== best.trade.direction
    )
    .map((m) => `${m.titleFa} (${m.trade.direction})`);

  const selectionReasons: string[] = [
    `روش منتخب «${best.titleFa}» بالاترین امتیاز فنی و ساختاری (${best.score.total}/100) را در میان ۵ روش کسب کرده است.`,
    `نسبت ریسک به بازده خالص پس از کسر کارمزد و لغزش: ${best.trade.riskRewardFormatted}.`,
    htfTrendAlignment,
  ];

  if (duplicateSignalsFilteredCount > 0) {
    selectionReasons.push(
      `${duplicateSignalsFilteredCount} سیگنال هم‌زمان ناشی از یک کندل واحد فیلتر شد تا یک حرکت قیمت دوبار شمرده نشود.`
    );
  }

  return {
    methodId: 'summary',
    methodNumber: 6,
    titleFa: 'کارت ۶: Best Setup & Market Summary (بهترین ستاپ و جمع‌بندی بازار)',
    titleEn: 'Best Setup & Market Summary',
    recommendedDirection: best.trade.direction,
    selectedMethodId: best.id,
    selectedMethodTitleFa: best.titleFa,
    htfTrendAlignment,
    supportingMethods,
    conflictingMethods,
    duplicateSignalsFilteredCount,
    selectionReasons,
    trade: best.trade,
    score: best.score,
  };
}

// ============================================================================
// Master Entry Point: Run All 5 Methods + Summary + Build Chart Annotations
// ============================================================================
export function analyzeAllFiveAlBrooksMethods(params: {
  symbol: string;
  interval: string;
  rawCandles: OhlcvCandle[]; // Includes forming candle at the end
  htfCandles?: OhlcvCandle[];
  higherTimeframeInterval?: string;
  config?: Partial<AlBrooksConfigParams>;
}): FiveMethodsCompleteAnalysis {
  const config: AlBrooksConfigParams = {
    ...DEFAULT_AL_BROOKS_CONFIG,
    ...(params.config || {}),
    scoreWeights: {
      ...DEFAULT_AL_BROOKS_CONFIG.scoreWeights,
      ...(params.config?.scoreWeights || {}),
    },
  };

  const sortedRaw = [...params.rawCandles].sort((a, b) => a.time - b.time);
  const currentLivePrice =
    sortedRaw.length > 0 ? sortedRaw[sortedRaw.length - 1].close : 0;

  // Section 7 Rule: Separate forming candle from closed candles
  const formingCandleExcluded = sortedRaw.length > 25;
  const closedCandles = formingCandleExcluded ? sortedRaw.slice(0, -1) : sortedRaw;
  const lastClosed = closedCandles[closedCandles.length - 1] || {
    time: Date.now(),
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
  };

  const atr14 = computeAtr(closedCandles, 14);
  const ema20Series = computeEmaSeries(closedCandles, 20);
  const ema20 = ema20Series[ema20Series.length - 1] || lastClosed.close;

  // Evaluate Higher Timeframe trend if provided
  let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (params.htfCandles && params.htfCandles.length >= 25) {
    const htfClosed = params.htfCandles.slice(0, -1);
    const htfEma = computeEmaSeries(htfClosed, 20);
    const lastHtf = htfClosed[htfClosed.length - 1];
    const prevHtfEma = htfEma[Math.max(0, htfEma.length - 8)];
    const curHtfEma = htfEma[htfEma.length - 1];
    if (lastHtf.close > curHtfEma && curHtfEma > prevHtfEma) {
      htfTrend = 'BULLISH';
    } else if (lastHtf.close < curHtfEma && curHtfEma < prevHtfEma) {
      htfTrend = 'BEARISH';
    }
  } else {
    // Fallback to 50-bar macro slope on current timeframe
    const emaPrev30 = ema20Series[Math.max(0, ema20Series.length - 30)] || ema20;
    if (lastClosed.close > ema20 && ema20 > emaPrev30 * 1.002) htfTrend = 'BULLISH';
    else if (lastClosed.close < ema20 && ema20 < emaPrev30 * 0.998) htfTrend = 'BEARISH';
  }

  const pivots = detectConfirmedPivots(
    closedCandles,
    config.pivotLeftBars,
    config.pivotRightBars,
    atr14
  );

  const method1Trend = runMethod1TrendTrading(
    closedCandles,
    pivots,
    ema20Series,
    atr14,
    currentLivePrice,
    htfTrend,
    config
  );

  const method2Range = runMethod2TradingRanges(
    closedCandles,
    pivots,
    atr14,
    currentLivePrice,
    htfTrend,
    config
  );

  const method3Reversal = runMethod3Reversals(
    closedCandles,
    pivots,
    ema20Series,
    atr14,
    currentLivePrice,
    htfTrend,
    config
  );

  const method4Breakout = runMethod4Breakouts(
    closedCandles,
    pivots,
    atr14,
    currentLivePrice,
    htfTrend,
    config
  );

  const method5Pullback = runMethod5Pullbacks(
    closedCandles,
    pivots,
    ema20Series,
    atr14,
    currentLivePrice,
    htfTrend,
    config
  );

  const method6Summary = runMethod6BestSetupSummary(
    method1Trend,
    method2Range,
    method3Reversal,
    method4Breakout,
    method5Pullback,
    htfTrend,
    config
  );

  // Build Chart Annotations & Interactive Markers linked to exact candle time & price
  const markers: ChartMarkerPoint[] = [];

  // 1. Add recent confirmed structural pivots (HH, HL, LH, LL)
  for (const p of pivots.slice(-8)) {
    markers.push({
      id: `pivot-${p.type}-${p.index}`,
      methodId: 'trend',
      methodTitle: method1Trend.titleFa,
      candleIndex: p.index,
      time: p.time,
      price: p.price,
      label: `${p.structureLabel || p.type}`,
      category: 'PIVOT_STRUCTURE',
      color: p.type === 'HIGH' ? '#0f172a' : '#334155',
      position: p.type === 'HIGH' ? 'aboveBar' : 'belowBar',
      shape: 'circle',
      details: `نقطه چرخش تاییدشده (${p.structureLabel}) در قیمت $${p.price.toFixed(2)} — تاییدشده پس از بسته شدن ${config.pivotRightBars} کندل بعدی.`,
    });
  }

  // 2. Add H1 / H2 / L1 / L2 pullback markers
  for (const hm of method5Pullback.h1h2l1l2Markers) {
    const isBullTag = hm.tag === 'H1' || hm.tag === 'H2';
    markers.push({
      id: `pb-${hm.tag}-${hm.candleIndex}`,
      methodId: 'pullback',
      methodTitle: method5Pullback.titleFa,
      candleIndex: hm.candleIndex,
      time: hm.time,
      price: hm.price,
      label: hm.tag,
      category: 'H1_H2_L1_L2',
      color: isBullTag ? '#0284c7' : '#ea580c',
      position: isBullTag ? 'belowBar' : 'aboveBar',
      shape: 'square',
      details: hm.description,
    });
  }

  // 3. Add Breakout / Failed Breakout marker
  if (method4Breakout.breakoutDirection !== 'NONE') {
    const boIdx = method4Breakout.trade.signalBarIndex;
    const boCandle = closedCandles[boIdx] || lastClosed;
    markers.push({
      id: `bo-${boIdx}`,
      methodId: 'breakout',
      methodTitle: method4Breakout.titleFa,
      candleIndex: boIdx,
      time: boCandle.time,
      price:
        method4Breakout.breakoutDirection === 'BULLISH' ? boCandle.high : boCandle.low,
      label: method4Breakout.isFailedBreakout ? 'Failed BO' : 'Breakout',
      category: method4Breakout.isFailedBreakout ? 'FAILED_BREAKOUT' : 'BREAKOUT',
      color: method4Breakout.isFailedBreakout ? '#d97706' : '#7c3aed',
      position: method4Breakout.breakoutDirection === 'BULLISH' ? 'aboveBar' : 'belowBar',
      shape: method4Breakout.isFailedBreakout ? 'circle' : 'arrowUp',
      details: `سطح شکست: $${method4Breakout.breakoutLevel.toFixed(2)} (${method4Breakout.signalStatusFa})`,
    });
  }

  // 4. Add Reversal marker if detected
  if (method3Reversal.reversalPatternType !== 'NONE') {
    const revIdx = method3Reversal.trade.signalBarIndex;
    const revCandle = closedCandles[revIdx] || lastClosed;
    markers.push({
      id: `rev-${revIdx}`,
      methodId: 'reversal',
      methodTitle: method3Reversal.titleFa,
      candleIndex: revIdx,
      time: revCandle.time,
      price: method3Reversal.priorTrend === 'BULLISH' ? revCandle.high : revCandle.low,
      label: method3Reversal.reversalPatternType === 'DOUBLE_TOP' ? 'DT' : method3Reversal.reversalPatternType === 'DOUBLE_BOTTOM' ? 'DB' : 'MTR',
      category: 'REVERSAL_PATTERN',
      color: '#e11d48',
      position: method3Reversal.priorTrend === 'BULLISH' ? 'aboveBar' : 'belowBar',
      shape: 'square',
      details: `${method3Reversal.reversalPatternFa} — ${method3Reversal.signalStatusFa}`,
    });
  }

  // 5. Add Active Entry Marker from Best Setup (or active methods)
  if (method6Summary.recommendedDirection !== 'NO TRADE') {
    const bestTrade = method6Summary.trade;
    const entryCandle = closedCandles[bestTrade.signalBarIndex] || lastClosed;
    const isLong = method6Summary.recommendedDirection === 'LONG';
    markers.push({
      id: `entry-best-${bestTrade.signalBarIndex}`,
      methodId:
        method6Summary.selectedMethodId === 'none'
          ? 'summary'
          : method6Summary.selectedMethodId,
      methodTitle: method6Summary.selectedMethodTitleFa,
      candleIndex: bestTrade.signalBarIndex,
      time: entryCandle.time,
      price: bestTrade.entryPrice,
      label: `${isLong ? 'LONG' : 'SHORT'} (${method6Summary.selectedMethodId.toUpperCase()})`,
      category: isLong ? 'ENTRY_LONG' : 'ENTRY_SHORT',
      color: isLong ? '#16a34a' : '#dc2626',
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      details: `ورود پیشنهادی ${method6Summary.recommendedDirection} در $${bestTrade.entryPrice.toFixed(2)} | حد ضرر: $${bestTrade.stopLoss.toFixed(2)} | TP2: $${bestTrade.takeProfit2.toFixed(2)}`,
    });
  }

  const startRangeIdx = Math.max(0, closedCandles.length - config.rangeLookbackBars);

  const annotations: ChartAnnotationsBundle = {
    supportLevels: [
      {
        price: method2Range.rangeBottom,
        label: 'کف رنج / حمایت (Support)',
        startIndex: startRangeIdx,
        endIndex: closedCandles.length - 1,
      },
      ...(method1Trend.lastConfirmedLow
        ? [
            {
              price: method1Trend.lastConfirmedLow.price,
              label: `کف معتبر (${method1Trend.lastConfirmedLow.label})`,
              startIndex: method1Trend.lastConfirmedLow.index,
              endIndex: closedCandles.length - 1,
            },
          ]
        : []),
    ],
    resistanceLevels: [
      {
        price: method2Range.rangeTop,
        label: 'سقف رنج / مقاومت (Resistance)',
        startIndex: startRangeIdx,
        endIndex: closedCandles.length - 1,
      },
      ...(method1Trend.lastConfirmedHigh
        ? [
            {
              price: method1Trend.lastConfirmedHigh.price,
              label: `سقف معتبر (${method1Trend.lastConfirmedHigh.label})`,
              startIndex: method1Trend.lastConfirmedHigh.index,
              endIndex: closedCandles.length - 1,
            },
          ]
        : []),
    ],
    rangeBox: {
      isActive: method2Range.isTradingRange,
      top: method2Range.rangeTop,
      bottom: method2Range.rangeBottom,
      midline: method2Range.rangeMidline,
      startIndex: startRangeIdx,
      endIndex: closedCandles.length - 1,
    },
    pullbackZones: method5Pullback.pullbackZone
      ? [
          {
            startIndex: method5Pullback.pullbackZone.startIndex,
            endIndex: method5Pullback.pullbackZone.endIndex,
            startTime: method5Pullback.pullbackZone.startTime,
            endTime: method5Pullback.pullbackZone.endTime,
            highPrice: Math.max(
              method5Pullback.pullbackZone.startPrice,
              method5Pullback.pullbackZone.endPrice
            ),
            lowPrice: Math.min(
              method5Pullback.pullbackZone.startPrice,
              method5Pullback.pullbackZone.endPrice
            ),
            label: `محدوده پولبک (${method5Pullback.pullbackZone.retracementPct}%)`,
          },
        ]
      : [],
    pivots,
    markers,
  };

  return {
    symbol: params.symbol.toUpperCase(),
    interval: params.interval,
    higherTimeframeInterval: params.higherTimeframeInterval,
    analyzedAtIso: new Date().toISOString(),
    closedCandlesCount: closedCandles.length,
    formingCandleExcluded,
    lastClosedCandleTime: lastClosed.time,
    lastClosedCandlePrice: lastClosed.close,
    currentLivePrice,
    atr14: Number(atr14.toFixed(6)),
    ema20: Number(ema20.toFixed(6)),
    config,
    method1Trend,
    method2Range,
    method3Reversal,
    method4Breakout,
    method5Pullback,
    method6Summary,
    annotations,
  };
}
