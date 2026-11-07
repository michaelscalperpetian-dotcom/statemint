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

## 8. Update: built for all Airbnb hosts, plus paid plans

**Positioning.** The product now addresses every Airbnb host, not only co-hosts. Each property is marked as one of two kinds:
- **"Managed for an owner":** an owner statement with commission, cleaning split and settlement.
- **"My own home":** an earnings report with payout, fees, cleaning, expenses and net earnings. There is no commission and no settlement.

All user-facing text says "host". Internal field names (`cohostEarned`, `payoutReceiver: "cohost"`) were kept, so existing saved settings and owner links still work.

**Plans.**

| Plan | Properties | Monthly | Yearly |
|---|---|---|---|
| Free | 1 | $0 | $0 |
| Host | 5 | $5 | $50 |
| Pro | Unlimited | $15 | $150 |

Prices are in USD. Stripe Managed Payments adds tax and acts as merchant of record. Customers manage or cancel at link.com.

**How the limit works.** If a file has more properties than the plan allows, the extra ones are locked: they show no figures, and sharing, export and print are disabled for them. Empty slots fill with the properties the user opens. The first swap is free; after that, a property can be swapped out once every 30 days. The built-in sample data is never limited.

**How payment unlocks the app.**
1. A Stripe payment link redirects the buyer to `/app?checkout={CHECKOUT_SESSION_ID}`.
2. `POST /api/billing/claim` retrieves that session from Stripe, checks that it is complete and that the price is an Ownermint price, and stores a license in D1.
3. The buyer gets a key (`om_…`). The key is saved in their browser and can be entered in another browser.
4. `POST /api/billing/license` re-checks the subscription with Stripe at most every 6 hours. `active`, `trialing` and `past_due` keep access.

**Switching it on.** Checkout appears only once `STRIPE_SECRET_KEY` is set in Cloudflare Pages. Until then, upgrade buttons say "Opening soon" and the Free limit still applies. The key should be a restricted key with read access to Checkout Sessions and Subscriptions.

**Limitations.**
- The property limit is enforced in the browser, because the CSV is never sent to the server. Someone determined could get around it with developer tools.
- A license key works in any browser it is entered in.
- There are no accounts and no license recovery by email yet. A buyer who loses the key needs support to look it up by Stripe subscription.

**Tests added.**
- `test/billing.test.mjs`: 10 checks against a local fake Stripe (`test/fake-stripe.mjs`, enabled only by `.dev.vars`). Covers an invalid, unknown or unpaid checkout; a paid checkout; repeat claims; wrong keys; cancellation; and past-due.
- `test/plans.e2e.mjs`: 10 browser checks. Covers locking, the swap rule, checkout return, own-home reports, unlimited sample data and landing-page pricing.
- `financial.test.mjs` now has 24 checks, including own-home net earnings and the new labels.

## 9. Update: stays across months, guests, discounts, utilities, shared bills, saved statements

