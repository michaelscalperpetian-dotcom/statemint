// Browser checks for the dashboard: properties, owner links, plan & billing, account. Needs the local dev server
// with .dev.vars pointing at the fakes: BASE=http://localhost:8790 OUT=/some/dir node test/dashboard.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { start, state } from "./fake-stripe.mjs";
import { signIn, uniqueEmail, userIdFor } from "./signin.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || ".";
execSync(`npx wrangler d1 execute statemint --local --command "DELETE FROM licenses WHERE session_id LIKE 'cs_test_%'"`, { stdio: "ignore" });
const csvPath = new URL("../public/samples/airbnb-transaction-history-test.csv", import.meta.url).pathname;
const fake = start(8799);
const browser = await chromium.launch(); const errors = [];
let n = 0; const ok = name => { n++; console.log("ok -", name); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/https:\/\/(checkout|billing)\.stripe\.com\/.*/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>stripe</h1>" }));
  const HOST = await signIn(ctx, BASE, uniqueEmail("dash")), OWNER = uniqueEmail("dashowner");
  const page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) errors.push(m.text()); });

  // 1. empty account
  await page.goto(BASE + "/dashboard", { waitUntil: "load" }); await page.waitForSelector("#linksBody p");
  assert.ok((await page.textContent("#propBody")).includes("No Airbnb report yet")); assert.ok((await page.textContent("#linksBody")).includes("No owner links yet"));
  assert.ok((await page.textContent("#planBody")).includes("Free plan")); assert.ok((await page.textContent("#acctBody")).includes(HOST));
  assert.equal(await page.textContent("#acctWho"), HOST);
  ok("new account: dashboard shows no properties, no links, Free plan and the Google email");

  // 2. after using the builder
  await page.goto(BASE + "/app", { waitUntil: "load" }); await page.setInputFiles("#file", csvPath); await page.waitForSelector("#view .st");
  await page.fill("#ownerEmail", OWNER); await page.fill("#pct", "18"); await page.waitForTimeout(200);
  await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/statements") && r.request().method() === "POST"), page.click("#share")]);
  const listing = await page.inputValue("#listing"); await page.waitForTimeout(900); // let the save reach the account
  await page.goto(BASE + "/dashboard", { waitUntil: "load" }); await page.waitForSelector("#linksBody table");
  const props = await page.$$eval("#propBody tbody tr", r => r.map(x => [...x.cells].map(c => c.textContent)));
  assert.equal(props.length, 2);
  const mine = props.find(r => r[0] === listing); assert.equal(mine[1], "On your plan"); assert.ok(mine[2].includes("18% commission")); assert.equal(mine[3], OWNER);
  assert.equal(props.find(r => r[0] !== listing)[1], "🔒 Not on plan");
  ok("Properties: both listings from the CSV, which one is on the Free plan, the 18% deal and the owner's email");
  const links = await page.$$eval("#linksBody tbody tr", r => r.map(x => [...x.cells].map(c => c.textContent)));
  assert.equal(links.length, 1); assert.equal(links[0][0], listing); assert.equal(links[0][2], OWNER); assert.equal(links[0][6], "0");
  assert.equal(links[0][5], new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-US"));
  ok("Statements & owner links: the new link with property, month, who it's shared with, expiry in 30 days and 0 views");
  await page.screenshot({ path: OUT + "/dashboard.png", fullPage: true });

  // 3. the owner opens it -> 1 view
  const oc = await browser.newContext(); await signIn(oc, BASE, OWNER); const op = await oc.newPage();
  const url = await page.getAttribute("#linksBody tbody a", "href"); await op.goto(url, { waitUntil: "load" }); await op.waitForSelector("#view .st"); await oc.close();
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("#linksBody table");
  assert.equal(await page.$eval("#linksBody tbody tr td:nth-child(7)", c => c.textContent), "1"); ok("a view by the owner is counted");

  // 3b. after 30 days the link stops working
  const expId = url.split("/s/")[1];
  execSync(`npx wrangler d1 execute statemint --local --command "UPDATE statements SET created_at = created_at - 31*86400000 WHERE id = '${expId}'"`, { stdio: "ignore" });
  await page.reload({ waitUntil: "load" }); await page.waitForSelector("#linksBody table");
  assert.equal(await page.$eval("#linksBody tbody tr td:nth-child(6)", c => c.textContent), "Expired");
  assert.deepEqual(await page.$$eval("#linksBody tbody tr .acts > *", b => b.map(x => x.textContent)), ["Delete"]);
  const oc2 = await browser.newContext(); await signIn(oc2, BASE, OWNER); const op2 = await oc2.newPage();
  await op2.goto(url, { waitUntil: "load" }); await op2.waitForSelector(".st-msg");
  assert.ok((await op2.textContent(".st-msg h2")).includes("expired")); assert.equal(await op2.$$eval(".tbl", x => x.length), 0); await oc2.close();
  ok("after 30 days: the dashboard shows 'Expired' (only Delete left) and the owner sees 'This link has expired', no figures");

  // 4. Open in builder remembers the property
  const other = props.find(r => r[0] !== listing)[0];
  await page.click(`#propBody tbody tr:has(td:text-is("${other}")) a`); await page.waitForURL(/\/app$/); await page.waitForSelector("#view .lock-card, #view .st");
  assert.equal(await page.inputValue("#listing"), other); ok("'Open' takes you to that property in the builder");
  await page.goto(BASE + "/dashboard", { waitUntil: "load" }); await page.waitForSelector("#linksBody table");

  // 5. delete a link from the dashboard
  await page.click("#linksBody .mini.danger"); await page.waitForSelector("#linksBody p:has-text('No owner links yet')");
  assert.equal((await page.request.get(url.replace("/s/", "/api/statements/"))).status(), 404); ok("deleting a link on the dashboard takes it offline");

  // 6. plan & billing: upgrade -> Stripe; subscribed -> Manage subscription, delete blocked until cancelled
  await Promise.all([page.waitForURL(/checkout\.stripe\.com/), page.click("#planBody .up-card button >> nth=0")]);
  assert.equal(state.lastCheckout["line_items[0][price]"], "price_test_host_month"); ok("Upgrade on the dashboard opens Stripe Checkout (Host monthly first)");
  state.paidRef = userIdFor(HOST); state.subStatus = "active"; state.subPrice = "price_test_host_month";
  await page.goto(BASE + "/app?checkout=cs_test_paidhost1234", { waitUntil: "load" }); await page.waitForFunction(() => document.getElementById("planBox").textContent.includes("Host plan"));
  await page.goto(BASE + "/dashboard", { waitUntil: "load" }); await page.waitForFunction(() => document.getElementById("planBody").textContent.includes("Host plan"));
  assert.deepEqual(await page.$$eval("#planBody .up-card button", b => b.map(x => x.textContent)), ["Change plan"]);
  await page.click("#acctBody button:has-text('Delete my account')"); await page.waitForSelector("#cancelFirst .warn");
  assert.ok((await page.textContent("#cancelFirst")).includes("Cancel your subscription first")); assert.equal((await page.request.get(BASE + "/api/me")).status(), 200);
  ok("Host subscriber: dashboard shows Host, offers 'Change plan'; Delete account asks to cancel first and keeps the account");
  await Promise.all([page.waitForURL(/billing\.stripe\.com/), page.click("#planBody button:has-text('Manage subscription')")]);
  assert.match(state.lastPortal.return_url, /\/dashboard$/); ok("Manage subscription opens Stripe's portal and returns to the dashboard");

  // 7. cancelled -> delete account works; everything gone
  state.subStatus = "canceled";
  const { createHmac } = await import("node:crypto");
  const payload = JSON.stringify({ type: "customer.subscription.deleted", data: { object: { id: "sub_test_1", status: "canceled" } } }), t = Math.floor(Date.now() / 1000);
  await fetch(BASE + "/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json", connection: "close", "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_test_secret").update(`${t}.${payload}`).digest("hex")}` }, body: payload });
  await page.goto(BASE + "/dashboard", { waitUntil: "load" }); await page.waitForFunction(() => document.getElementById("planBody").textContent.includes("Free plan"));
  await Promise.all([page.waitForURL(BASE + "/?deleted=1"), page.click("#acctBody button:has-text('Delete my account')")]);
  assert.equal((await page.request.get(BASE + "/api/me")).status(), 401);
  const rows = JSON.parse((s => s.slice(s.indexOf("[")))(execSync(`npx wrangler d1 execute statemint --local --json --command "SELECT (SELECT COUNT(*) FROM users WHERE email='${HOST}') AS u, (SELECT COUNT(*) FROM user_data WHERE user_id='${state.paidRef}') AS d"`, { encoding: "utf8" })))[0].results[0];
  assert.deepEqual([rows.u, rows.d], [0, 0]); ok("after cancelling, Delete account removes the account and its data and signs out");

  // 8. sign out from the dashboard
  const sc = await browser.newContext(); await signIn(sc, BASE); const sp = await sc.newPage();
  await sp.goto(BASE + "/dashboard", { waitUntil: "load" }); await Promise.all([sp.waitForURL(BASE + "/"), sp.click("#signOut")]);
  await sp.goto(BASE + "/dashboard", { waitUntil: "load" }); assert.match(sp.url(), /\/login\?next=%2Fdashboard$/); ok("Sign out works; the dashboard then asks you to sign in");

  // 9. mobile
  const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await signIn(mc, BASE); const mp = await mc.newPage();
  await mp.goto(BASE + "/dashboard", { waitUntil: "load" }); await mp.waitForSelector("#linksBody p");
  assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await mp.screenshot({ path: OUT + "/dashboard-mobile.png", fullPage: true });
  await mp.goto(BASE + "/login", { waitUntil: "load" }); await mp.waitForURL(/\/dashboard$/); ok("mobile: no sideways scrolling; /login sends a signed-in user straight on");
  await mc.route(/^https?:\/\/example\.com/, r => r.fulfill({ status: 200, body: "EXTERNAL" }));
  for (const trick of ["/%5Cexample.com", "/%09/example.com", "//example.com", "/%5C%5Cexample.com", "/api/me"]) {
    await mp.goto(BASE + "/login?next=" + trick, { waitUntil: "load" }); await mp.waitForURL(/\/dashboard$/);
  }
  ok("sign-in page never sends you to another website (backslash, tab and // tricks all land on the dashboard)");
  const lc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const lpg = await lc.newPage();
  await lpg.goto(BASE + "/login?next=/s/AAAAAAAAAAAA", { waitUntil: "load" }); assert.ok((await lpg.textContent("h1")).includes("view your statement"));
  assert.equal(await lpg.getAttribute("#google", "href"), "/api/auth/login?next=%2Fs%2FAAAAAAAAAAAA"); await lpg.screenshot({ path: OUT + "/login-mobile.png" });
  ok("login page: owner wording when opening a statement, and it carries the statement link through sign-in");

  assert.equal(errors.length, 0, errors.join("\n")); ok("no JavaScript errors");
  console.log(`\n${n} dashboard checks passed`);
} finally { await browser.close(); fake.close(); state.subStatus = "active"; state.subPrice = "price_test_host_month"; state.paidRef = null; }
