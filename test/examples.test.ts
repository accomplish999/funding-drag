import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { projectFunding, type PositionInput, type VenueQuote } from "../src/math";

function load(file: string): { position: PositionInput; quotes: VenueQuote[] } {
  const raw = JSON.parse(readFileSync(file, "utf8")) as PositionInput & { quotes: VenueQuote[] };
  const { quotes, ...position } = raw;
  return { position, quotes };
}

test("example files are the inputs the docs print", () => {
  const long = load("examples/btc-long.json");
  const sized = projectFunding(long.position, long.quotes);
  assert.equal(sized.cheapest, "hyperliquid");
  const funding = sized.venues[0]?.current.fundingQuote ?? 0;
  assert.ok(Math.abs(funding - 2.4) < 1e-9);
  const eats = load("examples/eats-target.json");
  const warned = projectFunding(eats.position, eats.quotes);
  assert.equal(warned.venues[0]?.current.hoursToEatTarget, 8);
  assert.ok(warned.warnings.some((warning) => warning.code === "FUNDING_EATS_TARGET"));
});
