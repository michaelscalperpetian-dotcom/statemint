// Accounts in the browser: who is signed in, and keeping this browser's app data in sync with the account.
import { store } from "/js/fx.js?v=23bc8adf";
const PREFIX = "ownermint:", OWNER_KEY = PREFIX + "__account", PENDING_KEY = PREFIX + "__pending";
const LOCAL_ONLY = new Set(["license", "__account", "__pending"]); // never sent to the server
// Keys changed in this browser but not yet confirmed saved to the account. Kept in localStorage so a change made
// just before leaving the page isn't lost: the next page re-sends it instead of overwriting it with the server copy.
// Stored as { key: time of the change } so an old unsent change never overwrites a newer one from another device.
const readPending = () => { try { const v = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const writePending = map => { try { Object.keys(map).length ? localStorage.setItem(PENDING_KEY, JSON.stringify(map)) : localStorage.removeItem(PENDING_KEY); } catch {} };
const localKeys = () => { try { return Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length)); } catch { return []; } };
const clearLocal = () => { try { localKeys().forEach(k => localStorage.removeItem(PREFIX + k)); } catch {} };
export const signInUrl = (next = location.pathname + location.search) => "/login?next=" + encodeURIComponent(next);

export async function fetchMe() {
  try { const r = await fetch("/api/me", { cache: "no-store" }); if (r.status === 401) return null; if (r.ok) return await r.json(); } catch {}
  throw new Error("offline");
}

let pending = {}, timer = null, syncing = false, lastError = null;
async function flush() {
  if (syncing) { timer = setTimeout(flush, 400); return; }
  const items = pending; pending = {}; timer = null;
  if (!Object.keys(items).length) return;
  syncing = true;
  try {
    const body = JSON.stringify({ items });
    // keepalive lets the save finish if the page is closing (browsers allow it for small bodies only)
    const r = await fetch("/api/data", { method: "PUT", headers: { "content-type": "application/json" }, body, keepalive: body.length < 60000 });
    if (r.status === 401) { location.href = signInUrl(); return; }
    if (!r.ok) { const d = await r.json().catch(() => ({})); lastError = d.error || "Couldn't save to your account."; window.dispatchEvent(new CustomEvent("om-sync-error", { detail: lastError })); }
    else { lastError = null; const p = readPending(); for (const k of Object.keys(items)) if (!(k in pending)) delete p[k]; writePending(p); }
  } catch { lastError = "You're offline. Changes are kept in this browser and will be saved when you're back online."; pending = { ...items, ...pending }; timer = setTimeout(flush, 5000); }
  syncing = false;
}
function queue(k, v) {
  if (LOCAL_ONLY.has(k)) return;
  pending[k] = v === undefined ? null : JSON.stringify(v);
  writePending({ ...readPending(), [k]: Date.now() });
  clearTimeout(timer); timer = setTimeout(flush, 600);
}
export function removeKey(k) { try { localStorage.removeItem(PREFIX + k); } catch {} queue(k, undefined); }
addEventListener("pagehide", () => { if (timer) { clearTimeout(timer); flush(); } });

// Signed-in check + data sync. Call (and await) before reading app storage. Redirects to sign-in if needed.
export async function ensureSession() {
  let me;
  try { me = await fetchMe(); } catch { me = null; }
  if (!me) { location.replace(signInUrl()); await new Promise(() => {}); }
  const owner = (() => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } })();
  if (owner && owner !== me.user.email) clearLocal(); // another account used this browser: never mix data
  let r = null; try { r = await fetch("/api/data", { cache: "no-store" }); } catch {}
  if (!r || !r.ok) {
    // couldn't read the account: keep what this browser has rather than risk wiping it; changes still sync later
    try { localStorage.setItem(OWNER_KEY, me.user.email); } catch {}
    store.onChange(queue); me.syncFailed = true; return me;
  }
  const { items = {}, updated = {} } = await r.json();
  const serverKeys = Object.keys(items);
  // changes this browser made for this account that may not have reached the server yet (newer than the server's copy)
  const unsent = {}, unsentAt = {};
  if (owner === me.user.email) for (const [k, at] of Object.entries(readPending())) {
    // only changes newer than the server's copy, and from the last day (so an old leftover never revives deleted data)
    if (LOCAL_ONLY.has(k) || !(Number(at) > (updated[k] || 0)) || Date.now() - Number(at) > 86400000) continue;
    try { unsent[k] = localStorage.getItem(PREFIX + k); unsentAt[k] = at; } catch {}
  }
  const resend = () => { if (!Object.keys(unsent).length) return; Object.assign(pending, unsent); writePending(unsentAt); timer = setTimeout(flush, 0); };
  if (serverKeys.length) {
    // the account is the source of truth, except for this browser's own newer unsent changes
    clearLocal();
    for (const k of serverKeys) { try { localStorage.setItem(PREFIX + k, items[k]); } catch {} }
    for (const [k, v] of Object.entries(unsent)) { try { v == null ? localStorage.removeItem(PREFIX + k) : localStorage.setItem(PREFIX + k, v); } catch {} }
    resend();
  } else if (owner === me.user.email) {
    clearLocal();
    for (const [k, v] of Object.entries(unsent)) { try { if (v != null) localStorage.setItem(PREFIX + k, v); } catch {} }
    resend();
  } else {
    // first sign-in: bring along whatever this browser already had (only if it wasn't another account's)
    const keys = localKeys().filter(k => !LOCAL_ONLY.has(k));
    if (keys.length && !owner) {
      const upload = {}; for (const k of keys) { try { upload[k] = localStorage.getItem(PREFIX + k); } catch {} }
      const big = Object.entries(upload).filter(([, v]) => v && v.length > 1900000).map(([k]) => k);
      big.forEach(k => delete upload[k]);
      await fetch("/api/data", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: upload }) }).catch(() => {});
      me.imported = keys.length - big.length;
    }
  }
  try { localStorage.setItem(OWNER_KEY, me.user.email); } catch {}
  store.onChange(queue);
  return me;
}
export async function signOut() {
  if (timer) { clearTimeout(timer); await flush(); }
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  clearLocal(); location.href = "/";
}
// Deletes all app data in the account and in this browser (the account itself stays).
export async function deleteAllData() {
  const r = await fetch("/api/data", { method: "DELETE" });
  if (!r.ok) throw new Error("Couldn't delete your data. Please try again.");
  pending = {}; clearTimeout(timer); clearLocal();
}
export const syncError = () => lastError;
