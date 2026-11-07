// Stripe plan mapping and helpers. The Stripe secret key is read from the STRIPE_SECRET_KEY environment variable
// (a restricted key with read access to Checkout Sessions and Subscriptions is enough).
// STRIPE_API_BASE exists only so tests can point at a local fake Stripe; it is never set in production.
// Filled in once the separate Ownermint Stripe account is connected (Ownermint must not sell through ComradeView).
// Empty = checkout is switched off and the site shows "Opening soon".
export const PRICE_PLAN = {};
export const LINKS = {};
// Subscriptions in these states keep paid features. past_due keeps them while Stripe retries the card.
export const ACTIVE = ["active", "trialing", "past_due"];
export async function stripeGet(env, path) {
  const res = await fetch((env.STRIPE_API_BASE || "https://api.stripe.com") + "/v1/" + path, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((body.error && body.error.message) || `Stripe error ${res.status}`); e.status = res.status; throw e; }
  return body;
}
export const planOf = sub => { for (const it of (sub && sub.items && sub.items.data) || []) { const p = PRICE_PLAN[it.price && it.price.id]; if (p) return p; } return null; };
