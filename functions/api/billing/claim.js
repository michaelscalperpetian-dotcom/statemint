import { json, bad, randomId } from "../../_lib.js";
import { stripeGet, licenseForSession, ACTIVE } from "../../_billing.js";
import { requireUser } from "../../_auth.js";
// Called when Stripe sends the buyer back with ?checkout={CHECKOUT_SESSION_ID}. Verifies the session with Stripe and
// confirms the plan is on the signed-in account. The webhook may already have recorded it; either way works.
export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) return bad("Payments aren't switched on yet.", 503);
  const { user, error } = await requireUser(request, env); if (error) return error;
  let body; try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const sid = String((body && body.session_id) || "");
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) return bad("That checkout reference isn't valid.");
  let row = await env.DB.prepare("SELECT plan, status, user_id FROM licenses WHERE session_id = ?").bind(sid).first();
  if (!row) {
    let session;
    try { session = await stripeGet(env, `checkout/sessions/${sid}?expand[]=subscription`); }
    catch (e) { return bad(e.status === 404 ? "We couldn't find that checkout." : "Couldn't reach Stripe to confirm your payment. Please reload this page in a minute.", e.status === 404 ? 404 : 502); }
    let r;
    try { r = await licenseForSession(env, session, () => "om_" + randomId(28)); }
    catch { return bad("Couldn't reach Stripe to confirm your payment. Please reload this page in a minute.", 502); }
    if (r.error) return bad(r.error, r.status);
    row = r;
  }
  if (row.user_id !== user.id) return bad("This purchase was made from a different Ownermint account. Sign in with the Google account you used at checkout.", 403);
  return json({ plan: row.plan, status: row.status, active: ACTIVE.includes(row.status) });
}
