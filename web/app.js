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

  // Number formatting for people: real minus signs, separators, tabular figures in CSS.
  const MINUS = "\u2212";
  const minus = (text) => text.replace(/-/g, MINUS);

  function money(n) {
    if (!Number.isFinite(n)) return "n/a";
    const text = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
    return minus(text === "-$0.00" ? "$0.00" : text);
  }

  function amount(n) {
    if (!Number.isFinite(n)) return "n/a";
    const text = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
    return minus(text);
  }

  function plain(n, max) {
    if (!Number.isFinite(n)) return "n/a";
    return minus(new Intl.NumberFormat("en-US", { maximumFractionDigits: max }).format(n));
  }

  function price(n) {
    if (!Number.isFinite(n)) return "n/a";
    const abs = Math.abs(n);
    if (abs >= 1000) return plain(n, 2);
    if (abs >= 1) return plain(n, 4);
    return minus(new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(n));
  }

  // Carry is a yearly fraction of notional. Positive is income.
  function carry(n) {
    if (!Number.isFinite(n)) return "n/a";
    const pct = n * 100;
    const text = Math.abs(pct).toFixed(2) + "%";
    if (text === "0.00%") return text;
    return (pct < 0 ? MINUS : "+") + text;
  }

  // Move is a price fraction. Shown as a percent with up to 3 significant digits.
  function move(n) {
    if (!Number.isFinite(n)) return "n/a";
    if (n === 0) return "0%";
    const text = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(n * 100);
    return minus(text) + "%";
  }

  function hours(n) {
    if (n === null || n === undefined) return "never";
    if (!Number.isFinite(n)) return "n/a";
    if (n < 10) return `${plain(n, 1)}h`;
    if (n < 48) return `${Math.round(n)}h`;
    let days = Math.floor(n / 24);
    let rest = Math.round(n - days * 24);
    if (rest === 24) {
      days += 1;
      rest = 0;
    }
    if (days >= 1000) return `${plain(n / 8760, 1)}y`;
    return rest ? `${plain(days, 0)}d ${rest}h` : `${plain(days, 0)}d`;
  }

  function holdText(n) {
    return n === 1 ? "1 hour" : `${plain(n, 2)} hours`;
  }

  function ratioText(r) {
    return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2 }).format(r) + "x";
  }

  // One sentence from the numbers on screen. Venues arrive cheapest first.
  function takeaway(result) {
    const list = result.venues;
    const hold = holdText(result.holdHours);
    const first = list[0];
    const last = list[list.length - 1];
    const lo = first.current.fundingQuote;
    const hi = last.current.fundingQuote;
    if (list.length === 1) return `${first.venue} is the only venue that returned a rate.`;
    if (money(lo) === money(hi))
      return `${list.length === 2 ? "Both" : `All ${list.length}`} venues cost ${money(hi)} over ${hold}.`;
    if (lo > 0) {
      const ratio = hi / lo;
      const tail = ratioText(ratio) === "1x" ? "" : `, ${ratioText(ratio)} as much`;
      return `${first.venue} is cheapest at ${money(lo)}; ${last.venue} costs ${money(hi)} over ${hold}${tail}.`;
    }
    if (lo === 0) return `${first.venue} costs nothing over ${hold}; ${last.venue} costs ${money(hi)}.`;
    if (hi > 0)
      return `On ${first.venue} you receive ${money(-lo)} over ${hold}; on ${last.venue} you pay ${money(hi)}.`;
    return `${first.venue} pays you the most, ${money(-lo)} over ${hold}, against ${money(-hi)} on ${last.venue}.`;
  }

  function render(result) {
    const focus = result.venues.find((venue) => venue.venue === result.focus) || result.venues[0];
    const funding = focus.current.fundingQuote;
    const verb = funding > 0 ? "you pay" : funding < 0 ? "you receive" : "flat";
    const scale = Math.max(...result.venues.map((venue) => Math.abs(venue.current.fundingQuote))) || 1;
    const bar = (cost) => {
      const width = Math.max(1.5, (Math.abs(cost) / scale) * 100).toFixed(1);
      const kind = cost < 0 ? " neg" : "";
      return `<span class="fd-bar${kind}" aria-hidden="true"><i style="width:${width}%"></i></span>`;
    };
    const tag = (venue) => (venue.venue === result.cheapest ? ` <span class="fd-tag">Cheapest</span>` : "");
    const cards = result.venues
      .map((venue, index) => {
        const c = venue.current;
        return `<li class="fd-card${venue.venue === result.cheapest ? " is-cheapest" : ""}" data-venue="${escapeText(venue.venue)}" data-funding="${c.fundingQuote}">
          <div class="fd-head">
            <span class="fd-rank">${index + 1}</span>
            <span class="fd-venue">${escapeText(venue.venue)}</span>${tag(venue)}
            <span class="fd-cost">${money(c.fundingQuote)}</span>
          </div>
          ${bar(c.fundingQuote)}
          <dl class="fd-kv">
            <div><dt>Carry</dt><dd>${carry(c.annualizedCarry)}<small>/yr</small></dd></div>
            <div><dt>Move</dt><dd>${move(c.breakevenMove)}</dd></div>
            <div><dt>Hours</dt><dd>${hours(c.hoursToEatTarget)}</dd></div>
          </dl>
        </li>`;
      })
      .join("");
    const rows = result.venues
      .map((venue) => {
        const c = venue.current;
        return `<tr${venue.venue === result.cheapest ? ' class="is-cheapest"' : ""}>
          <td class="fd-venue">${escapeText(venue.venue)}${tag(venue)}</td>
          <td class="num"><span class="fd-fund">${bar(c.fundingQuote)}<span>${money(c.fundingQuote)}</span></span></td>
          <td class="num">${carry(c.annualizedCarry)}</td>
          <td class="num">${move(c.breakevenMove)}</td>
          <td class="num">${hours(c.hoursToEatTarget)}</td>
        </tr>`;
      })
      .join("");
    $("out").innerHTML = `<p class="hero">${money(Math.abs(funding))}</p>
      <p class="hero-label">${escapeText(verb)} on ${escapeText(focus.venue)} over ${holdText(result.holdHours)}</p>
      <p class="fd-summary">Cheapest: ${escapeText(result.cheapest)}. Notional&nbsp;${amount(result.notional)}. Margin&nbsp;${amount(result.margin)}. Entry&nbsp;${price(result.entry)}.</p>
      <ol class="fd-cards" aria-label="Venues, cheapest first">${cards}</ol>
      <table class="fd-table">
        <caption class="fd-sr">Venues, cheapest first</caption>
        <thead><tr><th scope="col">Venue</th><th scope="col" class="num">Funding</th><th scope="col" class="num">Carry/yr</th><th scope="col" class="num">Move</th><th scope="col" class="num">Hours</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="fd-takeaway">${escapeText(takeaway(result))}</p>
      <p class="hint">Funding is the quote amount over the hold. Positive funding is a cost. Carry is income per year as a percent of notional, with no compounding; a minus sign means it costs you. Move is the favorable price change that covers funding and the fees you typed. Hours is how long until funding spends the target. Never means funding does not spend it. Bars show each venue's cost against the most expensive one.</p>`;
  }

  function escapeText(value) {
    return String(value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
    );
  }

  function noRates() {
    $("out").textContent = "No rates available right now. Try again.";
  }

  function fail(err) {
    const code = err && err.code;
    if (!code || code === "ALL_VENUES_UNAVAILABLE" || code === "NO_QUOTES") {
      noRates();
      return;
    }
    $("out").textContent = err.message;
  }

  async function calculate() {
    $("out").textContent = "Fetching public funding rates.";
    const asset = $("asset").value;
    const venues = selectedVenues();
    const loaded = await FD.loadQuotes(asset, venues);
    if (!loaded.quotes.length) {
      noRates();
      return;
    }
    let entry = num("entry");
    if (entry === undefined) {
      const marked = loaded.quotes.find((quote) => Number.isFinite(quote.markPrice) && quote.markPrice > 0);
      if (!marked) {
        noRates();
        return;
      }
      entry = marked.markPrice;
      $("entry").value = String(entry);
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
    const result = FD.projectFunding(input, loaded.quotes);
    render(result);
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
