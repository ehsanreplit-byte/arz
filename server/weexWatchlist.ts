/**
 * WEEX Demo (SUSDT) Watchlist Integration
 * ---------------------------------------------------------------------------
 * Adds every coin that is actually tradeable on WEEX demo futures (SUSDT
 * pairs) to the admin panel watchlist, so the signal engine / ticker pages can
 * analyse them.
 *
 * The list below was extracted from WEEX's public API: a coin is included only
 * when its demo market (`<BASE>SUSDT`) had a live order book. 142 bases —
 * see `work/build_final2.py` in the repo history for the extraction script.
 *
 * Two helpers are exported for the UI:
 *   - getBinanceUsdtBases(): which of them also have a Binance spot pair, so the
 *     front-end never subscribes to an invalid Binance stream (that would kill
 *     the whole combined websocket connection).
 *   - getWeexUsdtTickers(): a cached 24h ticker map used to price the coins
 *     that only exist on WEEX.
 */

import { dbRepo } from './models.js';

/**
 * Coins with a live demo (SUSDT) market on WEEX. Order = 24h volume at
 * extraction time (descending), which also makes a sensible display order.
 */
export const WEEX_DEMO_BASES: readonly string[] = [
  'BTC', 'ETH', 'ZEC', 'SOL', 'BNB', 'XRP', 'AVAX', 'WLD', 'LTC', 'TRX',
  'UNI', 'NEAR', 'DOGE', 'LINK', 'BCH', 'XLM', 'SUI', 'HBAR', 'XMR', 'QNT',
  'HYPE', 'AAVE', 'ONDO', 'JST', 'XAUT', 'ZEN', 'DOT', 'PAXG', 'ADA', 'ETC',
  'PENGU', 'TAO', 'PIEVERSE', 'FIL', 'JUP', 'ATOM', 'CC', 'DASH', 'ZRO', 'RENDER',
  'PENDLE', 'BAT', 'VVV', 'CAKE', 'AR', 'CVX', 'H', 'INJ', 'ICP', 'ARB',
  'SPX', 'SFP', 'SKYAI', 'FARTCOIN', 'MORPHO', 'ETHFI', 'COMP', 'ALGO', 'JTO', 'SEI',
  'CRV', 'SENT', 'XTZ', 'APT', 'GWEI', 'SUN', 'LDO', 'VET', 'APE', 'ATH',
  'HOOD', 'CHZ', 'M', 'AERO', 'TIA', 'POL', 'NEO', 'XPL', 'SKY', 'WIF',
  'RAVE', 'A', 'ASTER', 'DEEP', 'AKT', 'PUMP', 'VIRTUAL', 'JASMY', 'FET', 'MANA',
  'SAND', 'IOTA', 'RAY', 'B', 'CFX', 'XDC', 'TWT', 'WAL', 'MEGA', 'RSR',
  'KAIA', 'EGLD', 'NIGHT', 'ZK', 'KITE', 'MNT', 'THETA', 'EIGEN', 'TRUMP', 'OP',
  '2Z', 'TAG', 'GALA', 'CRO', 'GRT', 'LUNC', 'XEC', 'FLR', 'STRK', 'STABLE',
  'PI', 'GNO', 'GLM', '1INCH', 'IMX', 'PYTH', 'BEAT', 'FF', 'SYRUP', 'BSV',
  'HNT', 'AB', 'CHEEMS', 'ENS', 'GENIUS', 'IP', 'KAS', 'S', 'STG', 'TON',
  'TRAC', 'ZBCN',
];

