/**
 * WEEX Trade Engine (ترید WEEX)
 * ---------------------------------------------------------------------------
 * Two execution modes on top of the official WEEX futures REST API:
 *
 *  • paper (پیش‌فرض) — سفارش‌ها روی قیمت لحظه‌ای واقعی WEEX شبیه‌سازی می‌شوند:
 *      - سفارش MARKET فوراً با آخرین قیمت پر می‌شود
 *      - سفارش LIMIT تا رسیدن قیمت به سطح ورود در حالت PENDING می‌ماند
 *      - TP1 بخشی از پوزیشن (پیش‌فرض ۵۰٪) را می‌بندد، TP2 و SL بقیه را
 *      - کارمزد تیکر روی هر دو سمت اعمال می‌شود و موجودی مجازی تغییر می‌کند
 *
 *  • live — سفارش واقعی روی صرافی WEEX ثبت می‌شود (کلید API + Secret +
 *      Passphrase)، و TP/SL به‌صورت سفارش‌های شرطی بومی صرافی
 *      (`/capi/v3/placeTpSlOrder`) قرار می‌گیرند.
 *
 * سطح ورود / حد ضرر / حد سود از سیگنال‌های تأییدشده (isQualified) گرفته
 * می‌شود؛ در صورت فعال بودن «معامله خودکار»، هر سیگنال تأییدشده بلافاصله
 * به این موتور تحویل داده می‌شود.
 */

import { dbRepo, IRegisteredSignal, IWeexPosition, IWeexSettings } from './models.js';
import { fetchPrices } from './tradeEngine.js';
import {
  WeexClient,
  WeexCredentials,
  WeexSymbolRules,
  WeexTicker,
  floorToPrecision,
  formatToPrecision,
  toNumber,
} from './weexClient.js';

const POLL_INTERVAL_MS = 15_000;
const PRICE_CACHE_MS = 8_000;
const SIGNAL_CACHE_MS = 30_000;
const SIGNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MIN_MARGIN_USD = 1;
const MAX_OPEN_POSITIONS = 20;

// ---------------------------------------------------------------------------
// Public types (shared with the REST layer + frontend)
// ---------------------------------------------------------------------------
export interface WeexOrderRequest {
  symbol: string;
  side: 'LONG' | 'SHORT';
  orderType: 'MARKET' | 'LIMIT';
  margin?: number;
  leverage?: number;
  quantity?: number;
  limitPrice?: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  signalId?: string;
  label?: string;
  cycleNumber?: number;
  aiEngineUsed?: string;
  averageScore?: number;
  note?: string;
  mode?: 'paper' | 'live';
}

export interface WeexPositionView extends IWeexPosition {
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  distanceToEntryPct: number;
  riskRewardRatio: string;
  isLiveOnExchange: boolean;
  exchangeUnrealizedPnl: number | null;
}

export interface WeexApprovedSignal extends IRegisteredSignal {
  alreadyTraded: boolean;
  distanceToEntryPct: number;
}

export interface WeexAccountStats {
  balance: number;
  initialBalance: number;
  equity: number;
  freeMargin: number;
  usedMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  netPnl: number;
  openPositions: number;
  pendingOrders: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalFees: number;
}

export interface WeexEngineState {
  isRunning: boolean;
  pollIntervalMs: number;
  lastTickAt: string | null;
  lastError: string | null;
  priceSource: 'weex' | 'binance' | 'none';
  lastTickSummary: { filled: number; tp1: number; tp2: number; stopped: number; synced: number };
}

export interface WeexSnapshot {
  settings: SafeWeexSettings;
  mode: 'paper' | 'live';
  stats: WeexAccountStats;
  positions: WeexPositionView[];
  history: WeexPositionView[];
  approvedSignals: WeexApprovedSignal[];
  live: {
    connected: boolean;
    error: string | null;
    balances: Array<{ asset: string; balance: number; availableBalance: number; unrealizePnl: number }>;
    exchangePositions: Array<{
      symbol: string;
      side: string;
      size: number;
      entryPrice: number;
      unrealizedPnl: number;
      leverage: number;
    }>;
    accountConfig: { canTrade: boolean; dualSidePosition: boolean } | null;
  };
  engine: WeexEngineState;
}

