import { json } from "../../_lib.js";
import { plans } from "../../_billing.js";
// Checkout is offered only when the server can create and verify payments.
export async function onRequestGet({ env }) {
  const { PORTAL_LOGIN } = plans(env);
  const enabled = !!env.STRIPE_SECRET_KEY;
  return json({ enabled, portalLogin: enabled ? PORTAL_LOGIN : null });
}
