# Ownermint product audit (November 2026)

Scope: the whole codebase, which includes the landing page, the statement builder (`/app`), the shared owner statement (`/s/:id`), the statement engine, and the Pages Functions API backed by D1.
Every bug marked **Confirmed** below was reproduced first, either with a script against the engine or with a browser or API test. It was then fixed and re-tested. Items marked **Potential** are risks found by reading the code; they were not reproduced as failures.

## 1. How the product works

| Part | File | What it does |
|---|---|---|
| CSV parsing | `public/js/engine.js` → `parseCSV`, `detectColumns`, `toTransactions` | Parses the file with a quote-aware parser and matches columns by header name (or uses a manual column map). Payout (bank transfer) rows are skipped. Each remaining row becomes a transaction with its source row number. |
| Calculations | `engine.js` → `buildStatement` | Selects one listing and month. Computes commission per line, cleaning kept by the co-host, expenses, owner net, settlement and occupancy. |
| Statement view / PDF | `public/js/view.js`, print CSS in `public/css/app.css` | The same renderer is used in the builder, in the shared link and in print/PDF. The PDF is the browser's own "Save as PDF". |
| Owner links | `functions/api/statements/*.js`, `functions/_lib.js`, D1 table `statements` | `POST` stores a sanitized snapshot of one statement. `GET /api/statements/:id` serves it. `DELETE` requires the edit key, which exists only in the creator's browser. |
| Local storage | `fx.js` → `store` (`localStorage`, prefix `ownermint:`) | Stores the last CSV, per-property deals, per-month expenses, split amounts, notes, branding and the list of created links. |

## 2. Issues found

Severity: **Critical** = wrong money figures with no indication; **High** = wrong or misleading figures in realistic cases, or a security exposure; **Medium** = a correctness or robustness gap with a workaround; **Low** = polish or hardening.

### Confirmed bugs (all fixed)

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| B1 | Critical | `buildStatement` settlement | With "Airbnb split", if Airbnb had already paid the co-host more than they earned, the statement showed a **negative** "Owner pays co-host" amount. With "Co-host received" and a negative owner net, the direction was backwards. | The settlement is now computed as a signed amount. It is always shown as a positive figure with the correct direction ("Co-host pays owner" or "Owner pays co-host"). |
| B2 | High | expense parsing | An expense entered as `12,50` (comma decimal) was dropped without any warning, because the number field rejected it. | Expense inputs accept `12,50`, `$12.50` and `1,234.56`. Anything that is not a number is left out **and** shown in a "Check before sending" warning, and the input is marked invalid. |
| B3 | Medium | expenses | A negative expense silently reduced the co-host's total. | Negative expenses are now an explicit, labelled feature ("Credit: …") and appear on the statement as credits. |
| B4 | High | `parseDate` | `13/10/2026` (day/month) rolled over to **January 10, 2027**, putting stays in the wrong month or year. | Impossible dates are rejected. The date format is detected from all dates in the file (day/month vs month/day). An ambiguous file gets a visible notice, and there is a manual "Date format" selector. |
| B5 | High | occupancy | A stay crossing into the next month counted all of its nights in the first month and none in the next, so occupancy was overstated in one month and understated in the other. | Only nights that fall inside the month are counted, including nights from stays attributed to the previous month. |
| B6 | High | `toTransactions` | Exact duplicate rows, for example from two overlapping exports combined, were counted twice. | Duplicates are detected and shown with their row numbers. They stay counted by default, because two identical lines can be genuine. One checkbox excludes them. |
| B7 | Medium | `buildStatement` | Mixed currencies were added together as if they were the same currency. | A warning appears on the statement. Figures are not converted. The portfolio view shows no combined totals across currencies. |
| B8 | High | `toTransactions` | "Payout (Fast Pay)" and similar payout variants were counted as income. Only the exact type "Payout" was skipped. | Any type starting with "Payout" is skipped, and every skipped row is listed with its reason in the audit trail. |
| B9 | Medium | commission | Commission was always charged on adjustments (damage reimbursements, refunds, cancellation fees) and could not be turned off. | There is now an "Also charge commission on adjustments" setting. It defaults to on, so existing statements do not change. |
| B10 | High | `app.html` split amount | The "amount Airbnb already paid the co-host" was saved once per property and silently reused in **every** month. | It is saved per property and month. An old saved value is kept only for the month that is open, and a message says so. |
| B11 | High | `app.html` commission | Clearing the commission % field silently set commission to 0%. | Blank or out-of-range input shows an error. The statement keeps the last valid percentage and says which one it is using. |
| B12 | Medium | `app.html` | If the split-amount or commission field still had focus when the month or property changed, it kept showing the previous value. This was found by the new browser test. | Changing property or month always reloads every field. |
| B13 | Medium | `view.js` | When owner net was negative, the "Where the money went" bar quietly treated it as 0. | A clear message now states the negative owner net. The statement-level warning is also shown in the builder. |
| B14 | Low | `view.js` | Printing or saving as PDF during the count-up animation could capture a half-counted number or an empty bar. | All animations are finished on `beforeprint`. The PDF test confirms the final figures. |
| B15 | Medium | `statement.html` | A network failure left the owner looking at "Loading statement…" forever. | The page now has a loading spinner and separate messages for "not found", a server error and being offline. |
| B16 | Low | `payout_ex_cleaning` | Choosing "payout minus cleaning" on a file with no cleaning column silently charged commission on the full payout. | A warning is shown. |
| B17 | Low | reservations without a check-in date | These were silently placed by payout date. | A warning is shown. |
| B18 | Low | amounts like `1.234` | These are ambiguous (could be 1,234) and were silently read as 1.234. | A warning is shown. |