export interface SafeWeexSettings {
  mode: 'paper' | 'live';
  environment: 'production' | 'simulation';
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasPassphrase: boolean;
  maskedApiKey: string;
  leverage: number;
  marginPerTradePct: number;
  tp1ClosePct: number;
  autoTrade: boolean;
  pullbackOnly: boolean;
  feeRatePct: number;
  paperInitialBalance: number;
  paperBalance: number;
  lastTestStatus: 'success' | 'error' | 'untested';
  lastTestMessage: string;
  lastTestAt?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const round8 = (n: number) => Math.round((Number(n) || 0) * 1e8) / 1e8;

function pnlFor(side: 'LONG' | 'SHORT', entry: number, exit: number, qty: number): number {
  if (!entry || !exit || !qty) return 0;
  const raw = side === 'LONG' ? (exit - entry) * qty : (entry - exit) * qty;
  return round2(raw);
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function fallbackRules(symbol: string, price: number): WeexSymbolRules {
  const decimals = price >= 1000 ? 2 : price >= 1 ? 3 : price >= 0.01 ? 5 : 8;
  return {
    symbol,
    baseAsset: symbol.replace(/USDT$/, ''),
    quoteAsset: 'USDT',
    pricePrecision: decimals,
    quantityPrecision: price >= 1000 ? 3 : 0,
    minOrderSize: 0,
    contractVal: 1,
    minLeverage: 1,
    maxLeverage: 125,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  };
}

function isPullback(side: 'LONG' | 'SHORT', entry: number, price: number): boolean {
  return side === 'LONG' ? entry <= price : entry >= price;
}

function isImmediatelyFillable(
  side: 'LONG' | 'SHORT',
  entry: number,
  price: number
): boolean {
  // BUY limit below/at market, SELL limit above/at market
  return side === 'LONG' ? price <= entry : price >= entry;
}

function rrText(pos: IWeexPosition): string {
  const risk = Math.abs(pos.entryPrice - pos.stopLoss);
  const reward = Math.abs(pos.takeProfit1 - pos.entryPrice);
  if (!risk || !reward) return '—';
  return `1 : ${(reward / risk).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
class WeexEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private priceCache = new Map<string, number>();
  private priceCacheAt = 0;
  private rulesCache: Record<string, WeexSymbolRules> = {};
  private rulesCacheAt = 0;
  private approvedCache: IRegisteredSignal[] = [];
  private approvedCacheAt = 0;
  private state: WeexEngineState = {
    isRunning: false,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastTickAt: null,
    lastError: null,
    priceSource: 'none',
    lastTickSummary: { filled: 0, tp1: 0, tp2: 0, stopped: 0, synced: 0 },
  };

  public getState(): WeexEngineState {
    return { ...this.state, lastTickSummary: { ...this.state.lastTickSummary } };
  }

  public initialize(): void {
    if (this.timer) return;
    this.state.isRunning = true;
    setTimeout(() => void this.tick(), 8_000);
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    console.log(`[weex] engine started (paper/live poll ${POLL_INTERVAL_MS}ms)`);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.isRunning = false;
  }

  public toSafeSettings(settings: IWeexSettings): SafeWeexSettings {
    return {
      mode: settings.mode,
      environment: settings.environment,
      hasApiKey: Boolean(settings.apiKey),
      hasApiSecret: Boolean(settings.apiSecret),
      hasPassphrase: Boolean(settings.passphrase),
      maskedApiKey: maskKey(settings.apiKey),
      leverage: settings.leverage,
      marginPerTradePct: settings.marginPerTradePct,
      tp1ClosePct: settings.tp1ClosePct,
      autoTrade: settings.autoTrade,
      pullbackOnly: settings.pullbackOnly,
      feeRatePct: settings.feeRatePct,
      paperInitialBalance: settings.paperInitialBalance,
      paperBalance: settings.paperBalance,
      lastTestStatus: settings.lastTestStatus,
      lastTestMessage: settings.lastTestMessage,
      lastTestAt: settings.lastTestAt,
      updatedAt: settings.updatedAt,
    };
  }

  private credentials(settings: IWeexSettings): WeexCredentials {
    return {
      apiKey: settings.apiKey,
      apiSecret: settings.apiSecret,
      passphrase: settings.passphrase,
      environment: settings.environment,
    };
  }

  private signedClient(settings: IWeexSettings): WeexClient {
    return new WeexClient(this.credentials(settings));
  }

  // ==========================================================================
  // Market data
  // ==========================================================================
  private async refreshPrices(symbols: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    if (symbols.length === 0) return out;

    try {
      const client = new WeexClient();
      const tickers = await client.ticker24h();
      for (const t of tickers) {
        if (t.symbol && t.lastPrice > 0) out[t.symbol] = t.lastPrice;
      }
      if (Object.keys(out).length > 0) {
        this.state.priceSource = 'weex';
      }
    } catch (err: any) {
      this.state.lastError = `قیمت WEEX در دسترس نیست: ${err?.message || 'network'}`;
    }

    const missing = symbols.filter((s) => !out[s.toUpperCase()] || out[s.toUpperCase()] <= 0);
    if (missing.length > 0) {
      const fromBinance = await fetchPrices(missing);
      for (const [symbol, price] of Object.entries(fromBinance)) {
        if (!out[symbol] || out[symbol] <= 0) out[symbol] = price;
      }
      if (Object.keys(fromBinance).length > 0 && this.state.priceSource !== 'weex') {
        this.state.priceSource = 'binance';
      }
    }

    this.priceCache = new Map(Object.entries(out).map(([k, v]) => [k.toUpperCase(), v]));
    this.priceCacheAt = Date.now();
    return out;
  }

  public async getPrices(symbols: string[], maxAgeMs = PRICE_CACHE_MS): Promise<Record<string, number>> {
    const normalized = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
    if (normalized.length === 0) return {};

    const cacheFresh = Date.now() - this.priceCacheAt < maxAgeMs;
    const allCached = normalized.every((s) => this.priceCache.has(s) && this.priceCache.get(s)! > 0);
    if (cacheFresh && allCached) {
      return Object.fromEntries(normalized.map((s) => [s, this.priceCache.get(s)!]));
    }
    const fresh = await this.refreshPrices(normalized);
    return Object.fromEntries(
      normalized
        .map((s) => [s, fresh[s] ?? this.priceCache.get(s) ?? 0] as const)
        .filter(([, price]) => price > 0)
    );
  }

  public async getSymbolRules(symbol: string): Promise<WeexSymbolRules> {
    const key = symbol.toUpperCase();
    const fresh = Date.now() - this.rulesCacheAt < 30 * 60 * 1000;
    if (!fresh || !this.rulesCache[key]) {
      try {
        const client = new WeexClient();
        const rules = await client.getSymbolRules();
        if (Object.keys(rules).length > 0) {
          this.rulesCache = rules;
          this.rulesCacheAt = Date.now();
        }
      } catch {
        /* fall back to derived rules */
      }
    }
    const price = this.priceCache.get(key) || 0;
    return this.rulesCache[key] || fallbackRules(key, price);
  }

  public async getMarketTickers(): Promise<{ tickers: WeexTicker[]; source: 'weex' | 'binance' }> {
    try {
      const client = new WeexClient();
      const rows = await client.ticker24h();
      if (rows.length > 0) return { tickers: rows, source: 'weex' };
    } catch {
      /* fall through */
    }
    const prices = await this.getPrices([
      'BTCUSDT',
      'ETHUSDT',
      'BNBUSDT',
      'SOLUSDT',
      'XRPUSDT',
      'ADAUSDT',
      'DOGEUSDT',
      'TONUSDT',
    ]);
    return {
      source: 'binance',
      tickers: Object.entries(prices).map(([symbol, lastPrice]) => ({
        symbol,
        lastPrice,
        priceChangePercent: 0,
        highPrice: 0,
        lowPrice: 0,
        quoteVolume: 0,
        markPrice: lastPrice,
        indexPrice: lastPrice,
      })),
    };
  }

  // ==========================================================================
  // Settings / connection test
  // ==========================================================================
  public async getSettings(userId: string): Promise<IWeexSettings> {
    return dbRepo.getWeexSettings(userId);
  }

  public async saveSettings(
    userId: string,
    patch: Partial<IWeexSettings> & { clearCredentials?: boolean }
  ): Promise<IWeexSettings> {
    const current = await dbRepo.getWeexSettings(userId);
    const next: Partial<IWeexSettings> = {};

    if (patch.mode === 'paper' || patch.mode === 'live') next.mode = patch.mode;
    if (patch.environment === 'production' || patch.environment === 'simulation') {
      next.environment = patch.environment;
    }
    if (patch.clearCredentials) {
      next.apiKey = '';
      next.apiSecret = '';
      next.passphrase = '';
    } else {
      if (typeof patch.apiKey === 'string') next.apiKey = patch.apiKey.trim();
      if (typeof patch.apiSecret === 'string') next.apiSecret = patch.apiSecret.trim();
      if (typeof patch.passphrase === 'string') next.passphrase = patch.passphrase.trim();
    }
    if (patch.leverage !== undefined) {
      next.leverage = Math.min(125, Math.max(1, Math.round(Number(patch.leverage) || 1)));
    }
    if (patch.marginPerTradePct !== undefined) {
      next.marginPerTradePct = Math.min(100, Math.max(1, Number(patch.marginPerTradePct) || 10));
    }
    if (patch.tp1ClosePct !== undefined) {
      next.tp1ClosePct = Math.min(100, Math.max(1, Number(patch.tp1ClosePct) || 50));
    }
    if (patch.feeRatePct !== undefined) {
      next.feeRatePct = Math.min(5, Math.max(0, Number(patch.feeRatePct) || 0));
    }
    if (patch.autoTrade !== undefined) next.autoTrade = Boolean(patch.autoTrade);
    if (patch.pullbackOnly !== undefined) next.pullbackOnly = Boolean(patch.pullbackOnly);
    if (patch.paperInitialBalance !== undefined) {
      const initial = Math.max(10, Number(patch.paperInitialBalance) || 1000);
      next.paperInitialBalance = initial;
      // only reseed the free balance when nothing is locked in paper positions
      const activePaper = (await dbRepo.getActiveWeexPositions(userId)).filter(
        (p) => p.mode === 'paper'
      );
      if (activePaper.length === 0) {
        next.paperBalance = initial;
      }
    }

    if (patch.mode === 'live' && next.mode === undefined) next.mode = 'live';
    const mergedCreds = {
      apiKey: next.apiKey ?? current.apiKey,
      apiSecret: next.apiSecret ?? current.apiSecret,
      passphrase: next.passphrase ?? current.passphrase,
    };
    if (next.mode === 'live' && !(mergedCreds.apiKey && mergedCreds.apiSecret && mergedCreds.passphrase)) {
      throw new Error(
        'برای حالت واقعی (Live) باید کلید API، Secret Key و Passphrase صرافی WEEX را ثبت کنید.'
      );
    }

    return dbRepo.updateWeexSettings(userId, next);
  }

  public async testConnection(
    userId: string,
    overrides?: { apiKey?: string; apiSecret?: string; passphrase?: string; environment?: 'production' | 'simulation' }
  ): Promise<{
    ok: boolean;
    message: string;
    latencyMs: number;
    serverTime: number;
    account: { canTrade: boolean; dualSidePosition: boolean } | null;
    balances: Array<{ asset: string; balance: number; availableBalance: number; unrealizePnl: number }>;
  }> {
    const settings = await dbRepo.getWeexSettings(userId);
    const credentials: WeexCredentials = {
      apiKey: (overrides?.apiKey || settings.apiKey || '').trim(),
      apiSecret: (overrides?.apiSecret || settings.apiSecret || '').trim(),
      passphrase: (overrides?.passphrase || settings.passphrase || '').trim(),
      environment: overrides?.environment || settings.environment,
    };

    const started = Date.now();
    if (!credentials.apiKey || !credentials.apiSecret || !credentials.passphrase) {
      throw new Error('کلید API، Secret Key و Passphrase را کامل وارد کنید.');
    }

    const client = new WeexClient(credentials);
    try {
      const serverTime = await client.serverTime();
      const [accountConfig, balances] = await Promise.all([
        client.accountConfig(),
        client.balance(),
      ]);
      const latencyMs = Date.now() - started;
      const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');
      const message = `اتصال موفق — سرور WEEX: ${new Date(serverTime).toLocaleString('fa-IR')} | موجودی USDT: ${
        usdt ? usdt.availableBalance.toFixed(2) : '0.00'
      }`;
      await dbRepo.updateWeexSettings(userId, {
        lastTestStatus: 'success',
        lastTestMessage: message,
        lastTestAt: new Date().toISOString(),
      });
      return {
        ok: true,
        message,
        latencyMs,
        serverTime,
        account: accountConfig,
        balances: balances.map((b) => ({
          asset: b.asset,
          balance: b.balance,
          availableBalance: b.availableBalance,
          unrealizePnl: b.unrealizePnl,
        })),
      };
    } catch (err: any) {
      const message = err?.message || 'اتصال به WEEX ناموفق بود.';
      await dbRepo.updateWeexSettings(userId, {
        lastTestStatus: 'error',
        lastTestMessage: message,
        lastTestAt: new Date().toISOString(),
      });
      return {
        ok: false,
        message,
        latencyMs: Date.now() - started,
        serverTime: 0,
        account: null,
        balances: [],
      };
    }
  }

  // ==========================================================================
  // Order placement (paper + live)
  // ==========================================================================
  public async placeOrder(
    userId: string,
    input: WeexOrderRequest
  ): Promise<{ ok: boolean; message: string; position: IWeexPosition | null }> {
    const settings = await dbRepo.getWeexSettings(userId);
    const mode = input.mode || settings.mode;
    const symbol = String(input.symbol || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) {
      return { ok: false, message: 'نماد معتبر نیست. قالب صحیح: BTCUSDT', position: null };
    }
    const side = input.side;
    if (side !== 'LONG' && side !== 'SHORT') {
      return { ok: false, message: 'جهت پوزیشن باید خرید (LONG) یا فروش (SHORT) باشد.', position: null };
    }

    const orderType = input.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET';
    const prices = await this.getPrices([symbol]);
    const marketPrice = prices[symbol] || 0;
    if (!marketPrice) {
      return { ok: false, message: 'قیمت لحظه‌ای این نماد در دسترس نیست.', position: null };
    }

    if (orderType === 'LIMIT' && (!input.limitPrice || input.limitPrice <= 0)) {
      return { ok: false, message: 'برای سفارش لیمیت، قیمت ورود را وارد کنید.', position: null };
    }
    const entryTarget = orderType === 'LIMIT' ? Number(input.limitPrice) : marketPrice;
    // A marketable limit order fills at the current market, not at the (worse)
    // limit price, so risk levels are validated against that real entry.
    const referenceEntry =
      orderType === 'LIMIT' && isImmediatelyFillable(side, entryTarget, marketPrice)
        ? marketPrice
        : entryTarget;
    const leverage = Math.min(
      125,
      Math.max(1, Math.round(Number(input.leverage || settings.leverage) || settings.leverage))
    );

    const stopLoss = Number(input.stopLoss) || 0;
    const takeProfit1 = Number(input.takeProfit1) || 0;
    const takeProfit2 = Number(input.takeProfit2) || 0;
    if (stopLoss <= 0 || takeProfit1 <= 0) {
      return { ok: false, message: 'حد ضرر و حد سود اول الزامی است.', position: null };
    }
    if (side === 'LONG' && !(stopLoss < referenceEntry && takeProfit1 > referenceEntry)) {
      return {
        ok: false,
        message: 'برای خرید (LONG) باید حد ضرر پایین‌تر و حد سود بالاتر از نقطه ورود باشد.',
        position: null,
      };
    }
    if (side === 'SHORT' && !(stopLoss > referenceEntry && takeProfit1 < referenceEntry)) {
      return {
        ok: false,
        message: 'برای فروش (SHORT) باید حد ضرر بالاتر و حد سود پایین‌تر از نقطه ورود باشد.',
        position: null,
      };
    }
    if (takeProfit2 > 0) {
      const validTp2 = side === 'LONG' ? takeProfit2 > takeProfit1 : takeProfit2 < takeProfit1;
      if (!validTp2) {
        return {
          ok: false,
          message: 'حد سود دوم باید در جهت سود و فراتر از حد سود اول باشد.',
          position: null,
        };
      }
    }

    const active = (await dbRepo.getActiveWeexPositions(userId)).filter((p) => p.mode === mode);
    if (active.length >= MAX_OPEN_POSITIONS) {
      return {
        ok: false,
        message: `حداکثر ${MAX_OPEN_POSITIONS} سفارش فعال هم‌زمان مجاز است.`,
        position: null,
      };
    }
    if (active.some((p) => p.symbol === symbol)) {
      return {
        ok: false,
        message: `برای ${symbol} یک سفارش فعال دارید؛ ابتدا آن را ببندید.`,
        position: null,
      };
    }

    const rules = await this.getSymbolRules(symbol);
    const freeMargin =
      mode === 'paper'
        ? Math.max(0, settings.paperBalance)
        : await this.liveFreeMargin(settings);
    let margin =
      Number(input.margin) > 0
        ? Number(input.margin)
        : (settings.paperBalance * settings.marginPerTradePct) / 100;
    if (mode === 'live' && !(Number(input.margin) > 0)) {
      margin = (freeMargin * settings.marginPerTradePct) / 100;
    }
    if (!Number.isFinite(margin) || margin < MIN_MARGIN_USD) {
      return { ok: false, message: 'مارجین کافی نیست (حداقل ۱ دلار).', position: null };
    }
    if (margin > freeMargin) {
      return {
        ok: false,
        message: `مارجین آزاد کافی نیست. آزاد: ${freeMargin.toFixed(2)}$`,
        position: null,
      };
    }

    const notional = margin * leverage;
    let quantity =
      Number(input.quantity) > 0 ? Number(input.quantity) : notional / entryTarget;
    quantity = floorToPrecision(quantity, rules.quantityPrecision || 0);
    if (quantity <= 0 || (rules.minOrderSize > 0 && quantity < rules.minOrderSize)) {
      return {
        ok: false,
        message: `حجم سفارش کمتر از حداقل مجاز صرافی است (حداقل: ${rules.minOrderSize || '—'} ${rules.baseAsset}). مارجین بیشتر وارد کنید.`,
        position: null,
      };
    }
    const actualNotional = round2(quantity * entryTarget);
    const openFee = round2((actualNotional * settings.feeRatePct) / 100);

    const basePosition: Omit<IWeexPosition, '_id' | 'createdAt' | 'updatedAt'> = {
      userId,
      mode,
      signalId: String(input.signalId || ''),
      symbol,
      label: String(input.label || symbol),
      side,
      status: 'PENDING',
      orderType,
      triggerAbove: side === 'SHORT',
      entryTarget,
      entryPrice: 0,
      stopLoss,
      takeProfit1,
      takeProfit2,
      quantity,
      remainingQuantity: quantity,
      notional: actualNotional,
      margin: round2(margin),
      leverage,
      realizedPnl: 0,
      feePaid: 0,
      tp1Hit: false,
      closeReason: '',
      signalCycleNumber: Number(input.cycleNumber) || 0,
      aiEngineUsed: String(input.aiEngineUsed || ''),
      averageScore: Number(input.averageScore) || 0,
      fills: [],
      exchangeOrderId: '',
      exchangeTp1OrderId: '',
      exchangeTp2OrderId: '',
      exchangeSlOrderId: '',
      exchangePositionId: '',
      lastPrice: marketPrice,
      note: String(input.note || ''),
      openedAt: null,
      closedAt: null,
    };

    if (mode === 'paper') {
      const shouldFill =
        orderType === 'MARKET' || isImmediatelyFillable(side, entryTarget, marketPrice);
      const fillPrice =
        orderType === 'MARKET' || shouldFill ? marketPrice : entryTarget;
      return this.createPaperPosition(settings, basePosition, shouldFill, fillPrice, openFee);
    }

    return this.createLivePosition(settings, basePosition, marketPrice, rules);
  }

  private async createPaperPosition(
    settings: IWeexSettings,
    base: Omit<IWeexPosition, '_id' | 'createdAt' | 'updatedAt'>,
    shouldFill: boolean,
    fillPrice: number,
    openFee: number
  ): Promise<{ ok: boolean; message: string; position: IWeexPosition | null }> {
    if (base.margin + openFee > settings.paperBalance) {
      return { ok: false, message: 'مارجین آزاد حساب مجازی کافی نیست.', position: null };
    }

    const now = new Date().toISOString();
    const notional = round2(base.quantity * fillPrice);
    const position = await dbRepo.createWeexPosition({
      ...base,
      status: shouldFill ? 'OPEN' : 'PENDING',
      entryPrice: shouldFill ? fillPrice : 0,
      notional,
      feePaid: round2(openFee),
      openedAt: shouldFill ? now : null,
      fills: shouldFill
        ? [
            {
              type: 'OPEN',
              price: fillPrice,
              quantity: base.quantity,
              pnl: 0,
              fee: openFee,
              note: 'ورود با قیمت بازار (مجازی)',
              at: now,
            },
          ]
        : [],
    });

    await dbRepo.updateWeexSettings(base.userId, {
      paperBalance: round2(settings.paperBalance - base.margin - openFee),
    });

    return {
      ok: true,
      message: shouldFill
        ? `پوزیشن ${base.side === 'LONG' ? 'خرید' : 'فروش'} ${base.symbol} با حجم ${base.quantity} در قیمت ${fillPrice} باز شد (مجازی).`
        : `سفارش لیمیت ${base.side === 'LONG' ? 'خرید' : 'فروش'} ${base.symbol} روی ${base.entryTarget} ثبت شد و در انتظار پر شدن است.`,
      position,
    };
  }

  private async createLivePosition(
    settings: IWeexSettings,
    base: Omit<IWeexPosition, '_id' | 'createdAt' | 'updatedAt'>,
    marketPrice: number,
    rules: WeexSymbolRules
  ): Promise<{ ok: boolean; message: string; position: IWeexPosition | null }> {
    if (!settings.apiKey || !settings.apiSecret || !settings.passphrase) {
      return {
        ok: false,
        message: 'برای حالت واقعی، کلید API / Secret / Passphrase را در تنظیمات WEEX ثبت کنید.',
        position: null,
      };
    }

    const client = this.signedClient(settings);
    const isMarket = base.orderType === 'MARKET';
    const priceText = formatToPrecision(base.entryTarget, rules.pricePrecision || 2);
    const qtyText = formatToPrecision(base.quantity, rules.quantityPrecision || 0);
    const clientOrderId = `wx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    try {
      const order = await client.placeOrder({
        symbol: base.symbol,
        side: base.side === 'LONG' ? 'BUY' : 'SELL',
        positionSide: base.side,
        type: base.orderType,
        quantity: qtyText,
        newClientOrderId: clientOrderId,
        ...(isMarket ? {} : { timeInForce: 'GTC' as const, price: priceText }),
      });

      if (!order.success || !order.orderId) {
        return {
          ok: false,
          message: order.errorMessage || 'صرافی WEEX سفارش را نپذیرفت.',
          position: null,
        };
      }

      let entryPrice = base.entryTarget;
      let status: 'PENDING' | 'OPEN' = 'PENDING';
      let executedQty = base.quantity;
      let openedAt: string | null = null;

      if (isMarket) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          try {
            const info = await client.getOrder(order.orderId);
            const filled = toNumber(info.executedQty);
            const avg = toNumber(info.avgPrice);
            if (filled > 0) {
              executedQty = filled;
              if (avg > 0) entryPrice = avg;
              openedAt = new Date().toISOString();
              status = 'OPEN';
              break;
            }
            if (info.status === 'FILLED' && avg > 0) {
              entryPrice = avg;
              openedAt = new Date().toISOString();
              status = 'OPEN';
              break;
            }
          } catch {
            /* keep polling */
          }
        }
        if (status === 'PENDING') {
          entryPrice = marketPrice;
          openedAt = new Date().toISOString();
          status = 'OPEN';
        }
      }

      const now = new Date().toISOString();
      const notional = round2(executedQty * entryPrice);
      const position = await dbRepo.createWeexPosition({
        ...base,
        status,
        entryPrice: status === 'OPEN' ? entryPrice : 0,
        quantity: executedQty,
        remainingQuantity: executedQty,
        notional,
        exchangeOrderId: order.orderId,
        openedAt: status === 'OPEN' ? openedAt || now : null,
        lastPrice: marketPrice,
        fills:
          status === 'OPEN'
            ? [
                {
                  type: 'OPEN',
                  price: entryPrice,
                  quantity: executedQty,
                  pnl: 0,
                  fee: round2((notional * settings.feeRatePct) / 100),
                  note: 'ورود واقعی در صرافی WEEX',
                  at: now,
                },
              ]
            : [],
        note: `${base.note ? `${base.note} | ` : ''}WEEX order #${order.orderId}`,
      });

      if (status === 'OPEN') {
        await this.placeProtectionOrders(client, settings, position, position.quantity);
        const refreshed = await dbRepo.getWeexPositions(base.userId);
        const latest = refreshed.find((p) => p._id === position._id) || position;
        return {
          ok: true,
          message: `سفارش واقعی ${base.symbol} در WEEX ثبت و باز شد (شناسه ${order.orderId}).`,
          position: latest,
        };
      }

      return {
        ok: true,
        message: `سفارش لیمیت واقعی ${base.symbol} در WEEX ثبت شد (شناسه ${order.orderId}) و در انتظار پر شدن است.`,
        position,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || 'ثبت سفارش در WEEX ناموفق بود.',
        position: null,
      };
    }
  }

  /** Places TP1 (partial), TP2 (rest) and SL (rest) as native WEEX TP/SL orders. */
  private async placeProtectionOrders(
    client: WeexClient,
    settings: IWeexSettings,
    position: IWeexPosition,
    baseQuantity: number
  ): Promise<void> {
    const rules = await this.getSymbolRules(position.symbol);
    const qty1 = floorToPrecision(
      (baseQuantity * settings.tp1ClosePct) / 100,
      rules.quantityPrecision || 0
    );
    const ids = { tp1: '', tp2: '', sl: '' };

    if (position.takeProfit1 > 0) {
      if (qty1 > 0 && qty1 < baseQuantity) {
        try {
          const res = await client.placeTpSlOrder({
            symbol: position.symbol,
            planType: 'TAKE_PROFIT',
            triggerPrice: formatToPrecision(position.takeProfit1, rules.pricePrecision || 2),
            positionSide: position.side,
            clientAlgoId: `wt1${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            quantity: formatToPrecision(qty1, rules.quantityPrecision || 0),
            closePosition: false,
            triggerPriceType: 'MARK_PRICE',
          });
          ids.tp1 = res.orderId;
        } catch (err: any) {
          console.warn('[weex] TP1 order failed:', err?.message);
        }
      }
    }

    if (position.takeProfit2 > 0) {
      try {
        const res = await client.placeTpSlOrder({
          symbol: position.symbol,
          planType: 'TAKE_PROFIT',
          triggerPrice: formatToPrecision(position.takeProfit2, rules.pricePrecision || 2),
          positionSide: position.side,
          clientAlgoId: `wt2${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          closePosition: true,
          triggerPriceType: 'MARK_PRICE',
        });
        ids.tp2 = res.orderId;
      } catch (err: any) {
        console.warn('[weex] TP2 order failed:', err?.message);
      }
    }

    if (position.stopLoss > 0) {
      try {
        const res = await client.placeTpSlOrder({
          symbol: position.symbol,
          planType: 'STOP_LOSS',
          triggerPrice: formatToPrecision(position.stopLoss, rules.pricePrecision || 2),
          positionSide: position.side,
          clientAlgoId: `ws${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          closePosition: true,
          triggerPriceType: 'MARK_PRICE',
        });
        ids.sl = res.orderId;
      } catch (err: any) {
        console.warn('[weex] SL order failed:', err?.message);
      }
    }

    await dbRepo.updateWeexPosition(position._id, {
      exchangeTp1OrderId: ids.tp1,
      exchangeTp2OrderId: ids.tp2,
      exchangeSlOrderId: ids.sl,
    });
  }

  private async liveFreeMargin(settings: IWeexSettings): Promise<number> {
    try {
      const client = this.signedClient(settings);
      const balances = await client.balance();
      const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');
      if (usdt) return Math.max(0, usdt.availableBalance);
      const first = balances.find((b) => b.availableBalance > 0);
      return first ? Math.max(0, first.availableBalance) : 0;
    } catch (err: any) {
      throw new Error(`خواندن موجودی WEEX ناموفق بود: ${err?.message || 'خطای شبکه'}`);
    }
  }

  // ==========================================================================
  // Closing / protection updates
  // ==========================================================================
  public async closePosition(
    userId: string,
    positionId: string,
    reason = 'بستن دستی توسط ادمین'
  ): Promise<{ ok: boolean; message: string }> {
    const positions = await dbRepo.getWeexPositions(userId);
    const pos = positions.find((p) => p._id === positionId);
    if (!pos) return { ok: false, message: 'پوزیشن یافت نشد.' };
    if (pos.status === 'CLOSED') return { ok: false, message: 'این پوزیشن قبلاً بسته شده است.' };

    const settings = await dbRepo.getWeexSettings(userId);

    if (pos.mode === 'paper') {
      const prices = await this.getPrices([pos.symbol]);
      const price = prices[pos.symbol] || pos.lastPrice || pos.entryTarget;

      if (pos.status === 'PENDING') {
        // cancel the unfilled order and release its margin
        const refund = round2(pos.margin);
        const balance = Math.max(0, settings.paperBalance + refund);
        await dbRepo.updateWeexSettings(userId, { paperBalance: balance });
        await dbRepo.updateWeexPosition(pos._id, {
          status: 'CLOSED',
          remainingQuantity: 0,
          margin: 0,
          closeReason: 'لغو سفارش در انتظار ورود',
          closedAt: new Date().toISOString(),
        });
        return { ok: true, message: 'سفارش در انتظار ورود لغو و مارجین آزاد شد.' };
      }

      const feeRate = settings.feeRatePct / 100;
      const grossPnl = pnlFor(pos.side, pos.entryPrice, price, pos.remainingQuantity);
      const closeFee = round2(pos.remainingQuantity * price * feeRate);
      const releaseMargin = round2(pos.margin);
      const balance = round2(settings.paperBalance + releaseMargin + grossPnl - closeFee);
      const now = new Date().toISOString();

      await dbRepo.updateWeexSettings(userId, { paperBalance: balance });
      await dbRepo.updateWeexPosition(pos._id, {
        status: 'CLOSED',
        remainingQuantity: 0,
        margin: 0,
        realizedPnl: round2(pos.realizedPnl + grossPnl - closeFee),
        feePaid: round2(pos.feePaid + closeFee),
        closeReason: reason,
        closedAt: now,
        fills: [
          ...(pos.fills || []),
          {
            type: 'CLOSE',
            price,
            quantity: pos.remainingQuantity,
            pnl: grossPnl,
            fee: closeFee,
            note: reason,
            at: now,
          },
        ],
      });
      return { ok: true, message: `پوزیشن در قیمت ${price} بسته شد (سود/زیان: ${grossPnl}$).` };
    }

    // ---- live ----
    if (!settings.apiKey || !settings.apiSecret || !settings.passphrase) {
      return { ok: false, message: 'کلید API صرافی برای بستن پوزیشن واقعی ثبت نشده است.' };
    }
    const client = this.signedClient(settings);
    try {
      const result = await client.closePositions({ symbol: pos.symbol });
      const failed = result.find((r) => !r.success);
      if (failed && result.length > 0) {
        return { ok: false, message: failed.errorMessage || 'صرافی بستن پوزیشن را نپذیرفت.' };
      }
      // remove any leftover conditional orders for this symbol
      try {
        await client.cancelAlgoOrders(pos.symbol);
      } catch {
        /* ignore */
      }

      await new Promise((resolve) => setTimeout(resolve, 900));
      let realized = 0;
      try {
        const trades = await client.userTrades({
          symbol: pos.symbol,
          startTime: pos.openedAt ? new Date(pos.openedAt).getTime() : Date.now() - 3_600_000,
          limit: 100,
        });
        realized = round2(trades.reduce((acc, t) => acc + toNumber(t.realizedPnl), 0));
      } catch {
        const prices = await this.getPrices([pos.symbol]);
        const price = prices[pos.symbol] || pos.lastPrice || pos.entryPrice;
        realized = pnlFor(pos.side, pos.entryPrice, price, pos.remainingQuantity);
      }

      const now = new Date().toISOString();
      await dbRepo.updateWeexPosition(pos._id, {
        status: 'CLOSED',
        remainingQuantity: 0,
        realizedPnl: round2(pos.realizedPnl + realized),
        closeReason: reason,
        closedAt: now,
        fills: [
          ...(pos.fills || []),
          {
            type: 'CLOSE',
            price: pos.lastPrice || pos.entryPrice,
            quantity: pos.remainingQuantity,
            pnl: realized,
            fee: 0,
            note: reason,
            at: now,
          },
        ],
      });
      return { ok: true, message: 'پوزیشن در صرافی WEEX بسته شد.' };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'بستن پوزیشن در WEEX ناموفق بود.' };
    }
  }

  public async updateProtection(
    userId: string,
    positionId: string,
    levels: { stopLoss?: number; takeProfit1?: number; takeProfit2?: number }
  ): Promise<{ ok: boolean; message: string; position: IWeexPosition | null }> {
    const positions = await dbRepo.getWeexPositions(userId);
    const pos = positions.find((p) => p._id === positionId);
    if (!pos) return { ok: false, message: 'پوزیشن یافت نشد.', position: null };
    if (pos.status !== 'OPEN') {
      return { ok: false, message: 'فقط پوزیشن باز قابل ویرایش است.', position: null };
    }

    const patch: Partial<IWeexPosition> = {};
    const reference = pos.entryPrice || pos.entryTarget;
    if (levels.stopLoss !== undefined) {
      const sl = Number(levels.stopLoss);
      const valid = pos.side === 'LONG' ? sl > 0 && sl < reference : sl > reference;
      if (!valid) {
        return {
          ok: false,
          message: 'حد ضرر در جهت صحیح پوزیشن نیست.',
          position: null,
        };
      }
      patch.stopLoss = sl;
    }
    for (const key of ['takeProfit1', 'takeProfit2'] as const) {
      if (levels[key] === undefined) continue;
      const tp = Number(levels[key]);
      const valid = pos.side === 'LONG' ? tp > reference : tp > 0 && tp < reference;
      if (!valid) {
        return { ok: false, message: 'حد سود در جهت صحیح پوزیشن نیست.', position: null };
      }
      patch[key] = tp;
    }

    const updated = await dbRepo.updateWeexPosition(pos._id, patch);
    if (!updated) return { ok: false, message: 'ذخیره تغییرات ناموفق بود.', position: null };

    if (pos.mode === 'live') {
      const settings = await dbRepo.getWeexSettings(userId);
      const client = this.signedClient(settings);
      try {
        // Cancel the previous conditional orders, then place the new ones.
        await client.cancelAlgoOrders(pos.symbol);
        await this.placeProtectionOrders(client, settings, updated, updated.remainingQuantity);
      } catch (err: any) {
        return {
          ok: true,
          message: `حدود جدید ذخیره شد، اما به‌روزرسانی TP/SL در صرافی نیاز به بررسی دارد: ${err?.message || ''}`,
          position: await dbRepo.getWeexPositions(userId).then((rows) =>
            rows.find((p) => p._id === pos._id) || updated
          ),
        };
      }
    }

    return {
      ok: true,
      message: 'حد ضرر / حد سود به‌روزرسانی شد.',
      position: await dbRepo.getWeexPositions(userId).then(
        (rows) => rows.find((p) => p._id === pos._id) || updated
      ),
    };
  }

  public async deletePosition(userId: string, positionId: string): Promise<boolean> {
    const positions = await dbRepo.getWeexPositions(userId);
    const pos = positions.find((p) => p._id === positionId);
    if (!pos) return false;
    if (pos.status !== 'CLOSED') {
      throw new Error('ابتدا پوزیشن را ببندید یا لغو کنید، سپس حذف نمایید.');
    }
    return dbRepo.deleteWeexPosition(positionId);
  }

  public async clearHistory(userId: string): Promise<void> {
    const positions = await dbRepo.getWeexPositions(userId);
    for (const p of positions.filter((row) => row.status === 'CLOSED')) {
      await dbRepo.deleteWeexPosition(p._id);
    }
  }

  public async resetPaperAccount(userId: string): Promise<IWeexSettings> {
    const settings = await dbRepo.getWeexSettings(userId);
    const activePaper = (await dbRepo.getActiveWeexPositions(userId)).filter(
      (p) => p.mode === 'paper'
    );
    for (const p of activePaper) {
      await dbRepo.deleteWeexPosition(p._id);
    }
    return dbRepo.updateWeexSettings(userId, {
      paperBalance: settings.paperInitialBalance,
    });
  }

  // ==========================================================================
  // Approved signals
  // ==========================================================================
  public async getApprovedSignals(userId: string): Promise<WeexApprovedSignal[]> {
    if (Date.now() - this.approvedCacheAt > SIGNAL_CACHE_MS) {
      const all = await dbRepo.getRegisteredSignals();
      const now = Date.now();
      this.approvedCache = all
        .filter(
          (s) =>
            s.isQualified &&
            s.consensusDirection !== 'NO TRADE' &&
            s.entryPrice > 0 &&
            s.stopLoss > 0 &&
            s.takeProfit1 > 0 &&
            now - new Date(s.createdAt).getTime() <= SIGNAL_MAX_AGE_MS
        )
        .slice(0, 40);
      this.approvedCacheAt = now;
    }

    const positions = await dbRepo.getWeexPositions(userId);
    const tradedSignalIds = new Set(positions.map((p) => p.signalId).filter(Boolean));
    const symbols = this.approvedCache.map((s) => s.symbol);
    const prices = await this.getPrices(symbols).catch(() => ({} as Record<string, number>));

    return this.approvedCache.map((signal) => {
      const price = prices[signal.symbol] || signal.currentPrice || 0;
      const distance =
        price > 0 ? ((signal.entryPrice - price) / price) * 100 : 0;
      return {
        ...signal,
        alreadyTraded: tradedSignalIds.has(signal._id),
        distanceToEntryPct: Math.round(distance * 100) / 100,
      };
    });
  }

  /** Trades one specific approved signal (manual button). */
  public async tradeSignal(
    userId: string,
    signalId: string,
    overrides?: { margin?: number; mode?: 'paper' | 'live'; orderType?: 'MARKET' | 'LIMIT' }
  ): Promise<{ ok: boolean; message: string; position: IWeexPosition | null }> {
    const settings = await dbRepo.getWeexSettings(userId);
    const all = await dbRepo.getRegisteredSignals();
    const signal = all.find((s) => s._id === signalId);
    if (!signal) return { ok: false, message: 'سیگنال یافت نشد.', position: null };
    if (!signal.isQualified || signal.consensusDirection === 'NO TRADE') {
      return { ok: false, message: 'این سیگنال تأیید نشده است.', position: null };
    }
    if (!signal.entryPrice || !signal.stopLoss || !signal.takeProfit1) {
      return { ok: false, message: 'سطح ورود / حد ضرر / حد سود کامل نیست.', position: null };
    }

    const side: 'LONG' | 'SHORT' = signal.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG';
    const prices = await this.getPrices([signal.symbol]);
    const marketPrice = prices[signal.symbol] || 0;
    if (!marketPrice) {
      return { ok: false, message: 'قیمت لحظه‌ای نماد در دسترس نیست.', position: null };
    }

    const mode = overrides?.mode || settings.mode;
    if (settings.pullbackOnly && !isPullback(side, signal.entryPrice, marketPrice)) {
      return {
        ok: false,
        message: 'این ورود از نوع شکست (Breakout) است و طبق تنظیمات فقط ورود پولبک پذیرفته می‌شود.',
        position: null,
      };
    }

    return this.placeOrder(userId, {
      symbol: signal.symbol,
      side,
      orderType: overrides?.orderType || 'LIMIT',
      limitPrice: signal.entryPrice,
      margin: overrides?.margin,
      stopLoss: signal.stopLoss,
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2,
      signalId: signal._id,
      label: signal.label,
      cycleNumber: signal.cycleNumber,
      aiEngineUsed: signal.aiEngineUsed,
      averageScore: signal.averageScore,
      note: `سیگنال تأییدشده #${signal.cycleNumber}`,
      mode,
    });
  }

  /**
   * Auto-trade hook, called by the signals engine right after a signal
   * qualifies. Only users with `autoTrade` enabled are touched.
   */
  public async ingestSignal(
    signal: IRegisteredSignal
  ): Promise<{ created: number; note: string }> {
    if (!signal.isQualified || signal.consensusDirection === 'NO TRADE') {
      return { created: 0, note: 'سیگنال تأییدشده نیست.' };
    }
    if (!signal.entryPrice || !signal.stopLoss || !signal.takeProfit1) {
      return { created: 0, note: 'سطح ورود / حد ضرر / حد سود کامل نیست.' };
    }

    const userIds = await dbRepo.getAllWeexUserIds();
    let created = 0;
    const notes: string[] = [];

    for (const userId of userIds) {
      try {
        const settings = await dbRepo.getWeexSettings(userId);
        if (!settings.autoTrade) continue;
        if (settings.mode === 'live' && !(settings.apiKey && settings.apiSecret && settings.passphrase)) {
          notes.push('کلید API برای یکی از کاربران ثبت نشده است.');
          continue;
        }
        const result = await this.tradeSignal(userId, signal._id, { mode: settings.mode });
        if (result.ok) created += 1;
        else if (result.message) notes.push(result.message);
      } catch (err: any) {
        notes.push(err?.message || 'خطا در معامله خودکار WEEX');
      }
    }

    const note =
      created > 0
        ? `${created} سفارش WEEX از سیگنال ${signal.symbol} ساخته شد.`
        : notes[0] || 'معامله خودکار WEEX غیرفعال است یا شرط ورود برقرار نشد.';
    if (created > 0) console.log(`[weex] auto-traded signal ${signal.symbol} -> ${created} order(s)`);
    return { created, note };
  }

  // ==========================================================================
  // Periodic tick
  // ==========================================================================
  public async tick(): Promise<WeexEngineState['lastTickSummary']> {
    const summary = { filled: 0, tp1: 0, tp2: 0, stopped: 0, synced: 0 };
    if (this.ticking) return summary;
    this.ticking = true;

    try {
      const active = await dbRepo.getActiveWeexPositions();
      if (active.length === 0) {
        this.state.lastTickAt = new Date().toISOString();
        return summary;
      }

      const prices = await this.getPrices(active.map((p) => p.symbol));

      // ---- paper ----
      for (const pos of active.filter((p) => p.mode === 'paper')) {
        const price = prices[pos.symbol];
        if (!price) continue;
        if (pos.status === 'PENDING') {
          const filled =
            pos.orderType === 'MARKET' ||
            (pos.side === 'LONG' ? price <= pos.entryTarget : price >= pos.entryTarget);
          if (!filled) {
            if (Math.abs((pos.lastPrice || 0) - price) > price * 0.0001) {
              await dbRepo.updateWeexPosition(pos._id, { lastPrice: price });
            }
            continue;
          }
          const now = new Date().toISOString();
          const notional = round2(pos.quantity * pos.entryTarget);
          await dbRepo.updateWeexPosition(pos._id, {
            status: 'OPEN',
            entryPrice: pos.entryTarget,
            openedAt: now,
            notional,
            lastPrice: price,
            fills: [
              ...(pos.fills || []),
              {
                type: 'OPEN',
                price: pos.entryTarget,
                quantity: pos.quantity,
                pnl: 0,
                fee: 0,
                note: 'پر شدن سفارش لیمیت (مجازی)',
                at: now,
              },
            ],
          });
          summary.filled += 1;
          continue;
        }

        if (pos.status !== 'OPEN') continue;

        const settings = await dbRepo.getWeexSettings(pos.userId);
        const slHit =
          pos.stopLoss > 0 &&
          (pos.side === 'LONG' ? price <= pos.stopLoss : price >= pos.stopLoss);
        const tp2Hit =
          pos.takeProfit2 > 0 &&
          (pos.side === 'LONG' ? price >= pos.takeProfit2 : price <= pos.takeProfit2);
        const tp1Hit =
          !pos.tp1Hit &&
          pos.takeProfit1 > 0 &&
          (pos.side === 'LONG' ? price >= pos.takeProfit1 : price <= pos.takeProfit1);

        if (slHit) {
          await this.settlePaper(pos, settings, pos.stopLoss, 100, 'حد ضرر', 'CLOSE');
          summary.stopped += 1;
        } else if (tp2Hit) {
          await this.settlePaper(pos, settings, pos.takeProfit2, 100, 'حد سود دوم', 'CLOSE');
          summary.tp2 += 1;
        } else if (tp1Hit) {
          const pct = Math.min(100, Math.max(1, settings.tp1ClosePct));
          await this.settlePaper(
            pos,
            settings,
            pos.takeProfit1,
            pct,
            'حد سود اول',
            'PARTIAL_CLOSE'
          );
          summary.tp1 += 1;
        } else if (Math.abs((pos.lastPrice || 0) - price) > price * 0.0001) {
          await dbRepo.updateWeexPosition(pos._id, { lastPrice: price });
        }
      }

      // ---- live ----
      const liveByUser = new Map<string, IWeexPosition[]>();
      for (const pos of active.filter((p) => p.mode === 'live')) {
        const list = liveByUser.get(pos.userId) || [];
        list.push(pos);
        liveByUser.set(pos.userId, list);
      }

      for (const [userId, positions] of liveByUser) {
        try {
          const settings = await dbRepo.getWeexSettings(userId);
          if (!(settings.apiKey && settings.apiSecret && settings.passphrase)) continue;
          const client = this.signedClient(settings);
          const exchangePositions = await client.positions();
          summary.synced += positions.length;

          for (const pos of positions) {
            if (pos.status === 'PENDING') {
              if (!pos.exchangeOrderId) continue;
              try {
                const info = await client.getOrder(pos.exchangeOrderId);
                const filled = toNumber(info.executedQty);
                const avg = toNumber(info.avgPrice);
                if (filled > 0) {
                  const now = new Date().toISOString();
                  const entryPrice = avg > 0 ? avg : pos.entryTarget;
                  const updated = await dbRepo.updateWeexPosition(pos._id, {
                    status: 'OPEN',
                    entryPrice,
                    quantity: filled,
                    remainingQuantity: filled,
                    notional: round2(filled * entryPrice),
                    openedAt: now,
                    lastPrice: prices[pos.symbol] || entryPrice,
                    fills: [
                      ...(pos.fills || []),
                      {
                        type: 'OPEN',
                        price: entryPrice,
                        quantity: filled,
                        pnl: 0,
                        fee: 0,
                        note: 'پر شدن سفارش لیمیت در صرافی',
                        at: now,
                      },
                    ],
                  });
                  if (updated) {
                    await this.placeProtectionOrders(client, settings, updated, filled);
                  }
                  summary.filled += 1;
                } else if (info.status === 'CANCELED' || info.status === 'EXPIRED') {
                  await dbRepo.updateWeexPosition(pos._id, {
                    status: 'CLOSED',
                    remainingQuantity: 0,
                    closeReason: 'سفارش در صرافی لغو شد',
                    closedAt: new Date().toISOString(),
                  });
                }
              } catch {
                /* keep pending */
              }
              continue;
            }

            const exchangePos = exchangePositions.find(
              (p) => p.symbol === pos.symbol && p.side === pos.side
            );
            if (exchangePos) {
              const patch: Partial<IWeexPosition> = {};
              if (exchangePos.entryPrice > 0 && Math.abs(exchangePos.entryPrice - pos.entryPrice) > 0.000001) {
                patch.entryPrice = exchangePos.entryPrice;
              }
              if (exchangePos.size > 0 && Math.abs(exchangePos.size - pos.remainingQuantity) > 0.000001) {
                const ratio = pos.remainingQuantity > 0 ? exchangePos.size / pos.remainingQuantity : 1;
                patch.remainingQuantity = exchangePos.size;
                patch.margin = round2(pos.margin * ratio);
              }
              patch.exchangePositionId = String(exchangePos.id || '');
              if (prices[pos.symbol]) patch.lastPrice = prices[pos.symbol];
              if (Object.keys(patch).length > 0) {
                await dbRepo.updateWeexPosition(pos._id, patch);
              }
              // TP1 fill detection (position still open but smaller)
              if (!pos.tp1Hit && exchangePos.size > 0 && exchangePos.size < pos.quantity * 0.99) {
                await dbRepo.updateWeexPosition(pos._id, { tp1Hit: true });
                summary.tp1 += 1;
              }
            } else {
              // position no longer exists on the exchange => TP/SL hit or closed
              let realized = 0;
              try {
                const trades = await client.userTrades({
                  symbol: pos.symbol,
                  startTime: pos.openedAt
                    ? new Date(pos.openedAt).getTime()
                    : Date.now() - 24 * 3600_000,
                  limit: 100,
                });
                realized = round2(trades.reduce((acc, t) => acc + toNumber(t.realizedPnl), 0));
              } catch {
                const price = prices[pos.symbol] || pos.lastPrice || pos.entryPrice;
                realized = pnlFor(pos.side, pos.entryPrice, price, pos.remainingQuantity);
              }
              const now = new Date().toISOString();
              await dbRepo.updateWeexPosition(pos._id, {
                status: 'CLOSED',
                remainingQuantity: 0,
                realizedPnl: round2(pos.realizedPnl + realized),
                closeReason: 'بسته شده در صرافی (حد سود / حد ضرر)',
                closedAt: now,
                fills: [
                  ...(pos.fills || []),
                  {
                    type: 'CLOSE',
                    price: pos.lastPrice || pos.entryPrice,
                    quantity: pos.remainingQuantity,
                    pnl: realized,
                    fee: 0,
                    note: 'بسته شدن خودکار در صرافی',
                    at: now,
                  },
                ],
              });
              summary.stopped += 1;
            }
          }
        } catch (err: any) {
          this.state.lastError = `همگام‌سازی WEEX: ${err?.message || 'خطای شبکه'}`;
        }
      }

      this.state.lastTickAt = new Date().toISOString();
      this.state.lastTickSummary = summary;
      return summary;
    } catch (err: any) {
      this.state.lastError = err?.message || 'خطای موتور ترید WEEX';
      return summary;
    } finally {
      this.ticking = false;
    }
  }

  /** Closes `pct` percent of a paper position at `price`. */
  private async settlePaper(
    pos: IWeexPosition,
    settings: IWeexSettings,
    price: number,
    pct: number,
    note: string,
    type: 'PARTIAL_CLOSE' | 'CLOSE'
  ): Promise<void> {
    const ratio = Math.min(100, Math.max(1, pct)) / 100;
    const closedQty =
      type === 'CLOSE' ? pos.remainingQuantity : round8(pos.remainingQuantity * ratio);
    if (closedQty <= 0) return;

    const feeRate = settings.feeRatePct / 100;
    const grossPnl = pnlFor(pos.side, pos.entryPrice, price, closedQty);
    const closeFee = round2(closedQty * price * feeRate);
    const releaseMargin =
      pos.remainingQuantity > 0
        ? round2(pos.margin * (closedQty / pos.remainingQuantity))
        : round2(pos.margin);
    const remainingQty = round8(Math.max(0, pos.remainingQuantity - closedQty));
    const fullyClosed = remainingQty <= 1e-9;

    const now = new Date().toISOString();
    const balance = round2(settings.paperBalance + releaseMargin + grossPnl - closeFee);

    await dbRepo.updateWeexSettings(pos.userId, { paperBalance: balance });
    await dbRepo.updateWeexPosition(pos._id, {
      status: fullyClosed ? 'CLOSED' : 'OPEN',
      remainingQuantity: fullyClosed ? 0 : remainingQty,
      margin: fullyClosed ? 0 : round2(pos.margin - releaseMargin),
      realizedPnl: round2(pos.realizedPnl + grossPnl - closeFee),
      feePaid: round2(pos.feePaid + closeFee),
      tp1Hit: note === 'حد سود اول' ? true : pos.tp1Hit,
      closeReason: fullyClosed ? note : pos.closeReason,
      closedAt: fullyClosed ? now : null,
      lastPrice: price,
      fills: [
        ...(pos.fills || []),
        {
          type,
          price,
          quantity: closedQty,
          pnl: grossPnl,
          fee: closeFee,
          note,
          at: now,
        },
      ],
    });
  }

  // ==========================================================================
  // Snapshot for the panel
  // ==========================================================================
  public async getSnapshot(userId: string): Promise<WeexSnapshot> {
    const settings = await dbRepo.getWeexSettings(userId);
    const all = await dbRepo.getWeexPositions(userId);
    const active = all.filter((p) => p.status !== 'CLOSED');
    const history = all.filter((p) => p.status === 'CLOSED');

    const prices = await this.getPrices([
      ...active.map((p) => p.symbol),
      ...history.slice(0, 20).map((p) => p.symbol),
    ]).catch(() => ({} as Record<string, number>));

    const enrich = (p: IWeexPosition): WeexPositionView => {
      const currentPrice = prices[p.symbol] || p.lastPrice || p.entryPrice || p.entryTarget;
      let unrealizedPnl = 0;
      if (p.status === 'OPEN') {
        unrealizedPnl = pnlFor(p.side, p.entryPrice, currentPrice, p.remainingQuantity);
      }
      const unrealizedPnlPct = p.margin > 0 ? (unrealizedPnl / p.margin) * 100 : 0;
      const distanceToEntryPct =
        p.status === 'PENDING' && currentPrice > 0
          ? ((p.entryTarget - currentPrice) / currentPrice) * 100
          : 0;
      return {
        ...p,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPct: round2(unrealizedPnlPct),
        distanceToEntryPct: round2(distanceToEntryPct),
        riskRewardRatio: rrText(p),
        isLiveOnExchange: p.mode === 'live' && Boolean(p.exchangePositionId),
        exchangeUnrealizedPnl: null,
      };
    };

    const positionViews = active.map(enrich);
    const historyViews = history.map(enrich);

    const usedMargin = round2(active.reduce((acc, p) => acc + (p.margin || 0), 0));
    const unrealized = round2(
      positionViews.reduce((acc, p) => acc + (p.status === 'OPEN' ? p.unrealizedPnl : 0), 0)
    );
    const closed = history;
    const winCount = closed.filter((p) => p.realizedPnl > 0).length;
    const feePaid = round2(all.reduce((acc, p) => acc + (p.feePaid || 0), 0));

    const paperBalance = round2(settings.paperBalance);
    const paperEquity = round2(paperBalance + usedMargin + unrealized);
    const stats: WeexAccountStats = {
      balance: paperBalance,
      initialBalance: settings.paperInitialBalance,
      equity: paperEquity,
      freeMargin: paperBalance,
      usedMargin,
      unrealizedPnl: unrealized,
      realizedPnl: round2(closed.reduce((acc, p) => acc + p.realizedPnl, 0)),
      netPnl: round2(paperEquity - settings.paperInitialBalance),
      openPositions: active.filter((p) => p.status === 'OPEN').length,
      pendingOrders: active.filter((p) => p.status === 'PENDING').length,
      closedTrades: closed.length,
      winCount,
      lossCount: closed.length - winCount,
      winRate: closed.length > 0 ? Math.round((winCount / closed.length) * 1000) / 10 : 0,
      totalFees: feePaid,
    };

    const live: WeexSnapshot['live'] = {
      connected: false,
      error: null,
      balances: [],
      exchangePositions: [],
      accountConfig: null,
    };

    if (settings.mode === 'live') {
      if (settings.apiKey && settings.apiSecret && settings.passphrase) {
        try {
          const client = this.signedClient(settings);
          const [balances, exchangePositions, accountConfig] = await Promise.all([
            client.balance(),
            client.positions(),
            client.accountConfig(),
          ]);
          const usdt = balances.find((b) => b.asset.toUpperCase() === 'USDT');
          const liveUnrealized = round2(
            exchangePositions.reduce((acc, p) => acc + p.unrealizedPnl, 0)
          );
          live.connected = true;
          live.balances = balances.map((b) => ({
            asset: b.asset,
            balance: b.balance,
            availableBalance: b.availableBalance,
            unrealizePnl: b.unrealizePnl,
          }));
          live.exchangePositions = exchangePositions.map((p) => ({
            symbol: p.symbol,
            side: p.side,
            size: p.size,
            entryPrice: p.entryPrice,
            unrealizedPnl: p.unrealizedPnl,
            leverage: p.leverage,
          }));
          live.accountConfig = {
            canTrade: accountConfig.canTrade,
            dualSidePosition: accountConfig.dualSidePosition,
          };
          if (usdt) {
            stats.balance = round2(usdt.availableBalance);
            stats.freeMargin = round2(usdt.availableBalance);
            stats.equity = round2(usdt.balance + usdt.unrealizePnl);
          }
          stats.unrealizedPnl = liveUnrealized;
          stats.initialBalance = 0;
          stats.netPnl = round2(usdt ? usdt.balance + usdt.unrealizePnl : 0);
          stats.realizedPnl = round2(closed.reduce((acc, p) => acc + p.realizedPnl, 0));
        } catch (err: any) {
          live.error = err?.message || 'اتصال به WEEX برقرار نشد.';
        }
      } else {
        live.error = 'کلید API، Secret و Passphrase برای حالت واقعی تنظیم نشده است.';
      }
    }

    const approvedSignals = await this.getApprovedSignals(userId).catch(() => []);

    return {
      settings: this.toSafeSettings(settings),
      mode: settings.mode,
      stats,
      positions: positionViews,
      history: historyViews,
      approvedSignals,
      live,
      engine: this.getState(),
    };
  }
}

export const weexEngine = new WeexEngine();
