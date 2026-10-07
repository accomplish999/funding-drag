import { InputError } from "./errors";

export const VENUES = ["binance", "bybit", "okx", "hyperliquid", "dydx", "gate", "bitget"] as const;

export type VenueId = (typeof VENUES)[number];

const VENUE_SET = new Set<string>(VENUES);

export function isVenue(value: string): value is VenueId {
  return VENUE_SET.has(value);
}

export function reqVenue(value: string): VenueId {
  const id = value.trim().toLowerCase();
  if (!isVenue(id)) {
    throw new InputError("BAD_VENUE", `Unknown venue "${value}". Known venues: ${VENUES.join(", ")}.`);
  }
  return id;
}

/**
 * Base asset.
 * BTCUSDT, BTC-USDT-SWAP, and btc all become BTC.
 * Mixed case is kept, so Hyperliquid's kPEPE stays kPEPE.
 * XBT becomes BTC.
 */
export function normalizeAsset(raw: string): string {
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
    /PERP$/i,
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

export function venueSymbol(venue: VenueId, asset: string): string {
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
