import { getUser } from "./_auth.js";
// The statement builder and dashboard need a signed-in user; everything else passes straight through.
const PROTECTED = new Set(["/app", "/app.html", "/dashboard", "/dashboard.html"]);
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (!PROTECTED.has(url.pathname)) return next();
  if (await getUser(request, env)) return next();
  const target = url.pathname.replace(/\.html$/, "") + url.search;
  return new Response(null, { status: 302, headers: { location: "/login?next=" + encodeURIComponent(target), "cache-control": "no-store" } });
}
