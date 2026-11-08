import { googleTokenUrl, callbackUrl, cookies, cookie, OAUTH_COOKIE, readIdToken, createSession, newUserId, safeNext } from "../../_auth.js";
const page = (title, text) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Ownermint</title><link rel="stylesheet" href="/css/app.css"><main class="nf"><a class="logo" href="/"><i></i>Ownermint</a><h1>${title}</h1><p>${text}</p><div class="nf-actions"><a class="btn btn-mint" href="/login"><span>Try again</span></a></div></main>`,
  { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": cookie(OAUTH_COOKIE, "", { maxAge: 0, path: "/api/auth" }) } });
// Google sends the browser back here with ?code&state. Verifies state + PKCE, exchanges the code, signs the user in.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return page("Sign-in was cancelled", "No problem. You can try again whenever you're ready.");
  const [state, verifier, nextB64] = String(cookies(request)[OAUTH_COOKIE] || "").split(".");
  if (!state || !verifier || url.searchParams.get("state") !== state) return page("Sign-in expired", "That sign-in link is too old or was opened in a different browser. Please start again.");
  let tokens;
  try {
    const r = await fetch(googleTokenUrl(env, request), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code") || "", client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callbackUrl(request), grant_type: "authorization_code", code_verifier: verifier }).toString() });
    tokens = await r.json(); if (!r.ok) throw new Error("token");
  } catch { return page("Couldn't sign you in", "Google didn't confirm the sign-in. Please try again."); }
  const g = readIdToken(tokens.id_token, env);
  if (!g) return page("Couldn't sign you in", "Your Google account needs a verified email address to use Ownermint.");
  const now = Date.now();
  let user = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?").bind(g.sub).first();
  if (user) await env.DB.prepare("UPDATE users SET email = ?, name = ?, last_login_at = ? WHERE id = ?").bind(g.email, g.name, now, user.id).run();
  else { user = { id: newUserId() }; await env.DB.prepare("INSERT INTO users (id, google_sub, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)").bind(user.id, g.sub, g.email, g.name, now, now).run(); }
  let next = "/dashboard"; try { next = safeNext(atob(nextB64 || "")); } catch {}
  const headers = new Headers({ location: next, "cache-control": "no-store" });
  headers.append("set-cookie", await createSession(env, user.id));
  headers.append("set-cookie", cookie(OAUTH_COOKIE, "", { maxAge: 0, path: "/api/auth" }));
  return new Response(null, { status: 302, headers });
}
