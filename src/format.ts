import type { FundingResult, Projection, VenueProjection, Warning } from "./math";

export function roundTrip(n: number, digits = 8): string {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  const d = abs === 0 ? 2 : abs >= 1000 ? 4 : abs >= 1 ? 6 : 8;
  const used = Math.min(digits, d);
  const text = n.toFixed(used);
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

function line(label: string, value: string): string {
  const pad = label.length >= 28 ? `${label}  ` : label.padEnd(28, " ");
  return `${pad}${value}`;
}

function warningBlock(warnings: Warning[]): string[] {
  if (warnings.length === 0) return [];
  const lines: string[] = [];
  for (const warning of warnings) {
    const tag = warning.severity === "loud" ? "WARNING" : "Note";
    lines.push(`${tag}: ${warning.message}`);
  }
  lines.push("");
  return lines;
}

function hours(value: number | null): string {
  return value === null ? "none" : roundTrip(value);
}

function projectionLines(prefix: string, projection: Projection | null): string[] {
  if (!projection) {
    return [line(`${prefix} funding`, "none"), line(`${prefix} carry`, "none")];
  }
  return [
    line(`${prefix} funding`, roundTrip(projection.fundingQuote)),
    line(`${prefix} carry`, roundTrip(projection.annualizedCarry)),
    line(`${prefix} breakeven`, roundTrip(projection.breakevenPrice)),
    line(`${prefix} move`, roundTrip(projection.breakevenMove)),
    line(`${prefix} hours to target`, hours(projection.hoursToEatTarget)),
  ];
}

function venueBlock(venue: VenueProjection): string[] {
  const lines = [
    line("venue", venue.venue),
    line("symbol", venue.symbol),
    line("rank", String(venue.rank)),
    line("interval hours", roundTrip(venue.intervalHours)),
    line("mark", venue.markPrice === null ? "none" : roundTrip(venue.markPrice)),
    line("paid by", venue.paidBy),
    line("current rate", roundTrip(venue.current.rate)),
    line("current rate kind", venue.currentRateKind),
    line("trailing rate", venue.trailing ? roundTrip(venue.trailing.rate) : "none"),
    line("samples", String(venue.sampleCount)),
  ];
  lines.push(...projectionLines("current", venue.current));
  lines.push(...projectionLines("trailing", venue.trailing));
  return lines;
}

export function formatFunding(result: FundingResult): string {
  const lines = warningBlock(result.warnings);
  lines.push(line("asset", result.asset));
  lines.push(line("side", result.side));
  lines.push(line("position size (base)", roundTrip(result.qtyBase)));
  lines.push(line("notional", roundTrip(result.notional)));
  lines.push(line("entry", roundTrip(result.entry)));
  lines.push(line("leverage", roundTrip(result.leverage)));
  lines.push(line("margin", roundTrip(result.margin)));
  lines.push(line("hold hours", roundTrip(result.holdHours)));
  lines.push(line("entry fee rate", roundTrip(result.entryFeeRate)));
  lines.push(line("exit fee rate", roundTrip(result.exitFeeRate)));
  lines.push(line("entry fee", roundTrip(result.entryFee)));
  lines.push(line("target profit", roundTrip(result.targetProfitQuote)));
  lines.push(line("focus", result.focus));
  lines.push(line("cheapest", result.cheapest));
  for (const venue of result.venues) {
    lines.push("");
    lines.push(...venueBlock(venue));
  }
  lines.push("");
  lines.push("comparison, current rate, cheapest first");
  for (const venue of result.venues) {
    lines.push(
      `  ${venue.rank}  ${venue.venue}  funding ${roundTrip(venue.current.fundingQuote)}  carry ${roundTrip(venue.current.annualizedCarry)}  move ${roundTrip(venue.current.breakevenMove)}  hours ${hours(venue.current.hoursToEatTarget)}`,
    );
  }
  lines.push("");
  lines.push("Funding is charged on notional. Leverage does not scale it.");
  lines.push("A positive funding figure is a cost. A positive carry figure is income.");
  lines.push("The rank is funding only. The fee rates you typed are applied on every venue.");
  lines.push("This is a calculation. It is not a signal.");
  return lines.join("\n");
}
