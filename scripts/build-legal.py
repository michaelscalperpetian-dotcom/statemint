# Usage: python3 scripts/build-legal.py public   (regenerates terms, privacy, refunds and cookies pages)
# Builds the legal pages from one layout so header, footer and placeholders stay identical.
import sys
COMPANY = "Mint Statements"   # the business's legal name (add "LLC" / "Inc." here if the registered name has one)
RUN_BY = "" if COMPANY == "Mint Statements" else f", operated by {COMPANY},"   # only said when the legal name differs from the brand
EMAIL = "support@mintstatements.com"
UPDATED = "November 8, 2026"
def page(slug, title, desc, body):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Mint Statements</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://mintstatements.com/{slug}">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/css/app.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='44' fill='%232fd3a0'/></svg>">
</head>
<body class="dash-page">
<a class="skip" href="#main">Skip to content</a>
<header class="dash-wrap dash-bar legal-bar"><a class="logo" href="/"><i aria-hidden="true"></i>Mint Statements</a>
  <nav class="legal-nav" aria-label="Legal pages">{"".join(f'<a href="/{s}"{" aria-current=\"page\"" if s==slug else ""}>{t}</a>' for s,t in [("terms","Terms"),("privacy","Privacy"),("refunds","Refunds"),("cookies","Cookies")])}</nav></header>
<main class="dash-wrap legal" id="main">
  <h1 class="dash-h">{title}</h1>
  <p class="help">Last updated {UPDATED}</p>
  <div class="panel">
{body}
  </div>
</main>
<footer class="site-foot"><div class="wrap">
  <nav aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/cookies">Cookies</a><a href="mailto:{EMAIL}">{EMAIL}</a></nav>
  <p>© 2026 {COMPANY}, California, USA. Mint Statements is not affiliated with, endorsed or sponsored by Airbnb. Airbnb is a trademark of Airbnb, Inc.</p>