### Security and privacy findings (all fixed, unless listed in section 5)

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| S1 | High | `POST /api/statements` | The raw request body was stored as is, so any JSON (any keys, any size up to 250 KB) could be hosted on the domain. The logo could be an external URL, which would act as a tracking pixel whenever an owner opened their statement. | The body is rebuilt from an allow-list of fields with type checks and length caps (note: 600 characters, at most 1,500 lines). Logos are accepted only as `data:image/png`, `jpeg` or `webp` base64 under 120 KB; anything else is removed. |
| S2 | Medium | API | There was no rate limit. | 30 links per hour per network. This uses a salted, truncated SHA-256 of the IP that is cleared after 24 hours. |
| S3 | Medium | site | There were no security headers. | `public/_headers` adds a CSP (only same-origin scripts, Google Fonts styles and fonts, no framing, no plugins), `nosniff`, a `Referrer-Policy`, `X-Frame-Options` and a `Permissions-Policy`. Shared statements also send `noindex` and `no-referrer`. |
| S4 | Medium | `app.html` | A created owner link could not be deleted from the UI. The edit key existed only in localStorage. | An "Owner links you created" list with Open, Copy and Delete. Delete sends the key in an `x-edit-key` header (the old `?k=` still works), so the key stays out of URLs and logs. |
| S5 | Medium | `app.html` | No way to remove the saved CSV or other data from the browser. | A "Clear my data from this browser" button. It warns that links stay online unless they are deleted first. |
| S6 | Low | `randomId` | Modulo bias in ID generation (still unguessable: about 70 bits for IDs, about 139 bits for keys). | Rejection sampling. |
| S7 | Low | guest privacy | Owner links always stored guests' full names. | A new "Guest names on the statement" setting (full, first names only, or hidden). The default is unchanged. |
| S8 | Low | CSV export | Not applicable before this audit. The new export guards against spreadsheet formula injection: text starting with `= + - @` is prefixed with `'`. | — |

### Potential issues (not reproduced as failures)

- **P1.** Airbnb's real export format may differ by account or country, for example in column names, a localized header language or the date format. The engine has only been tested against format-faithful test files, not a real export (we do not have one). The column mapper and the audit trail are the safety net. **Recommended next step:** test one real export from a co-host.
- **P2.** Rounding: commission is rounded per line and then summed, which is how Airbnb shows per-line figures. A deal that rounds once on the monthly total could differ by a few cents.
- **P3.** `views` is incremented by link-preview bots (Slack, iMessage), so it overstates real opens. It is not shown anywhere yet.
- **P4.** Anyone can create an owner link with arbitrary text in the note or property name, so the domain could host a misleading page. This is limited by the rate limit, sanitizing and `noindex`, but not eliminated. Adding accounts would fix it.

## 3. Financial accuracy

`test/financial.test.mjs` checks each calculation method against figures worked out by hand (the working is in the comments). The engine's output was never used to set an expected value. Base case: three stays with gross $1,000, $600 and $1,400; cleaning $100, $100 and $150; payout $2,575; one +$80 adjustment and one −$40 cancellation fee.

| Method | Expected (hand) | Result |
|---|---|---|
| Commission 20% on payout incl. adjustments | 20% × 2,575 = **515.00** | pass |
| … excluding adjustments | 20% × 2,535 = **507.00** | pass |
| … on payout minus cleaning | 20% × 2,225 = **445.00** | pass |
| … on gross | 20% × 3,040 = **608.00** | pass |
| Owner receives payout, cleaning to owner, two expenses (45.50 + 120) | co-host 680.50, owner net 1,894.50 | pass |
| Co-host receives payout, payout minus cleaning, cleaning to co-host | co-host 795.00, co-host pays owner 1,780.00 | pass |
| Airbnb split, gross basis, 700 already paid | owner pays co-host 73.50 | pass |
| Airbnb split, 900 already paid (overpaid) | co-host pays owner 126.50 | pass |
| Credit expense (−20) | expenses 25.50 | pass |
| `45,50` expense | 45.50 | pass |
| Negative owner net (3,000 expense, co-host received) | owner net −940, owner pays co-host 940 | pass |
| Invariant: owner net + co-host earned = payout | for every configuration | pass |
| Duplicates counted vs excluded | 3,420 vs 2,575 | pass |
| Day/month file | read correctly | pass |
| Cross-month occupancy | October 7/31, November 2/30 | pass |
| Payout and "Payout (Fast Pay)" rows | skipped and listed | pass |

