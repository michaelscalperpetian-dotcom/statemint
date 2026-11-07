// Financial accuracy matrix. Every expected number below was worked out by hand (see comments),
// not produced by the engine.
import assert from "node:assert/strict";
import { parseCSV, toTransactions, buildStatement } from "../public/js/engine.js";
const H = "Date,Type,Confirmation code,Start date,Nights,Guest,Listing,Currency,Amount,Service fee,Cleaning fee,Gross earnings\n";
// R1 gross 1000 (cleaning 100) fee 155 -> payout 845 | R2 600 (100) fee 93 -> 507 | R3 1400 (150) fee 217 -> 1183
// A1 resolution +80 | A2 cancellation fee -40.  Totals: gross 3040, fees 465, cleaning 350, payout 2575
const BASE = [
  "10/06/2026,Reservation,R1,10/05/2026,3,Ann,L,USD,845.00,155.00,100.00,1000.00",
  "10/13/2026,Reservation,R2,10/12/2026,2,Bo,L,USD,507.00,93.00,100.00,600.00",
  "10/31/2026,Reservation,R3,10/30/2026,4,Cy,L,USD,1183.00,217.00,150.00,1400.00",
  "10/20/2026,Resolution Adjustment,R2,,,Bo,L,USD,80.00,,,80.00",
  "10/22/2026,Cancellation Fee,R9,,,Dee,L,USD,-40.00,,,-40.00",
];
const tx = (lines = BASE, opts) => toTransactions(parseCSV(H + lines.join("\n") + "\n"), null, opts);
const st = (settings, expenses = [], t = tx().transactions, month = "2026-10") => buildStatement(t, { listing: "L", month, settings, expenses });
const EXP = [{ description: "Supplies", amount: "45.50" }, { description: "Plumber", amount: "120" }]; // 165.50
let n = 0; const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };

ok("totals", () => { const T = st({}).totals; assert.deepEqual([T.grossRevenue, T.airbnbFees, T.cleaning, T.payout, T.reservations, T.nights], [3040, 465, 350, 2575, 3, 9]); });
ok("commission on payout incl. adjustments = 20% x 2575 = 515", () => assert.equal(st({ commissionPct: 20 }).totals.commission, 515));
ok("commission on payout excl. adjustments = 20% x (845+507+1183) = 507", () => assert.equal(st({ commissionPct: 20, commissionOnAdjustments: false }).totals.commission, 507));
ok("commission on payout minus cleaning = 20% x (2575-350) = 445", () => assert.equal(st({ commissionPct: 20, commissionBase: "payout_ex_cleaning" }).totals.commission, 445));
ok("commission on gross = 20% x 3040 = 608", () => assert.equal(st({ commissionPct: 20, commissionBase: "gross" }).totals.commission, 608));
ok("S1 owner receives, cleaning to owner, 2 expenses: co-host 515+165.50=680.50, owner net 1894.50", () => {
  const s = st({ payoutReceiver: "owner" }, EXP); assert.equal(s.totals.cohostEarned, 680.5); assert.equal(s.totals.ownerNet, 1894.5);
  assert.deepEqual([s.settlement.direction, s.settlement.amount], ["owner_pays_cohost", 680.5]); });
ok("S2 co-host receives, payout-minus-cleaning, cleaning to co-host: 445+350=795, owner net 1780", () => {
  const s = st({ payoutReceiver: "cohost", commissionBase: "payout_ex_cleaning", cleaningTo: "cohost" });
  assert.equal(s.totals.cohostEarned, 795); assert.equal(s.totals.ownerNet, 1780); assert.deepEqual([s.settlement.direction, s.settlement.amount], ["cohost_pays_owner", 1780]); });
ok("S3 Airbnb split, gross basis, already paid 700: owed 608+165.50-700 = 73.50 to co-host", () => {
  const s = st({ payoutReceiver: "split", commissionBase: "gross", splitPaidToCohost: 700 }, EXP);
  assert.deepEqual([s.settlement.direction, s.settlement.amount, s.settlement.alreadyPaid], ["owner_pays_cohost", 73.5, 700]); });
ok("S4 Airbnb split paid too much (900): co-host returns 126.50", () => {
  const s = st({ payoutReceiver: "split", commissionBase: "gross", splitPaidToCohost: 900 }, EXP);
  assert.deepEqual([s.settlement.direction, s.settlement.amount], ["cohost_pays_owner", 126.5]); });
ok("S5 credit expense: 45.50 - 20 = 25.50 -> co-host 540.50", () => {
  const s = st({}, [{ description: "Supplies", amount: "45.50" }, { description: "Refund to owner", amount: "-20" }]);
  assert.equal(s.totals.expensesTotal, 25.5); assert.equal(s.totals.cohostEarned, 540.5); });
ok("S6 comma decimal expense '45,50' = 45.50", () => assert.equal(st({}, [{ description: "x", amount: "45,50" }]).totals.expensesTotal, 45.5));
ok("S7 invalid expense is excluded AND reported", () => { const s = st({}, [{ description: "Bad", amount: "abc" }]);
  assert.equal(s.totals.expensesTotal, 0); assert.ok(s.warnings.some(w => w.includes("Bad"))); });
