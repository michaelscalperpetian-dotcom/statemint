// Ownermint statement engine. Pure functions, used in the browser and in Node tests.

/* ---------- CSV ---------- */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const FIELDS = {
  date: ["date", "transactiondate", "payoutdate", "datepaid", "paidoutdate"],
  type: ["type", "transactiontype"],
  code: ["confirmationcode", "confirmation", "reservationcode", "bookingcode", "reservationid", "confirmationnumber"],
  start: ["startdate", "checkin", "checkindate", "arrival", "arrivaldate", "staystart"],
  end: ["enddate", "checkout", "checkoutdate", "departure"],
  nights: ["nights", "numberofnights"],
  guest: ["guest", "guestname"],
  listing: ["listing", "listingname", "property", "propertyname", "listingtitle"],
  currency: ["currency"],
  amount: ["amount", "hostearnings", "netearnings", "payoutamount", "hostpayout", "netpayout", "earnings"],
  paidOut: ["paidout"],
  serviceFee: ["servicefee", "hostservicefee", "hostfee", "airbnbservicefee"],
  cleaningFee: ["cleaningfee", "cleaningfees"],
  gross: ["grossearnings", "gross", "grossamount", "grossbookingvalue", "grossrevenue"],
  taxes: ["occupancytaxes", "taxes", "taxeswithheld"],
  discount: ["discount", "discounts", "discountamount", "promotion", "promotions", "promotionsanddiscounts", "lengthofstaydiscount"],
};

