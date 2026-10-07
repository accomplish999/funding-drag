# Changelog

## Unreleased

- Page: results are easy to read on a phone. Under 560px each venue is a card, cheapest first, with a cost bar against the most expensive venue and a CHEAPEST tag. A one-line takeaway is computed from the results. Funding shows as money, carry as a yearly percent with a real minus sign, move as a percent, and hours as days and hours or never. Inputs are 16px.

## 0.1.0

First public release.

- Funding cost of a perp hold from live public rates: Binance, Bybit, OKX, Hyperliquid, dYdX, Gate, and Bitget.
- Current rate and a trailing average. Annualized carry, breakeven move, and the hours until funding spends a target.
- Cross-venue rank by funding quote over the hold.
- Loud warning when that cost arrives before the hold ends.
- CLI, library, and a static page.