</div></footer>
</body>
</html>
'''
out = sys.argv[1]
C, E = COMPANY, f'<a href="mailto:{EMAIL}">{EMAIL}</a>'
pages = {}

pages["privacy"] = ("Privacy policy", "What Mint Statements collects, why, who it's shared with, and how to delete it.", f'''
    <p>Mint Statements (mintstatements.com){RUN_BY} is a business based in California, USA ("we", "us"). It turns your Airbnb transaction report into owner statements and earnings reports. This policy explains what we collect, why, who we share it with and the choices you have. Questions or requests: {E}.</p>

    <h2>What we collect</h2>
    <ul>
      <li><b>Your sign-in.</b> When you sign in with Google we receive your email address and Google's ID for your account, and nothing else: not your name, photo, password or anything in your Google account.</li>
      <li><b>What you put into the app.</b> The Airbnb CSV you upload and what you enter: deals, expenses, notes, branding (including a logo), owners' email addresses and saved statements. This can include guest names and booking details from your Airbnb report. We keep it in your account so it's there on every device you sign in on.</li>
      <li><b>Owner links.</b> When you create an owner link we store that one statement (the figures, guest names in the form you chose to show, your branding and note), the owner's email address, and how many times it was opened.</li>
      <li><b>Your plan.</b> If you subscribe we store your plan, its status and the IDs Stripe gives your customer record and subscription. We never receive or store card details.</li>
      <li><b>Free-trial record.</b> If you start a plan or free trial, we keep a scrambled code made from your Google account ID, even after you delete your account, only so the free trial can't be claimed twice. It can't be turned back into your email or name.</li>
      <li><b>Abuse protection.</b> To limit how many owner links can be created from one network, we keep a scrambled (keyed hash) form of your IP address for 24 hours, then delete it.</li>
      <li><b>Technical data.</b> Our host, Cloudflare, processes your IP address and basic request details to deliver the site and protect it from attacks.</li>
    </ul>
    <p>We don't use analytics, advertising or tracking tools, we don't build profiles about you, and we don't sell or share your personal information for advertising.</p>

    <h2>Why we use it</h2>
    <p>Only to provide Mint Statements: to sign you in, keep your work in your account, show a statement to the person you shared it with, give you the plan you pay for, keep the service secure and prevent abuse, and meet legal obligations. Where EU or UK law applies, our legal bases are performing our contract with you and our legitimate interest in keeping the service secure.</p>

    <h2>Information about other people</h2>
    <p>Your Airbnb report contains information about your guests, and you may enter owners' email addresses. You're responsible for having the right to upload and share that information. We process it only to provide the service to you.</p>

    <h2>Who can see a statement you share</h2>
    <p>Only the email address you entered for the owner, after they sign in with that Google account, and you. Owner links made before sign-in existed aren't tied to an email: anyone signed in who has one of those links can open it. Every owner link stops working 30 days after it's made, and you can delete any link sooner from your dashboard.</p>

    <h2>Who we share it with</h2>
    <ul>
      <li><b>Google</b>, to sign you in.</li>
      <li><b>Cloudflare</b>, which hosts the site and the database where your account data is stored.</li>
      <li><b>Stripe and Link</b>, which sell and process subscriptions as the merchant of record, including card details, receipts and sales tax. Their own privacy policies cover what they collect at checkout.</li>
      <li>Authorities, if the law requires it, and a buyer of our business if it's ever sold (they'd be bound by this policy).</li>
    </ul>

    <h2>How long we keep it</h2>
    <ul>
      <li>Your account and what you've saved: until you delete it or delete your account.</li>
      <li>Owner links: until you delete them or your account. They stop opening 30 days after they're made.</li>
      <li>Sign-in sessions: up to 30 days. The scrambled IP address: 24 hours.</li>
      <li>Plan records: while your account exists. Stripe keeps its own payment records as the law requires.</li>
      <li>The free-trial record: kept after your account is deleted, so the trial can only be used once.</li>
    </ul>

    <h2>Your choices and rights</h2>
    <ul>
      <li><b>Delete:</b> "Delete my saved data" removes your CSV, settings and saved statements; "Delete my account" on your dashboard removes your account and everything stored for it. If you have a subscription, cancel it first.</li>
      <li><b>Access, correct or get a copy:</b> email {E} and we'll respond within 30 days.</li>
      <li><b>California residents</b> can ask what personal information we hold, ask us to delete or correct it, and won't be treated differently for asking. We don't sell or share personal information.</li>
      <li><b>EU and UK residents</b> also have the right to object, to restrict processing, to data portability and to complain to their local data protection authority.</li>
    </ul>

    <h2>Do Not Track</h2>
    <p>We don't track you across other websites, so browser "Do Not Track" and Global Privacy Control signals don't change anything here.</p>

    <h2>Cookies</h2>
    <p>We use only the cookies needed to sign you in. See the <a href="/cookies">cookie policy</a>.</p>

    <h2>Security</h2>
    <p>Data is sent over encrypted connections. Sign-in cookies can't be read by page scripts, only scrambled (hashed) copies of session tokens are stored, and each account can only reach its own data. No system is perfectly secure; if we learn of a breach affecting you, we'll tell you as the law requires.</p>

    <h2>Children</h2>
    <p>Mint Statements is for adults running a hosting business. It isn't meant for anyone under 18, and we don't knowingly collect information from children.</p>

    <h2>Where data is processed</h2>
    <p>We're in the United States. Our providers may process data in the United States and other countries where they operate.</p>

    <h2>Changes</h2>
    <p>If we change this policy we'll update this page and the date at the top, and tell signed-in users about important changes.</p>
