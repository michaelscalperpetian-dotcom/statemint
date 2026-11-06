// 3D hero: floating island + house, physics coins that react to the cursor.
import * as THREE from "/vendor/three.module.min.js";

export function startHero(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07130f, 18, 34);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const camBase = new THREE.Vector3(9, 8.5, 12);

  scene.add(new THREE.HemisphereLight(0xcffff0, 0x0b2a22, 1.1));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
  sun.position.set(6, 12, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  scene.add(sun);
  const rim = new THREE.PointLight(0x2fd3a0, 30, 20); rim.position.set(-6, 4, -4); scene.add(rim);

  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true });
  const world = new THREE.Group(); scene.add(world);

  // island
  const R = 4.2;
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.5, 9), mat(0x2b8f6f)); grass.position.y = -0.25; grass.receiveShadow = true; world.add(grass);
  const earth = new THREE.Mesh(new THREE.ConeGeometry(R * 0.98, 3.2, 9), mat(0x5b3f2f)); earth.rotation.x = Math.PI; earth.position.y = -2.1; world.add(earth);
  // path
  const path = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 2.2), mat(0xe8dcc0)); path.position.set(0.6, 0.01, 2.3); path.receiveShadow = true; world.add(path);

  // house
  const house = new THREE.Group(); world.add(house); house.position.set(0.6, 0, -0.4);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 2), mat(0xf4efe4)); body.position.y = 0.85; body.castShadow = body.receiveShadow = true; house.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.3, 4), mat(0x2fd3a0)); roof.position.y = 2.35; roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 1, 1.05); roof.castShadow = true; house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), mat(0x0b5d4b)); door.position.set(0, 0.45, 1.01); house.add(door);
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc94a, emissiveIntensity: 0.9 });
  [[-0.75, 1.05], [0.75, 1.05]].forEach(([x, y]) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.05), winMat); w.position.set(x, y, 1.01); house.add(w); });
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), mat(0xc96b4b)); chimney.position.set(-0.6, 2.6, -0.3); chimney.castShadow = true; house.add(chimney);
  // trees
  [[-2.6, -1.2, 1], [-2.1, 1.6, 0.8], [2.9, 1.0, 0.9], [2.4, -2.2, 1.1], [-0.9, -2.8, 0.7]].forEach(([x, z, s]) => {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.5, 6), mat(0x6b4a34)); trunk.position.y = 0.25; trunk.castShadow = true;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 7), mat(0x1f7a5c)); top.position.y = 1.05; top.castShadow = true;
    t.add(trunk, top); world.add(t);
  });

  // coins
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 24);
  const coinMats = [
    new THREE.MeshStandardMaterial({ color: 0x2fd3a0, metalness: 0.55, roughness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0xf5c451, metalness: 0.75, roughness: 0.22 }),
  ];
  const coins = []; const MAX = reduce ? 0 : 70; const rad = 0.3;
  function spawn(x = (Math.random() - 0.5) * 6, z = (Math.random() - 0.5) * 6, y = 6 + Math.random() * 6) {
    if (coins.length >= MAX) { const old = coins.shift(); world.remove(old.mesh); }
    const mesh = new THREE.Mesh(coinGeo, coinMats[Math.random() < 0.6 ? 0 : 1]); mesh.castShadow = true;
    mesh.position.set(x, y, z); mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    world.add(mesh);
    coins.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5), w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), settled: 0 });
  }
  for (let i = 0; i < (reduce ? 0 : 28); i++) setTimeout(() => spawn(), i * 90);

  // pointer -> world point on ground plane
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3(999, 0, 999); let hasHit = false, mx = 0, my = 0;
  addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mx = ndc.x; my = ndc.y;
  }, { passive: true });
  canvas.addEventListener("pointerdown", () => {
    ray.setFromCamera(ndc, camera); const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(ground, p)) for (let i = 0; i < 12; i++) spawn(p.x + (Math.random() - .5), p.z + (Math.random() - .5), 4 + Math.random() * 3);
  });

  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.copy(camBase).multiplyScalar(w < 720 ? 1.45 : 1); camera.updateProjectionMatrix();
    if (w >= 900) { world.position.x = 2.4; world.position.z = -1.8; } else { world.position.x = 0; world.position.z = 0; } }
  addEventListener("resize", resize); resize();

  const g = -18, clock = new THREE.Clock(); let t = 0, scrollY0 = 0;
  addEventListener("scroll", () => { scrollY0 = scrollY; }, { passive: true });
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  function frame() {
    const dt = Math.min(0.033, clock.getDelta()); t += dt;
    // camera parallax + scroll dolly
    const k = Math.min(1, scrollY0 / innerHeight);
    const base = camBase.clone().multiplyScalar(canvas.clientWidth < 720 ? 1.45 : 1);
    camera.position.lerp(new THREE.Vector3(base.x + mx * 1.6, base.y + my * 1.0 + k * 3, base.z + k * 4), 0.05);
    camera.lookAt(0.3, 0.6 - k * 1.5, 0);
    world.position.y = Math.sin(t * 0.8) * 0.12; world.rotation.y = Math.sin(t * 0.25) * 0.08;
    ray.setFromCamera(ndc, camera); hasHit = !!ray.ray.intersectPlane(ground, hit);

    for (let i = 0; i < coins.length; i++) {
      const c = coins[i], p = c.mesh.position;
      c.v.y += g * dt;
      // cursor pushes coins outward
      if (hasHit) { tmp.set(p.x - hit.x, 0, p.z - hit.z); const d = tmp.length(); if (d < 1.4 && p.y < 1.5) { tmp.normalize().multiplyScalar((1.4 - d) * 40 * dt); c.v.add(tmp); c.v.y += (1.4 - d) * 18 * dt; c.settled = 0; } }
      p.addScaledVector(c.v, dt);
      const onIsland = Math.hypot(p.x, p.z) < R - 0.2;
      if (onIsland && p.y < rad * 0.3) {
        p.y = rad * 0.3;
        if (c.v.y < -1.5) { c.v.y *= -0.35; c.w.multiplyScalar(0.6); } else c.v.y = 0;
        c.v.x *= 0.9; c.v.z *= 0.9;
        // settle flat
        c.mesh.quaternion.slerp(q.setFromUnitVectors(up, up).multiply(new THREE.Quaternion().setFromAxisAngle(up, c.mesh.rotation.y)), 0.12);
        c.w.multiplyScalar(0.85); c.settled += dt;
      }
      // simple coin-coin separation
      for (let j = i + 1; j < coins.length; j++) {
        const o = coins[j].mesh.position; tmp.subVectors(p, o); const d = tmp.length();
        if (d > 0 && d < rad * 2) { tmp.multiplyScalar((rad * 2 - d) / d * 0.5); p.add(tmp); o.sub(tmp); }
      }
      c.mesh.rotation.x += c.w.x * dt; c.mesh.rotation.z += c.w.z * dt;
      if (p.y < -12) { p.set((Math.random() - 0.5) * 6, 8 + Math.random() * 4, (Math.random() - 0.5) * 6); c.v.set(0, 0, 0); }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  // gentle rain every few seconds
  if (!reduce) setInterval(() => { if (document.visibilityState === "visible") spawn(); }, 1400);
}
