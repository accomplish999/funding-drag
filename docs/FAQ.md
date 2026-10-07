# FAQ

## Why is the hourly venue's rate so much smaller

The interval is different. 0.0001 per 8 hours and 0.0000125 per hour are the same carry. Read `fundingQuote` over the hold, or `annualizedCarry`. Both use the interval.

## I passed 0.01 and the target exploded

In percent mode, 1 means 1 percent of notional. 0.01 means one hundredth of a percent. On the CLI, `--target 1%` or `--target-percent 1`. A bare `--target 100` is 100 quote. Fees are the other way: `--entry-fee 0.05%` and `--entry-fee 0.0005` match.

## Does leverage multiply funding

No. Funding is a fraction of notional. Margin is notional divided by leverage. The two numbers are both printed so that split is visible.

## The breakeven is not the entry

Fees and funding sit in the price. On the worked long, OKX funding is 3 quote and each fee is 5 basis points. The breakeven prints as 100130.065, not 100000.

## One venue failed

The others are still ranked. The failure is a note, `VENUE_UNAVAILABLE`. Binance and Bybit refuse some regions on the public API. That is a block, not a zero rate. If every venue fails, the exit is 1.

## Exit 0

Exit 0 means there was no loud warning, or you did not pass `--strict`. The eats-target example exits 0 unless you pass `--strict`, and funding still spends the target in 8 hours.

## Is the trailing average a forecast

No. It is the mean of settled prints inside the window, and the window ends at the newest print. The current figure is the venue's predicted rate for the next interval when the venue publishes one.

## Is this financial advice

No. The numbers are this model applied to the rates the venues published and the fees you typed. Past funding does not predict the next interval.
