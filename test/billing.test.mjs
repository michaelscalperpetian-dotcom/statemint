// Billing API tests against a local dev server that uses the fake Stripe (.dev.vars + test/fake-stripe.mjs).
// Run: npx wrangler pages dev public --port 8790   then   node test/billing.test.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { start, state } from "./fake-stripe.mjs";
import { verifySignature, encodeForm } from "../functions/_billing.js";
const BASE = process.env.BASE || "http://localhost:8790", WHSEC = "whsec_test_secret";
execSync(`npx wrangler d1 execute statemint --local --command "DELETE FROM licenses WHERE session_id LIKE 'cs_test_%'"`, { stdio: "ignore" });
const server = start(8799);
const post = (path, body, headers = {}) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", connection: "close", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const sign = (payload, t = Math.floor(Date.now() / 1000), secret = WHSEC) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
const hook = (event, sig) => { const p = JSON.stringify(event); return post("/api/billing/webhook", p, { "stripe-signature": sig ?? sign(p) }); };
const db = sql => { const out = execSync(`npx wrangler d1 execute statemint --local --json --command "${sql}"`, { encoding: "utf8" }); return JSON.parse(out.slice(out.indexOf("["))).at(0).results; };
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };
try {
  // unit: signature + form encoding
  await ok("signature: valid accepted; wrong secret, tampered body, stale timestamp rejected", async () => {
    const p = '{"a":1}', t = 1700000000;
    assert.equal(await verifySignature(p, sign(p, t), WHSEC, 300, t), true);
    assert.equal(await verifySignature(p, sign(p, t, "whsec_other"), WHSEC, 300, t), false);
    assert.equal(await verifySignature('{"a":2}', sign(p, t), WHSEC, 300, t), false);
    assert.equal(await verifySignature(p, sign(p, t), WHSEC, 300, t + 301), false);
    assert.equal(await verifySignature(p, "garbage", WHSEC, 300, t), false); });
  await ok("form encoding matches Stripe's nested format", async () => assert.equal(encodeForm({ a: { b: [{ c: 1 }] }, x: "y z" }), "a%5Bb%5D%5B0%5D%5Bc%5D=1&x=y%20z"));
  await ok("config: checkout enabled", async () => assert.equal((await (await fetch(BASE + "/api/billing/config")).json()).enabled, true));
  await ok("checkout: unknown plan -> 400", async () => assert.equal((await post("/api/billing/checkout", { plan: "gold", interval: "month" })).status, 400));
  await ok("checkout: Pro yearly -> Stripe URL; sends Managed Payments, flexible billing, the server's price, success/cancel URLs", async () => {
    const r = await post("/api/billing/checkout", { plan: "pro", interval: "year", price: "price_attacker" }); assert.equal(r.status, 200);
    assert.match((await r.json()).url, /^https:\/\/checkout\.stripe\.com\//);
    const f = state.lastCheckout;
    assert.equal(f["line_items[0][price]"], "price_test_pro_year"); assert.equal(f["managed_payments[enabled]"], "true");
    assert.equal(f["subscription_data[billing_mode][type]"], "flexible"); assert.equal(f.mode, "subscription");
    assert.match(f.success_url, /\/app\?checkout=\{CHECKOUT_SESSION_ID\}$/); assert.match(f.cancel_url, /\/app\?checkout=cancelled$/); });
  await ok("webhook: missing or forged signature -> 400, nothing recorded", async () => {
    assert.equal((await hook({ type: "checkout.session.completed", data: { object: { id: "cs_test_paidhost1234", mode: "subscription", status: "complete" } } }, "")).status, 400);
    assert.equal((await hook({ type: "checkout.session.completed", data: { object: { id: "cs_test_paidhost1234", mode: "subscription", status: "complete" } } }, sign("{}"))).status, 400);
    assert.equal(db("SELECT COUNT(*) AS c FROM licenses WHERE session_id = 'cs_test_paidhost1234'")[0].c, 0); });
  let key;
  await ok("webhook: checkout.session.completed creates the license (customer stored) even if the buyer never returns", async () => {
    assert.equal((await hook({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_test_paidhost1234", mode: "subscription", status: "complete" } } })).status, 200);
    const row = db("SELECT key, plan, status, customer_id FROM licenses WHERE session_id = 'cs_test_paidhost1234'")[0];
    assert.deepEqual([row.plan, row.status, row.customer_id], ["host", "active", "cus_test_1"]); key = row.key; });
  await ok("claim after webhook returns the same key (and repeating the webhook doesn't create a second one)", async () => {
    await hook({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_test_paidhost1234", mode: "subscription", status: "complete" } } });
    const d = await (await post("/api/billing/claim", { session_id: "cs_test_paidhost1234" })).json(); assert.equal(d.key, key);
    assert.equal(db("SELECT COUNT(*) AS c FROM licenses WHERE session_id = 'cs_test_paidhost1234'")[0].c, 1); });
  await ok("claim: malformed / unknown / unpaid -> 400 / 404 / 409", async () => {
    assert.equal((await post("/api/billing/claim", { session_id: "hello" })).status, 400);
    assert.equal((await post("/api/billing/claim", { session_id: "cs_test_doesnotexist1" })).status, 404);
    assert.equal((await post("/api/billing/claim", { session_id: "cs_test_unpaid12345" })).status, 409); });
  await ok("webhook: upgrade to Pro in the portal (subscription.updated) switches the license to Pro immediately", async () => {
    state.subPrice = "price_test_pro_month";
    assert.equal((await hook({ type: "customer.subscription.updated", data: { object: { id: "sub_test_1", status: "active" } } })).status, 200);
    const d = await (await post("/api/billing/license", { key })).json(); assert.deepEqual([d.plan, d.active], ["pro", true]); });
  await ok("webhook: invoice.payment_failed (new invoice shape) -> past_due, access kept while Stripe retries", async () => {
    state.subStatus = "past_due";
    await hook({ type: "invoice.payment_failed", data: { object: { id: "in_1", parent: { subscription_details: { subscription: "sub_test_1" } } } } });
    const d = await (await post("/api/billing/license", { key })).json(); assert.deepEqual([d.status, d.active], ["past_due", true]); });
  await ok("webhook: subscription.deleted -> canceled, paid features off", async () => {
    state.subStatus = "canceled";
    await hook({ type: "customer.subscription.deleted", data: { object: { id: "sub_test_1", status: "canceled" } } });
    const d = await (await post("/api/billing/license", { key })).json(); assert.deepEqual([d.status, d.active], ["canceled", false]); });
  await ok("webhook: unrelated event types are acknowledged (200) and ignored", async () => assert.equal((await hook({ type: "customer.created", data: { object: {} } })).status, 200));
  await ok("portal: valid key -> Stripe billing page for that customer with our configuration; bad key -> 404", async () => {
    const r = await post("/api/billing/portal", { key }); assert.equal(r.status, 200); assert.match((await r.json()).url, /^https:\/\/billing\.stripe\.com\//);
    assert.deepEqual([state.lastPortal.customer, state.lastPortal.configuration], ["cus_test_1", "bpc_test"]); assert.match(state.lastPortal.return_url, /\/app$/);
    assert.equal((await post("/api/billing/portal", { key: "om_" + "x".repeat(28) })).status, 404); });
  await ok("license: wrong key -> 404", async () => { assert.equal((await post("/api/billing/license", { key: "om_" + "x".repeat(28) })).status, 404); assert.equal((await post("/api/billing/license", { key: "nope" })).status, 404); });
  console.log(`\n${n} billing checks passed`);
} finally { server.close(); state.subStatus = "active"; state.subPrice = "price_test_host_month"; }
