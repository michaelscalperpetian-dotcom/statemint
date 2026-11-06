// Renders a statement (from engine.buildStatement) as an animated, owner-friendly page.
import { money, monthLabel } from "./engine.js";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const short = d => { if (!d) return ""; const x = new Date(d + "T00:00:00Z"); return isNaN(x) ? d : x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function countUp(el, to, currency, dur = 1400) {
  if (reduce) { el.textContent = money(to, currency); return; }
  const start = performance.now();
  const step = now => { const p = Math.min(1, (now - start) / dur); const e = 1 - Math.pow(1 - p, 4); el.textContent = money(to * e, currency); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export function renderStatement(root, data) {
  const { statement: st, brand = {} } = data;
  const T = st.totals, cur = st.currency, s = st.settings;
  root.innerHTML = "";
  const card = h("article", "st");

  // header
  const head = h("header", "st-head");
  head.appendChild(h("div", "st-coin"));
  const brandRow = h("div", "brand");
  if (brand.logo) { const img = h("img"); img.src = brand.logo; img.alt = ""; brandRow.appendChild(img); }
  brandRow.appendChild(h("span", "", brand.company || "Owner statement"));
  head.appendChild(brandRow);
  head.appendChild(h("h2", "", st.listing || "Your property"));
  head.appendChild(h("div", "sub", `${monthLabel(st.month)} · Prepared for ${brand.ownerName || "the owner"}${brand.company ? " by " + brand.company : ""}`));
  card.appendChild(head);

  // hero numbers
  const hero = h("section", "st-hero");
  const big = h("div", "st-big");
  const isOwnerGets = st.settlement.direction === "cohost_pays_owner";
  big.appendChild(h("div", "label", "Owner net for the month"));
  const amt = h("div", "amt num", money(0, cur)); big.appendChild(amt);
  big.appendChild(h("div", "who", `${st.settlement.label}: ${money(st.settlement.amount, cur)}`));
  hero.appendChild(big);
  const kpis = h("div", "st-kpis");
  const kpi = (k, v) => { const d = h("div", "kpi"); d.append(h("div", "k", k), h("div", "v num", v)); kpis.appendChild(d); };
  kpi("Reservations", String(T.reservations));
  kpi("Nights booked", String(T.nights));
  kpi("Occupancy", T.occupancy == null ? "n/a" : Math.round(T.occupancy * 100) + "%");
  kpi("Avg nightly rate", money(T.adr, cur));
  hero.appendChild(kpis);
  card.appendChild(hero);

  // where the money went
  const flowSec = h("section", "st-sec"); flowSec.appendChild(h("h3", "", "Where the money went"));
  const parts = [
    ["Owner net", Math.max(0, T.ownerNet), "#2fd3a0"],
    ["Co-host commission", T.commission, "#8f7bff"],
    ["Cleaning", T.cleaningToCohost, "#58b4ff"],
    ["Expenses", T.expensesTotal, "#f5c451"],
    ["Airbnb fees", T.airbnbFees, "#ff7a59"],
  ].filter(p => p[1] > 0);
  const totalFlow = parts.reduce((a, p) => a + p[1], 0) || 1;
  const flow = h("div", "flow"); const legend = h("div", "flow-legend");
  parts.forEach(([name, v, c]) => {
    const seg = h("div"); seg.style.background = c; seg.dataset.w = (v / totalFlow * 100).toFixed(2); flow.appendChild(seg);
    const l = h("span"); const i = h("i"); i.style.background = c; l.append(i, document.createTextNode(name + " "), h("b", "num", money(v, cur))); legend.appendChild(l);
  });
  flowSec.append(flow, legend); card.appendChild(flowSec);

  // calendar of stays
  const res = st.lines.filter(l => l.kind === "reservation" && l.start);
  if (res.length && st.month) {
    const calSec = h("section", "st-sec"); calSec.appendChild(h("h3", "", "Stays this month"));
    const [y, m] = st.month.split("-").map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cal = h("div", "cal"); cal.style.setProperty("--days", days);
    for (let d = 1; d <= days; d++) cal.appendChild(h("div", "d", String(d)));
    res.forEach((r, i) => {
      const sd = new Date(r.start + "T00:00:00Z"); if (sd.getUTCMonth() + 1 !== m) return;
      const startDay = sd.getUTCDate(); const len = Math.max(1, Math.min(r.nights || 1, days - startDay + 1));
      const bar = h("div", "stay", (r.guest || "Guest").split(" ")[0]);
      bar.style.left = `calc(${(startDay - 1) / days * 100}% + 1px)`; bar.style.width = `calc(${len / days * 100}% - 4px)`;
      bar.style.transitionDelay = `${0.12 * i}s`; bar.title = `${r.guest} · ${r.nights} nights`;
      cal.appendChild(bar);
    });
    calSec.appendChild(cal); card.appendChild(calSec);
    if (reduce) cal.classList.add("in"); else new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { cal.classList.add("in"); o.disconnect(); } }), { threshold: .3 }).observe(cal);
  }

  // reservations table
  const tSec = h("section", "st-sec"); tSec.appendChild(h("h3", "", "Reservations & adjustments"));
  const wrap = h("div", "tbl-wrap"); const tbl = h("table", "tbl");
  const thead = h("thead"); const hr = h("tr");
  ["Guest", "Check-in", "Nights", "Gross", "Airbnb fee", "Cleaning", "Payout", "Commission"].forEach((c, i) => hr.appendChild(h("th", i > 2 ? "r" : "", c)));
  thead.appendChild(hr); tbl.appendChild(thead);
  const tb = h("tbody");
  st.lines.forEach(l => {
    const tr = h("tr", l.kind === "adjustment" ? "adj" : "");
    [l.kind === "adjustment" ? `${l.type}${l.guest ? " · " + l.guest : ""}` : (l.guest || l.code), short(l.start || l.date), l.nights || "",
      money(l.gross, cur), l.serviceFee ? "−" + money(l.serviceFee, cur) : "", l.cleaningFee ? money(l.cleaningFee, cur) : "", money(l.payout, cur), money(l.commission, cur)]
      .forEach((v, i) => tr.appendChild(h("td", (i > 2 ? "r " : "") + "num", String(v))));
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  const tf = h("tfoot"); const fr = h("tr");
  ["Total", "", String(T.nights), money(T.grossRevenue, cur), "−" + money(T.airbnbFees, cur), money(T.cleaning, cur), money(T.payout, cur), money(T.commission, cur)]
    .forEach((v, i) => fr.appendChild(h("td", (i > 2 ? "r " : "") + "num", v)));
  tf.appendChild(fr); tbl.appendChild(tf); wrap.appendChild(tbl); tSec.appendChild(wrap); card.appendChild(tSec);

  // settlement summary
  const sSec = h("section", "st-sec"); sSec.appendChild(h("h3", "", "Summary"));
  const rows = h("div", "summary-rows");
  const row = (k, v, minus, cls = "") => { const r = h("div", "row " + cls); r.append(h("span", "", k), h("span", "num" + (minus ? " minus" : ""), (minus ? "−" : "") + money(v, cur))); rows.appendChild(r); };
  row("Airbnb payout for these stays", T.payout);
  row(`Co-host commission (${s.commissionPct}% of ${s.commissionBase === "gross" ? "gross" : s.commissionBase === "payout_ex_cleaning" ? "payout excl. cleaning" : "payout"})`, T.commission, true);
  if (T.cleaningToCohost) row("Cleaning fees kept by co-host", T.cleaningToCohost, true);
  st.expenses.forEach(e => row(`Expense: ${e.description}`, e.amount, true));
  row("Owner net", T.ownerNet, false, "total");
  if (st.settlement.alreadyPaid != null) row("Already paid to co-host by Airbnb split", st.settlement.alreadyPaid);
  const settle = h("div", "row total"); settle.append(h("span", "", st.settlement.label), h("span", "num", money(st.settlement.amount, cur))); rows.appendChild(settle);
  sSec.appendChild(rows); card.appendChild(sSec);

  const foot = h("footer", "st-foot");
  foot.appendChild(h("span", "", `Figures from the Airbnb transaction report${data.createdAt ? " · generated " + new Date(data.createdAt).toLocaleDateString() : ""}.`));
  const made = h("a", "", "Made with Statemint ✦"); made.href = "/"; foot.appendChild(made);
  card.appendChild(foot);
  root.appendChild(card);

  // animate
  countUp(amt, T.ownerNet, cur);
  requestAnimationFrame(() => setTimeout(() => flow.querySelectorAll("div").forEach(d => d.style.width = d.dataset.w + "%"), reduce ? 0 : 150));
}