''')

pages["terms"] = ("Terms of service", "The terms for using Mint Statements.", f'''
    <p>These terms are an agreement between you and {C} ("we", "us"), a business based in California, USA, which runs mintstatements.com. By creating an account or using Mint Statements you agree to them. If you use it for a business, you agree on that business's behalf.</p>

    <h2>1. Who can use it</h2>
    <p>You must be at least 18 and able to enter a contract. You sign in with a Google account and are responsible for what happens under your account.</p>

    <h2>2. What Mint Statements does</h2>
    <p>Mint Statements reads the Airbnb transaction report you upload and helps you produce owner statements and earnings reports, share them through owner links, and export them. The Free plan covers one property; paid plans cover more, as shown on the pricing page. We may improve, change or retire features; if we remove something central to a paid plan, we'll tell you first.</p>

    <h2>3. Free trial, billing and renewal</h2>
    <ul>
      <li><b>Trial.</b> New Host and Pro subscribers get a 7-day free trial, once per account. You enter a card at checkout. If you don't cancel before the trial ends, you're charged the price shown and the plan starts.</li>
      <li><b>Automatic renewal.</b> Paid plans renew automatically every month or year, at the price shown when you subscribed, until you cancel. Prices are in US dollars; tax is added where it applies.</li>
      <li><b>Who sells it.</b> Subscriptions are sold and processed by Stripe and its Link service as the merchant of record, and their checkout and payment terms also apply. Your card statement may show "LINK.COM*".</li>
      <li><b>Cancelling.</b> Cancel anytime under Manage subscription in the app or on your dashboard. You keep your plan until the end of the period you've paid for and won't be charged again.</li>
      <li><b>Refunds.</b> See the <a href="/refunds">refund policy</a>.</li>
      <li><b>Price changes.</b> We'll tell you at least 30 days before a price change applies to your plan, and you can cancel before it does.</li>
      <li><b>Failed payments.</b> If a renewal payment fails, Stripe retries it. If it can't be collected, the subscription ends and your account returns to the Free plan.</li>
    </ul>

    <h2>4. Your content</h2>
    <p>What you upload and create stays yours. You give us permission to store and process it only to run Mint Statements for you, including showing owner links to the people you share them with. You're responsible for having the right to upload the information in your files, including guests' names and booking details, and to share statements with the owners you choose.</p>

    <h2>5. Owner links</h2>
    <p>Only the email address you enter (signed in with Google) and you can open an owner link. Links stop working 30 days after they're made. Make sure you enter the right email; you're responsible for who you share with.</p>

    <h2>6. Check your numbers</h2>
    <p>Mint Statements calculates from the file and settings you provide. It isn't accounting, tax, legal or financial advice, and we don't guarantee that results are error-free. Review every statement before you send it or rely on it, and check anything tax-related with a qualified professional.</p>

    <h2>7. Acceptable use</h2>
    <p>Don't use Mint Statements to break the law, to upload information you have no right to use, to harass anyone, to probe or disrupt the service or other accounts, or to resell it without our permission. We may suspend accounts that do.</p>

    <h2>8. Airbnb and other services</h2>
    <p>Mint Statements is not affiliated with, endorsed or sponsored by Airbnb. Airbnb is a trademark of Airbnb, Inc. Sign-in is provided by Google and payments by Stripe; their terms apply to their services.</p>

    <h2>9. Ending your account</h2>
    <p>You can delete your account from your dashboard at any time (cancel any subscription first). We may suspend or close an account that breaks these terms, or close the service with at least 30 days' notice, in which case we'll refund any unused prepaid period.</p>

    <h2>10. Disclaimers</h2>
    <p>To the extent the law allows, Mint Statements is provided "as is" and "as available", without warranties of any kind, including warranties of merchantability, fitness for a particular purpose and non-infringement. We don't promise the service will be uninterrupted or error-free.</p>

    <h2>11. Limitation of liability</h2>
    <p>To the extent the law allows, we aren't liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue or data, and our total liability for any claim is limited to the greater of the amount you paid us in the 12 months before the claim or US $50. Some places don't allow these limits, so they may not apply to you.</p>

    <h2>12. Indemnity</h2>
    <p>If you use Mint Statements for a business, you'll cover our reasonable costs from claims by others that arise from your content or your breach of these terms.</p>

    <h2>13. Disputes and governing law</h2>
    <p>California law governs these terms, without regard to conflict-of-law rules. Before bringing a claim, please contact us at {E} so we can try to resolve it informally within 30 days. Claims are to be brought in the state or federal courts located in California, unless the law where you live gives you the right to bring them elsewhere. Nothing here limits rights you have as a consumer that can't be waived.</p>

    <h2>14. Changes to these terms</h2>
    <p>We may update these terms. We'll post the new version here with a new date and tell signed-in users about important changes before they take effect. If you keep using Mint Statements after that, the new terms apply.</p>

    <h2>15. Contact</h2>
    <p>{C}, California, USA · {E}</p>

    <h2>Open-source credits</h2>
    <p>Mint Statements uses three.js and cannon-es (MIT License) for the homepage animation, and the Inter and Bricolage Grotesque typefaces (SIL Open Font License 1.1; <a href="/fonts/OFL.txt">license text</a>).</p>
