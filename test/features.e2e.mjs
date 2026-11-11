// Browser checks for: stays across months, discounts, fixed + shared expenses, guests tab, saved tab, calmer cursor, landing layout.
// Expected numbers (worked out by hand) are in the comments. Run against a local server: BASE=http://localhost:8790 node test/features.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { start } from "./fake-stripe.mjs";
import { signIn } from "./signin.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8790", OUT = process.env.OUT || ".";
const csv = new URL("./fixture-features.csv", import.meta.url).pathname;
const browser = await chromium.launch(); const fake = start(8799);
const errors = []; let n = 0; const ok = name => { n++; console.log("ok -", name); };
const final = async p => (await p.getAttribute("#view .st-big .amt", "data-final")) ?? (await p.textContent("#view .st-big .amt")).trim();
try {
  const pctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }); await signIn(pctx, BASE); const page = await pctx.newPage();
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|fonts\./.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + "/app", { waitUntil: "load" });
  await page.setInputFiles("#file", csv); await page.waitForSelector("#view .st");
  await page.selectOption("#listing", "Harbor Flat"); await page.waitForTimeout(150);
  await page.selectOption("#month", "2026-11"); await page.waitForTimeout(200);

  // November payout = 845 + 422.50 + 40 + 600 = 1,907.50 (Jamie's Oct 30 stay is October money); 20% = 381.50; owner net 1,526.00
  assert.equal(await final(page), "$1,526.00");
  // 1. stays across months
  assert.equal(await page.$$eval("#view .cal .stay.from-prev", x => x.map(e => e.textContent)).then(v => v.join()), "← Jamie");
  assert.equal(await page.$$eval("#view .cal .stay.continues", x => x.map(e => e.textContent)).then(v => v.join()), "Ana →");
  assert.ok((await page.textContent("#view .cal-note")).includes("started in Oct"));
  ok("November calendar shows Jamie's stay from Oct 30 (← Jamie) and Ana's stay running into December (Ana →); money unchanged at $1,526.00");
  await page.selectOption("#month", "2026-10"); await page.waitForTimeout(200);
  assert.equal(await page.$$eval("#view .cal .stay.continues", x => x.map(e => e.textContent)).then(v => v.join()), "Jamie →"); ok("October shows the same stay continuing (Jamie →)");
  await page.selectOption("#month", "2026-11"); await page.waitForTimeout(200);

  // 2. weekly discount 10%: Lee's 7 nights, room 1000 - 100 = 900 -> 900 x 10/90 = 100.00 given; totals unchanged
  await page.fill("#wkDisc", "10"); await page.waitForTimeout(200);
  assert.ok((await page.textContent("#view .tbl")).includes("Lee Park · Weekly −10%"));
  assert.ok((await page.textContent("#view .disc-note")).includes("about $100.00"));
  assert.equal(await final(page), "$1,526.00"); ok("weekly 10% labels Lee's 7-night stay, estimates $100.00 given, owner net still $1,526.00");
  await page.screenshot({ path: OUT + "/discount.png", fullPage: false });

  // 3. fixed monthly electricity 120 from November
  await page.click("#addExp");
  const last = "#expList .exp-item:last-child";
  await page.fill(`${last} .exp-row input:first-child`, "Electricity"); await page.fill(`${last} .exp-row input:nth-child(2)`, "120");
  await page.selectOption(`${last} .exp-row2 select:first-child`, "Utilities: Electricity");
  await page.selectOption(`${last} .exp-row2 select:nth-child(2)`, "monthly"); await page.waitForTimeout(200);
  assert.equal(await final(page), "$1,406.00"); // 1,526 - 120
  assert.ok((await page.textContent("#view .summary-rows")).includes("Utilities: Electricity · Every month"));
  const expRow = await page.$$eval("#view .tbl tr.exp", r => r.map(x => [...x.cells].map(c => c.textContent)));
  assert.equal(expRow.length, 1); assert.ok(expRow[0][0].startsWith("Expense: Electricity")); assert.equal(expRow[0].at(-1), "−$120.00");
  assert.equal(await page.$eval("#view .tbl thead tr", r => r.lastElementChild.textContent), "Expenses");
  ok("the expense appears in the reservations table as its own row, in a new Expenses column (−$120.00)");
  await page.selectOption("#month", "2026-12"); await page.waitForTimeout(200);
  // Dec: payout 253.50, 20% = 50.70, owner net 202.80 - 120 = 82.80
  assert.equal(await final(page), "$82.80");
  await page.selectOption("#month", "2026-10"); await page.waitForTimeout(200);
  assert.ok(!(await page.textContent("#view .summary-rows")).includes("Electricity")); ok("monthly electricity $120 applies to Nov ($1,406.00) and Dec ($82.80) but not Oct (it started in Nov)");

  // 4. change the amount in December -> new version from Dec; November keeps 120
  await page.selectOption("#month", "2026-12"); await page.waitForTimeout(200);
  await page.fill(`#expList .exp-item:last-child .exp-row input:nth-child(2)`, "150"); await page.press(`#expList .exp-item:last-child .exp-row input:nth-child(2)`, "Tab"); await page.waitForTimeout(300);
  assert.equal(await final(page), "$52.80"); // 202.80 - 150
  await page.selectOption("#month", "2026-11"); await page.waitForTimeout(200);
  assert.equal(await final(page), "$1,406.00"); ok("raising electricity to $150 in December leaves November at $120 (no silent change to past months)");

  // 5. shared internet bill 90 split by nights booked in November: Harbor 2+7+2+4 = 15, Zen 3 -> 75.00 / 15.00
  await page.click("#addExp");
  await page.fill(`${last} .exp-row input:first-child`, "Internet"); await page.fill(`${last} .exp-row input:nth-child(2)`, "90");
  await page.selectOption(`${last} .exp-row2 select:first-child`, "Utilities: Internet & Wi-Fi");
  await page.selectOption(`${last} .exp-row2 select:nth-child(2)`, "shared"); await page.waitForTimeout(300);
  assert.ok((await page.textContent(`${last} .exp-info`)).includes("Harbor Flat's share this month: $75.00"));
  assert.equal(await final(page), "$1,331.00"); // 1,406 - 75
  await page.selectOption(`${last} .exp-share .exp-row2 select:first-child`, "equal"); await page.waitForTimeout(300);
  assert.ok((await page.textContent(`${last} .exp-info`)).includes("$45.00")); assert.equal(await final(page), "$1,361.00"); // 1,406 - 45
  ok("shared $90 internet: $75.00 by nights booked (15 of 18), $45.00 split equally");
  assert.equal(await page.$eval("#view .tbl tfoot tr", r => r.lastElementChild.textContent), "−$165.00"); // 120 + 45
  assert.equal(await page.$$eval("#view .tbl tr.exp", r => r.length), 2); ok("table Total row includes expenses: −$165.00 (120 + 45)");
  await page.screenshot({ path: OUT + "/expenses.png", fullPage: false });

  // 6. guests tab: Jamie = 845 + 422.50 + 40 = 1,307.50 payout, 2 stays, 6 nights
  await page.click(".tabs button[data-tab=guests]"); await page.waitForSelector("#guests .panel");
  await page.fill("#guests input[type=search]", "jamie"); await page.waitForTimeout(100);
  assert.equal(await page.$$eval("#guests .panel:first-child tbody tr", r => r.length), 1);
  await page.click("#guests .panel:first-child tbody tr"); await page.waitForSelector(".guest-detail");
  assert.equal(await page.$$eval(".guest-detail tbody tr", r => r.length), 3);
  assert.ok((await page.textContent(".guest-detail tfoot")).includes("$1,307.50"));
  ok("Guests tab: searching 'jamie' shows one guest; detail has 3 lines (2 stays + adjustment) totalling $1,307.50");
  await page.screenshot({ path: OUT + "/guests.png", fullPage: false });

  // 7. saved tab
  await page.click(".tabs button[data-tab=statement]"); await page.click("#saveSnap"); await page.waitForTimeout(200);
  await page.click(".tabs button[data-tab=saved]"); await page.waitForSelector("#saved .saved-sec");
  assert.equal(await page.textContent("#saved .saved-sec h3"), "Harbor Flat");
  await page.click("#saved .link-item.snap .mini"); await page.waitForSelector("#saved .saved-viewer .st");
  assert.equal(await page.getAttribute("#saved .saved-viewer .st-big .amt", "data-final") ?? (await page.textContent("#saved .saved-viewer .st-big .amt")).trim(), "$1,361.00");
  ok("Save keeps a copy; the Saved tab lists it under 'Harbor Flat' and shows it at $1,361.00");
  await page.screenshot({ path: OUT + "/saved.png", fullPage: false });

  // 7b. year summary: every month of 2026 for this property, totals = sum of the months; CSV download
  await page.click(".tabs button[data-tab=year]"); await page.waitForSelector("#year .panel table");
  assert.ok((await page.textContent("#year h3")).includes("Harbor Flat · 2026 summary"));
  const money = s => Number(s.replace(/[^0-9.-]/g, "").replace(/^-?$/, "0")) * (s.includes("−") || s.trim().startsWith("-") ? -1 : 1);
  const yr = await page.$eval("#year table", t => [...t.tBodies[0].rows].map(x => [...x.cells].map(c => c.textContent)));
  const foot = await page.$eval("#year table", t => [...t.tFoot.rows[0].cells].map(x => x.textContent));
  assert.deepEqual(yr.map(r => r[0]), ["October 2026", "November 2026", "December 2026"]);
  const netSum = Math.round(yr.reduce((a, r) => a + money(r[r.length - 1]), 0) * 100) / 100;
  assert.equal(money(foot[foot.length - 1]), netSum);
  assert.equal(money(yr.find(r => r[0] === "November 2026")[yr[0].length - 1]), 1361);
  assert.ok((await page.textContent("#year")).includes("Expenses by category"));
  assert.ok((await page.textContent("#year")).includes("Months not in your file aren't included"));
  const [ydl] = await Promise.all([page.waitForEvent("download"), page.click("#year .year-bar button:has-text('CSV')")]);
  const ycsv = (await import("node:fs")).readFileSync(await ydl.path(), "utf8"); assert.ok(ycsv.includes("Harbor Flat 2026 summary") && ycsv.includes("Total"));
  ok(`Year tab: 3 months of 2026, total net ${netSum} = sum of the months (November $1,361.00), expenses by category, CSV download`);
  await page.click(".tabs button[data-tab=statement]");

  // 7c. host contact shown on the statement
  await page.fill("#contact", "hello@lakeside.example"); await page.waitForTimeout(250);
  assert.ok((await page.textContent("#view .st-foot")).includes("Contact") && (await page.textContent("#view .st-foot")).includes("hello@lakeside.example"));
  ok("your contact appears at the bottom of the statement");

  // 8. calmer cursor on statement pages, playful cursor still on the homepage
  assert.ok(await page.evaluate(() => document.body.classList.contains("cursor-subtle") && !document.body.classList.contains("has-cursor")));
  ok("statement pages use the calm cursor (normal pointer + small ring)");

  // 9. homepage: 'The problem' column is no longer cut off
  const lp = await (await browser.newContext({ viewport: { width: 1360, height: 768 } })).newPage(); lp.on("pageerror", e => errors.push(e.message));
  await lp.goto(BASE + "/", { waitUntil: "load" }); await lp.waitForTimeout(400);
  const third = lp.locator("#how .feature").nth(2);
  await third.scrollIntoViewIfNeeded(); await lp.waitForTimeout(1200);
  const box = await third.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 768, `third card at ${box.y}..${box.y + box.height}`);
  assert.equal(await lp.evaluate(() => getComputedStyle(document.querySelector("#how .split > div")).position), "static");
  ok("homepage: 'Send a statement that impresses' scrolls fully into view at 1360x768");
  await lp.screenshot({ path: OUT + "/problem.png" });

  assert.equal(errors.length, 0, errors.join("\n")); ok("no JavaScript errors");
  console.log(`\n${n} feature checks passed`);
} finally { await browser.close(); fake.close(); }
