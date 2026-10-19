/**
 * Watchlist Auto-Refresher (به‌روزرسانی خودکار لیست ارزها)
 * ---------------------------------------------------------------------------
 * Rebuilds the watchlist every day at 08:00 Asia/Tehran from two sources:
 *
 *   1. TOP MARKET CAP — the first `WATCHLIST_TOP_MARKETCAP` (default 30) coins
 *      by market-cap rank (CoinGecko), kept only when they actually have a
 *      live Binance USDT spot pair.
 *   2. MOST VOLATILE — the `WATCHLIST_TOP_VOLATILE` (default 20) OTHER coins
 *      with the highest 24h volatility on Binance USDT spot. Volatility is the
 *      intraday range as a percentage: (high - low) / open * 100.
 *
 * The two groups never overlap (a top-30 coin is excluded from the volatile
 * picks). Auto-managed rows are tagged in `addedBy` so the refresh can replace
 * them without deleting coins the admin added by hand.
 *
 * Scheduling: a single timer that always re-arms for the next 08:00 in the
 * configured timezone, so DST / clock changes can never drift the run time.
 */

import { dbRepo } from './models.js';

// ---------------------------------------------------------------------------
// Configuration (env-overridable)
// ---------------------------------------------------------------------------
const TOP_MARKETCAP = Math.max(1, Number(process.env.WATCHLIST_TOP_MARKETCAP || 30));
const TOP_VOLATILE = Math.max(1, Number(process.env.WATCHLIST_TOP_VOLATILE || 20));
const REFRESH_HOUR = Math.min(23, Math.max(0, Number(process.env.WATCHLIST_REFRESH_HOUR || 8)));
const REFRESH_MINUTE = Math.min(59, Math.max(0, Number(process.env.WATCHLIST_REFRESH_MINUTE || 0)));
const REFRESH_TZ = (process.env.WATCHLIST_REFRESH_TZ || 'Asia/Tehran').trim();
const ENABLED = process.env.WATCHLIST_AUTO_REFRESH !== 'false';
/**
 * Minimum 24h quote volume (USDT) for a volatile candidate. Without this the
 * "most volatile" list fills up with illiquid micro-caps whose swings are
 * noise. Set to 0 to disable the liquidity filter.
 */
const MIN_QUOTE_VOLUME = Math.max(0, Number(process.env.WATCHLIST_MIN_QUOTE_VOLUME || 1_000_000));
const BOOT_REFRESH_DELAY_MS = Math.max(0, Number(process.env.WATCHLIST_BOOT_DELAY_MS || 15_000));

const AUTO_TAG_MARKETCAP = 'auto-marketcap';
const AUTO_TAG_VOLATILE = 'auto-volatile';
const AUTO_TAGS = [AUTO_TAG_MARKETCAP, AUTO_TAG_VOLATILE];

/**
 * Bases that must never be auto-added: stablecoins, fiat-pegged and
 * commodity-pegged tokens. They sit high on the market-cap list but never move,
 * so they would only waste signal cycles.
 */
const STABLE_BASES = new Set([
  'USDC', 'USDT', 'USDS', 'USDE', 'SUSDE', 'USDF', 'USDG', 'RLUSD', 'USD1', 'XUSD',
  'USDY', 'USDX', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'USDD', 'PYUSD', 'GUSD',
  'USTC', 'UST', 'FRAX', 'LUSD', 'MIM', 'EUR', 'EURI', 'AEUR', 'EURT', 'STASIS',
  'XAUT', 'PAXG', 'TRY', 'BRL', 'ARS', 'GBP', 'JPY', 'BIDR', 'IDRT', 'BKRW', 'RUB',
  'UAH', 'ZAR', 'NGN', 'PLN', 'RON', 'CZK', 'MXN', 'BRLN', 'BRZ',
]);

/** True when a base asset is stable/fiat/commodity-pegged and must be skipped. */
function isStableOrPegged(base: string): boolean {
  return STABLE_BASES.has(base);
}

