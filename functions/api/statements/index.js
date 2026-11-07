import { json, bad, randomId, ipHash, cleanSubmission } from "../../_lib.js";
const LIMIT_PER_HOUR = 30;
// Saves a statement snapshot so the owner can open it as a live web page.
export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (text.length > 250000) return bad("This statement is too large to share (the logo may be too big).", 413);
  let body; try { body = JSON.parse(text); } catch { return bad("Invalid JSON"); }
  const { data, error } = cleanSubmission(body);
  if (error) return bad(error);
  const now = Date.now(), hash = await ipHash(request, env);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM statements WHERE ip_hash = ? AND created_at > ?").bind(hash, now - 3600000).first();
  if (n >= LIMIT_PER_HOUR) return bad("Too many owner links were created from your network in the last hour. Please try again later.", 429);
  const id = randomId(12), editKey = randomId(24);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO statements (id, edit_key, data, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)").bind(id, editKey, JSON.stringify(data), now, hash),
    // keep rate-limit hashes for 24 hours only
    env.DB.prepare("UPDATE statements SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?").bind(now - 86400000),
  ]);
  return json({ id, editKey }, 201);
}
