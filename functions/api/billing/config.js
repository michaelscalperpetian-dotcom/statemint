import { json } from "../../_lib.js";
import { LINKS } from "../../_billing.js";
// Checkout is only offered once the server can verify payments (STRIPE_SECRET_KEY is set).
export async function onRequestGet({ env }) {
  const enabled = !!env.STRIPE_SECRET_KEY;
  return json({ enabled, links: enabled ? LINKS : {} });
}
