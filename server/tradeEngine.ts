/**
 * Demo Trade Engine (موتور معاملات مجازی)
 * ---------------------------------------------------------------------------
 * Direct link with the Signals engine:
 *
 *  0. Entry-quality filter: only PULLBACK entries are accepted (buy a dip /
 *     sell a rally). Breakout entries are rejected, because on live data they
 *     won only 1 of 13 trades. Toggle with TRADE_ENTRIES_MODE=all|pullback.
 *  1. The moment the Signals engine registers a QUALIFIED signal (>= 3 Al
 *     Brooks signals on one side), it hands that signal to `ingestSignal()`
 *     here. A PENDING order is created immediately — no waiting for a poll.
 *  2. The PENDING order waits until the market price actually REACHES the
 *     signal entry level, then it fills (like a real exchange order). If the
 *     entry is already reached when the signal arrives, it fills at once.
 *  3. Stop loss / take profits are taken 1:1 from the signal.
 *  4. Positions open with leverage (default 5x), so the displayed profit/loss
 *     percentage on margin is the price move multiplied by the leverage.
 *  5. At TP1, 50% of the order is closed. The remaining half runs to TP2 or SL.
 *  6. Realized profit/loss is applied directly to the account balance.
 *
 * A periodic tick still runs as a safety net (price monitoring for pending
 * fills, stop loss and take profit levels).
 */

import { dbRepo, IPosition, IPositionFill, IRegisteredSignal, ITradeAccount } from './models.js';

const POLL_INTERVAL_MS = Math.max(3000, Number(process.env.TRADE_POLL_INTERVAL_MS || 10000));
const DEFAULT_LEVERAGE = Math.max(1, Number(process.env.TRADE_LEVERAGE || 5));
const TP1_CLOSE_PCT = Math.min(100, Math.max(1, Number(process.env.TRADE_TP1_CLOSE_PCT || 50)));
const SIGNAL_MAX_AGE_MS = Math.max(
  60_000,
  Number(process.env.TRADE_SIGNAL_MAX_AGE_MS || 35 * 60 * 1000)
);
const MIN_MARGIN_USD = Number(process.env.TRADE_MIN_MARGIN_USD || 1);
/**
 * Which entries are allowed.
 *  - 'pullback' (default): only take entries that require the price to come
 *    BACK to the signal level (buy a dip / sell a rally). Breakout entries are
 *    rejected. Measured on live data, breakout entries won only 1 of 13.
 *  - 'all': accept every entry (old behaviour).
 */
const ENTRIES_MODE = (process.env.TRADE_ENTRIES_MODE || 'pullback').trim().toLowerCase();

/**
 * A pullback entry means the market must travel back to the signal entry:
 *  - LONG  : entry sits BELOW the current price (price falls to it)
 *  - SHORT : entry sits ABOVE the current price (price rises to it)
 * A breakout entry is the opposite and is skipped when ENTRIES_MODE='pullback'.
 */
function isPullbackEntry(side: 'LONG' | 'SHORT', entry: number, price: number): boolean {
  return side === 'LONG' ? entry <= price : entry >= price;
}
/** Tolerance around the entry level (percent) so an entry sitting exactly on
 *  the market price still fills instead of waiting for a fresh touch. */
const ENTRY_TOLERANCE_PCT =
  Math.max(0, Number(process.env.TRADE_ENTRY_TOLERANCE_PCT ?? 0.02)) / 100;

export type IngestCode =
  | 'CREATED'
  | 'NOT_QUALIFIED'
  | 'INCOMPLETE_LEVELS'
  | 'NO_PRICE'
  | 'NO_USERS'
  | 'BREAKOUT_REJECTED'
  | 'SYMBOL_ACTIVE_OR_NO_MARGIN'
  | 'ERROR';

export interface TradeTickSummary {
  pendingCreated: number;
  filled: number;
  partiallyClosed: number;
  closed: number;
}

export interface IngestedSignalInfo {
  signalId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  at: string;
}

