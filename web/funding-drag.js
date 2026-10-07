"use strict";
var FundingDrag = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    VENUES: () => VENUES,
    VERSION: () => VERSION,
    fundingDrag: () => fundingDrag,
    loadQuotes: () => loadQuotes,
    normalizeAsset: () => normalizeAsset,
    projectFunding: () => projectFunding,
    venueSymbol: () => venueSymbol
  });

  // src/errors.ts
  var InputError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "InputError";
      this.code = code;
    }
  };

  // src/numbers.ts
  function reqFinite(name, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
    }
    return value;
  }
  function reqPositive(name, value) {
    const n = reqFinite(name, value);
    if (!(n > 0)) {
      throw new InputError("NOT_POSITIVE", `${name} must be greater than 0.`);
    }
    return n;
  }
  function reqNonNegative(name, value) {
    const n = reqFinite(name, value);
    if (n < 0) {
      throw new InputError("NOT_POSITIVE", `${name} must be 0 or greater.`);
    }
    return n;
  }
  function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return void 0;
  }

  // src/parse.ts
  function record(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new InputError("VENUE_SHAPE", `${label} is not an object.`);
    }
    return value;
  }
  function list(value, label) {
    if (!Array.isArray(value)) {
      throw new InputError("VENUE_SHAPE", `${label} is not a list.`);
    }
    return value;
  }
  function num(value, label) {
    const n = asNumber(value);
    if (n === void 0) {
      throw new InputError("VENUE_SHAPE", `${label} is not a number.`);
    }
    return n;
  }
  function millis(value, label) {
    const n = num(value, label);
    if (n > 0 && n < 1e12) return n * 1e3;
    return n;
  }
  function parseBinancePremium(body) {
    const row = record(body, "binance premiumIndex");
    if (row.lastFundingRate === void 0) {
      const msg = typeof row.msg === "string" ? row.msg : "missing lastFundingRate";
      throw new InputError("VENUE_SHAPE", `Binance premium index: ${msg}`);
    }
    return {
      rate: num(row.lastFundingRate, "binance lastFundingRate"),
      markPrice: asNumber(row.markPrice) ?? null,
      symbol: typeof row.symbol === "string" ? row.symbol : ""
    };
  }
  function parseBinanceInterval(body, symbol) {
    const rows = list(body, "binance fundingInfo");
    for (const item of rows) {
      const row = record(item, "binance fundingInfo row");
      if (row.symbol === symbol) {
        return num(row.fundingIntervalHours, "binance fundingIntervalHours");
      }
    }
    return null;
  }
  function parseBinanceHistory(body) {
    return list(body, "binance fundingRate").map((item, index) => {
      const row = record(item, `binance fundingRate[${index}]`);
      return {
        timeMs: millis(row.fundingTime, "binance fundingTime"),
        rate: num(row.fundingRate, "binance fundingRate")
      };
    });
  }
  function parseBybitTicker(body) {
    const row = bybitList(body, "bybit ticker")[0];
    if (!row) throw new InputError("VENUE_SHAPE", "Bybit ticker list is empty.");
    return {
      rate: num(row.fundingRate, "bybit fundingRate"),
      markPrice: asNumber(row.markPrice) ?? null,
      symbol: typeof row.symbol === "string" ? row.symbol : ""
    };
  }
  function parseBybitIntervalMinutes(body) {
    const row = bybitList(body, "bybit instruments")[0];
    if (!row || row.fundingInterval === void 0) return null;
    return num(row.fundingInterval, "bybit fundingInterval");
  }
  function parseBybitHistory(body) {
    return bybitList(body, "bybit funding history").map((row) => ({
      timeMs: millis(row.fundingRateTimestamp, "bybit fundingRateTimestamp"),
      rate: num(row.fundingRate, "bybit fundingRate")
    }));
  }
  function bybitList(body, label) {
    const root = record(body, label);
    const code = asNumber(root.retCode);
    if (code !== void 0 && code !== 0) {
      const msg = typeof root.retMsg === "string" ? root.retMsg : `retCode ${code}`;
      throw new InputError("VENUE_SHAPE", `${label}: ${msg}`);
    }
    const result = record(root.result, `${label} result`);
    return list(result.list, `${label} list`).map((item, index) => record(item, `${label}[${index}]`));
  }
  function parseOkxCurrent(body) {
    const row = okxRows(body, "okx funding-rate")[0];
    if (!row) throw new InputError("VENUE_SHAPE", "OKX funding-rate list is empty.");
    const next = num(row.fundingTime, "okx fundingTime");
    const prev = num(row.prevFundingTime, "okx prevFundingTime");
    const hours = (next - prev) / 36e5;
    if (!(hours > 0)) {
      throw new InputError("VENUE_SHAPE", "OKX funding interval is not positive.");
    }
    return {
      rate: num(row.fundingRate, "okx fundingRate"),
      intervalHours: hours,
      intervalSource: "venue",
      markPrice: null,
      symbol: typeof row.instId === "string" ? row.instId : ""
    };
  }
  function parseOkxMark(body) {
    const row = okxRows(body, "okx mark-price")[0];
    if (!row) return null;
    return asNumber(row.markPx) ?? null;
  }
  function parseOkxHistory(body) {
    return okxRows(body, "okx funding history").map((row) => ({
      timeMs: millis(row.fundingTime, "okx fundingTime"),
      rate: num(row.realizedRate ?? row.fundingRate, "okx realizedRate")
    }));
  }
  function okxRows(body, label) {
    const root = record(body, label);
    if (root.code !== void 0 && root.code !== "0" && root.code !== 0) {
      const msg = typeof root.msg === "string" ? root.msg : `code ${String(root.code)}`;
      throw new InputError("VENUE_SHAPE", `${label}: ${msg}`);
    }
    return list(root.data, `${label} data`).map((item, index) => record(item, `${label}[${index}]`));
  }
  function parseHyperliquidCurrent(body, asset) {
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
      symbol: asset
    };
  }
  function parseHyperliquidHistory(body) {
    return list(body, "hyperliquid fundingHistory").map((item, index) => {
      const row = record(item, `hyperliquid fundingHistory[${index}]`);
      return {
        timeMs: millis(row.time, "hyperliquid time"),
        rate: num(row.fundingRate, "hyperliquid fundingRate")
      };
    });
  }
  function parseDydxMarket(body, ticker) {
    const root = record(body, "dydx markets");
    const markets = record(root.markets, "dydx markets map");
    const row = markets[ticker];
    if (row === void 0) {
      throw new InputError("VENUE_SHAPE", `dYdX has no ${ticker} market.`);
    }
    const market = record(row, ticker);
    return {
      rate: num(market.nextFundingRate, "dydx nextFundingRate"),
      markPrice: asNumber(market.oraclePrice) ?? null
    };
  }
  function parseDydxHistory(body) {
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
  function parseGateContract(body) {
    const row = record(body, "gate contract");
    const seconds = num(row.funding_interval, "gate funding_interval");
    return {
      rate: num(row.funding_rate, "gate funding_rate"),
      intervalHours: seconds / 3600,
      intervalSource: "venue",
      markPrice: asNumber(row.mark_price) ?? null,
      symbol: typeof row.name === "string" ? row.name : ""
    };
  }
  function parseGateHistory(body) {
    return list(body, "gate funding_rate").map((item, index) => {
      const row = record(item, `gate funding_rate[${index}]`);
      return {
        timeMs: millis(row.t, "gate t"),
        rate: num(row.r, "gate r")
      };
    });
  }
  function parseBitgetCurrent(body) {
    const row = bitgetRows(body, "bitget current fund rate")[0];
    if (!row) throw new InputError("VENUE_SHAPE", "Bitget current fund rate list is empty.");
    return {
      rate: num(row.fundingRate, "bitget fundingRate"),
      intervalHours: num(row.fundingRateInterval, "bitget fundingRateInterval"),
      symbol: typeof row.symbol === "string" ? row.symbol : ""
    };
  }
  function parseBitgetMark(body) {
    const row = bitgetRows(body, "bitget ticker")[0];
    if (!row) return null;
    return asNumber(row.markPrice) ?? null;
  }
  function parseBitgetHistory(body) {
    return bitgetRows(body, "bitget history fund rate").map((row) => ({
      timeMs: millis(row.fundingTime, "bitget fundingTime"),
      rate: num(row.fundingRate, "bitget fundingRate")
    }));
  }
  function bitgetRows(body, label) {
    const root = record(body, label);
    if (root.code !== void 0 && root.code !== "00000") {
      const msg = typeof root.msg === "string" ? root.msg : `code ${String(root.code)}`;
      throw new InputError("VENUE_SHAPE", `${label}: ${msg}`);
    }
    return list(root.data, `${label} data`).map((item, index) => record(item, `${label}[${index}]`));
  }

  // src/symbols.ts
  var VENUES = ["binance", "bybit", "okx", "hyperliquid", "dydx", "gate", "bitget"];
  var VENUE_SET = new Set(VENUES);
  function isVenue(value) {
    return VENUE_SET.has(value);
  }
  function reqVenue(value) {
    const id = value.trim().toLowerCase();
    if (!isVenue(id)) {
      throw new InputError("BAD_VENUE", `Unknown venue "${value}". Known venues: ${VENUES.join(", ")}.`);
    }
    return id;
  }
  function normalizeAsset(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new InputError("MISSING", "Missing asset.");
    }
    const head = trimmed.split(/[\s/]/)[0] ?? trimmed;
    const patterns = [
      /-USDT-SWAP$/i,
      /-USDC-SWAP$/i,
      /-USD-SWAP$/i,
      /_USDT$/i,
      /_USDC$/i,
      /_USD$/i,
      /-USDT$/i,
      /-USDC$/i,
      /-USD$/i,
      /-PERP$/i,
      /USDTPERP$/i,
      /USDCPERP$/i,
      /USDT$/i,
      /USDC$/i,
      /USD$/i,
      /PERP$/i
    ];
    let token = head;
    for (const pattern of patterns) {
      if (pattern.test(token)) {
        const next = token.replace(pattern, "");
        if (next.length > 0) {
          token = next;
          break;
        }
      }
    }
    token = token.replace(/[-_]/g, "");
    if (/^xbt$/i.test(token)) return "BTC";
    if (!/^[A-Za-z0-9]{1,20}$/.test(token)) {
      throw new InputError("INVALID_INPUT", `Asset "${raw}" is not a base ticker.`);
    }
    const letters = token.replace(/[^A-Za-z]/g, "");
    const mixed = /[a-z]/.test(letters) && /[A-Z]/.test(letters);
    return mixed ? token : token.toUpperCase();
  }
  function venueSymbol(venue, asset) {
    switch (venue) {
      case "binance":
      case "bybit":
      case "bitget":
        return `${asset}USDT`;
      case "okx":
        return `${asset}-USDT-SWAP`;
      case "hyperliquid":
        return asset;
      case "dydx":
        return `${asset}-USD`;
      case "gate":
        return `${asset}_USDT`;
    }
  }

  // src/exchanges.ts
  var DEFAULT_INTERVAL = {
    binance: 8,
    bybit: 8,
    okx: 8,
    hyperliquid: 1,
    dydx: 1,
    gate: 8,
    bitget: 8
  };
  async function loadVenue(venue, asset, http) {
    try {
      const quote2 = await loadOk(venue, asset, http);
      return quote2;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { venue, message };
    }
  }
  async function loadOk(venue, asset, http) {
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
  function quote(partial) {
    return { ...partial, fetchedAtMs: Date.now() };
  }
  async function loadBinance(asset, http) {
    const symbol = venueSymbol("binance", asset);
    const [premium, historyBody, infoBody] = await Promise.all([
      http.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
      http.get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=100`),
      http.get("https://fapi.binance.com/fapi/v1/fundingInfo").catch(() => null)
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
      markPrice: current.markPrice
    });
  }
  async function loadBybit(asset, http) {
    const symbol = venueSymbol("bybit", asset);
    const [ticker, historyBody, info] = await Promise.all([
      http.get(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`),
      http.get(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=200`),
      http.get(`https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`)
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
      markPrice: current.markPrice
    });
  }
  async function loadOkx(asset, http) {
    const symbol = venueSymbol("okx", asset);
    const encoded = encodeURIComponent(symbol);
    const [currentBody, historyBody, markBody] = await Promise.all([
      http.get(`https://www.okx.com/api/v5/public/funding-rate?instId=${encoded}`),
      http.get(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${encoded}&limit=100`),
      http.get(`https://www.okx.com/api/v5/public/mark-price?instId=${encoded}`).catch(() => null)
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
      markPrice: markBody === null ? null : parseOkxMark(markBody)
    });
  }
  async function loadHyperliquid(asset, http) {
    const startTime = Date.now() - 8 * 24 * 36e5;
    const [meta, historyBody] = await Promise.all([
      http.post("https://api.hyperliquid.xyz/info", { type: "metaAndAssetCtxs" }),
      http.post("https://api.hyperliquid.xyz/info", { type: "fundingHistory", coin: asset, startTime })
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
      markPrice: current.markPrice
    });
  }
  async function loadDydx(asset, http) {
    const ticker = venueSymbol("dydx", asset);
    const [markets, historyBody] = await Promise.all([
      http.get("https://indexer.dydx.trade/v4/perpetualMarkets"),
      http.get(`https://indexer.dydx.trade/v4/historicalFunding/${encodeURIComponent(ticker)}?limit=100`)
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
      markPrice: current.markPrice
    });
  }
  async function loadGate(asset, http) {
    const symbol = venueSymbol("gate", asset);
    const [contract, historyBody] = await Promise.all([
      http.get(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${symbol}`),
      http.get(`https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${symbol}&limit=100`)
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
      markPrice: current.markPrice
    });
  }
  async function loadBitget(asset, http) {
    const symbol = venueSymbol("bitget", asset);
    const base = `symbol=${symbol}&productType=USDT-FUTURES`;
    const [currentBody, historyBody, ticker] = await Promise.all([
      http.get(`https://api.bitget.com/api/v2/mix/market/current-fund-rate?${base}`),
      http.get(`https://api.bitget.com/api/v2/mix/market/history-fund-rate?${base}&pageSize=100`),
      http.get(`https://api.bitget.com/api/v2/mix/market/ticker?${base}`).catch(() => null)
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
      markPrice: ticker === null ? null : parseBitgetMark(ticker)
    });
  }

  // src/http.ts
  var HttpStatusError = class extends Error {
    status;
    url;
    constructor(status, url, body) {
      const host = safeHost(url);
      const clipped = body.replace(/\s+/g, " ").trim().slice(0, 180);
      super(clipped ? `HTTP ${status} from ${host}. ${clipped}` : `HTTP ${status} from ${host}.`);
      this.name = "HttpStatusError";
      this.status = status;
      this.url = url;
    }
  };
  function safeHost(url) {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
  var USER_AGENT = "funding-drag/0.1.0 (+https://github.com/accomplish999/funding-drag)";
  async function readJson(response, url) {
    const text = await response.text();
    if (!response.ok) {
      throw new HttpStatusError(response.status, url, text);
    }
    if (text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpStatusError(response.status, url, "Response was not JSON.");
    }
  }
  function createHttp(fetchImpl = fetch) {
    const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
    return {
      async get(url) {
        const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(2e4) });
        return readJson(response, url);
      },
      async post(url, body) {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(2e4)
        });
        return readJson(response, url);
      }
    };
  }

  // src/math.ts
  var HOURS_PER_YEAR = 365 * 24;
  var DEFAULT_ENTRY_FEE = 5e-4;
  var DEFAULT_EXIT_FEE = 5e-4;
  var DEFAULT_WINDOW_HOURS = 168;
  var EXTREME_RATE = 0.05;
  var DEFAULT_TARGET = { mode: "percent", value: 1 };
  function sideSign(side) {
    return side === "long" ? 1 : -1;
  }
  function reqSide(value) {
    if (value === "long" || value === "short") return value;
    throw new InputError("BAD_SIDE", 'Side must be "long" or "short".');
  }
  function fundingQuoteOf(side, rate, notional, holdHours, intervalHours) {
    return sideSign(side) * rate * notional * (holdHours / intervalHours);
  }
  function annualizedCarryOf(side, rate, intervalHours) {
    return -sideSign(side) * rate * (HOURS_PER_YEAR / intervalHours);
  }
  function breakevenPriceOf(input) {
    const entryFee = input.entryFeeRate * input.qty * input.entry;
    if (input.side === "long") {
      const denom2 = input.qty * (1 - input.exitFeeRate);
      return (input.qty * input.entry + entryFee + input.fundingQuote) / denom2;
    }
    const denom = input.qty * (1 + input.exitFeeRate);
    return (input.qty * input.entry - entryFee - input.fundingQuote) / denom;
  }
  function favorableMove(side, entry, breakeven) {
    if (side === "long") return (breakeven - entry) / entry;
    return (entry - breakeven) / entry;
  }
  function hoursToEatOf(side, rate, notional, intervalHours, targetQuote) {
    const costPerHour = sideSign(side) * rate * notional / intervalHours;
    if (!(costPerHour > 0)) return null;
    return targetQuote / costPerHour;
  }
  function paidBy(rate) {
    if (rate > 0) return "longs";
    if (rate < 0) return "shorts";
    return "flat";
  }
  function trailingWindow(history, windowHours) {
    const valid = history.filter((sample) => Number.isFinite(sample.timeMs) && Number.isFinite(sample.rate));
    if (valid.length === 0) return null;
    let newest = valid[0]?.timeMs ?? 0;
    for (const sample of valid) {
      if (sample.timeMs > newest) newest = sample.timeMs;
    }
    const start = newest - windowHours * 36e5;
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
  function feeRate(name, value, fallback) {
    const n = value === void 0 ? fallback : reqFinite(name, value);
    if (n < 0) {
      throw new InputError("NEGATIVE_FEE", `${name} cannot be negative. Use 0 if the venue pays you to trade.`);
    }
    if (n >= 1) {
      throw new InputError("FEE_TOO_HIGH", `${name} must be below 1. 0.0005 is 5 basis points.`);
    }
    return n;
  }
  function resolveSize(entry, qty, notional) {
    const hasQty = qty !== void 0;
    const hasNotional = notional !== void 0;
    if (!hasQty && !hasNotional) {
      throw new InputError("MISSING", "Pass qty or notional.");
    }
    if (hasQty && hasNotional) {
      const q = reqPositive("qty", qty);
      const n2 = reqPositive("notional", notional);
      const implied = q * entry;
      const scale = Math.max(1, Math.abs(n2));
      if (Math.abs(implied - n2) > 1e-6 * scale) {
        throw new InputError("SIZE_MISMATCH", "qty times entry does not equal notional.");
      }
      return { qty: q, notional: n2 };
    }
    if (hasQty) {
      const q = reqPositive("qty", qty);
      return { qty: q, notional: q * entry };
    }
    const n = reqPositive("notional", notional);
    return { qty: n / entry, notional: n };
  }
  function targetQuoteOf(target, notional) {
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
  function projectOne(input) {
    const fundingQuote = fundingQuoteOf(input.side, input.rate, input.notional, input.holdHours, input.intervalHours);
    const breakevenPrice = breakevenPriceOf({
      side: input.side,
      qty: input.qty,
      entry: input.entry,
      entryFeeRate: input.entryFeeRate,
      exitFeeRate: input.exitFeeRate,
      fundingQuote
    });
    return {
      rate: input.rate,
      intervals: input.holdHours / input.intervalHours,
      fundingQuote,
      annualizedCarry: annualizedCarryOf(input.side, input.rate, input.intervalHours),
      breakevenPrice,
      breakevenMove: favorableMove(input.side, input.entry, breakevenPrice),
      hoursToEatTarget: hoursToEatOf(input.side, input.rate, input.notional, input.intervalHours, input.targetQuote),
      exitFeeAtBreakeven: input.exitFeeRate * input.qty * breakevenPrice
    };
  }
  function compact(n) {
    const abs = Math.abs(n);
    const digits = abs === 0 ? 2 : abs >= 1e3 ? 4 : abs >= 1 ? 6 : 8;
    const text = n.toFixed(digits);
    if (!text.includes(".")) return text;
    return text.replace(/\.?0+$/, "");
  }
  function integerIntervals(holdHours, intervalHours) {
    const n = holdHours / intervalHours;
    return Math.abs(n - Math.round(n)) < 1e-9;
  }
  function projectFunding(input, quotes, options = {}) {
    if (!Array.isArray(quotes) || quotes.length === 0) {
      throw new InputError("NO_QUOTES", "No venue returned a funding rate.");
    }
    const asset = input.asset.trim();
    if (!asset) throw new InputError("MISSING", "Missing asset.");
    const side = reqSide(input.side);
    const entry = reqPositive("entry", input.entry);
    const leverage = reqPositive("leverage", input.leverage);
    const holdHours = reqPositive("holdHours", input.holdHours);
    const windowHours = input.historyWindowHours === void 0 ? DEFAULT_WINDOW_HOURS : reqPositive("historyWindowHours", input.historyWindowHours);
    const entryFeeRate = feeRate("entryFeeRate", input.entryFeeRate, DEFAULT_ENTRY_FEE);
    const exitFeeRate = feeRate("exitFeeRate", input.exitFeeRate, DEFAULT_EXIT_FEE);
    const target = input.targetProfit ?? DEFAULT_TARGET;
    const size = resolveSize(entry, input.qty, input.notional);
    const targetQuote = targetQuoteOf(target, size.notional);
    const seen = /* @__PURE__ */ new Set();
    const built = [];
    for (const quote2 of quotes) {
      const venue = String(quote2.venue);
      if (seen.has(venue)) {
        throw new InputError("INVALID_INPUT", `Duplicate venue "${venue}".`);
      }
      seen.add(venue);
      const intervalHours = reqPositive(`${venue} intervalHours`, quote2.intervalHours);
      const currentRate = reqFinite(`${venue} currentRate`, quote2.currentRate);
      const trail = trailingWindow(quote2.history ?? [], windowHours);
      const shared = {
        side,
        qty: size.qty,
        entry,
        notional: size.notional,
        entryFeeRate,
        exitFeeRate,
        holdHours,
        intervalHours,
        targetQuote
      };
      built.push({
        venue,
        symbol: quote2.symbol,
        intervalHours,
        intervalSource: quote2.intervalSource ?? "venue",
        currentRateKind: quote2.currentRateKind,
        sampleCount: trail?.count ?? 0,
        oldestSampleMs: trail?.oldestMs ?? null,
        newestSampleMs: trail?.newestMs ?? null,
        markPrice: quote2.markPrice,
        paidBy: paidBy(currentRate),
        rank: 0,
        current: projectOne({ ...shared, rate: currentRate }),
        trailing: trail ? projectOne({ ...shared, rate: trail.rate }) : null
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
    const warnings = [];
    const failures = options.failures ?? [];
    for (const failure of failures) {
      warnings.push({
        code: "VENUE_UNAVAILABLE",
        severity: "note",
        message: `${failure.venue} did not return a rate. ${failure.message}`
      });
    }
    const eatParts = [];
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
        message: `On ${focus.venue}, ${eatParts.join(" and ")}. The hold is ${holdHours} hours. The target profit is gone before the hold ends.`
      });
    }
    if (focus.trailing && focus.current.rate * focus.trailing.rate < 0) {
      warnings.push({
        code: "RATE_SIGN_DISAGREE",
        severity: "note",
        message: `On ${focus.venue} the current rate and the trailing average have opposite signs. One of them is the wrong regime for this hold.`
      });
    }
    const shortHistory = built.filter((venue) => venue.sampleCount < 3).map((venue) => venue.venue);
    if (shortHistory.length > 0) {
      warnings.push({
        code: "HISTORY_SHORT",
        severity: "note",
        message: `Fewer than 3 settled prints in the ${windowHours} hour window: ${shortHistory.join(", ")}. The trailing average is thin.`
      });
    }
    if (!integerIntervals(holdHours, focus.intervalHours)) {
      warnings.push({
        code: "FRACTIONAL_HOLD",
        severity: "note",
        message: `The hold is not a whole number of ${focus.venue} intervals. Funding is prorated. It is not rounded to the next settlement.`
      });
    }
    const extreme = built.filter(
      (venue) => Math.abs(venue.current.rate) > EXTREME_RATE || Math.abs(venue.trailing?.rate ?? 0) > EXTREME_RATE
    );
    if (extreme.length > 0) {
      warnings.push({
        code: "EXTREME_RATE",
        severity: "note",
        message: `A rate above ${EXTREME_RATE} per interval is outside the usual perp band: ${extreme.map((venue) => venue.venue).join(", ")}.`
      });
    }
    if (focus.currentRateKind === "last_settled") {
      warnings.push({
        code: "CURRENT_IS_LAST_SETTLED",
        severity: "note",
        message: `${focus.venue} did not publish a predicted rate. The current figure is the latest settlement.`
      });
    }
    if (focus.intervalSource === "default") {
      warnings.push({
        code: "INTERVAL_DEFAULTED",
        severity: "note",
        message: `${focus.venue} did not publish an interval. ${focus.intervalHours} hours is the default for that venue.`
      });
    }
    const stale = quotes.filter((quote2) => {
      if (quote2.fetchedAtMs === void 0) return false;
      const trail = trailingWindow(quote2.history ?? [], windowHours);
      if (!trail) return false;
      const gap = quote2.fetchedAtMs - trail.newestMs;
      return gap > 2 * quote2.intervalHours * 36e5;
    });
    if (stale.length > 0) {
      warnings.push({
        code: "STALE_HISTORY",
        severity: "note",
        message: `The newest settled print is more than two intervals behind the fetch: ${stale.map((quote2) => quote2.venue).join(", ")}.`
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
      failures
    };
  }

  // src/funding.ts
  async function loadQuotes(asset, venues, http = createHttp()) {
    const base = normalizeAsset(asset);
    const ids = venues.map((venue) => reqVenue(venue));
    const settled = await Promise.all(ids.map((venue) => loadVenue(venue, base, http)));
    const quotes = [];
    const failures = [];
    for (const item of settled) {
      if ("message" in item && !("currentRate" in item)) {
        failures.push(item);
      } else {
        quotes.push(item);
      }
    }
    return { quotes, failures };
  }
  async function fundingDrag(input, http) {
    const asset = normalizeAsset(input.asset);
    const venues = input.exchanges === void 0 || input.exchanges.length === 0 ? [...VENUES] : input.exchanges.map((venue) => reqVenue(venue));
    const { quotes, failures } = await loadQuotes(asset, venues, http ?? createHttp());
    if (quotes.length === 0) {
      const detail = failures.map((failure) => `${failure.venue}: ${failure.message}`).join(" ");
      throw new InputError("ALL_VENUES_UNAVAILABLE", detail || "No venue returned a funding rate.");
    }
    return projectFunding({ ...input, asset }, quotes, { failures, focus: input.focus });
  }

  // src/version.ts
  var VERSION = "0.1.0";
  return __toCommonJS(browser_exports);
})();
