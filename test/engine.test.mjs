import assert from "node:assert/strict";
import { parseCSV, toTransactions, buildStatement, listings, months, parseMoney, parseDate, SAMPLE_CSV } from "../public/js/engine.js";

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log("ok -", name); };

t("parseMoney handles formats", () => {
  assert.equal(parseMoney("1,182.60"), 1182.6); assert.equal(parseMoney("$1,400.00"), 1400);
  assert.equal(parseMoney("1.234,56"), 1234.56); assert.equal(parseMoney("(85.00)"), -85);
  assert.equal(parseMoney("-12.5"), -12.5); assert.equal(parseMoney(""), 0); assert.equal(parseMoney("12,50"), 12.5);
});
t("parseDate handles US and ISO", () => {
  assert.equal(parseDate("10/03/2026").toISOString().slice(0,10), "2026-10-03");
  assert.equal(parseDate("2026-01-31").toISOString().slice(0,10), "2026-01-31");
  assert.equal(parseDate(""), null);
});
t("CSV parser handles quotes, commas, CRLF, BOM", () => {
  const rows = parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [["a","b"],["x, y",'he said "hi"']]);
});
const { transactions, warnings } = toTransactions(parseCSV(SAMPLE_CSV));
t("sample parses; payout rows dropped", () => {
  assert.equal(warnings.length, 0);
  assert.equal(transactions.length, 8); // 7 reservations + 1 adjustment, payout skipped
  assert.deepEqual(listings(transactions), ["Downtown Loft", "Lakeview Cabin"]);
  assert.deepEqual(months(transactions), ["2026-10"]);
});
t("statement math (commission 20% of payout, cleaning to owner)", () => {
  const st = buildStatement(transactions, { listing: "Lakeview Cabin", month: "2026-10" });
  const T = st.totals;
  assert.equal(T.reservations, 5); assert.equal(T.nights, 17);
  assert.equal(T.grossRevenue, 8185); assert.equal(T.payout, 6926.95); assert.equal(T.airbnbFees, 1258.05);
  assert.equal(T.cleaning, 600); assert.equal(T.commission, 1385.39); assert.equal(T.cohostEarned, 1385.39);
  assert.equal(T.ownerNet, 5541.56); assert.equal(T.adr, 446.18);
  assert.ok(Math.abs(T.occupancy - 17/31) < 1e-9);
  assert.equal(st.settlement.direction, "owner_pays_cohost"); assert.equal(st.settlement.amount, 1385.39);
});
t("cleaning to co-host + expenses + co-host receives payouts", () => {
  const st = buildStatement(transactions, { listing: "Lakeview Cabin", month: "2026-10",
    settings: { commissionPct: 15, commissionBase: "payout_ex_cleaning", cleaningTo: "cohost", payoutReceiver: "cohost" },
    expenses: [{ description: "Restock supplies", amount: 64.2 }, { description: "Plumber", amount: 150 }] });
  const T = st.totals;
  // base = payout - cleaning = 6326.95 -> 15% = 949.04 (row-rounded)
  const rowSum = [1062.60,1400.40,724.70,1907.20,1147.05,85].map(b => Math.round(b*0.15*100)/100).reduce((a,b)=>a+b,0);
  assert.equal(T.commission, Math.round(rowSum*100)/100);
  assert.equal(T.cleaningToCohost, 600); assert.equal(T.expensesTotal, 214.2);
  assert.equal(T.cohostEarned, Math.round((T.commission + 600 + 214.2)*100)/100);
  assert.equal(st.settlement.direction, "cohost_pays_owner"); assert.equal(st.settlement.amount, T.ownerNet);
  assert.equal(Math.round((T.ownerNet + T.cohostEarned)*100)/100, T.payout);
});
t("Airbnb split payouts reconcile", () => {
  const st = buildStatement(transactions, { listing: "Lakeview Cabin", month: "2026-10", settings: { payoutReceiver: "split", splitPaidToCohost: 1400 } });
  assert.equal(st.settlement.direction, "cohost_pays_owner"); assert.equal(st.settlement.amount, 14.61);
  const st2 = buildStatement(transactions, { listing: "Lakeview Cabin", month: "2026-10", settings: { payoutReceiver: "split", splitPaidToCohost: 1000 } });
  assert.equal(st2.settlement.direction, "owner_pays_cohost"); assert.equal(st2.settlement.amount, 385.39);
});
t("other listing isolated", () => {
  const st = buildStatement(transactions, { listing: "Downtown Loft", month: "2026-10" });
  assert.equal(st.totals.reservations, 2); assert.equal(st.totals.payout, 1604.9);
});
t("unknown file warns", () => {
  const r = toTransactions(parseCSV("foo,bar\n1,2\n"));
  assert.ok(r.warnings.length >= 1);
});
console.log(`\n${pass} tests passed`);
