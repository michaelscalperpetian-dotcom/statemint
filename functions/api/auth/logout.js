import { json } from "../../_lib.js";
import { cookies, SESSION_COOKIE, sha256hex, clearSessionCookie } from "../../_auth.js";
// Signs out: deletes this browser's session and clears the cookie.
export async function onRequestPost({ request, env }) {
  const token = cookies(request)[SESSION_COOKIE];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256hex(token)).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": clearSessionCookie() } });
}
