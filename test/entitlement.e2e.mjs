// End-to-end: buying Host or Pro really delivers the plan, and cancelling takes it away.
// Uses a 6-property file. Needs the local dev server with .dev.vars (fake Stripe): node test/entitlement.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { start, state } from "./fake-stripe.mjs";
import { signIn, uniqueEmail, userIdFor } from "./signin.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8790", SCRATCH = process.env.OUT || ".";
execSync(`npx wrangler d1 execute statemint --local --command "DELETE FROM licenses WHERE session_id LIKE 'cs_test_%'"`, { stdio: "ignore" });
// six properties, one October stay each
const names = ["Alder Cabin", "Birch House", "Cedar Loft", "Dune Cottage", "Elm Studio", "Fern Villa"];
const csv = "Date,Type,Confirmation code,Start date,Nights,Guest,Listing,Currency,Amount,Service fee,Cleaning fee,Gross earnings\n" +
  names.map((n, i) => `10/0${i + 2}/2026,Reservation,CODE${i}X,10/0${i + 1}/2026,2,Guest ${i},${n},USD,169.00,31.00,20.00,200.00`).join("\n") + "\n";
const csvPath = SCRATCH + "/six-properties.csv"; writeFileSync(csvPath, csv);
const fake = start(8799);
const browser = await chromium.launch(); const errors = [];
let n = 0; const ok = name => { n++; console.log("ok -", name); };
const stub = ctx => ctx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
const lockedCount = p => p.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).length);
async function load(p, url = "/app") { await p.goto(BASE + url, { waitUntil: "load" }); await p.setInputFiles("#file", csvPath); await p.waitForSelector("#view .st, #view .lock-card"); await p.waitForTimeout(300); }
try {
  // 1. Free
  const free = await browser.newContext(); await stub(free); const HOSTB = await signIn(free, BASE, uniqueEmail("buyhost")); const fp = await free.newPage(); fp.on("pageerror", e => errors.push(e.message));
  await load(fp); assert.equal(await lockedCount(fp), 5); ok("Free: 1 of 6 properties unlocked");

  // 2. Buy Host -> return from Stripe -> exactly 5 unlocked, statements + owner links work on them
  state.subPrice = "price_test_host_month"; state.subStatus = "active"; state.paidRef = userIdFor(HOSTB);
  const hp = await free.newPage(); hp.on("pageerror", e => errors.push(e.message)); hp.on("dialog", d => d.accept());
  await hp.goto(BASE + "/app?checkout=cs_test_paidhost1234", { waitUntil: "load" });
  await hp.waitForFunction(() => document.getElementById("planBox").textContent.includes("Host plan"), null, { timeout: 15000 });
  await hp.setInputFiles("#file", csvPath); await hp.waitForTimeout(500);
  assert.equal(await lockedCount(hp), 1); ok("Host bought: 5 of 6 properties unlocked (the 6th is locked)");
  const unlocked = await hp.$$eval("#listing option", o => o.filter(x => !x.textContent.startsWith("🔒")).map(x => x.value));
  for (const name of unlocked) { await hp.selectOption("#listing", name); await hp.waitForSelector("#view .st"); assert.equal(await hp.isDisabled("#share"), false); }
  ok("Host: all 5 unlocked properties show full statements with sharing enabled");
  await hp.selectOption("#listing", unlocked[0]); await hp.waitForSelector("#view .st");
  await hp.fill("#ownerEmail", "owner@example.com");
  const [req] = await Promise.all([hp.waitForResponse(r => r.url().endsWith("/api/statements") && r.request().method() === "POST"), hp.click("#share")]);
  assert.equal(req.status(), 201); ok("Host: creating an owner link works");
  const lockedName = (await hp.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).map(x => x.value)))[0];
  await hp.selectOption("#listing", lockedName); await hp.waitForSelector(".lock-card");
  const btn = await hp.$$eval(".lock-card .up-card button", b => b.map(x => x.textContent));
  assert.deepEqual(btn, ["Change plan"]); ok("Host: the 6th property offers 'Change plan' to Pro (via the portal, so no second subscription)");

  // 3. Buy Pro (new customer) -> everything unlocked
  const pro = await browser.newContext(); await stub(pro); await signIn(pro, BASE, uniqueEmail("buypro")); const pp = await pro.newPage(); pp.on("pageerror", e => errors.push(e.message));
  // a real Upgrade click: checkout is tied to this account (client_reference_id), so the return unlocks it
  await load(pp); const lk = (await pp.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).map(x => x.value)))[0];
  await pp.selectOption("#listing", lk); await pp.waitForSelector(".lock-card .up-card button:not([disabled])");
  await Promise.all([pp.waitForURL(/checkout\.stripe\.com/), pp.locator(".lock-card .up-card button").nth(1).click()]);
  const sid = new URL(pp.url()).pathname.split("/").pop();
  assert.equal(state.lastCheckout["line_items[0][price]"], "price_test_pro_month");
  state.subPrice = "price_test_pro_month";
  await pp.goto(BASE + "/app?checkout=" + sid, { waitUntil: "load" });
  await pp.waitForFunction(() => document.getElementById("planBox").textContent.includes("Pro plan"), null, { timeout: 15000 });
  await pp.waitForTimeout(500);
  assert.equal(await lockedCount(pp), 0); ok("Pro bought: all 6 properties unlocked (the CSV was still there from the account)");
  await pp.click(".tabs button[data-tab=portfolio]"); await pp.waitForSelector("#portfolio .panel");
  assert.ok(!(await pp.textContent("#portfolio")).includes("Not on your")); ok("Pro: the all-properties view shows figures for all 6");

  // 4. Cancellation reaches the site through the webhook -> back to Free
  state.subStatus = "canceled";
  const payload = JSON.stringify({ type: "customer.subscription.deleted", data: { object: { id: "sub_test_1", status: "canceled" } } }), t = Math.floor(Date.now() / 1000);
  const wr = await fetch(BASE + "/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_test_secret").update(`${t}.${payload}`).digest("hex")}`, connection: "close" }, body: payload });
  assert.equal(wr.status, 200);
  await pp.reload({ waitUntil: "load" }); await pp.waitForFunction(() => document.getElementById("planBox").textContent.includes("Free plan"), null, { timeout: 15000 });
  assert.ok((await pp.textContent("#planBox")).includes("subscription is canceled")); ok("Cancelled: the webhook switches the customer back to Free and the app says why");

  assert.equal(errors.length, 0, errors.join("\n")); ok("no JavaScript errors");
  console.log(`\n${n} purchase checks passed`);
} finally { await browser.close(); fake.close(); state.subStatus = "active"; state.subPrice = "price_test_host_month"; state.paidRef = null; }
