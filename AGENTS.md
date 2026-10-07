# Agents

This repo prices the carry of a hold. It does not send an order. Do not treat a result as a signal.

Use `--json`. Read `ok`, then `warnings`, then `result`. A loud warning is still a successful calculation. Exit 0 means "no loud warning, or strict mode was off." It does not mean the hold is cheap.

```bash
npx tsx src/cli.ts --file examples/btc-long.json --json
npx tsx src/cli.ts --file examples/eats-target.json --json --strict
```

`--strict` on the second file exits 3 and still prints the body. Parse stdout either way.

Percent inputs: `1` means 1 percent of notional, not 0.01. On the CLI, prefer `--target 1%`.

A positive funding figure is a cost. A positive carry figure is income. Do not compare a raw 8 hour rate with a raw hourly rate.

Full field list, exit codes, and the JSON envelope: [docs/AGENTS.md](docs/AGENTS.md).
Formulas: [docs/FUNDING.md](docs/FUNDING.md).
