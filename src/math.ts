import { InputError } from "./errors";
import { reqFinite, reqNonNegative, reqPositive } from "./numbers";
import type { VenueId } from "./symbols";

export const HOURS_PER_YEAR = 365 * 24;
export const DEFAULT_ENTRY_FEE = 0.0005;
export const DEFAULT_EXIT_FEE = 0.0005;
export const DEFAULT_WINDOW_HOURS = 168;
export const EXTREME_RATE = 0.05;

export type Side = "long" | "short";
export type Severity = "loud" | "note";
export type RateKind = "predicted" | "last_settled";
export type IntervalSource = "venue" | "default";

export interface Warning {
  code: string;
  severity: Severity;
  message: string;
}

export interface TargetProfit {
  mode: "percent" | "fixed";
  value: number;
}

export const DEFAULT_TARGET: TargetProfit = { mode: "percent", value: 1 };

export interface PositionInput {
  asset: string;
  side: Side;
  entry: number;
  leverage: number;
  holdHours: number;
  qty?: number;
  notional?: number;
  entryFeeRate?: number;
  exitFeeRate?: number;
  targetProfit?: TargetProfit;
  historyWindowHours?: number;
  focus?: string;
}

export interface SettledSample {
  timeMs: number;
  rate: number;
}

export interface VenueQuote {
  venue: VenueId | string;
  symbol: string;
  intervalHours: number;
  intervalSource?: IntervalSource;
  currentRate: number;
  currentRateKind: RateKind;
  history: SettledSample[];
  markPrice: number | null;
  fetchedAtMs?: number;
}

export interface VenueFailure {
  venue: string;
  message: string;
}

export interface Projection {
  rate: number;
  intervals: number;
  fundingQuote: number;
  annualizedCarry: number;
  breakevenPrice: number;
  breakevenMove: number;
  hoursToEatTarget: number | null;
  exitFeeAtBreakeven: number;
}

export interface VenueProjection {
  venue: string;
  symbol: string;
  intervalHours: number;
  intervalSource: IntervalSource;
  currentRateKind: RateKind;
  sampleCount: number;
  oldestSampleMs: number | null;
  newestSampleMs: number | null;
  markPrice: number | null;
  paidBy: "longs" | "shorts" | "flat";
  rank: number;
  current: Projection;
  trailing: Projection | null;
}

export interface FundingResult {
  asset: string;
  side: Side;
  qtyBase: number;
  notional: number;
  entry: number;
  leverage: number;
  margin: number;
  holdHours: number;
  entryFeeRate: number;
  exitFeeRate: number;
  entryFee: number;
  targetProfit: TargetProfit;
  targetProfitQuote: number;
  historyWindowHours: number;
  focus: string;
  cheapest: string;
  warnings: Warning[];
  venues: VenueProjection[];
  failures: VenueFailure[];
}

export function sideSign(side: Side): 1 | -1 {
  return side === "long" ? 1 : -1;
}

export function reqSide(value: string): Side {
  if (value === "long" || value === "short") return value;
  throw new InputError("BAD_SIDE", 'Side must be "long" or "short".');
}

/** Positive means the position pays. Negative means the position receives. */
export function fundingQuoteOf(
  side: Side,
  rate: number,
  notional: number,
  holdHours: number,
  intervalHours: number,
): number {
  return sideSign(side) * rate * notional * (holdHours / intervalHours);
}

/** Positive means the position receives funding over a year. No compounding. */
export function annualizedCarryOf(side: Side, rate: number, intervalHours: number): number {
  return -sideSign(side) * rate * (HOURS_PER_YEAR / intervalHours);
}

export function breakevenPriceOf(input: {
  side: Side;
  qty: number;
  entry: number;
  entryFeeRate: number;
  exitFeeRate: number;
  fundingQuote: number;
}): number {
  const entryFee = input.entryFeeRate * input.qty * input.entry;
  if (input.side === "long") {
    const denom = input.qty * (1 - input.exitFeeRate);
    return (input.qty * input.entry + entryFee + input.fundingQuote) / denom;
  }
  const denom = input.qty * (1 + input.exitFeeRate);
  return (input.qty * input.entry - entryFee - input.fundingQuote) / denom;
}

/** Positive means price has to move in the position's favor by this fraction of entry. */
export function favorableMove(side: Side, entry: number, breakeven: number): number {
  if (side === "long") return (breakeven - entry) / entry;
  return (entry - breakeven) / entry;
}

