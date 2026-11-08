// Says whether Google sign-in is configured in this deployment (never reveals the values).
export function onRequestGet({ env }) {
  return new Response(JSON.stringify({ clientId: !!env.GOOGLE_CLIENT_ID, clientSecret: !!env.GOOGLE_CLIENT_SECRET }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
