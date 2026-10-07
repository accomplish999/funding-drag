import { InputError } from "./errors";
import { loadVenue } from "./exchanges";
import { createHttp, type HttpClient } from "./http";
import { projectFunding, type FundingResult, type PositionInput, type VenueFailure, type VenueQuote } from "./math";
import { normalizeAsset, reqVenue, VENUES, type VenueId } from "./symbols";

export interface FundingRequest extends PositionInput {
  exchanges?: string[];
}

export async function loadQuotes(
  asset: string,
  venues: readonly string[],
  http: HttpClient = createHttp(),
): Promise<{ quotes: VenueQuote[]; failures: VenueFailure[] }> {
  const base = normalizeAsset(asset);
  const ids = venues.map((venue) => reqVenue(venue));
  const settled = await Promise.all(ids.map((venue) => loadVenue(venue, base, http)));
  const quotes: VenueQuote[] = [];
  const failures: VenueFailure[] = [];
  for (const item of settled) {
    if ("message" in item && !("currentRate" in item)) {
      failures.push(item);
    } else {
      quotes.push(item as VenueQuote);
    }
  }
  return { quotes, failures };
}

export async function fundingDrag(input: FundingRequest, http?: HttpClient): Promise<FundingResult> {
  const asset = normalizeAsset(input.asset);
  const venues: VenueId[] =
    input.exchanges === undefined || input.exchanges.length === 0
      ? [...VENUES]
      : input.exchanges.map((venue) => reqVenue(venue));
  const { quotes, failures } = await loadQuotes(asset, venues, http ?? createHttp());
  if (quotes.length === 0) {
    const detail = failures.map((failure) => `${failure.venue}: ${failure.message}`).join(" ");
    throw new InputError("ALL_VENUES_UNAVAILABLE", detail || "No venue returned a funding rate.");
  }
  return projectFunding({ ...input, asset }, quotes, { failures, focus: input.focus });
}
