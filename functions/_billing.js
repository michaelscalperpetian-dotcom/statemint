// Stripe plan mapping and helpers. The Stripe secret key is read from the STRIPE_SECRET_KEY environment variable
// (a restricted key with read access to Checkout Sessions and Subscriptions is enough).
// STRIPE_API_BASE exists only so tests can point at a local fake Stripe; it is never set in production.
export const PRICE_PLAN = {
  price_1UYytTFn7xT3nivOANtqXBFb: "host", // $5 / month
  price_1UYytVFn7xT3nivOXzmRPbYL: "host", // $50 / year
  price_1UYytXFn7xT3nivOwqReLyaP: "pro",  // $15 / month
  price_1UYytZFn7xT3nivOq8JXFxc6: "pro",  // $150 / year
};
export const LINKS = {
  host: { month: "https://buy.stripe.com/aFa3cv6Q86go9zL3dz5AQ05", year: "https://buy.stripe.com/fZu28rcaseMUfY97tP5AQ06" },
  pro: { month: "https://buy.stripe.com/9B65kD4I00W4cLX29v5AQ07", year: "https://buy.stripe.com/aFa6oH7UcgV2cLX6pL5AQ08" },
};
// Subscriptions in these states keep paid features. past_due keeps them while Stripe retries the card.
export const ACTIVE = ["active", "trialing", "past_due"];
export async function stripeGet(env, path) {
  const res = await fetch((env.STRIPE_API_BASE || "https://api.stripe.com") + "/v1/" + path, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((body.error && body.error.message) || `Stripe error ${res.status}`); e.status = res.status; throw e; }
  return body;
}
export const planOf = sub => { for (const it of (sub && sub.items && sub.items.data) || []) { const p = PRICE_PLAN[it.price && it.price.id]; if (p) return p; } return null; };
