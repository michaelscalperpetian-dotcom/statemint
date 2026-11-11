import { json, bad, randomId } from "../../_lib.js";
import { verifySignature, refreshSubscription, licenseForSession, stripeGet } from "../../_billing.js";
// Stripe → Mint Statements events. Every event is verified with the endpoint's signing secret, then our records are
// refreshed from Stripe's current state (so out-of-order or repeated deliveries are harmless).
// A non-2xx reply makes Stripe retry, so we only return 500 when Stripe itself couldn't be reached.
export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) return bad("Webhook not configured", 503);
  const payload = await request.text();
  if (!(await verifySignature(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) return bad("Invalid signature", 400);
  let event; try { event = JSON.parse(payload); } catch { return bad("Invalid JSON"); }
  const obj = (event.data && event.data.object) || {};
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.mode === "subscription" && obj.status === "complete") {
          const session = await stripeGet(env, `checkout/sessions/${encodeURIComponent(obj.id)}?expand[]=subscription`);
          await licenseForSession(env, session, () => "om_" + randomId(28));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await refreshSubscription(env, obj.id); break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const sub = obj.subscription || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription);
        if (sub) await refreshSubscription(env, typeof sub === "object" ? sub.id : sub);
        break;
      }
      default: break; // other events are acknowledged and ignored
    }
  } catch (e) {
    return json({ error: "Couldn't reach Stripe; please retry." }, 500);
  }
  return json({ received: true });
}
