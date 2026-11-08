// Accounts: Sign in with Google (OAuth 2.0 authorization code + PKCE) and cookie sessions.
// Secrets (Cloudflare Pages → Settings → Variables and Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// GOOGLE_AUTH_URL / GOOGLE_TOKEN_URL exist only so local tests can use a fake Google; never set in production.
import { json, bad, randomId } from "./_lib.js";
import { ACTIVE } from "./_billing.js";

export const SESSION_COOKIE = "om_session", OAUTH_COOKIE = "om_oauth";
const SESSION_DAYS = 30;
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = s => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256b64url = async s => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));

export function cookies(request) {
  const out = {}; for (const part of (request.headers.get("cookie") || "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export const cookie = (name, value, { maxAge, path = "/" } = {}) =>
  `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax${maxAge != null ? `; Max-Age=${maxAge}` : ""}`;
// Only same-site relative paths are allowed as a post-login destination (no open redirects).
export const safeNext = next => (typeof next === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) && !next.startsWith("/api/") ? next : "/dashboard");

// The test overrides only ever apply on a local dev server, so a stray setting can't point production elsewhere.
const isLocal = request => ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
export const googleAuthUrl = (env, request) => (isLocal(request) && env.GOOGLE_AUTH_URL) || "https://accounts.google.com/o/oauth2/v2/auth";
export const googleTokenUrl = (env, request) => (isLocal(request) && env.GOOGLE_TOKEN_URL) || "https://oauth2.googleapis.com/token";
export const callbackUrl = request => new URL("/api/auth/callback", request.url).toString();

export async function pkcePair() { const verifier = randomToken(32); return { verifier, challenge: await sha256b64url(verifier) }; }

// The ID token comes straight from Google's token endpoint over TLS in exchange for our client secret,
// so its claims can be trusted without checking the signature (Google's documented guidance); we still
// check issuer, audience, expiry and that the email is verified.
export function readIdToken(idToken, env, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) return null;
  let claims; try { claims = JSON.parse(fromB64url(parts[1])); } catch { return null; }
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== env.GOOGLE_CLIENT_ID || !(claims.exp > nowSec) || !claims.sub || !claims.email || claims.email_verified !== true) return null;
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: claims.name ? String(claims.name).slice(0, 120) : null };
}

export async function createSession(env, userId) {
  const token = randomToken(32), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256hex(token), userId, now, now + SESSION_DAYS * 86400000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now), // expired sessions are useless; don't keep them
  ]);
  return cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
}
export const clearSessionCookie = () => cookie(SESSION_COOKIE, "", { maxAge: 0 });

// Returns the signed-in user or null.
export async function getUser(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare("SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .bind(await sha256hex(token)).first();
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name };
}
// For API routes: the user, or an error Response. State-changing requests must come from our own pages.
export async function requireUser(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return { error: bad("Cross-site request blocked.", 403) };
  }
  const user = await getUser(request, env);
  return user ? { user } : { error: bad("Please sign in.", 401) };
}

// The best active plan across the user's subscriptions.
export async function planFor(env, userId) {
  const { results } = await env.DB.prepare("SELECT plan, status, customer_id FROM licenses WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
  const active = (results || []).filter(r => ACTIVE.includes(r.status));
  const plan = active.some(r => r.plan === "pro") ? "pro" : active.some(r => r.plan === "host") ? "host" : "free";
  const latest = (results || [])[0];
  return { plan, status: active[0]?.status || latest?.status || null, hasSubscription: active.length > 0, customerId: (active[0] || latest || {}).customer_id || null };
}
export const newUserId = () => "u_" + randomId(20);
export { json, bad };
