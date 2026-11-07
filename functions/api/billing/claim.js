import { json, bad, randomId } from "../../_lib.js";
import { stripeGet, planOf, ACTIVE } from "../../_billing.js";
// Called when Stripe sends the buyer back with ?checkout={CHECKOUT_SESSION_ID}. Verifies the session with Stripe
// and returns a license key. Claiming the same session again returns the same key.
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
  const sub = session.subscription;
  if (session.status !== "complete" || session.mode !== "subscription" || !sub || typeof sub !== "object") return bad("This checkout isn't complete yet.", 409);
  const plan = planOf(sub);
  if (!plan) return bad("This checkout isn't for an Ownermint plan.", 400);
  const key = "om_" + randomId(28), now = Date.now();
  await env.DB.prepare("INSERT INTO licenses (key, session_id, subscription_id, plan, status, created_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(key, sid, sub.id, plan, sub.status, now, now).run();
  return json({ key, plan, status: sub.status, active: ACTIVE.includes(sub.status) }, 201);
}
