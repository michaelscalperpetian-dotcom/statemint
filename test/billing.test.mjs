// Billing API tests against a local dev server that uses the fake Stripe (see .dev.vars / test/fake-stripe.mjs).
// Run: npx wrangler pages dev public --port 8790   then   node test/billing.test.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { start, state } from "./fake-stripe.mjs";
const BASE = process.env.BASE || "http://localhost:8790";
execSync(`npx wrangler d1 execute statemint --local --command "DELETE FROM licenses WHERE session_id LIKE 'cs_test_%'"`, { stdio: "ignore" }); // fresh local state
const server = start(8799);
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: JSON.stringify(body) });
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };
try {
  await ok("config: checkout enabled with 4 links", async () => { const c = await (await fetch(BASE + "/api/billing/config")).json(); assert.equal(c.enabled, true); assert.match(c.links.host.month, /^https:\/\/buy\.stripe\.com\//); assert.ok(c.links.pro.year); });
  await ok("claim: malformed id -> 400", async () => assert.equal((await post("/api/billing/claim", { session_id: "hello" })).status, 400));
  await ok("claim: unknown session -> 404", async () => assert.equal((await post("/api/billing/claim", { session_id: "cs_test_doesnotexist1" })).status, 404));
  await ok("claim: unpaid session -> 409, no key", async () => { const r = await post("/api/billing/claim", { session_id: "cs_test_unpaid12345" }); assert.equal(r.status, 409); assert.equal((await r.json()).key, undefined); });
  let key;
  await ok("claim: paid Host session -> license key, plan host, active", async () => { const r = await post("/api/billing/claim", { session_id: "cs_test_paidhost1234" }); assert.equal(r.status, 201); const d = await r.json(); key = d.key; assert.match(key, /^om_[A-Za-z0-9]{28}$/); assert.deepEqual([d.plan, d.active], ["host", true]); });
  await ok("claim: same session again returns the same key", async () => { const d = await (await post("/api/billing/claim", { session_id: "cs_test_paidhost1234" })).json(); assert.equal(d.key, key); });
  await ok("license: wrong key -> 404", async () => { assert.equal((await post("/api/billing/license", { key: "om_" + "x".repeat(28) })).status, 404); assert.equal((await post("/api/billing/license", { key: "nope" })).status, 404); });
  await ok("license: valid key -> host, active", async () => { const d = await (await post("/api/billing/license", { key })).json(); assert.deepEqual([d.plan, d.status, d.active], ["host", "active", true]); });
  await ok("license: cancelled subscription is picked up on the next re-check -> inactive", async () => {
    state.subStatus = "canceled";
    execSync(`npx wrangler d1 execute statemint --local --command "UPDATE licenses SET checked_at = 0 WHERE key = '${key}'"`, { stdio: "ignore" });
    const d = await (await post("/api/billing/license", { key })).json(); assert.deepEqual([d.status, d.active], ["canceled", false]); });
  await ok("license: past_due keeps access while Stripe retries the card", async () => {
    state.subStatus = "past_due";
    execSync(`npx wrangler d1 execute statemint --local --command "UPDATE licenses SET checked_at = 0 WHERE key = '${key}'"`, { stdio: "ignore" });
    const d = await (await post("/api/billing/license", { key })).json(); assert.deepEqual([d.status, d.active], ["past_due", true]); state.subStatus = "active"; });
  console.log(`\n${n} billing checks passed`);
} finally { server.close(); }
