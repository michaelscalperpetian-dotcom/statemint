import { getUser } from "./_auth.js";
// The statement builder and dashboard need a signed-in user; everything else passes straight through.
const PROTECTED = new Set(["/app", "/app.html", "/dashboard", "/dashboard.html"]);
// The site's real address. Pages opened on the old pages.dev address are sent here (same path and query).
// /api/ is left alone so Stripe's webhook, which is registered on the old address, keeps working.
const MAIN_HOST = "mintstatements.com", OLD_HOST = "statemint-994.pages.dev";
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.hostname === OLD_HOST && !url.pathname.startsWith("/api/") && (request.method === "GET" || request.method === "HEAD"))
    return new Response(null, { status: 301, headers: { location: `https://${MAIN_HOST}${url.pathname}${url.search}` } });
  if (!PROTECTED.has(url.pathname)) return next();
  if (await getUser(request, env)) return next();
  const target = url.pathname.replace(/\.html$/, "") + url.search;
  return new Response(null, { status: 302, headers: { location: "/login?next=" + encodeURIComponent(target), "cache-control": "no-store" } });
}