export function detectColumns(header) {
  const map = {}; const h = header.map(norm);
  for (const [field, names] of Object.entries(FIELDS)) {
    const idx = h.findIndex(x => names.includes(x));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

export function parseMoney(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.includes("-");
  s = s.replace(/[^0-9.,]/g, "");
  // handle "1.234,56" (EU) vs "1,234.56" (US)
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (neg ? -n : n);
}

// Builds a UTC date and rejects impossible ones (e.g. month 13) instead of rolling them over.
function utcDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}
// fmt: "mdy" (US, Airbnb default) or "dmy" for slash dates.
export function parseDate(v, fmt = "mdy") {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utcDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return fmt === "dmy" ? utcDate(y, +m[2], +m[1]) : utcDate(y, +m[1], +m[2]); }
  const d = new Date(s); return isNaN(d) ? null : utcDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
// Looks at every slash date in the file. A first part over 12 proves day/month; a second part over 12 proves month/day.
export function detectDateFormat(values) {
  let dmy = false, mdy = false, seen = 0;
  for (const v of values) {
    const m = String(v || "").trim().match(/^(\d{1,2})[\/.](\d{1,2})[\/.]\d{2,4}/); if (!m) continue; seen++;
    if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true;
  }
  if (dmy && mdy) return { format: "mdy", status: "conflict" };
  if (dmy) return { format: "dmy", status: "detected" };
  if (mdy) return { format: "mdy", status: "detected" };
  return { format: "mdy", status: seen ? "assumed" : "none" };
}
export const ymd = d => d ? d.toISOString().slice(0, 10) : "";
export const monthKey = d => d ? d.toISOString().slice(0, 7) : "";

/* ---------- transactions ---------- */
// Turns CSV rows into transactions. Payout rows (transfers to the bank) are dropped:
// they repeat money already counted in the reservation rows.
export function toTransactions(rows, map = null, opts = {}) {
  if (!rows.length) return { transactions: [], map: {}, warnings: ["The file is empty."], notices: [], audit: { rows: 0, skipped: [], duplicates: [], types: {} } };
  const header = rows[0]; map = map || detectColumns(header);
  const warnings = [], notices = [];
  if (map.amount == null && map.gross == null) warnings.push("Couldn't find an Amount or Gross earnings column.");
  const get = (r, f) => (map[f] == null ? "" : r[map[f]]);
  const body = rows.slice(1);
  // date format
  const dateVals = []; for (const r of body) for (const f of ["date", "start", "end"]) if (map[f] != null) dateVals.push(r[map[f]]);
  const df = opts.dateFormat ? { format: opts.dateFormat, status: "chosen" } : detectDateFormat(dateVals);
  if (df.status === "conflict") warnings.push("Dates in this file don't follow one format (some look day/month, others month/day). They were read as month/day/year; check the dates on your statement.");
  if (df.status === "assumed") notices.push("Dates were read as month/day/year (Airbnb's US format). If your file uses day/month/year, switch the date format.");
  // amounts with 3 decimals are ambiguous (1.234 could be 1,234)
  const moneyCols = ["amount", "gross", "serviceFee", "cleaningFee"].filter(f => map[f] != null);
  if (body.some(r => moneyCols.some(f => /^\s*-?\d{1,3}\.\d{3}\s*$/.test(String(r[map[f]] || ""))))) warnings.push("Some amounts have three decimal places (e.g. 1.234). They were read as decimals; if your file uses dots for thousands, the totals will be wrong.");
  const tx = [], skipped = [], types = {}, seen = new Map(), duplicates = [];
  body.forEach((r, i) => {
    const rowNo = i + (opts.firstRow ?? 2); // spreadsheet row number (row 1 is the header, unless the file has none)
    const type = String(get(r, "type") || "").trim();
    const t = type.toLowerCase();
    const amountRaw = get(r, "amount"), grossRaw = get(r, "gross"), paidOutRaw = get(r, "paidOut");
    const amount = map.amount != null ? parseMoney(amountRaw) : 0;
    const gross = map.gross != null ? parseMoney(grossRaw) : 0;
    const serviceFee = Math.abs(parseMoney(get(r, "serviceFee")));
    if (/^payout\b/.test(t)) { skipped.push({ row: rowNo, reason: "Bank transfer (payout) row: the money is already counted in the reservation rows", type }); return; }
    if (!amount && !gross && !serviceFee) { skipped.push({ row: rowNo, reason: String(paidOutRaw || "").trim() ? "Bank transfer row (only a Paid out amount)" : "No amount on this row", type }); return; }
    const sig = r.map(x => String(x).trim()).join("\u0001");
    if (seen.has(sig)) duplicates.push({ row: rowNo, sameAs: seen.get(sig) }); else seen.set(sig, rowNo);
    const isDup = duplicates.length && duplicates[duplicates.length - 1].row === rowNo;
    if (isDup && opts.excludeDuplicates) { skipped.push({ row: rowNo, reason: `Exact duplicate of row ${duplicates[duplicates.length - 1].sameAs} (excluded by you)`, type }); return; }
    const cleaningFee = parseMoney(get(r, "cleaningFee"));
    const nights = parseInt(get(r, "nights"), 10) || 0;
    const code = String(get(r, "code") || "").trim();
    const isReservation = t ? t.includes("reservation") : (!!code && nights > 0);
    types[type || "(no type)"] = (types[type || "(no type)"] || 0) + 1;
    tx.push({
      row: rowNo, duplicate: !!isDup,
      kind: isReservation ? "reservation" : "adjustment",
      type: type || (isReservation ? "Reservation" : "Adjustment"),
      date: parseDate(get(r, "date"), df.format), start: parseDate(get(r, "start"), df.format), end: parseDate(get(r, "end"), df.format),
      nights, code, guest: String(get(r, "guest") || "").trim(), listing: String(get(r, "listing") || "").trim() || "Listing",
      currency: String(get(r, "currency") || "").trim().toUpperCase() || "USD",
      // payout = what Airbnb pays the host for this line after its host fee
      payout: map.amount != null ? amount : gross - serviceFee,
      gross: map.gross != null ? gross : amount + serviceFee,
      serviceFee, cleaningFee, taxes: parseMoney(get(r, "taxes")),
      // a discount column, when the file has one, is informational: Airbnb's gross is already after discounts
      discount: map.discount != null && String(get(r, "discount") || "").trim() !== "" ? Math.abs(parseMoney(get(r, "discount"))) : null,
    });
  });
  if (duplicates.length && !opts.excludeDuplicates) warnings.push(`${duplicates.length} row${duplicates.length === 1 ? " is an exact duplicate" : "s are exact duplicates"} of another row and ${duplicates.length === 1 ? "is" : "are"} counted twice. This usually happens when two exports are combined.`);
  const undated = tx.filter(t => !t.date && !t.start).length;
  if (undated) warnings.push(`${undated} row${undated === 1 ? " has" : "s have"} no readable date and can't be placed in a month.`);
  if (!tx.length) warnings.push("No reservations found in this file.");
  return { transactions: tx, map, warnings, notices, dateFormat: df, audit: { rows: body.length, skipped, duplicates, types } };
}

export function listings(tx) { return [...new Set(tx.map(t => t.listing))].sort(); }
export function months(tx, by = "checkin") {
  return [...new Set(tx.map(t => monthKey(by === "checkin" ? (t.start || t.date) : (t.date || t.start))).filter(Boolean))].sort().reverse();
}

/* ---------- statement ---------- */
export const DEFAULT_SETTINGS = {
  commissionPct: 20,
  commissionBase: "payout",      // "payout" | "payout_ex_cleaning" | "gross"
  cleaningTo: "owner",           // "owner" | "cohost"  (who keeps the cleaning fees)
  payoutReceiver: "owner",       // "owner" | "cohost" | "split"
  splitPaidToCohost: 0,          // when Airbnb already paid the host directly (per month)
  monthBy: "checkin",            // "checkin" | "payout"
  commissionOnAdjustments: true, // charge commission on refunds/reimbursements/penalties too
  weeklyDiscountPct: 0,          // the host's Airbnb weekly discount (stays of 7+ nights), for labelling only
  monthlyDiscountPct: 0,         // the host's Airbnb monthly discount (stays of 28+ nights), for labelling only
  reportType: "managed",         // "managed" = a home the host manages for an owner | "own" = the host's own home
};
// Internal names (cohost, cohostEarned, ...) are kept for compatibility with saved settings and existing owner links.
// In the product, the person running the listing is called the "host".
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const daysInMonth = key => { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const DAY = 86400000;
// Nights of a stay that fall inside a calendar month (a stay's last night is the night before check-out).
export function nightsInMonth(start, nights, month) {
  if (!start || !nights || !month) return 0;
  const [y, m] = month.split("-").map(Number);
  const a = Math.max(start.getTime(), Date.UTC(y, m - 1, 1)), b = Math.min(start.getTime() + nights * DAY, Date.UTC(y, m, 1));
  return Math.max(0, Math.round((b - a) / DAY));
}

export function buildStatement(tx, { listing, month, settings = {}, expenses = [] }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const own = s.reportType === "own";
  // A host's own home has no owner to settle with: no commission, no cleaning split, no settlement.
  const pct = own ? 0 : Math.max(0, Math.min(100, Number(s.commissionPct) || 0)) / 100;
  const inMonth = t => monthKey(s.monthBy === "checkin" ? (t.start || t.date) : (t.date || t.start)) === month;
  const lines = tx.filter(t => (!listing || t.listing === listing) && inMonth(t))
    .sort((a, b) => (a.start || a.date) - (b.start || b.date));

  const warnings = [];
  const rows = lines.map(t => {
    const base = s.commissionBase === "gross" ? t.gross : s.commissionBase === "payout_ex_cleaning" ? t.payout - t.cleaningFee : t.payout;
    const charge = t.kind === "reservation" || s.commissionOnAdjustments !== false;
    return { ...t, commissionBase: r2(base), commission: charge ? r2(base * pct) : 0, ...discountInfo(t, s) };
  });
  const currencies = [...new Set(rows.map(t => t.currency))];
  if (currencies.length > 1) warnings.push(`This month mixes currencies (${currencies.join(", ")}). Amounts are not converted, so totals that add them together are not meaningful.`);
  if (!own && s.commissionBase === "payout_ex_cleaning" && rows.some(t => t.kind === "reservation") && !rows.some(t => t.cleaningFee)) warnings.push("Commission is set to \"payout minus cleaning\", but no cleaning fees were found for these stays, so commission was calculated on the full payout.");
  const fellBack = rows.filter(t => t.kind === "reservation" && !t.start).length;
  if (s.monthBy === "checkin" && fellBack) warnings.push(`${fellBack} reservation${fellBack === 1 ? " has" : "s have"} no check-in date and ${fellBack === 1 ? "was" : "were"} placed by payout date instead.`);
  if (rows.some(t => t.duplicate)) warnings.push("This statement includes rows that are exact duplicates of other rows in your file.");
  const sum = f => r2(rows.reduce((a, t) => a + (t[f] || 0), 0));
  const res = rows.filter(t => t.kind === "reservation");
  const nights = res.reduce((a, t) => a + t.nights, 0);
  const grossRevenue = sum("gross"), airbnbFees = sum("serviceFee"), cleaning = sum("cleaningFee"), payout = sum("payout");
  const commission = sum("commission");
  const cleaningToCohost = !own && s.cleaningTo === "cohost" ? cleaning : 0;
  const exp = [];
  for (const e of expenses || []) {
    if (!e || String(e.amount ?? "").trim() === "") continue;
    const raw = String(e.amount).trim();
    const amt = /^-?[\d.,\s$€£]+$/.test(raw) ? parseMoney(raw) : NaN;
    if (!isFinite(amt) || (amt === 0 && /[1-9]/.test(raw))) { warnings.push(`Expense "${e.description || "(no description)"}" has an amount that isn't a number ("${raw}") and was left out.`); continue; }
    if (amt === 0) continue;
    exp.push({ date: e.date || "", description: String(e.description || (amt < 0 ? "Credit" : "Expense")), amount: r2(amt), category: String(e.category || ""), note: String(e.note || "") });
  }
  const expensesTotal = r2(exp.reduce((a, e) => a + e.amount, 0));
  // Managed: expenses are paid by the host and recharged to the owner. Own home: expenses simply reduce earnings.
  const cohostEarned = own ? 0 : r2(commission + cleaningToCohost + expensesTotal);
  const ownerNet = own ? r2(payout - expensesTotal) : r2(payout - cohostEarned);
  const roomRevenue = r2(grossRevenue - cleaning);
  // Signed amount the owner owes the host (negative = the host owes the owner).
  let owed, alreadyPaid;
  if (own) owed = 0;
  else if (s.payoutReceiver === "owner") owed = cohostEarned;
  else if (s.payoutReceiver === "cohost") owed = -ownerNet;
  else { alreadyPaid = r2(Number(s.splitPaidToCohost) || 0); owed = r2(cohostEarned - alreadyPaid); }
  const suffix = s.payoutReceiver === "split" ? " (after Airbnb split)" : "";
  const settlement = own ? { direction: "none", amount: 0, label: "Your own property: nothing to settle" }
    : owed >= 0
    ? { direction: "owner_pays_cohost", amount: r2(owed), label: "Owner pays host" + suffix }
    : { direction: "cohost_pays_owner", amount: r2(-owed), label: "Host pays owner" + suffix };
  if (alreadyPaid != null) settlement.alreadyPaid = alreadyPaid;
  if (ownerNet < 0) warnings.push(own ? "Net earnings are negative this month: expenses are larger than the payout." : "Owner net is negative this month: costs and commission are larger than the payout.");
  // occupancy counts every night of the month that is booked, whichever month the stay is attributed to
  let occupancy = null;
  if (month) { const days = daysInMonth(month); const occ = tx.filter(t => (!listing || t.listing === listing) && t.kind === "reservation").reduce((a, t) => a + nightsInMonth(t.start, t.nights, month), 0); occupancy = Math.min(1, occ / days); }
  return {
    listing, month, settings: s, currency: rows[0]?.currency || "USD",
    lines: rows.map(t => ({ kind: t.kind, type: t.type, code: t.code, guest: t.guest, start: ymd(t.start), end: ymd(t.end), date: ymd(t.date), nights: t.nights,
      gross: r2(t.gross), serviceFee: r2(t.serviceFee), cleaningFee: r2(t.cleaningFee), payout: r2(t.payout), commissionBase: t.commissionBase, commission: t.commission, row: t.row, currency: t.currency,
      discountType: t.discountType || "", discountPct: t.discountPct || 0, discount: t.discount == null ? null : r2(t.discount), discountSource: t.discountSource || "" })),
    warnings,
    // Every stay with at least one night in this month, including stays that began last month or run into next month.
    // Money stays on the month the stay is attributed to; this list only drives the calendar.
    stays: month ? tx.filter(t => (!listing || t.listing === listing) && t.kind === "reservation" && t.start && nightsInMonth(t.start, t.nights, month) > 0)
      .sort((a, b) => a.start - b.start)
      .map(t => ({ guest: t.guest, code: t.code, start: ymd(t.start), nights: t.nights, nightsHere: nightsInMonth(t.start, t.nights, month),
        fromPrevious: monthKey(t.start) < month, continues: monthKey(new Date(t.start.getTime() + (t.nights - 1) * DAY)) > month })) : [],
    expenses: exp,
    totals: { reservations: res.length, nights, grossRevenue, airbnbFees, cleaning, payout, commission, cleaningToCohost, expensesTotal, cohostEarned, ownerNet,
      occupancy,
      discounts: r2(rows.reduce((a, t) => a + (t.discount || 0), 0)),
      discountsEstimated: rows.some(t => t.discountSource === "estimate"),
      adr: nights ? r2(roomRevenue / nights) : 0 },
    settlement,
  };
}

// Airbnb's length-of-stay discounts: weekly for 7+ nights, monthly for 28+ nights (monthly replaces weekly, they don't stack).
// They come off the nightly price only, so the cleaning fee is excluded from the estimate.
export function discountInfo(t, s) {
  if (t.kind !== "reservation") return {};
  const w = Math.max(0, Math.min(99, Number(s.weeklyDiscountPct) || 0)), m = Math.max(0, Math.min(99, Number(s.monthlyDiscountPct) || 0));
  const type = t.nights >= 28 && m > 0 ? "monthly" : t.nights >= 7 && w > 0 ? "weekly" : "";
  const pct = type === "monthly" ? m : type === "weekly" ? w : 0;
  if (t.discount != null) return { discountType: type, discountPct: pct, discount: t.discount, discountSource: "file" };
  if (!type) return {};
  const room = Math.max(0, t.gross - t.cleaningFee);
  return { discountType: type, discountPct: pct, discount: r2(room * pct / (100 - pct)), discountSource: "estimate" };
}

// Splits one bill across several properties. Works in cents and hands leftover cents out by largest remainder,
// so the shares always add up to the bill exactly. method: "equal" | "nights" | "custom" (weights = percentages).
export function allocateShared(amount, units, method = "equal", weights = {}) {
  const cents = Math.round(Math.abs(Number(amount) || 0) * 100), sign = Number(amount) < 0 ? -1 : 1;
  if (!units.length) return { shares: {}, method, fallback: false };
  let w = units.map(u => method === "equal" ? 1 : Math.max(0, Number(weights[u]) || 0));
  let used = method, fallback = false;
  if (w.reduce((a, b) => a + b, 0) <= 0) { w = units.map(() => 1); used = "equal"; fallback = method !== "equal"; }
  const total = w.reduce((a, b) => a + b, 0);
  const raw = w.map(x => cents * x / total), base = raw.map(Math.floor);
  let left = cents - base.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
  const shares = {}; units.forEach((u, i) => { shares[u] = sign * base[i] / 100; });
  const pctOf = {}; units.forEach((u, i) => { pctOf[u] = w[i] / total * 100; });
  return { shares, pct: pctOf, method: used, fallback };
}

// Nights each property is occupied in a month (for "split by nights booked").
export function occupiedNights(tx, month) {
  const out = {};
  for (const t of tx) if (t.kind === "reservation" && t.start) out[t.listing] = (out[t.listing] || 0) + nightsInMonth(t.start, t.nights, month);
  return out;
}

// Everything in the file for one guest: their reservations plus adjustments on the same confirmation codes.
export function guestIndex(tx, listing = null) {
  const scoped = tx.filter(t => !listing || t.listing === listing);
  const codeGuest = {}; scoped.forEach(t => { if (t.code && t.guest) codeGuest[t.code] = t.guest; });
  const map = new Map();
  for (const t of scoped) {
    const name = (t.guest || codeGuest[t.code] || "").trim(); if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, lines: [] });
    map.get(key).lines.push(t);
  }
  return [...map.values()].map(g => {
    const res = g.lines.filter(t => t.kind === "reservation");
    const sum = f => r2(g.lines.reduce((a, t) => a + (t[f] || 0), 0));
    g.lines.sort((a, b) => (a.start || a.date) - (b.start || b.date));
    return { name: g.name, stays: res.length, nights: res.reduce((a, t) => a + t.nights, 0), gross: sum("gross"), serviceFee: sum("serviceFee"), cleaningFee: sum("cleaningFee"), payout: sum("payout"),
      listings: [...new Set(g.lines.map(t => t.listing))], currency: g.lines[0]?.currency || "USD", lines: g.lines };
  }).sort((a, b) => b.payout - a.payout || a.name.localeCompare(b.name));
}

