import { json, bad, randomId } from "../../_lib.js";
import { stripeGet, licenseForSession, ACTIVE } from "../../_billing.js";
// Called when Stripe sends the buyer back with ?checkout={CHECKOUT_SESSION_ID}. Verifies the session with Stripe
// and returns the license key. The webhook may already have created it; either way the same key comes back.
export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return bad("Payments aren't switched on yet.", 503);
  let body; try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const sid = String((body && body.session_id) || "");
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) return bad("That checkout reference isn't valid.");
  const existing = await env.DB.prepare("SELECT key, plan, status FROM licenses WHERE session_id = ?").bind(sid).first();
  if (existing) return json({ key: existing.key, plan: existing.plan, status: existing.status, active: ACTIVE.includes(existing.status) });
  let session;
  try { session = await stripeGet(env, `checkout/sessions/${sid}?expand[]=subscription`); }
  catch (e) { return bad(e.status === 404 ? "We couldn't find that checkout." : "Couldn't reach Stripe to confirm your payment. Please reload this page in a minute.", e.status === 404 ? 404 : 502); }
  let r;
  try { r = await licenseForSession(env, session, () => "om_" + randomId(28)); }
  catch { return bad("Couldn't reach Stripe to confirm your payment. Please reload this page in a minute.", 502); }
  if (r.error) return bad(r.error, r.status);
  return json({ key: r.key, plan: r.plan, status: r.status, active: ACTIVE.includes(r.status) }, r.created ? 201 : 200);
}
