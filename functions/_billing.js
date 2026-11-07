// Stripe plan mapping and helpers. The Stripe secret key is read from the STRIPE_SECRET_KEY environment variable
// (a restricted key with read access to Checkout Sessions and Subscriptions is enough).
// STRIPE_API_BASE exists only so tests can point at a local fake Stripe; it is never set in production.
// Filled in once the separate Ownermint Stripe account is connected (Ownermint must not sell through ComradeView).
// Empty = checkout is switched off and the site shows "Opening soon".
export const PRICE_PLAN = {};
export const LINKS = {};
// Local tests only (TEST_BILLING=1 in .dev.vars, never set in production): fake prices/links so the payment flow stays tested.
const TEST = { PRICE_PLAN: { price_test_host_month: "host" }, LINKS: { host: { month: "https://buy.stripe.com/test_host_month", year: "https://buy.stripe.com/test_host_year" }, pro: { month: "https://buy.stripe.com/test_pro_month", year: "https://buy.stripe.com/test_pro_year" } } };
export const plans = env => (env && env.TEST_BILLING === "1" ? TEST : { PRICE_PLAN, LINKS });
// Subscriptions in these states keep paid features. past_due keeps them while Stripe retries the card.
export const ACTIVE = ["active", "trialing", "past_due"];
export async function stripeGet(env, path) {
  const res = await fetch((env.STRIPE_API_BASE || "https://api.stripe.com") + "/v1/" + path, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((body.error && body.error.message) || `Stripe error ${res.status}`); e.status = res.status; throw e; }
  return body;
}
export const planOf = (sub, env) => { const map = plans(env).PRICE_PLAN; for (const it of (sub && sub.items && sub.items.data) || []) { const p = map[it.price && it.price.id]; if (p) return p; } return null; };