/** Fallback top-market-cap order used when CoinGecko is unreachable. */
const FALLBACK_TOP_MARKETCAP = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'TRX', 'AVAX', 'LINK',
  'TON', 'DOT', 'MATIC', 'SHIB', 'LTC', 'BCH', 'UNI', 'ATOM', 'XLM', 'ETC',
  'FIL', 'APT', 'ARB', 'OP', 'NEAR', 'SUI', 'AAVE', 'INJ', 'IMX', 'RUNE',
  'ALGO', 'VET', 'SAND', 'MANA', 'AXS', 'EGLD', 'THETA', 'FTM', 'GRT', 'SNX',
];

export interface WatchlistRefreshState {
  enabled: boolean;
  topMarketCap: number;
  topVolatile: number;
  refreshHour: number;
  refreshMinute: number;
  refreshTimezone: string;
  minQuoteVolumeUsd: number;
  lastRefreshAt: string | null;
  lastRefreshSource: 'boot' | 'schedule' | 'manual' | null;
  nextRefreshAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastSummary: {
    marketCapSymbols: string[];
    volatileSymbols: string[];
    added: number;
    removed: number;
    total: number;
    marketCapSource: 'coingecko' | 'fallback';
    volatileSource: 'binance' | 'none';
  } | null;
}

interface Candidate {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  label: string;
  addedBy: string;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const FETCH_TIMEOUT_MS = Math.max(3000, Number(process.env.WATCHLIST_FETCH_TIMEOUT_MS || 20_000));

async function fetchJsonWithFallback(paths: string[]): Promise<any | null> {
  for (const url of paths) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // try the next host
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source 1 — Binance 24h tickers (used for the valid-symbol set and volatility)
// ---------------------------------------------------------------------------
interface Ticker24h {
  symbol: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  lastPrice: number;
  quoteVolume: number;
  priceChangePercent: number;
}

async function fetchBinance24hTickers(): Promise<Ticker24h[]> {
  const raw = await fetchJsonWithFallback(
    BINANCE_HOSTS.map((h) => `${h}/api/v3/ticker/24hr`)
  );
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      symbol: String(t.symbol || '').toUpperCase(),
      openPrice: Number(t.openPrice) || 0,
      highPrice: Number(t.highPrice) || 0,
      lowPrice: Number(t.lowPrice) || 0,
      lastPrice: Number(t.lastPrice) || 0,
      quoteVolume: Number(t.quoteVolume) || 0,
      priceChangePercent: Number(t.priceChangePercent) || 0,
    }))
    .filter((t: Ticker24h) => t.symbol.endsWith('USDT') && t.openPrice > 0 && t.lastPrice > 0);
}

/** Leveraged / special Binance products that should never be auto-added. */
function isExcludedPair(symbol: string, baseAsset: string): boolean {
  if (isStableOrPegged(baseAsset)) return true;
  if (/(UP|DOWN|BULL|BEAR)USDT$/.test(symbol)) return true;
  return false;
}

function baseFromSymbol(symbol: string): string {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
}

// ---------------------------------------------------------------------------
// Source 2 — CoinGecko top market cap (+ a name map for nicer labels)
// ---------------------------------------------------------------------------
interface MarketCapCoin {
  base: string;
  name: string;
}

