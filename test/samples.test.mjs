import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCSV, toTransactions, buildStatement, detectColumns } from "../public/js/engine.js";
const exp = JSON.parse(fs.readFileSync(new URL("./sample-expected.json", import.meta.url)));
const read = f => fs.readFileSync(new URL("../public/samples/" + f, import.meta.url), "utf8");
let pass = 0;
function check(label, tx) {
  for (const [key, e] of Object.entries(exp)) {
    const [listing, month] = key.split("|");
    const T = buildStatement(tx, { listing, month }).totals;
    assert.equal(T.reservations, e.res, `${label} ${key} reservations`); assert.equal(T.nights, e.nights, `${label} ${key} nights`);
    assert.equal(T.grossRevenue, e.gross, `${label} ${key} gross`); assert.equal(T.payout, e.payout, `${label} ${key} payout`);
    assert.equal(T.airbnbFees, e.fees, `${label} ${key} fees`); assert.equal(T.cleaning, e.clean, `${label} ${key} cleaning`);
    pass++;
  }
  console.log("ok -", label);
}
const a = toTransactions(parseCSV(read("airbnb-transaction-history-test.csv")));
assert.equal(a.warnings.length, 0); check("transaction-history export", a.transactions);
const g = toTransactions(parseCSV(read("airbnb-gross-earnings-test.csv")));
assert.equal(g.warnings.length, 0); check("gross-earnings export (different headers)", g.transactions);
// no header: auto-detect must fail, manual map (as the column-matching panel builds it) must work
const rows = parseCSV(read("airbnb-no-header-test.csv"));
const failed = toTransactions(rows); assert.ok(failed.transactions.length === 0 || failed.warnings.length > 0, "no-header file should not silently parse");
const header = parseCSV(read("airbnb-transaction-history-test.csv"))[0];
const map = detectColumns(header);
const synthetic = [header.map((_, i) => "Column " + (i + 1)), ...rows];
check("no-header file + manual column map", toTransactions(synthetic, map).transactions);
console.log(`\n${pass} statement checks passed`);
