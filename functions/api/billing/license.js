import { json, bad } from "../../_lib.js";
import { stripeGet, planOf, ACTIVE } from "../../_billing.js";
const RECHECK_MS = 6 * 3600 * 1000;
// Returns the current plan for a license key, re-checking the subscription with Stripe at most every 6 hours.
export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return bad("Invalid JSON"); }
  const key = String((body && body.key) || "").trim();
  if (!/^om_[A-Za-z0-9]{28}$/.test(key)) return bad("That doesn't look like an Ownermint license key.", 404);
  const row = await env.DB.prepare("SELECT subscription_id, plan, status, checked_at FROM licenses WHERE key = ?").bind(key).first();
  if (!row) return bad("License key not found.", 404);
  let { plan, status } = row;
  if (env.STRIPE_SECRET_KEY && Date.now() - row.checked_at > RECHECK_MS) {
    try {
      const sub = await stripeGet(env, `subscriptions/${row.subscription_id}`);
      status = sub.status; plan = planOf(sub) || plan;
      await env.DB.prepare("UPDATE licenses SET plan = ?, status = ?, checked_at = ? WHERE key = ?").bind(plan, status, Date.now(), key).run();
    } catch { /* Stripe unreachable: answer from the last known status */ }
  }
  return json({ plan, status, active: ACTIVE.includes(status) });
}