async function fetchCoinGeckoMarkets(perPage: number): Promise<MarketCapCoin[] | null> {
  const urls = [
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`,
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1`,
  ];
  const raw = await fetchJsonWithFallback(urls);
  if (!Array.isArray(raw)) return null;
  return raw
    .map((c: any) => ({
      base: String(c.symbol || '').toUpperCase(),
      name: String(c.name || '').trim(),
    }))
    .filter((c: MarketCapCoin) => c.base.length > 0);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
function pickTopMarketCap(
  markets: MarketCapCoin[] | null,
  validBases: Set<string>,
  limit: number
): { picks: Candidate[]; source: 'coingecko' | 'fallback' } {
  const picks: Candidate[] = [];
  const seen = new Set<string>();
  const push = (base: string, name?: string) => {
    if (!base || seen.has(base) || picks.length >= limit) return;
    if (!validBases.has(base)) return; // no live Binance USDT pair
    if (isStableOrPegged(base)) return; // stable / pegged assets are not tradable signals
    seen.add(base);
    picks.push({
      symbol: `${base}USDT`,
      baseAsset: base,
      quoteAsset: 'USDT',
      label: name ? `${name} (${base})` : `${base} / USDT`,
      addedBy: AUTO_TAG_MARKETCAP,
    });
  };

  if (markets && markets.length > 0) {
    for (const m of markets) push(m.base, m.name);
    if (picks.length > 0) return { picks, source: 'coingecko' };
  }
  for (const base of FALLBACK_TOP_MARKETCAP) push(base);
  return { picks, source: 'fallback' };
}

function pickMostVolatile(
  tickers: Ticker24h[],
  nameByBase: Map<string, string>,
  excludeBases: Set<string>,
  limit: number
): Candidate[] {
  const scored = tickers
    .map((t) => {
      const base = baseFromSymbol(t.symbol);
      const rangePct = t.openPrice > 0 ? ((t.highPrice - t.lowPrice) / t.openPrice) * 100 : 0;
      return { t, base, rangePct };
    })
    .filter((x) => {
      if (!x.base || x.rangePct <= 0) return false;
      if (excludeBases.has(x.base)) return false;
      if (isExcludedPair(x.t.symbol, x.base)) return false;
      if (MIN_QUOTE_VOLUME > 0 && x.t.quoteVolume < MIN_QUOTE_VOLUME) return false;
      return true;
    })
    .sort((a, b) => b.rangePct - a.rangePct)
    .slice(0, limit);

  return scored.map(({ t, base, rangePct }) => {
    const name = nameByBase.get(base);
    const pct = rangePct >= 10 ? rangePct.toFixed(0) : rangePct.toFixed(1);
    return {
      symbol: t.symbol,
      baseAsset: base,
      quoteAsset: 'USDT',
      label: name
        ? `${name} (${base}) — نوسان ۲۴س: ${pct}٪`
        : `${base} / USDT — نوسان ۲۴س: ${pct}٪`,
      addedBy: AUTO_TAG_VOLATILE,
    };
  });
}

// ---------------------------------------------------------------------------
// Scheduling helpers
// ---------------------------------------------------------------------------
/** Wall-clock ms until the next occurrence of HH:MM in the given IANA zone. */
function msUntilNextTimeInZone(hour: number, minute: number, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date());
  } catch {
    // unknown timezone — fall back to UTC
    const now = new Date();
    const target = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0
    );
    let diff = target - now.getTime();
    if (diff <= 0) diff += 24 * 3600 * 1000;
    return diff;
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const h = get('hour');
  const mi = get('minute');
  const s = get('second');
  const zoneNow = Date.UTC(y, mo - 1, d, h, mi, s);
  let target = Date.UTC(y, mo - 1, d, hour, minute, 0);
  if (target <= zoneNow) target += 24 * 3600 * 1000;
  return target - zoneNow;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
class WatchlistRefresher {
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private state: WatchlistRefreshState = {
    enabled: ENABLED,
    topMarketCap: TOP_MARKETCAP,
    topVolatile: TOP_VOLATILE,
    refreshHour: REFRESH_HOUR,
    refreshMinute: REFRESH_MINUTE,
    refreshTimezone: REFRESH_TZ,
    minQuoteVolumeUsd: MIN_QUOTE_VOLUME,
    lastRefreshAt: null,
    lastRefreshSource: null,
    nextRefreshAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
  };

  public getState(): WatchlistRefreshState {
    return { ...this.state };
  }

