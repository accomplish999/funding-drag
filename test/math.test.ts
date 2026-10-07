import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError } from "../src/errors";
import {
  HOURS_PER_YEAR,
  annualizedCarryOf,
  breakevenPriceOf,
  fundingQuoteOf,
  hoursToEatOf,
  netAt,
  projectFunding,
  type PositionInput,
  type VenueQuote,
} from "../src/math";

function close(actual: number, expected: number, tol = 1e-9): void {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol * scale, `${actual} !== ${expected}`);
}

function position(overrides: Partial<PositionInput> = {}): PositionInput {
  return {
    asset: "BTC",
    side: "long",
    entry: 100_000,
    leverage: 10,
    holdHours: 24,
    notional: 10_000,
    entryFeeRate: 0.0005,
    exitFeeRate: 0.0005,
    targetProfit: { mode: "percent", value: 1 },
    ...overrides,
  };
}

function quote(overrides: Partial<VenueQuote> = {}): VenueQuote {
  return {
    venue: "okx",
    symbol: "BTC-USDT-SWAP",
    intervalHours: 8,
    currentRate: 0.0001,
    currentRateKind: "predicted",
    markPrice: 100_000,
    history: [
      { timeMs: 1_791_360_000_000, rate: 0.0001 },
      { timeMs: 1_791_331_200_000, rate: 0.0001 },
      { timeMs: 1_791_302_400_000, rate: 0.0001 },
    ],
    ...overrides,
  };
}

test("funding over the hold is side, rate, notional, and the number of intervals", () => {
  close(fundingQuoteOf("long", 0.0001, 10_000, 24, 8), 3);
  close(fundingQuoteOf("short", 0.0001, 10_000, 24, 8), -3);
  close(fundingQuoteOf("long", 0.0001, 10_000, 12, 8), 1.5);
  const perNotional = fundingQuoteOf("long", 0.0001, 10_000, 24, 8) / 10_000;
  close(perNotional, 0.0001 * (24 / 8));
});

test("annualized carry is the rate times intervals in a 365 day year, signed as income", () => {
  close(annualizedCarryOf("long", 0.0001, 8), -0.0001 * (HOURS_PER_YEAR / 8));
  close(annualizedCarryOf("short", 0.0001, 8), 0.0001 * (HOURS_PER_YEAR / 8));
  close(HOURS_PER_YEAR / 8, 1095);
  close(annualizedCarryOf("long", 0.0001, 8), -0.1095);
});

test("an 8 hour rate and an hourly rate with the same carry cost the same over 24 hours", () => {
  const eight = fundingQuoteOf("long", 0.0001, 10_000, 24, 8);
  const hourly = fundingQuoteOf("long", 0.0000125, 10_000, 24, 1);
  close(eight, hourly);
  close(annualizedCarryOf("long", 0.0001, 8), annualizedCarryOf("long", 0.0000125, 1));
});

test("breakeven solves net pnl of zero, fees included", () => {
  const fundingQuote = 3;
  const price = breakevenPriceOf({
    side: "long",
    qty: 0.1,
    entry: 100_000,
    entryFeeRate: 0.0005,
    exitFeeRate: 0.0005,
    fundingQuote,
  });
  close(
    netAt({
      side: "long",
      qty: 0.1,
      entry: 100_000,
      price,
      entryFeeRate: 0.0005,
      exitFeeRate: 0.0005,
      fundingQuote,
    }),
    0,
    1e-8,
  );
  assert.ok(price > 100_000);
});

test("a short that receives funding can break even above the entry", () => {
  const fundingQuote = -30;
  const price = breakevenPriceOf({
    side: "short",
    qty: 0.1,
    entry: 100_000,
    entryFeeRate: 0.0005,
    exitFeeRate: 0.0005,
    fundingQuote,
  });
  close(
    netAt({
      side: "short",
      qty: 0.1,
      entry: 100_000,
      price,
      entryFeeRate: 0.0005,
      exitFeeRate: 0.0005,
      fundingQuote,
    }),
    0,
    1e-8,
  );
  assert.ok(price > 100_000);
});

test("hours to eat the target is infinite when funding is income", () => {
  assert.equal(hoursToEatOf("short", 0.0001, 10_000, 8, 100), null);
  assert.equal(hoursToEatOf("long", 0, 10_000, 8, 100), null);
  close(hoursToEatOf("long", 0.0001, 10_000, 8, 100) ?? 0, 800);
});

