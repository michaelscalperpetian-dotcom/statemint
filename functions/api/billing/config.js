import { json } from "../../_lib.js";
import { plans } from "../../_billing.js";
// Checkout is only offered once the server can verify payments (STRIPE_SECRET_KEY is set) and plan links exist.
export async function onRequestGet({ env }) {
  const { LINKS } = plans(env);
  const enabled = !!(env.STRIPE_SECRET_KEY && LINKS.host && LINKS.pro);
  return json({ enabled, links: enabled ? LINKS : {} });
}
