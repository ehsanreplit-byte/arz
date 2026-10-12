import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Target,
  ShieldAlert,
  CheckCircle2,
  Sliders,
  Info,
  AlertTriangle,
  Award,
  Clock,
  Check,
  Copy,
} from 'lucide-react';
import {
  FiveMethodsCompleteAnalysis,
  AlBrooksConfigParams,
  ChartMarkerPoint,
  TradeCalculationDetails,
  ScoreBreakdown,
} from '../utils/alBrooksMethods';

interface AlBrooksSixCardsPanelProps {
  analysis: FiveMethodsCompleteAnalysis | null;
  config: AlBrooksConfigParams;
  onUpdateConfig: (next: AlBrooksConfigParams) => void;
  selectedCardId: 'trend' | 'range' | 'reversal' | 'breakout' | 'pullback' | 'summary' | null;
  onSelectCard: (
    id: 'trend' | 'range' | 'reversal' | 'breakout' | 'pullback' | 'summary' | null
  ) => void;
  selectedMarker: ChartMarkerPoint | null;
  onClearMarker: () => void;
  wsConnected: boolean;
  lastUpdatedTimestamp: number | null;
}

export function AlBrooksSixCardsPanel({
  analysis,
  config,
  onUpdateConfig,
  selectedCardId,
  onSelectCard,
  selectedMarker,
  onClearMarker,
  wsConnected,
  lastUpdatedTimestamp,
}: AlBrooksSixCardsPanelProps) {
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [copiedCard, setCopiedCard] = useState<string | null>(null);

  if (!analysis) return null;

  const formatPrice = (val: number) => {
    if (!val || isNaN(val)) return '0.00';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: val < 1 ? 6 : 2,
    });
  };

  const formatTimeFa = (ms: number | null) => {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return new Date(ms).toISOString().slice(11, 19);
    }
  };

  const renderDirectionBadge = (dir: 'LONG' | 'SHORT' | 'NO TRADE') => {
    if (dir === 'LONG') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>LONG (خرید)</span>
        </span>
      );
    }
    if (dir === 'SHORT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-red-50 text-red-700 border border-red-200">
          <TrendingDown className="w-3.5 h-3.5" />
          <span>SHORT (فروش)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
        <MinusCircle className="w-3.5 h-3.5 text-slate-500" />
        <span>NO TRADE</span>
      </span>
    );
  };

  const renderScoreBar = (score: ScoreBreakdown) => (
    <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-700">امتیاز قابل توضیح (۰ تا ۱۰۰):</span>
        <span
          className={`font-extrabold font-mono-tabular ${
            score.total >= 70
              ? 'text-emerald-600'
              : score.total >= 45
              ? 'text-amber-600'
              : 'text-slate-600'
          }`}
        >
          {score.total} / 100
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            score.total >= 70
              ? 'bg-emerald-600'
              : score.total >= 45
              ? 'bg-amber-500'
              : 'bg-slate-400'
          }`}
          style={{ width: `${Math.min(100, Math.max(5, score.total))}%` }}
        />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-[10px] text-slate-500 font-mono-tabular pt-0.5">
        <div>ساختار: {score.marketStructure}/{score.weights.marketStructure}</div>
        <div>کندل: {score.signalBarStrength}/{score.weights.signalBarStrength}</div>
        <div>S/R: {score.srPosition}/{score.weights.srPosition}</div>
        <div>HTF: {score.htfAlignment}/{score.weights.htfAlignment}</div>
        <div>R/R: {score.riskReward}/{score.weights.riskReward}</div>
        <div>تأیید: {score.entryConfirmation}/{score.weights.entryConfirmation}</div>
      </div>
    </div>
  );

  const renderTradeGrid = (trade: TradeCalculationDetails, showTp3 = false) => {
    if (trade.direction === 'NO TRADE') {
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-slate-800">وضعیت: NO TRADE (بدون ورود معتبر)</div>
            <div>{trade.rejectionReason || trade.entryConfirmationCondition}</div>
            <div className="text-[11px] text-slate-500">
              شرط تأیید ورود: {trade.entryConfirmationCondition}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div
          className={`grid grid-cols-2 ${
            showTp3 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
          } gap-2 text-xs`}
        >
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-0.5">
            <div className="text-[10px] font-semibold text-blue-600 flex items-center gap-1">
              <Target className="w-3 h-3" />
              <span>ورود احتمالی</span>
            </div>
            <div className="font-extrabold text-slate-900 font-mono-tabular">
              ${formatPrice(trade.entryPrice)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-0.5">
            <div className="text-[10px] font-semibold text-red-600 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              <span>حد ضرر ساختاری</span>
            </div>
            <div className="font-extrabold text-red-600 font-mono-tabular">
              ${formatPrice(trade.stopLoss)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-0.5">
            <div className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>هدف اول (TP1)</span>
            </div>
            <div className="font-extrabold text-emerald-600 font-mono-tabular">
              ${formatPrice(trade.takeProfit1)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-0.5">
            <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>هدف دوم (TP2)</span>
            </div>
            <div className="font-extrabold text-emerald-700 font-mono-tabular">
              ${formatPrice(trade.takeProfit2)}
            </div>
          </div>

          {showTp3 && (
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-0.5">
              <div className="text-[10px] font-semibold text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>هدف سوم (TP3)</span>
              </div>
              <div className="font-extrabold text-emerald-800 font-mono-tabular">
                ${formatPrice(trade.takeProfit3)}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-600 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="text-slate-800">نوع قیمت ورود: </strong>
              {trade.entryPriceModeLabel}
            </span>
            <span className="font-mono-tabular font-bold text-emerald-700">
              R/R: {trade.riskRewardFormatted}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-slate-500 font-mono-tabular">
            <span>زمان تشکیل سیگنال: {formatTimeFa(trade.signalBarTime)}</span>
            <span>·</span>
            <span>
              زمان تأیید:{' '}
              {trade.confirmationBarTime
                ? formatTimeFa(trade.confirmationBarTime)
                : 'منتظر شکست کندل سیگنال'}
            </span>
            <span>·</span>
            <span>هزینه کارمزد+لغزش: ${formatPrice(trade.estimatedFeeAndSlippageCost)}</span>
          </div>
          <div>
            <strong className="text-slate-800">شرط تأیید ورود: </strong>
            {trade.entryConfirmationCondition}
          </div>
          <div className="text-red-700">
            <strong>سطح و شرط ابطال سناریو: </strong>
            {trade.invalidationCondition} (سطح ابطال: ${formatPrice(trade.invalidationPrice)})
          </div>
        </div>
      </div>
    );
  };

  const {
    method1Trend: m1,
    method2Range: m2,
    method3Reversal: m3,
    method4Breakout: m4,
    method5Pullback: m5,
    method6Summary: m6,
  } = analysis;

  const handleCopySummary = () => {
    const text = [
      `📊 جمع‌بندی ۶ کارت پرایس اکشن آل بروکس (${analysis.symbol} - ${analysis.interval.toUpperCase()})`,
      `پیشنهاد نهایی کارت ششم: ${m6.recommendedDirection}`,
      `روش منتخب: ${m6.selectedMethodTitleFa}`,
      `امتیاز فنی ستاپ: ${m6.score.total}/100`,
      m6.recommendedDirection !== 'NO TRADE'
        ? `ورود: $${formatPrice(m6.trade.entryPrice)} | حد ضرر: $${formatPrice(
            m6.trade.stopLoss
          )} | TP1: $${formatPrice(m6.trade.takeProfit1)} | TP2: $${formatPrice(
            m6.trade.takeProfit2
          )} | TP3: $${formatPrice(m6.trade.takeProfit3)} | R/R: ${m6.trade.riskRewardFormatted}`
        : `دلیل عدم ورود: ${m6.selectionReasons.join(' - ')}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedCard('summary');
    setTimeout(() => setCopiedCard(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top Status & Adjustable Parameters Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-sm font-extrabold text-slate-900">
              پنج روش معاملاتی آل بروکس + کارت ششم (بهترین ستاپ و جمع‌بندی بازار)
            </h3>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                wsConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {wsConnected ? 'متصل به Binance Spot' : 'در حال همگام‌سازی...'}
            </span>
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>
                آخرین به‌روزرسانی:{' '}
                {lastUpdatedTimestamp ? formatTimeFa(lastUpdatedTimestamp) : 'هم‌اکنون'}
              </span>
            </span>
            <span>·</span>
            <span>
              کندل‌های بسته‌شده تحلیل‌شده: <strong>{analysis.closedCandlesCount}</strong> کندل (کندل باز فعلی از صدور سیگنال حذف شده است)
            </span>
            <span>·</span>
            <span className="font-mono-tabular">ATR(14): ${formatPrice(analysis.atr14)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {showConfigDrawer
                ? 'بستن تنظیمات پارامترها و وزن‌ها'
                : `تنظیمات R/R (1:${config.minRiskReward}) و وزن امتیازدهی`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copiedCard === 'summary' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>کپی شد</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>کپی خلاصه بهترین ستاپ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Adjustable Parameters & Weights Drawer (Sections 4, 6, 7) */}
      {showConfigDrawer && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="font-bold text-slate-900">
              پارامترهای الگوریتم، کارمزد، حداقل ریسک به بازده و وزن معیارهای امتیازدهی (۰ تا ۱۰۰)
            </span>
            <span className="text-[11px] text-slate-500">
              تغییر هر پارامتر بلافاصله هر ۶ کارت را بازمحاسبه می‌کند
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                حداقل ریسک به بازده (1:X)
              </label>
              <input
                type="number"
                step="0.25"
                min="1"
                max="5"
                value={config.minRiskReward}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    minRiskReward: Math.max(1, parseFloat(e.target.value) || 2),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                کندل تأیید Pivot (چپ/راست)
              </label>
              <input
                type="number"
                min="2"
                max="8"
                value={config.pivotRightBars}
                onChange={(e) => {
                  const v = Math.max(2, Math.min(8, parseInt(e.target.value, 10) || 3));
                  onUpdateConfig({ ...config, pivotLeftBars: v, pivotRightBars: v });
                }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                تلورانس سقف/کف دوقلو (ATR)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.15"
                max="1.0"
                value={config.doubleTopBottomToleranceAtr}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    doubleTopBottomToleranceAtr: Math.max(
                      0.15,
                      parseFloat(e.target.value) || 0.4
                    ),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                کارمزد هر سمت (%)
              </label>
              <input
                type="number"
                step="0.02"
                min="0"
                max="0.5"
                value={config.feeRatePct}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    feeRatePct: Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                لغزش قیمت Slippage (%)
              </label>
              <input
                type="number"
                step="0.02"
                min="0"
                max="0.5"
                value={config.slippagePct}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    slippagePct: Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                بازه بررسی رنج (کندل)
              </label>
              <input
                type="number"
                min="30"
                max="180"
                value={config.rangeLookbackBars}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    rangeLookbackBars: Math.max(30, parseInt(e.target.value, 10) || 90),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>
          </div>
        </div>
      )}

      {/* Selected Marker Inspector Banner (When user clicks a marker on the chart) */}
      {selectedMarker && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900">
                نشانگر انتخاب‌شده روی نمودار: {selectedMarker.label} — {selectedMarker.methodTitle}
              </div>
              <div className="text-slate-700">{selectedMarker.details}</div>
              <div className="text-[11px] text-slate-500 font-mono-tabular">
                کندل شماره #{selectedMarker.candleIndex + 1} | زمان:{' '}
                {formatTimeFa(selectedMarker.time)} | قیمت: ${formatPrice(selectedMarker.price)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearMarker}
            className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer shrink-0"
          >
            بستن
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SIX AL BROOKS UI CARDS GRID                                          */}
      {/* 1. Trend Trading  2. Trading Ranges  3. Reversals                    */}
      {/* 4. Breakouts      5. Pullbacks       6. Best Setup & Market Summary  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* CARD 1: Trend Trading */}
        <div
          onClick={() => onSelectCard(selectedCardId === 'trend' ? null : 'trend')}
          className={`bg-slate-50 border rounded-xl p-4 space-y-3.5 transition-all cursor-pointer ${
            selectedCardId === 'trend'
              ? 'border-blue-600 ring-2 ring-blue-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">{m1.titleFa}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                جهت و قدرت روند: <strong className="text-slate-800">{m1.trendDirectionFa}</strong> ·{' '}
                {m1.trendStrengthFa}
              </p>
            </div>
            {renderDirectionBadge(m1.trade.direction)}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">آخرین سقف معتبر</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {m1.lastConfirmedHigh
                  ? `$${formatPrice(m1.lastConfirmedHigh.price)} (${m1.lastConfirmedHigh.label})`
                  : '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">آخرین کف معتبر</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {m1.lastConfirmedLow
                  ? `$${formatPrice(m1.lastConfirmedLow.price)} (${m1.lastConfirmedLow.label})`
                  : '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">نسبت بدنه به دامنه</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {(m1.trendCandleStats.avgBodyToRangeRatio * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">کندل هم‌جهت متوالی</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {m1.trendCandleStats.consecutiveSameDirCount} کندل
              </div>
            </div>
          </div>

          {renderTradeGrid(m1.trade)}
          {renderScoreBar(m1.score)}

          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
            <div className="font-bold text-slate-800">دلایل تأیید یا رد ستاپ روند:</div>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {m1.confirmOrRejectReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* CARD 2: Trading Ranges */}
        <div
          onClick={() => onSelectCard(selectedCardId === 'range' ? null : 'range')}
          className={`bg-slate-50 border rounded-xl p-4 space-y-3.5 transition-all cursor-pointer ${
            selectedCardId === 'range'
              ? 'border-blue-600 ring-2 ring-blue-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">{m2.titleFa}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                موقعیت فعلی قیمت: <strong className="text-slate-800">{m2.currentPriceZoneFa}</strong>{' '}
                ({m2.pricePositionPct}%)
              </p>
            </div>
            {renderDirectionBadge(m2.trade.direction)}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">سقف رنج (Resistance)</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                ${formatPrice(m2.rangeTop)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">خط میانی (Midline)</div>
              <div className="font-bold text-blue-700 font-mono-tabular mt-0.5">
                ${formatPrice(m2.rangeMidline)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">کف رنج (Support)</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                ${formatPrice(m2.rangeBottom)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">واکنش‌های معتبر</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                سقف: {m2.validTopReactions} / کف: {m2.validBottomReactions}
              </div>
            </div>
          </div>

          {renderTradeGrid(m2.trade)}
          {renderScoreBar(m2.score)}

          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
            <div className="font-bold text-slate-800">تحلیل رنج و شرایط ابطال:</div>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {m2.confirmOrRejectReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* CARD 3: Reversals */}
        <div
          onClick={() => onSelectCard(selectedCardId === 'reversal' ? null : 'reversal')}
          className={`bg-slate-50 border rounded-xl p-4 space-y-3.5 transition-all cursor-pointer ${
            selectedCardId === 'reversal'
              ? 'border-blue-600 ring-2 ring-blue-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">{m3.titleFa}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {m3.priorTrendFa} · <strong className="text-slate-800">{m3.signalStatusFa}</strong>
              </p>
            </div>
            {renderDirectionBadge(m3.trade.direction)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">نوع الگوی برگشتی</div>
              <div className="font-bold text-slate-900 mt-0.5">{m3.reversalPatternFa}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">وضعیت تأیید برگشت</div>
              <div
                className={`font-bold mt-0.5 ${
                  m3.signalStatus === 'CONFIRMED_REVERSAL'
                    ? 'text-emerald-700'
                    : m3.signalStatus === 'PROBABLE_REVERSAL_ONLY'
                    ? 'text-amber-700'
                    : 'text-slate-600'
                }`}
              >
                {m3.signalStatusFa}
              </div>
            </div>
          </div>

          {renderTradeGrid(m3.trade)}
          {renderScoreBar(m3.score)}

          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
            <div className="font-bold text-slate-800">نشانه‌های ضعف روند و تأیید برگشت:</div>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {m3.confirmOrRejectReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* CARD 4: Breakouts */}
        <div
          onClick={() => onSelectCard(selectedCardId === 'breakout' ? null : 'breakout')}
          className={`bg-slate-50 border rounded-xl p-4 space-y-3.5 transition-all cursor-pointer ${
            selectedCardId === 'breakout'
              ? 'border-blue-600 ring-2 ring-blue-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">{m4.titleFa}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {m4.breakoutDirectionFa} ·{' '}
                <strong className="text-slate-800">{m4.signalStatusFa}</strong>
              </p>
            </div>
            {renderDirectionBadge(m4.trade.direction)}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">سطح شکست ({m4.breakoutLevelTypeFa})</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                ${formatPrice(m4.breakoutLevel)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">فاصله بسته‌شدن</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {m4.closeDistancePct}% ({m4.closeDistanceAtr} ATR)
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">قدرت کندل شکست</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                بدنه {(m4.breakoutCandleStrength.bodyToRangeRatio * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">احتمال شکست ناموفق</div>
              <div
                className={`font-bold mt-0.5 ${
                  m4.failedBreakoutProbability === 'HIGH'
                    ? 'text-red-600'
                    : m4.failedBreakoutProbability === 'LOW'
                    ? 'text-emerald-600'
                    : 'text-amber-600'
                }`}
              >
                {m4.failedBreakoutProbabilityFa}
              </div>
            </div>
          </div>

          {renderTradeGrid(m4.trade)}
          {renderScoreBar(m4.score)}

          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
            <div className="font-bold text-slate-800">بررسی شکست و پولبک:</div>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {m4.confirmOrRejectReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* CARD 5: Pullbacks (H1 / H2 / L1 / L2) */}
        <div
          onClick={() => onSelectCard(selectedCardId === 'pullback' ? null : 'pullback')}
          className={`bg-slate-50 border rounded-xl p-4 space-y-3.5 transition-all cursor-pointer ${
            selectedCardId === 'pullback'
              ? 'border-blue-600 ring-2 ring-blue-100'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">{m5.titleFa}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {m5.mainTrendFa} · <strong className="text-blue-700">{m5.detectedPatternFa}</strong>
              </p>
            </div>
            {renderDirectionBadge(m5.trade.direction)}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">الگوی شناسایی‌شده</div>
              <div className="font-bold text-blue-700 mt-0.5">
                {m5.detectedPattern === 'NONE' ? 'بدون الگو' : m5.detectedPattern}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">محدوده پولبک</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {m5.pullbackZone
                  ? `$${formatPrice(m5.pullbackZone.endPrice)} (${m5.pullbackZone.retracementPct}%)`
                  : '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">تعداد تلاش‌ها</div>
              <div className="font-bold text-slate-900 font-mono-tabular mt-0.5">
                {m5.attemptsCount} تلاش
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="text-slate-500 text-[11px]">کندل سیگنال</div>
              <div className="font-bold text-slate-900 mt-0.5 truncate" title={m5.signalBarSummary}>
                {m5.signalBarSummary}
              </div>
            </div>
          </div>

          {renderTradeGrid(m5.trade)}
          {renderScoreBar(m5.score)}

          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
            <div className="font-bold text-slate-800">دلیل معتبر بودن یا رد ستاپ پولبک:</div>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {m5.confirmOrRejectReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* CARD 6: Best Setup & Market Summary */}
        <div
          onClick={() => onSelectCard(selectedCardId === 'summary' ? null : 'summary')}
          className={`bg-slate-900 text-white border rounded-xl p-4 space-y-3.5 transition-all cursor-pointer ${
            selectedCardId === 'summary'
              ? 'border-blue-400 ring-2 ring-blue-300'
              : 'border-slate-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-extrabold text-white">{m6.titleFa}</h4>
              </div>
              <p className="text-xs text-slate-300">
                روش منتخب: <strong className="text-amber-300">{m6.selectedMethodTitleFa}</strong>
              </p>
            </div>
            {renderDirectionBadge(m6.recommendedDirection)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5">
              <div className="text-slate-400 text-[11px]">جهت پیشنهادی نهایی</div>
              <div
                className={`font-extrabold mt-0.5 ${
                  m6.recommendedDirection === 'LONG'
                    ? 'text-emerald-400'
                    : m6.recommendedDirection === 'SHORT'
                    ? 'text-red-400'
                    : 'text-amber-300'
                }`}
              >
                {m6.recommendedDirection}
              </div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5">
              <div className="text-slate-400 text-[11px]">روش‌های تأییدکننده هم‌جهت</div>
              <div className="font-bold text-emerald-300 mt-0.5">
                {m6.supportingMethods.length > 0
                  ? `${m6.supportingMethods.length} روش هم‌جهت`
                  : 'بدون روش کمکی هم‌جهت'}
              </div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5">
              <div className="text-slate-400 text-[11px]">روش‌های مخالف / متناقض</div>
              <div className="font-bold text-amber-300 mt-0.5">
                {m6.conflictingMethods.length > 0
                  ? `${m6.conflictingMethods.length} سیگنال مخالف`
                  : 'بدون سیگنال متناقض'}
              </div>
            </div>
          </div>

          <div className="text-slate-900">{renderTradeGrid(m6.trade, true)}</div>
          <div className="text-slate-900">{renderScoreBar(m6.score)}</div>

          <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-3 text-xs space-y-1.5">
            <div className="font-bold text-amber-300">دلایل انتخاب و جمع‌بندی بازار:</div>
            <ul className="list-disc list-inside text-slate-200 space-y-1">
              {m6.selectionReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {m6.supportingMethods.length > 0 && (
              <div className="text-[11px] text-emerald-300 pt-1">
                <strong>روش‌های تأییدکننده: </strong>
                {m6.supportingMethods.join(' ، ')}
              </div>
            )}
            {m6.conflictingMethods.length > 0 && (
              <div className="text-[11px] text-red-300 pt-0.5">
                <strong>روش‌های مخالف: </strong>
                {m6.conflictingMethods.join(' ، ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
