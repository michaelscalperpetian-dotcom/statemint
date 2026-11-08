import { json } from "../_lib.js";
import { requireUser, planFor } from "../_auth.js";
// The signed-in user and their plan.
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  const p = await planFor(env, user.id);
  return json({ user: { email: user.email, name: user.name }, plan: p.plan, subscriptionStatus: p.status, hasSubscription: p.hasSubscription, canManageBilling: !!p.customerId });
}