  /** Arms the daily timer and (if the watchlist has no auto rows yet) runs once. */
  public initialize(): void {
    if (!ENABLED) {
      console.log('[watchlist] auto-refresh disabled (WATCHLIST_AUTO_REFRESH=false).');
      return;
    }
    this.scheduleNext();
    this.bootTimer = setTimeout(() => {
      void this.maybeBootRefresh();
    }, BOOT_REFRESH_DELAY_MS);
    console.log(
      `[watchlist] auto-refresh armed for ${String(REFRESH_HOUR).padStart(2, '0')}:${String(
        REFRESH_MINUTE
      ).padStart(2, '0')} ${REFRESH_TZ} (top ${TOP_MARKETCAP} mcap + ${TOP_VOLATILE} volatile).`
    );
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    this.state.nextRefreshAt = null;
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = msUntilNextTimeInZone(REFRESH_HOUR, REFRESH_MINUTE, REFRESH_TZ);
    this.timer = setTimeout(() => {
      void this.refresh('schedule');
    }, delay);
    this.state.nextRefreshAt = new Date(Date.now() + delay).toISOString();
  }

  /** On boot, refresh only when the watchlist has no auto-managed rows yet. */
  private async maybeBootRefresh(): Promise<void> {
    try {
      const symbols = await dbRepo.getSymbols();
      const hasAuto = symbols.some((s) => AUTO_TAGS.includes(String(s.addedBy || '')));
      if (!hasAuto) {
        await this.refresh('boot');
      }
    } catch (err: any) {
      this.state.lastError = err?.message || 'boot check failed';
    }
  }

  /**
   * Rebuilds the auto part of the watchlist. Always re-arms the daily timer so
   * a manual run cannot cancel the schedule.
   */
  public async refresh(
    source: 'boot' | 'schedule' | 'manual' = 'manual'
  ): Promise<{ ok: boolean; error?: string | null; summary?: WatchlistRefreshState['lastSummary'] }> {
    const startedAt = Date.now();
    this.state.lastError = null;
    try {
      const tickers = await fetchBinance24hTickers();
      const validBases = new Set(tickers.map((t) => baseFromSymbol(t.symbol)));
      const markets = await fetchCoinGeckoMarkets(250);
      const nameByBase = new Map<string, string>();
      for (const m of markets || []) {
        if (!nameByBase.has(m.base)) nameByBase.set(m.base, m.name);
      }

      const { picks: marketCapPicks, source: marketCapSource } = pickTopMarketCap(
        markets,
        validBases,
        TOP_MARKETCAP
      );
      const marketCapBases = new Set(marketCapPicks.map((p) => p.baseAsset));
      const volatilePicks = pickMostVolatile(
        tickers,
        nameByBase,
        marketCapBases,
        TOP_VOLATILE
      );

      const all = [...marketCapPicks, ...volatilePicks];
      if (all.length === 0) {
        throw new Error('هیچ نماد معتبری از منابع بازار دریافت نشد.');
      }

      const result = await dbRepo.syncAutoSymbols(all, AUTO_TAGS);

      this.state.lastRefreshAt = new Date().toISOString();
      this.state.lastRefreshSource = source;
      this.state.lastDurationMs = Date.now() - startedAt;
      this.state.lastSummary = {
        marketCapSymbols: marketCapPicks.map((p) => p.symbol),
        volatileSymbols: volatilePicks.map((p) => p.symbol),
        added: result.added,
        removed: result.removed,
        total: result.total,
        marketCapSource,
        volatileSource: tickers.length > 0 ? 'binance' : 'none',
      };
      console.log(
        `[watchlist] refreshed (${source}): ${marketCapPicks.length} mcap + ${volatilePicks.length} volatile = ${result.total} (removed ${result.removed}).`
      );
      return { ok: true, summary: this.state.lastSummary };
    } catch (err: any) {
      this.state.lastError = err?.message || 'خطا در به‌روزرسانی خودکار لیست ارزها';
      this.state.lastDurationMs = Date.now() - startedAt;
      console.error('[watchlist] refresh failed:', this.state.lastError);
      return { ok: false, error: this.state.lastError };
    } finally {
      if (ENABLED) this.scheduleNext();
    }
  }
}

export const watchlistRefresher = new WatchlistRefresher();