/** Persian labels for the coins worth naming; the rest fall back to `BASE / USDT`. */
const LABELS: Record<string, string> = {
  BTC: 'بیت‌کوین (Bitcoin)',
  ETH: 'اتریوم (Ethereum)',
  BNB: 'بایننس کوین (BNB)',
  SOL: 'سولانا (Solana)',
  XRP: 'ریپل (Ripple)',
  ADA: 'کاردانو (Cardano)',
  DOGE: 'دوج‌کوین (Dogecoin)',
  TRX: 'ترون (TRON)',
  AVAX: 'آوالانچ (Avalanche)',
  LINK: 'چین‌لینک (Chainlink)',
  LTC: 'لایت‌کوین (Litecoin)',
  BCH: 'بیت‌کوین کش (Bitcoin Cash)',
  DOT: 'پولکادات (Polkadot)',
  UNI: 'یونی‌سواپ (Uniswap)',
  ATOM: 'کازموس (Cosmos)',
  XLM: 'استلار (Stellar)',
  NEAR: 'نیر (NEAR)',
  SUI: 'سویی (Sui)',
  APT: 'اپتوس (Aptos)',
  ARB: 'آربیتروم (Arbitrum)',
  OP: 'آپتیمیزم (Optimism)',
  FIL: 'فایل‌کوین (Filecoin)',
  INJ: 'اینجکتیو (Injective)',
  AAVE: 'آوی (Aave)',
  ETC: 'اتریوم کلاسیک (Ethereum Classic)',
  HBAR: 'هدرا (Hedera)',
  ALGO: 'الگورند (Algorand)',
  VET: 'وی‌چین (VeChain)',
  ICP: 'آی‌سی‌پی (Internet Computer)',
  RENDER: 'رندر (Render)',
  TIA: 'سلستیا (Celestia)',
  SEI: 'سی (Sei)',
  STX: 'استکس (Stacks)',
  IMX: 'ایمیوتیبل (Immutable)',
  GRT: 'گراف (The Graph)',
  SAND: 'سن‌باکس (The Sandbox)',
  MANA: 'دیسنترالند (Decentraland)',
  APE: 'ایپ‌کوین (ApeCoin)',
  CRV: 'کرو (Curve)',
  LDO: 'لیدو (Lido)',
  ZEC: 'زی‌کش (Zcash)',
  DASH: 'دش (Dash)',
  XMR: 'مونرو (Monero)',
  XTZ: 'تزوس (Tezos)',
  EGLD: 'مولتی‌ورس‌اکس (MultiversX)',
  THETA: 'تتا (Theta)',
  KAS: 'کاسپا (Kaspa)',
  TON: 'تون‌کوین (Toncoin)',
  XDC: 'ایکس‌دی‌سی (XDC)',
  FLR: 'فلر (Flare)',
  CRO: 'کریپتوکام (Cronos)',
  MNT: 'مانتل (Mantle)',
  HYPE: 'هایپرلیکوید (Hyperliquid)',
  TAO: 'بیت‌تنسور (Bittensor)',
  ONDO: 'اون‌دو (Ondo)',
  PENDLE: 'پندل (Pendle)',
  JUP: 'جوپیتر (Jupiter)',
  PYTH: 'پیث (Pyth)',
  WIF: 'داگ‌ویف‌هت (dogwifhat)',
  TRUMP: 'ترامپ (Official Trump)',
  XAUT: 'تتر گلد (Tether Gold)',
  PAXG: 'پکس گلد (PAX Gold)',
  ZK: 'زد‌کی‌سینک (zkSync)',
  STRK: 'استارک‌نت (Starknet)',
  GALA: 'گالا (Gala)',
  FET: 'فچ (Fetch.ai)',
  JASMY: 'جاسمی (JasmyCoin)',
  IOTA: 'آیوتا (IOTA)',
  CFX: 'کانفلاکس (Conflux)',
};

export const WEEX_SEED_TAG = 'weex-demo';

