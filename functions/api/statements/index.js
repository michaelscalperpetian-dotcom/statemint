import { json, bad, randomId } from "../../_lib.js";
// Saves a statement snapshot so the owner can open it as a live web page.
export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (text.length > 250000) return bad("Statement too large", 413);
  let body; try { body = JSON.parse(text); } catch { return bad("Invalid JSON"); }
  if (!body || !body.statement || !body.statement.totals || !Array.isArray(body.statement.lines)) return bad("Missing statement");
  const id = randomId(12), editKey = randomId(24);
  await env.DB.prepare("INSERT INTO statements (id, edit_key, data, created_at) VALUES (?, ?, ?, ?)").bind(id, editKey, text, Date.now()).run();
  return json({ id, editKey }, 201);
}
