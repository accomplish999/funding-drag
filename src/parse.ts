import { InputError } from "./errors";
import { asNumber } from "./numbers";
import type { SettledSample } from "./math";

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("VENUE_SHAPE", `${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new InputError("VENUE_SHAPE", `${label} is not a list.`);
  }
  return value;
}

function num(value: unknown, label: string): number {
  const n = asNumber(value);
  if (n === undefined) {
    throw new InputError("VENUE_SHAPE", `${label} is not a number.`);
  }
  return n;
}

function millis(value: unknown, label: string): number {
  const n = num(value, label);
  if (n > 0 && n < 1e12) return n * 1000;
  return n;
}

export interface ParsedCurrent {
  rate: number;
  intervalHours: number;
  intervalSource: "venue" | "default";
  markPrice: number | null;
  symbol: string;
}

export function parseBinancePremium(body: unknown): { rate: number; markPrice: number | null; symbol: string } {
  const row = record(body, "binance premiumIndex");
  if (row.lastFundingRate === undefined) {
    const msg = typeof row.msg === "string" ? row.msg : "missing lastFundingRate";
    throw new InputError("VENUE_SHAPE", `Binance premium index: ${msg}`);
  }
  return {
    rate: num(row.lastFundingRate, "binance lastFundingRate"),
    markPrice: asNumber(row.markPrice) ?? null,
    symbol: typeof row.symbol === "string" ? row.symbol : "",
  };
}

export function parseBinanceInterval(body: unknown, symbol: string): number | null {
  const rows = list(body, "binance fundingInfo");
  for (const item of rows) {
    const row = record(item, "binance fundingInfo row");
    if (row.symbol === symbol) {
      return num(row.fundingIntervalHours, "binance fundingIntervalHours");
    }
  }
  return null;
}

export function parseBinanceHistory(body: unknown): SettledSample[] {
  return list(body, "binance fundingRate").map((item, index) => {
    const row = record(item, `binance fundingRate[${index}]`);
    return {
      timeMs: millis(row.fundingTime, "binance fundingTime"),
      rate: num(row.fundingRate, "binance fundingRate"),
    };
  });
}

export function parseBybitTicker(body: unknown): { rate: number; markPrice: number | null; symbol: string } {
  const row = bybitList(body, "bybit ticker")[0];
  if (!row) throw new InputError("VENUE_SHAPE", "Bybit ticker list is empty.");
  return {
    rate: num(row.fundingRate, "bybit fundingRate"),
    markPrice: asNumber(row.markPrice) ?? null,
    symbol: typeof row.symbol === "string" ? row.symbol : "",
  };
}

export function parseBybitIntervalMinutes(body: unknown): number | null {
  const row = bybitList(body, "bybit instruments")[0];
  if (!row || row.fundingInterval === undefined) return null;
  return num(row.fundingInterval, "bybit fundingInterval");
}

export function parseBybitHistory(body: unknown): SettledSample[] {
  return bybitList(body, "bybit funding history").map((row) => ({
    timeMs: millis(row.fundingRateTimestamp, "bybit fundingRateTimestamp"),
    rate: num(row.fundingRate, "bybit fundingRate"),
  }));
}

function bybitList(body: unknown, label: string): Record<string, unknown>[] {
  const root = record(body, label);
  const code = asNumber(root.retCode);
  if (code !== undefined && code !== 0) {
    const msg = typeof root.retMsg === "string" ? root.retMsg : `retCode ${code}`;
    throw new InputError("VENUE_SHAPE", `${label}: ${msg}`);
  }
  const result = record(root.result, `${label} result`);
  return list(result.list, `${label} list`).map((item, index) => record(item, `${label}[${index}]`));
}

export function parseOkxCurrent(body: unknown): ParsedCurrent {
  const row = okxRows(body, "okx funding-rate")[0];
  if (!row) throw new InputError("VENUE_SHAPE", "OKX funding-rate list is empty.");
  const next = num(row.fundingTime, "okx fundingTime");
  const prev = num(row.prevFundingTime, "okx prevFundingTime");
  const hours = (next - prev) / 3_600_000;
  if (!(hours > 0)) {
    throw new InputError("VENUE_SHAPE", "OKX funding interval is not positive.");
  }
  return {
    rate: num(row.fundingRate, "okx fundingRate"),
    intervalHours: hours,
    intervalSource: "venue",
    markPrice: null,
    symbol: typeof row.instId === "string" ? row.instId : "",
  };
}

export function parseOkxMark(body: unknown): number | null {
  const row = okxRows(body, "okx mark-price")[0];
  if (!row) return null;
  return asNumber(row.markPx) ?? null;
}

export function parseOkxHistory(body: unknown): SettledSample[] {
  return okxRows(body, "okx funding history").map((row) => ({
    timeMs: millis(row.fundingTime, "okx fundingTime"),
    rate: num(row.realizedRate ?? row.fundingRate, "okx realizedRate"),
  }));
}

function okxRows(body: unknown, label: string): Record<string, unknown>[] {
  const root = record(body, label);
  if (root.code !== undefined && root.code !== "0" && root.code !== 0) {
    const msg = typeof root.msg === "string" ? root.msg : `code ${String(root.code)}`;
    throw new InputError("VENUE_SHAPE", `${label}: ${msg}`);
  }
  return list(root.data, `${label} data`).map((item, index) => record(item, `${label}[${index}]`));
}

export function parseHyperliquidCurrent(
  body: unknown,
  asset: string,
): { rate: number; markPrice: number | null; symbol: string } {
  if (!Array.isArray(body) || body.length < 2) {
    throw new InputError("VENUE_SHAPE", "Hyperliquid metaAndAssetCtxs is not a pair.");
  }
  const meta = record(body[0], "hyperliquid meta");
  const universe = list(meta.universe, "hyperliquid universe");
  const ctxs = list(body[1], "hyperliquid contexts");
  const index = universe.findIndex((item) => record(item, "hyperliquid asset").name === asset);
  if (index < 0) {
    throw new InputError("VENUE_SHAPE", `Hyperliquid has no ${asset} market.`);
  }
  const ctx = record(ctxs[index], "hyperliquid context");
  return {
    rate: num(ctx.funding, "hyperliquid funding"),
    markPrice: asNumber(ctx.markPx) ?? null,
    symbol: asset,
  };
}

export function parseHyperliquidHistory(body: unknown): SettledSample[] {
  return list(body, "hyperliquid fundingHistory").map((item, index) => {
    const row = record(item, `hyperliquid fundingHistory[${index}]`);
    return {
      timeMs: millis(row.time, "hyperliquid time"),
      rate: num(row.fundingRate, "hyperliquid fundingRate"),
    };
  });
}

export function parseDydxMarket(body: unknown, ticker: string): { rate: number; markPrice: number | null } {
  const root = record(body, "dydx markets");
  const markets = record(root.markets, "dydx markets map");
  const row = markets[ticker];
  if (row === undefined) {
    throw new InputError("VENUE_SHAPE", `dYdX has no ${ticker} market.`);
  }
  const market = record(row, ticker);
  return {
    rate: num(market.nextFundingRate, "dydx nextFundingRate"),
    markPrice: asNumber(market.oraclePrice) ?? null,
  };
}

export function parseDydxHistory(body: unknown): SettledSample[] {
  const root = record(body, "dydx historicalFunding");
  return list(root.historicalFunding, "dydx historicalFunding").map((item, index) => {
    const row = record(item, `dydx historicalFunding[${index}]`);
    const stamp = typeof row.effectiveAt === "string" ? Date.parse(row.effectiveAt) : Number.NaN;
    if (!Number.isFinite(stamp)) {
      throw new InputError("VENUE_SHAPE", "dydx effectiveAt is not a time.");
    }
    return { timeMs: stamp, rate: num(row.rate, "dydx rate") };
  });
}

export function parseGateContract(body: unknown): ParsedCurrent {
  const row = record(body, "gate contract");
  const seconds = num(row.funding_interval, "gate funding_interval");
  return {
    rate: num(row.funding_rate, "gate funding_rate"),
    intervalHours: seconds / 3600,
    intervalSource: "venue",
    markPrice: asNumber(row.mark_price) ?? null,
    symbol: typeof row.name === "string" ? row.name : "",
  };
}

export function parseGateHistory(body: unknown): SettledSample[] {
  return list(body, "gate funding_rate").map((item, index) => {
    const row = record(item, `gate funding_rate[${index}]`);
    return {
      timeMs: millis(row.t, "gate t"),
      rate: num(row.r, "gate r"),
    };
  });
}

export function parseBitgetCurrent(body: unknown): { rate: number; intervalHours: number; symbol: string } {
  const row = bitgetRows(body, "bitget current fund rate")[0];
  if (!row) throw new InputError("VENUE_SHAPE", "Bitget current fund rate list is empty.");
  return {
    rate: num(row.fundingRate, "bitget fundingRate"),
    intervalHours: num(row.fundingRateInterval, "bitget fundingRateInterval"),
    symbol: typeof row.symbol === "string" ? row.symbol : "",
  };
}

export function parseBitgetMark(body: unknown): number | null {
  const row = bitgetRows(body, "bitget ticker")[0];
  if (!row) return null;
  return asNumber(row.markPrice) ?? null;
}

export function parseBitgetHistory(body: unknown): SettledSample[] {
  return bitgetRows(body, "bitget history fund rate").map((row) => ({
    timeMs: millis(row.fundingTime, "bitget fundingTime"),
    rate: num(row.fundingRate, "bitget fundingRate"),
  }));
}

function bitgetRows(body: unknown, label: string): Record<string, unknown>[] {
  const root = record(body, label);
  if (root.code !== undefined && root.code !== "00000") {
    const msg = typeof root.msg === "string" ? root.msg : `code ${String(root.code)}`;
    throw new InputError("VENUE_SHAPE", `${label}: ${msg}`);
  }
  return list(root.data, `${label} data`).map((item, index) => record(item, `${label}[${index}]`));
}
