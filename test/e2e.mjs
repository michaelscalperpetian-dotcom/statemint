// Browser end-to-end checks: BASE=http://localhost:8790 OUT=/some/dir node test/e2e.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // uses the globally installed Playwright
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { start } from "./fake-stripe.mjs";
import { signIn, uniqueEmail } from "./signin.mjs";
const fake = start(8799);
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || ".";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
let n = 0; const ok = (name) => { n++; console.log("ok -", name); };
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const HOST = await signIn(ctx, BASE, uniqueEmail("host")), OWNER = uniqueEmail("owner");
const page = await ctx.newPage();
const errors = [], csp = [], requests = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") (/Content Security Policy/i.test(m.text()) ? csp : errors).push(m.text()); });
page.on("request", r => requests.push({ url: r.url(), method: r.method(), body: r.postData() || "" }));
page.on("dialog", d => d.accept());

// 1. reading the CSV: the only thing sent anywhere is the save to your own account
await page.goto(BASE + "/app", { waitUntil: "load" });
const csvPath = new URL("../public/samples/airbnb-transaction-history-test.csv", import.meta.url).pathname;
const csvText = readFileSync(csvPath, "utf8");
const before = requests.length;
await page.setInputFiles("#file", csvPath);
await page.waitForSelector("#view .st");
await page.waitForTimeout(800);
const after = requests.slice(before);
const leaked = after.filter(r => (r.method !== "GET" || r.body.length) && !(r.method === "PUT" && new URL(r.url).pathname === "/api/data"));
const firstGuest = csvText.split("\n")[1].split(",")[8]; assert.ok(firstGuest.length > 3);
assert.equal(leaked.length, 0, "only PUT /api/data while reading the CSV: " + JSON.stringify(leaked));
assert.ok(!after.some(r => r.url.includes(encodeURIComponent(firstGuest))), "no guest data in URLs");
assert.ok(after.some(r => r.method === "PUT" && r.body.includes('"lastCSV"')), "the CSV is saved to the account");
ok(`loading a CSV saves it to your account (PUT /api/data) and sends it nowhere else; ${after.length} requests`);

// 2. statement numbers on screen match the engine
const net = await page.getAttribute(".st-big .amt", "data-final");
ok(`statement rendered, owner net shown: ${net.trim()}`);

// 3. invalid commission does not silently become 0
await page.fill("#pct", "");
await page.waitForTimeout(100);
assert.ok((await page.textContent("#pctErr")).includes("between 0 and 100"));
const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("ownermint:settings:" + document.getElementById("listing").value)));
assert.notEqual(settings?.commissionPct ?? 20, 0);
await page.fill("#pct", "25"); await page.waitForTimeout(100);
assert.equal(await page.textContent("#pctErr"), "");
ok("blank commission shows an error and keeps the last valid %, 25% applies");

// 4. aria-pressed on segmented buttons
await page.click("#cleanSeg button[data-v=cohost]");
assert.equal(await page.getAttribute("#cleanSeg button[data-v=cohost]", "aria-pressed"), "true");
assert.equal(await page.getAttribute("#cleanSeg button[data-v=owner]", "aria-pressed"), "false");
ok("segmented buttons expose aria-pressed");

// 5. split amount is per month
await page.click("#recvSeg button[data-v=split]");
await page.fill("#splitAmt", "300");
await page.waitForTimeout(100);
const monthsList = await page.$$eval("#month option", o => o.map(x => x.value));
const m0 = await page.inputValue("#month");
const other = monthsList.find(m => m !== m0);
if (other) { await page.selectOption("#month", other); await page.waitForTimeout(150); assert.equal(await page.inputValue("#splitAmt"), ""); await page.selectOption("#month", m0); await page.waitForTimeout(150); assert.equal(await page.inputValue("#splitAmt"), "300"); ok("split amount is saved per month (not reused for " + other + ")"); }
await page.click("#recvSeg button[data-v=owner]");

// 6. expenses: comma decimal and invalid entry warning
await page.click("#addExp"); await page.fill("#expList .exp-item:last-child .exp-row input:first-child", "Supplies"); await page.fill("#expList .exp-item:last-child .exp-row input:nth-child(2)", "12,50");
await page.waitForTimeout(150);
assert.ok((await page.textContent(".summary-rows")).includes("$12.50"));
await page.click("#addExp"); await page.fill("#expList .exp-item:last-child .exp-row input:first-child", "Typo"); await page.fill("#expList .exp-item:last-child .exp-row input:nth-child(2)", "abc");
await page.waitForTimeout(150);
assert.ok((await page.textContent("#stWarns")).includes("Typo"));
assert.equal(await page.getAttribute("#expList .exp-item:last-child .exp-row input:nth-child(2)", "aria-invalid"), "true");
await page.click("#expList .exp-item:last-child .icon-btn");
ok("expense '12,50' counts as $12.50; 'abc' is flagged on screen, not silently dropped");

