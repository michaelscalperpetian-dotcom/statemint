export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
export function cursor() {
  if (!fine || reduce) return;
  document.body.classList.add("has-cursor");
  const dot = Object.assign(document.createElement("div"), { className: "c-dot" });
  const ring = Object.assign(document.createElement("div"), { className: "c-ring" });
  document.body.append(dot, ring);
  let x = -100, y = -100, rx = x, ry = y;
  addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px,${y}px)`; }, { passive: true });
  document.addEventListener("pointerover", e => ring.classList.toggle("hover", !!e.target.closest?.("a,button,input,select,label,.drop,[data-hover]")));
  (function loop() { rx += (x - rx) * .17; ry += (y - ry) * .17; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(loop); })();
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
  let tx = 0, ty = 0, cx = 0, cy = 0;
  target.addEventListener("pointermove", e => { const r = target.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - .5) * 2 * max; ty = -((e.clientY - r.top) / r.height - .5) * 2 * max; });
  target.addEventListener("pointerleave", () => { tx = 0; ty = 0; });
  (function loop() { cx += (tx - cx) * .07; cy += (ty - cy) * .07; el.style.transform = `rotateY(${cx}deg) rotateX(${cy}deg)`; requestAnimationFrame(loop); })();
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
  let t = document.querySelector(".toast"); if (!t) { t = Object.assign(document.createElement("div"), { className: "toast" }); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("in"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("in"), 2400);
}
export async function copy(text) { try { await navigator.clipboard.writeText(text); toast("Link copied ✦"); } catch { prompt("Copy this link:", text); } }
export const store = {
  get(k, d) { try { const v = localStorage.getItem("statemint:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("statemint:" + k, JSON.stringify(v)); return true; } catch { return false; } },
};
