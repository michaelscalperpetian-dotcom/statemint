import { json, bad } from "../_lib.js";
import { requireUser } from "../_auth.js";
// Per-account storage for everything the app keeps (one row per app storage key).
const MAX_VALUE = 1900000;      // D1 rows are limited to 2 MB
const MAX_TOTAL = 25000000;     // per account
const validKey = k => typeof k === "string" && k.length > 0 && k.length <= 300;
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  const { results } = await env.DB.prepare("SELECT key, value, updated_at FROM user_data WHERE user_id = ?").bind(user.id).all();
  const items = {}, updated = {}; for (const r of results || []) { items[r.key] = r.value; updated[r.key] = r.updated_at; }
  return json({ items, updated });
}
// Body: { items: { key: jsonString | null, ... } }  (null deletes the key)
export async function onRequestPut({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  let body; try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const items = body && typeof body.items === "object" && body.items ? body.items : null;
  if (!items) return bad("Nothing to save.");
  const entries = Object.entries(items);
  if (entries.length > 500) return bad("Too many items at once.");
  for (const [k, v] of entries) {
    if (!validKey(k)) return bad("Invalid key.");
    if (v !== null && typeof v !== "string") return bad("Invalid value.");
    if (v !== null && v.length > MAX_VALUE) return bad(`"${k.slice(0, 40)}" is too large to save to your account.`, 413);
  }
  const { total } = await env.DB.prepare("SELECT COALESCE(SUM(LENGTH(value)), 0) AS total FROM user_data WHERE user_id = ?").bind(user.id).first();
  const incoming = entries.reduce((a, [, v]) => a + (v ? v.length : 0), 0);
  if (total + incoming > MAX_TOTAL + MAX_VALUE) return bad("Your account storage is full. Delete some saved statements.", 413);
  const now = Date.now();
  await env.DB.batch(entries.map(([k, v]) => v === null
    ? env.DB.prepare("DELETE FROM user_data WHERE user_id = ? AND key = ?").bind(user.id, k)
    : env.DB.prepare("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(user.id, k, v, now)));
  return json({ ok: true });
}
// Deletes everything stored for this account (the account itself stays).
export async function onRequestDelete({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  await env.DB.prepare("DELETE FROM user_data WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true });
}
