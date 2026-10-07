import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../src/cli";
import { VERSION } from "../src/version";

test("version and help", async () => {
  const version = await main(["--version"]);
  assert.equal(version.code, 0);
  assert.equal(version.stdout, `${VERSION}\n`);
  const help = await main(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /funding-drag/);
  assert.match(help.stdout, /--target/);
  const bare = await main([]);
  assert.equal(bare.code, 0);
  assert.match(bare.stdout, /Exit codes/);
});

test("the long example is a successful calculation and hyperliquid is cheapest", async () => {
  const run = await main(["--file", "examples/btc-long.json", "--json"]);
  assert.equal(run.code, 0);
  const body = JSON.parse(run.stdout) as {
    ok: boolean;
    tool: string;
    warnings: { code: string; severity: string }[];
    result: {
      cheapest: string;
      focus: string;
      notional: number;
      venues: { venue: string; current: { fundingQuote: number } }[];
    };
  };
  assert.equal(body.ok, true);
  assert.equal(body.tool, "funding");
  assert.equal(body.result.cheapest, "hyperliquid");
  assert.equal(body.result.focus, "hyperliquid");
  assert.equal(body.result.notional, 10000);
  assert.equal(
    body.warnings.some((warning) => warning.severity === "loud"),
    false,
  );
  const text = await main(["--file", "examples/btc-long.json"]);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /cheapest\s+hyperliquid/);
  assert.match(text.stdout, /Funding is charged on notional/);
});

test("strict mode exits 3 when funding spends the target inside the hold", async () => {
  const loose = await main(["--file", "examples/eats-target.json", "--json"]);
  assert.equal(loose.code, 0);
  const looseBody = JSON.parse(loose.stdout) as { ok: boolean; warnings: { code: string; severity: string }[] };
  assert.equal(looseBody.ok, true);
  assert.ok(
    looseBody.warnings.some((warning) => warning.code === "FUNDING_EATS_TARGET" && warning.severity === "loud"),
  );
  const strict = await main(["--file", "examples/eats-target.json", "--json", "--strict"]);
  assert.equal(strict.code, 3);
  const strictBody = JSON.parse(strict.stdout) as { ok: boolean };
  assert.equal(strictBody.ok, true);
});

test("bad input is exit 1 and json stays on stdout", async () => {
  const run = await main([
    "--asset",
    "BTC",
    "--side",
    "up",
    "--notional",
    "1",
    "--entry",
    "1",
    "--leverage",
    "1",
    "--hold",
    "1h",
    "--json",
  ]);
  assert.equal(run.code, 1);
  assert.equal(run.stderr, "");
  const body = JSON.parse(run.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "BAD_SIDE");
  const text = await main(["--asset", "BTC", "--side", "up"]);
  assert.equal(text.code, 1);
  assert.match(text.stderr, /^BAD_SIDE:/);
});

test("flags build the same position as the file when quotes are passed through stdin shape", async () => {
  const run = await main([
    "--asset",
    "BTCUSDT",
    "--side",
    "long",
    "--qty",
    "0.1",
    "--entry",
    "100000",
    "--leverage",
    "10",
    "--hold",
    "24h",
    "--target",
    "1%",
    "--entry-fee",
    "0.05%",
    "--exit-fee",
    "0.0005",
    "--file",
    "examples/btc-long.json",
    "--json",
  ]);
  assert.equal(run.code, 0);
  const body = JSON.parse(run.stdout) as { result: { asset: string; qtyBase: number } };
  assert.equal(body.result.asset, "BTC");
  assert.equal(body.result.qtyBase, 0.1);
});
