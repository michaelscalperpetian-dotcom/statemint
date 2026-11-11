// Browser checks for plans, property limits, checkout return and "my own home" reports.
// Needs the local dev server with .dev.vars pointing at the fake Stripe: BASE=http://localhost:8790 node test/plans.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { start, state } from "./fake-stripe.mjs";
import { signIn, uniqueEmail, userIdFor } from "./signin.mjs";
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
  const HOST = await signIn(ctx, BASE, uniqueEmail("plans"));
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
  assert.deepEqual(btns, [["Start free trial", false], ["Start free trial", false]]);
  assert.ok((await page.textContent(".lock-card")).includes("7-day free trial") && (await page.textContent(".lock-card")).includes("renew automatically"));
  const upPrices = await page.$$eval(".lock-card .up-card small", x => x.map(e => e.textContent));
  assert.ok(upPrices[0].includes("$5/month") && upPrices[1].includes("$15/month"), upPrices.join(" | "));
  ok("locked property: no figures, actions disabled, Host and Pro 'Start free trial' buttons with monthly prices first and the renewal terms next to them");
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
  const upCtx = await browser.newContext(); await signIn(upCtx, BASE); const up = await upCtx.newPage();
  await up.context().route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
  await up.goto(BASE + "/app", { waitUntil: "load" }); await up.setInputFiles("#file", csvPath); await up.waitForSelector("#view .st");
  const lockedName = (await up.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).map(x => x.value)))[0];
  await up.selectOption("#listing", lockedName); await up.waitForSelector(".lock-card .up-card button:not([disabled])");
  await Promise.all([up.waitForURL(/checkout\.stripe\.com/), up.click(".lock-card .up-card button")]);
  ok("Upgrade sends the browser to Stripe Checkout"); await up.close();

  // 5. checkout return -> Host plan on the account, both properties unlocked, URL cleaned
  state.paidRef = userIdFor(HOST);
  await page.goto(BASE + "/app?checkout=cs_test_paidhost1234", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("planBox").textContent.includes("Host plan"), null, { timeout: 15000 });
  assert.equal(new URL(page.url()).search, "");
  assert.ok((await page.textContent("#planBox .notice")).includes("on your account"));
  assert.equal(await page.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).length), 0);
  ok("returning from checkout activates Host on the account: both properties unlocked, ?checkout removed");
  const other = await browser.newContext(); await signIn(other, BASE, HOST); const op = await other.newPage();
  await op.goto(BASE + "/dashboard", { waitUntil: "load" }); await op.waitForFunction(() => document.getElementById("planBody").textContent.includes("Host plan"));
  ok("the plan follows the account: another browser signed in as the same host sees Host on the dashboard"); await other.close();
  const manage = page.locator("#planBox button", { hasText: "Manage subscription" });
  assert.equal(await manage.count(), 1);
  await Promise.all([page.waitForURL(/billing\.stripe\.com/), manage.click()]);
  ok("Manage subscription opens Stripe's billing portal");
  await page.goBack({ waitUntil: "load" }); await page.waitForSelector("#planBox button >> text=Manage subscription");
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
  const p2c = await browser.newContext(); await signIn(p2c, BASE); const p2 = await p2c.newPage(); p2.on("pageerror", e => errors.push(e.message));
  await p2.goto(BASE + "/app", { waitUntil: "load" }); await p2.click("#sample"); await p2.waitForSelector("#view .st");
  assert.equal(await p2.$$eval("#listing option", o => o.filter(x => x.textContent.startsWith("🔒")).length), 0); ok("sample data is not limited");

  // 8. landing pricing
  const lpCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await lpCtx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
  const lp = await lpCtx.newPage(); lp.on("pageerror", e => errors.push(e.message));
  await lp.goto(BASE + "/", { waitUntil: "load" }); await lp.waitForTimeout(500);
  // monthly is shown first; yearly is one click away
  assert.equal((await lp.textContent("[data-plan=host]")).trim(), "$5/month"); assert.equal((await lp.textContent("[data-plan=pro]")).trim(), "$15/month");
  assert.equal(await lp.getAttribute(".bill-toggle button[data-int=month]", "aria-pressed"), "true");
  await lp.click(".bill-toggle button[data-int=year]");
  assert.equal((await lp.textContent("[data-plan=host]")).trim(), "$4.17/month"); assert.equal((await lp.textContent("[data-plan=pro]")).trim(), "$12.50/month");
  assert.equal((await lp.textContent("[data-per=host]")).trim(), "$50 billed yearly");
  await lp.click(".bill-toggle button[data-int=month]");
  assert.equal((await lp.textContent("[data-buy=host]")).trim(), "Start free trial");
  const note = await lp.textContent(".price-note"); for (const t of ["7-day free trial", "charged when the trial ends", "renew automatically", "Cancel anytime", "No refunds for partial periods"]) assert.ok(note.includes(t), t);
  assert.ok(!(await lp.textContent("body")).includes("2 months free")); assert.ok(!(await lp.textContent("body")).includes("30 seconds"));
  assert.equal(await lp.$$eval("#faq details.faq-item", d => d.length), 8); assert.equal(await lp.isVisible("#faq details.faq-item p"), false);
  await lp.click("#faq details.faq-item summary"); assert.equal(await lp.isVisible("#faq details.faq-item p"), true);
  for (const href of ["/terms", "/privacy", "/refunds", "/cookies"]) assert.equal(await lp.$$eval(`footer a[href="${href}"]`, a => a.length), 1);
  assert.ok((await lp.textContent("h1")).includes("Airbnb statements")); assert.ok(!(await lp.textContent("body")).toLowerCase().includes("co-host"));
  // signed out: Choose Pro asks you to sign in first, then goes straight on to Stripe Checkout
  await Promise.all([lp.waitForURL(/\/login\?next=/), lp.click("[data-buy=pro]")]);
  assert.equal(new URL(lp.url()).searchParams.get("next"), "/app?buy=pro&interval=month");
  const hint = new URL(lp.url()).searchParams.get("next");
  await Promise.all([lp.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 }), lp.goto(`${BASE}/api/auth/login?login_hint=${encodeURIComponent(uniqueEmail("landing"))}&next=${encodeURIComponent(hint)}`)]);
  assert.equal(state.lastCheckout["line_items[0][price]"], "price_test_pro_month"); assert.equal(state.lastCheckout["subscription_data[trial_period_days]"], "7");
  ok("landing: trial and renewal terms by the buttons, FAQ drop-downs, legal links, no unsupported claims; signed out, Start free trial signs you in and opens Stripe Checkout for Pro monthly with a 7-day trial");
  await lp.goto(BASE + "/", { waitUntil: "load" }); await lp.waitForFunction(() => document.getElementById("navAcct").textContent === "Dashboard");
  await Promise.all([lp.waitForURL(/checkout\.stripe\.com/), lp.click("[data-buy=host]")]);
  ok("signed in: the nav shows Dashboard and Choose Host goes straight to Stripe Checkout");
  // early click: settings still loading must not fall through to the app
  const early = await lpCtx.newPage();
  await early.route("**/api/billing/config", async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); });
  await early.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await Promise.all([early.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 }), early.click("[data-buy=host]", { force: true })]);
  ok("clicking Choose Host before payment settings load still opens Stripe Checkout (not the app)");
  // checkout failure: say so and stay on the page
  const fail = await lpCtx.newPage(); fail.on("pageerror", e => errors.push(e.message));
  await fail.route("**/api/billing/checkout", r => r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Couldn't start checkout. Please try again in a minute." }) }));
  await fail.goto(BASE + "/", { waitUntil: "load" }); await fail.waitForTimeout(500);
  await fail.click("[data-buy=pro]"); await fail.waitForTimeout(800);
  assert.equal(new URL(fail.url()).pathname, "/"); assert.ok((await fail.textContent(".toast")).includes("Couldn't start checkout"));
  assert.equal((await fail.textContent("[data-buy=pro]")).trim(), "Start free trial");
  ok("if checkout can't start, the homepage shows the reason and stays put");

  assert.equal(errors.length, 0, errors.join("\n")); ok("no JavaScript errors");
  console.log(`\n${n} plan checks passed`);
} finally { await browser.close(); fake.close(); state.paidRef = null; }
