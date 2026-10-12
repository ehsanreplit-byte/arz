import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  LineStyle,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  ISeriesMarkersPluginApi,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  BarChart2,
  Activity,
  Maximize2,
  RefreshCw,
  Layers,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { apiClient, AlBrooksSignalInfo, AlBrooks2SignalInfo, WatchlistSymbol } from '../apiclient';
import {
  analyzeAllFiveAlBrooksMethods,
  DEFAULT_AL_BROOKS_CONFIG,
  AlBrooksConfigParams,
  FiveMethodsCompleteAnalysis,
  ChartMarkerPoint,
} from '../utils/alBrooksMethods';
import { AlBrooksSixCardsPanel } from './AlBrooksSixCardsPanel';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
type ChartEngineMode = 'tradingview_canvas' | 'binance_svg' | 'tradingview_iframe';
type ChartVisualType = 'candlestick' | 'area';

interface CryptoLiveChartProps {
  symbols: WatchlistSymbol[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const INTERVAL_OPTIONS: { id: TimeInterval; label: string }[] = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H (البروکس)' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
];

const KLINE_REST_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3/klines',
  'https://api.binance.com/api/v3/klines',
];

const KLINE_WS_ENDPOINTS = [
  'wss://stream.binance.com:9443/ws',
  'wss://data-stream.binance.vision/ws',
];