export function hoursToEatOf(
  side: Side,
  rate: number,
  notional: number,
  intervalHours: number,
  targetQuote: number,
): number | null {
  const costPerHour = (sideSign(side) * rate * notional) / intervalHours;
  if (!(costPerHour > 0)) return null;
  return targetQuote / costPerHour;
}

export function netAt(input: {
  side: Side;
  qty: number;
  entry: number;
  price: number;
  entryFeeRate: number;
  exitFeeRate: number;
  fundingQuote: number;
}): number {
  const pricePnl =
    input.side === "long" ? input.qty * (input.price - input.entry) : input.qty * (input.entry - input.price);
  const entryFee = input.entryFeeRate * input.qty * input.entry;
  const exitFee = input.exitFeeRate * input.qty * input.price;
  return pricePnl - entryFee - exitFee - input.fundingQuote;
}

export function paidBy(rate: number): "longs" | "shorts" | "flat" {
  if (rate > 0) return "longs";
  if (rate < 0) return "shorts";
  return "flat";
}

export interface TrailingWindow {
  rate: number;
  count: number;
  oldestMs: number;
  newestMs: number;
}

export function trailingWindow(history: SettledSample[], windowHours: number): TrailingWindow | null {
  const valid = history.filter((sample) => Number.isFinite(sample.timeMs) && Number.isFinite(sample.rate));
  if (valid.length === 0) return null;
  let newest = valid[0]?.timeMs ?? 0;
  for (const sample of valid) {
    if (sample.timeMs > newest) newest = sample.timeMs;
  }
  const start = newest - windowHours * 3_600_000;
  const chosen = valid.filter((sample) => sample.timeMs >= start && sample.timeMs <= newest);
  if (chosen.length === 0) return null;
  let sum = 0;
  let oldest = chosen[0]?.timeMs ?? newest;
  for (const sample of chosen) {
    sum += sample.rate;
    if (sample.timeMs < oldest) oldest = sample.timeMs;
  }
  return { rate: sum / chosen.length, count: chosen.length, oldestMs: oldest, newestMs: newest };
}

function feeRate(name: string, value: number | undefined, fallback: number): number {
  const n = value === undefined ? fallback : reqFinite(name, value);
  if (n < 0) {
    throw new InputError("NEGATIVE_FEE", `${name} cannot be negative. Use 0 if the venue pays you to trade.`);
  }
  if (n >= 1) {
    throw new InputError("FEE_TOO_HIGH", `${name} must be below 1. 0.0005 is 5 basis points.`);
  }
  return n;
}

function resolveSize(
  entry: number,
  qty: number | undefined,
  notional: number | undefined,
): { qty: number; notional: number } {
  const hasQty = qty !== undefined;
  const hasNotional = notional !== undefined;
  if (!hasQty && !hasNotional) {
    throw new InputError("MISSING", "Pass qty or notional.");
  }
  if (hasQty && hasNotional) {
    const q = reqPositive("qty", qty);
    const n = reqPositive("notional", notional);
    const implied = q * entry;
    const scale = Math.max(1, Math.abs(n));
    if (Math.abs(implied - n) > 1e-6 * scale) {
      throw new InputError("SIZE_MISMATCH", "qty times entry does not equal notional.");
    }
    return { qty: q, notional: n };
  }
  if (hasQty) {
    const q = reqPositive("qty", qty);
    return { qty: q, notional: q * entry };
  }
  const n = reqPositive("notional", notional);
  return { qty: n / entry, notional: n };
}

function targetQuoteOf(target: TargetProfit, notional: number): number {
  if (target.mode === "percent") {
    const value = reqNonNegative("targetProfit.value", target.value);
    if (value > 100) {
      throw new InputError("TARGET_PERCENT", "A percent target above 100 is rejected. 1 means 1 percent of notional.");
    }
    return notional * (value / 100);
  }
  if (target.mode !== "fixed") {
    throw new InputError("INVALID_INPUT", 'targetProfit.mode must be "percent" or "fixed".');
  }
  return reqNonNegative("targetProfit.value", target.value);
}

