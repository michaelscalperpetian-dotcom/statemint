// Ownermint hero: a living floating island. Coins with real-ish physics (roof slides, splashes,
// tree bounces), a mailbox that sends statements, chimney smoke, clouds, bloom glow.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export function startHero(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = () => canvas.clientWidth < 720;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07130f, 20, 40);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.4, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xd8fff0, 0x123a2f, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(7, 13, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 2, far: 32 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  const rim = new THREE.PointLight(0x2fd3a0, 40, 22, 1.6); rim.position.set(-7, 3, -5); scene.add(rim);

  // ---------- helpers ----------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...o });
  const mesh = (geo, mat, { cast = true, receive = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const root = new THREE.Group(); scene.add(root);           // whole island (intro + bob)
  const R = 4.4;                                              // island radius

  // ---------- island ----------
  const topGeo = new THREE.CylinderGeometry(R, R * 0.97, 0.6, 14, 2);
  { const p = topGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.29) p.setY(i, y + rnd(-0.03, 0.03)); else if (y < -0.29) { p.setX(i, p.getX(i) * rnd(0.92, 1.02)); p.setZ(i, p.getZ(i) * rnd(0.92, 1.02)); } } topGeo.computeVertexNormals(); }
  const grass = mesh(topGeo, std(0x2f9e78)); grass.position.y = -0.3; root.add(grass);
  const grassRim = mesh(new THREE.TorusGeometry(R - 0.05, 0.08, 4, 28), std(0x3fbf8f)); grassRim.rotation.x = Math.PI / 2; grassRim.position.y = 0.0; root.add(grassRim);
  const under = new THREE.ConeGeometry(R * 0.96, 3.6, 14, 4);
  { const p = under.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 1.7 && y > -1.7) { p.setX(i, p.getX(i) * rnd(0.85, 1.12)); p.setZ(i, p.getZ(i) * rnd(0.85, 1.12)); } } under.computeVertexNormals(); }
  const dirt = mesh(under, std(0x6b4a36)); dirt.rotation.x = Math.PI; dirt.position.y = -2.4; root.add(dirt);
  const strata = mesh(new THREE.CylinderGeometry(R * 0.985, R * 0.9, 0.35, 14), std(0x8a6247)); strata.position.y = -0.75; root.add(strata);
  // cliff rocks
  const rockMat = std(0x7d8a85);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rnd(-0.1, 0.1), r = R * rnd(0.88, 0.98);
    const rock = mesh(new THREE.DodecahedronGeometry(rnd(0.22, 0.45), 0), rockMat);
    rock.position.set(Math.cos(a) * r, rnd(-1.2, -0.55), Math.sin(a) * r); rock.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); root.add(rock);
  }
  // floating rocks under the island
  const floaters = [];
  for (let i = 0; i < 5; i++) {
    const f = mesh(new THREE.DodecahedronGeometry(rnd(0.18, 0.4), 0), std(0x6b4a36));
    const a = rnd(0, Math.PI * 2), r = rnd(2.4, 4.2); f.position.set(Math.cos(a) * r, rnd(-4.6, -3), Math.sin(a) * r);
    f.userData = { y: f.position.y, p: rnd(0, 6), s: rnd(0.6, 1.2) }; floaters.push(f); root.add(f);
  }

  // ---------- pond ----------
  const pond = { x: -2.2, z: 1.5, r: 0.85 };
  const pondRim = mesh(new THREE.TorusGeometry(pond.r + 0.06, 0.1, 6, 24), std(0x9aa8a2)); pondRim.rotation.x = Math.PI / 2; pondRim.position.set(pond.x, 0.04, pond.z); root.add(pondRim);
  const water = mesh(new THREE.CircleGeometry(pond.r, 32), new THREE.MeshStandardMaterial({ color: 0x3ccbe0, roughness: 0.08, metalness: 0.2, emissive: 0x0d6d7d, emissiveIntensity: 0.35, envMap: envTex, envMapIntensity: 0.8, transparent: true, opacity: 0.92 }), { cast: false });
  water.rotation.x = -Math.PI / 2; water.position.set(pond.x, 0.03, pond.z); root.add(water);
  const lily = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10, 1, false, 0, Math.PI * 1.7), std(0x3fbf6f)); lily.position.set(pond.x + 0.3, 0.05, pond.z - 0.2); root.add(lily);
  const ripples = [];
  function ripple(x, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); root.add(m); ripples.push({ m, t: 0 });
  }

  // ---------- path, fence, lamp ----------
  const stoneMat = std(0xe6dcc6);
  [[0.6, 1.55], [0.75, 2.15], [0.55, 2.75], [0.7, 3.35]].forEach(([x, z]) => { const s = mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 7), stoneMat); s.position.set(x, 0.02, z); s.rotation.y = rnd(0, 3); root.add(s); });
  const fenceMat = std(0xf4efe4);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.08 + i * 0.13, r = R - 0.45;
    const post = mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), fenceMat); post.position.set(Math.cos(a) * r, 0.21, Math.sin(a) * r); root.add(post);
    if (i < 8) { const a2 = a + 0.065; const rail = mesh(new THREE.BoxGeometry(0.05, 0.05, r * 0.13), fenceMat); rail.position.set(Math.cos(a2) * r, 0.3, Math.sin(a2) * r); rail.rotation.y = -a2; root.add(rail); }
  }
  const lampPost = mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 8), std(0x22322d)); lampPost.position.set(1.55, 0.65, 2.5); root.add(lampPost);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc35a, emissiveIntensity: 3 })); bulb.position.set(1.55, 1.36, 2.5); root.add(bulb);
  const lampLight = new THREE.PointLight(0xffc35a, 6, 4, 1.8); lampLight.position.copy(bulb.position); root.add(lampLight);

  // ---------- house ----------
  const H = { x: 0.6, z: -0.5, hw: 1.25, hd: 1.05, wall: 1.75, roofH: 1.15, ov: 0.22 };
  const house = new THREE.Group(); house.position.set(H.x, 0, H.z); root.add(house);
  house.add(at(mesh(new THREE.BoxGeometry(H.hw * 2 + 0.1, 0.16, H.hd * 2 + 0.1), std(0xcfc6b4)), 0, 0.08, 0));
  const walls = mesh(new THREE.BoxGeometry(H.hw * 2, H.wall, H.hd * 2), std(0xf6f1e7, { flatShading: false, roughness: 0.9 })); walls.position.y = H.wall / 2; house.add(walls);
  // pitched roof (ridge along X) via extrusion
  const rs = new THREE.Shape(); const rw = H.hd + H.ov;
  rs.moveTo(-rw, 0); rs.lineTo(0, H.roofH); rs.lineTo(rw, 0); rs.lineTo(rw - 0.08, -0.08); rs.lineTo(0, H.roofH - 0.12); rs.lineTo(-rw + 0.08, -0.08); rs.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(rs, { depth: H.hw * 2 + H.ov * 2, bevelEnabled: false }); roofGeo.translate(0, 0, -(H.hw + H.ov));
  const roof = mesh(roofGeo, std(0x2fd3a0, { roughness: 0.55 })); roof.rotation.y = Math.PI / 2; roof.position.y = H.wall; house.add(roof);
  const gableMat = std(0xf6f1e7, { flatShading: false, roughness: 0.9 });
  [-1, 1].forEach(sx => { const g = new THREE.Shape(); g.moveTo(-H.hd, 0); g.lineTo(0, H.roofH - 0.12); g.lineTo(H.hd, 0); g.closePath(); const gm = mesh(new THREE.ShapeGeometry(g), gableMat); gm.rotation.y = Math.PI / 2 * sx; gm.position.set(sx * (H.hw - 0.001), H.wall, 0); gm.material.side = THREE.DoubleSide; house.add(gm); });
  const chimney = mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), std(0xc76b4c)); chimney.position.set(-0.7, H.wall + 0.75, -0.35); house.add(chimney);
  const chimTop = mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), std(0x8e4a35)); chimTop.position.set(-0.7, H.wall + 1.22, -0.35); house.add(chimTop);
  const door = mesh(new THREE.BoxGeometry(0.52, 0.95, 0.06), std(0x0b5d4b, { flatShading: false, roughness: 0.5 })); door.position.set(0, 0.55, H.hd + 0.01); house.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf5c451, metalness: 1, roughness: 0.2, envMap: envTex })); knob.position.set(0.17, 0.55, H.hd + 0.05); house.add(knob);
  const porch = mesh(new THREE.BoxGeometry(0.8, 0.1, 0.35), std(0xcfc6b4)); porch.position.set(0, 0.05, H.hd + 0.2); house.add(porch);
  const glass = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffb84d, emissiveIntensity: 2.6, roughness: 0.3 });
  const frameMat = std(0xffffff);
  const windowAt = (x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.04), glass));
    [[0, 0.25, 0.58, 0.06], [0, -0.25, 0.58, 0.06], [0.27, 0, 0.06, 0.56], [-0.27, 0, 0.06, 0.56], [0, 0, 0.04, 0.46], [0, 0, 0.5, 0.04]].forEach(([fx, fy, w, h]) => { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat); f.position.set(fx, fy, 0.01); g.add(f); });
    house.add(g); };
  windowAt(-0.72, 1.05, H.hd + 0.01, 0); windowAt(0.72, 1.05, H.hd + 0.01, 0); windowAt(H.hw + 0.01, 1.05, 0.3, Math.PI / 2); windowAt(-H.hw - 0.01, 1.05, -0.2, -Math.PI / 2);
  const inside = new THREE.PointLight(0xffb84d, 5, 3.5, 1.5); inside.position.set(0, 1, 1.4); house.add(inside);

  // mailbox that sends statements
  const mb = new THREE.Group(); mb.position.set(1.5, 0, 3.4); mb.rotation.y = -0.3; root.add(mb);
  mb.add(at(mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), std(0x6b4a34)), 0, 0.35, 0));
  const box = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 14, 1, false, 0, Math.PI), std(0x2fd3a0, { roughness: 0.4 })); box.rotation.set(0, 0, Math.PI / 2); box.position.set(0, 0.72, 0); mb.add(box);
  mb.add(at(mesh(new THREE.BoxGeometry(0.42, 0.16, 0.32), std(0x2fd3a0, { roughness: 0.4 })), 0, 0.66, 0));
  const flag = mesh(new THREE.BoxGeometry(0.03, 0.2, 0.1), std(0xff7a59)); flag.position.set(0.22, 0.82, 0.08); mb.add(flag);
  const envelopes = [];
  const envMat = std(0xffffff, { flatShading: false }), envFlapMat = std(0xe9eef0);
  function sendEnvelope() {
    const e = new THREE.Group();
    e.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), envMat));
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.021, 3), envFlapMat); fl.rotation.y = Math.PI / 6; fl.scale.set(1, 1, 0.75); fl.position.y = 0.012; e.add(fl);
    const p = new THREE.Vector3(); box.getWorldPosition(p); root.worldToLocal(p); e.position.copy(p);
    root.add(e); envelopes.push({ e, t: 0, vx: rnd(-0.6, 0.6), vz: rnd(0.4, 1.2) });
    flag.rotation.z = -1.2; setTimeout(() => (flag.rotation.z = 0), 600);
  }

  // ---------- trees ----------
  const trees = []; const swayers = [];
  const pine = (x, z, s) => { const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s);
    t.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6), std(0x6b4a34)), 0, 0.25, 0));
    const crown = new THREE.Group(); crown.position.y = 0.4; t.add(crown);
    [[0.55, 0.75, 0.3], [0.43, 0.65, 0.68], [0.3, 0.55, 1.02]].forEach(([r, h, y], i) => crown.add(at(mesh(new THREE.ConeGeometry(r, h, 7), std([0x1f7a5c, 0x23896a, 0x2a9a76][i])), 0, y, 0)));
    root.add(t); trees.push({ x, z, r: 0.3 * s, h: 1.6 * s }); swayers.push({ o: crown, p: rnd(0, 6) }); };
  const round = (x, z, s) => { const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s);
    t.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 6), std(0x6b4a34)), 0, 0.3, 0));
    const c = mesh(new THREE.IcosahedronGeometry(0.5, 0), std(0x3fae7c)); c.position.y = 0.9; t.add(c);
    const c2 = mesh(new THREE.IcosahedronGeometry(0.32, 0), std(0x4fc28d)); c2.position.set(0.25, 1.15, 0.1); t.add(c2);
    root.add(t); trees.push({ x, z, r: 0.42 * s, h: 1.4 * s }); swayers.push({ o: c, p: rnd(0, 6) }); };
  pine(-2.9, -1.3, 1.05); pine(-1.9, -2.7, 0.85); pine(3.1, -1.6, 1.1); round(3.2, 0.9, 0.9); round(-3.2, 0.3, 0.8); pine(2.3, -3.0, 0.75);
  // bushes + flowers
  for (let i = 0; i < 6; i++) { const b = mesh(new THREE.IcosahedronGeometry(rnd(0.16, 0.26), 0), std(0x3fae7c)); b.position.set(H.x + rnd(-1.3, 1.3), 0.12, H.z + H.hd + 0.35 + rnd(-0.05, 0.1)); if (Math.abs(b.position.x - H.x) > 0.5) root.add(b); }
  const flowerCols = [0xff7a59, 0xf5c451, 0xffffff, 0xc9b6ff];
  for (let i = 0; i < 26; i++) { const a = rnd(0, Math.PI * 2), r = rnd(1.8, R - 0.6); const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 0.3 || (Math.abs(x - H.x) < H.hw + 0.4 && Math.abs(z - H.z) < H.hd + 0.6)) continue;
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), std(flowerCols[i % 4], { emissive: flowerCols[i % 4], emissiveIntensity: 0.15 })); f.position.set(x, 0.07, z); root.add(f); }

  // ---------- chimney smoke ----------
  const smoke = []; const smokeMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ef, roughness: 1, transparent: true, opacity: 0.7, flatShading: true });
  const chimWorld = () => { const p = new THREE.Vector3(-0.7, H.wall + 1.3, -0.35); return p.add(house.position); };
  function puff(big = false) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 0.22 : 0.14, 0), smokeMat.clone()); m.position.copy(chimWorld()); root.add(m); smoke.push({ m, t: 0, life: rnd(2.6, 3.6), dx: rnd(-0.15, 0.25) }); }

  // ---------- clouds + sparkles ----------
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff7ee, emissiveIntensity: 0.55, roughness: 1, flatShading: true, transparent: true, opacity: 0.88 });
    for (let j = 0; j < 4; j++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.32, 0.55), 1), m); s.position.set(j * 0.45 - 0.7, rnd(-0.1, 0.15), rnd(-0.2, 0.2)); c.add(s); }
    c.userData = { a: (i / 4) * Math.PI * 2 + 0.6, r: rnd(5.0, 6.0), y: rnd(1.6, 3.0), sp: rnd(0.03, 0.06) }; root.add(c); clouds.push(c);
  }
  const SP = 140; const spGeo = new THREE.BufferGeometry(); const spPos = new Float32Array(SP * 3); const spSeed = [];
  for (let i = 0; i < SP; i++) { const a = rnd(0, Math.PI * 2), r = rnd(0, 6.5); spPos.set([Math.cos(a) * r, rnd(-2, 6), Math.sin(a) * r], i * 3); spSeed.push(rnd(0.2, 0.6)); }
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
  const sparkles = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: 0x9cf7d6, size: 0.05, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  root.add(sparkles);

  // ---------- coins ----------
  const faceTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 256); g.strokeStyle = "#b9b9b9"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 88, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#9a9a9a"; g.font = "bold 128px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", 128, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.075, 32);
  const metal = (hex) => { const side = new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: 0.32, envMap: envTex, envMapIntensity: 1.1 });
    const face = new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: 0.24, map: faceTex, envMap: envTex, envMapIntensity: 1.1 }); return [side, face, face]; };
  const MATS = [metal(0xf5c451), metal(0x2fd3a0), metal(0xf5c451)];
  const coins = []; const MAX = reduce ? 30 : (small() ? 55 : 90); const CR = 0.32, HALF = 0.04;
  function spawn(p, v) {
    if (coins.length >= MAX) { const old = coins.shift(); root.remove(old.mesh); }
    const m = new THREE.Mesh(coinGeo, MATS[(Math.random() * 3) | 0]); m.castShadow = true; m.receiveShadow = true;
    m.position.copy(p); m.quaternion.setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6))); root.add(m);
    const c = { mesh: m, v: v || new THREE.Vector3(rnd(-0.6, 0.6), rnd(-1, 0), rnd(-0.6, 0.6)), w: new THREE.Vector3(rnd(-9, 9), rnd(-4, 4), rnd(-9, 9)), sleep: 0, sink: 0 };
    coins.push(c); return c;
  }
  const rainOne = () => spawn(new THREE.Vector3(rnd(-3.4, 3.4), rnd(7, 11), rnd(-3.4, 3.4)));
  function mintBurst(n = 14) { // fountain from the chimney
    const p = chimWorld(); puff(true); puff(true);
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), s = rnd(1.2, 3.2); spawn(p.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3(Math.cos(a) * s, rnd(5.5, 8.5), Math.sin(a) * s)); }
  }

  // ---------- pointer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3(999, 0, 999); let mx = 0, my = 0, pointerIn = false;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0x5ff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; root.add(halo);
  addEventListener("pointermove", e => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); mx = ndc.x; my = ndc.y; pointerIn = e.clientY < r.bottom; }, { passive: true });
  canvas.addEventListener("pointerdown", () => mintBurst());

  // ---------- sizing / camera ----------
  const camBase = new THREE.Vector3(12.5, 10.5, 15.5);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();
  const offset = () => (canvas.clientWidth >= 900 ? new THREE.Vector3(3.1, -0.3, -2.4) : new THREE.Vector3(0, -1.6, 0));

  // ---------- physics ----------
  const G = -20, tmp = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion(), flatQ = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), euler = new THREE.Euler();
  const roofW = H.hd + H.ov, roofX = H.hw + H.ov;
  function collide(c, dt) {
    const p = c.mesh.position, v = c.v;
    // house walls (AABB in island space)
    const lx = p.x - H.x, lz = p.z - H.z;
    if (Math.abs(lx) < H.hw + CR * 0.6 && Math.abs(lz) < H.hd + CR * 0.6 && p.y < H.wall) {
      const px = H.hw + CR * 0.6 - Math.abs(lx), pz = H.hd + CR * 0.6 - Math.abs(lz);
      if (px < pz) { p.x += Math.sign(lx) * px; v.x = Math.abs(v.x) * Math.sign(lx) * 0.4; } else { p.z += Math.sign(lz) * pz; v.z = Math.abs(v.z) * Math.sign(lz) * 0.4; }
    }
    // roof: two sloped planes, coins slide off
    if (Math.abs(lx) < roofX && Math.abs(lz) < roofW && p.y > H.wall - 0.25) {
      const surf = H.wall + H.roofH * (1 - Math.abs(lz) / roofW);
      if (p.y < surf + HALF + 0.02) {
        p.y = surf + HALF + 0.02;
        n.set(0, 1, Math.sign(lz || 1) * H.roofH / roofW).normalize();
        const vn = v.dot(n); if (vn < 0) v.addScaledVector(n, -vn * (vn < -2 ? 1.35 : 1));
        v.multiplyScalar(0.985); c.w.multiplyScalar(0.9);
        q.setFromUnitVectors(up, n); euler.setFromQuaternion(c.mesh.quaternion); c.mesh.quaternion.slerp(q, 0.2);
        return true;
      }
    }
    // trees
    for (const t of trees) { tmp.set(p.x - t.x, 0, p.z - t.z); const d = tmp.length(), min = t.r + CR * 0.7;
      if (d < min && p.y < t.h) { tmp.normalize(); p.x = t.x + tmp.x * min; p.z = t.z + tmp.z * min; const vn = v.x * tmp.x + v.z * tmp.z; if (vn < 0) { v.x -= 1.6 * vn * tmp.x; v.z -= 1.6 * vn * tmp.z; } c.w.y += rnd(-4, 4); } }
    return false;
  }
  function step(dt) {
    hit.set(999, 0, 999);
    if (pointerIn) { plane.constant = -root.position.y; ray.setFromCamera(ndc, camera); const o = new THREE.Vector3(); if (ray.ray.intersectPlane(plane, o)) { root.worldToLocal(o); if (Math.hypot(o.x, o.z) < R + 0.5) hit.copy(o); } }
    halo.position.set(hit.x, 0.03, hit.z); halo.material.opacity += ((hit.x < 900 ? 0.55 : 0) - halo.material.opacity) * 0.12; halo.scale.setScalar(1 + Math.sin(performance.now() / 260) * 0.05);
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i], p = c.mesh.position, v = c.v;
      if (c.sink) { c.sink += dt; p.y -= dt * 0.25; c.mesh.rotation.x += dt * 2; if (c.sink > 1.6) { p.set(rnd(-3.4, 3.4), rnd(8, 11), rnd(-3.4, 3.4)); v.set(0, 0, 0); c.sink = 0; c.sleep = 0; } continue; }
      // cursor: coins hop away
      if (hit.x < 900) { tmp.set(p.x - hit.x, 0, p.z - hit.z); const d = tmp.length();
        if (d < 1.0 && p.y < 1.2) { tmp.normalize(); v.x += tmp.x * (1.0 - d) * 9; v.z += tmp.z * (1.0 - d) * 9; if (c.sleep > 0.05 || p.y < 0.2) v.y = Math.max(v.y, 3.2 + (1 - d) * 3); c.w.set(rnd(-14, 14), rnd(-6, 6), rnd(-14, 14)); c.sleep = 0; } }
      if (c.sleep > 1.2) continue;
      v.y += G * dt; p.addScaledVector(v, dt);
      const onRoof = collide(c, dt);
      const dist = Math.hypot(p.x, p.z);
      // pond
      if (Math.hypot(p.x - pond.x, p.z - pond.z) < pond.r - 0.1 && p.y < 0.08) { ripple(p.x, p.z); ripple(p.x + 0.05, p.z); c.sink = 0.001; continue; }
      if (!onRoof && dist < R - 0.15 && p.y < HALF) {
        p.y = HALF;
        if (v.y < -2.2) { v.y *= -0.32; c.w.multiplyScalar(0.55); c.w.x += rnd(-5, 5); } else v.y = 0;
        v.x *= 0.86; v.z *= 0.86; c.w.multiplyScalar(0.82);
        euler.setFromQuaternion(c.mesh.quaternion, "YXZ"); flatQ.setFromAxisAngle(up, euler.y); c.mesh.quaternion.slerp(flatQ, 0.16);
        if (Math.abs(v.y) < 0.01 && v.lengthSq() < 0.02) c.sleep += dt; else c.sleep = 0;
      } else if (!onRoof) {
        q.setFromEuler(euler.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)); c.mesh.quaternion.multiply(q);
      }
      // coin-coin
      for (let j = i + 1; j < coins.length; j++) { const o = coins[j]; if (o.sink) continue; const op = o.mesh.position; tmp.subVectors(p, op); const d = tmp.length();
        if (d > 0.0001 && d < CR * 1.7) { const push = (CR * 1.7 - d) / d * 0.5; tmp.multiplyScalar(push); p.add(tmp); op.sub(tmp); if (tmp.y > 0) { v.y = Math.max(v.y, 0); } o.sleep = Math.min(o.sleep, 0.5); } }
      if (p.y < -14) { p.set(rnd(-3.4, 3.4), rnd(8, 12), rnd(-3.4, 3.4)); v.set(0, 0, 0); c.sleep = 0; }
    }
  }

  // ---------- intro + loop ----------
  let visible = true, t = 0, intro = 0, scrollK = 0, sendTimer = 2.5, smokeTimer = 0, rainTimer = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  addEventListener("scroll", () => { scrollK = Math.min(1, scrollY / innerHeight); }, { passive: true });
  if (!reduce) { for (let i = 0; i < 26; i++) setTimeout(rainOne, 900 + i * 85); }
  else { for (let i = 0; i < 24; i++) { const c = spawn(new THREE.Vector3(rnd(-3, 3), HALF, rnd(-3, 3))); c.sleep = 9; c.mesh.quaternion.identity(); } }
  const clock = new THREE.Clock(); const camPos = camBase.clone().multiplyScalar(small() ? 1.5 : 1); const look = new THREE.Vector3(); camera.position.copy(camPos);
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.033, clock.getDelta());
    if (!visible || document.hidden) return;
    t += dt; intro = reduce ? 1 : Math.min(1, intro + dt / 1.8);
    const e = 1 - Math.pow(1 - intro, 4);
    const off = offset();
    root.position.set(off.x, off.y + (1 - e) * -3 + Math.sin(t * 0.8) * 0.1, off.z);
    root.scale.setScalar(0.7 + 0.3 * e); root.rotation.y = (1 - e) * -0.8 + Math.sin(t * 0.22) * 0.06;
    const far = small() ? 1.5 : 1;
    camPos.set(camBase.x * far + mx * 1.4, camBase.y * far + my * 0.9 + scrollK * 3, camBase.z * far + scrollK * 4);
    camera.position.lerp(camPos, 0.06); look.set(off.x * 0.85, 0.5 + off.y * 0.5 - scrollK * 1.5, off.z * 0.85); camera.lookAt(look);
    if (!reduce) {
      step(dt);
      rainTimer -= dt; if (rainTimer <= 0) { rainOne(); rainTimer = 1.1; }
      smokeTimer -= dt; if (smokeTimer <= 0) { puff(); smokeTimer = 0.45; }
      sendTimer -= dt; if (sendTimer <= 0) { sendEnvelope(); sendTimer = 5.5; }
      swayers.forEach(s => (s.o.rotation.z = Math.sin(t * 1.3 + s.p) * 0.04));
      floaters.forEach(f => (f.position.y = f.userData.y + Math.sin(t * f.userData.s + f.userData.p) * 0.18));
      clouds.forEach(c => { c.userData.a += c.userData.sp * dt; c.position.set(Math.cos(c.userData.a) * c.userData.r, c.userData.y + Math.sin(t + c.userData.a) * 0.1, Math.sin(c.userData.a) * c.userData.r); });
      const sp = spGeo.attributes.position; for (let i = 0; i < SP; i++) { let y = sp.getY(i) + spSeed[i] * dt; if (y > 6) y = -2; sp.setY(i, y); } sp.needsUpdate = true;
      for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.t += dt; const k = s.t / s.life; s.m.position.y += dt * 0.55; s.m.position.x += s.dx * dt; s.m.scale.setScalar(1 + k * 2.2); s.m.material.opacity = 0.7 * (1 - k); s.m.rotation.y += dt; if (k >= 1) { root.remove(s.m); smoke.splice(i, 1); } }
      for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.t += dt; r.m.scale.setScalar(1 + r.t * 7); r.m.material.opacity = 0.85 * (1 - r.t / 0.9); if (r.t > 0.9) { root.remove(r.m); ripples.splice(i, 1); } }
      for (let i = envelopes.length - 1; i >= 0; i--) { const v = envelopes[i]; v.t += dt; v.e.position.y += dt * (1.2 + v.t * 0.6); v.e.position.x += v.vx * dt; v.e.position.z += v.vz * dt; v.e.rotation.y += dt * 2.5; v.e.rotation.z = Math.sin(v.t * 4) * 0.3; if (v.t > 4) { root.remove(v.e); envelopes.splice(i, 1); } }
      inside.intensity = 5 + Math.sin(t * 7) * 0.4 + Math.sin(t * 13) * 0.2;
      water.material.emissiveIntensity = 0.32 + Math.sin(t * 2) * 0.05;
    }
    composer.render();
  }
  frame();
}
