import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("web/app.js", "utf8");

test("the page does not print venue or entry notes", () => {
  assert.equal(page.includes("did not return a rate"), false);
  assert.equal(page.includes("Failed to fetch"), false);
  assert.equal(page.includes("Entry was filled"), false);
  assert.equal(page.includes("It is not a fill"), false);
  assert.equal(page.includes("opposite signs"), false);
  assert.equal(page.includes("Note:"), false);
  assert.equal(page.includes("WARNING"), false);
  assert.equal(page.includes('class="note"'), false);
  assert.equal(page.includes('class="warning"'), false);
  assert.equal(page.includes('class="err"'), false);
});

test("the page has one plain line when every venue fails", () => {
  assert.equal(page.includes("No rates available right now. Try again."), true);
});

test("the page does not say public rates, no key", () => {
  const html = readFileSync("web/index.html", "utf8");
  assert.equal(/public rates/i.test(html), false);
  assert.equal(/no key/i.test(html), false);
});

test("panel notes use a soft hairline and muted type in both schemes", () => {
  const css = readFileSync("web/styles.css", "utf8");
  const hintStart = css.indexOf(".hint {");
  const hint = css.slice(hintStart, css.indexOf("}", hintStart));
  assert.match(css, /--muted:\s*#3a3a3a/);
  assert.match(css, /--line:\s*#000/);
  assert.match(css, /--soft:\s*#d8d8d8/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /--muted:\s*#c6c6c6/);
  assert.match(css, /--line:\s*#fff/);
  assert.match(css, /--soft:\s*#2a2a2a/);
  assert.match(hint, /border-top:\s*1px solid var\(--soft\)/);
  assert.match(hint, /color:\s*var\(--muted\)/);
  assert.match(hint, /font-size:\s*11px/);
  assert.match(hint, /line-height:\s*1\.6/);
  assert.match(css, /border-top:\s*1px solid var\(--line\)/);
});
