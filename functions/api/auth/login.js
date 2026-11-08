import { bad } from "../../_lib.js";
import { googleAuthUrl, callbackUrl, pkcePair, randomToken, cookie, OAUTH_COOKIE, safeNext } from "../../_auth.js";
// Starts "Sign in with Google". ?next= is where to return afterwards (same-site paths only).
export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return bad("Sign-in isn't set up yet.", 503);
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const state = randomToken(24), { verifier, challenge } = await pkcePair();
  const auth = new URL(googleAuthUrl(env, request));
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callbackUrl(request), response_type: "code", scope: "openid email profile",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
    ...(url.searchParams.get("login_hint") ? { login_hint: url.searchParams.get("login_hint") } : {}),
  }).toString();
  const value = [state, verifier, btoa(next)].join(".");
  return new Response(null, { status: 302, headers: { location: auth.toString(), "set-cookie": cookie(OAUTH_COOKIE, value, { maxAge: 600, path: "/api/auth" }), "cache-control": "no-store" } });
}
