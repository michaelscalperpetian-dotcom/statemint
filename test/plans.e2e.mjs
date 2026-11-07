// Browser checks for plans, property limits, checkout return and "my own home" reports.
// Needs the local dev server with .dev.vars pointing at the fake Stripe: BASE=http://localhost:8790 node test/plans.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { start } from "./fake-stripe.mjs";
import { execSync } from "node:child_process";
execSync(`npx wrangler d1 execute statemint --local --command "DELETE FROM licenses WHERE session_id LIKE 'cs_test_%'"`, { stdio: "ignore" });
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || ".";
const csvPath = new URL("../public/samples/airbnb-transaction-history-test.csv", import.meta.url).pathname;
const fake = start(8799);
const browser = await chromium.launch();
const errors = [];
let n = 0; const ok = name => { n++; console.log("ok -", name); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  // Stripe's hosted pages are stubbed so we can see the browser being sent there
  await ctx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + "/app", { waitUntil: "load" });
  await page.setInputFiles("#file", csvPath); await page.waitForSelector("#view .st"); await page.waitForTimeout(300);

  // 1. free plan = 1 property
  assert.ok((await page.textContent("#planBox")).includes("Free plan")); assert.ok((await page.textContent("#planBox")).includes("1 of 1 property used"));
  const opts = await page.$$eval("#listing option", o => o.map(x => x.textContent));
  assert.equal(opts.filter(t => t.startsWith("🔒")).length, 1); ok(`free plan: 1 of 2 properties unlocked (${opts.join(" | ")})`);
  const open = await page.inputValue("#listing"), locked = (await page.$$eval("#listing option", o => o.map(x => x.value))).find(v => v !== open);

  // 2. locked property shows the upgrade card and disables sharing / export / print
  await page.selectOption("#listing", locked); await page.waitForSelector(".lock-card");
  assert.ok((await page.textContent(".lock-card h3")).includes("isn't on your Free plan"));
  for (const id of ["share", "exportCsv", "print"]) assert.equal(await page.isDisabled("#" + id), true);
  const btns = await page.$$eval(".lock-card .up-card button", b => b.map(x => [x.textContent, x.disabled]));
  assert.deepEqual(btns, [["Upgrade", false], ["Upgrade", false]]);
  ok("locked property: no figures, actions disabled, Host and Pro upgrade buttons shown");
  await page.screenshot({ path: OUT + "/locked.png" });

  // 3. swap: first swap allowed, then locked for 30 days
  await page.click(".lock-card .swap button"); await page.waitForSelector("#view .st");
  assert.equal(await page.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).map(x => x.value)).then(v => v[0]), open);
  await page.selectOption("#listing", open); await page.waitForSelector(".lock-card");
  assert.ok((await page.textContent(".lock-card .swap")).includes("swap a property again on")); ok("swapping a property works once, then waits 30 days");

  // 4. portfolio hides locked figures
  await page.click(".tabs button[data-tab=portfolio]"); await page.waitForSelector("#portfolio .panel");
  assert.ok((await page.textContent("#portfolio")).includes("Not on your Free plan")); await page.click(".tabs button[data-tab=statement]"); ok("all-properties view shows locked properties without numbers");

  // 4b. upgrade button really opens Stripe Checkout
  const up = await (await browser.newContext()).newPage();
  await up.context().route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
  await up.goto(BASE + "/app", { waitUntil: "load" }); await up.setInputFiles("#file", csvPath); await up.waitForSelector("#view .st");
  const lockedName = (await up.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).map(x => x.value)))[0];
  await up.selectOption("#listing", lockedName); await up.waitForSelector(".lock-card .up-card button:not([disabled])");
  await Promise.all([up.waitForURL(/checkout\.stripe\.com/), up.click(".lock-card .up-card button")]);
  ok("Upgrade sends the browser to Stripe Checkout"); await up.close();

  // 5. checkout return -> Host plan, both properties unlocked, key shown, URL cleaned
  await page.goto(BASE + "/app?checkout=cs_test_paidhost1234", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("planBox").textContent.includes("Host plan"), null, { timeout: 15000 });
  assert.equal(new URL(page.url()).search, "");
  assert.match(await page.textContent("#planBox .lic code"), /^om_[A-Za-z0-9]{28}$/);
  assert.equal(await page.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).length), 0);
  ok("returning from checkout activates Host: both properties unlocked, license key shown, ?checkout removed");
  const manage = page.locator("#planBox button", { hasText: "Manage subscription" });
  assert.equal(await manage.count(), 1);
  await Promise.all([page.waitForURL(/billing\.stripe\.com/), manage.click()]);
  ok("Manage subscription opens Stripe's billing portal");
  await page.goBack({ waitUntil: "load" }); await page.waitForSelector("#planBox .lic");
  await page.screenshot({ path: OUT + "/host.png" });

  // 6. my own home report
  await page.click("#typeSeg button[data-v=own]"); await page.waitForTimeout(200);
  assert.equal(await page.isVisible("#dealFields"), false);
  assert.ok((await page.textContent(".st-big .label")).includes("Net earnings"));
  assert.ok(!(await page.textContent("#view .tbl thead")).includes("Commission"));
  assert.ok(!(await page.textContent("#view")).includes("Owner pays"));
  ok("'My own home' gives an earnings report: no deal fields, no commission, no settlement");
  await page.screenshot({ path: OUT + "/own.png" });
  await page.click("#typeSeg button[data-v=managed]"); await page.waitForTimeout(200);
  assert.ok((await page.textContent(".st-big .who")).match(/Owner pays host|Host pays owner|Nothing to settle/)); ok("switching back gives an owner statement with 'host' wording");

  // 7. sample data is never limited
  const p2 = await (await browser.newContext()).newPage(); p2.on("pageerror", e => errors.push(e.message));
  await p2.goto(BASE + "/app", { waitUntil: "load" }); await p2.click("#sample"); await p2.waitForSelector("#view .st");
  assert.equal(await p2.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).length), 0); ok("sample data is not limited");

  // 8. landing pricing
  const lpCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await lpCtx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
  const lp = await lpCtx.newPage(); lp.on("pageerror", e => errors.push(e.message));
  await lp.goto(BASE + "/", { waitUntil: "load" }); await lp.waitForTimeout(500);
  assert.equal((await lp.textContent("[data-plan=host]")).trim(), "$4.17/month"); assert.equal((await lp.textContent("[data-plan=pro]")).trim(), "$12.50/month");
  await lp.click(".bill-toggle button[data-int=month]");
  assert.equal((await lp.textContent("[data-plan=host]")).trim(), "$5/month"); assert.equal((await lp.textContent("[data-plan=pro]")).trim(), "$15/month");
  assert.equal((await lp.textContent("[data-buy=host]")).trim(), "Choose Host");
  assert.ok((await lp.textContent("h1")).includes("Airbnb statements")); assert.ok(!(await lp.textContent("body")).toLowerCase().includes("co-host"));
  await Promise.all([lp.waitForURL(/checkout\.stripe\.com/), lp.click("[data-buy=pro]")]);
  ok("landing: hosts wording, yearly $4.17 / $12.50 per month, monthly $5 / $15, Choose Pro opens Stripe Checkout");

  assert.equal(errors.length, 0, errors.join("\n")); ok("no JavaScript errors");
  console.log(`\n${n} plan checks passed`);
} finally { await browser.close(); fake.close(); }