ok("S8 negative owner net: co-host receives, expenses 3000 -> owner pays co-host 940", () => {
  const s = st({ payoutReceiver: "cohost" }, [{ description: "Roof", amount: "3000" }]);
  assert.equal(s.totals.ownerNet, -940); assert.deepEqual([s.settlement.direction, s.settlement.amount], ["owner_pays_cohost", 940]); assert.ok(s.warnings.length); });
ok("S9 owner net + co-host earned always equals payout", () => {
  for (const cfg of [{}, { cleaningTo: "cohost" }, { commissionBase: "gross" }, { commissionBase: "payout_ex_cleaning", cleaningTo: "cohost" }]) {
    const T = st(cfg, EXP).totals; assert.equal(Math.round((T.ownerNet + T.cohostEarned) * 100) / 100, T.payout); } });
ok("S10 duplicates: counted twice with a warning; excluded on request", () => {
  const dup = [...BASE, BASE[0]]; const a = tx(dup); assert.equal(a.audit.duplicates.length, 1); assert.ok(a.warnings.some(w => w.includes("duplicate")));
  assert.equal(st({}, [], a.transactions).totals.payout, 2575 + 845);
  const b = tx(dup, { excludeDuplicates: true }); assert.equal(st({}, [], b.transactions).totals.payout, 2575); });
ok("S11 day/month file detected and read correctly", () => {
  const d = tx(["15/10/2026,Reservation,R1,14/10/2026,2,Ann,L,USD,100.00,18.00,0,118.00", "03/10/2026,Reservation,R2,02/10/2026,1,Bo,L,USD,50.00,9.00,0,59.00"]);
  assert.equal(d.dateFormat.format, "dmy"); const s = st({}, [], d.transactions); assert.equal(s.totals.reservations, 2); assert.equal(s.totals.payout, 150); });
ok("S12 US file with only ambiguous dates is read month/day and the assumption is shown", () => {
  const d = tx(["10/06/2026,Reservation,R1,10/05/2026,3,Ann,L,USD,845.00,155.00,100.00,1000.00"]); assert.equal(d.dateFormat.status, "assumed"); assert.ok(d.notices.length); });
ok("S13 mixed currencies are flagged, not converted", () => {
  const s = st({}, [], tx([...BASE, "10/15/2026,Reservation,R4,10/14/2026,1,Eve,L,EUR,90.00,16.00,0,106.00"]).transactions); assert.ok(s.warnings.some(w => w.includes("EUR"))); });
ok("S14 occupancy counts only nights inside the month (R3 30 Oct x4 -> 2 Oct nights): Oct 7/31, Nov 2/30", () => {
  assert.equal(Math.round(st({}).totals.occupancy * 1e6), Math.round(7 / 31 * 1e6));
  assert.equal(Math.round(st({}, [], tx().transactions, "2026-11").totals.occupancy * 1e6), Math.round(2 / 30 * 1e6)); });
ok("S15 bank-transfer rows (incl. 'Payout (Fast Pay)') are skipped and listed in the audit trail", () => {
  const a = tx([...BASE, "10/07/2026,Payout,,,,,,USD,,,,", "10/08/2026,Payout (Fast Pay),,,,,L,USD,845.00,,,"]);
  assert.equal(st({}, [], a.transactions).totals.payout, 2575); assert.equal(a.audit.skipped.length, 2); assert.equal(a.audit.skipped[0].row, 7); });
ok("S16 no cleaning column + payout-minus-cleaning basis is flagged", () => {
  const t = toTransactions(parseCSV("Date,Type,Start date,Nights,Listing,Amount\n10/02/2026,Reservation,10/01/2026,2,L,100.00\n")).transactions;
  assert.ok(buildStatement(t, { listing: "L", month: "2026-10", settings: { commissionBase: "payout_ex_cleaning" } }).warnings.length); });
ok("S17 own property: no commission or cleaning split; net = 2575 - 165.50 = 2409.50, nothing to settle", () => {
  const s = st({ reportType: "own", commissionPct: 20, cleaningTo: "cohost", payoutReceiver: "split", splitPaidToCohost: 500 }, EXP);
  assert.deepEqual([s.totals.commission, s.totals.cleaningToCohost, s.totals.cohostEarned, s.totals.expensesTotal, s.totals.ownerNet], [0, 0, 0, 165.5, 2409.5]);
  assert.deepEqual([s.settlement.direction, s.settlement.amount], ["none", 0]); assert.ok(s.lines.every(l => l.commission === 0)); });
ok("S18 own property with expenses above payout is flagged: 2575 - 3000 = -425", () => {
  const s = st({ reportType: "own" }, [{ description: "Roof", amount: "3000" }]); assert.equal(s.totals.ownerNet, -425); assert.ok(s.warnings.some(w => w.includes("Net earnings are negative"))); });
ok("S19 settlement labels use 'host'", () => { assert.equal(st({}).settlement.label, "Owner pays host"); assert.equal(st({ payoutReceiver: "cohost" }).settlement.label, "Host pays owner"); });
console.log(`\n${n} financial checks passed`);
