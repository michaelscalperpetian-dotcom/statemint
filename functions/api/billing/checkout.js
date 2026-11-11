import { json, bad } from "../../_lib.js";
import { plans, stripePost, siteOrigin } from "../../_billing.js";
import { requireUser, planFor, trialAvailable } from "../../_auth.js";
const TRIAL_DAYS = 7;
// Starts a Stripe-hosted Checkout (Managed Payments) for a plan, for the signed-in user.
// Prices come from the server only; the browser just names the plan and billing period.
export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return bad("Payments aren't switched on yet.", 503);
  const { user, error } = await requireUser(request, env); if (error) return error;
  let body; try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const plan = String((body && body.plan) || ""), interval = String((body && body.interval) || "");
  const price = plans(env).PRICES[plan]?.[interval];
  if (!price) return bad("Unknown plan.");
  const current = await planFor(env, user.id);
  if (current.hasSubscription) return bad(`You already have the ${current.plan === "pro" ? "Pro" : "Host"} plan. Use "Manage subscription" to change it.`, 409);
  const origin = siteOrigin(request, env);
  // 7-day free trial, once per account: only for accounts that have never had a paid plan or trial.
  // The card is taken at checkout and first charged when the trial ends, unless they cancel before.
  const before = !(await trialAvailable(env, user.id));
  try {
    const session = await stripePost(env, "checkout/sessions", {
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      managed_payments: { enabled: true },
      branding_settings: { display_name: "Mint Statements" }, // the name shown at the top of the checkout page
      client_reference_id: user.id,
      customer_email: user.email,
      subscription_data: { billing_mode: { type: "flexible" }, metadata: { app: "ownermint", plan, user_id: user.id }, ...(before ? {} : { trial_period_days: TRIAL_DAYS }) },
      metadata: { app: "ownermint", plan, interval, user_id: user.id },
      success_url: `${origin}/app?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (e) {
    return bad("Couldn't start checkout. Please try again in a minute.", 502);
  }
}
