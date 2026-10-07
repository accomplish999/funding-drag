# Funding

The identities below are what the tests lock. Text output rounds. JSON keeps the double.

A venue prints a funding rate as a fraction of notional per interval. A positive rate means longs pay shorts. That is the sign this tool uses for Binance, Bybit, OKX, Hyperliquid, dYdX, Gate, and Bitget.

## Cashflow

`sideSign` is +1 for a long and -1 for a short.

```text
intervals     = holdHours / intervalHours
funding quote = sideSign * rate * notional * intervals
```

Positive funding quote means the position pays. Negative means the position receives.

The hold is prorated. A 12 hour hold on an 8 hour venue is 1.5 intervals. The tool does not round up to the next settlement.

Leverage is not in that product. Margin is notional divided by leverage. Funding is charged on notional.

## Carry

No compounding. The year is 365 days, 8760 hours.

```text
annualized carry = -sideSign * rate * (8760 / intervalHours)
```

Positive carry means the position receives funding. A long at +0.0001 per 8 hours has carry -0.1095. The same long at +0.0000125 per hour has the same carry, because 0.0000125 * 8 = 0.0001. Comparing the raw prints without the interval is the wrong comparison. The rank uses funding quote over the hold you typed.

## Breakeven

Entry fee is `entryFeeRate * notional`. The exit fee is charged on the exit notional, so the price is inside the fee.

Long:

```text
breakeven = (qty * entry * (1 + entryFeeRate) + funding quote) / (qty * (1 - exitFeeRate))
```

Short:

```text
breakeven = (qty * entry * (1 - entryFeeRate) - funding quote) / (qty * (1 + exitFeeRate))
```

`funding quote` is signed. Income makes the breakeven easier.

The move is the favorable fraction of entry:

```text
long:  (breakeven - entry) / entry
short: (entry - breakeven) / entry
```

Positive means price has to move in your favor to cover funding and both fees. At that price, price pnl minus both fees minus funding quote is 0. The tests check that identity.

## Hours until funding spends a target

The default target is 1 percent of notional. On the CLI, `--target 1%` is that. A bare `--target 100` is 100 quote.

```text
cost per hour = sideSign * rate * notional / intervalHours
hours         = target quote / cost per hour
```

If cost per hour is not positive, funding does not spend the target. The field is null and the text says `none`.

The current rate and the trailing average are each run through the same identities. The trailing average is the arithmetic mean of settled prints whose time is inside the window. The window ends at the newest settled print, not at the wall clock. The default window is 168 hours.

## Loud warning

`FUNDING_EATS_TARGET` fires on the focus venue when the current path, the trailing path, or both spend the target in fewer hours than the hold. `--strict` turns that into exit 3. The body is still printed. Exit 0 does not mean the hold is cheap.

## What is not in the model

The rate is held flat. A path of future rates is not forecast. The interval is the venue's published interval, and a missing interval falls back to that venue's usual length and says so. Fees are the two rates you typed, not a VIP schedule. The rank ignores fee differences between venues.
