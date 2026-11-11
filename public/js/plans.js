// Plans shown on the site and enforced in the app. Prices in USD; tax is added at checkout where it applies.
export const PLANS = {
  free: { name: "Free", limit: 1, month: 0, year: 0 },
  host: { name: "Host", limit: 5, month: 5, year: 50 },
  pro: { name: "Pro", limit: Infinity, month: 15, year: 150 },
};
// What subscribers agree to, shown next to every paid-plan button (California's automatic-renewal law asks for this
// to be clear and close to the button). Keep in step with /terms and /refunds.
export const TRIAL_DAYS = 7;
export const renewalNote = trial =>
  (trial ? `New subscribers get a ${TRIAL_DAYS}-day free trial (once per account). Your card is charged when the trial ends unless you cancel before. ` : "") +
  "Plans renew automatically every month or year at the price shown until you cancel. Cancel anytime under Manage subscription; you keep access until the end of the period you paid for. No refunds for partial periods. Prices in USD; tax is added at checkout where it applies.";
export const limitLabel = plan => (PLANS[plan].limit === Infinity ? "Unlimited properties" : `${PLANS[plan].limit} propert${PLANS[plan].limit === 1 ? "y" : "ies"}`);
// Whether checkout is switched on. Never throws.
export async function billingConfig() {
  try { const r = await fetch("/api/billing/config"); if (r.ok) return await r.json(); } catch {}
  return { enabled: false };
}
// Sends the browser to Stripe Checkout for a plan. Throws an Error with a readable message on failure.
export async function startCheckout(plan, interval) {
  let r; try { r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval }) }); }
  catch { throw new Error("Couldn't reach Mint Statements. Check your connection and try again."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || "Couldn't start checkout. Please try again.");
  location.href = d.url;
}
// Opens the Stripe customer portal for the signed-in account.
export async function openPortal() {
  let r; try { r = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); }
  catch { throw new Error("Couldn't reach Mint Statements. Check your connection and try again."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || "Couldn't open the billing page. Please try again.");
  location.href = d.url;
}
