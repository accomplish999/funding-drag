import { InputError } from "./errors";

export function reqFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
  }
  return value;
}

export function reqPositive(name: string, value: unknown): number {
  const n = reqFinite(name, value);
  if (!(n > 0)) {
    throw new InputError("NOT_POSITIVE", `${name} must be greater than 0.`);
  }
  return n;
}

export function reqNonNegative(name: string, value: unknown): number {
  const n = reqFinite(name, value);
  if (n < 0) {
    throw new InputError("NOT_POSITIVE", `${name} must be 0 or greater.`);
  }
  return n;
}

/** A bare number is a fraction. A string ending in % is divided by 100. */
export function parseFraction(name: string, raw: string): number {
  const text = raw.trim();
  if (text.endsWith("%")) {
    const n = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(n)) {
      throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
    }
    return n / 100;
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new InputError("NOT_FINITE", `${name} must be a finite number.`);
  }
  return n;
}

/**
 * Hold length in hours.
 * A bare number is hours. A trailing h, d, or m selects hours, days, or minutes.
 */
export function parseHold(raw: string): number {
  const text = raw.trim().toLowerCase();
  const match = /^([0-9]*\.?[0-9]+)\s*([hdm])?$/.exec(text);
  if (!match?.[1]) {
    throw new InputError("INVALID_INPUT", "Hold is a number of hours, or a number with h, d, or m. Example: 24h.");
  }
  const n = Number(match[1]);
  if (!Number.isFinite(n)) {
    throw new InputError("NOT_FINITE", "Hold must be a finite number.");
  }
  const unit = match[2] ?? "h";
  if (unit === "m") return n / 60;
  if (unit === "d") return n * 24;
  return n;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
