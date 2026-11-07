// Renders a statement (from engine.buildStatement) as an animated, owner-friendly page.
import { money, monthLabel } from "./engine.js";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const short = d => { if (!d) return ""; const x = new Date(d + "T00:00:00Z"); return isNaN(x) ? d : x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function countUp(el, to, currency, dur = 1400) {
  el.dataset.final = money(to, currency);
  if (reduce) { el.textContent = el.dataset.final; return; }
  const start = performance.now();
  const step = now => { if (el.dataset.done) return; const p = Math.min(1, (now - start) / dur); const e = 1 - Math.pow(1 - p, 4); el.textContent = money(to * e, currency); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// Printing or saving as PDF mid-animation must never show a half-counted number or an empty bar.
function finishAnimations() {
  document.querySelectorAll(".st .amt[data-final]").forEach(el => { el.dataset.done = "1"; el.textContent = el.dataset.final; });
  document.querySelectorAll(".st .flow > div").forEach(d => { d.style.transition = "none"; d.style.width = d.dataset.w + "%"; });
  document.querySelectorAll(".st .cal").forEach(c => c.classList.add("in"));
}
if (typeof window !== "undefined") { addEventListener("beforeprint", finishAnimations); matchMedia("print").addEventListener?.("change", e => e.matches && finishAnimations()); }

const pctDelta = (now, before) => (before ? (now - before) / Math.abs(before) : null);
function deltaChip(now, before, fmt) {
  if (before == null) return null;
  const d = now - before; if (Math.abs(d) < 0.005) return h("span", "delta flat", "same as last month");
  const el = h("span", "delta " + (d > 0 ? "up" : "down"), `${d > 0 ? "▲" : "▼"} ${fmt(Math.abs(d))} vs last month`); return el;
}
export function renderStatement(root, data, opts = {}) {
  const animate = opts.animate !== false && !reduce;
  const { statement: st, brand = {}, note = "", previous = null } = data;
  const T = st.totals, cur = st.currency, s = st.settings;
  const own = st.settlement.direction === "none" || s.reportType === "own";
  root.innerHTML = "";
  const card = h("article", "st");

  // header
  const head = h("header", "st-head");
  head.appendChild(h("div", "st-coin"));
  const brandRow = h("div", "brand");
  if (brand.logo) { const img = h("img"); img.src = brand.logo; img.alt = brand.company ? brand.company + " logo" : ""; brandRow.appendChild(img); }
  brandRow.appendChild(h("span", "", brand.company || (own ? "Earnings report" : "Owner statement")));
  head.appendChild(brandRow);
  head.appendChild(h("h2", "", st.listing || "Your property"));
  head.appendChild(h("div", "sub", own ? `${monthLabel(st.month)} · Earnings report${brand.ownerName ? " for " + brand.ownerName : ""}${brand.company ? " · " + brand.company : ""}`
    : `${monthLabel(st.month)} · Prepared for ${brand.ownerName || "the owner"}${brand.company ? " by " + brand.company : ""}`));
  card.appendChild(head);
  if (note && note.trim()) { const n = h("section", "st-note"); n.append(h("div", "k", own ? "Notes" : "Note from your host"), h("p", "", note.trim())); card.appendChild(n); }

  // hero numbers
  const hero = h("section", "st-hero");
  const big = h("div", "st-big");
  const isOwnerGets = st.settlement.direction === "cohost_pays_owner";
  big.appendChild(h("div", "label", own ? "Net earnings for the month" : "Owner net for the month"));
  const amt = h("div", "amt num", money(animate ? 0 : T.ownerNet, cur)); big.appendChild(amt);
  if (previous) { const c = deltaChip(T.ownerNet, previous.ownerNet, v => money(v, cur)); if (c) big.appendChild(c); }
  if (own) big.appendChild(h("div", "who", `Airbnb paid out ${money(T.payout, cur)}${T.expensesTotal ? `, less ${money(T.expensesTotal, cur)} of expenses` : ""}`));
  else big.appendChild(h("div", "who", st.settlement.amount === 0 ? "Nothing to settle this month" : `${st.settlement.label}: ${money(st.settlement.amount, cur)}`));
  hero.appendChild(big);
  const kpis = h("div", "st-kpis");
  const kpi = (k, v, chip) => { const d = h("div", "kpi"); d.append(h("div", "k", k), h("div", "v num", v)); if (chip) d.appendChild(chip); kpis.appendChild(d); };
  kpi("Reservations", String(T.reservations));
  kpi("Nights booked", String(T.nights), previous ? deltaChip(T.nights, previous.nights, v => v + (v === 1 ? " night" : " nights")) : null);
  kpi("Occupancy", T.occupancy == null ? "n/a" : Math.round(T.occupancy * 100) + "%");
  kpi("Avg nightly rate", money(T.adr, cur));
  hero.appendChild(kpis);
  card.appendChild(hero);

  // where the money went
  const flowSec = h("section", "st-sec"); flowSec.appendChild(h("h3", "", "Where the money went"));
  // The bar shows how the payout was divided. If costs exceed the payout the owner's share is negative,
  // which a bar can't show, so it is left out of the bar and stated in words instead.
  const parts = [
    [own ? "Net earnings" : "Owner net", Math.max(0, T.ownerNet), "#2fd3a0"],
    ["Host commission", T.commission, "#8f7bff"],
    ["Cleaning", T.cleaningToCohost, "#58b4ff"],
    ["Expenses", Math.max(0, T.expensesTotal), "#f5c451"],
    ["Airbnb fees", T.airbnbFees, "#ff7a59"],
  ].filter(p => p[1] > 0);
  const totalFlow = parts.reduce((a, p) => a + p[1], 0) || 1;
  const flow = h("div", "flow"); const legend = h("div", "flow-legend");
  parts.forEach(([name, v, c]) => {
    const seg = h("div"); seg.style.background = c; seg.dataset.w = (v / totalFlow * 100).toFixed(2); flow.appendChild(seg);
    const l = h("span"); const i = h("i"); i.style.background = c; l.append(i, document.createTextNode(name + " "), h("b", "num", money(v, cur))); legend.appendChild(l);
  });
  flowSec.append(flow, legend);
  if (T.ownerNet < 0) flowSec.appendChild(h("p", "flow-neg", own ? `Net earnings are ${money(T.ownerNet, cur)} this month: expenses add up to more than the Airbnb payout.` : `Owner net is ${money(T.ownerNet, cur)} this month: commission, cleaning and expenses add up to more than the Airbnb payout.`));
  card.appendChild(flowSec);

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
    if (reduce || !animate) { cal.classList.add("in"); cal.querySelectorAll(".stay").forEach(b => (b.style.transition = "none")); } else new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { cal.classList.add("in"); o.disconnect(); } }), { threshold: .3 }).observe(cal);
  }

  // reservations table
  const tSec = h("section", "st-sec"); tSec.appendChild(h("h3", "", "Reservations & adjustments"));
  const wrap = h("div", "tbl-wrap"); const tbl = h("table", "tbl");
  const thead = h("thead"); const hr = h("tr");
  const cols = own ? 7 : 8; // own home: no commission column
  ["Guest", "Check-in", "Nights", "Gross", "Airbnb fee", "Cleaning", "Payout", "Commission"].slice(0, cols).forEach((c, i) => hr.appendChild(h("th", i > 2 ? "r" : "", c)));
  thead.appendChild(hr); tbl.appendChild(thead);
  const tb = h("tbody");
  st.lines.forEach(l => {
    const tr = h("tr", l.kind === "adjustment" ? "adj" : "");
    [l.kind === "adjustment" ? `${l.type}${l.guest ? " · " + l.guest : ""}` : (l.guest || l.code), short(l.start || l.date), l.nights || "",
      money(l.gross, cur), l.serviceFee ? "−" + money(l.serviceFee, cur) : "", l.cleaningFee ? money(l.cleaningFee, cur) : "", money(l.payout, cur), money(l.commission, cur)].slice(0, cols)
      .forEach((v, i) => tr.appendChild(h("td", (i > 2 ? "r " : "") + "num", String(v))));
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  const tf = h("tfoot"); const fr = h("tr");
  ["Total", "", String(T.nights), money(T.grossRevenue, cur), "−" + money(T.airbnbFees, cur), money(T.cleaning, cur), money(T.payout, cur), money(T.commission, cur)].slice(0, cols)
    .forEach((v, i) => fr.appendChild(h("td", (i > 2 ? "r " : "") + "num", v)));
  tf.appendChild(fr); tbl.appendChild(tf); wrap.appendChild(tbl); tSec.appendChild(wrap); card.appendChild(tSec);

  // settlement summary
  const sSec = h("section", "st-sec"); sSec.appendChild(h("h3", "", "Summary"));
  const rows = h("div", "summary-rows");
  const row = (k, v, minus, cls = "") => { const r = h("div", "row " + cls); r.append(h("span", "", k), h("span", "num" + (minus ? " minus" : ""), (minus ? "−" : "") + money(v, cur))); rows.appendChild(r); };
  row("Airbnb payout for these stays", T.payout);
  if (!own) row(`Host commission (${s.commissionPct}% of ${s.commissionBase === "gross" ? "gross" : s.commissionBase === "payout_ex_cleaning" ? "payout excl. cleaning" : "payout"})`, T.commission, true);
  if (T.cleaningToCohost) row("Cleaning fees kept by host", T.cleaningToCohost, true);
  st.expenses.forEach(e => e.amount < 0 ? row(`Credit: ${e.description}`, -e.amount, false) : row(`Expense: ${e.description}`, e.amount, true));
  row(own ? "Net earnings" : "Owner net", T.ownerNet, false, "total");
  if (st.settlement.alreadyPaid != null) row("Already paid to host by Airbnb split", st.settlement.alreadyPaid);
  const settle = h("div", "row total"); if (own) settle.style.display = "none"; settle.append(h("span", "", st.settlement.amount === 0 ? "Nothing to settle" : st.settlement.label), h("span", "num", money(st.settlement.amount, cur))); rows.appendChild(settle);
  sSec.appendChild(rows); card.appendChild(sSec);

  const foot = h("footer", "st-foot");
  foot.appendChild(h("span", "", `Figures from the Airbnb transaction report${data.createdAt ? " · generated " + new Date(data.createdAt).toLocaleDateString() : ""}.`));
  const made = h("a", "", "Made with Ownermint ✦"); made.href = "/"; foot.appendChild(made);
  card.appendChild(foot);
  root.appendChild(card);

  // animate
  if (animate) countUp(amt, T.ownerNet, cur);
  if (!animate) flow.querySelectorAll("div").forEach(d => { d.style.transition = "none"; d.style.width = d.dataset.w + "%"; });
  else requestAnimationFrame(() => setTimeout(() => flow.querySelectorAll("div").forEach(d => d.style.width = d.dataset.w + "%"), 150));
}
