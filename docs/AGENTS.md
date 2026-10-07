# Agents

Call the CLI. Do not scrape the text table. The text view rounds. JSON keeps the double the tests use.

This repo prices the carry of a hold. It does not send an order. Do not treat a result as a signal.

## Envelope

```json
{
  "ok": true,
  "tool": "funding",
  "warnings": [{ "code": "FUNDING_EATS_TARGET", "severity": "loud", "message": "..." }],
  "result": {}
}
```

On bad input:

```json
{ "ok": false, "error": { "code": "BAD_SIDE", "message": "..." } }
```

| Exit | When                                                                            |
| ---- | ------------------------------------------------------------------------------- |
| 0    | `ok` is true, and either there is no loud warning or `--strict` was not passed. |
| 1    | `ok` is false.                                                                  |
| 3    | `ok` is true, a warning has `severity` `loud`, and `--strict` was passed.       |

Stdout is the whole object, pretty-printed, with a trailing newline. JSON mode does not write the error to stderr.

```bash
npx tsx src/cli.ts --file examples/btc-long.json --json
npx tsx src/cli.ts --file examples/eats-target.json --json --strict
```

`--strict` on the second file exits 3 and still prints the body. Parse stdout either way.

## Fields

- `result.notional`, `result.qtyBase`, `result.margin`, `result.entryFee`
- `result.cheapest` and `result.focus`
- `result.venues[]` is ranked. Rank 1 is the lowest current `fundingQuote`.
- `result.venues[].current.fundingQuote` is the hold cost. Positive means the position pays.
- `result.venues[].current.annualizedCarry` is income. Positive means the position receives.
- `result.venues[].current.breakevenMove` is the favorable price fraction that covers funding and fees.
- `result.venues[].current.hoursToEatTarget` is null when funding does not spend the target.
- `result.failures` lists venues that did not return a rate. A note uses code `VENUE_UNAVAILABLE`.
- `warnings`

If `FUNDING_EATS_TARGET` is present, say that in the same breath as the cost. Do not drop it because the exit code was 0.

## Input traps

- `targetProfit.mode = "percent"` and `value: 1` is 1 percent of notional.
- `entryFeeRate: 0.0005` is 5 basis points, not 5 percent.
- A positive venue rate means longs pay shorts. Do not flip it.
- Do not compare a raw 8 hour print with a raw hourly print. Read `fundingQuote` or `annualizedCarry`.
- Leverage does not scale funding.
- Hyperliquid names are case-sensitive when they are mixed case. `kPEPE` stays `kPEPE`. `btc` becomes `BTC`.

## What not to do

Do not invent a funding path. Do not tell the user the venue is a good place to hold. The tool does not know that. A missing venue is a failure to read, not a zero rate.
