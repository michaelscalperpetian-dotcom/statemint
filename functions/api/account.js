import { json, bad } from "../_lib.js";
import { requireUser, planFor, clearSessionCookie } from "../_auth.js";
// Deletes the account and everything stored for it. Blocked while a subscription is active (cancel it first).
export async function onRequestDelete({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  const p = await planFor(env, user.id);
  if (p.hasSubscription) return bad("Please cancel your subscription first (Manage subscription), then delete your account.", 409);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_data WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM statements WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM licenses WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": clearSessionCookie() } });
}
