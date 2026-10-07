#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { InputError, isInputError } from "./errors";
import { formatFunding } from "./format";
import { fundingDrag } from "./funding";
import {
  projectFunding,
  reqSide,
  type PositionInput,
  type SettledSample,
  type TargetProfit,
  type VenueQuote,
} from "./math";
import { parseFraction, parseHold, reqFinite, reqPositive } from "./numbers";
import { normalizeAsset, VENUES } from "./symbols";
import { VERSION } from "./version";

interface Flags {
  json: boolean;
  strict: boolean;
  file?: string;
  positionals: string[];
  map: Map<string, string[]>;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function parseArgv(argv: string[]): Flags {
  const map = new Map<string, string[]>();
  const positionals: string[] = [];
  let json = false;
  let strict = false;
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--strict") {
      strict = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      positionals.push("help");
      continue;
    }
    if (token === "--version" || token === "-v") {
      positionals.push("version");
      continue;
    }
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      let key: string;
      let value: string | undefined;
      if (eq >= 0) {
        key = body.slice(0, eq);
        value = body.slice(eq + 1);
      } else {
        key = body;
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i++;
        }
      }
      if (key === "file") {
        file = value ?? "";
        continue;
      }
      const list = map.get(key) ?? [];
      if (value !== undefined) list.push(value);
      else list.push("true");
      map.set(key, list);
      continue;
    }
    positionals.push(token);
  }
  return { json, strict, file, positionals, map };
}

function flag(flags: Flags, key: string): string | undefined {
  const list = flags.map.get(key);
  if (!list || list.length === 0) return undefined;
  return list[list.length - 1];
}

function flagList(flags: Flags, key: string): string[] {
  return flags.map.get(key) ?? [];
}

function requireFlag(flags: Flags, key: string): string {
  const value = flag(flags, key);
  if (value === undefined) {
    throw new InputError("MISSING", `Missing --${key}.`);
  }
  return value;
}

function readInput(file: string | undefined): unknown {
  if (file === undefined) return undefined;
  if (file === "") {
    throw new InputError("MISSING", "Missing a path after --file. Use --file - to read stdin.");
  }
  const raw = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InputError("INVALID_JSON", "The input file is not valid JSON.");
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("INVALID_INPUT", `${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function numField(obj: Record<string, unknown>, key: string, fallback?: number): number {
  const value = obj[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new InputError("MISSING", `Missing ${key}.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputError("NOT_FINITE", `${key} must be a finite number.`);
  }
  return value;
}

function optNum(obj: Record<string, unknown>, key: string): number | undefined {
  if (obj[key] === undefined) return undefined;
  return numField(obj, key);
}

function strField(obj: Record<string, unknown>, key: string, fallback?: string): string {
  const value = obj[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new InputError("MISSING", `Missing ${key}.`);
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new InputError("INVALID_INPUT", `${key} must be a string.`);
  }
  return value;
}

function stringList(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new InputError("INVALID_INPUT", `${key} must be an array of strings.`);
  }
  return value;
}

function targetFromUnknown(value: unknown): TargetProfit | undefined {
  if (value === undefined) return undefined;
  const obj = asRecord(value, "targetProfit");
  const mode = strField(obj, "mode");
  if (mode !== "percent" && mode !== "fixed") {
    throw new InputError("INVALID_INPUT", 'targetProfit.mode must be "percent" or "fixed".');
  }
  return { mode, value: numField(obj, "value") };
}

function samplesFromUnknown(value: unknown, label: string): SettledSample[] {
  if (!Array.isArray(value)) {
    throw new InputError("INVALID_INPUT", `${label} must be an array.`);
  }
  return value.map((item, index) => {
    const row = asRecord(item, `${label}[${index}]`);
    return { timeMs: numField(row, "timeMs"), rate: numField(row, "rate") };
  });
}

