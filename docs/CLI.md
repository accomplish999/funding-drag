# CLI

Node 20 or newer.

```bash
npm install
npx tsx src/cli.ts --help
```

```text
funding-drag [flags]
```

Shared flags: `--json`, `--strict`, `--file path` (and `--file -` for stdin), `--help`, `--version`. When a file is set, input flags besides `--json` and `--strict` are ignored.

## Flags

| Flag               | Meaning                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `--asset`          | Base ticker. `BTCUSDT` and `BTC-USDT-SWAP` both become `BTC`.       |
| `--side`           | `long` or `short`.                                                  |
| `--notional`       | Quote size.                                                         |
| `--qty`            | Base size. Entry turns it into notional.                            |
| `--entry`          | Entry price.                                                        |
| `--leverage`       | Positive number. Margin is notional / leverage. Funding ignores it. |
| `--hold`           | `24h`, `7d`, `30m`, or a bare number of hours.                      |
| `--hold-hours`     | Hours. Do not pass this and `--hold`.                               |
| `--exchange`       | Repeatable. Default is every known venue.                           |
| `--focus`          | Headline venue. Default is the cheapest current funding quote.      |
| `--entry-fee`      | Fraction, or a percent with `%`. Default `0.0005`.                  |
| `--exit-fee`       | Same. Default `0.0005`.                                             |
| `--fee`            | Sets both fee rates when the specific flag is absent.               |
| `--target`         | `1%` is 1 percent of notional. A bare number is quote.              |
| `--target-percent` | `1` means 1 percent of notional.                                    |
| `--window-hours`   | Trailing window. Default 168.                                       |

Known venues: `binance`, `bybit`, `okx`, `hyperliquid`, `dydx`, `gate`, `bitget`.

A file with a `quotes` array does not open the network. A file without `quotes` fetches the venues in `exchanges`, or every venue when that field is absent.

## Exit codes

| Code | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 0    | A result, and no loud warning, or a loud warning when `--strict` was not set. |
| 1    | Bad input, unknown command, invalid JSON, or every requested venue failed.    |
| 3    | A result that includes a loud warning, and `--strict` was set.                |

## JSON

Success:

```json
{
  "ok": true,
  "tool": "funding",
  "warnings": [],
  "result": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": { "code": "BAD_SIDE", "message": "Side must be \"long\" or \"short\"." }
}
```

Read `ok`, then `warnings`, then `result`. A loud warning is still a successful calculation. `result.cheapest` is the venue with the lowest current funding quote. `result.focus` is that venue unless you set a focus. `result.venues[]` is already ranked. Positive `fundingQuote` is a cost. Positive `annualizedCarry` is income.
