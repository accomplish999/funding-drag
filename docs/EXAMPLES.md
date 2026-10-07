# Examples

These blocks are the CLI text for the files in [examples/](../examples/). Nothing here is a live print. A live run is `npm run smoke`.

## Long, two venues

[examples/btc-long.json](../examples/btc-long.json). Notional 10,000. Entry 100,000. Leverage 10. Hold 24 hours. Fees 5 basis points in and out. Target 1 percent of notional, so 100 quote.

OKX is 0.0001 per 8 hours. That is 3 intervals and 3 quote of funding. Hyperliquid is 0.00001 per hour, 24 intervals, 2.4 quote. Hyperliquid is cheaper on this input. The trailing window is flat, so trailing matches current.

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

OKX carry is -0.1095, which is `-0.0001 * (8760 / 8)`. The breakeven 100130.065 is the long identity in [docs/FUNDING.md](FUNDING.md) with a funding quote of 3 and 5 basis points each side. Hours to target is 800 because the position pays 0.125 quote per hour and the target is 100.

## Funding spends the target

[examples/eats-target.json](../examples/eats-target.json). Same size. Fees 0. Rate 0.01 per 8 hours. The position pays 300 quote over 24 hours, and it pays the 100 quote target in 8 hours.

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

The same command with `--strict` prints the same text and exits 3. Without it, the exit is 0 and the warning is still there. With zero fees the breakeven is 103000, a 3 percent favorable move, because 300 quote of funding on a 0.1 base position is 3,000 points.