export function money(n, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0); }
  catch { return "$" + (n || 0).toFixed(2); }
}
export function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const SAMPLE_CSV = `Date,Type,Confirmation Code,Booking date,Start date,Nights,Guest,Listing,Details,Reference code,Currency,Amount,Paid out,Service fee,Fast pay fee,Cleaning fee,Gross earnings,Occupancy taxes,Earnings year
10/03/2026,Payout,,,,,,,Transfer to Checking ****4421,,USD,,1182.60,,,,,,
10/02/2026,Reservation,HMQ8ZK2P4A,09/14/2026,10/01/2026,3,Jordan Lee,Lakeview Cabin,,,USD,"1,182.60",,217.40,,120.00,"1,400.00",168.00,2026
10/09/2026,Reservation,HM4TXR91BC,09/20/2026,10/08/2026,4,Maria Gonzalez,Lakeview Cabin,,,USD,"1,520.40",,279.60,,120.00,"1,800.00",216.00,2026
10/17/2026,Reservation,HMD72LWQ8E,10/01/2026,10/16/2026,2,Chris Patel,Lakeview Cabin,,,USD,844.70,,155.30,,120.00,"1,000.00",120.00,2026
10/24/2026,Reservation,HMP0VJ6N3T,10/05/2026,10/23/2026,5,Aisha Khan,Lakeview Cabin,,,USD,"2,027.20",,372.80,,120.00,"2,400.00",288.00,2026
10/26/2026,Resolution Adjustment,HMD72LWQ8E,,,,Chris Patel,Lakeview Cabin,Damage reimbursement,,USD,85.00,,,,,85.00,,2026
10/30/2026,Reservation,HMZ3KQ7R2D,10/12/2026,10/29/2026,3,Sam Rivera,Lakeview Cabin,,,USD,"1,267.05",,232.95,,120.00,"1,500.00",180.00,2026
10/05/2026,Reservation,HM9WLA5S1F,09/02/2026,10/04/2026,2,Taylor Brooks,Downtown Loft,,,USD,591.30,,108.70,,80.00,700.00,84.00,2026
10/20/2026,Reservation,HMB8QX2D7G,10/03/2026,10/19/2026,4,Noah Kim,Downtown Loft,,,USD,"1,013.60",,186.40,,80.00,"1,200.00",144.00,2026
`;
