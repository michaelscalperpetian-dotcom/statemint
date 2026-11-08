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
// Owner links stop working this long after they're made (the host makes a new one after that).
export const LINK_DAYS = 30;
export const linkExpiresAt = createdAt => createdAt + LINK_DAYS * 86400000;
export const validId = id => /^[A-Za-z0-9]{8,20}$/.test(id || "");
// A keyed hash (HMAC) of the visitor's IP for rate limiting. The key is a server secret, so the stored value can't
// be turned back into an IP address by trying all of them. It changes daily and is cleared after 24 hours.
export async function ipHash(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const secret = env.IP_SALT || env.GOOGLE_CLIENT_SECRET || env.STRIPE_WEBHOOK_SECRET || "ownermint-local";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("ip-hash|" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${day}|${ip}`)));
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
  totals.discounts = Math.max(0, num(s.totals.discounts)); totals.discountsEstimated = s.totals.discountsEstimated === true;
  const set = s.settings || {};
  const statement = {
    listing: str(s.listing, 200), month: /^\d{4}-\d{2}$/.test(s.month || "") ? s.month : "", currency: /^[A-Z]{3}$/.test(s.currency || "") ? s.currency : "USD",
    settings: { commissionPct: Math.max(0, Math.min(100, num(set.commissionPct))), commissionBase: oneOf(set.commissionBase, ["payout", "payout_ex_cleaning", "gross"], "payout"),
      cleaningTo: oneOf(set.cleaningTo, ["owner", "cohost"], "owner"), payoutReceiver: oneOf(set.payoutReceiver, ["owner", "cohost", "split"], "owner"), monthBy: oneOf(set.monthBy, ["checkin", "payout"], "checkin"),
      commissionOnAdjustments: set.commissionOnAdjustments !== false, reportType: oneOf(set.reportType, ["managed", "own"], "managed"),
      weeklyDiscountPct: Math.max(0, Math.min(99, num(set.weeklyDiscountPct))), monthlyDiscountPct: Math.max(0, Math.min(99, num(set.monthlyDiscountPct))) },
    lines: s.lines.map(l => ({ kind: oneOf(l && l.kind, ["reservation", "adjustment"], "adjustment"), type: str(l.type, 80), code: str(l.code, 40), guest: str(l.guest, 120),
      start: str(l.start, 10), end: str(l.end, 10), date: str(l.date, 10), nights: Math.max(0, Math.min(400, Math.round(num(l.nights)))),
      gross: num(l.gross), serviceFee: num(l.serviceFee), cleaningFee: num(l.cleaningFee), payout: num(l.payout), commission: num(l.commission), row: Math.round(num(l.row)) || null,
      discountType: oneOf(l.discountType, ["weekly", "monthly"], ""), discountPct: Math.max(0, Math.min(99, num(l.discountPct))), discount: l.discount == null ? null : Math.abs(num(l.discount)), discountSource: oneOf(l.discountSource, ["file", "estimate"], "") })),
    stays: (Array.isArray(s.stays) ? s.stays.slice(0, 200) : []).map(t => ({ guest: str(t && t.guest, 120), code: str(t && t.code, 40), start: /^\d{4}-\d{2}-\d{2}$/.test((t && t.start) || "") ? t.start : "",
      nights: Math.max(0, Math.min(400, Math.round(num(t && t.nights)))), nightsHere: Math.max(0, Math.min(31, Math.round(num(t && t.nightsHere)))), fromPrevious: !!(t && t.fromPrevious), continues: !!(t && t.continues) })).filter(t => t.start),
    expenses: (s.expenses || []).map(e => ({ date: str(e && e.date, 10), description: str(e && e.description, 120), amount: num(e && e.amount), category: str(e && e.category, 60), note: str(e && e.note, 120) })),
    totals,
    settlement: { direction: oneOf(s.settlement.direction, ["owner_pays_cohost", "cohost_pays_owner", "none"], "owner_pays_cohost"), amount: Math.abs(num(s.settlement.amount)), label: str(s.settlement.label, 80) },
  };
  if (s.settlement.alreadyPaid != null) statement.settlement.alreadyPaid = num(s.settlement.alreadyPaid);
  const b = body.brand || {};
  const logo = typeof b.logo === "string" && b.logo.length <= 120000 && LOGO_RE.test(b.logo) ? b.logo : "";
  const brand = { company: str(b.company, 60), ownerName: str(b.ownerName, 60), logo };
  const p = body.previous;
  const previous = p && typeof p === "object" ? { ownerNet: num(p.ownerNet), nights: num(p.nights), month: /^\d{4}-\d{2}$/.test(p.month || "") ? p.month : "" } : null;
  return { data: { statement, brand, note: str(body.note, 600), previous } };
}