export function CryptoLiveChart({
  symbols,
  selectedSymbol,
  onSelectSymbol,
}: CryptoLiveChartProps) {
  const [engineMode, setEngineMode] = useState<ChartEngineMode>('tradingview_canvas');
  const [visualType, setVisualType] = useState<ChartVisualType>('candlestick');
  const [interval, setIntervalState] = useState<TimeInterval>('1h');
  const [candleLimit, setCandleLimit] = useState<number>(400);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Al Brooks AI Signal State & Independent Toggles for Resistance, Support, Signal, and Al Brooks 2
  const [signal, setSignal] = useState<AlBrooksSignalInfo | null>(null);
  const [signal2, setSignal2] = useState<AlBrooks2SignalInfo | null>(null);
  const [analyzingSignal, setAnalyzingSignal] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [showSignalOverlay, setShowSignalOverlay] = useState(true);
  const [showAlBrooks2, setShowAlBrooks2] = useState(true);
  const [showResistance, setShowResistance] = useState(true);
  const [showSupport, setShowSupport] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [copiedSignal, setCopiedSignal] = useState(false);
  const [copiedSignal2, setCopiedSignal2] = useState(false);
  const [showWedgePrompt, setShowWedgePrompt] = useState(false);
  const [copiedWedgePrompt, setCopiedWedgePrompt] = useState(false);

  // Al Brooks 5 Methods + 6th Summary Card State
  const [alBrooksConfig, setAlBrooksConfig] = useState<AlBrooksConfigParams>(
    DEFAULT_AL_BROOKS_CONFIG
  );
  const [fiveMethodsAnalysis, setFiveMethodsAnalysis] =
    useState<FiveMethodsCompleteAnalysis | null>(null);
  const [selectedMethodCard, setSelectedMethodCard] = useState<
    'trend' | 'range' | 'reversal' | 'breakout' | 'pullback' | 'summary' | null
  >(null);
  const [selectedChartMarker, setSelectedChartMarker] = useState<ChartMarkerPoint | null>(null);
  const [wsLiveConnected, setWsLiveConnected] = useState<boolean>(false);
  const [lastDataUpdateMs, setLastDataUpdateMs] = useState<number | null>(null);
  const [htfCandlesCache, setHtfCandlesCache] = useState<CandleData[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // TradingView Lightweight Charts refs
  const tvContainerRef = useRef<HTMLDivElement | null>(null);
  const tvChartRef = useRef<IChartApi | null>(null);
  const tvCandleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const tvAreaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const tvEmaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tvResistanceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tvSupportSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tvWedgeUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tvWedgeLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tvMarkersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const tvPriceLinesRef = useRef<IPriceLine[]>([]);
  const latestSignalRef = useRef<AlBrooksSignalInfo | null>(null);
  const showOverlayRef = useRef<boolean>(true);
  const showResistanceRef = useRef<boolean>(true);
  const showSupportRef = useRef<boolean>(true);

  const activeSymbol = (selectedSymbol || symbols[0]?.symbol || 'BTCUSDT').toUpperCase();
  const activeSymbolObj = symbols.find((s) => s.symbol.toUpperCase() === activeSymbol);

  latestSignalRef.current =
    signal && signal.symbol.toUpperCase() === activeSymbol ? signal : null;
  showOverlayRef.current = showSignalOverlay;
  showResistanceRef.current = showResistance;
  showSupportRef.current = showSupport;

  const formatPrice = (val: number) => {
    if (isNaN(val)) return '0.00';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: val < 1 ? 6 : 2,
    });
  };

  const fetchTfCandlesFromBinance = async (
    sym: string,
    tf: string,
    limit = 400
  ): Promise<CandleData[]> => {
    for (const base of KLINE_REST_ENDPOINTS) {
      try {
        const url = `${base}?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(tf)}&limit=${limit}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length >= 30) {
            return json.slice(-limit).map((k: any) => ({
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
        // try next endpoint
      }
    }
    return [];
  };

  const runAlBrooksAnalysis = async (
    targetSymbol: string,
    targetInterval: TimeInterval,
    candleList: CandleData[]
  ) => {
    if (candleList.length < 10) return;
    setAnalyzingSignal(true);
    setSignalError(null);
    try {
      // Fetch real 15m, 1h, 4h (400 candles each) from Binance Spot for Wedge (کنج سعودی / نزولی) analysis
      const [tf15m, tf1h, tf4h] = await Promise.all([
        targetInterval === '15m' && candleList.length >= 400
          ? Promise.resolve(candleList.slice(-400))
          : fetchTfCandlesFromBinance(targetSymbol, '15m', 400),
        targetInterval === '1h' && candleList.length >= 400
          ? Promise.resolve(candleList.slice(-400))
          : fetchTfCandlesFromBinance(targetSymbol, '1h', 400),
        targetInterval === '4h' && candleList.length >= 400
          ? Promise.resolve(candleList.slice(-400))
          : fetchTfCandlesFromBinance(targetSymbol, '4h', 400),
      ]);

      const multiTimeframeCandles: Record<string, CandleData[]> = {};
      if (tf15m.length >= 30) multiTimeframeCandles['15m'] = tf15m;
      if (tf1h.length >= 30) multiTimeframeCandles['1h'] = tf1h;
      if (tf4h.length >= 30) multiTimeframeCandles['4h'] = tf4h;

      const htfForCurrent =
        targetInterval === '1m' || targetInterval === '5m'
          ? tf15m
          : targetInterval === '15m'
          ? tf1h
          : tf4h;
      setHtfCandlesCache(htfForCurrent);

      const [res1, res2] = await Promise.all([
        apiClient.analyzeAlBrooksSignal({
          symbol: targetSymbol,
          interval: targetInterval,
          candles: candleList,
        }),
        apiClient.analyzeAlBrooks2Signal({
          symbol: targetSymbol,
          interval: targetInterval,
          candles: candleList.slice(-400),
          multiTimeframeCandles,
        }),
      ]);

      setSignal(res1.signal);
      setSignal2(res2.signal2);
    } catch (err: any) {
      setSignalError(err?.message || 'خطا در دریافت سیگنال هوش مصنوعی البروکس');
    } finally {
      setAnalyzingSignal(false);
    }
  };

  // Fetch historical klines + connect live WebSocket
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadKlines = async () => {
      let fetched: any[] | null = null;
      for (const base of KLINE_REST_ENDPOINTS) {
        try {
          const url = `${base}?symbol=${encodeURIComponent(activeSymbol)}&interval=${interval}&limit=${candleLimit}`;
          const res = await fetch(url);
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json) && json.length > 0) {
              fetched = json;
              break;
            }
          }
        } catch {
          // try next endpoint
        }
      }

      if (cancelled) return;

      if (fetched) {
        const parsed: CandleData[] = fetched.slice(-candleLimit).map((k: any) => ({
          time: Number(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        setCandles(parsed);
        setLastDataUpdateMs(Date.now());
        setLoading(false);
        void runAlBrooksAnalysis(activeSymbol, interval, parsed);
      } else {
        setLoading(false);
      }
    };

    void loadKlines();

    if (wsRef.current) {
      wsRef.current.close();
    }

    const symLower = activeSymbol.toLowerCase();
    let ws = new WebSocket(`${KLINE_WS_ENDPOINTS[0]}/${symLower}@kline_${interval}`);
    wsRef.current = ws;

    const handleKlineWsMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        const k = msg?.k;
        if (!k) return;

        const liveCandle: CandleData = {
          time: Number(k.t),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        setCandles((prev) => {
          if (prev.length === 0) return [liveCandle];
          const last = prev[prev.length - 1];
          if (last.time === liveCandle.time) {
            return [...prev.slice(0, -1), liveCandle];
          } else if (liveCandle.time > last.time) {
            return [...prev.slice(-(candleLimit - 1)), liveCandle];
          }
          return prev;
        });
      } catch {
        // ignore parse error
      }
    };

    ws.onopen = () => {
      setWsLiveConnected(true);
    };
    ws.onmessage = (event: MessageEvent) => {
      setWsLiveConnected(true);
      setLastDataUpdateMs(Date.now());
      handleKlineWsMessage(event);
    };
    ws.onerror = () => {
      try {
        ws.close();
        ws = new WebSocket(`${KLINE_WS_ENDPOINTS[1]}/${symLower}@kline_${interval}`);
        ws.onopen = () => setWsLiveConnected(true);
        ws.onmessage = (event: MessageEvent) => {
          setWsLiveConnected(true);
          setLastDataUpdateMs(Date.now());
          handleKlineWsMessage(event);
        };
        wsRef.current = ws;
      } catch {
        setWsLiveConnected(false);
      }
    };

    return () => {
      cancelled = true;
      setWsLiveConnected(false);
      ws.close();
    };
  }, [activeSymbol, interval, candleLimit, reloadTick]);

  // Recompute the 5 Al Brooks Trading Methods + 6th Summary Card deterministically on closed candles
  useEffect(() => {
    if (candles.length < 25) {
      setFiveMethodsAnalysis(null);
      return;
    }
    const htfLabel =
      interval === '1m' || interval === '5m' ? '15m' : interval === '15m' ? '1h' : '4h';
    const computed = analyzeAllFiveAlBrooksMethods({
      symbol: activeSymbol,
      interval,
      rawCandles: candles,
      htfCandles: htfCandlesCache.length >= 25 ? htfCandlesCache : undefined,
      higherTimeframeInterval: htfLabel,
      config: alBrooksConfig,
    });
    setFiveMethodsAnalysis(computed);
  }, [candles, activeSymbol, interval, htfCandlesCache, alBrooksConfig]);

  // Compute EMA 20 curve
  const ema20Points: number[] = [];
  if (candles.length > 0) {
    const k = 2 / (20 + 1);
    let ema = candles[0].close;
    for (let i = 0; i < candles.length; i++) {
      ema = i === 0 ? candles[0].close : candles[i].close * k + ema * (1 - k);
      ema20Points.push(ema);
    }
  }

  // Initialize TradingView Chart instance
  useEffect(() => {
    if (engineMode !== 'tradingview_canvas') return;
    const container = tvContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: 430,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#334155',
        fontFamily: "'JetBrains Mono', 'Vazirmatn', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f1f5f9', style: LineStyle.Solid },
        horzLines: { color: '#f1f5f9', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: '#e2e8f0',
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 9,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: true,
      borderUpColor: '#15803d',
      borderDownColor: '#b91c1c',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
      autoscaleInfoProvider: (
        original: () => { priceRange: { minValue: number; maxValue: number } | null } | null
      ) => {
        const res = original();
        const sig = latestSignalRef.current;
        if (res && res.priceRange && sig && showOverlayRef.current) {
          const minVal = Math.min(
            res.priceRange.minValue,
            sig.entryPrice,
            sig.stopLoss,
            sig.takeProfit1,
            sig.takeProfit2
          );
          const maxVal = Math.max(
            res.priceRange.maxValue,
            sig.entryPrice,
            sig.stopLoss,
            sig.takeProfit1,
            sig.takeProfit2
          );
          const pad = (maxVal - minVal) * 0.05;
          return {
            priceRange: {
              minValue: minVal - pad,
              maxValue: maxVal + pad,
            },
          };
        }
        return res;
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#2563eb',
      topColor: 'rgba(37, 99, 235, 0.22)',
      bottomColor: 'rgba(37, 99, 235, 0.0)',
      lineWidth: 2,
      visible: false,
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: '#2563eb',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'EMA 20 (Al Brooks)',
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    // Resistance (Black solid) & Support (Dashed green) Trendline Series
    const resistanceSeries = chart.addSeries(LineSeries, {
      color: '#000000',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'خط روند مقاومت (سقف)',
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const supportSeries = chart.addSeries(LineSeries, {
      color: '#000000',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'خط روند حمایت (کف)',
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Wedge (کنج سعودی / نزولی) Upper & Lower Trendline Series
    const wedgeUpperSeries = chart.addSeries(LineSeries, {
      color: '#7c3aed',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'خط سقف کنج',
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    const wedgeLowerSeries = chart.addSeries(LineSeries, {
      color: '#7c3aed',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'خط کف کنج',
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    const markersPlugin = createSeriesMarkers(candleSeries, []);

    tvChartRef.current = chart;
    tvCandleSeriesRef.current = candleSeries;
    tvAreaSeriesRef.current = areaSeries;
    tvEmaSeriesRef.current = emaSeries;
    tvResistanceSeriesRef.current = resistanceSeries;
    tvSupportSeriesRef.current = supportSeries;
    tvWedgeUpperSeriesRef.current = wedgeUpperSeries;
    tvWedgeLowerSeriesRef.current = wedgeLowerSeries;
    tvMarkersPluginRef.current = markersPlugin;

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        setHoveredCandle(null);
        return;
      }
      const tsMs = Number(param.time) * 1000;
      const found = candles.find((c) => Math.abs(c.time - tsMs) < 500);
      if (found) {
        setHoveredCandle(found);
      }
    });

    chart.subscribeClick((param) => {
      if (!param || !param.time) return;
      const clickedSec = Number(param.time);
      setFiveMethodsAnalysis((currentAnalysis) => {
        if (!currentAnalysis) return currentAnalysis;
        const matched = currentAnalysis.annotations.markers.find(
          (m) => Math.abs(Math.floor(m.time / 1000) - clickedSec) <= 1
        );
        if (matched) {
          setSelectedChartMarker(matched);
          setSelectedMethodCard(matched.methodId);
        }
        return currentAnalysis;
      });
    });

    const handleResize = () => {
      if (tvContainerRef.current && tvChartRef.current) {
        tvChartRef.current.applyOptions({
          width: tvContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      tvPriceLinesRef.current = [];
      tvMarkersPluginRef.current = null;
      tvCandleSeriesRef.current = null;
      tvAreaSeriesRef.current = null;
      tvEmaSeriesRef.current = null;
      tvResistanceSeriesRef.current = null;
      tvSupportSeriesRef.current = null;
      tvWedgeUpperSeriesRef.current = null;
      tvWedgeLowerSeriesRef.current = null;
      chart.remove();
      tvChartRef.current = null;
    };
  }, [engineMode]);

  // Update TradingView Data, Trendlines, and Markers based on independent toggles
  useEffect(() => {
    if (engineMode !== 'tradingview_canvas') return;
    const candleSeries = tvCandleSeriesRef.current;
    const areaSeries = tvAreaSeriesRef.current;
    const emaSeries = tvEmaSeriesRef.current;
    const resistanceSeries = tvResistanceSeriesRef.current;
    const supportSeries = tvSupportSeriesRef.current;
    const wedgeUpperSeries = tvWedgeUpperSeriesRef.current;
    const wedgeLowerSeries = tvWedgeLowerSeriesRef.current;
    const markersPlugin = tvMarkersPluginRef.current;
    const chart = tvChartRef.current;

    if (
      !candleSeries ||
      !areaSeries ||
      !emaSeries ||
      !resistanceSeries ||
      !supportSeries ||
      !wedgeUpperSeries ||
      !wedgeLowerSeries ||
      !chart
    )
      return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const tvCandles = sorted.map((c) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const tvAreaData = sorted.map((c) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      value: c.close,
    }));

    const tvEmaData: { time: UTCTimestamp; value: number }[] = [];
    if (sorted.length > 0) {
      const k = 2 / (20 + 1);
      let ema = sorted[0].close;
      for (let i = 0; i < sorted.length; i++) {
        ema = i === 0 ? sorted[0].close : sorted[i].close * k + ema * (1 - k);
        tvEmaData.push({
          time: Math.floor(sorted[i].time / 1000) as UTCTimestamp,
          value: ema,
        });
      }
    }

    candleSeries.applyOptions({ visible: visualType === 'candlestick' });
    areaSeries.applyOptions({ visible: visualType === 'area' });

    candleSeries.setData(tvCandles);
    areaSeries.setData(tvAreaData);
    emaSeries.setData(showEma ? tvEmaData : []);

    const validSignal =
      signal && signal.symbol.toUpperCase() === activeSymbol ? signal : null;
    const validSignal2 =
      signal2 && signal2.symbol.toUpperCase() === activeSymbol ? signal2 : null;

    // Resistance Trendline (سقف) independent toggle
    if (validSignal?.trendlines && showResistance && sorted.length > 0) {
      const resData = validSignal.trendlines.resistance;
      const rStartCandle = sorted[resData.startIndex] || sorted[0];
      const rEndCandle = sorted[resData.endIndex] || sorted[sorted.length - 1];
      resistanceSeries.setData([
        { time: Math.floor(rStartCandle.time / 1000) as UTCTimestamp, value: resData.startPrice },
        { time: Math.floor(rEndCandle.time / 1000) as UTCTimestamp, value: resData.endPrice },
      ]);
    } else {
      resistanceSeries.setData([]);
    }

    // Support Trendline (کف) independent toggle
    if (validSignal?.trendlines && showSupport && sorted.length > 0) {
      const supData = validSignal.trendlines.support;
      const sStartCandle = sorted[supData.startIndex] || sorted[0];
      const sEndCandle = sorted[supData.endIndex] || sorted[sorted.length - 1];
      supportSeries.setData([
        { time: Math.floor(sStartCandle.time / 1000) as UTCTimestamp, value: supData.startPrice },
        { time: Math.floor(sEndCandle.time / 1000) as UTCTimestamp, value: supData.endPrice },
      ]);
    } else {
      supportSeries.setData([]);
    }

    // Wedge (کنج سعودی / نزولی) Upper & Lower Trendlines on Chart
    if (validSignal2?.wedgeLines && showAlBrooks2 && sorted.length > 1) {
      const findClosestCandleTimeSec = (targetMs: number, fallbackIdx: number) => {
        let best = sorted[Math.max(0, Math.min(sorted.length - 1, fallbackIdx))];
        let minDiff = Math.abs(best.time - targetMs);
        for (const c of sorted) {
          const d = Math.abs(c.time - targetMs);
          if (d < minDiff) {
            minDiff = d;
            best = c;
          }
        }
        return Math.floor(best.time / 1000) as UTCTimestamp;
      };

      const uStartSec = findClosestCandleTimeSec(
        validSignal2.wedgeLines.upper.startTime,
        Math.max(0, sorted.length - 350)
      );
      let uEndSec = findClosestCandleTimeSec(
        validSignal2.wedgeLines.upper.endTime,
        sorted.length - 2
      );
      if (uEndSec <= uStartSec) {
        uEndSec = Math.floor(sorted[sorted.length - 1].time / 1000) as UTCTimestamp;
      }

      if (uEndSec > uStartSec) {
        wedgeUpperSeries.setData([
          { time: uStartSec, value: validSignal2.wedgeLines.upper.startPrice },
          { time: uEndSec, value: validSignal2.wedgeLines.upper.endPrice },
        ]);
      } else {
        wedgeUpperSeries.setData([]);
      }

      const lStartSec = findClosestCandleTimeSec(
        validSignal2.wedgeLines.lower.startTime,
        Math.max(0, sorted.length - 350)
      );
      let lEndSec = findClosestCandleTimeSec(
        validSignal2.wedgeLines.lower.endTime,
        sorted.length - 2
      );
      if (lEndSec <= lStartSec) {
        lEndSec = Math.floor(sorted[sorted.length - 1].time / 1000) as UTCTimestamp;
      }

      if (lEndSec > lStartSec) {
        wedgeLowerSeries.setData([
          { time: lStartSec, value: validSignal2.wedgeLines.lower.startPrice },
          { time: lEndSec, value: validSignal2.wedgeLines.lower.endPrice },
        ]);
      } else {
        wedgeLowerSeries.setData([]);
      }
    } else {
      wedgeUpperSeries.setData([]);
      wedgeLowerSeries.setData([]);
    }

    // Clear previous price lines
    for (const pl of tvPriceLinesRef.current) {
      try {
        candleSeries.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    tvPriceLinesRef.current = [];

    // Build combined markers & price lines from active Method Card or Best Setup + H1/H2/L1/L2 + Pivots + Breakouts
    const activeSig = showSignalOverlay ? validSignal : null;
    const focusedTrade =
      selectedMethodCard && fiveMethodsAnalysis
        ? selectedMethodCard === 'trend'
          ? fiveMethodsAnalysis.method1Trend.trade
          : selectedMethodCard === 'range'
          ? fiveMethodsAnalysis.method2Range.trade
          : selectedMethodCard === 'reversal'
          ? fiveMethodsAnalysis.method3Reversal.trade
          : selectedMethodCard === 'breakout'
          ? fiveMethodsAnalysis.method4Breakout.trade
          : selectedMethodCard === 'pullback'
          ? fiveMethodsAnalysis.method5Pullback.trade
          : fiveMethodsAnalysis.method6Summary.trade
        : fiveMethodsAnalysis?.method6Summary.trade;

    if (markersPlugin) {
      const tvMarkersList: Array<{
        time: UTCTimestamp;
        position: 'aboveBar' | 'belowBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
        text: string;
        size?: number;
      }> = [];

      if (showSignalOverlay && fiveMethodsAnalysis && sorted.length > 0) {
        for (const m of fiveMethodsAnalysis.annotations.markers) {
          if (selectedMethodCard && selectedMethodCard !== 'summary' && m.methodId !== selectedMethodCard) {
            continue;
          }
          const cRef = sorted[Math.min(sorted.length - 1, Math.max(0, m.candleIndex))];
          if (!cRef) continue;
          tvMarkersList.push({
            time: Math.floor(cRef.time / 1000) as UTCTimestamp,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.label,
            size: m.category === 'ENTRY_LONG' || m.category === 'ENTRY_SHORT' ? 2 : 1,
          });
        }
      } else if (activeSig && sorted.length > 0) {
        const sigIdx = Math.min(
          sorted.length - 1,
          Math.max(0, activeSig.signalCandleIndex ?? sorted.length - 1)
        );
        const sigCandle = sorted[sigIdx] || sorted[sorted.length - 1];
        const sigTimeSec = Math.floor(sigCandle.time / 1000) as UTCTimestamp;
        const isLong = activeSig.direction === 'LONG';
        tvMarkersList.push({
          time: sigTimeSec,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? '#16a34a' : '#dc2626',
          shape: isLong ? 'arrowUp' : 'arrowDown',
          text: isLong
            ? `LONG @ $${formatPrice(activeSig.entryPrice)}`
            : `SHORT @ $${formatPrice(activeSig.entryPrice)}`,
          size: 2,
        });
      }

      // Lightweight charts requires markers sorted ascending by time
      tvMarkersList.sort((a, b) => Number(a.time) - Number(b.time));
      markersPlugin.setMarkers(tvMarkersList);
    }

    const linesToRegister: IPriceLine[] = [];

    // Draw Trading Range Top, Bottom, and Midline if Trading Range is active or Card 2 is selected
    if (
      showSignalOverlay &&
      fiveMethodsAnalysis &&
      (fiveMethodsAnalysis.method2Range.isTradingRange || selectedMethodCard === 'range')
    ) {
      linesToRegister.push(
        candleSeries.createPriceLine({
          price: fiveMethodsAnalysis.method2Range.rangeTop,
          color: '#475569',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'سقف رنج (Range High)',
        }),
        candleSeries.createPriceLine({
          price: fiveMethodsAnalysis.method2Range.rangeMidline,
          color: '#94a3b8',
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: 'خط میانی رنج (Midline)',
        }),
        candleSeries.createPriceLine({
          price: fiveMethodsAnalysis.method2Range.rangeBottom,
          color: '#475569',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'کف رنج (Range Low)',
        })
      );
    }

    // Draw Entry, Stop Loss, TP1, TP2, TP3, and Invalidation Level from focused Al Brooks setup (or fallback signal)
    if (showSignalOverlay && focusedTrade && focusedTrade.direction !== 'NO TRADE') {
      linesToRegister.push(
        candleSeries.createPriceLine({
          price: focusedTrade.entryPrice,
          color: '#2563eb',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🎯 ENTRY (${focusedTrade.direction})`,
        }),
        candleSeries.createPriceLine({
          price: focusedTrade.stopLoss,
          color: '#dc2626',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '🛑 STOP LOSS (حد ضرر)',
        }),
        candleSeries.createPriceLine({
          price: focusedTrade.invalidationPrice,
          color: '#991b1b',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '⚠️ سطح ابطال سناریو',
        }),
        candleSeries.createPriceLine({
          price: focusedTrade.takeProfit1,
          color: '#16a34a',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '✅ TP1',
        }),
        candleSeries.createPriceLine({
          price: focusedTrade.takeProfit2,
          color: '#15803d',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: '✅ TP2',
        })
      );
    } else if (activeSig && sorted.length > 0 && !fiveMethodsAnalysis) {
      linesToRegister.push(
        candleSeries.createPriceLine({
          price: activeSig.entryPrice,
          color: '#2563eb',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🎯 ENTRY (${activeSig.direction === 'LONG' ? 'خرید' : 'فروش'})`,
        }),
        candleSeries.createPriceLine({
          price: activeSig.stopLoss,
          color: '#dc2626',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '🛑 STOP LOSS (حد ضرر)',
        }),
        candleSeries.createPriceLine({
          price: activeSig.takeProfit1,
          color: '#16a34a',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '✅ TP1 (حد سود ۱)',
        }),
        candleSeries.createPriceLine({
          price: activeSig.takeProfit2,
          color: '#15803d',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: '✅ TP2 (Measured Move)',
        })
      );
    }

    tvPriceLinesRef.current = linesToRegister;

    chart.timeScale().fitContent();
  }, [
    candles,
    signal,
    signal2,
    fiveMethodsAnalysis,
    selectedMethodCard,
    showSignalOverlay,
    showAlBrooks2,
    showResistance,
    showSupport,
    showEma,
    activeSymbol,
    visualType,
    engineMode,
  ]);

  const handleManualAnalyze = () => {
    if (engineMode === 'tradingview_iframe') {
      setEngineMode('tradingview_canvas');
    }
    setVisualType('candlestick');
    void runAlBrooksAnalysis(activeSymbol, interval, candles);
  };

  const handleCopySignalText = () => {
    if (!signal) return;
    const text = [
      `📊 سیگنال هوش مصنوعی پرایس اکشن البروکس (${signal.symbol} - ${candleLimit} کندل ${interval.toUpperCase()})`,
      `جهت معامله: ${signal.direction === 'LONG' ? '🟢 خرید (LONG)' : '🔴 فروش (SHORT)'}`,
      `وضعیت بازار: ${signal.alwaysInState}`,
      `فاز چرخه بازار: ${signal.marketCycle}`,
      `ستاپ البروکس: ${signal.setupName}`,
      `🎯 نقطه ورود (Entry): $${formatPrice(signal.entryPrice)}`,
      `🛑 حد ضرر (Stop Loss): $${formatPrice(signal.stopLoss)}`,
      `✅ حد سود ۱ (TP1): $${formatPrice(signal.takeProfit1)}`,
      `✅ حد سود ۲ (TP2 Measured Move): $${formatPrice(signal.takeProfit2)}`,
      `⚖️ ریسک به ریوارد: ${signal.riskRewardRatio} | احتمال موفقیت: ${signal.winProbability}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedSignal(true);
    setTimeout(() => setCopiedSignal(false), 2000);
  };

  const handleCopySignal2Text = () => {
    if (!signal2) return;
    const text = [
      `📐 تحلیل سبک «${signal2.styleName}» — الگوی کنج (Falling / Rising Wedge) و پرایس اکشن`,
      `ارز: ${signal2.symbol} | بازار: ${signal2.marketType} | تایم‌فریم: ${signal2.interval.toUpperCase()} (${signal2.candlesAnalyzed} کندل بسته‌شده آخر)`,
      `نوع الگو: ${signal2.patternType}`,
      `وضعیت الگو: ${signal2.patternStatus}`,
      `قدرت سیگنال: ${signal2.signalStrength}`,
      `سقف الگو: $${formatPrice(signal2.patternHigh)} | کف الگو: $${formatPrice(signal2.patternLow)}`,
      `قیمت سطح شکست: $${formatPrice(signal2.breakoutPrice)} | بسته‌شدن کندل تأیید: ${
        signal2.confirmationClosePrice ? `$${formatPrice(signal2.confirmationClosePrice)}` : 'هنوز تثبیت نشده'
      }`,
      `🎯 نقطه ورود احتمالی (${signal2.scenarioDirection}): $${formatPrice(signal2.entryPrice)}`,
      `🛑 حد ضرر ساختاری: $${formatPrice(signal2.stopLoss)}`,
      `✅ هدف سود اول (TP1): $${formatPrice(signal2.takeProfit1)} | هدف سود دوم (TP2): $${formatPrice(signal2.takeProfit2)}`,
      `⚖️ نسبت سود به زیان (R/R): ${signal2.riskRewardRatio}`,
      `⚠️ شرایط ابطال سناریو: ${signal2.invalidationCondition}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedSignal2(true);
    setTimeout(() => setCopiedSignal2(false), 2000);
  };

  const updatedWedgePrompt400 = `با استفاده از داده‌های واقعی بازار Binance Spot، ارزهای دیجیتال را از نظر تشکیل الگوی Falling Wedge (کنج نزولی) و Rising Wedge (کنج صعودی) بررسی کن.

۱. جمع‌آوری داده‌ها
- کندل‌های ۴۰۰ کندل آخر را بررسی کن.
- تایم‌فریم‌های ۱۵ دقیقه، ۱ ساعته و ۴ ساعته را تحلیل کن.
- قیمت‌های Open، High، Low، Close و Volume را دریافت کن.
- فقط از داده‌های واقعی Binance استفاده کن؛ هیچ داده‌ای را حدس نزن.

۲. شناسایی الگوی کنج
- نقاط Swing High و Swing Low معتبر را در بازه ۴۰۰ کندل پیدا کن.
- خط روند بالایی و پایینی را بر اساس حداقل دو نقطه معتبر رسم و شیب آن‌ها را محاسبه کن.
- برای Falling Wedge بررسی کن که هر دو خط نزولی باشند و خط بالایی سریع‌تر از خط پایینی پایین بیاید و خطوط به یکدیگر نزدیک شوند.
- برای Rising Wedge بررسی کن که هر دو خط صعودی باشند و خط پایینی سریع‌تر از خط بالایی بالا بیاید و خطوط به یکدیگر نزدیک شوند.
- حداقل ۳ برخورد معتبر به خطوط روند را ترجیح بده؛ برخوردها را با تلورانس متناسب با نوسان ارز ارزیابی کن.
- کنج واقعی را از کانال، مثلث متقارن و حرکت تصادفی قیمت تفکیک کن.
- اگر الگو ناقص یا نامعتبر است، صریحاً اعلام کن.

۳. تأیید پرایس اکشن به سبک Al Brooks
- ساختار روند قبل از الگو و قدرت حرکت قیمت را در بازه ۴۰۰ کندل بررسی کن.
- شکست خط روند، شکست سقف یا کف الگو و بسته‌شدن کندل بیرون از محدوده را ارزیابی کن.
- پولبک بعد از شکست و احتمال شکست ناموفق (Failed Breakout) را بررسی کن.
- کندل سیگنال، کندل ورود، فشار خرید و فروش و نسبت قدرت خریداران به فروشندگان را از روی رفتار قیمت ارزیابی کن.
- صرفاً لمس خط روند یا تشکیل ظاهری کنج را سیگنال ورود محسوب نکن.

۴. تعیین سناریوی معامله
برای هر الگوی معتبر مشخص کن:
- نام ارز و جفت معاملاتی
- بازار Spot یا Futures
- تایم‌فریم
- نوع الگو و وضعیت آن: در حال تشکیل، تأییدشده یا شکست‌خورده
- قیمت سقف و کف الگو
- قیمت شکست و قیمت بسته‌شدن کندل تأیید
- نقطه ورود احتمالی
- حد ضرر بر اساس ساختار قیمت
- اهداف سود اول و دوم
- نسبت سود به زیان (Risk/Reward)
- شرایط ابطال سناریو
- قدرت سیگنال و دلایل موافق و مخالف

۵. قوانین جلوگیری از سیگنال اشتباه
- کندل باز را با کندل بسته‌شده اشتباه نگیر.
- شکست تأییدنشده را ورود قطعی اعلام نکن.
- برای کنج نزولی، سناریوی صعودی را بررسی کن؛ برای کنج صعودی، سناریوی نزولی را.
- جهت الگو به‌تنهایی تضمین‌کننده جهت شکست نیست؛ هر دو سناریوی شکست بالا و پایین را در نظر بگیر.
- از داده‌های آینده برای تشخیص الگو در گذشته استفاده نکن.
- اگر تأیید کافی وجود ندارد، نتیجه را «بدون سیگنال معتبر» اعلام کن.

خروجی نهایی: نتایج را بر اساس کیفیت الگو و تأیید پرایس اکشن در بازه ۴۰۰ کندل رتبه‌بندی کن. در پایان مشخص کن کدام ارزها در آستانه شکست هستند، کدام‌ها شکست تأییدشده دارند و کدام‌ها هنوز شرایط ورود ندارند. اگر داده کافی در دسترس نیست، محدودیت را اعلام کن و از ساختن قیمت یا سیگنال خودداری کن.`;

  const handleCopyWedgePrompt = () => {
    navigator.clipboard.writeText(updatedWedgePrompt400);
    setCopiedWedgePrompt(true);
    setTimeout(() => setCopiedWedgePrompt(false), 2000);
  };

  const displayCandle = hoveredCandle || candles[candles.length - 1] || null;

  // SVG Mode variables
  const svgWidth = 960;
  const svgHeight = 380;
  const padTop = 26;
  const padBottom = 34;
  const padLeft = 18;
  const padRight = 135;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const candleLowMin = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : 0;
  const candleHighMax = candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : 100;

  let minPrice = candleLowMin;
  let maxPrice = candleHighMax;

  if (signal && showSignalOverlay && signal.symbol.toUpperCase() === activeSymbol) {
    minPrice = Math.min(
      candleLowMin,
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit1,
      signal.takeProfit2
    );
    maxPrice = Math.max(
      candleHighMax,
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit1,
      signal.takeProfit2
    );
  }

  const rawSpan = Math.max(maxPrice - minPrice, maxPrice * 0.001, 0.00001);
  minPrice -= rawSpan * 0.06;
  maxPrice += rawSpan * 0.06;
  const priceRange = Math.max(maxPrice - minPrice, 0.00001);

  const getY = (price: number) => {
    const clamped = Math.max(minPrice, Math.min(maxPrice, price));
    return padTop + plotH - ((clamped - minPrice) / priceRange) * plotH;
  };

  const getX = (index: number) => {
    if (candles.length <= 1) return padLeft + plotW / 2;
    return padLeft + (index / (candles.length - 1)) * plotW;
  };

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const val = minPrice + ratio * priceRange;
    return { val, y: getY(val) };
  });

  const linePoints = candles.map((c, idx) => `${getX(idx)},${getY(c.close)}`).join(' ');
  const emaPolylinePoints = ema20Points.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' ');
  const areaPoints =
    candles.length > 1
      ? `${getX(0)},${padTop + plotH} ${linePoints} ${getX(candles.length - 1)},${padTop + plotH}`
      : '';

  const isOverallPositive =
    candles.length > 1 ? candles[candles.length - 1].close >= candles[0].open : true;

  const activeSignalOnChart =
    signal && showSignalOverlay && signal.symbol.toUpperCase() === activeSymbol ? signal : null;

  const sigIdx =
    activeSignalOnChart && candles.length > 0
      ? Math.min(candles.length - 1, Math.max(0, activeSignalOnChart.signalCandleIndex))
      : -1;

  const tvIntervalMap: Record<TimeInterval, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
  };
  const tvIframeUrl = `https://s.tradingview.com/widgetembed/?symbol=BINANCE%3A${encodeURIComponent(
    activeSymbol
  )}&interval=${tvIntervalMap[interval]}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=f8fafc&studies=%5B%5D&theme=light&style=1&timezone=Asia%2FTehran&withdateranges=1&locale=en`;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Top Toolbar: Symbol Selector + Candle Limit + Independent Toggles + Al Brooks AI Button */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              تحلیل پرایس اکشن البروکس روی {candleLimit} کندل آخر
            </h3>
          </div>

          {/* Symbol Dropdown */}
          <select
            value={activeSymbol}
            onChange={(e) => onSelectSymbol(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600 font-mono-tabular cursor-pointer"
          >
            {symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.label}
              </option>
            ))}
          </select>

          {/* Candle Limit Switcher: 200 vs 400 */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setCandleLimit(200)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                candleLimit === 200 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              ۲۰۰ کندل
            </button>
            <button
              type="button"
              onClick={() => setCandleLimit(400)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                candleLimit === 400 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              ۴۰۰ کندل
            </button>
          </div>

          {/* Independent Toggle Buttons for Resistance (سقف), Support (کف), and Al Brooks Signals */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowResistance(!showResistance)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                showResistance
                  ? 'bg-black text-white border-black'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {showResistance ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
              <span>سقف (Resistance)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSupport(!showSupport)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                showSupport
                  ? 'bg-black text-white border-black'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {showSupport ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
              <span>کف (Support)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSignalOverlay(!showSignalOverlay)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                showSignalOverlay
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {showSignalOverlay ? <ToggleRight className="w-4 h-4 text-emerald-300" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
              <span>سیگنال البروکس</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAlBrooks2(!showAlBrooks2)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                showAlBrooks2
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {showAlBrooks2 ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
              <span>کنج سعودی / نزولی</span>
            </button>

            <button
              type="button"
              onClick={() => setShowEma(!showEma)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                showEma
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {showEma ? <ToggleRight className="w-4 h-4 text-emerald-300" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
              <span>EMA 20</span>
            </button>
          </div>

          {/* Primary Action */}
          <button
            type="button"
            onClick={handleManualAnalyze}
            disabled={analyzingSignal || loading}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${analyzingSignal ? 'animate-spin' : ''}`} />
            <span>
              {analyzingSignal ? 'در حال تحلیل کندل‌ها...' : 'بروزرسانی تحلیل'}
            </span>
          </button>
        </div>

        {/* Timeframe & Engine Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setEngineMode('tradingview_canvas')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                engineMode === 'tradingview_canvas'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>TradingView</span>
            </button>
            <button
              type="button"
              onClick={() => setEngineMode('binance_svg')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                engineMode === 'binance_svg'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <span>SVG</span>
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {INTERVAL_OPTIONS.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setIntervalState(tf.id)}
                className={`px-2.5 py-1 text-xs font-mono-tabular font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  interval === tf.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            title="بروزرسانی کندل‌ها"
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || analyzingSignal ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* OHLCV & EMA20 Legend Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">
              {activeSymbolObj ? activeSymbolObj.label : activeSymbol}
            </span>
            <span className="text-slate-400 font-mono-tabular">({activeSymbol})</span>
            <span aria-hidden="true">·</span>
            <span className="text-blue-600 font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{candleLimit} کندل ({interval.toUpperCase()})</span>
            </span>
            {showEma && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-blue-700 font-mono-tabular font-semibold">
                  ── EMA 20: $
                  {ema20Points.length > 0 ? formatPrice(ema20Points[ema20Points.length - 1]) : '...'}
                </span>
              </>
            )}
            {signal && signal.symbol.toUpperCase() === activeSymbol && signal.trendlines && (
              <>
                {showResistance && (
                  <span className="text-black font-semibold">
                    ⬛ سقف (Resistance): ${formatPrice(signal.trendlines.resistance.endPrice)}
                  </span>
                )}
                {showSupport && (
                  <span className="text-black font-semibold">
                    ⬛ کف (Support): ${formatPrice(signal.trendlines.support.endPrice)}
                  </span>
                )}
              </>
            )}
            {signal2 &&
              signal2.symbol.toUpperCase() === activeSymbol &&
              signal2.wedgeLines &&
              showAlBrooks2 && (
                <span className="text-purple-700 font-semibold">
                  🟪 خطوط کنج سعودی / نزولی: سقف ${formatPrice(signal2.wedgeLines.upper.endPrice)} · کف $
                  {formatPrice(signal2.wedgeLines.lower.endPrice)}
                </span>
              )}
          </div>

          {displayCandle && (
            <div className="flex flex-wrap items-center gap-4 font-mono-tabular text-xs">
              <div>
                <span className="text-slate-400 mr-1">O:</span>
                <span className="font-semibold text-slate-800">
                  ${formatPrice(displayCandle.open)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 mr-1">H:</span>
                <span className="font-semibold text-emerald-600">
                  ${formatPrice(displayCandle.high)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 mr-1">L:</span>
                <span className="font-semibold text-red-600">
                  ${formatPrice(displayCandle.low)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 mr-1">C:</span>
                <span
                  className={`font-bold ${
                    displayCandle.close >= displayCandle.open
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}
                >
                  ${formatPrice(displayCandle.close)}
                </span>
              </div>
            </div>
          )}
        </div>

        {signalError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {signalError}
          </div>
        )}

        {/* MODE 1: TradingView Canvas */}
        {engineMode === 'tradingview_canvas' && (
          <div className="relative w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div
              dir="ltr"
              className="absolute top-3 left-3 z-10 pointer-events-none bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg px-3 py-2 space-y-1 shadow-xs"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 font-mono-tabular">
                <span>BINANCE:{activeSymbol}</span>
                <span className="text-slate-400">·</span>
                <span className="text-blue-600">{interval.toUpperCase()}</span>
                <span className="text-slate-400">·</span>
                <span className="text-emerald-600">{candleLimit} کندل</span>
              </div>
            </div>

            {loading && candles.length === 0 && (
              <div className="absolute inset-0 z-20 bg-white/80 flex items-center justify-center text-xs text-slate-500">
                در حال بارگذاری کندل‌ها و رسم خطوط روند...
              </div>
            )}

            <div ref={tvContainerRef} className="w-full h-[430px]" dir="ltr" />
          </div>
        )}

        {/* MODE 2: Binance SVG Chart */}
        {engineMode === 'binance_svg' && (
          <>
            {loading && candles.length === 0 ? (
              <div className="h-[380px] flex items-center justify-center text-xs text-slate-400">
                در حال دریافت {candleLimit} کندل آخر {activeSymbol}...
              </div>
            ) : candles.length === 0 ? (
              <div className="h-[380px] flex flex-col items-center justify-center text-center space-y-2">
                <Layers className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">
                  داده‌ای برای نماد {activeSymbol} یافت نشد
                </p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto border border-slate-100 rounded-xl bg-slate-50/40 p-2">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-[380px] select-none"
                  onMouseLeave={() => setHoveredCandle(null)}
                >
                  <defs>
                    <linearGradient id="areaFillGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={isOverallPositive ? '#16a34a' : '#dc2626'}
                        stopOpacity="0.22"
                      />
                      <stop
                        offset="100%"
                        stopColor={isOverallPositive ? '#16a34a' : '#dc2626'}
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                  </defs>

                  {gridTicks.map((t, i) => (
                    <g key={i}>
                      <line
                        x1={padLeft}
                        y1={t.y}
                        x2={svgWidth - padRight}
                        y2={t.y}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                      <text
                        x={svgWidth - padRight + 8}
                        y={t.y + 4}
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        ${formatPrice(t.val)}
                      </text>
                    </g>
                  ))}

                  {/* SVG Independent Resistance & Support Trendlines */}
                  {signal?.trendlines && (
                    <g>
                      {showResistance && (
                        <line
                          x1={getX(signal.trendlines.resistance.startIndex)}
                          y1={getY(signal.trendlines.resistance.startPrice)}
                          x2={getX(signal.trendlines.resistance.endIndex)}
                          y2={getY(signal.trendlines.resistance.endPrice)}
                          stroke="#000000"
                          strokeWidth="2"
                        />
                      )}
                      {showSupport && (
                        <line
                          x1={getX(signal.trendlines.support.startIndex)}
                          y1={getY(signal.trendlines.support.startPrice)}
                          x2={getX(signal.trendlines.support.endIndex)}
                          y2={getY(signal.trendlines.support.endPrice)}
                          stroke="#000000"
                          strokeWidth="2"
                        />
                      )}
                    </g>
                  )}

                  {/* SVG Wedge (کنج سعودی / نزولی) Upper & Lower Trendlines */}
                  {showAlBrooks2 &&
                    signal2?.wedgeLines &&
                    signal2.symbol.toUpperCase() === activeSymbol &&
                    candles.length > 1 && (() => {
                      const findIdxByTime = (targetMs: number, fallbackIdx: number) => {
                        let bestIdx = Math.max(0, Math.min(candles.length - 1, fallbackIdx));
                        let minDiff = Math.abs(candles[bestIdx].time - targetMs);
                        for (let i = 0; i < candles.length; i++) {
                          const d = Math.abs(candles[i].time - targetMs);
                          if (d < minDiff) {
                            minDiff = d;
                            bestIdx = i;
                          }
                        }
                        return bestIdx;
                      };
                      const uStartIdx = findIdxByTime(
                        signal2.wedgeLines.upper.startTime,
                        Math.max(0, candles.length - 350)
                      );
                      const uEndIdx = findIdxByTime(
                        signal2.wedgeLines.upper.endTime,
                        candles.length - 2
                      );
                      const lStartIdx = findIdxByTime(
                        signal2.wedgeLines.lower.startTime,
                        Math.max(0, candles.length - 350)
                      );
                      const lEndIdx = findIdxByTime(
                        signal2.wedgeLines.lower.endTime,
                        candles.length - 2
                      );

                      return (
                        <g>
                          <line
                            x1={getX(uStartIdx)}
                            y1={getY(signal2.wedgeLines.upper.startPrice)}
                            x2={getX(uEndIdx)}
                            y2={getY(signal2.wedgeLines.upper.endPrice)}
                            stroke="#7c3aed"
                            strokeWidth="2.5"
                          />
                          <line
                            x1={getX(lStartIdx)}
                            y1={getY(signal2.wedgeLines.lower.startPrice)}
                            x2={getX(lEndIdx)}
                            y2={getY(signal2.wedgeLines.lower.endPrice)}
                            stroke="#7c3aed"
                            strokeWidth="2.5"
                          />
                        </g>
                      );
                    })()}

                  {visualType === 'area' && candles.length > 1 && (
                    <>
                      <polygon points={areaPoints} fill="url(#areaFillGrad)" />
                      <polyline
                        fill="none"
                        stroke={isOverallPositive ? '#16a34a' : '#dc2626'}
                        strokeWidth="2"
                        points={linePoints}
                      />
                    </>
                  )}

                  {showEma && ema20Points.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1.8"
                      points={emaPolylinePoints}
                    />
                  )}

                  {candles.map((c, idx) => {
                    const x = getX(idx);
                    const openY = getY(c.open);
                    const closeY = getY(c.close);
                    const highY = getY(c.high);
                    const lowY = getY(c.low);
                    const isBull = c.close >= c.open;
                    const color = isBull ? '#16a34a' : '#dc2626';
                    const candleWidth = Math.max(3, Math.min(10, plotW / candles.length - 2));
                    const bodyTop = Math.min(openY, closeY);
                    const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
                    const isHovered = hoveredCandle?.time === c.time;
                    const isSignalCandle =
                      activeSignalOnChart && showSignalOverlay && idx === sigIdx;

                    return (
                      <g
                        key={c.time}
                        onMouseEnter={() => setHoveredCandle(c)}
                        className="cursor-crosshair"
                      >
                        {isSignalCandle && (
                          <line
                            x1={x}
                            y1={padTop}
                            x2={x}
                            y2={padTop + plotH}
                            stroke="#2563eb"
                            strokeDasharray="4 2"
                            strokeWidth="1.5"
                          />
                        )}

                        {isHovered && (
                          <line
                            x1={x}
                            y1={padTop}
                            x2={x}
                            y2={padTop + plotH}
                            stroke="#64748b"
                            strokeDasharray="2 2"
                            strokeWidth="1"
                          />
                        )}

                        {visualType === 'candlestick' ? (
                          <>
                            <line
                              x1={x}
                              y1={highY}
                              x2={x}
                              y2={lowY}
                              stroke={color}
                              strokeWidth={isSignalCandle ? '2' : '1'}
                            />
                            <rect
                              x={x - candleWidth / 2}
                              y={bodyTop}
                              width={candleWidth}
                              height={bodyHeight}
                              fill={color}
                              rx="1"
                            />
                          </>
                        ) : (
                          isHovered && (
                            <circle
                              cx={x}
                              cy={closeY}
                              r="4"
                              fill={isOverallPositive ? '#16a34a' : '#dc2626'}
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            />
                          )
                        )}

                        <rect
                          x={x - plotW / candles.length / 2}
                          y={padTop}
                          width={plotW / candles.length}
                          height={plotH}
                          fill="transparent"
                        />
                      </g>
                    );
                  })}

                  {/* SVG Overlays for 5 Al Brooks Methods: Range Box, Pullback Zone, and Clickable Markers */}
                  {showSignalOverlay && fiveMethodsAnalysis && candles.length > 1 && (
                    <g>
                      {/* Trading Range Top, Midline, Bottom */}
                      {fiveMethodsAnalysis.annotations.rangeBox && (
                        <>
                          <line
                            x1={getX(fiveMethodsAnalysis.annotations.rangeBox.startIndex)}
                            y1={getY(fiveMethodsAnalysis.annotations.rangeBox.top)}
                            x2={getX(fiveMethodsAnalysis.annotations.rangeBox.endIndex)}
                            y2={getY(fiveMethodsAnalysis.annotations.rangeBox.top)}
                            stroke="#475569"
                            strokeDasharray="4 4"
                            strokeWidth="1.2"
                          />
                          <line
                            x1={getX(fiveMethodsAnalysis.annotations.rangeBox.startIndex)}
                            y1={getY(fiveMethodsAnalysis.annotations.rangeBox.midline)}
                            x2={getX(fiveMethodsAnalysis.annotations.rangeBox.endIndex)}
                            y2={getY(fiveMethodsAnalysis.annotations.rangeBox.midline)}
                            stroke="#94a3b8"
                            strokeDasharray="2 3"
                            strokeWidth="1"
                          />
                          <line
                            x1={getX(fiveMethodsAnalysis.annotations.rangeBox.startIndex)}
                            y1={getY(fiveMethodsAnalysis.annotations.rangeBox.bottom)}
                            x2={getX(fiveMethodsAnalysis.annotations.rangeBox.endIndex)}
                            y2={getY(fiveMethodsAnalysis.annotations.rangeBox.bottom)}
                            stroke="#475569"
                            strokeDasharray="4 4"
                            strokeWidth="1.2"
                          />
                        </>
                      )}

                      {/* Pullback Highlight Zone */}
                      {fiveMethodsAnalysis.annotations.pullbackZones.map((pz, i) => {
                        const x1 = getX(pz.startIndex);
                        const x2 = getX(pz.endIndex);
                        const yTop = getY(pz.highPrice);
                        const yBot = getY(pz.lowPrice);
                        return (
                          <rect
                            key={`pz-${i}`}
                            x={Math.min(x1, x2)}
                            y={Math.min(yTop, yBot)}
                            width={Math.max(6, Math.abs(x2 - x1))}
                            height={Math.max(6, Math.abs(yBot - yTop))}
                            fill="rgba(2, 132, 199, 0.08)"
                            stroke="#0284c7"
                            strokeDasharray="3 2"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* Clickable Markers (H1, H2, L1, L2, HH/HL/LH/LL, Breakout, Entry) */}
                      {fiveMethodsAnalysis.annotations.markers.map((m) => {
                        const idx = Math.min(candles.length - 1, Math.max(0, m.candleIndex));
                        const mx = getX(idx);
                        const my = getY(m.price);
                        const offsetY = m.position === 'aboveBar' ? my - 12 : my + 14;
                        return (
                          <g
                            key={m.id}
                            onClick={() => {
                              setSelectedChartMarker(m);
                              setSelectedMethodCard(m.methodId);
                            }}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={mx}
                              cy={offsetY}
                              r="6"
                              fill={m.color}
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            />
                            <text
                              x={mx}
                              y={offsetY - 8}
                              textAnchor="middle"
                              fill={m.color}
                              fontSize="9"
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {m.label}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  )}
                </svg>
              </div>
            )}
          </>
        )}

        {/* Quick Interactive Marker Pills Bar (Click any marker to inspect its card & calculation details) */}
        {showSignalOverlay &&
          fiveMethodsAnalysis &&
          fiveMethodsAnalysis.annotations.markers.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-700 ml-1">
                نشانگرهای فعال روی چارت (برای مشاهده جزئیات محاسبات کلیک کنید):
              </span>
              {fiveMethodsAnalysis.annotations.markers.map((m) => {
                const isSelected = selectedChartMarker?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedChartMarker(m);
                      setSelectedMethodCard(m.methodId);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: isSelected ? '#ffffff' : m.color }}
                    />
                    <span>{m.label}</span>
                    <span className={isSelected ? 'text-blue-100' : 'text-slate-400'}>
                      (${formatPrice(m.price)})
                    </span>
                  </button>
                );
              })}
            </div>
          )}

        {/* Six Al Brooks Trading Methods + Best Setup & Market Summary Cards */}
        {showSignalOverlay && fiveMethodsAnalysis && (
          <AlBrooksSixCardsPanel
            analysis={fiveMethodsAnalysis}
            config={alBrooksConfig}
            onUpdateConfig={setAlBrooksConfig}
            selectedCardId={selectedMethodCard}
            onSelectCard={setSelectedMethodCard}
            selectedMarker={selectedChartMarker}
            onClearMarker={() => setSelectedChartMarker(null)}
            wsConnected={wsLiveConnected}
            lastUpdatedTimestamp={lastDataUpdateMs}
          />
        )}

        {/* Detailed Signal Card */}
        {signal && showSignalOverlay && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${
                      signal.direction === 'LONG' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {signal.direction === 'LONG' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span>
                      {signal.direction === 'LONG'
                        ? 'سیگنال ورود خرید (LONG)'
                        : 'سیگنال ورود فروش (SHORT)'}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-xs font-bold text-slate-900">{signal.setupName}</span>
                </div>

                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                  <span>کندل تحلیل شده: {signal.candlesAnalyzed}</span>
                  <span aria-hidden="true">·</span>
                  <span>فاز چرخه بازار: {signal.marketCycle}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopySignalText}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSignal ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>کپی شد</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>کپی متن سیگنال</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Entry, Stop Loss, TP1, TP2 Numeric Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>نقطه ورود (Entry)</span>
                </div>
                <div className="text-base font-extrabold text-slate-900 font-mono-tabular">
                  ${formatPrice(signal.entryPrice)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>حد ضرر (Stop Loss)</span>
                </div>
                <div className="text-base font-extrabold text-red-600 font-mono-tabular">
                  ${formatPrice(signal.stopLoss)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>حد سود اول (TP1)</span>
                </div>
                <div className="text-base font-extrabold text-emerald-600 font-mono-tabular">
                  ${formatPrice(signal.takeProfit1)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>حد سود دوم (TP2)</span>
                </div>
                <div className="text-base font-extrabold text-emerald-700 font-mono-tabular">
                  ${formatPrice(signal.takeProfit2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dedicated Separate Card for Style "کنج سعودی / نزولی" (Falling Wedge & Rising Wedge + Al Brooks Price Action) */}
        {signal2 && showAlBrooks2 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-5">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-900">
                    سبک کنج سعودی / نزولی
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-xs font-bold text-blue-700">
                    {signal2.patternType}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-extrabold ${
                      signal2.isValidSignal
                        ? signal2.scenarioDirection === 'LONG'
                          ? 'text-emerald-600'
                          : 'text-red-600'
                        : 'text-amber-700'
                    }`}
                  >
                    {signal2.scenarioDirection === 'LONG' ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>{signal2.patternStatus}</span>
                  </span>
                </div>

                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                  <span>جفت ارز: {signal2.symbol}</span>
                  <span aria-hidden="true">·</span>
                  <span>بازار: {signal2.marketType}</span>
                  <span aria-hidden="true">·</span>
                  <span>تایم‌فریم: {signal2.interval.toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span>کندل‌های بسته‌شده بررسی‌شده: {signal2.candlesAnalyzed} کندل</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-700">
                    قدرت سیگنال: {signal2.signalStrength}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowWedgePrompt(!showWedgePrompt)}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{showWedgePrompt ? 'بستن پرامپت (۴۰۰ کندل)' : 'مشاهده پرامپت اصلاح‌شده (۴۰۰ کندل)'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopySignal2Text}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSignal2 ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>کپی شد</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>کپی گزارش کنج سعودی / نزولی</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {showWedgePrompt && (
              <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-900">
                    متن پرامپت اصلاح‌شده سبک «کنج سعودی / نزولی» (بر اساس ۴۰۰ کندل آخر)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyWedgePrompt}
                    className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedWedgePrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>پرامپت کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>کپی پرامپت ۴۰۰ کندل</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans bg-slate-50 p-3.5 rounded-lg border border-slate-200 max-h-72 overflow-y-auto">
                  {updatedWedgePrompt400}
                </pre>
              </div>
            )}

            {/* Section 1: Wedge Structural Levels & Touches */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-slate-500">سقف الگو (Pattern High)</div>
                <div className="font-bold text-slate-900 font-mono-tabular">
                  ${formatPrice(signal2.patternHigh)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-slate-500">کف الگو (Pattern Low)</div>
                <div className="font-bold text-slate-900 font-mono-tabular">
                  ${formatPrice(signal2.patternLow)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-slate-500">قیمت سطح شکست</div>
                <div className="font-bold text-blue-700 font-mono-tabular">
                  ${formatPrice(signal2.breakoutPrice)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-slate-500">بسته‌شدن کندل تأیید</div>
                <div className="font-bold text-slate-900 font-mono-tabular">
                  {signal2.confirmationClosePrice
                    ? `$${formatPrice(signal2.confirmationClosePrice)}`
                    : 'بدون کندل تأیید'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-slate-500">برخوردهای معتبر</div>
                <div className="font-bold text-slate-900 font-mono-tabular">
                  {signal2.touchesCount.total} برخورد (سقف: {signal2.touchesCount.upper} / کف:{' '}
                  {signal2.touchesCount.lower})
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                <div className="text-slate-500">نسبت سود به زیان (R/R)</div>
                <div className="font-bold text-emerald-700 font-mono-tabular">
                  {signal2.riskRewardRatio}
                </div>
              </div>
            </div>

            {/* Section 2: Trade Scenario (Entry, Stop Loss, TP1, TP2) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>
                    نقطه ورود احتمالی ({signal2.scenarioDirection === 'LONG' ? 'صعودی' : 'نزولی'})
                  </span>
                </div>
                <div className="text-base font-extrabold text-slate-900 font-mono-tabular">
                  ${formatPrice(signal2.entryPrice)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>حد ضرر ساختاری (Stop Loss)</span>
                </div>
                <div className="text-base font-extrabold text-red-600 font-mono-tabular">
                  ${formatPrice(signal2.stopLoss)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>هدف سود اول (TP1)</span>
                </div>
                <div className="text-base font-extrabold text-emerald-600 font-mono-tabular">
                  ${formatPrice(signal2.takeProfit1)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>هدف سود دوم (TP2)</span>
                </div>
                <div className="text-base font-extrabold text-emerald-700 font-mono-tabular">
                  ${formatPrice(signal2.takeProfit2)}
                </div>
              </div>
            </div>

            {/* Section 3: Al Brooks Price Action Confirmation & Both Breakout Scenarios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h4 className="font-bold text-slate-900 text-xs">
                  تأیید پرایس اکشن به سبک Al Brooks (کنج سعودی / نزولی)
                </h4>
                <div className="space-y-1.5 text-slate-600 leading-relaxed">
                  <p>
                    <strong className="text-slate-900">روند قبل از الگو: </strong>
                    {signal2.alBrooksConfirmation.priorTrend}
                  </p>
                  <p>
                    <strong className="text-slate-900">کندل سیگنال: </strong>
                    {signal2.alBrooksConfirmation.signalBarAnalysis}
                  </p>
                  <p>
                    <strong className="text-slate-900">کندل ورود و شکست: </strong>
                    {signal2.alBrooksConfirmation.entryBarAnalysis}
                  </p>
                  <p>
                    <strong className="text-slate-900">پولبک و احتمال Failed Breakout: </strong>
                    {signal2.alBrooksConfirmation.pullbackAndFailedBreakout}
                  </p>
                  <p>
                    <strong className="text-slate-900">فشار خرید و فروش: </strong>
                    {signal2.alBrooksConfirmation.buyerSellerPressure}
                  </p>
                  <p className="text-red-700">
                    <strong>شرایط ابطال سناریو: </strong>
                    {signal2.invalidationCondition}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-xs">
                    دلایل موافق و مخالف و بررسی هر دو جهت شکست
                  </h4>
                  <p className="text-slate-600 leading-relaxed">
                    <strong className="text-emerald-700">سناریوی شکست رو به بالا: </strong>
                    {signal2.bothBreakoutScenarios.upsideBreakout}
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    <strong className="text-red-700">سناریوی شکست رو به پایین: </strong>
                    {signal2.bothBreakoutScenarios.downsideBreakout}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div className="space-y-1">
                    <div className="font-bold text-emerald-700">دلایل موافق:</div>
                    <ul className="space-y-1 text-slate-600 list-disc list-inside">
                      {signal2.prosReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <div className="font-bold text-red-700">دلایل مخالف / ریسک‌ها:</div>
                    <ul className="space-y-1 text-slate-600 list-disc list-inside">
                      {signal2.consReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Multi-Timeframe (15m, 1h, 4h) Ranking Table */}
            {signal2.multiTimeframeRanking && signal2.multiTimeframeRanking.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    رتبه‌بندی کیفیت الگو و تأیید پرایس اکشن در تایم‌فریم‌های 15m، 1h و 4h ({signal2.symbol})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    شیب سقف: {signal2.slopes.upperSlopePct} · شیب کف: {signal2.slopes.lowerSlopePct}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">رتبه</th>
                        <th className="py-2.5 px-3 font-semibold">تایم‌فریم</th>
                        <th className="py-2.5 px-3 font-semibold">کندل بسته</th>
                        <th className="py-2.5 px-3 font-semibold">نوع الگو</th>
                        <th className="py-2.5 px-3 font-semibold">وضعیت</th>
                        <th className="py-2.5 px-3 font-semibold">برخورد</th>
                        <th className="py-2.5 px-3 font-semibold">ورود احتمالی</th>
                        <th className="py-2.5 px-3 font-semibold">حد ضرر</th>
                        <th className="py-2.5 px-3 font-semibold">TP1 / TP2</th>
                        <th className="py-2.5 px-3 font-semibold">امتیاز کیفیت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono-tabular">
                      {signal2.multiTimeframeRanking.map((row) => (
                        <tr key={row.timeframe} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-bold text-slate-900">#{row.rank}</td>
                          <td className="py-2.5 px-3 font-bold text-blue-600">
                            {row.timeframe.toUpperCase()}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{row.candlesAnalyzed}</td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                            {row.patternType}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span
                              className={`font-bold ${
                                row.statusBucket === 'شکست تأییدشده'
                                  ? 'text-emerald-600'
                                  : row.statusBucket === 'در آستانه شکست'
                                  ? 'text-amber-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              {row.statusBucket}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{row.touchesTotal}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            ${formatPrice(row.entryPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-red-600">${formatPrice(row.stopLoss)}</td>
                          <td className="py-2.5 px-3 text-emerald-700">
                            ${formatPrice(row.takeProfit1)} / ${formatPrice(row.takeProfit2)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {row.qualityScore}/100
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 5: Final Categorization Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <div className="font-bold text-emerald-700">۱. دارای شکست تأییدشده</div>
                {signal2.finalCategorization.confirmedBreakout.length > 0 ? (
                  <ul className="space-y-1 text-slate-700">
                    {signal2.finalCategorization.confirmedBreakout.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">موردی با شکست تأییدشده در این لحظه یافت نشد.</p>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <div className="font-bold text-amber-700">۲. در آستانه شکست</div>
                {signal2.finalCategorization.nearBreakout.length > 0 ? (
                  <ul className="space-y-1 text-slate-700">
                    {signal2.finalCategorization.nearBreakout.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">موردی در آستانه شکست یافت نشد.</p>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <div className="font-bold text-slate-700">۳. هنوز شرایط ورود ندارند / بدون سیگنال معتبر</div>
                {signal2.finalCategorization.noEntryYet.length > 0 ? (
                  <ul className="space-y-1 text-slate-600">
                    {signal2.finalCategorization.noEntryYet.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
