// API tests against a running server: BASE=http://localhost:8790 node test/api.test.mjs
import assert from "node:assert/strict";
import { parseCSV, toTransactions, buildStatement, SAMPLE_CSV } from "../public/js/engine.js";
const BASE = process.env.BASE || "http://localhost:8790";
const st = buildStatement(toTransactions(parseCSV(SAMPLE_CSV)).transactions, { listing: "Lakeview Cabin", month: "2026-10", settings: {} });
const post = body => fetch(BASE + "/api/statements", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let created;
await ok("invalid JSON -> 400", async () => assert.equal((await post("{nope")).status, 400));
await ok("missing statement -> 400", async () => assert.equal((await post({ brand: {} })).status, 400));
await ok("oversize body -> 413", async () => assert.equal((await post({ statement: st, note: "x".repeat(260000) })).status, 413));
await ok("valid statement -> 201 with id + editKey", async () => {
  const r = await post({ statement: { ...st, evil: "<script>", totals: { ...st.totals, injected: 1 } }, brand: { company: "Co", ownerName: "Pat", logo: PNG, extra: "x" }, note: "n".repeat(900), previous: { ownerNet: 5, nights: 2, month: "2026-09", junk: 1 } });
  assert.equal(r.status, 201); created = await r.json(); assert.match(created.id, /^[A-Za-z0-9]{12}$/); assert.match(created.editKey, /^[A-Za-z0-9]{24}$/); });
await ok("stored data is whitelisted: unknown keys dropped, note capped at 600, PNG logo kept", async () => {
  const d = await (await fetch(`${BASE}/api/statements/${created.id}`)).json();
  assert.equal(d.statement.evil, undefined); assert.equal(d.statement.totals.injected, undefined); assert.equal(d.brand.extra, undefined); assert.equal(d.previous.junk, undefined);
  assert.equal(d.note.length, 600); assert.equal(d.brand.logo, PNG); assert.equal(d.statement.totals.ownerNet, st.totals.ownerNet); assert.equal(d.statement.lines.length, st.lines.length);
  assert.ok(d.createdAt > 0); });
await ok("external / svg / javascript logos are dropped", async () => {
  for (const logo of ["https://tracker.example/pixel.png", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "javascript:alert(1)"]) {
    const r = await post({ statement: st, brand: { logo } }); const { id, editKey } = await r.json();
    assert.equal((await (await fetch(`${BASE}/api/statements/${id}`)).json()).brand.logo, "");
    await fetch(`${BASE}/api/statements/${id}`, { method: "DELETE", headers: { "x-edit-key": editKey } }); } });
await ok("API responses are noindex + no-store", async () => { const r = await fetch(`${BASE}/api/statements/${created.id}`); assert.equal(r.headers.get("x-robots-tag"), "noindex"); assert.equal(r.headers.get("cache-control"), "no-store"); });
await ok("bad id -> 404", async () => { assert.equal((await fetch(`${BASE}/api/statements/..%2F..%2Fetc`)).status, 404); assert.equal((await fetch(`${BASE}/api/statements/short`)).status, 404); assert.equal((await fetch(`${BASE}/api/statements/AAAAAAAAAAAA`)).status, 404); });
await ok("delete with wrong / missing key -> 403, statement still there", async () => {
  assert.equal((await fetch(`${BASE}/api/statements/${created.id}`, { method: "DELETE" })).status, 403);
  assert.equal((await fetch(`${BASE}/api/statements/${created.id}`, { method: "DELETE", headers: { "x-edit-key": "x".repeat(24) } })).status, 403);
  assert.equal((await fetch(`${BASE}/api/statements/${created.id}`)).status, 200); });
await ok("delete with key -> gone (404 afterwards)", async () => {
  assert.equal((await fetch(`${BASE}/api/statements/${created.id}`, { method: "DELETE", headers: { "x-edit-key": created.editKey } })).status, 200);
  assert.equal((await fetch(`${BASE}/api/statements/${created.id}`)).status, 404); });
if (process.env.RATE) await ok("rate limit: 31st link in an hour from one IP -> 429", async () => {
  let last; for (let i = 0; i < 31; i++) last = (await post({ statement: st })).status; assert.equal(last, 429); });
console.log(`\n${n} API checks passed against ${BASE}`);
