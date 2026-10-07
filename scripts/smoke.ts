import assert from "node:assert/strict";
import { fundingDrag } from "../src/funding";

const required = ["okx", "hyperliquid", "dydx", "gate", "bitget"] as const;
const optional = ["binance", "bybit"] as const;

async function main(): Promise<void> {
  const result = await fundingDrag({
    asset: "BTC",
    side: "long",
    notional: 10_000,
    entry: 80_000,
    leverage: 5,
    holdHours: 24,
    entryFeeRate: 0.0005,
    exitFeeRate: 0.0005,
    targetProfit: { mode: "percent", value: 1 },
    exchanges: [...required, ...optional],
  });

  for (const venue of required) {
    const row = result.venues.find((item) => item.venue === venue);
    assert.ok(
      row,
      `${venue} did not return a rate. ${result.failures.find((failure) => failure.venue === venue)?.message ?? ""}`,
    );
    assert.equal(Number.isFinite(row.current.rate), true);
    assert.ok(row.intervalHours > 0);
    assert.ok(row.sampleCount > 0, `${venue} returned no settled prints`);
    assert.equal(Number.isFinite(row.current.fundingQuote), true);
    assert.equal(Number.isFinite(row.current.annualizedCarry), true);
    assert.equal(Number.isFinite(row.current.breakevenPrice), true);
  }

  for (const venue of optional) {
    const row = result.venues.find((item) => item.venue === venue);
    const failure = result.failures.find((item) => item.venue === venue);
    assert.ok(row || failure, `${venue} neither returned a rate nor a failure`);
  }

  assert.ok(
    required.includes(result.cheapest as (typeof required)[number]) ||
      optional.includes(result.cheapest as (typeof optional)[number]),
  );
  assert.equal(result.notional, 10_000);
  assert.ok(result.margin > 0);

  const sample = {
    cheapest: result.cheapest,
    focus: result.focus,
    failures: result.failures.map((failure) => ({ venue: failure.venue, message: failure.message })),
    venues: result.venues.map((venue) => ({
      venue: venue.venue,
      symbol: venue.symbol,
      intervalHours: venue.intervalHours,
      currentRate: venue.current.rate,
      trailingRate: venue.trailing?.rate ?? null,
      samples: venue.sampleCount,
      fundingQuote: venue.current.fundingQuote,
      annualizedCarry: venue.current.annualizedCarry,
      breakevenMove: venue.current.breakevenMove,
      hoursToEatTarget: venue.current.hoursToEatTarget,
      markPrice: venue.markPrice,
    })),
  };
  console.log(JSON.stringify(sample, null, 2));
  console.log("smoke ok");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
