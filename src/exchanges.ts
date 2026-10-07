import { InputError } from "./errors";
import type { HttpClient } from "./http";
import type { VenueFailure, VenueQuote } from "./math";
import {
  parseBinanceHistory,
  parseBinanceInterval,
  parseBinancePremium,
  parseBitgetCurrent,
  parseBitgetHistory,
  parseBitgetMark,
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
  parseOkxMark,
} from "./parse";
import { venueSymbol, type VenueId } from "./symbols";

const DEFAULT_INTERVAL: Record<VenueId, number> = {
  binance: 8,
  bybit: 8,
  okx: 8,
  hyperliquid: 1,
  dydx: 1,
  gate: 8,
  bitget: 8,
};

export async function loadVenue(venue: VenueId, asset: string, http: HttpClient): Promise<VenueQuote | VenueFailure> {
  try {
    const quote = await loadOk(venue, asset, http);
    return quote;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { venue, message };
  }
}

async function loadOk(venue: VenueId, asset: string, http: HttpClient): Promise<VenueQuote> {
  switch (venue) {
    case "binance":
      return loadBinance(asset, http);
    case "bybit":
      return loadBybit(asset, http);
    case "okx":
      return loadOkx(asset, http);
    case "hyperliquid":
      return loadHyperliquid(asset, http);
    case "dydx":
      return loadDydx(asset, http);
    case "gate":
      return loadGate(asset, http);
    case "bitget":
      return loadBitget(asset, http);
  }
}

function quote(partial: Omit<VenueQuote, "fetchedAtMs">): VenueQuote {
  return { ...partial, fetchedAtMs: Date.now() };
}

async function loadBinance(asset: string, http: HttpClient): Promise<VenueQuote> {
  const symbol = venueSymbol("binance", asset);
  const [premium, historyBody, infoBody] = await Promise.all([
    http.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
    http.get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=100`),
    http.get("https://fapi.binance.com/fapi/v1/fundingInfo").catch(() => null),
  ]);
  const current = parseBinancePremium(premium);
  const stated = infoBody === null ? null : parseBinanceInterval(infoBody, symbol);
  return quote({
    venue: "binance",
    symbol: current.symbol || symbol,
    intervalHours: stated ?? DEFAULT_INTERVAL.binance,
    intervalSource: stated === null ? "default" : "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseBinanceHistory(historyBody),
    markPrice: current.markPrice,
  });
}

async function loadBybit(asset: string, http: HttpClient): Promise<VenueQuote> {
  const symbol = venueSymbol("bybit", asset);
  const [ticker, historyBody, info] = await Promise.all([
    http.get(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`),
    http.get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=200`),
    http.get(`https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`),
  ]);
  const current = parseBybitTicker(ticker);
  const minutes = parseBybitIntervalMinutes(info);
  return quote({
    venue: "bybit",
    symbol: current.symbol || symbol,
    intervalHours: minutes === null ? DEFAULT_INTERVAL.bybit : minutes / 60,
    intervalSource: minutes === null ? "default" : "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseBybitHistory(historyBody),
    markPrice: current.markPrice,
  });
}

async function loadOkx(asset: string, http: HttpClient): Promise<VenueQuote> {
  const symbol = venueSymbol("okx", asset);
  const encoded = encodeURIComponent(symbol);
  const [currentBody, historyBody, markBody] = await Promise.all([
    http.get(`https://www.okx.com/api/v5/public/funding-rate?instId=${encoded}`),
    http.get(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${encoded}&limit=100`),
    http.get(`https://www.okx.com/api/v5/public/mark-price?instId=${encoded}`).catch(() => null),
  ]);
  const current = parseOkxCurrent(currentBody);
  return quote({
    venue: "okx",
    symbol: current.symbol || symbol,
    intervalHours: current.intervalHours,
    intervalSource: "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseOkxHistory(historyBody),
    markPrice: markBody === null ? null : parseOkxMark(markBody),
  });
}

async function loadHyperliquid(asset: string, http: HttpClient): Promise<VenueQuote> {
  const startTime = Date.now() - 8 * 24 * 3_600_000;
  const [meta, historyBody] = await Promise.all([
    http.post("https://api.hyperliquid.xyz/info", { type: "metaAndAssetCtxs" }),
    http.post("https://api.hyperliquid.xyz/info", { type: "fundingHistory", coin: asset, startTime }),
  ]);
  const current = parseHyperliquidCurrent(meta, asset);
  return quote({
    venue: "hyperliquid",
    symbol: current.symbol,
    intervalHours: DEFAULT_INTERVAL.hyperliquid,
    intervalSource: "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseHyperliquidHistory(historyBody),
    markPrice: current.markPrice,
  });
}

async function loadDydx(asset: string, http: HttpClient): Promise<VenueQuote> {
  const ticker = venueSymbol("dydx", asset);
  const [markets, historyBody] = await Promise.all([
    http.get("https://indexer.dydx.trade/v4/perpetualMarkets"),
    http.get(`https://indexer.dydx.trade/v4/historicalFunding/${encodeURIComponent(ticker)}?limit=100`),
  ]);
  const current = parseDydxMarket(markets, ticker);
  return quote({
    venue: "dydx",
    symbol: ticker,
    intervalHours: DEFAULT_INTERVAL.dydx,
    intervalSource: "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseDydxHistory(historyBody),
    markPrice: current.markPrice,
  });
}

async function loadGate(asset: string, http: HttpClient): Promise<VenueQuote> {
  const symbol = venueSymbol("gate", asset);
  const [contract, historyBody] = await Promise.all([
    http.get(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${symbol}`),
    http.get(`https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${symbol}&limit=100`),
  ]);
  const current = parseGateContract(contract);
  if (!(current.intervalHours > 0)) {
    throw new InputError("VENUE_SHAPE", "Gate funding interval is not positive.");
  }
  return quote({
    venue: "gate",
    symbol: current.symbol || symbol,
    intervalHours: current.intervalHours,
    intervalSource: "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseGateHistory(historyBody),
    markPrice: current.markPrice,
  });
}

async function loadBitget(asset: string, http: HttpClient): Promise<VenueQuote> {
  const symbol = venueSymbol("bitget", asset);
  const base = `symbol=${symbol}&productType=USDT-FUTURES`;
  const [currentBody, historyBody, ticker] = await Promise.all([
    http.get(`https://api.bitget.com/api/v2/mix/market/current-fund-rate?${base}`),
    http.get(`https://api.bitget.com/api/v2/mix/market/history-fund-rate?${base}&pageSize=100`),
    http.get(`https://api.bitget.com/api/v2/mix/market/ticker?${base}`).catch(() => null),
  ]);
  const current = parseBitgetCurrent(currentBody);
  if (!(current.intervalHours > 0)) {
    throw new InputError("VENUE_SHAPE", "Bitget funding interval is not positive.");
  }
  return quote({
    venue: "bitget",
    symbol: current.symbol || symbol,
    intervalHours: current.intervalHours,
    intervalSource: "venue",
    currentRate: current.rate,
    currentRateKind: "predicted",
    history: parseBitgetHistory(historyBody),
    markPrice: ticker === null ? null : parseBitgetMark(ticker),
  });
}
