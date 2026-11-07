// Plans shown on the site and enforced in the app. Prices in USD; tax is added at checkout where it applies.
export const PLANS = {
  free: { name: "Free", limit: 1, month: 0, year: 0 },
  host: { name: "Host", limit: 5, month: 9, year: 90 },
  pro: { name: "Pro", limit: Infinity, month: 29, year: 290 },
};
export const limitLabel = plan => (PLANS[plan].limit === Infinity ? "Unlimited properties" : `${PLANS[plan].limit} propert${PLANS[plan].limit === 1 ? "y" : "ies"}`);
// Fetches whether checkout is switched on, and the checkout links. Never throws.
export async function billingConfig() {
  try { const r = await fetch("/api/billing/config"); if (r.ok) return await r.json(); } catch {}
  return { enabled: false, links: {} };
}
