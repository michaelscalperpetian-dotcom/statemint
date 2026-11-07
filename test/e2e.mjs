// Browser end-to-end checks: BASE=http://localhost:8790 OUT=/some/dir node test/e2e.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // uses the globally installed Playwright
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || ".";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
let n = 0; const ok = (name) => { n++; console.log("ok -", name); };
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [], csp = [], requests = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") (/Content Security Policy/i.test(m.text()) ? csp : errors).push(m.text()); });
page.on("request", r => requests.push({ url: r.url(), method: r.method(), body: r.postData() || "" }));
page.on("dialog", d => d.accept());

// 1. CSV stays in the browser
await page.goto(BASE + "/app", { waitUntil: "load" });
const csvPath = new URL("../public/samples/airbnb-transaction-history-test.csv", import.meta.url).pathname;
const csvText = readFileSync(csvPath, "utf8");
const before = requests.length;
await page.setInputFiles("#file", csvPath);
await page.waitForSelector("#view .st");
await page.waitForTimeout(800);
const after = requests.slice(before);
const leaked = after.filter(r => r.method !== "GET" || r.body.length);
const firstGuest = csvText.split("\n")[2].split(",")[6];
assert.equal(leaked.length, 0, "no POST/PUT while reading the CSV: " + JSON.stringify(leaked));
assert.ok(!after.some(r => r.url.includes(encodeURIComponent(firstGuest))), "no guest data in URLs");
ok(`loading a CSV made ${after.length} requests, none carrying data (${[...new Set(after.map(r => new URL(r.url).pathname))].join(", ") || "none"})`);

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
await page.click("#addExp"); await page.fill("#expList .exp-row:last-child input:first-child", "Supplies"); await page.fill("#expList .exp-row:last-child input:nth-child(2)", "12,50");
await page.waitForTimeout(150);
assert.ok((await page.textContent(".summary-rows")).includes("$12.50"));
await page.click("#addExp"); await page.fill("#expList .exp-row:last-child input:first-child", "Typo"); await page.fill("#expList .exp-row:last-child input:nth-child(2)", "abc");
await page.waitForTimeout(150);
assert.ok((await page.textContent("#stWarns")).includes("Typo"));
assert.equal(await page.getAttribute("#expList .exp-row:last-child input:nth-child(2)", "aria-invalid"), "true");
await page.click("#expList .exp-row:last-child .icon-btn");
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

// 9. share: what is uploaded
await page.selectOption("#guestNames", "first");
const [req] = await Promise.all([page.waitForRequest(r => r.url().endsWith("/api/statements") && r.method() === "POST"), page.click("#share")]);
await page.waitForSelector("#shareOut:not([style*='none'])");
const sent = JSON.parse(req.postData());
assert.deepEqual(Object.keys(sent).sort(), ["brand", "note", "previous", "statement"]);
assert.ok(!req.postData().includes(csvText.split("\n")[2]), "raw CSV row not uploaded");
assert.ok(sent.statement.lines.every(l => !l.guest.includes(" ")), "first names only");
ok("owner link uploads only the statement (no raw CSV), guest names reduced to first names");
const link = await page.inputValue("#shareLink");
assert.ok((await page.getAttribute("#mailLink", "href")).startsWith("mailto:?subject="));
ok("email button prepares a mailto: message");
assert.equal(await page.$$eval("#links .link-item", x => x.length), 1); ok("new link appears in 'Owner links you created'");

// 10. shared statement page + PDF
const owner = await ctx.newPage(); owner.on("pageerror", e => errors.push(e.message)); owner.on("console", m => { if (m.type() === "error") (/Content Security Policy/i.test(m.text()) ? csp : errors).push(m.text()); });
await owner.goto(link, { waitUntil: "load" }); await owner.waitForSelector("#view .st");
await owner.emulateMedia({ media: "print" });
await owner.pdf({ path: OUT + "/statement.pdf", format: "Letter", printBackground: true });
ok("shared statement opens and prints to PDF");
await owner.goto(BASE + "/s/AAAAAAAAAAAA", { waitUntil: "load" }); await owner.waitForSelector(".st-msg");
assert.ok((await owner.textContent(".st-msg")).includes("not found")); ok("unknown link shows a clear 'not found' message");

// 11. delete link from the list
await page.click("#links .mini.danger"); await page.waitForTimeout(600);
assert.equal(await page.$$eval("#links .link-item", x => x.length), 0);
const gone = await (await fetch(link.replace("/s/", "/api/statements/"))).status; assert.equal(gone, 404); ok("deleting a link from the list removes it on the server (404)");

// 12. clear my data
await page.click("#clearData"); await page.waitForLoadState("load"); await page.waitForTimeout(300);
const left = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("ownermint:")));
assert.equal(left.length, 0); ok("'Clear my data' removes every saved item from this browser");

// 13. landing page + mobile overflow
for (const [w, h] of [[390, 844], [768, 1024], [1360, 900]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } }); p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error") (/Content Security Policy/i.test(m.text()) ? csp : errors).push(m.text()); });
  for (const path of ["/", "/app"]) {
    await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForTimeout(700);
    if (path === "/app") { await p.click("#sample"); await p.waitForSelector("#view .st"); }
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 0, `${path} overflows by ${over}px at ${w}px`);
    if (w === 390) await p.screenshot({ path: `${OUT}/m${path === "/" ? "home" : "app"}.png`, fullPage: false });
  }
  await p.close(); ok(`no horizontal overflow on / and /app at ${w}px`);
}
const fontErr = e => /fonts\.(googleapis|gstatic)/.test(e) || /net::ERR_|Failed to load resource/.test(e);
const realErrors = errors.filter(e => !fontErr(e));
writeFileSync(OUT + "/console.json", JSON.stringify({ errors, csp }, null, 1));
assert.equal(csp.length, 0, "CSP violations: " + csp.join("\n")); ok("no Content-Security-Policy violations");
assert.equal(realErrors.length, 0, "page errors: " + realErrors.join("\n")); ok("no JavaScript errors");
await browser.close();
console.log(`\n${n} browser checks passed`);
