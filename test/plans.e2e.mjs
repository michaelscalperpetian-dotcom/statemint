// Browser checks for plans, property limits, checkout return and "my own home" reports.
// Needs the local dev server with .dev.vars pointing at the fake Stripe: BASE=http://localhost:8790 node test/plans.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { start } from "./fake-stripe.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || ".";
const csvPath = new URL("../public/samples/airbnb-transaction-history-test.csv", import.meta.url).pathname;
const fake = start(8799);
const browser = await chromium.launch();
const errors = [];
let n = 0; const ok = name => { n++; console.log("ok -", name); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
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
  const hrefs = await page.$$eval(".lock-card .up-card a", a => a.map(x => x.href));
  assert.equal(hrefs.length, 2); assert.ok(hrefs.every(h => h.startsWith("https://buy.stripe.com/")));
  ok("locked property: no figures, actions disabled, Host and Pro checkout links shown");
  await page.screenshot({ path: OUT + "/locked.png" });

  // 3. swap: first swap allowed, then locked for 30 days
  await page.click(".lock-card .swap button"); await page.waitForSelector("#view .st");
  assert.equal(await page.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).map(x => x.value)).then(v => v[0]), open);
  await page.selectOption("#listing", open); await page.waitForSelector(".lock-card");
  assert.ok((await page.textContent(".lock-card .swap")).includes("swap a property again on")); ok("swapping a property works once, then waits 30 days");

  // 4. portfolio hides locked figures
  await page.click(".tabs button[data-tab=portfolio]"); await page.waitForSelector("#portfolio .panel");
  assert.ok((await page.textContent("#portfolio")).includes("Not on your Free plan")); await page.click(".tabs button[data-tab=statement]"); ok("all-properties view shows locked properties without numbers");

  // 5. checkout return -> Host plan, both properties unlocked, key shown, URL cleaned
  await page.goto(BASE + "/app?checkout=cs_test_paidhost1234", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("planBox").textContent.includes("Host plan"), null, { timeout: 15000 });
  assert.equal(new URL(page.url()).search, "");
  assert.match(await page.textContent("#planBox .lic code"), /^om_[A-Za-z0-9]{28}$/);
  assert.equal(await page.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).length), 0);
  ok("returning from checkout activates Host: both properties unlocked, license key shown, ?checkout removed");
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
  const lp = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage(); lp.on("pageerror", e => errors.push(e.message));
  await lp.goto(BASE + "/", { waitUntil: "load" }); await lp.waitForTimeout(500);
  assert.equal((await lp.textContent("[data-plan=host]")).trim(), "$7.50/month"); assert.equal((await lp.textContent("[data-plan=pro]")).trim(), "$24.17/month");
  await lp.click(".bill-toggle button[data-int=month]");
  assert.equal((await lp.textContent("[data-plan=host]")).trim(), "$9/month"); assert.equal((await lp.textContent("[data-plan=pro]")).trim(), "$29/month");
  assert.ok((await lp.getAttribute("[data-buy=host]", "href")).startsWith("https://buy.stripe.com/"));
  assert.ok((await lp.textContent("h1")).includes("Airbnb statements")); assert.ok(!(await lp.textContent("body")).toLowerCase().includes("co-host"));
  ok("landing: hosts wording, yearly $7.50 / $24.17 per month, monthly $9 / $29, checkout links live");
  await lp.locator("#pricing").screenshot({ path: OUT + "/pricing.png" });

  assert.equal(errors.length, 0, errors.join("\n")); ok("no JavaScript errors");
  console.log(`\n${n} plan checks passed`);
} finally { await browser.close(); fake.close(); }
