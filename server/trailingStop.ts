/**
 * Trailing Stop Engine (موتور حد ضرر متحرک)
 * ---------------------------------------------------------------------------
 * Protects an open WEEX position as it moves into profit. The ladder is:
 *
 *   profit ≥ 6%   → move the stop to the entry price (breakeven)
 *   profit ≥ 10%  → lock +5%
 *   profit ≥ 15%  → lock +10%
 *   profit ≥ 20%  → lock +15%   … every extra 5% locks the previous step
 *
 * The stop never moves backwards: each step only tightens it, and the ladder
 * keeps running until the main take-profit is hit and the position is closed.
 *
 * "Profit %" is measured the same way the WEEX panel shows it by default
 * (`roe`): the price move multiplied by the position leverage, i.e. profit on
 * the posted margin. Set `WEEX_TRAIL_BASIS=price` to use the raw price move
 * instead (useful for 1x positions, where both are identical).
 *
 * The module is pure: `weexEngine.tick()` feeds it a position + live price and
 * applies the returned stop level (locally for paper, on the exchange for live
 * positions through `updateProtection`).
 */

import type { IWeexPosition } from './models.js';

export interface TrailingStopConfig {
  enabled: boolean;
  /** `roe` = price move × leverage (panel number), `price` = raw price move. */
  basis: 'roe' | 'price';
  /** Move the stop to breakeven once profit reaches this percentage. */
  breakevenAt: number;
  /** First profit-lock step (the stop jumps to `step` % profit here). */
  firstLockAt: number;
  /** Distance between the following lock steps. */
  step: number;
}

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function loadTrailingStopConfig(env: NodeJS.ProcessEnv = process.env): TrailingStopConfig {
  const enabled = String(env.WEEX_TRAILING_STOP ?? 'true').toLowerCase() !== 'false';
  const basis =
    String(env.WEEX_TRAIL_BASIS ?? 'roe').trim().toLowerCase() === 'price' ? 'price' : 'roe';

  const breakevenAt = envNumber('WEEX_TRAIL_BREAKEVEN_PCT', 6);
  const step = envNumber('WEEX_TRAIL_STEP_PCT', 5);
  // The first lock must sit above breakeven (default: lock 5% at 10% profit).
  const firstLockAt = Math.max(
    envNumber('WEEX_TRAIL_FIRST_LOCK_PCT', 10),
    breakevenAt + 1
  );

  return { enabled, basis, breakevenAt, firstLockAt, step };
}

/** Signed profit percentage of the position at `price` (positive = in profit). */
export function profitPercent(
  position: Pick<IWeexPosition, 'side' | 'entryPrice' | 'leverage'>,
  price: number,
  config: TrailingStopConfig
): number {
  const entry = Number(position.entryPrice) || 0;
  if (entry <= 0 || price <= 0) return 0;

  const movePct =
    position.side === 'LONG' ? ((price - entry) / entry) * 100 : ((entry - price) / entry) * 100;

  if (config.basis === 'price') return movePct;
  const leverage = Math.max(1, Number(position.leverage) || 1);
  return movePct * leverage;
}

export interface TrailingStopDecision {
  /** New stop price, or null when the stop must stay where it is. */
  target: number | null;
  /** Profit percentage used for the decision. */
  profitPct: number;
  /** Profit percentage (in the configured basis) the stop is locking in. */
  lockPct: number;
  /** Text shown in the position note. */
  reason: string;
}

/**
 * Computes the stop level the ladder asks for at `price`.
 * Only the price is returned — "is it better than the current stop?" is the
 * caller's job, because the engine also needs to ignore stale/backwards steps.
 */
export function trailingStopPrice(
  position: Pick<
    IWeexPosition,
    'side' | 'entryPrice' | 'leverage' | 'takeProfit1' | 'takeProfit2'
  >,
  price: number,
  config: TrailingStopConfig = loadTrailingStopConfig()
): TrailingStopDecision {
  const none: TrailingStopDecision = {
    target: null,
    profitPct: 0,
    lockPct: 0,
    reason: '',
  };

  const entry = Number(position.entryPrice) || 0;
  if (!config.enabled || entry <= 0 || price <= 0) return none;

  const profitPct = profitPercent(position, price, config);
  if (!Number.isFinite(profitPct) || profitPct < config.breakevenAt) {
    return { ...none, profitPct };
  }

  // ---- ladder ----
  let lockPct = 0; // breakeven
  if (profitPct >= config.firstLockAt) {
    // tolerance: 9.999999% must count as the 10% step
    const stepIndex = Math.floor((profitPct + 1e-6) / config.step);
    lockPct = Math.max(0, stepIndex * config.step - config.step);
  }

  // Convert the locked percentage back into a price offset.
  const leverage = Math.max(1, Number(position.leverage) || 1);
  const lockMovePct = config.basis === 'roe' ? lockPct / leverage : lockPct;

  let target =
    position.side === 'LONG' ? entry * (1 + lockMovePct / 100) : entry * (1 - lockMovePct / 100);

  // Never let the moving stop run past the final take-profit: the position must
  // close on the TP, not be knocked out by its own protection.
  const finalTp =
    position.takeProfit2 > 0 ? position.takeProfit2 : position.takeProfit1;
  if (finalTp > 0) {
    if (position.side === 'LONG') target = Math.min(target, finalTp * 0.999999);
    else target = Math.max(target, finalTp * 1.000001);
  }

  // Keep a sane distance from the entry so the stop is never equal to it after
  // rounding (exchanges reject a stop sitting exactly on the entry price).
  if (position.side === 'LONG') target = Math.max(target, entry * 1.000001);
  else target = Math.min(target, entry * 0.999999);

  target = Math.round(target * 1e8) / 1e8;

  const reason =
    lockPct > 0
      ? `حد ضرر متحرک: سود ${profitPct.toFixed(1)}٪ → قفل ${lockPct}٪ سود`
      : `حد ضرر متحرک: سود ${profitPct.toFixed(1)}٪ → انتقال به نقطه ورود (ریسک‌فری)`;

  return { target, profitPct, lockPct, reason };
}

/** True when `candidate` is a tighter stop than `current` for this side. */
export function isTighterStop(
  side: 'LONG' | 'SHORT',
  candidate: number,
  current: number
): boolean {
  if (!Number.isFinite(candidate) || candidate <= 0) return false;
  if (!Number.isFinite(current) || current <= 0) return true;
  const epsilon = Math.max(1e-8, Math.abs(current) * 1e-9);
  return side === 'LONG' ? candidate > current + epsilon : candidate < current - epsilon;
}