| Change | Detail |
|---|---|
| **Stays across months** | The calendar now shows every night booked in the month. A stay that began in the previous month is drawn striped as "← Name". A stay that runs into the next month is drawn as "Name →". The money stays on the month the stay is attributed to (check-in or payout date), and a note says so. |
| **Guests tab** | Search for a guest and see all their stays, fees and adjustments, with a CSV export. Adjustments are matched to a guest by confirmation code. Only properties on the user's plan are included. |
| **Length-of-stay discounts** | Each property can record its Airbnb weekly discount (7+ nights) and monthly discount (28+ nights). Per Airbnb's help pages, the monthly discount replaces the weekly one and both apply only to the nightly price. Airbnb's "Gross earnings" figure is already after these discounts, so totals never change. Qualifying stays are labelled, and the discount given is estimated as room revenue × pct / (100 − pct), excluding the cleaning fee. The estimate is clearly marked and assumes no other promotion applied. If the CSV has its own discount column, that figure is used as-is. |
| **Expense columns** | Each expense now has a **Category** column (based on IRS Schedule E rental categories, with utilities split into electricity, gas, water and sewer, internet and Wi-Fi, trash, and TV) and an **Applies to** column. Applies to is one of: this month only; every month (fixed costs); or split between properties, equally, by nights booked in that month, or by custom %. Splits are worked out in cents, and the shares always add up exactly to the bill (tested on 1,000 random cases). |
| **Past months never change** | Changing the amount or split of a monthly expense in a later month starts a new version from that month. Stopping one ends it from that month onward. Earlier statements keep their figures. |
| **Saved tab** | "☆ Save" keeps a copy of a statement in the browser. The Saved tab lists saved copies and owner links in a section per property, newest month first. Copies can be viewed or deleted; links can be opened, copied or deleted. |
| **Calmer cursor** | The statement builder and shared statement pages keep the normal pointer, with a small, fast ring around it. The homepage keeps the playful cursor. |
| **Homepage** | The left column of "The problem" was sticky and taller than many screens, which cut off "Send a statement that impresses". It now scrolls normally. |

**Tests.**
- `financial.test.mjs`: 39 checks, including discounts, shared bills, cross-month stays and guests.
- `test/features.e2e.mjs`: 11 browser checks against `test/fixture-features.csv`, with expected values worked out by hand.
- All earlier suites pass.

**Local payment tests.** Payment and plan tests use test-only plans enabled by `TEST_BILLING=1` in `.dev.vars`. Production has no test plans, and checkout stays off until the separate Ownermint Stripe account's plans are added.

## 10. Stripe integration (separate Ownermint account)

Planned with Stripe's implementation planner:
- **Checkout:** Stripe-hosted Checkout with Managed Payments.
- **Plans:** flat-rate Host and Pro, monthly and yearly. The Free plan is freemium and needs no card.
- **Self-service:** Customer Portal.
- **Failed renewals:** Smart Retries.

| Part | Where | What it does |
|---|---|---|
| Plans | Stripe account `acct_1UZ5JxRVql5OGuqT` | Host: $5/mo or $50/yr. Pro: $15/mo or $150/yr. Tax code `txcd_10103001`; prices exclude tax, which Managed Payments adds. |
| Checkout | `POST /api/billing/checkout` | The browser names a plan and billing period; the server picks the price ID, so the browser can't choose a price. Creates a Checkout Session with `managed_payments[enabled]` and `subscription_data.billing_mode=flexible`. Verified by a real test session in the account. |
| Return from Stripe | `POST /api/billing/claim` | Looks up the checkout session with Stripe and returns the license key. Running it twice returns the same key. |
| Webhook | `POST /api/billing/webhook` | Verifies the Stripe signature (HMAC-SHA256, 5-minute tolerance, constant-time compare). Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted` and `invoice.paid/payment_failed`. Always re-reads the subscription from Stripe, so repeated or out-of-order events are harmless. Replies 500 only when Stripe can't be reached, so Stripe retries. |
| Portal | `POST /api/billing/portal` | Opens Stripe's billing page for the license holder, using configuration `bpc_1UZDznRVql5OGuqTXas9LADQ`. It covers switching between Host and Pro or monthly and yearly (prorated), downgrades at period end, cancelling at period end, updating the card, and invoice history. |
| Existing subscribers | front end | "Change plan" goes to the portal rather than a new checkout, so nobody pays for two plans. |

**Tests.** `test/billing.test.mjs` has 15 checks against a fake Stripe: signature rules, form encoding, checkout parameters, the webhook flow, claiming, upgrades, failed payments, cancellation and the portal. `test/plans.e2e.mjs` has 12 browser checks, including real redirects to Stripe Checkout and the portal.

**Not handled.** A customer who loses their license key can manage the subscription through Stripe's portal sign-in page, but can't recover the key without support.
