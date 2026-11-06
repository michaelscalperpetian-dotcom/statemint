import { json, bad, sameKey, validId } from "../../_lib.js";
export async function onRequestGet({ params, env }) {
  if (!validId(params.id)) return bad("Not found", 404);
  const row = await env.DB.prepare("SELECT data, created_at FROM statements WHERE id = ?").bind(params.id).first();
  if (!row) return bad("Not found", 404);
  await env.DB.prepare("UPDATE statements SET views = views + 1 WHERE id = ?").bind(params.id).run();
  return json({ ...JSON.parse(row.data), createdAt: row.created_at });
}
export async function onRequestDelete({ params, request, env }) {
  if (!validId(params.id)) return bad("Not found", 404);
  const row = await env.DB.prepare("SELECT edit_key FROM statements WHERE id = ?").bind(params.id).first();
  if (!row) return bad("Not found", 404);
  if (!sameKey(new URL(request.url).searchParams.get("k"), row.edit_key)) return bad("Not allowed", 403);
  await env.DB.prepare("DELETE FROM statements WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
