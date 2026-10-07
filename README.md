# funding-drag

<p><a href="https://accompli.sh"><img src="https://accompli.sh/brand/pill-flat.png" alt="Accomplish" height="48" /></a></p>

The cost of holding the perp.

Funding is a fraction of notional, on a clock. A positive print means longs pay shorts. This tool turns that print into quote over the hold you typed, a trailing average of the settled prints, the price move that covers the funding plus the fees you typed, the annualized carry, the hours until funding spends a target, and a rank of the venues that answered.

The hosted calculator is <https://accompli.sh/funding-drag>.

This is arithmetic on published rates. It is not a signal, and it is not advice. Past funding does not predict the next interval.

## Contents

- [Thesis](#thesis)
- [Why the hold has a cost](#why-the-hold-has-a-cost)
- [Market mechanics](#market-mechanics)
- [Exact rules](#exact-rules)
- [Data and method](#data-and-method)
- [Worked results](#worked-results)
- [Limitations](#limitations)
- [Failure modes](#failure-modes)
- [When not to use it](#when-not-to-use-it)
- [CLI](#cli)
- [Library](#library)
- [Web page](#web-page)
- [FAQ](#faq)
- [Live check](#live-check)

The formula writeup is [docs/FUNDING.md](docs/FUNDING.md). Flags are in [docs/CLI.md](docs/CLI.md). The shorter FAQ is [docs/FAQ.md](docs/FAQ.md).

## Thesis

A funding rate without an interval is not a cost. 0.0001 per 8 hours and 0.0000125 per hour are the same carry. The number that matters for a hold is the quote you pay or receive if that rate stays put, plus the fee to get in and the fee to get out.

Version 0.1.0 fetches the public predicted rate and recent settlements from Binance, Bybit, OKX, Hyperliquid, dYdX, Gate, and Bitget. No key. It ranks the venues by funding quote over one hold. Fees are the rates you type, applied to every venue, so the rank is funding only.

There is no forecast and no claim that the cheap venue is a good trade. The blocks below are the CLI text from the example files. Text output rounds. The tests check the exact expressions. A later live run will not match a frozen file. Re-run the CLI before you trust a rounded line from an old checkout.

A venue that prints the opposite sign will not match this map. The tests check the identity in this repository, not a screenshot from a specific account tier.

## Why the hold has a cost

On a linear perpetual the funding cashflow is the rate times notional times the number of intervals in the hold. The side decides the sign. Longs pay when the rate is positive.

Skip the interval and an hourly venue looks ten times cheaper than it is. On the worked file, OKX at 0.0001 per 8 hours costs 3 quote over 24 hours. Hyperliquid at 0.00001 per hour costs 2.4 quote. The raw prints are 0.0001 and 0.00001. The costs are 3 and 2.4. The rank uses 3 and 2.4.

Fees sit outside that product and inside the breakeven. On the OKX row the funding is 3 quote and the breakeven prints as 100130.065, not 100000, because each side is 5 basis points and the exit fee is charged on the exit price.

Leverage is a margin figure. It does not multiply funding. The worked long is 10,000 notional at 10x, so margin is 1,000. The funding quote is the same at 2x.

## Market mechanics

Each venue publishes a rate for one interval. Binance, Bybit, OKX, Gate, and Bitget are usually 8 hours. Hyperliquid and dYdX are 1 hour. The tool reads the interval the venue publishes. If that field is missing it uses the usual length for that venue and says so.

The current rate is the predicted rate for the next settlement when the venue publishes one. The trailing rate is the arithmetic mean of settled prints inside a window. The window ends at the newest settled print. The default length is 168 hours. An hourly venue and an 8 hour venue are averaged over the same number of hours, not the same number of prints.

The projection holds the rate flat and prorates a partial interval. A 12 hour hold on an 8 hour venue is 1.5 intervals. It is not rounded up to two settlements.

Binance and Bybit refuse the public API from some regions. A refusal is a failed read. It is not a zero rate. The other venues are still ranked. If every venue fails, the command exits 1.

## Exact rules

Percent mode for the target: 1 means 1 percent of notional. It does not mean 0.01. A percent above 100 is rejected. Fixed mode is a quote amount.

Fee fields are fractions. `--entry-fee 0.05%` and `--entry-fee 0.0005` match. The default is 0.0005 on the way in and 0.0005 on the way out. That is 5 basis points, a flat assumption, not a VIP schedule.

### Funding quote

```text
intervals     = holdHours / intervalHours
funding quote = sideSign * rate * notional * intervals
```

`sideSign` is +1 for a long and -1 for a short. Positive funding quote means you pay.

### Carry

```text
annualized carry = -sideSign * rate * (8760 / intervalHours)
```

8760 is 365 days of hours. No compounding. Positive carry means you receive.

### Breakeven

```text
long:  (qty * entry * (1 + entry fee) + funding quote) / (qty * (1 - exit fee))
short: (qty * entry * (1 - entry fee) - funding quote) / (qty * (1 + exit fee))
```

The move is `(breakeven - entry) / entry` for a long and `(entry - breakeven) / entry` for a short. Positive means price has to move in your favor.

### Hours to the target

```text
cost per hour = sideSign * rate * notional / intervalHours
hours         = target quote / cost per hour
```

If you are not paying, hours is `none`.

### Loud warning

`FUNDING_EATS_TARGET` fires on the focus venue when the current rate, the trailing rate, or both spend the target before the hold ends. `--strict` turns that into exit code 3. The body is still printed.

| Code                      | Severity | When                                                               |
| ------------------------- | -------- | ------------------------------------------------------------------ |
| `FUNDING_EATS_TARGET`     | loud     | Focus funding spends the target inside the hold.                   |
| `VENUE_UNAVAILABLE`       | note     | A venue did not return a rate. Others did.                         |
| `RATE_SIGN_DISAGREE`      | note     | Focus current rate and trailing average have opposite signs.       |
| `HISTORY_SHORT`           | note     | Fewer than 3 settled prints in the window.                         |
| `FRACTIONAL_HOLD`         | note     | The hold is not a whole number of focus intervals.                 |
| `EXTREME_RATE`            | note     | A rate is above 0.05 per interval.                                 |
| `CURRENT_IS_LAST_SETTLED` | note     | The venue did not publish a prediction. Current is the last print. |
| `INTERVAL_DEFAULTED`      | note     | The venue did not publish an interval.                             |
| `STALE_HISTORY`           | note     | The newest print is more than two intervals behind the fetch.      |

## Data and method

The endpoints are the public market-data routes. No key, no account, no order.

| Venue       | Current                                  | History                               | Interval                             |
| ----------- | ---------------------------------------- | ------------------------------------- | ------------------------------------ |
| Binance     | `fapi/v1/premiumIndex` `lastFundingRate` | `fapi/v1/fundingRate`                 | `fundingInfo`, else 8 hours          |
| Bybit       | v5 linear ticker `fundingRate`           | v5 `funding/history`                  | instrument `fundingInterval` minutes |
| OKX         | `public/funding-rate`                    | `funding-rate-history` `realizedRate` | next funding time minus previous     |
| Hyperliquid | `metaAndAssetCtxs` `funding`             | `fundingHistory`                      | 1 hour                               |
| dYdX        | `perpetualMarkets` `nextFundingRate`     | `historicalFunding`                   | 1 hour                               |
| Gate        | USDT contract `funding_rate`             | `funding_rate` history                | `funding_interval` seconds           |
| Bitget      | `current-fund-rate`                      | `history-fund-rate`                   | `fundingRateInterval` hours          |

`npm test` does not call these. It uses the response shapes. `npm run smoke` calls them for BTC and requires OKX, Hyperliquid, dYdX, Gate, and Bitget to return a finite rate and at least one settled print. Binance and Bybit may refuse the runner's region. A refusal has to be a failure object. A crash fails the smoke. A zero invented in place of a refusal fails it too.

Exit codes:

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | A result, and no loud warning, or a loud warning when `--strict` was not set. |
| 1    | Bad input, unknown command, invalid JSON, or every venue failed.              |
| 3    | A result that includes a loud warning, and `--strict` was set.                |

Success JSON:

```json
{
  "ok": true,
  "tool": "funding",
  "warnings": [],
  "result": {}
}
```

`result.venues` is sorted by current funding quote, lowest first. Tie break is the venue name.

## Worked results

### Two venues, flat trail

[examples/btc-long.json](examples/btc-long.json). The inputs are frozen. They are not a live print.

```bash
npx tsx src/cli.ts --file examples/btc-long.json
```

```text
asset                       BTC
side                        long
position size (base)        0.1
notional                    10000
entry                       100000
leverage                    10
margin                      1000
hold hours                  24
entry fee rate              0.0005
exit fee rate               0.0005
entry fee                   5
target profit               100
focus                       hyperliquid
cheapest                    hyperliquid

venue                       hyperliquid
symbol                      BTC
rank                        1
interval hours              1
mark                        100010
paid by                     longs
current rate                0.00001
current rate kind           predicted
trailing rate               0.00001
samples                     3
current funding             2.4
current carry               -0.0876
current breakeven           100124.062
current move                0.00124062
current hours to target     1000
trailing funding            2.4
trailing carry              -0.0876
trailing breakeven          100124.062
trailing move               0.00124062
trailing hours to target    1000

venue                       okx
symbol                      BTC-USDT-SWAP
rank                        2
interval hours              8
mark                        100000
paid by                     longs
current rate                0.0001
current rate kind           predicted
trailing rate               0.0001
samples                     3
current funding             3
current carry               -0.1095
current breakeven           100130.065
current move                0.00130065
current hours to target     800
trailing funding            3
trailing carry              -0.1095
trailing breakeven          100130.065
trailing move               0.00130065
trailing hours to target    800

comparison, current rate, cheapest first
  1  hyperliquid  funding 2.4  carry -0.0876  move 0.00124062  hours 1000
  2  okx  funding 3  carry -0.1095  move 0.00130065  hours 800

Funding is charged on notional. Leverage does not scale it.
A positive funding figure is a cost. A positive carry figure is income.
The rank is funding only. The fee rates you typed are applied on every venue.
This is a calculation. It is not a signal.
```

OKX: `0.0001 * 10000 * (24 / 8) = 3`. Carry `-0.0001 * 1095 = -0.1095`. Cost per hour is 0.125, so 100 quote of target lasts 800 hours. Hyperliquid: `0.00001 * 10000 * 24 = 2.4`. That row is cheaper, so it is the focus when you do not name one.

### The target is gone first

[examples/eats-target.json](examples/eats-target.json). Rate 0.01 per 8 hours. Fees 0. The 100 quote target lasts 8 hours. The hold is 24.

```bash
npx tsx src/cli.ts --file examples/eats-target.json
```

```text
WARNING: On okx, the current rate spends the target in 8 hours and the trailing rate spends it in 8 hours. The hold is 24 hours. The target profit is gone before the hold ends.

asset                       BTC
side                        long
position size (base)        0.1
notional                    10000
entry                       100000
leverage                    10
margin                      1000
hold hours                  24
entry fee rate              0
exit fee rate               0
entry fee                   0
target profit               100
focus                       okx
cheapest                    okx

venue                       okx
symbol                      BTC-USDT-SWAP
rank                        1
interval hours              8
mark                        none
paid by                     longs
current rate                0.01
current rate kind           predicted
trailing rate               0.01
samples                     3
current funding             300
current carry               -10.95
current breakeven           103000
current move                0.03
current hours to target     8
trailing funding            300
trailing carry              -10.95
trailing breakeven          103000
trailing move               0.03
trailing hours to target    8

comparison, current rate, cheapest first
  1  okx  funding 300  carry -10.95  move 0.03  hours 8

Funding is charged on notional. Leverage does not scale it.
A positive funding figure is a cost. A positive carry figure is income.
The rank is funding only. The fee rates you typed are applied on every venue.
This is a calculation. It is not a signal.
```

`--strict` prints the same text and exits 3. Breakeven is 103000 because 300 quote of funding on 0.1 base is 3,000 points and the fees are zero.

## Limitations

- The rate is held flat. The next interval can flip.
- One fee pair for every venue. A VIP schedule is not looked up.
- No price impact, no spread, no liquidation. This is not a position sizer. Pair it with one if you need the stop.
- Inverse contracts are out. Notional is quote.
- A venue that renames the coin (`kPEPE` on Hyperliquid, `1000PEPE` elsewhere) will miss if you pass the other name. Mixed case is kept. `btc` becomes `BTC`.
- Region blocks. Binance and Bybit return HTTP 451 or 403 from some networks. The tool reports the failure.
- The trailing window can be shorter than 168 hours when the history endpoint caps the page. `HISTORY_SHORT` says when fewer than 3 prints landed in the window.
- Mark price is context. It is not a fill. The page uses it only when entry is empty.

The tool will not place an order. It will not store a fill. It will not tell you the hold is a good idea.

## Failure modes

- Reading the raw rate as the cost. 0.0001 and 0.00001 are not the comparison. 3 and 2.4 are.
- Treating exit 0 as a cheap hold. The 0.01 example exits 0 unless you pass `--strict`.
- Passing 0.01 as the target and expecting 1 percent. That is one hundredth of a percent. Use `--target 1%`.
- Multiplying funding by leverage. The margin line is not the funding line.
- Filling a missing venue with zero. A missing venue is absent from the rank.
- Trusting the trailing mean as the next print. It is the recent mean. The current row is the prediction, when the venue has one.

## When not to use it

- To decide that a trade is worth taking. There is no forecast in the output.
- When you need the fee for your account tier. Type that fee yourself.
- When the coin's name differs by venue and you need a map this tool does not have.
- Inverse contracts.

## CLI

Node 20 or newer. From a clone:

```bash
npm install
npm test
npx tsx src/cli.ts \
  --asset BTC \
  --side long \
  --notional 10000 \
  --entry 100000 \
  --leverage 5 \
  --hold 24h \
  --target 1% \
  --exchange okx \
  --exchange hyperliquid \
  --json
```

`--target 1%` is one percent of notional. A bare `--target 100` is 100 quote.

After `npm run build`, `npx funding-drag` runs `dist/src/cli.js`. `npx tsx src/cli.ts` runs the TypeScript without that build.

The full flag list is [docs/CLI.md](docs/CLI.md). The printed text for the example files is also in [docs/EXAMPLES.md](docs/EXAMPLES.md).

## Library

The package is not on the npm registry. Clone it, or depend on the git tag once one is cut. The import below resolves after `npm run build`. Tests import the TypeScript directly.

```ts
import { projectFunding, fundingDrag } from "funding-drag";

const offline = projectFunding(
  {
    asset: "BTC",
    side: "long",
    notional: 10000,
    entry: 100000,
    leverage: 10,
    holdHours: 24,
    entryFeeRate: 0.0005,
    exitFeeRate: 0.0005,
    targetProfit: { mode: "percent", value: 1 },
  },
  quotes,
);

const live = await fundingDrag({
  asset: "BTC",
  side: "long",
  notional: 10000,
  entry: 100000,
  leverage: 5,
  holdHours: 24,
  exchanges: ["okx", "hyperliquid"],
});
```

`{ mode: "percent", value: 1 }` means 1 percent of notional. It does not mean 0.01.

`projectFunding` does not touch the network. Pass quotes you already parsed, or the objects in an example file. `fundingDrag` fetches. `loadQuotes` fetches and returns quotes plus failures, which is what the page uses. `InputError` carries a `code`.

## Web page

The same functions run in the browser. The page requests public funding routes for the venues you leave checked. It does not send the position anywhere else.

Hosted copy: <https://accompli.sh/funding-drag>.

Locally, `npm run build:web` writes `web/funding-drag.js`. Open [web/index.html](web/index.html) after that. The page needs JavaScript. The CLI does not, if you pass a file that already contains quotes.

The form starts as BTC, long, notional 10,000, leverage 5, hold 24 hours, target 1, fees 0.0005. Entry is empty, so the first mark that comes back fills it and the page says so. `Example: 24h long` restores that and fetches again. `Copy link` writes the fields into the URL hash and copies that URL. A hash is not sent with the page request.

On this form, 1 in the target field means 1 percent. Fees are fractions.

## FAQ

### Why is the size of the rate not the size of the cost

The interval sits in the product. See [Why the hold has a cost](#why-the-hold-has-a-cost).

### I passed 0.01 and got a tiny target

In percent mode, 1 means 1 percent. 0.01 means one hundredth of a percent. On the CLI, write `--target 1%`.

### Can the cheap venue still be a bad hold

Yes. The rank is funding quote at the current rate. It is not edge, and the next interval is not in the file. Fees you did not type are not in the rank.

### Does this match my exchange's funding bill

Only if the rate stays at the print and the interval matches and your fee is the fee you typed. A path of rates will not match a flat projection. Believe the venue's bill for the bill.

### Is this financial advice

No. The numbers are this model applied to the inputs and the rates. Past results do not predict future results.

## Live check

Fetched 2026-10-07. BTC long, notional 10,000, entry 80,000, leverage 5, hold 24 hours, fees 0.0005, target 1 percent. `npm run smoke` required a finite rate and at least one settled print from OKX, Hyperliquid, dYdX, Gate, and Bitget. A later run will differ. The tests do not lock these prints.

| Venue       | Interval | Current rate | Funding quote | Carry    |
| ----------- | -------- | ------------ | ------------- | -------- |
| dYdX        | 1h       | 0.000000127  | 0.0306        | -0.00112 |
| OKX         | 8h       | 0.00001805   | 0.5414        | -0.01976 |
| Gate        | 8h       | 0.000028     | 0.84          | -0.03066 |
| Bitget      | 8h       | 0.00009      | 2.7           | -0.09855 |
| Hyperliquid | 1h       | 0.0000125    | 3             | -0.1095  |

dYdX was cheapest on that fetch. Binance returned HTTP 451 and Bybit returned HTTP 403 from this network. Both are notes, not zero rates. Hyperliquid's hourly 0.0000125 and a flat 0.0001 per 8 hours are the same 3 quote over 24 hours. That row cost 3 quote. The raw print is not the comparison.

## License

[MIT](LICENSE). Copyright 2026 funding-drag contributors.