## 4. Features added

1. **Portfolio dashboard.** The "All properties" tab shows every property for the month, each with its own deal: stays, nights, occupancy, payout, co-host earned, owner net, settlement, and the change versus last month. Totals appear only when all properties use one currency.
2. **Monthly comparison.** Owner net for every month in the file for the open property, as a bar chart and a table. The existing "vs last month" chips remain.
3. **Transaction audit trail.** The "Audit trail" tab shows:
   - File facts, the detected date format and how each column was matched.
   - Every skipped row with its reason, and every duplicate.
   - Every statement line with its source row number, commission base and commission.
   - The step-by-step calculation of owner net and the settlement.
4. **Statement CSV export.** Includes source row numbers and a summary.
5. **Owner notification (honest version).** After creating a link, "✉ Email" opens the co-host's own email app with a ready-made message (`mailto:`). Ownermint does not send email itself; that would need an email provider and sender verification.
6. **Custom branding.** The logo upload already existed. Added: a "Remove logo", file-type checks, a readable error for unreadable images, and alt text.
7. **Link manager and "Clear my data"** (S4, S5) and **guest name privacy** (S7).
8. **UX polish:**
   - A "Creating link…" loading state, plus specific error messages for offline, rate-limited and too-large requests.
   - `aria-pressed` on toggle buttons and ARIA tabs.
   - Labelled expense inputs and `aria-invalid` on bad inputs.
   - A mobile "View statement ↓" shortcut.
   - Print CSS: page margins, no breaks inside sections, exact colours, a compact table, and the tilt effect removed.

The landing page copy was corrected to match the product. "Payout rows are de-duplicated" was inaccurate, the privacy answer now says exactly what an owner link stores, and the "coming soon" Pro list no longer lists features that are now free.

## 5. Remaining problems / not done

- **No real Airbnb export has been tested** (P1). This is the most important open item.
- The CSP allows `'unsafe-inline'` scripts because the pages use inline module scripts. The next step is to move them into files and drop it.
- The rate-limit salt defaults to a constant. Setting an `IP_SALT` secret in Cloudflare (Settings → Variables) makes the hashes non-reversible.
- There are no accounts. Saved work lives in one browser, and the edit keys for owner links are lost if browser data is cleared. This is stated in the UI.
- Statements are not emailed automatically, and nothing is stored as history on the server. This is by design until there is a paid plan.
- No automated accessibility audit tool (such as axe) was run. Checks were manual: labels, ARIA states, focus styles and keyboard-operable rows.
- Compliance: **no compliance claims are made** (e.g. GDPR, SOC 2). The privacy statements on the site are limited to what the code does and was tested to do.

## 6. Tests

| Suite | Command | Result |
|---|---|---|
| Engine unit tests | `npm test` (`engine`, `samples`, `financial`) | 9 + 12 + 21 checks pass |
| API (local `wrangler pages dev` + local D1) | `BASE=http://localhost:8790 RATE=1 node test/api.test.mjs` | 11 checks pass: invalid JSON, oversize, field allow-list, logo filtering, headers, bad ids, wrong delete key, delete, rate limit |
| Browser end-to-end (Playwright, Chromium) | `BASE=… node test/e2e.mjs` | 21 checks pass. They include: zero network requests while reading a CSV; the share request carries only the statement; PDF generated and its figures checked by hand; no horizontal overflow at 390, 768 and 1360 px; no CSP violations; no JS errors |

All three suites were also run against the live site (https://statemint-994.pages.dev) after deployment: 10 API checks and 21 browser checks passed. The rate-limit test was run locally only, so the live limit is not used up. Test statements created on production were deleted afterwards. In this sandbox, Node needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` to reach the live site.

## 7. Recommended next steps

1. Get one real Airbnb transaction CSV from a co-host. Run it through the app and compare against their own spreadsheet.
2. Set the `IP_SALT` secret in Cloudflare.
3. Move the inline scripts into files and tighten the CSP.
4. If a paid plan launches: accounts, server-side statement history, and automatic emails through a provider such as Cloudflare Email or Resend.
