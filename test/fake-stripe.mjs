// A small stand-in for the Stripe endpoints Ownermint uses, for local tests only.
import http from "node:http";
export const state = { subStatus: "active", subPrice: "price_test_host_month", lastCheckout: null, lastPortal: null, sessions: {} };
const SUB = () => ({ id: "sub_test_1", object: "subscription", customer: "cus_test_1", status: state.subStatus, items: { data: [{ price: { id: state.subPrice } }] } });
export function start(port = 8799) {
  const server = http.createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== "Bearer sk_test_fake") return send(401, { error: { message: "Invalid API Key provided" } });
    let raw = ""; req.on("data", c => (raw += c)); req.on("end", () => {
      const url = new URL(req.url, "http://x"), form = Object.fromEntries(new URLSearchParams(raw));
      if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
        state.lastCheckout = form; const id = "cs_test_new" + Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, "");
        state.sessions[id] = { id, status: "complete", mode: "subscription", customer: "cus_test_1", subscription: "sub_test_1" };
        return send(200, { id, url: "https://checkout.stripe.com/c/pay/" + id });
      }
      if (req.method === "POST" && url.pathname === "/v1/billing_portal/sessions") { state.lastPortal = form; return send(200, { url: "https://billing.stripe.com/p/session/test_portal" }); }
      const m = url.pathname.match(/^\/v1\/checkout\/sessions\/(cs_test_\w+)$/);
      if (m) {
        const expand = url.searchParams.getAll("expand[]").includes("subscription");
        if (m[1] === "cs_test_paidhost1234") return send(200, { id: m[1], status: "complete", mode: "subscription", customer: "cus_test_1", subscription: expand ? SUB() : "sub_test_1" });
        if (m[1] === "cs_test_unpaid12345") return send(200, { id: m[1], status: "open", mode: "subscription", subscription: null });
        if (state.sessions[m[1]]) return send(200, { ...state.sessions[m[1]], subscription: expand ? SUB() : "sub_test_1" });
        return send(404, { error: { message: "No such checkout.session" } });
      }
      if (url.pathname === "/v1/subscriptions/sub_test_1") return send(200, SUB());
      send(404, { error: { message: "not found" } });
    });
  });
  server.listen(port); return server;
}
if (process.argv[1] && process.argv[1].endsWith("fake-stripe.mjs")) { start(); console.log("fake stripe on 8799"); }
