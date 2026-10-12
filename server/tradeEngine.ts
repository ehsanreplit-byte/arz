/**
 * Demo Trade Engine (موتور معاملات مجازی)
 * ---------------------------------------------------------------------------
 * Turns qualified signals (>= 2 Al Brooks signals on one side) into paper
 * positions on a $100 virtual account:
 *
 *  1. Every new qualified signal becomes a PENDING position whose entry is the
 *     signal's entry price. The position waits until the market price actually
 *     REACHES that entry level, then it fills (like a real exchange order).
 *  2. Stop loss / take profits are taken 1:1 from the signal.
 *  3. Positions open with leverage (default 5x), so the displayed profit/loss
 *     percentage on margin is the price move multiplied by the leverage.
 *  4. At TP1, 50% of the order is closed. The remaining half runs to TP2 or SL.
 *  5. Realized profit/loss is applied directly to the account balance.
 */

import { dbRepo, IPosition, IPositionFill, ITradeAccount } from './models.js';

const POLL_INTERVAL_MS = Math.max(3000, Number(process.env.TRADE_POLL_INTERVAL_MS || 15000));
const DEFAULT_LEVERAGE = Math.max(1, Number(process.env.TRADE_LEVERAGE || 5));
const TP1_CLOSE_PCT = Math.min(100, Math.max(1, Number(process.env.TRADE_TP1_CLOSE_PCT || 50)));
const SIGNAL_MAX_AGE_MS = Math.max(
  60_000,
  Number(process.env.TRADE_SIGNAL_MAX_AGE_MS || 35 * 60 * 1000)
);
const MIN_MARGIN_USD = Number(process.env.TRADE_MIN_MARGIN_USD || 1);

export interface TradeEngineState {
  isRunning: boolean;
  pollIntervalMs: number;
  leverage: number;
  tp1ClosePct: number;
  lastTickAt: string | null;
  lastError: string | null;
  positionsCreatedTotal: number;
  positionsClosedTotal: number;
  lastTickSummary: {
    pendingCreated: number;
    filled: number;
    partiallyClosed: number;
    closed: number;
  };
}

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
    lastTickSummary: { pendingCreated: 0, filled: 0, partiallyClosed: 0, closed: 0 },
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
    }, 6_000);
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    console.log(`[trade] engine started (poll ${POLL_INTERVAL_MS}ms, leverage ${DEFAULT_LEVERAGE}x)`);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.isRunning = false;
  }

  /** Runs one full pass: create pending positions, fill them, then manage SL/TP. */
  public async tick(): Promise<TradeEngineState['lastTickSummary']> {
    const summary = { pendingCreated: 0, filled: 0, partiallyClosed: 0, closed: 0 };
    if (this.isTicking) return summary;
    this.isTicking = true;

    try {
      // ------------------------------------------------------------------
      // 1. Make sure every admin user owns a $100 virtual account
      // ------------------------------------------------------------------
      const users = await dbRepo.getAllUsers();
      const accounts: ITradeAccount[] = [];
      for (const u of users) {
        const uid = (u as any).id || (u as any)._id;
        if (!uid) continue;
        accounts.push(await dbRepo.getOrCreateTradeAccount(String(uid)));
      }

      // ------------------------------------------------------------------
      // 2. Collect recent qualified signals
      // ------------------------------------------------------------------
      const allSignals = await dbRepo.getRegisteredSignals();
      const now = Date.now();
      const qualifiedSignals = allSignals.filter((s) => {
        if (!s.isQualified) return false;
        if (!s.entryPrice || !s.stopLoss || !s.takeProfit1 || !s.takeProfit2) return false;
        const age = now - new Date(s.createdAt).getTime();
        return age <= SIGNAL_MAX_AGE_MS;
      });

      // ------------------------------------------------------------------
      // 3. One price snapshot for every symbol we care about
      // ------------------------------------------------------------------
      const activePositions = await dbRepo.getActivePositions();
      const symbolSet = new Set<string>([
        ...qualifiedSignals.map((s) => s.symbol),
        ...activePositions.map((p) => p.symbol),
      ]);
      const prices = await fetchPrices([...symbolSet]);

      // ------------------------------------------------------------------
      // 4. Create PENDING positions for signals not traded yet
      // ------------------------------------------------------------------
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

          const margin = Math.min(
            (account.balance * (account.marginPerTradePct || 20)) / 100,
            freeMargin
          );
          if (margin < MIN_MARGIN_USD) continue;

          const leverage = account.leverage || DEFAULT_LEVERAGE;
          const notional = margin * leverage;
          const quantity = notional / sig.entryPrice;

          // The order waits until the market price reaches the entry level.
          const triggerAbove = sig.entryPrice > price;

          await dbRepo.createPosition({
            userId: account.userId,
            signalId: sig._id,
            symbol: sig.symbol,
            label: sig.label || sig.symbol,
            side: sig.consensusDirection === 'SHORT' ? 'SHORT' : 'LONG',
            leverage,
            status: 'PENDING',
            triggerAbove,
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

      // ------------------------------------------------------------------
      // 5. Fill pending orders that reached their entry, then manage SL/TP
      // ------------------------------------------------------------------
      const openPositions = await dbRepo.getActivePositions();

      for (const pos of openPositions) {
        const price = prices[pos.symbol];
        if (!price) continue;
        const nowIso = new Date().toISOString();

        // ---- PENDING -> OPEN when the entry level is reached ----
        if (pos.status === 'PENDING') {
          const reached = pos.triggerAbove
            ? price >= pos.entryTarget
            : price <= pos.entryTarget;
          if (!reached) continue;

          const entryPrice = price;
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
          continue;
        }

        // ---- OPEN -> partial close at TP1 / full close at TP2 or SL ----
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
}

export const tradeEngine = new TradeEngine();