function quotesFromUnknown(value: unknown): VenueQuote[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new InputError("INVALID_INPUT", "quotes must be an array.");
  }
  return value.map((item, index) => {
    const row = asRecord(item, `quotes[${index}]`);
    const kind = strField(row, "currentRateKind");
    if (kind !== "predicted" && kind !== "last_settled") {
      throw new InputError("INVALID_INPUT", 'currentRateKind must be "predicted" or "last_settled".');
    }
    const quote: VenueQuote = {
      venue: strField(row, "venue"),
      symbol: strField(row, "symbol"),
      intervalHours: numField(row, "intervalHours"),
      currentRate: numField(row, "currentRate"),
      currentRateKind: kind,
      history: samplesFromUnknown(row.history, `quotes[${index}].history`),
      markPrice: row.markPrice === null || row.markPrice === undefined ? null : numField(row, "markPrice"),
    };
    if (row.intervalSource !== undefined) {
      const source = strField(row, "intervalSource");
      if (source !== "venue" && source !== "default") {
        throw new InputError("INVALID_INPUT", 'intervalSource must be "venue" or "default".');
      }
      quote.intervalSource = source;
    }
    return quote;
  });
}

interface LoadedInput {
  position: PositionInput;
  exchanges?: string[];
  quotes?: VenueQuote[];
}

function positionFromRecord(obj: Record<string, unknown>): LoadedInput {
  const position: PositionInput = {
    asset: normalizeAsset(strField(obj, "asset")),
    side: reqSide(strField(obj, "side")),
    entry: numField(obj, "entry"),
    leverage: numField(obj, "leverage"),
    holdHours: numField(obj, "holdHours"),
  };
  const qty = optNum(obj, "qty");
  const notional = optNum(obj, "notional");
  if (qty !== undefined) position.qty = qty;
  if (notional !== undefined) position.notional = notional;
  if (obj.entryFeeRate !== undefined) position.entryFeeRate = numField(obj, "entryFeeRate");
  if (obj.exitFeeRate !== undefined) position.exitFeeRate = numField(obj, "exitFeeRate");
  if (obj.historyWindowHours !== undefined) position.historyWindowHours = numField(obj, "historyWindowHours");
  const target = targetFromUnknown(obj.targetProfit);
  if (target) position.targetProfit = target;
  if (obj.focus !== undefined) position.focus = strField(obj, "focus");
  return {
    position,
    exchanges: stringList(obj.exchanges, "exchanges"),
    quotes: quotesFromUnknown(obj.quotes),
  };
}

function positionFromFlags(flags: Flags): LoadedInput {
  const position: PositionInput = {
    asset: normalizeAsset(requireFlag(flags, "asset")),
    side: reqSide(requireFlag(flags, "side")),
    entry: reqPositive("entry", Number(requireFlag(flags, "entry"))),
    leverage: reqPositive("leverage", Number(requireFlag(flags, "leverage"))),
    holdHours: holdFromFlags(flags),
  };
  const qty = flag(flags, "qty");
  const notional = flag(flags, "notional");
  if (qty !== undefined) position.qty = reqPositive("qty", Number(qty));
  if (notional !== undefined) position.notional = reqPositive("notional", Number(notional));
  const fee = flag(flags, "fee");
  const entryFee = flag(flags, "entry-fee");
  const exitFee = flag(flags, "exit-fee");
  if (entryFee !== undefined) position.entryFeeRate = parseFraction("entry fee", entryFee);
  else if (fee !== undefined) position.entryFeeRate = parseFraction("fee", fee);
  if (exitFee !== undefined) position.exitFeeRate = parseFraction("exit fee", exitFee);
  else if (fee !== undefined) position.exitFeeRate = parseFraction("fee", fee);
  const targetPercent = flag(flags, "target-percent");
  const target = flag(flags, "target");
  if (targetPercent !== undefined) {
    position.targetProfit = { mode: "percent", value: reqFinite("target percent", Number(targetPercent)) };
  } else if (target !== undefined) {
    position.targetProfit = targetFlag(target);
  }
  const windowHours = flag(flags, "window-hours");
  if (windowHours !== undefined) position.historyWindowHours = reqPositive("window hours", Number(windowHours));
  const focus = flag(flags, "focus");
  if (focus !== undefined) position.focus = focus.trim().toLowerCase();
  const exchanges = flagList(flags, "exchange").map((item) => item.trim().toLowerCase());
  return { position, exchanges: exchanges.length > 0 ? exchanges : undefined };
}

function holdFromFlags(flags: Flags): number {
  const hours = flag(flags, "hold-hours");
  const hold = flag(flags, "hold");
  if (hours !== undefined && hold !== undefined) {
    throw new InputError("INVALID_INPUT", "Pass --hold or --hold-hours, not both.");
  }
  if (hours !== undefined) return reqPositive("hold hours", Number(hours));
  if (hold !== undefined) {
    const parsed = parseHold(hold);
    return reqPositive("hold", parsed);
  }
  throw new InputError("MISSING", "Missing --hold. Example: --hold 24h.");
}

