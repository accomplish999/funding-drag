import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError } from "../src/errors";
import { normalizeAsset, venueSymbol } from "../src/symbols";

test("venue symbols share one base ticker", () => {
  assert.equal(normalizeAsset("btc"), "BTC");
  assert.equal(normalizeAsset("BTCUSDT"), "BTC");
  assert.equal(normalizeAsset("BTC-USDT-SWAP"), "BTC");
  assert.equal(normalizeAsset("BTC_USDT"), "BTC");
  assert.equal(normalizeAsset("XBT"), "BTC");
  assert.equal(normalizeAsset("kPEPE"), "kPEPE");
  assert.equal(venueSymbol("binance", "BTC"), "BTCUSDT");
  assert.equal(venueSymbol("okx", "BTC"), "BTC-USDT-SWAP");
  assert.equal(venueSymbol("hyperliquid", "BTC"), "BTC");
  assert.equal(venueSymbol("dydx", "BTC"), "BTC-USD");
  assert.equal(venueSymbol("gate", "BTC"), "BTC_USDT");
  assert.equal(venueSymbol("hyperliquid", "kPEPE"), "kPEPE");
});

test("an empty asset is rejected", () => {
  assert.throws(
    () => normalizeAsset("  "),
    (err: unknown) => err instanceof InputError && err.code === "MISSING",
  );
});
