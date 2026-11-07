import { json, bad, sameKey, validId } from "../../_lib.js";
import { getUser, requireUser } from "../../_auth.js";
// Opening an owner link needs a signed-in Google account: the owner it was shared with, or the host who made it.
// (Links created before accounts existed have no owner email; any signed-in user can open those.)
export async function onRequestGet({ params, request, env }) {
  if (!validId(params.id)) return bad("Not found", 404);
  const row = await env.DB.prepare("SELECT data, created_at, user_id, owner_email FROM statements WHERE id = ?").bind(params.id).first();
  if (!row) return bad("Not found", 404);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Please sign in to view this statement.", signIn: true }, 401);
  const allowed = !row.owner_email || user.id === row.user_id || user.email === row.owner_email;
  if (!allowed) return json({ error: "This statement was shared with a different email address.", signedInAs: user.email }, 403);
  if (user.id !== row.user_id) await env.DB.prepare("UPDATE statements SET views = views + 1 WHERE id = ?").bind(params.id).run();
  return json({ ...JSON.parse(row.data), createdAt: row.created_at, sharedWith: row.owner_email, isCreator: user.id === row.user_id });
}
// Deleting: the host who created it (signed in), or anyone holding the edit key from before accounts existed.
export async function onRequestDelete({ params, request, env }) {
  if (!validId(params.id)) return bad("Not found", 404);
  const row = await env.DB.prepare("SELECT edit_key, user_id FROM statements WHERE id = ?").bind(params.id).first();
  if (!row) return bad("Not found", 404);
  const key = request.headers.get("x-edit-key") || new URL(request.url).searchParams.get("k");
  let ok = sameKey(key, row.edit_key);
  if (!ok) { const { user } = await requireUser(request, env); ok = !!user && user.id === row.user_id; }
  if (!ok) return bad("Not allowed", 403);
  await env.DB.prepare("DELETE FROM statements WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
