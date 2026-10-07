(function () {
  const FD = window.FundingDrag;
  const $ = (id) => document.getElementById(id);

  function num(id) {
    const raw = $(id).value.trim();
    if (raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      const err = new Error(`${id} is not a finite number.`);
      err.code = "NOT_FINITE";
      throw err;
    }
    return n;
  }

  function selectedVenues() {
    return Array.from(document.querySelectorAll('input[name="venue"]:checked')).map((el) => el.value);
  }

  function roundTrip(n) {
    if (n === null || n === undefined) return "none";
    if (!Number.isFinite(n)) return "n/a";
    const abs = Math.abs(n);
    const d = abs === 0 ? 2 : abs >= 1000 ? 4 : abs >= 1 ? 6 : 8;
    const text = n.toFixed(d);
    return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
  }

  function render(result, entryNote) {
    const focus = result.venues.find((venue) => venue.venue === result.focus) || result.venues[0];
    const funding = focus.current.fundingQuote;
    const verb = funding > 0 ? "you pay" : funding < 0 ? "you receive" : "flat";
    const warnings = result.warnings
      .map((warning) => {
        const cls = warning.severity === "loud" ? "warning" : "note";
        const tag = warning.severity === "loud" ? "Warning" : "Note";
        return `<div class="${cls}"><p>${tag}: ${escapeText(warning.message)}</p></div>`;
      })
      .join("");
    const rows = result.venues
      .map(
        (venue) => `<tr>
          <td>${escapeText(venue.venue)}</td>
          <td class="num">${roundTrip(venue.current.fundingQuote)}</td>
          <td class="num">${roundTrip(venue.current.annualizedCarry)}</td>
          <td class="num">${roundTrip(venue.current.breakevenMove)}</td>
          <td class="num">${roundTrip(venue.current.hoursToEatTarget)}</td>
        </tr>`,
      )
      .join("");
    const note = entryNote ? `<div class="note"><p>${escapeText(entryNote)}</p></div>` : "";
    $("out").innerHTML = `${warnings}${note}
      <p class="hero">${roundTrip(funding)}</p>
      <p class="hero-label">${escapeText(verb)} on ${escapeText(focus.venue)} over ${roundTrip(result.holdHours)} hours</p>
      <p>Cheapest: ${escapeText(result.cheapest)}. Notional ${roundTrip(result.notional)}. Margin ${roundTrip(result.margin)}. Entry ${roundTrip(result.entry)}.</p>
      <table>
        <thead><tr><th>Venue</th><th class="num">Funding</th><th class="num">Carry</th><th class="num">Move</th><th class="num">Hours</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="hint">Funding is quote. Positive funding is a cost. Positive carry is income per year, with no compounding. Move is the favorable price fraction that covers funding and the fees you typed. Hours is how long until funding spends the target. None means funding does not spend it.</p>`;
  }

  function escapeText(value) {
    return String(value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
    );
  }

  function fail(err) {
    const code = err && err.code ? err.code : "ERROR";
    const message = err && err.message ? err.message : String(err);
    $("out").innerHTML = `<p class="err">${escapeText(code)}: ${escapeText(message)}</p>`;
  }

  async function calculate() {
    $("out").textContent = "Fetching public funding rates.";
    const asset = $("asset").value;
    const venues = selectedVenues();
    const loaded = await FD.loadQuotes(asset, venues);
    if (!loaded.quotes.length) {
      const detail = loaded.failures.map((failure) => `${failure.venue}: ${failure.message}`).join(" ");
      const err = new Error(detail || "No venue returned a funding rate.");
      err.code = "ALL_VENUES_UNAVAILABLE";
      throw err;
    }
    let entry = num("entry");
    let entryNote = "";
    if (entry === undefined) {
      const marked = loaded.quotes.find((quote) => Number.isFinite(quote.markPrice) && quote.markPrice > 0);
      if (!marked) {
        const err = new Error("Pass an entry. No venue returned a mark.");
        err.code = "MISSING";
        throw err;
      }
      entry = marked.markPrice;
      $("entry").value = String(entry);
      entryNote = `Entry was filled from the ${marked.venue} mark. It is not a fill.`;
    }
    const input = {
      asset,
      side: $("side").value,
      entry,
      leverage: num("leverage"),
      holdHours: num("hold"),
      entryFeeRate: num("entry-fee"),
      exitFeeRate: num("exit-fee"),
      targetProfit: { mode: "percent", value: num("target") },
    };
    const notional = num("notional");
    const qty = num("qty");
    if (notional !== undefined) input.notional = notional;
    if (qty !== undefined) input.qty = qty;
    const result = FD.projectFunding(input, loaded.quotes, { failures: loaded.failures });
    render(result, entryNote);
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const fields = ["asset", "side", "notional", "qty", "entry", "leverage", "hold", "target", "entry-fee", "exit-fee"];
    for (const field of fields) {
      if (params.has(field)) $(field).value = params.get(field);
    }
    if (params.has("venues")) {
      const chosen = new Set(params.get("venues").split(",").filter(Boolean));
      for (const box of document.querySelectorAll('input[name="venue"]')) {
        box.checked = chosen.has(box.value);
      }
    }
  }

  function writeHash() {
    const params = new URLSearchParams();
    for (const field of [
      "asset",
      "side",
      "notional",
      "qty",
      "entry",
      "leverage",
      "hold",
      "target",
      "entry-fee",
      "exit-fee",
    ]) {
      params.set(field, $(field).value.trim());
    }
    params.set("venues", selectedVenues().join(","));
    const url = `${location.origin}${location.pathname}#${params.toString()}`;
    history.replaceState(null, "", `#${params.toString()}`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    return url;
  }

  function buildVenues() {
    const root = $("venues");
    for (const venue of FD.VENUES) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.name = "venue";
      box.value = venue;
      box.checked = true;
      const span = document.createElement("span");
      span.textContent = venue;
      label.append(box, span);
      root.append(label);
    }
  }

  buildVenues();
  readHash();

  $("form").addEventListener("submit", (event) => {
    event.preventDefault();
    calculate().catch(fail);
  });

  $("ex-long").addEventListener("click", () => {
    $("asset").value = "BTC";
    $("side").value = "long";
    $("notional").value = "10000";
    $("qty").value = "";
    $("entry").value = "";
    $("leverage").value = "5";
    $("hold").value = "24";
    $("target").value = "1";
    $("entry-fee").value = "0.0005";
    $("exit-fee").value = "0.0005";
    for (const box of document.querySelectorAll('input[name="venue"]')) box.checked = true;
    calculate().catch(fail);
  });

  $("copy-link").addEventListener("click", () => {
    writeHash();
    $("copy-link").textContent = "Copied";
    setTimeout(() => {
      $("copy-link").textContent = "Copy link";
    }, 1200);
  });

  calculate().catch(fail);
})();