function targetFlag(raw: string): TargetProfit {
  const text = raw.trim();
  if (text.endsWith("%")) {
    const n = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(n)) throw new InputError("NOT_FINITE", "Target must be a finite number.");
    return { mode: "percent", value: n };
  }
  const n = Number(text);
  if (!Number.isFinite(n)) throw new InputError("NOT_FINITE", "Target must be a finite number.");
  return { mode: "fixed", value: n };
}

const HELP = `funding-drag ${VERSION}

The cost of holding a perp. Live funding in, carry and breakeven out.
This is a calculation. It does not send an order.

  funding-drag [flags]

Flags
  --asset <ticker>                BTC, ETH, or a venue symbol such as BTCUSDT
  --side long|short
  --notional <quote>              or --qty <base>. Entry turns one into the other.
  --qty <base>
  --entry <price>
  --leverage <n>                  margin is notional / leverage. Funding ignores it.
  --hold <24h|7d|30m|hours>       or --hold-hours
  --exchange <venue>              repeatable. Default: ${VENUES.join(", ")}
  --focus <venue>                 headline venue. Default: the cheapest current rate.
  --entry-fee <fraction or %>     default 0.0005
  --exit-fee <fraction or %>      default 0.0005
  --fee <fraction or %>           sets both fee rates
  --target <1% or quote>          default 1% of notional. 1% means 1 percent.
  --target-percent <n>            1 means 1 percent of notional
  --window-hours <n>              trailing window ending at the newest print. Default 168.
  --file <path|->                 JSON input. Other input flags are ignored.
  --json
  --strict                        loud warning exits 3. The body is still printed.
  --help
  --version

A positive funding figure is a cost. A positive carry figure is income.
A positive rate on the venue means longs pay shorts.

Exit codes
  0  result, no loud warning
  1  bad input, or every venue failed
  3  result, and --strict saw a loud warning
`;

function emit(flags: Flags, payload: unknown, text: string, loud: boolean): RunResult {
  const stdout = flags.json ? `${JSON.stringify(payload, null, 2)}\n` : `${text}\n`;
  if (flags.strict && loud) return { code: 3, stdout, stderr: "" };
  return { code: 0, stdout, stderr: "" };
}

function hasLoud(warnings: { severity: string }[]): boolean {
  return warnings.some((warning) => warning.severity === "loud");
}

export async function main(argv: string[]): Promise<RunResult> {
  try {
    const flags = parseArgv(argv);
    const command = flags.positionals[0];
    if (command === "version") {
      return { code: 0, stdout: `${VERSION}\n`, stderr: "" };
    }
    if (command === "help" || (command === undefined && flags.file === undefined && flags.map.size === 0)) {
      return { code: 0, stdout: HELP, stderr: "" };
    }
    if (command !== undefined) {
      throw new InputError("USAGE", `Unknown command "${command}". See funding-drag --help.`);
    }
    if (flags.positionals.length > 1) {
      throw new InputError("USAGE", "Unexpected extra arguments. See funding-drag --help.");
    }
    const fileValue = readInput(flags.file);
    const loaded =
      fileValue !== undefined ? positionFromRecord(asRecord(fileValue, "input")) : positionFromFlags(flags);
    const result =
      loaded.quotes !== undefined
        ? projectFunding(loaded.position, loaded.quotes, { focus: loaded.position.focus })
        : await fundingDrag({ ...loaded.position, exchanges: loaded.exchanges });
    return emit(
      flags,
      { ok: true, tool: "funding", warnings: result.warnings, result },
      formatFunding(result),
      hasLoud(result.warnings),
    );
  } catch (err) {
    if (isInputError(err)) {
      const flags = parseArgv(argv);
      if (flags.json) {
        const stdout = `${JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }, null, 2)}\n`;
        return { code: 1, stdout, stderr: "" };
      }
      return { code: 1, stdout: "", stderr: `${err.code}: ${err.message}\n` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { code: 1, stdout: "", stderr: `UNEXPECTED: ${message}\n` };
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(({ code, stdout, stderr }) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`UNEXPECTED: ${message}\n`);
      process.exitCode = 1;
    });
}
