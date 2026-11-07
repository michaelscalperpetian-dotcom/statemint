// Stripe billing for Ownermint (separate Ownermint Stripe account, acct_1UZ5JxRVql5OGuqT).
// Secrets (Cloudflare Pages → Settings → Variables and Secrets):
//   STRIPE_SECRET_KEY      restricted key: Checkout Sessions write, Subscriptions read, Customers read, Customer portal write
//   STRIPE_WEBHOOK_SECRET  signing secret of the webhook endpoint /api/billing/webhook
// STRIPE_API_BASE and TEST_BILLING exist only so local tests can use a fake Stripe; they are never set in production.

// Live prices (Managed Payments; Stripe is the merchant of record and handles tax).
const LIVE = {
  PRICES: {
    host: { month: "price_1UZDz9RVql5OGuqTaP5n6AFG", year: "price_1UZDzARVql5OGuqToAUwSHh1" }, // $5 / mo, $50 / yr
    pro: { month: "price_1UZDzCRVql5OGuqT8HtdnU47", year: "price_1UZDzDRVql5OGuqT9UV8ZiKb" },  // $15 / mo, $150 / yr
  },
  PORTAL_CONFIG: "bpc_1UZDznRVql5OGuqTXas9LADQ",
  PORTAL_LOGIN: "https://billing.stripe.com/p/login/cNifZj9lW4QO4V27Eb77O00",
};
const TEST = {
  PRICES: { host: { month: "price_test_host_month", year: "price_test_host_year" }, pro: { month: "price_test_pro_month", year: "price_test_pro_year" } },
  PORTAL_CONFIG: "bpc_test", PORTAL_LOGIN: "https://billing.stripe.com/p/login/test",
};
export const plans = env => {
  const cfg = env && env.TEST_BILLING === "1" ? TEST : LIVE;
  const PRICE_PLAN = {}; for (const [plan, byInt] of Object.entries(cfg.PRICES)) for (const id of Object.values(byInt)) PRICE_PLAN[id] = plan;
  return { ...cfg, PRICE_PLAN };
};
export const SITE = "https://statemint-994.pages.dev";
// Subscriptions in these states keep paid features. past_due keeps them while Stripe retries the card.
export const ACTIVE = ["active", "trialing", "past_due"];

const base = env => (env.STRIPE_API_BASE || "https://api.stripe.com") + "/v1/";
async function call(env, method, path, form) {
  const res = await fetch(base(env) + path, {
    method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? encodeForm(form) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((body.error && body.error.message) || `Stripe error ${res.status}`); e.status = res.status; throw e; }
  return body;
}
export const stripeGet = (env, path) => call(env, "GET", path);
export const stripePost = (env, path, form) => call(env, "POST", path, form);
// Stripe's form encoding: nested objects and arrays become a[b][0][c]=v
export function encodeForm(obj) {
  const out = [];
  const walk = (v, key) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, key ? `${key}[${k}]` : k);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  walk(obj, ""); return out.join("&");
}
export const planOf = (sub, env) => { const map = plans(env).PRICE_PLAN; for (const it of (sub && sub.items && sub.items.data) || []) { const p = map[it.price && it.price.id]; if (p) return p; } return null; };
const idOf = x => (x && typeof x === "object" ? x.id : x) || null;

// Brings our license row in line with Stripe's current view of the subscription (never trusts event payload order).
export async function refreshSubscription(env, subscriptionId) {
  const sub = await stripeGet(env, `subscriptions/${encodeURIComponent(subscriptionId)}`);
  const plan = planOf(sub, env);
  await env.DB.prepare("UPDATE licenses SET status = ?, plan = COALESCE(?, plan), customer_id = COALESCE(customer_id, ?), checked_at = ? WHERE subscription_id = ?")
    .bind(sub.status, plan, idOf(sub.customer), Date.now(), sub.id).run();
  return sub;
}

// Creates the license for a completed checkout (from the webhook or the browser's return). Idempotent per checkout session.
export async function licenseForSession(env, session, randomKey) {
  const existing = await env.DB.prepare("SELECT key, plan, status FROM licenses WHERE session_id = ?").bind(session.id).first();
  if (existing) return { ...existing, created: false };
  const subId = idOf(session.subscription);
  if (session.status !== "complete" || session.mode !== "subscription" || !subId) return { error: "This checkout isn't complete yet.", status: 409 };
  const sub = typeof session.subscription === "object" && session.subscription.items ? session.subscription : await stripeGet(env, `subscriptions/${encodeURIComponent(subId)}`);
  const plan = planOf(sub, env);
  if (!plan) return { error: "This checkout isn't for an Ownermint plan.", status: 400 };
  const key = randomKey(), now = Date.now();
  // INSERT OR IGNORE: if the webhook and the browser race, the first insert wins and both read the same row back
  await env.DB.prepare("INSERT OR IGNORE INTO licenses (key, session_id, subscription_id, customer_id, plan, status, created_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(key, session.id, sub.id, idOf(session.customer) || idOf(sub.customer), plan, sub.status, now, now).run();
  const row = await env.DB.prepare("SELECT key, plan, status FROM licenses WHERE session_id = ?").bind(session.id).first();
  return { ...row, created: row.key === key };
}

// Stripe webhook signature: header "t=<ts>,v1=<hex hmac>" over `${t}.${rawBody}` with the endpoint secret.
export async function verifySignature(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = null; const v1 = [];
  for (const part of header.split(",")) { const [k, v] = part.split("=", 2); if (k === "t") t = v; else if (k === "v1" && v) v1.push(v); }
  if (!t || !/^\d+$/.test(t) || !v1.length || Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return v1.some(sig => sig.length === mac.length && [...sig].reduce((d, c, i) => d | (c.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0);
}