export interface TradeEngineState {
  isRunning: boolean;
  pollIntervalMs: number;
  leverage: number;
  tp1ClosePct: number;
  lastTickAt: string | null;
  lastError: string | null;
  positionsCreatedTotal: number;
  positionsClosedTotal: number;
  signalsIngestedTotal: number;
  lastIngestedSignal: IngestedSignalInfo | null;
  lastIngestAt: string | null;
  lastIngestCreated: number;
  lastIngestNote: string | null;
  lastIngestCode: IngestCode | null;
  /** every user key the engine currently serves (users + accounts + positions) */
  knownUserIds: string[];
  lastTickSummary: TradeTickSummary;
}

const emptySummary = (): TradeTickSummary => ({
  pendingCreated: 0,
  filled: 0,
  partiallyClosed: 0,
  closed: 0,
});

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------
export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const query = encodeURIComponent(JSON.stringify(symbols));
  const endpoints = [
    `https://data-api.binance.vision/api/v3/ticker/price?symbols=${query}`,
    `https://api.binance.com/api/v3/ticker/price?symbols=${query}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const arr: any = await res.json();
        const out: Record<string, number> = {};
        for (const t of Array.isArray(arr) ? arr : []) {
          out[String(t.symbol).toUpperCase()] = parseFloat(t.price);
        }
        if (Object.keys(out).length > 0) return out;
      }
    } catch {
      // try the next endpoint
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// P&L helpers (leverage is implicit: margin = notional / leverage)
// ---------------------------------------------------------------------------
function calcPnl(side: 'LONG' | 'SHORT', entry: number, exit: number, qty: number): number {
  const raw = side === 'LONG' ? (exit - entry) * qty : (entry - exit) * qty;
  return Math.round(raw * 100) / 100;
}

export function unrealizedPnl(pos: IPosition, price: number): number {
  if (pos.status !== 'OPEN' || !pos.remainingQuantity) return 0;
  return calcPnl(pos.side, pos.entryPrice, price, pos.remainingQuantity);
}

/** Leveraged percentage on the locked margin (5x leverage => 5x the price move). */
export function unrealizedPnlPct(pos: IPosition, price: number): number {
  if (!pos.margin) return 0;
  return (unrealizedPnl(pos, price) / pos.margin) * 100;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
class TradeEngine {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private state: TradeEngineState = {
    isRunning: false,
    pollIntervalMs: POLL_INTERVAL_MS,
    leverage: DEFAULT_LEVERAGE,
    tp1ClosePct: TP1_CLOSE_PCT,
    lastTickAt: null,
    lastError: null,
    positionsCreatedTotal: 0,
    positionsClosedTotal: 0,
    signalsIngestedTotal: 0,
    lastIngestedSignal: null,
    lastIngestAt: null,
    lastIngestCreated: 0,
    lastIngestNote: null,
    lastIngestCode: null,
    knownUserIds: [],
    lastTickSummary: emptySummary(),
  };

  public getState(): TradeEngineState {
    return { ...this.state, lastTickSummary: { ...this.state.lastTickSummary } };
  }

  public initialize(): void {
    if (this.timer) return;
    this.state.isRunning = true;
    // first pass shortly after boot, then on a fixed interval
    setTimeout(() => {
      void this.tick();
    }, 5_000);
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    console.log(
      `[trade] engine started (poll ${POLL_INTERVAL_MS}ms, leverage ${DEFAULT_LEVERAGE}x, TP1 close ${TP1_CLOSE_PCT}%)`
    );
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.isRunning = false;
  }

  /**
   * Every user key the engine must serve: registered admin users PLUS anyone
   * who already owns a trade account or a position. Without the extra sources a
   * stale browser token (or a freshly wiped store) could leave the logged-in
   * user out of `getAllUsers()` and their orders would never be created.
   */
  private async resolveUserIds(): Promise<string[]> {
    const ids = new Set<string>();
    try {
      for (const u of await dbRepo.getAllUsers()) {
        const id = String((u as any).id || (u as any)._id || '');
        if (id) ids.add(id);
      }
    } catch {
      /* ignore */
    }
    try {
      for (const id of await dbRepo.getAllTradeAccountUserIds()) {
        if (id) ids.add(String(id));
      }
    } catch {
      /* ignore */
    }
    try {
      for (const p of await dbRepo.getPositions()) {
        if (p?.userId) ids.add(String(p.userId));
      }
    } catch {
      /* ignore */
    }
    this.state.knownUserIds = [...ids];
    return this.state.knownUserIds;
  }

  // =========================================================================
  // DIRECT LINK — called by the Signals engine the moment a signal qualifies
  // =========================================================================
  /**
   * Takes a freshly registered qualified signal and immediately creates a
   * pending order for every account. If the market price is already at the
   * entry level the order is filled right away.
   */
  public async ingestSignal(
    signal: IRegisteredSignal
  ): Promise<{ created: number; note: string; code: IngestCode }> {
    this.state.lastIngestedSignal = {
      signalId: signal._id,
      symbol: signal.symbol,
      side: signal.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG',
      at: new Date().toISOString(),
    };
    this.state.lastIngestAt = new Date().toISOString();
    this.state.signalsIngestedTotal += 1;

    const finish = (created: number, note: string, code: IngestCode) => {
      this.state.lastIngestCreated = created;
      this.state.lastIngestNote = note;
      this.state.lastIngestCode = code;
      return { created, note, code };
    };

    if (!signal.isQualified) {
      return finish(0, 'سیگنال واجد شرایط نبود.', 'NOT_QUALIFIED');
    }
    if (!signal.entryPrice || !signal.stopLoss || !signal.takeProfit1 || !signal.takeProfit2) {
      return finish(0, 'نقطه ورود / حد ضرر / حد سود در سیگنال کامل نیست.', 'INCOMPLETE_LEVELS');
    }

    try {
      const prices = await fetchPrices([signal.symbol]);
      const price = prices[signal.symbol];
      if (!price) {
        return finish(0, 'قیمت لحظه‌ای نماد در دسترس نبود.', 'NO_PRICE');
      }

      const userIds = await this.resolveUserIds();
      if (userIds.length === 0) {
        return finish(0, 'کاربری برای حساب معاملاتی وجود ندارد.', 'NO_USERS');
      }

      const side: 'LONG' | 'SHORT' =
        signal.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG';

      // ---- entry-quality filter: pullbacks only ----
      if (ENTRIES_MODE === 'pullback' && !isPullbackEntry(side, signal.entryPrice, price)) {
        return finish(
          0,
          `ورود شکست (Breakout) رد شد — فقط ورود پولبک پذیرفته می‌شود (${signal.symbol}).`,
          'BREAKOUT_REJECTED'
        );
      }

      const triggerAbove = signal.entryPrice > price;
      let created = 0;

      for (const uid of userIds) {
        if (!uid) continue;

        const account = await dbRepo.getOrCreateTradeAccount(uid);
        const positions = await dbRepo.getPositions(uid);

        // never duplicate the same signal, and keep one active order per symbol
        if (positions.some((p) => p.signalId === signal._id)) continue;
        if (positions.some((p) => p.symbol === signal.symbol && p.status !== 'CLOSED')) {
          continue;
        }

        const usedMargin = positions
          .filter((p) => p.status === 'PENDING' || p.status === 'OPEN')
          .reduce((acc, p) => acc + (Number(p.margin) || 0), 0);
        const freeMargin = account.balance - usedMargin;
        const margin = Math.min(
          (account.balance * (account.marginPerTradePct || 20)) / 100,
          freeMargin
        );
        if (margin < MIN_MARGIN_USD) continue;

        const leverage = account.leverage || DEFAULT_LEVERAGE;
        const notional = margin * leverage;
        const quantity = notional / signal.entryPrice;

        await dbRepo.createPosition({
          userId: uid,
          signalId: signal._id,
          symbol: signal.symbol,
          label: signal.label || signal.symbol,
          side,
          leverage,
          status: 'PENDING',
          triggerAbove,
          entryTarget: signal.entryPrice,
          entryPrice: 0,
          stopLoss: signal.stopLoss,
          takeProfit1: signal.takeProfit1,
          takeProfit2: signal.takeProfit2,
          quantity,
          remainingQuantity: quantity,
          notional,
          margin,
          realizedPnl: 0,
          tp1Hit: false,
          closeReason: '',
          signalCycleNumber: signal.cycleNumber || 0,
          aiEngineUsed: signal.aiEngineUsed || '',
          averageScore: signal.averageScore || 0,
          fills: [],
          openedAt: null,
          closedAt: null,
        });

        created += 1;
        this.state.positionsCreatedTotal += 1;
      }

      // Immediately try to fill: if the price is already at the entry level the
      // order becomes an OPEN position right now.
      await this.processActivePositions();

      const note =
        created > 0
          ? `سفارش ${side === 'LONG' ? 'خرید' : 'فروش'} برای ${signal.symbol} ساخته شد و به نقطه ورود ${signal.entryPrice} وصل شد.`
          : 'سفارشی ساخته نشد (نماد از قبل پوزیشن فعال دارد یا مارجین آزاد کافی نیست).';
      console.log(`[trade] ingested signal ${signal.symbol} ${side} -> created ${created}`);
      return finish(created, note, created > 0 ? 'CREATED' : 'SYMBOL_ACTIVE_OR_NO_MARGIN');
    } catch (err: any) {
      const msg = err?.message || 'خطای غیرمنتظره در دریافت سیگنال';
      this.state.lastError = msg;
      return finish(0, msg, 'ERROR');
    }
  }

  // =========================================================================
  // Periodic safety-net tick
  // =========================================================================
  public async tick(): Promise<TradeTickSummary> {
    const summary = emptySummary();
    if (this.isTicking) return summary;
    this.isTicking = true;

    try {
      // 1. make sure every known user owns a virtual account
      const accounts: ITradeAccount[] = [];
      for (const uid of await this.resolveUserIds()) {
        if (!uid) continue;
        accounts.push(await dbRepo.getOrCreateTradeAccount(uid));
      }

      // 2. recent qualified signals — a SAFETY NET only.
      //
      // A signal that already went through the direct hand-off carries a
      // `tradeStatus`. It MUST be skipped here: the pullback/breakout decision
      // has to be made once, against the price at signal time. Re-testing it on
      // a later tick re-classifies it against the NEW price, so a breakout that
      // was correctly rejected could come back minutes later as a "pullback"
      // and open a position that was never wanted.
      const allSignals = await dbRepo.getRegisteredSignals();
      const now = Date.now();
      const qualifiedSignals = allSignals.filter((s) => {
        if (!s.isQualified) return false;
        // already decided by the direct hand-off (tradeDispatchedAt covers rows
        // written before tradeStatus existed)
        if (s.tradeStatus || s.tradeDispatchedAt) return false;
        if (!s.entryPrice || !s.stopLoss || !s.takeProfit1 || !s.takeProfit2) return false;
        return now - new Date(s.createdAt).getTime() <= SIGNAL_MAX_AGE_MS;
      });

      // 3. one price snapshot for everything we care about
      const activePositions = await dbRepo.getActivePositions();
      const symbolSet = new Set<string>([
        ...qualifiedSignals.map((s) => s.symbol),
        ...activePositions.map((p) => p.symbol),
      ]);
      const prices = await fetchPrices([...symbolSet]);

      // 4. create pending orders for signals that were not handed over directly
      for (const account of accounts) {
        const positions = await dbRepo.getPositions(account.userId);
        const seenSignalIds = new Set(positions.map((p) => p.signalId));
        const activeSymbols = new Set(
          positions.filter((p) => p.status !== 'CLOSED').map((p) => p.symbol)
        );
        let usedMargin = positions
          .filter((p) => p.status === 'PENDING' || p.status === 'OPEN')
          .reduce((acc, p) => acc + (Number(p.margin) || 0), 0);
        let freeMargin = account.balance - usedMargin;

        for (const sig of qualifiedSignals) {
          if (seenSignalIds.has(sig._id)) continue;
          if (activeSymbols.has(sig.symbol)) continue;

          const price = prices[sig.symbol];
          if (!price) continue;

          const side: 'LONG' | 'SHORT' =
            sig.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG';

          // same entry-quality filter as the direct hand-off
          if (ENTRIES_MODE === 'pullback' && !isPullbackEntry(side, sig.entryPrice, price)) {
            seenSignalIds.add(sig._id);
            continue;
          }

          const margin = Math.min(
            (account.balance * (account.marginPerTradePct || 20)) / 100,
            freeMargin
          );
          if (margin < MIN_MARGIN_USD) continue;

          const leverage = account.leverage || DEFAULT_LEVERAGE;
          const notional = margin * leverage;
          const quantity = notional / sig.entryPrice;

          await dbRepo.createPosition({
            userId: account.userId,
            signalId: sig._id,
            symbol: sig.symbol,
            label: sig.label || sig.symbol,
            side,
            leverage,
            status: 'PENDING',
            triggerAbove: sig.entryPrice > price,
            entryTarget: sig.entryPrice,
            entryPrice: 0,
            stopLoss: sig.stopLoss,
            takeProfit1: sig.takeProfit1,
            takeProfit2: sig.takeProfit2,
            quantity,
            remainingQuantity: quantity,
            notional,
            margin,
            realizedPnl: 0,
            tp1Hit: false,
            closeReason: '',
            signalCycleNumber: sig.cycleNumber || 0,
            aiEngineUsed: sig.aiEngineUsed || '',
            averageScore: sig.averageScore || 0,
            fills: [],
            openedAt: null,
            closedAt: null,
          });

          seenSignalIds.add(sig._id);
          activeSymbols.add(sig.symbol);
          usedMargin += margin;
          freeMargin -= margin;
          summary.pendingCreated += 1;
          this.state.positionsCreatedTotal += 1;
        }
      }

      // 5. fill pending orders that reached entry, then manage SL/TP
      const openPositions = await dbRepo.getActivePositions();
      await this.applyMarketToPositions(openPositions, prices, summary);

      this.state.lastTickAt = new Date().toISOString();
      this.state.lastError = null;
      this.state.lastTickSummary = summary;
      return summary;
    } catch (err: any) {
      this.state.lastError = err?.message || 'خطای غیرمنتظره در موتور معاملات';
      this.state.lastTickAt = new Date().toISOString();
      console.error('[trade] tick error:', this.state.lastError);
      return summary;
    } finally {
      this.isTicking = false;
    }
  }

  /** Public: monitor active positions against a fresh price snapshot. */
  public async processActivePositions(): Promise<TradeTickSummary> {
    const summary = emptySummary();
    const active = await dbRepo.getActivePositions();
    if (active.length === 0) return summary;
    const prices = await fetchPrices([...new Set(active.map((p) => p.symbol))]);
    await this.applyMarketToPositions(active, prices, summary);
    return summary;
  }

  /** Fills pending orders and applies SL / TP1 / TP2 to open positions. */
  private async applyMarketToPositions(
    positions: IPosition[],
    prices: Record<string, number>,
    summary: TradeTickSummary
  ): Promise<void> {
    for (const original of positions) {
      let pos = original;
      const price = prices[pos.symbol];
      if (!price) continue;
      const nowIso = new Date().toISOString();

      // ---- PENDING -> OPEN when the entry level is reached ----
      if (pos.status === 'PENDING') {
        const tol = Math.abs(pos.entryTarget) * ENTRY_TOLERANCE_PCT;
        const reached = pos.triggerAbove
          ? price >= pos.entryTarget - tol
          : price <= pos.entryTarget + tol;
        if (!reached) continue;

        // Fill AT the signal entry level, not at whatever the market happens to
        // be. If the price jumped past the entry, filling at the market would put
        // the signal's SL/TP on the wrong side of the fill and a "take profit"
        // could close as a loss.
        const entryPrice = pos.entryTarget;
        const quantity = pos.notional / entryPrice;
        const fill: IPositionFill = {
          type: 'OPEN',
          price: entryPrice,
          quantity,
          pnl: 0,
          note: `ورود در نقطه ${entryPrice} (${pos.side === 'LONG' ? 'خرید' : 'فروش'} با اهرم ${pos.leverage}x)`,
          at: nowIso,
        };
        await dbRepo.updatePosition(pos._id, {
          status: 'OPEN',
          entryPrice,
          quantity,
          remainingQuantity: quantity,
          openedAt: nowIso,
          fills: [...(pos.fills || []), fill],
        });
        summary.filled += 1;
        // keep going in this same pass with the freshly opened position, so a
        // TP1 / SL that is already reached is handled right away
        pos = {
          ...pos,
          status: 'OPEN',
          entryPrice,
          quantity,
          remainingQuantity: quantity,
          openedAt: nowIso,
          fills: [...(pos.fills || []), fill],
        };
      }

      if (pos.status !== 'OPEN') continue;

      const isLong = pos.side === 'LONG';
      const slHit = isLong ? price <= pos.stopLoss : price >= pos.stopLoss;
      const tp2Hit = isLong ? price >= pos.takeProfit2 : price <= pos.takeProfit2;
      const tp1Hit = isLong ? price >= pos.takeProfit1 : price <= pos.takeProfit1;

      const closeAll = async (exitPrice: number, reason: string) => {
        const qty = pos.remainingQuantity;
        const pnl = calcPnl(pos.side, pos.entryPrice, exitPrice, qty);
        const account = await dbRepo.getOrCreateTradeAccount(pos.userId);
        await dbRepo.updateTradeAccount(pos.userId, {
          balance: Math.round((account.balance + pnl) * 100) / 100,
        });
        await dbRepo.updatePosition(pos._id, {
          status: 'CLOSED',
          remainingQuantity: 0,
          realizedPnl: Math.round((pos.realizedPnl + pnl) * 100) / 100,
          closeReason: reason,
          closedAt: nowIso,
          fills: [
            ...(pos.fills || []),
            { type: 'CLOSE', price: exitPrice, quantity: qty, pnl, note: reason, at: nowIso },
          ],
        });
        summary.closed += 1;
        this.state.positionsClosedTotal += 1;
      };

      if (slHit) {
        await closeAll(pos.stopLoss, 'حد ضرر (Stop Loss)');
        continue;
      }
      if (tp2Hit) {
        await closeAll(pos.takeProfit2, 'حد سود دوم (TP2)');
        continue;
      }
      if (tp1Hit && !pos.tp1Hit) {
        const qty = pos.quantity * (TP1_CLOSE_PCT / 100);
        const pnl = calcPnl(pos.side, pos.entryPrice, pos.takeProfit1, qty);
        const account = await dbRepo.getOrCreateTradeAccount(pos.userId);
        await dbRepo.updateTradeAccount(pos.userId, {
          balance: Math.round((account.balance + pnl) * 100) / 100,
        });
        await dbRepo.updatePosition(pos._id, {
          tp1Hit: true,
          remainingQuantity: Math.max(0, pos.remainingQuantity - qty),
          realizedPnl: Math.round((pos.realizedPnl + pnl) * 100) / 100,
          closeReason: 'حد سود اول (TP1) — ۵۰٪ بسته شد',
          fills: [
            ...(pos.fills || []),
            {
              type: 'PARTIAL_CLOSE',
              price: pos.takeProfit1,
              quantity: qty,
              pnl,
              note: `بستن ${TP1_CLOSE_PCT}٪ در حد سود اول`,
              at: nowIso,
            },
          ],
        });
        summary.partiallyClosed += 1;
      }
    }
  }
}

export const tradeEngine = new TradeEngine();