test("the worked long ranks hyperliquid ahead of okx and keeps fee-adjusted breakeven", () => {
  const result = projectFunding(position(), [
    quote(),
    quote({
      venue: "hyperliquid",
      symbol: "BTC",
      intervalHours: 1,
      currentRate: 0.00001,
      markPrice: 100_010,
      history: [
        { timeMs: 1_791_360_000_000, rate: 0.00001 },
        { timeMs: 1_791_356_400_000, rate: 0.00001 },
        { timeMs: 1_791_352_800_000, rate: 0.00001 },
      ],
    }),
  ]);
  assert.equal(result.cheapest, "hyperliquid");
  assert.equal(result.focus, "hyperliquid");
  assert.equal(result.qtyBase, 0.1);
  close(result.margin, 1000);
  close(result.entryFee, 5);
  close(result.targetProfitQuote, 100);
  const okx = result.venues.find((venue) => venue.venue === "okx");
  const hl = result.venues.find((venue) => venue.venue === "hyperliquid");
  assert.ok(okx && hl);
  close(okx.current.fundingQuote, 3);
  close(hl.current.fundingQuote, 2.4);
  close(okx.current.annualizedCarry, -0.1095);
  close(hl.current.annualizedCarry, -0.0876);
  close(okx.trailing?.rate ?? 0, 0.0001);
  close(okx.current.hoursToEatTarget ?? 0, 800);
  assert.equal(hl.rank, 1);
  assert.equal(okx.rank, 2);
  close(
    netAt({
      side: "long",
      qty: result.qtyBase,
      entry: result.entry,
      price: okx.current.breakevenPrice,
      entryFeeRate: result.entryFeeRate,
      exitFeeRate: result.exitFeeRate,
      fundingQuote: okx.current.fundingQuote,
    }),
    0,
    1e-8,
  );
  assert.equal(
    result.warnings.some((warning) => warning.code === "FUNDING_EATS_TARGET"),
    false,
  );
});

test("leverage changes margin and does not change funding", () => {
  const low = projectFunding(position({ leverage: 2 }), [quote()]);
  const high = projectFunding(position({ leverage: 20 }), [quote()]);
  close(low.venues[0]?.current.fundingQuote ?? 0, high.venues[0]?.current.fundingQuote ?? 0);
  close(low.margin, 5000);
  close(high.margin, 500);
});

test("qty and notional describe the same position", () => {
  const fromNotional = projectFunding(position(), [quote()]);
  const fromQty = projectFunding(position({ notional: undefined, qty: 0.1 }), [quote()]);
  close(fromQty.notional, fromNotional.notional);
  close(fromQty.venues[0]?.current.fundingQuote ?? 0, fromNotional.venues[0]?.current.fundingQuote ?? 0);
});

test("a mismatched qty and notional is rejected", () => {
  assert.throws(
    () => projectFunding(position({ qty: 1, notional: 10_000 }), [quote()]),
    (err: unknown) => err instanceof InputError && err.code === "SIZE_MISMATCH",
  );
});

test("funding that spends the target inside the hold is a loud warning", () => {
  const result = projectFunding(position({ entryFeeRate: 0, exitFeeRate: 0 }), [quote({ currentRate: 0.01 })]);
  close(result.venues[0]?.current.hoursToEatTarget ?? 0, 8);
  const warning = result.warnings.find((item) => item.code === "FUNDING_EATS_TARGET");
  assert.equal(warning?.severity, "loud");
});

test("opposite current and trailing signs are a note", () => {
  const result = projectFunding(position(), [
    quote({
      history: [
        { timeMs: 1_791_360_000_000, rate: -0.0002 },
        { timeMs: 1_791_331_200_000, rate: -0.0002 },
        { timeMs: 1_791_302_400_000, rate: -0.0002 },
      ],
    }),
  ]);
  assert.ok(result.warnings.some((warning) => warning.code === "RATE_SIGN_DISAGREE"));
  assert.ok((result.venues[0]?.trailing?.rate ?? 0) < 0);
  assert.ok((result.venues[0]?.current.rate ?? 0) > 0);
});

test("a fractional hold is prorated and noted", () => {
  const result = projectFunding(position({ holdHours: 12 }), [quote()]);
  close(result.venues[0]?.current.intervals ?? 0, 1.5);
  close(result.venues[0]?.current.fundingQuote ?? 0, 1.5);
  assert.ok(result.warnings.some((warning) => warning.code === "FRACTIONAL_HOLD"));
});

test("fewer than three prints notes a thin trail", () => {
  const result = projectFunding(position(), [quote({ history: [{ timeMs: 1_791_360_000_000, rate: 0.0001 }] })]);
  assert.notEqual(result.venues[0]?.trailing, null);
  assert.equal(result.venues[0]?.sampleCount, 1);
  assert.ok(result.warnings.some((warning) => warning.code === "HISTORY_SHORT"));
});

test("samples outside the window are left out of the average", () => {
  const result = projectFunding(position({ historyWindowHours: 10 }), [
    quote({
      history: [
        { timeMs: 1_791_360_000_000, rate: 0.0003 },
        { timeMs: 1_791_356_400_000, rate: 0.0001 },
        { timeMs: 1_000_000_000_000, rate: 0.01 },
      ],
    }),
  ]);
  close(result.venues[0]?.trailing?.rate ?? 0, 0.0002);
  assert.equal(result.venues[0]?.sampleCount, 2);
});

test("a percent target of 1 is 1 percent of notional", () => {
  const result = projectFunding(position(), [quote()]);
  close(result.targetProfitQuote, 100);
  const fixed = projectFunding(position({ targetProfit: { mode: "fixed", value: 50 } }), [quote()]);
  close(fixed.targetProfitQuote, 50);
  close(fixed.venues[0]?.current.hoursToEatTarget ?? 0, 400);
});

test("percent above 100 is rejected", () => {
  assert.throws(
    () => projectFunding(position({ targetProfit: { mode: "percent", value: 101 } }), [quote()]),
    (err: unknown) => err instanceof InputError && err.code === "TARGET_PERCENT",
  );
});

test("no quotes is an error", () => {
  assert.throws(
    () => projectFunding(position(), []),
    (err: unknown) => err instanceof InputError && err.code === "NO_QUOTES",
  );
});
