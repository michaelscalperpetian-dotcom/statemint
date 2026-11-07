// A tiny stand-in for the two Stripe endpoints Ownermint reads, for local tests only.
import http from "node:http";
export const state = { subStatus: "active" };
const SUB = () => ({ id: "sub_test_1", object: "subscription", status: state.subStatus, items: { data: [{ price: { id: "price_1UYytTFn7xT3nivOANtqXBFb" } }] } });
export function start(port = 8799) {
  const server = http.createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== "Bearer sk_test_fake") return send(401, { error: { message: "Invalid API Key provided" } });
    const url = new URL(req.url, "http://x");
    const m = url.pathname.match(/^\/v1\/checkout\/sessions\/(cs_test_\w+)$/);
    if (m) {
      if (m[1] === "cs_test_paidhost1234") return send(200, { id: m[1], status: "complete", mode: "subscription", subscription: SUB() });
      if (m[1] === "cs_test_unpaid12345") return send(200, { id: m[1], status: "open", mode: "subscription", subscription: null });
      return send(404, { error: { message: "No such checkout.session" } });
    }
    if (url.pathname === "/v1/subscriptions/sub_test_1") return send(200, SUB());
    send(404, { error: { message: "not found" } });
  });
  server.listen(port); return server;
}
if (process.argv[1] && process.argv[1].endsWith("fake-stripe.mjs")) { start(); console.log("fake stripe on 8799"); }
