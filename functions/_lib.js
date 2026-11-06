export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const bad = (error, status = 400) => json({ error }, status);
export function randomId(len) { const a = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (const b of crypto.getRandomValues(new Uint8Array(len))) s += a[b % a.length]; return s; }
export function sameKey(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
export const validId = id => /^[A-Za-z0-9]{8,20}$/.test(id || "");