// 7. portfolio + audit tabs
await page.click(".tabs button[data-tab=portfolio]");
await page.waitForSelector("#portfolio .panel");
const pRows = await page.$$eval("#portfolio .panel:first-child tbody tr", r => r.length);
assert.ok(pRows >= 2); ok(`portfolio tab lists ${pRows} properties`);
await page.click(".tabs button[data-tab=audit]");
await page.waitForSelector("#audit .panel");
const auditText = await page.textContent("#audit");
assert.ok(auditText.includes("Skipped rows") && auditText.includes("Bank transfer")); ok("audit trail lists skipped payout rows with reasons and source row numbers");
await page.screenshot({ path: OUT + "/audit.png", fullPage: false });
await page.click(".tabs button[data-tab=statement]");

// 8. CSV export
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportCsv")]);
const exported = readFileSync(await dl.path(), "utf8");
assert.ok(exported.startsWith("﻿Source row,")); assert.ok(exported.includes("Owner net"));
ok("CSV export downloads with source rows and summary");

// 9. share: needs the owner's email; what is uploaded
await page.selectOption("#guestNames", "first");
await page.click("#share"); await page.waitForTimeout(200);
assert.ok((await page.textContent("#ownerEmailErr")).includes("email")); assert.equal(await page.isVisible("#shareOut"), false);
await page.fill("#ownerEmail", "not an email"); await page.click("#share"); await page.waitForTimeout(200);
assert.ok((await page.textContent("#ownerEmailErr")).includes("doesn't look like"));
await page.fill("#ownerEmail", OWNER); await page.waitForTimeout(100);
ok("an owner link needs the owner's email first (missing or invalid email is flagged, nothing is created)");
const [req] = await Promise.all([page.waitForRequest(r => r.url().endsWith("/api/statements") && r.method() === "POST"), page.click("#share")]);
await page.waitForSelector("#shareOut:not([style*='none'])");
const sent = JSON.parse(req.postData());
assert.deepEqual(Object.keys(sent).sort(), ["brand", "note", "ownerEmail", "previous", "statement"]); assert.equal(sent.ownerEmail, OWNER);
assert.ok((await page.textContent("#shareWho")).includes(OWNER));
assert.ok(!req.postData().includes(csvText.split("\n")[2]), "raw CSV row not uploaded");
assert.ok(sent.statement.lines.every(l => !l.guest.includes(" ")), "first names only");
ok("owner link uploads only the statement (no raw CSV), guest names reduced to first names");
const link = await page.inputValue("#shareLink");
assert.ok((await page.getAttribute("#mailLink", "href")).startsWith(`mailto:${encodeURIComponent(OWNER)}?subject=`));
ok("email button prepares a mailto: message to the owner");
await page.click(".tabs button[data-tab=saved]"); await page.waitForSelector("#saved .link-item");
assert.equal(await page.$$eval("#saved .link-item", x => x.length), 1); ok("new link appears in the Saved tab, under its property");

// 10. shared statement page + PDF
const owner = await ctx.newPage(); owner.on("pageerror", e => errors.push(e.message)); owner.on("console", m => { if (m.type() === "error") (/Content Security Policy/i.test(m.text()) ? csp : errors).push(m.text()); });
await owner.goto(link, { waitUntil: "load" }); await owner.waitForSelector("#view .st");
await owner.emulateMedia({ media: "print" });
await owner.pdf({ path: OUT + "/statement.pdf", format: "Letter", printBackground: true });
ok("the host can open their own link, and it prints to PDF");
// the owner: signed out -> asked to sign in -> back on the statement
const oCtx = await browser.newContext(); const op = await oCtx.newPage(); op.on("pageerror", e => errors.push(e.message));
await op.goto(link, { waitUntil: "load" }); await op.waitForSelector(".st-msg");
assert.ok((await op.textContent(".st-msg h2")).includes("Sign in"));
const signHref = await op.getAttribute(".st-msg a.btn", "href"); assert.equal(signHref, "/login?next=" + encodeURIComponent(new URL(link).pathname));
await op.goto(BASE + signHref.replace("/login?next=", `/api/auth/login?login_hint=${encodeURIComponent(OWNER)}&next=`), { waitUntil: "load" });
await op.waitForSelector("#view .st"); assert.equal(new URL(op.url()).pathname, new URL(link).pathname);
ok("the owner opens the link signed out, is asked to sign in, and lands back on the statement");
// anyone else: told it's for someone else, with a way to switch account
const sCtx = await browser.newContext(); const STR = await signIn(sCtx, BASE, uniqueEmail("stranger")); const sp = await sCtx.newPage();
await sp.goto(link, { waitUntil: "load" }); await sp.waitForSelector(".st-msg");
assert.ok((await sp.textContent(".st-msg")).includes("shared with someone else")); assert.ok((await sp.textContent(".st-msg")).includes(STR));
assert.equal(await sp.$$eval(".st-row, .tbl", x => x.length), 0);
ok("a different Google account sees 'shared with someone else' (and who they're signed in as), no figures");
await sCtx.close();
await owner.goto(BASE + "/s/AAAAAAAAAAAA", { waitUntil: "load" }); await owner.waitForSelector(".st-msg");
assert.ok((await owner.textContent(".st-msg")).includes("not found")); ok("unknown link shows a clear 'not found' message");

