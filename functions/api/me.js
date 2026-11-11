import { json } from "../_lib.js";
import { requireUser, planFor } from "../_auth.js";
// The signed-in user and their plan.
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env); if (error) return error;
  const p = await planFor(env, user.id);
  // trialAvailable: the account has never had a paid plan or trial, so checkout includes the 7-day free trial
  return json({ user: { email: user.email }, plan: p.plan, subscriptionStatus: p.status, hasSubscription: p.hasSubscription, canManageBilling: !!p.customerId, trialAvailable: !p.status });
}
