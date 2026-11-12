export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
// subtle: keeps the normal pointer and adds only a small, quick ring (used on statement pages, where people read).
export function cursor({ subtle = false } = {}) {
  if (!fine || reduce) return;
  document.body.classList.add(subtle ? "cursor-subtle" : "has-cursor");
  const dot = Object.assign(document.createElement("div"), { className: "c-dot" });
  const ring = Object.assign(document.createElement("div"), { className: "c-ring" });
  document.body.append(dot, ring);
  let x = -100, y = -100, rx = x, ry = y, running = false;
  const k = subtle ? .45 : .17;
  function loop() { rx += (x - rx) * k; ry += (y - ry) * k; ring.style.transform = `translate(${rx}px,${ry}px)`;
    if (Math.abs(x - rx) + Math.abs(y - ry) > 0.3) requestAnimationFrame(loop); else running = false; }
  addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px,${y}px)`; if (!running) { running = true; requestAnimationFrame(loop); } }, { passive: true });
  document.addEventListener("pointerover", e => ring.classList.toggle("hover", !!e.target.closest?.("a,button,input,select,label,.drop,[data-hover]")));

}
export function magnetic(root = document) {
  if (!fine || reduce) return;
  root.querySelectorAll("[data-magnetic]").forEach(el => {
    const inner = el.firstElementChild; const k = Number(el.dataset.magnetic) || .3;
    el.addEventListener("pointermove", e => { const r = el.getBoundingClientRect(); const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${dx * k}px,${dy * k}px)`; if (inner) inner.style.transform = `translate(${dx * k * .5}px,${dy * k * .5}px)`; });
    el.addEventListener("pointerleave", () => { el.style.transition = "transform .7s cubic-bezier(.2,.9,.25,1.4), box-shadow .25s"; el.style.transform = ""; if (inner) { inner.style.transition = "transform .7s cubic-bezier(.2,.9,.25,1.4)"; inner.style.transform = ""; }
      setTimeout(() => { el.style.transition = ""; if (inner) inner.style.transition = ""; }, 700); });
  });
}
export function tilt(el, target = el, max = 10) {
  if (reduce) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
  function loop() { cx += (tx - cx) * .07; cy += (ty - cy) * .07; el.style.transform = `rotateY(${cx}deg) rotateX(${cy}deg)`;
    if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02) requestAnimationFrame(loop); else running = false; }
  const kick = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
  target.addEventListener("pointermove", e => { const r = target.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - .5) * 2 * max; ty = -((e.clientY - r.top) / r.height - .5) * 2 * max; kick(); });
  target.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
}
export function reveals() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .15 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
}
export function splitWords(el) {
  const html = el.innerHTML; const tmp = document.createElement("div"); tmp.innerHTML = html; el.innerHTML = ""; let i = 0;
  tmp.childNodes.forEach(node => {
    const words = (node.textContent || "").split(/(\s+)/);
    words.forEach(w => {
      if (!w.trim()) { el.appendChild(document.createTextNode(w)); return; }
      const o = document.createElement("span"); o.className = "word"; const s = document.createElement("span"); s.textContent = w;
      if (node.nodeType === 1) s.className = node.className; s.style.animationDelay = `${.07 * i++ + .15}s`; o.appendChild(s); el.appendChild(o);
    });
  });
}
export function toast(msg) {
  let t = document.querySelector(".toast"); if (!t) { t = Object.assign(document.createElement("div"), { className: "toast" }); t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("in"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("in"), 2400);
}
export async function copy(text) { try { await navigator.clipboard.writeText(text); toast("Link copied ✦"); } catch { prompt("Copy this link:", text); } }
// App storage. Values live in this browser and, when signed in, are copied to the account (see account.js).
const storeListeners = [];
export const store = {
  get(k, d) { try { const v = localStorage.getItem("ownermint:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { let ok = false; try { localStorage.setItem("ownermint:" + k, JSON.stringify(v)); ok = true; } catch {} storeListeners.forEach(f => f(k, v)); return ok; },
  onChange(f) { storeListeners.push(f); },
};
// A small "done" moment for Save / CSV / Print buttons: the button presses in, a mint coin pops out of it with a few
// sparkles, and the label briefly confirms. With reduced motion, only the label changes.
export function celebrate(btn, doneText, { gold = false } = {}) {
  if (!btn) return;
  const label = btn.querySelector("span") || btn;
  if (!btn.dataset.label) btn.dataset.label = label.textContent;
  label.textContent = doneText; clearTimeout(btn._done);
  btn._done = setTimeout(() => { label.textContent = btn.dataset.label; delete btn.dataset.label; }, 1500);
  if (reduce) return;
  btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
  const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const fx = Object.assign(document.createElement("div"), { className: "celebrate" }); fx.setAttribute("aria-hidden", "true");
  fx.style.left = x + "px"; fx.style.top = y + "px";
  const coin = Object.assign(document.createElement("i"), { className: "cel-coin" + (gold ? " gold" : ""), textContent: "$" }); fx.appendChild(coin);
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.48, d = 30 + (i % 3) * 9, s = document.createElement("b");
    s.className = "cel-spark"; s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d - 10 + "px"); s.style.animationDelay = 60 + i * 15 + "ms"; fx.appendChild(s); }
  document.body.appendChild(fx); setTimeout(() => fx.remove(), 1100);
}
