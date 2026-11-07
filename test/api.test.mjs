// API tests against a running server (with .dev.vars pointing at the fakes): BASE=http://localhost:8790 node test/api.test.mjs
import assert from "node:assert/strict";
import { parseCSV, toTransactions, buildStatement, SAMPLE_CSV } from "../public/js/engine.js";
import { start } from "./fake-stripe.mjs";
import { apiSignIn, uniqueEmail } from "./signin.mjs";
const BASE = process.env.BASE || "http://localhost:8790";
const fake = start(8799);
const st = buildStatement(toTransactions(parseCSV(SAMPLE_CSV)).transactions, { listing: "Lakeview Cabin", month: "2026-10", settings: {} });
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
try {
  const host = await apiSignIn(BASE, uniqueEmail("host")), owner = await apiSignIn(BASE, uniqueEmail("owner")), stranger = await apiSignIn(BASE, uniqueEmail("stranger"));
  const req = (who, path, opts = {}) => fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}), ...(opts.headers || {}) } });
  const post = (body, who = host) => req(who, "/api/statements", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
  const get = (id, who) => req(who, `/api/statements/${id}`);
  const withEmail = (b = {}) => ({ statement: st, ownerEmail: owner.email, ...b });

  /* ---------- sign-in ---------- */
  await ok("signed out: /api/me 401; /app and /dashboard redirect to sign-in (keeping where you were going)", async () => {
    assert.equal((await fetch(BASE + "/api/me")).status, 401);
    const r = await fetch(BASE + "/app?checkout=cancelled", { redirect: "manual" }); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/login?next=%2Fapp%3Fcheckout%3Dcancelled");
    assert.equal((await fetch(BASE + "/dashboard", { redirect: "manual" })).headers.get("location"), "/login?next=%2Fdashboard");
    assert.equal((await fetch(BASE + "/", { redirect: "manual" })).status, 200); });
  await ok("signed in: /api/me returns the Google email and the Free plan", async () => {
    const d = await (await req(host, "/api/me")).json(); assert.deepEqual([d.user.email, d.plan, d.hasSubscription], [host.email, "free", false]); });
  await ok("sign-in: a forged state, or an unverified Google email, is refused; no open redirect after sign-in", async () => {
    const r1 = await fetch(BASE + "/api/auth/callback?code=x&state=forged", { redirect: "manual", headers: { cookie: "om_oauth=real.verifier.Lw" } }); assert.equal(r1.status, 400);
    await assert.rejects(apiSignIn(BASE, "unverified-" + uniqueEmail()));
    const r2 = await fetch(BASE + "/api/auth/login?next=" + encodeURIComponent("//evil.example/x"), { redirect: "manual" });
    const cookie = r2.headers.getSetCookie()[0]; const next = atob(decodeURIComponent(cookie.split(";")[0].split("=")[1]).split(".")[2]); assert.equal(next, "/dashboard"); });
  await ok("session cookie is HttpOnly, Secure, SameSite=Lax; a made-up session is signed out", async () => {
    const r = await fetch(`${BASE}/api/auth/login?login_hint=x@example.com`, { redirect: "manual" });
    assert.match(r.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await req({ cookie: "om_session=madeup" }, "/api/me")).status, 401); });

  /* ---------- owner links ---------- */
  let created;
  await ok("owner link: signed out -> 401; invalid JSON 400; missing statement 400; no owner email 400; oversize 413", async () => {
    assert.equal((await post({ ...withEmail() }, null)).status, 401);
    assert.equal((await post("{nope")).status, 400);
    assert.equal((await post({ brand: {}, ownerEmail: owner.email })).status, 400);
    assert.equal((await post({ statement: st })).status, 400);
    assert.equal((await post({ statement: st, ownerEmail: "not-an-email" })).status, 400);
    assert.equal((await post(withEmail({ note: "x".repeat(260000) }))).status, 413); });
  await ok("owner link: cross-site POST is blocked", async () => assert.equal((await req(host, "/api/statements", { method: "POST", body: JSON.stringify(withEmail()), headers: { origin: "https://evil.example" } })).status, 403));
  await ok("valid statement -> 201 with id, editKey and the owner's email (lower-cased)", async () => {
    const r = await post(withEmail({ ownerEmail: owner.email.toUpperCase(), statement: { ...st, evil: "<script>", totals: { ...st.totals, injected: 1 } }, brand: { company: "Co", ownerName: "Pat", logo: PNG, extra: "x" }, note: "n".repeat(900), previous: { ownerNet: 5, nights: 2, month: "2026-09", junk: 1 } }));
    assert.equal(r.status, 201); created = await r.json(); assert.match(created.id, /^[A-Za-z0-9]{12}$/); assert.match(created.editKey, /^[A-Za-z0-9]{24}$/); assert.equal(created.ownerEmail, owner.email); });
  await ok("opening a link: signed out 401, someone else 403 (told who they're signed in as), the owner and the host 200", async () => {
    assert.equal((await get(created.id, null)).status, 401);
    const r = await get(created.id, stranger); assert.equal(r.status, 403); assert.equal((await r.json()).signedInAs, stranger.email);
    const o = await (await get(created.id, owner)).json(); assert.equal(o.isCreator, false); assert.equal(o.sharedWith, owner.email);
    assert.equal((await (await get(created.id, host)).json()).isCreator, true); });
  await ok("stored data is whitelisted: unknown keys dropped, note capped at 600, PNG logo kept", async () => {
    const d = await (await get(created.id, owner)).json();
    assert.equal(d.statement.evil, undefined); assert.equal(d.statement.totals.injected, undefined); assert.equal(d.brand.extra, undefined); assert.equal(d.previous.junk, undefined);
    assert.equal(d.note.length, 600); assert.equal(d.brand.logo, PNG); assert.equal(d.statement.totals.ownerNet, st.totals.ownerNet); assert.equal(d.statement.lines.length, st.lines.length);
    assert.ok(d.createdAt > 0); });
  await ok("external / svg / javascript logos are dropped", async () => {
    for (const logo of ["https://tracker.example/pixel.png", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "javascript:alert(1)"]) {
      const { id } = await (await post(withEmail({ brand: { logo } }))).json();
      assert.equal((await (await get(id, host)).json()).brand.logo, "");
      await req(host, `/api/statements/${id}`, { method: "DELETE" }); } });
  await ok("the host's link list shows property, month, owner, views (the owner's visit counted, the host's not)", async () => {
    const { links } = await (await req(host, "/api/statements")).json(); const l = links.find(x => x.id === created.id);
    assert.deepEqual([l.listing, l.month, l.ownerEmail, l.ownerNet], ["Lakeview Cabin", "2026-10", owner.email, st.totals.ownerNet]); assert.equal(l.views, 2);
    assert.equal((await (await req(owner, "/api/statements")).json()).links.length, 0); assert.equal((await req(null, "/api/statements")).status, 401); });
  await ok("API responses are noindex + no-store", async () => { const r = await get(created.id, host); assert.equal(r.headers.get("x-robots-tag"), "noindex"); assert.equal(r.headers.get("cache-control"), "no-store"); });
  await ok("bad id -> 404", async () => { assert.equal((await get("..%2F..%2Fetc", host)).status, 404); assert.equal((await get("short", host)).status, 404); assert.equal((await get("AAAAAAAAAAAA", host)).status, 404); });
  await ok("delete: the owner, a stranger, a wrong key -> 403; statement still there", async () => {
    for (const who of [owner, stranger, null]) assert.equal((await req(who, `/api/statements/${created.id}`, { method: "DELETE" })).status, 403);
    assert.equal((await req(null, `/api/statements/${created.id}`, { method: "DELETE", headers: { "x-edit-key": "x".repeat(24) } })).status, 403);
    assert.equal((await get(created.id, owner)).status, 200); });
  await ok("delete by the host (signed in) -> gone; the edit key also still works for a link", async () => {
    assert.equal((await req(host, `/api/statements/${created.id}`, { method: "DELETE" })).status, 200); assert.equal((await get(created.id, owner)).status, 404);
    const b = await (await post(withEmail())).json();
    assert.equal((await req(null, `/api/statements/${b.id}`, { method: "DELETE", headers: { "x-edit-key": b.editKey } })).status, 200); });

  /* ---------- synced data ---------- */
  await ok("data: signed out 401; save, read back, remove a key; other accounts can't see it", async () => {
    assert.equal((await req(null, "/api/data")).status, 401);
    const put = items => req(host, "/api/data", { method: "PUT", body: JSON.stringify({ items }) });
    assert.equal((await put({ brand: JSON.stringify({ company: "Lakeside" }), "settings:Lakeview Cabin": JSON.stringify({ commissionPct: 18 }) })).status, 200);
    let d = await (await req(host, "/api/data")).json(); assert.equal(JSON.parse(d.items.brand).company, "Lakeside");
    await put({ brand: null }); d = await (await req(host, "/api/data")).json(); assert.equal(d.items.brand, undefined); assert.ok(d.items["settings:Lakeview Cabin"]);
    assert.deepEqual((await (await req(stranger, "/api/data")).json()).items, {}); });
  await ok("data: values too big, too many keys, non-string values and cross-site writes are refused", async () => {
    const put = (items, headers) => req(host, "/api/data", { method: "PUT", body: JSON.stringify({ items }), headers });
    assert.equal((await put({ big: "x".repeat(1900001) })).status, 413);
    assert.equal((await put(Object.fromEntries(Array.from({ length: 501 }, (_, i) => ["k" + i, "1"])))).status, 400);
    assert.equal((await put({ brand: 5 })).status, 400);
    assert.equal((await put({ brand: '"x"' }, { origin: "https://evil.example" })).status, 403); });
  await ok("data: DELETE clears everything for this account only", async () => {
    await req(stranger, "/api/data", { method: "PUT", body: JSON.stringify({ items: { brand: "{}" } }) });
    assert.equal((await req(host, "/api/data", { method: "DELETE" })).status, 200);
    assert.deepEqual((await (await req(host, "/api/data")).json()).items, {}); assert.ok((await (await req(stranger, "/api/data")).json()).items.brand); });

  /* ---------- account ---------- */
  await ok("delete account (no subscription): data, links and sessions are removed and the cookie no longer works", async () => {
    const link = await (await post(withEmail({ ownerEmail: host.email }), stranger)).json();
    assert.equal((await req(stranger, "/api/account", { method: "DELETE", headers: { origin: "https://evil.example" } })).status, 403);
    const r = await req(stranger, "/api/account", { method: "DELETE" }); assert.equal(r.status, 200); assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await req(stranger, "/api/me")).status, 401); assert.equal((await get(link.id, host)).status, 404); });
  await ok("sign out ends the session", async () => {
    assert.equal((await req(owner, "/api/auth/logout", { method: "POST" })).status, 200); assert.equal((await req(owner, "/api/me")).status, 401); });
  if (process.env.RATE) await ok("rate limit: 31st link in an hour from one IP -> 429", async () => {
    let last; for (let i = 0; i < 31; i++) last = (await post(withEmail())).status; assert.equal(last, 429); });
  console.log(`\n${n} API checks passed against ${BASE}`);
} finally { fake.close(); }
