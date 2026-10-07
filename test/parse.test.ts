import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError } from "../src/errors";
import { loadVenue } from "../src/exchanges";
import type { HttpClient } from "../src/http";
import {
  parseBinanceHistory,
  parseBinanceInterval,
  parseBinancePremium,
  parseBitgetCurrent,
  parseBitgetHistory,
  parseBybitHistory,
  parseBybitIntervalMinutes,
  parseBybitTicker,
  parseDydxHistory,
  parseDydxMarket,
  parseGateContract,
  parseGateHistory,
  parseHyperliquidCurrent,
  parseHyperliquidHistory,
  parseOkxCurrent,
  parseOkxHistory,
} from "../src/parse";

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} !== ${expected}`);
}

test("binance premium, interval, and history", () => {
  const premium = parseBinancePremium({
    symbol: "BTCUSDT",
    markPrice: "83650.1",
    lastFundingRate: "0.0001",
    nextFundingTime: 1_791_388_800_000,
  });
  close(premium.rate, 0.0001);
  assert.equal(premium.markPrice, 83650.1);
  assert.equal(parseBinanceInterval([{ symbol: "ETHUSDT", fundingIntervalHours: 4 }], "BTCUSDT"), null);
  assert.equal(
    parseBinanceInterval(
      [
        { symbol: "ETHUSDT", fundingIntervalHours: 4 },
        { symbol: "BTCUSDT", fundingIntervalHours: 8 },
      ],
      "BTCUSDT",
    ),
    8,
  );
  const history = parseBinanceHistory([
    { symbol: "BTCUSDT", fundingRate: "0.0001", fundingTime: 1_791_360_000_000 },
    { symbol: "BTCUSDT", fundingRate: "-0.00005", fundingTime: 1_791_331_200_000 },
  ]);
  assert.equal(history.length, 2);
  close(history[1]?.rate ?? 0, -0.00005);
});

test("bybit ticker uses funding interval minutes", () => {
  const ticker = parseBybitTicker({
    retCode: 0,
    result: {
      list: [{ symbol: "BTCUSDT", fundingRate: "0.0001", markPrice: "83650", nextFundingTime: "1791388800000" }],
    },
  });
  close(ticker.rate, 0.0001);
  assert.equal(
    parseBybitIntervalMinutes({
      retCode: 0,
      result: { list: [{ symbol: "BTCUSDT", fundingInterval: "480" }] },
    }),
    480,
  );
  const history = parseBybitHistory({
    retCode: 0,
    result: { list: [{ symbol: "BTCUSDT", fundingRate: "0.00012", fundingRateTimestamp: "1791360000000" }] },
  });
  close(history[0]?.rate ?? 0, 0.00012);
  assert.equal(history[0]?.timeMs, 1_791_360_000_000);
});

test("okx current interval is the gap between funding times", () => {
  const current = parseOkxCurrent({
    code: "0",
    data: [
      {
        instId: "BTC-USDT-SWAP",
        fundingRate: "0.0000185754560611",
        fundingTime: "1791388800000",
        prevFundingTime: "1791360000000",
      },
    ],
  });
  close(current.rate, 0.0000185754560611);
  close(current.intervalHours, 8);
  const history = parseOkxHistory({
    code: "0",
    data: [
      {
        fundingRate: "0.0000246050648123",
        realizedRate: "0.0000246050648123",
        fundingTime: "1791360000000",
      },
    ],
  });
  close(history[0]?.rate ?? 0, 0.0000246050648123);
});

test("hyperliquid matches the coin and reads the hourly funding", () => {
  const current = parseHyperliquidCurrent(
    [
      { universe: [{ name: "BTC" }, { name: "ETH" }] },
      [
        { funding: "0.0000125", markPx: "83573" },
        { funding: "0.00001", markPx: "2000" },
      ],
    ],
    "BTC",
  );
  close(current.rate, 0.0000125);
  assert.equal(current.markPrice, 83573);
  assert.throws(
    () => parseHyperliquidCurrent([{ universe: [{ name: "ETH" }] }, [{ funding: "0.00001" }]], "BTC"),
    (err: unknown) => err instanceof InputError && err.code === "VENUE_SHAPE",
  );
  const history = parseHyperliquidHistory([{ coin: "BTC", fundingRate: "0.0000125", time: 1_791_352_800_005 }]);
  close(history[0]?.rate ?? 0, 0.0000125);
});

test("dydx uses nextFundingRate and settled history", () => {
  const market = parseDydxMarket(
    {
      markets: {
        "BTC-USD": { nextFundingRate: "0.00000017763157894737", oraclePrice: "83616.21752" },
      },
    },
    "BTC-USD",
  );
  close(market.rate, 0.00000017763157894737);
  const history = parseDydxHistory({
    historicalFunding: [{ ticker: "BTC-USD", rate: "0.00000025", effectiveAt: "2026-10-07T10:00:00.300Z" }],
  });
  close(history[0]?.rate ?? 0, 0.00000025);
  assert.equal(history[0]?.timeMs, Date.parse("2026-10-07T10:00:00.300Z"));
});

test("gate interval is seconds and history timestamps are seconds", () => {
  const contract = parseGateContract({
    name: "BTC_USDT",
    funding_rate: "0.000028",
    funding_interval: 28800,
    mark_price: "83560.47",
  });
  close(contract.rate, 0.000028);
  close(contract.intervalHours, 8);
  const history = parseGateHistory([{ r: "-0.000015", t: 1_791_360_000 }]);
  close(history[0]?.rate ?? 0, -0.000015);
  assert.equal(history[0]?.timeMs, 1_791_360_000_000);
});

test("bitget interval is hours", () => {
  const current = parseBitgetCurrent({
    code: "00000",
    data: [{ symbol: "BTCUSDT", fundingRate: "0.000086", fundingRateInterval: "8" }],
  });
  close(current.rate, 0.000086);
  close(current.intervalHours, 8);
  const history = parseBitgetHistory({
    code: "00000",
    data: [{ symbol: "BTCUSDT", fundingRate: "0.000088", fundingTime: "1791360000000" }],
  });
  close(history[0]?.rate ?? 0, 0.000088);
});

test("a mocked binance client becomes a quote with an 8 hour interval", async () => {
  const http: HttpClient = {
    async get(url: string) {
      if (url.includes("premiumIndex")) {
        return { symbol: "BTCUSDT", lastFundingRate: "0.0001", markPrice: "100" };
      }
      if (url.includes("fundingRate")) {
        return [{ symbol: "BTCUSDT", fundingRate: "0.0001", fundingTime: 1_791_360_000_000 }];
      }
      if (url.includes("fundingInfo")) {
        return [{ symbol: "BTCUSDT", fundingIntervalHours: 8 }];
      }
      throw new Error(url);
    },
    async post() {
      throw new Error("no post");
    },
  };
  const loaded = await loadVenue("binance", "BTC", http);
  assert.ok(!("message" in loaded));
  if ("message" in loaded) return;
  close(loaded.currentRate, 0.0001);
  close(loaded.intervalHours, 8);
  assert.equal(loaded.symbol, "BTCUSDT");
  assert.equal(loaded.history.length, 1);
});

test("a venue HTTP failure is a failure object, not a throw", async () => {
  const http: HttpClient = {
    async get() {
      throw new Error("HTTP 451 from fapi.binance.com. restricted location");
    },
    async post() {
      throw new Error("no post");
    },
  };
  const loaded = await loadVenue("binance", "BTC", http);
  assert.ok("message" in loaded);
  if (!("message" in loaded)) return;
  assert.equal(loaded.venue, "binance");
  assert.match(loaded.message, /451/);
});
