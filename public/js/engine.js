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
  date: ["date", "transactiondate", "payoutdate"],
  type: ["type", "transactiontype"],
  code: ["confirmationcode", "confirmation", "reservationcode", "bookingcode"],
  start: ["startdate", "checkin", "checkindate", "arrival"],
  end: ["enddate", "checkout", "checkoutdate", "departure"],
  nights: ["nights", "numberofnights"],
  guest: ["guest", "guestname"],
  listing: ["listing", "listingname", "property", "propertyname"],
  currency: ["currency"],
  amount: ["amount", "hostearnings", "netearnings", "payoutamount"],
  paidOut: ["paidout"],
  serviceFee: ["servicefee", "hostservicefee", "hostfee", "airbnbservicefee"],
  cleaningFee: ["cleaningfee", "cleaningfees"],
  gross: ["grossearnings", "gross", "grossamount"],
  taxes: ["occupancytaxes", "taxes", "taxeswithheld"],
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

export function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(Date.UTC(y, +m[1] - 1, +m[2])); }
  const d = new Date(s); return isNaN(d) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
export const ymd = d => d ? d.toISOString().slice(0, 10) : "";
export const monthKey = d => d ? d.toISOString().slice(0, 7) : "";

/* ---------- transactions ---------- */
// Turns CSV rows into transactions. Payout rows (transfers to the bank) are dropped:
// they repeat money already counted in the reservation rows.
export function toTransactions(rows, map = null) {
  if (!rows.length) return { transactions: [], map: {}, warnings: ["The file is empty."] };
  const header = rows[0]; map = map || detectColumns(header);
  const warnings = [];
  if (map.amount == null && map.gross == null) warnings.push("Couldn't find an Amount or Gross earnings column.");
  const get = (r, f) => (map[f] == null ? "" : r[map[f]]);
  const tx = [];
  for (const r of rows.slice(1)) {
    const type = String(get(r, "type") || "").trim();
    const t = type.toLowerCase();
    if (t === "payout") continue;
    const amount = map.amount != null ? parseMoney(get(r, "amount")) : 0;
    const gross = map.gross != null ? parseMoney(get(r, "gross")) : 0;
    const serviceFee = Math.abs(parseMoney(get(r, "serviceFee")));
    const cleaningFee = parseMoney(get(r, "cleaningFee"));
    const nights = parseInt(get(r, "nights"), 10) || 0;
    const code = String(get(r, "code") || "").trim();
    if (!amount && !gross && !serviceFee) continue;
    const isReservation = t ? t.includes("reservation") : (!!code && nights > 0);
    tx.push({
      kind: isReservation ? "reservation" : "adjustment",
      type: type || (isReservation ? "Reservation" : "Adjustment"),
      date: parseDate(get(r, "date")), start: parseDate(get(r, "start")), end: parseDate(get(r, "end")),
      nights, code, guest: String(get(r, "guest") || "").trim(), listing: String(get(r, "listing") || "").trim() || "Listing",
      currency: String(get(r, "currency") || "").trim() || "USD",
      // payout = what Airbnb pays the host for this line after its host fee
      payout: map.amount != null ? amount : gross - serviceFee,
      gross: map.gross != null ? gross : amount + serviceFee,
      serviceFee, cleaningFee, taxes: parseMoney(get(r, "taxes")),
    });
  }
  if (!tx.length) warnings.push("No reservations found in this file.");
  return { transactions: tx, map, warnings };
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
  splitPaidToCohost: 0,          // when Airbnb already paid the co-host directly
  monthBy: "checkin",            // "checkin" | "payout"
};
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const daysInMonth = key => { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

export function buildStatement(tx, { listing, month, settings = {}, expenses = [] }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const pct = Math.max(0, Math.min(100, Number(s.commissionPct) || 0)) / 100;
  const inMonth = t => monthKey(s.monthBy === "checkin" ? (t.start || t.date) : (t.date || t.start)) === month;
  const lines = tx.filter(t => (!listing || t.listing === listing) && inMonth(t))
    .sort((a, b) => (a.start || a.date) - (b.start || b.date));

  const rows = lines.map(t => {
    const base = s.commissionBase === "gross" ? t.gross : s.commissionBase === "payout_ex_cleaning" ? t.payout - t.cleaningFee : t.payout;
    return { ...t, commissionBase: r2(base), commission: r2(base * pct) };
  });
  const sum = f => r2(rows.reduce((a, t) => a + (t[f] || 0), 0));
  const res = rows.filter(t => t.kind === "reservation");
  const nights = res.reduce((a, t) => a + t.nights, 0);
  const grossRevenue = sum("gross"), airbnbFees = sum("serviceFee"), cleaning = sum("cleaningFee"), payout = sum("payout");
  const commission = sum("commission");
  const cleaningToCohost = s.cleaningTo === "cohost" ? cleaning : 0;
  const exp = expenses.filter(e => e && Number(e.amount)).map(e => ({ date: e.date || "", description: String(e.description || "Expense"), amount: r2(Number(e.amount)) }));
  const expensesTotal = r2(exp.reduce((a, e) => a + e.amount, 0));
  const cohostEarned = r2(commission + cleaningToCohost + expensesTotal);
  const ownerNet = r2(payout - cohostEarned);
  const roomRevenue = r2(grossRevenue - cleaning);
  let settlement;
  if (s.payoutReceiver === "owner") settlement = { direction: "owner_pays_cohost", amount: cohostEarned, label: "Owner pays co-host" };
  else if (s.payoutReceiver === "cohost") settlement = { direction: "cohost_pays_owner", amount: ownerNet, label: "Co-host pays owner" };
  else {
    const already = r2(Number(s.splitPaidToCohost) || 0);
    const diff = r2(cohostEarned - already);
    settlement = diff >= 0
      ? { direction: "owner_pays_cohost", amount: diff, label: "Owner pays co-host (after Airbnb split)", alreadyPaid: already }
      : { direction: "cohost_pays_owner", amount: -diff, label: "Co-host returns to owner (Airbnb split was too high)", alreadyPaid: already };
  }
  return {
    listing, month, settings: s, currency: rows[0]?.currency || "USD",
    lines: rows.map(t => ({ kind: t.kind, type: t.type, code: t.code, guest: t.guest, start: ymd(t.start), end: ymd(t.end), date: ymd(t.date), nights: t.nights,
      gross: r2(t.gross), serviceFee: r2(t.serviceFee), cleaningFee: r2(t.cleaningFee), payout: r2(t.payout), commission: t.commission })),
    expenses: exp,
    totals: { reservations: res.length, nights, grossRevenue, airbnbFees, cleaning, payout, commission, cleaningToCohost, expensesTotal, cohostEarned, ownerNet,
      occupancy: s.monthBy === "checkin" && month ? Math.min(1, nights / daysInMonth(month)) : null,
      adr: nights ? r2(roomRevenue / nights) : 0 },
    settlement,
  };
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