// 11. delete link from the list
await page.click("#saved .mini.danger"); await page.waitForTimeout(600);
assert.equal(await page.$$eval("#saved .link-item", x => x.length), 0);
const gone = await (await fetch(link.replace("/s/", "/api/statements/"))).status; assert.equal(gone, 404); ok("deleting a link from the list removes it on the server (404)");

// 12. another device: same account, same data
const dev2 = await browser.newContext({ viewport: { width: 1360, height: 900 } }); await signIn(dev2, BASE, HOST);
const d2 = await dev2.newPage(); await d2.goto(BASE + "/app", { waitUntil: "load" }); await d2.waitForSelector("#view .st");
assert.equal(await d2.inputValue("#pct"), "25"); assert.equal(await d2.inputValue("#ownerEmail"), OWNER);
ok("signing in on another device brings back the CSV, the 25% deal and the owner's email");
await dev2.close();

// 13. delete my saved data
await page.waitForTimeout(800); // let the last edits reach the account
await page.click("#clearData"); await page.waitForLoadState("load"); await page.waitForTimeout(500);
const left = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("ownermint:") && k !== "ownermint:__account"));
assert.equal(left.length, 0);
assert.deepEqual((await (await page.request.get(BASE + "/api/data")).json()).items, {});
assert.equal(await page.isVisible("#empty"), true);
ok("'Delete my saved data' empties both this browser and the account");

// 14. first sign-in brings along what this browser already had
const old = await browser.newContext({ viewport: { width: 1360, height: 900 } }); const oldP = await old.newPage();
await oldP.goto(BASE + "/login", { waitUntil: "load" });
await oldP.evaluate(t => { localStorage.setItem("ownermint:lastCSV", JSON.stringify({ name: "old.csv", text: t })); localStorage.setItem("ownermint:brand", JSON.stringify({ company: "Old Browser Co" })); }, csvText);
await signIn(old, BASE, uniqueEmail("returning"));
await oldP.goto(BASE + "/app", { waitUntil: "load" }); await oldP.waitForSelector("#view .st");
assert.equal(await oldP.inputValue("#company"), "Old Browser Co"); assert.ok((await oldP.textContent(".toast")).includes("saved what this browser had"));
assert.ok(JSON.parse((await (await oldP.request.get(BASE + "/api/data")).json()).items.brand).company === "Old Browser Co");
ok("first sign-in imports this browser's existing data into the account automatically");
// signing in as someone else in the same browser never shows the previous account's data
await oldP.click("#signOut"); await oldP.waitForURL(BASE + "/");
await signIn(old, BASE, uniqueEmail("second"));
await oldP.goto(BASE + "/app", { waitUntil: "load" }); await oldP.waitForTimeout(800);
assert.equal(await oldP.inputValue("#company"), ""); assert.equal(await oldP.isVisible("#empty"), true);
ok("sign out clears this browser; the next account starts empty (no mixing)");
await old.close();

// 15. landing page + mobile overflow
for (const [w, h] of [[390, 844], [768, 1024], [1360, 900]]) {
  const pc = await browser.newContext({ viewport: { width: w, height: h } }); await signIn(pc, BASE);
  const p = await pc.newPage(); p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error") (/Content Security Policy/i.test(m.text()) ? csp : errors).push(m.text()); });
  for (const path of ["/", "/app", "/dashboard", "/login"]) {
    await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForTimeout(700);
    if (path === "/app") { await p.click("#sample"); await p.waitForSelector("#view .st"); }
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 0, `${path} overflows by ${over}px at ${w}px`);
    if (w === 390) await p.screenshot({ path: `${OUT}/m${path === "/" ? "home" : path.slice(1)}.png`, fullPage: false });
  }
  await pc.close(); ok(`no horizontal overflow on /, /app, /dashboard and /login at ${w}px`);
}
const fontErr = e => /fonts\.(googleapis|gstatic)/.test(e) || /net::ERR_|Failed to load resource/.test(e);
const realErrors = errors.filter(e => !fontErr(e));
writeFileSync(OUT + "/console.json", JSON.stringify({ errors, csp }, null, 1));
assert.equal(csp.length, 0, "CSP violations: " + csp.join("\n")); ok("no Content-Security-Policy violations");
assert.equal(realErrors.length, 0, "page errors: " + realErrors.join("\n")); ok("no JavaScript errors");
await browser.close(); fake.close();
console.log(`\n${n} browser checks passed`);