function labelFor(base: string): string {
  return LABELS[base] || `${base} / USDT`;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------
let seedPromise: Promise<{ added: number; total: number }> | null = null;

/**
 * Adds the WEEX demo coins that are missing from the watchlist.
 * Idempotent: existing symbols are never touched (so admin edits survive).
 */
export async function seedWeexDemoWatchlist(
  force = false
): Promise<{ added: number; total: number }> {
  if (process.env.WEEX_WATCHLIST_SEED === 'false') return { added: 0, total: 0 };
  if (seedPromise && !force) return seedPromise;

  seedPromise = (async () => {
    const existing = await dbRepo.getSymbols();
    const have = new Set(existing.map((s) => String(s.symbol || '').toUpperCase()));
    let added = 0;

    for (const base of WEEX_DEMO_BASES) {
      const symbol = `${base}USDT`;
      if (have.has(symbol)) continue;
      try {
        await dbRepo.addSymbol({
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          label: labelFor(base),
          addedBy: WEEX_SEED_TAG,
        });
        have.add(symbol);
        added += 1;
      } catch (err: any) {
        console.warn(`[watchlist] could not seed ${symbol}:`, err?.message || err);
      }
    }

    if (added > 0) {
      console.log(`[watchlist] seeded ${added} WEEX demo (SUSDT) symbols.`);
    }
    return { added, total: WEEX_DEMO_BASES.length };
  })().finally(() => {
    seedPromise = null;
  });

  return seedPromise;
}

// ---------------------------------------------------------------------------
// Binance universe (which bases can be streamed from Binance)
// ---------------------------------------------------------------------------
const BINANCE_EXCHANGE_INFO_URLS = [
  'https://data-api.binance.vision/api/v3/exchangeInfo?symbolStatus=TRADING',
  'https://api.binance.com/api/v3/exchangeInfo?symbolStatus=TRADING',
];
// Cheap fallback (includes delisted/BREAK symbols, so it is only used when the
// exchange-info call fails).
const BINANCE_PRICE_URLS = [
  'https://data-api.binance.vision/api/v3/ticker/price',
  'https://api.binance.com/api/v3/ticker/price',
];
const BINANCE_TTL_MS = 60 * 60 * 1000; // 1 hour

let binanceBases: Set<string> | null = null;
let binanceFetchedAt = 0;
let binanceInFlight: Promise<Set<string> | null> | null = null;

async function loadBinanceBases(): Promise<Set<string> | null> {
  // Preferred: only symbols that are actually TRADING (BREAK / delisted pairs
  // still answer ticker endpoints but their prices are stale).
  for (const url of BINANCE_EXCHANGE_INFO_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) continue;
      const data: any = await res.json();
      if (!Array.isArray(data?.symbols)) continue;
      const bases = new Set<string>();
      for (const row of data.symbols) {
        if (
          String(row?.quoteAsset || '').toUpperCase() === 'USDT' &&
          String(row?.status || '').toUpperCase() === 'TRADING'
        ) {
          bases.add(String(row.baseAsset || '').toUpperCase());
        }
      }
      if (bases.size > 50) return bases;
    } catch {
      // try the next host
    }
  }

  for (const url of BINANCE_PRICE_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const rows = (await res.json()) as Array<{ symbol?: string }>;
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const bases = new Set<string>();
      for (const row of rows) {
        const sym = String(row?.symbol || '').toUpperCase();
        if (sym.endsWith('USDT') && sym.length > 4) bases.add(sym.slice(0, -4));
      }
      if (bases.size > 50) return bases;
    } catch {
      // try the next host
    }
  }
  return null;
}

/**
 * Binance bases that have a USDT spot pair. Cached for an hour and keeps the
 * last good answer when the network hiccups, so the UI never subscribes to a
 * symbol that would close the combined stream.
 */
export async function getBinanceUsdtBases(): Promise<Set<string> | null> {
  const fresh = binanceBases && Date.now() - binanceFetchedAt < BINANCE_TTL_MS;
  if (fresh) return binanceBases;
  if (binanceInFlight) return binanceInFlight;

  binanceInFlight = (async () => {
    const loaded = await loadBinanceBases();
    if (loaded) {
      binanceBases = loaded;
      binanceFetchedAt = Date.now();
    }
    return binanceBases;
  })().finally(() => {
    binanceInFlight = null;
  });

  return binanceInFlight;
}

// ---------------------------------------------------------------------------
// WEEX 24h tickers (prices for WEEX-only coins)
// ---------------------------------------------------------------------------
export interface WeexWatchTicker {
  price: number;
  changePercent: number;
  high: number;
  low: number;
  quoteVolume: number;
}

const WEEX_TICKER_URL = 'https://api-contract.weex.com/capi/v3/market/ticker/24hr';
const WEEX_TICKER_TTL_MS = 12_000;

let weexTickers: Record<string, WeexWatchTicker> = {};
let weexTickersAt = 0;
let weexInFlight: Promise<Record<string, WeexWatchTicker>> | null = null;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export async function getWeexUsdtTickers(): Promise<Record<string, WeexWatchTicker>> {
  if (weexTickersAt && Date.now() - weexTickersAt < WEEX_TICKER_TTL_MS) return weexTickers;
  if (weexInFlight) return weexInFlight;

  weexInFlight = (async () => {
    try {
      const res = await fetch(WEEX_TICKER_URL, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const rows = await res.json();
        const map: Record<string, WeexWatchTicker> = {};
        if (Array.isArray(rows)) {
          for (const raw of rows) {
            const symbol = String(raw?.symbol || '').toUpperCase();
            if (!symbol.endsWith('USDT')) continue;
            map[symbol] = {
              price: num(raw.lastPrice),
              changePercent: num(raw.priceChangePercent) * 100,
              high: num(raw.highPrice),
              low: num(raw.lowPrice),
              quoteVolume: num(raw.quoteVolume),
            };
          }
        }
        if (Object.keys(map).length > 0) {
          weexTickers = map;
          weexTickersAt = Date.now();
        }
      }
    } catch {
      /* keep the previous snapshot */
    }
    return weexTickers;
  })().finally(() => {
    weexInFlight = null;
  });

  return weexInFlight;
}
