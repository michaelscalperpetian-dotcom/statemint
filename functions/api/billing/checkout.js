import { json, bad } from "../../_lib.js";
import { plans, stripePost, SITE } from "../../_billing.js";
import { requireUser, planFor } from "../../_auth.js";
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
  const origin = env.TEST_BILLING === "1" ? new URL(request.url).origin : SITE;
  try {
    const session = await stripePost(env, "checkout/sessions", {
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      managed_payments: { enabled: true },
      client_reference_id: user.id,
      customer_email: user.email,
      subscription_data: { billing_mode: { type: "flexible" }, metadata: { app: "ownermint", plan, user_id: user.id } },
      metadata: { app: "ownermint", plan, interval, user_id: user.id },
      success_url: `${origin}/app?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (e) {
    return bad("Couldn't start checkout. Please try again in a minute.", 502);
  }
}
