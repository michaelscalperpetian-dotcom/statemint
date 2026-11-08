// Signs a browser context in through the fake Google (test/fake-stripe.mjs must be running on 8799).
import { execSync } from "node:child_process";
export const uniqueEmail = (tag = "host") => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
export async function signIn(ctx, base, email = uniqueEmail()) {
  const p = await ctx.newPage();
  await p.goto(`${base}/api/auth/login?login_hint=${encodeURIComponent(email)}&next=/api/me`, { waitUntil: "load" });
  const r = await p.request.get(base + "/api/me"); if (!r.ok()) throw new Error("test sign-in failed");
  await p.close(); return email;
}
// The user id for an email in the local D1 (for tying fake checkouts to an account).
export function userIdFor(email) {
  const out = execSync(`npx wrangler d1 execute statemint --local --json --command "SELECT id FROM users WHERE email = '${email.replace(/'/g, "")}'"`, { encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results[0].id;
}
// The same sign-in without a browser: returns a Cookie header value for fetch().
export async function apiSignIn(base, email = uniqueEmail()) {
  const jar = {};
  const keep = r => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar[kv.slice(0, i)] = kv.slice(i + 1); } };
  const header = () => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
  let r = await fetch(`${base}/api/auth/login?login_hint=${encodeURIComponent(email)}`, { redirect: "manual", headers: { connection: "close" } }); keep(r);
  r = await fetch(r.headers.get("location"), { redirect: "manual", headers: { connection: "close" } });                       // fake Google
  r = await fetch(r.headers.get("location"), { redirect: "manual", headers: { cookie: header(), connection: "close" } }); keep(r); // our callback
  if (!jar.om_session) throw new Error("test sign-in failed: " + r.status);
  return { cookie: `om_session=${jar.om_session}`, email };
}
