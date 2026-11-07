// Stripe plan mapping and helpers. The Stripe secret key is read from the STRIPE_SECRET_KEY environment variable
// (a restricted key with read access to Checkout Sessions and Subscriptions is enough).
// STRIPE_API_BASE exists only so tests can point at a local fake Stripe; it is never set in production.
export const PRICE_PLAN = {
  price_1UYyeZFn7xT3nivOqd2e45PW: "host", // $9 / month
  price_1UYyebFn7xT3nivOi16uHDnX: "host", // $90 / year
  price_1UYyecFn7xT3nivO6D2fO7HI: "pro",  // $29 / month
  price_1UYyeeFn7xT3nivOi7hfFzsQ: "pro",  // $290 / year
};
export const LINKS = {
  host: { month: "https://buy.stripe.com/fZu8wPfmEgV25jv4hD5AQ01", year: "https://buy.stripe.com/14A14ngqI7ks8vH3dz5AQ02" },
  pro: { month: "https://buy.stripe.com/7sYeVda2k9sA8vH01n5AQ03", year: "https://buy.stripe.com/6oU28r1vO5ckaDP5lH5AQ04" },
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