function projectOne(input: {
  side: Side;
  qty: number;
  entry: number;
  notional: number;
  entryFeeRate: number;
  exitFeeRate: number;
  holdHours: number;
  intervalHours: number;
  rate: number;
  targetQuote: number;
}): Projection {
  const fundingQuote = fundingQuoteOf(input.side, input.rate, input.notional, input.holdHours, input.intervalHours);
  const breakevenPrice = breakevenPriceOf({
    side: input.side,
    qty: input.qty,
    entry: input.entry,
    entryFeeRate: input.entryFeeRate,
    exitFeeRate: input.exitFeeRate,
    fundingQuote,
  });
  return {
    rate: input.rate,
    intervals: input.holdHours / input.intervalHours,
    fundingQuote,
    annualizedCarry: annualizedCarryOf(input.side, input.rate, input.intervalHours),
    breakevenPrice,
    breakevenMove: favorableMove(input.side, input.entry, breakevenPrice),
    hoursToEatTarget: hoursToEatOf(input.side, input.rate, input.notional, input.intervalHours, input.targetQuote),
    exitFeeAtBreakeven: input.exitFeeRate * input.qty * breakevenPrice,
  };
}

function compact(n: number): string {
  const abs = Math.abs(n);
  const digits = abs === 0 ? 2 : abs >= 1000 ? 4 : abs >= 1 ? 6 : 8;
  const text = n.toFixed(digits);
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

function integerIntervals(holdHours: number, intervalHours: number): boolean {
  const n = holdHours / intervalHours;
  return Math.abs(n - Math.round(n)) < 1e-9;
}

export function projectFunding(
  input: PositionInput,
  quotes: VenueQuote[],
  options: { failures?: VenueFailure[]; focus?: string } = {},
): FundingResult {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new InputError("NO_QUOTES", "No venue returned a funding rate.");
  }
  const asset = input.asset.trim();
  if (!asset) throw new InputError("MISSING", "Missing asset.");
  const side = reqSide(input.side);
  const entry = reqPositive("entry", input.entry);
  const leverage = reqPositive("leverage", input.leverage);
  const holdHours = reqPositive("holdHours", input.holdHours);
  const windowHours =
    input.historyWindowHours === undefined
      ? DEFAULT_WINDOW_HOURS
      : reqPositive("historyWindowHours", input.historyWindowHours);
  const entryFeeRate = feeRate("entryFeeRate", input.entryFeeRate, DEFAULT_ENTRY_FEE);
  const exitFeeRate = feeRate("exitFeeRate", input.exitFeeRate, DEFAULT_EXIT_FEE);
  const target = input.targetProfit ?? DEFAULT_TARGET;
  const size = resolveSize(entry, input.qty, input.notional);
  const targetQuote = targetQuoteOf(target, size.notional);

  const seen = new Set<string>();
  const built: VenueProjection[] = [];
  for (const quote of quotes) {
    const venue = String(quote.venue);
    if (seen.has(venue)) {
      throw new InputError("INVALID_INPUT", `Duplicate venue "${venue}".`);
    }
    seen.add(venue);
    const intervalHours = reqPositive(`${venue} intervalHours`, quote.intervalHours);
    const currentRate = reqFinite(`${venue} currentRate`, quote.currentRate);
    const trail = trailingWindow(quote.history ?? [], windowHours);
    const shared = {
      side,
      qty: size.qty,
      entry,
      notional: size.notional,
      entryFeeRate,
      exitFeeRate,
      holdHours,
      intervalHours,
      targetQuote,
    };
    built.push({
      venue,
      symbol: quote.symbol,
      intervalHours,
      intervalSource: quote.intervalSource ?? "venue",
      currentRateKind: quote.currentRateKind,
      sampleCount: trail?.count ?? 0,
      oldestSampleMs: trail?.oldestMs ?? null,
      newestSampleMs: trail?.newestMs ?? null,
      markPrice: quote.markPrice,
      paidBy: paidBy(currentRate),
      rank: 0,
      current: projectOne({ ...shared, rate: currentRate }),
      trailing: trail ? projectOne({ ...shared, rate: trail.rate }) : null,
    });
  }

  built.sort((a, b) => a.current.fundingQuote - b.current.fundingQuote || a.venue.localeCompare(b.venue));
  built.forEach((venue, index) => {
    venue.rank = index + 1;
  });

  const cheapest = built[0];
  if (!cheapest) throw new InputError("NO_QUOTES", "No venue returned a funding rate.");
  const focusName = options.focus ?? input.focus ?? cheapest.venue;
  const focus = built.find((venue) => venue.venue === focusName);
  if (!focus) {
    throw new InputError("FOCUS_UNAVAILABLE", `Focus venue "${focusName}" did not return a rate.`);
  }

  const warnings: Warning[] = [];
  const failures = options.failures ?? [];
  for (const failure of failures) {
    warnings.push({
      code: "VENUE_UNAVAILABLE",
      severity: "note",
      message: `${failure.venue} did not return a rate. ${failure.message}`,
    });
  }

  const eatParts: string[] = [];
  if (focus.current.hoursToEatTarget !== null && focus.current.hoursToEatTarget < holdHours) {
    eatParts.push(`the current rate spends the target in ${compact(focus.current.hoursToEatTarget)} hours`);
  }
  if (focus.trailing?.hoursToEatTarget !== null && focus.trailing && focus.trailing.hoursToEatTarget < holdHours) {
    eatParts.push(`the trailing rate spends it in ${compact(focus.trailing.hoursToEatTarget)} hours`);
  }
  if (eatParts.length > 0) {
    warnings.push({
      code: "FUNDING_EATS_TARGET",
      severity: "loud",
      message: `On ${focus.venue}, ${eatParts.join(" and ")}. The hold is ${holdHours} hours. The target profit is gone before the hold ends.`,
    });
  }

  if (focus.trailing && focus.current.rate * focus.trailing.rate < 0) {
    warnings.push({
      code: "RATE_SIGN_DISAGREE",
      severity: "note",
      message: `On ${focus.venue} the current rate and the trailing average have opposite signs. One of them is the wrong regime for this hold.`,
    });
  }

  const shortHistory = built.filter((venue) => venue.sampleCount < 3).map((venue) => venue.venue);
  if (shortHistory.length > 0) {
    warnings.push({
      code: "HISTORY_SHORT",
      severity: "note",
      message: `Fewer than 3 settled prints in the ${windowHours} hour window: ${shortHistory.join(", ")}. The trailing average is thin.`,
    });
  }

  if (!integerIntervals(holdHours, focus.intervalHours)) {
    warnings.push({
      code: "FRACTIONAL_HOLD",
      severity: "note",
      message: `The hold is not a whole number of ${focus.venue} intervals. Funding is prorated. It is not rounded to the next settlement.`,
    });
  }

  const extreme = built.filter(
    (venue) => Math.abs(venue.current.rate) > EXTREME_RATE || Math.abs(venue.trailing?.rate ?? 0) > EXTREME_RATE,
  );
  if (extreme.length > 0) {
    warnings.push({
      code: "EXTREME_RATE",
      severity: "note",
      message: `A rate above ${EXTREME_RATE} per interval is outside the usual perp band: ${extreme.map((venue) => venue.venue).join(", ")}.`,
    });
  }

  if (focus.currentRateKind === "last_settled") {
    warnings.push({
      code: "CURRENT_IS_LAST_SETTLED",
      severity: "note",
      message: `${focus.venue} did not publish a predicted rate. The current figure is the latest settlement.`,
    });
  }

  if (focus.intervalSource === "default") {
    warnings.push({
      code: "INTERVAL_DEFAULTED",
      severity: "note",
      message: `${focus.venue} did not publish an interval. ${focus.intervalHours} hours is the default for that venue.`,
    });
  }

  const stale = quotes.filter((quote) => {
    if (quote.fetchedAtMs === undefined) return false;
    const trail = trailingWindow(quote.history ?? [], windowHours);
    if (!trail) return false;
    const gap = quote.fetchedAtMs - trail.newestMs;
    return gap > 2 * quote.intervalHours * 3_600_000;
  });
  if (stale.length > 0) {
    warnings.push({
      code: "STALE_HISTORY",
      severity: "note",
      message: `The newest settled print is more than two intervals behind the fetch: ${stale.map((quote) => quote.venue).join(", ")}.`,
    });
  }

  return {
    asset,
    side,
    qtyBase: size.qty,
    notional: size.notional,
    entry,
    leverage,
    margin: size.notional / leverage,
    holdHours,
    entryFeeRate,
    exitFeeRate,
    entryFee: entryFeeRate * size.notional,
    targetProfit: target,
    targetProfitQuote: targetQuote,
    historyWindowHours: windowHours,
    focus: focus.venue,
    cheapest: cheapest.venue,
    warnings,
    venues: built,
    failures,
  };
}
