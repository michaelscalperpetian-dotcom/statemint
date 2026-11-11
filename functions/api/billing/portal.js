import { json, bad } from "../../_lib.js";
import { plans, stripePost, siteOrigin } from "../../_billing.js";
import { requireUser, planFor } from "../../_auth.js";
// Opens the Stripe customer portal (change plan, cancel, update card, invoices) for the signed-in user.
export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return bad("Payments aren't switched on yet.", 503);
  const { user, error } = await requireUser(request, env); if (error) return error;
  const p = await planFor(env, user.id);
  if (!p.customerId) return bad("There's no subscription on this account yet.", 404);
  const origin = siteOrigin(request, env);
  try {
    const s = await stripePost(env, "billing_portal/sessions", { customer: p.customerId, configuration: plans(env).PORTAL_CONFIG, return_url: `${origin}/dashboard` });
    return json({ url: s.url });
  } catch { return bad("Couldn't open the billing page. Please try again in a minute.", 502); }
}
