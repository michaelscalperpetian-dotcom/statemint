import { getUser } from "./_auth.js";
// The statement builder and dashboard need a signed-in user; everything else passes straight through.
const PROTECTED = new Set(["/app", "/app.html", "/dashboard", "/dashboard.html"]);
// The site's real address. Pages opened on the old pages.dev address are sent here (same path and query).
// /api/ is left alone so Stripe's webhook, which is registered on the old address, keeps working.
// The www address goes to the same place, so there is one address for sign-in, cookies and links.
const MAIN_HOST = "mintstatements.com", OTHER_HOSTS = new Set(["statemint-994.pages.dev", "www.mintstatements.com"]);
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (OTHER_HOSTS.has(url.hostname) && !url.pathname.startsWith("/api/") && (request.method === "GET" || request.method === "HEAD"))
    return new Response(null, { status: 301, headers: { location: `https://${MAIN_HOST}${url.pathname}${url.search}` } });
  if (!PROTECTED.has(url.pathname)) return next();
  if (await getUser(request, env)) return next();
  const target = url.pathname.replace(/\.html$/, "") + url.search;
  return new Response(null, { status: 302, headers: { location: "/login?next=" + encodeURIComponent(target), "cache-control": "no-store" } });
}
