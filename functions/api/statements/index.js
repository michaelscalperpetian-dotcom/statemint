import { json, bad, randomId, ipHash, cleanSubmission, linkExpiresAt } from "../../_lib.js";
import { requireUser } from "../../_auth.js";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const LIMIT_PER_HOUR = 30;
// Saves a statement snapshot so the owner can open it as a live web page. Only the owner's Google account
// (ownerEmail) and the host who created it can open the link.
export async function onRequestPost({ request, env }) {
  const { user, error: authError } = await requireUser(request, env); if (authError) return authError;
  const text = await request.text();
  if (text.length > 250000) return bad("This statement is too large to share (the logo may be too big).", 413);
  let body; try { body = JSON.parse(text); } catch { return bad("Invalid JSON"); }
  const { data, error } = cleanSubmission(body);
  if (error) return bad(error);
  const ownerEmail = String((body && body.ownerEmail) || "").trim().toLowerCase();
  if (!EMAIL_RE.test(ownerEmail)) return bad("Enter the owner's email address so only they can open the link.");
  const now = Date.now(), hash = await ipHash(request, env);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM statements WHERE ip_hash = ? AND created_at > ?").bind(hash, now - 3600000).first();
  if (n >= LIMIT_PER_HOUR) return bad("Too many owner links were created from your network in the last hour. Please try again later.", 429);
  const id = randomId(12), editKey = randomId(24);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO statements (id, edit_key, data, created_at, ip_hash, user_id, owner_email) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, editKey, JSON.stringify(data), now, hash, user.id, ownerEmail),
    // keep rate-limit hashes for 24 hours only
    env.DB.prepare("UPDATE statements SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?").bind(now - 86400000),
  ]);
  return json({ id, editKey, ownerEmail, expiresAt: linkExpiresAt(now) }, 201);
}
// The signed-in host's owner links, newest first (for the dashboard).
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, owner_email, views, json_extract(data, '$.statement.listing') AS listing, json_extract(data, '$.statement.month') AS month, json_extract(data, '$.statement.totals.ownerNet') AS owner_net, json_extract(data, '$.statement.currency') AS currency FROM statements WHERE user_id = ? ORDER BY created_at DESC LIMIT 500"
  ).bind(user.id).all();
  return json({ links: (results || []).map(r => ({ id: r.id, createdAt: r.created_at, expiresAt: linkExpiresAt(r.created_at), expired: Date.now() >= linkExpiresAt(r.created_at), ownerEmail: r.owner_email, views: r.views || 0, listing: r.listing, month: r.month, ownerNet: r.owner_net, currency: r.currency || "USD" })) });
}
