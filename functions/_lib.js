const BASE_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: BASE_HEADERS });
export const bad = (error, status = 400) => json({ error }, status);
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 56 chars, no look-alikes
// Rejection sampling: bytes >= 224 (4 x 56) are discarded so every character is equally likely.
export function randomId(len) {
  let s = "";
  while (s.length < len) for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) { if (b < 224 && s.length < len) s += ALPHABET[b % 56]; }
  return s;
}
export function sameKey(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
export const validId = id => /^[A-Za-z0-9]{8,20}$/.test(id || "");
export async function ipHash(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.IP_SALT || "ownermint"}|${day}|${ip}`)));
  return [...bytes.slice(0, 8)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- statement sanitizing: only the fields the viewer renders are stored ---------- */
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const TOTALS = ["reservations", "nights", "grossRevenue", "airbnbFees", "cleaning", "payout", "commission", "cleaningToCohost", "expensesTotal", "cohostEarned", "ownerNet", "adr"];
export function cleanSubmission(body) {
  const s = body && body.statement;
  if (!s || typeof s !== "object" || !s.totals || typeof s.totals !== "object" || !Array.isArray(s.lines) || !s.settlement || typeof s.settlement !== "object") return { error: "Missing statement" };
  if (s.lines.length > 1500) return { error: "Too many lines in one statement" };
  if (Array.isArray(s.expenses) && s.expenses.length > 200) return { error: "Too many expenses" };
  const totals = Object.fromEntries(TOTALS.map(k => [k, num(s.totals[k])]));
  totals.occupancy = s.totals.occupancy == null ? null : Math.max(0, Math.min(1, num(s.totals.occupancy)));
  const set = s.settings || {};
  const statement = {
    listing: str(s.listing, 200), month: /^\d{4}-\d{2}$/.test(s.month || "") ? s.month : "", currency: /^[A-Z]{3}$/.test(s.currency || "") ? s.currency : "USD",
    settings: { commissionPct: Math.max(0, Math.min(100, num(set.commissionPct))), commissionBase: oneOf(set.commissionBase, ["payout", "payout_ex_cleaning", "gross"], "payout"),
      cleaningTo: oneOf(set.cleaningTo, ["owner", "cohost"], "owner"), payoutReceiver: oneOf(set.payoutReceiver, ["owner", "cohost", "split"], "owner"), monthBy: oneOf(set.monthBy, ["checkin", "payout"], "checkin"),
      commissionOnAdjustments: set.commissionOnAdjustments !== false },
    lines: s.lines.map(l => ({ kind: oneOf(l && l.kind, ["reservation", "adjustment"], "adjustment"), type: str(l.type, 80), code: str(l.code, 40), guest: str(l.guest, 120),
      start: str(l.start, 10), end: str(l.end, 10), date: str(l.date, 10), nights: Math.max(0, Math.min(400, Math.round(num(l.nights)))),
      gross: num(l.gross), serviceFee: num(l.serviceFee), cleaningFee: num(l.cleaningFee), payout: num(l.payout), commission: num(l.commission), row: Math.round(num(l.row)) || null })),
    expenses: (s.expenses || []).map(e => ({ date: str(e && e.date, 10), description: str(e && e.description, 120), amount: num(e && e.amount) })),
    totals,
    settlement: { direction: oneOf(s.settlement.direction, ["owner_pays_cohost", "cohost_pays_owner"], "owner_pays_cohost"), amount: Math.abs(num(s.settlement.amount)), label: str(s.settlement.label, 80) },
  };
  if (s.settlement.alreadyPaid != null) statement.settlement.alreadyPaid = num(s.settlement.alreadyPaid);
  const b = body.brand || {};
  const logo = typeof b.logo === "string" && b.logo.length <= 120000 && LOGO_RE.test(b.logo) ? b.logo : "";
  const brand = { company: str(b.company, 60), ownerName: str(b.ownerName, 60), logo };
  const p = body.previous;
  const previous = p && typeof p === "object" ? { ownerNet: num(p.ownerNet), nights: num(p.nights), month: /^\d{4}-\d{2}$/.test(p.month || "") ? p.month : "" } : null;
  return { data: { statement, brand, note: str(body.note, 600), previous } };
}