''')

pages["refunds"] = ("Refund policy", "How cancelling and refunds work for Mint Statements subscriptions.", f'''
    <p>This policy covers Host and Pro subscriptions to Mint Statements{RUN_BY.rstrip(",")}.</p>

    <h2>Free trial</h2>
    <p>New subscribers get a 7-day free trial, once per account. Cancel before it ends and you won't be charged.</p>

    <h2>Cancel anytime</h2>
    <p>Cancel under Manage subscription in the app or on your dashboard. Cancelling stops the next renewal; you keep your plan until the end of the period you've already paid for.</p>

    <h2>No refunds for partial periods</h2>
    <p>Payments are non-refundable, and we don't give refunds or credits for unused time in a monthly or yearly period, including when you cancel or switch to a lower plan part-way through.</p>

    <h2>When we do refund</h2>
    <ul>
      <li>If you were charged by mistake, for example twice for the same period, or after you'd cancelled.</li>
      <li>If we close the service, for any unused prepaid period.</li>
      <li>Where the law of the place you live gives you a right to a refund or to withdraw from the purchase.</li>
    </ul>
    <p>Purchases are sold through Stripe's Link service as the merchant of record. Link support can also help with a payment and, under its own policies, may issue a refund within 60 days of a charge.</p>

    <h2>How to ask</h2>
    <p>Email {E} from the email address you sign in with, and include the date and amount of the charge. We reply within 5 business days.</p>
''')

pages["cookies"] = ("Cookie policy", "The cookies and browser storage Mint Statements uses.", f'''
    <p>Mint Statements uses only what's needed to sign you in and run the app. There are no analytics, advertising or tracking cookies, so there's no cookie banner to accept.</p>

    <h2>Cookies</h2>
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Cookies used"><table class="tbl legal-tbl">
      <thead><tr><th scope="col">Name</th><th scope="col">What it's for</th><th scope="col">How long</th></tr></thead>
      <tbody>
        <tr><td>om_session</td><td>Keeps you signed in. Only a scrambled copy is stored on our side, and page scripts can't read it.</td><td>Up to 30 days, or until you sign out</td></tr>
        <tr><td>om_oauth</td><td>Protects the Google sign-in step from forgery while you sign in.</td><td>10 minutes</td></tr>
      </tbody>
    </table></div>
    <p>Both are strictly necessary: without them you can't sign in. They're first-party (set by mintstatements.com) and never used for tracking.</p>

    <h2>Browser storage</h2>
    <p>The app keeps a copy of your work in your browser's local storage so it loads quickly and keeps working if your connection drops. It's cleared when you sign out.</p>

    <h2>Other sites</h2>
    <p>When you sign in, you're briefly on Google's site, and when you subscribe you're on Stripe's checkout. Those sites set their own cookies under their own policies. Mint Statements doesn't load any third-party scripts, fonts or trackers on its own pages.</p>

    <h2>Your choices</h2>
    <p>You can block or delete cookies in your browser settings, but you won't be able to sign in without the two above. Questions: {E}.</p>
''')

for slug, (title, desc, body) in pages.items():
    open(f"{out}/{slug}.html", "w").write(page(slug, title, desc, body))
print("wrote", ", ".join(pages))
