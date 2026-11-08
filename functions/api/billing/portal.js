import { json, bad } from "../../_lib.js";
import { plans, stripeGet, stripePost, SITE } from "../../_billing.js";
// Opens the Stripe customer portal (change plan, cancel, update card, invoices) for the holder of a license key.
export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return bad("Payments aren't switched on yet.", 503);
  let body; try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const key = String((body && body.key) || "").trim();
  if (!/^om_[A-Za-z0-9]{28}$/.test(key)) return bad("License key not found.", 404);
  const row = await env.DB.prepare("SELECT subscription_id, customer_id FROM licenses WHERE key = ?").bind(key).first();
  if (!row) return bad("License key not found.", 404);
  try {
    let customer = row.customer_id;
    if (!customer) { // licenses created before customer ids were stored
      const sub = await stripeGet(env, `subscriptions/${encodeURIComponent(row.subscription_id)}`);
      customer = typeof sub.customer === "object" ? sub.customer.id : sub.customer;
      await env.DB.prepare("UPDATE licenses SET customer_id = ? WHERE key = ?").bind(customer, key).run();
    }
    const origin = env.TEST_BILLING === "1" ? new URL(request.url).origin : SITE;
    const s = await stripePost(env, "billing_portal/sessions", { customer, configuration: plans(env).PORTAL_CONFIG, return_url: `${origin}/app` });
    return json({ url: s.url });
  } catch { return bad("Couldn't open the billing page. Please try again in a minute.", 502); }
}
