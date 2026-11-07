// Ownermint hero: a floating island at dusk with real rigid-body physics (cannon-es).
// Coins are physical bodies: they tumble, bounce, slide off the roof, stack, roll off the edge and sink in the pond.
// Mouse: hover nudges coins, drag a coin to pick it up and throw it, click anywhere to mint a burst from the chimney.
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export function startHero(canvas, opts = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const small = () => canvas.clientWidth < 720;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Dusk look: filmic tone mapping with a lower exposure so nothing glares.
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.78;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07130f, 22, 42);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom only catches the truly bright bits (window glow, lamp, fireflies), and only softly.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- lights: low warm sun, cool sky, soft rim ----------
  scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x1a3a30, 0.75));
  const sun = new THREE.DirectionalLight(0xffd6a3, 1.55);
  sun.position.set(9, 9, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 2, far: 34 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  const rim = new THREE.PointLight(0x2fd3a0, 18, 22, 1.8); rim.position.set(-7, 3, -5); scene.add(rim);

  // ---------- helpers ----------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, flatShading: true, ...o });
  const mesh = (geo, mat, { cast = true, receive = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m; };
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // repeatable layout
  const rnd = (a, b) => a + rand() * (b - a), rndLive = (a, b) => a + Math.random() * (b - a);
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const root = new THREE.Group(); scene.add(root);           // whole island (intro + gentle bob); physics runs in root's local space
  const R = 4.4;                                              // island radius

  // ---------- physics world ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.defaultContactMaterial.contactEquationStiffness = 1e7;
  world.defaultContactMaterial.contactEquationRelaxation = 3;
  const mGround = new CANNON.Material("ground"), mCoin = new CANNON.Material("coin"), mRoof = new CANNON.Material("roof"), mLeaf = new CANNON.Material("leaf");
  world.addContactMaterial(new CANNON.ContactMaterial(mCoin, mGround, { friction: 0.45, restitution: 0.22 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mCoin, mCoin, { friction: 0.3, restitution: 0.18 }));
  // Roof and tree crowns are frictionless on purpose. cannon-es gives every contact point of a flat coin its own
  // friction force, so even a tiny value pins a coin on a 42° roof (measured: friction 0.005 still sticks; 0 slides).
  world.addContactMaterial(new CANNON.ContactMaterial(mCoin, mRoof, { friction: 0, restitution: 0.15 }));   // shiny roof: coins slide off
  world.addContactMaterial(new CANNON.ContactMaterial(mCoin, mLeaf, { friction: 0, restitution: 0.45 }));   // springy trees: coins bounce off
  const addStatic = (shape, x, y, z, mat = mGround, q = null) => { const b = new CANNON.Body({ mass: 0, material: mat }); b.addShape(shape); b.position.set(x, y, z); if (q) b.quaternion.copy(q); world.addBody(b); return b; };
  const qAxis = (ax, ay, az, a) => new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(ax, ay, az), a);

  // ---------- island ----------
  const topGeo = new THREE.CylinderGeometry(R, R * 0.97, 0.6, 18, 2);
  { const p = topGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.29) { p.setX(i, p.getX(i) * rnd(0.92, 1.02)); p.setZ(i, p.getZ(i) * rnd(0.92, 1.02)); } } topGeo.computeVertexNormals(); }
  const grass = mesh(topGeo, std(0x2a8a69)); grass.position.y = -0.3; root.add(grass);
  addStatic(new CANNON.Cylinder(R, R * 0.97, 0.6, 24), 0, -0.3, 0);
  const grassRim = mesh(new THREE.TorusGeometry(R - 0.05, 0.08, 4, 36), std(0x349f7c)); grassRim.rotation.x = Math.PI / 2; root.add(grassRim);
  const under = new THREE.ConeGeometry(R * 0.96, 3.6, 16, 4);
  { const p = under.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 1.7 && y > -1.7) { p.setX(i, p.getX(i) * rnd(0.85, 1.12)); p.setZ(i, p.getZ(i) * rnd(0.85, 1.12)); } } under.computeVertexNormals(); }
  const dirt = mesh(under, std(0x5a3e2e)); dirt.rotation.x = Math.PI; dirt.position.y = -2.4; root.add(dirt);
  const strata = mesh(new THREE.CylinderGeometry(R * 0.985, R * 0.9, 0.35, 16), std(0x7a563f)); strata.position.y = -0.75; root.add(strata);
  const rockMat = std(0x6d7a75);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + rnd(-0.1, 0.1), r = R * rnd(0.88, 0.98);
    const rock = mesh(new THREE.DodecahedronGeometry(rnd(0.22, 0.45), 0), rockMat);
    rock.position.set(Math.cos(a) * r, rnd(-1.2, -0.55), Math.sin(a) * r); rock.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); root.add(rock);
  }
  const floaters = [];
  for (let i = 0; i < 6; i++) {
    const f = mesh(new THREE.DodecahedronGeometry(rnd(0.18, 0.4), 0), std(0x5a3e2e));
    const a = rnd(0, Math.PI * 2), r = rnd(2.4, 4.4); f.position.set(Math.cos(a) * r, rnd(-4.8, -3), Math.sin(a) * r);
    f.userData = { y: f.position.y, p: rnd(0, 6), s: rnd(0.6, 1.2) }; floaters.push(f); root.add(f);
  }
  // grass tufts (one instanced mesh: cheap)
  const pond = { x: -2.2, z: 1.5, r: 0.85 };
  const H = { x: 0.6, z: -0.5, hw: 1.25, hd: 1.05, wall: 1.75, roofH: 1.15, ov: 0.22 };
  const clearOf = (x, z, pad) => Math.hypot(x - pond.x, z - pond.z) > pond.r + pad && !(Math.abs(x - H.x) < H.hw + pad && Math.abs(z - H.z) < H.hd + pad + 0.4);
  {
    const N = small() ? 160 : 320, tuft = new THREE.ConeGeometry(0.045, 0.22, 3); tuft.translate(0, 0.11, 0);
    const inst = new THREE.InstancedMesh(tuft, std(0xffffff), N); inst.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
    let k = 0;
    while (k < N) { const a = rnd(0, Math.PI * 2), r = Math.sqrt(rnd(0.02, 1)) * (R - 0.25), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clearOf(x, z, 0.15)) continue;
      q.setFromEuler(new THREE.Euler(rnd(-0.25, 0.25), rnd(0, 6), rnd(-0.25, 0.25))); s.setScalar(rnd(0.6, 1.4)); pos.set(x, 0, z);
      inst.setMatrixAt(k, m4.compose(pos, q, s)); inst.setColorAt(k, col.setHSL(rnd(0.38, 0.44), rnd(0.45, 0.6), rnd(0.28, 0.4))); k++; }
    root.add(inst);
  }

  // ---------- pond (a trigger: coins that land in it sink) ----------
  const pondRim = mesh(new THREE.TorusGeometry(pond.r + 0.06, 0.1, 6, 28), std(0x8a9893)); pondRim.rotation.x = Math.PI / 2; pondRim.position.set(pond.x, 0.04, pond.z); root.add(pondRim);
  const water = mesh(new THREE.CircleGeometry(pond.r, 40), new THREE.MeshStandardMaterial({ color: 0x2a9fb3, roughness: 0.06, metalness: 0.2, emissive: 0x0b4d59, emissiveIntensity: 0.22, envMap: envTex, envMapIntensity: 0.55, transparent: true, opacity: 0.9 }), { cast: false });
  water.rotation.x = -Math.PI / 2; water.position.set(pond.x, 0.03, pond.z); root.add(water);
  const lily = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10, 1, false, 0, Math.PI * 1.7), std(0x3a9f62)); lily.position.set(pond.x + 0.3, 0.05, pond.z - 0.2); root.add(lily);
  const ripples = [];
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xdff7f0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  function ripple(x, z, y = 0.05) { if (ripples.length > 30) return; const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.085, 28), rippleMat.clone()); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); root.add(m); ripples.push({ m, t: 0 }); }

  // ---------- path, fence, lamp ----------
  const stoneMat = std(0xd4cab4);
  [[0.6, 1.55], [0.75, 2.15], [0.55, 2.75], [0.7, 3.35]].forEach(([x, z]) => { const s = mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 7), stoneMat); s.position.set(x, 0.02, z); s.rotation.y = rnd(0, 3); root.add(s); });
  const fenceMat = std(0xe6dfd0);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.08 + i * 0.13, r = R - 0.45;
    const post = mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), fenceMat); post.position.set(Math.cos(a) * r, 0.21, Math.sin(a) * r); root.add(post);
    addStatic(new CANNON.Box(new CANNON.Vec3(0.04, 0.21, 0.04)), post.position.x, 0.21, post.position.z);
    if (i < 8) { const a2 = a + 0.065; const rail = mesh(new THREE.BoxGeometry(0.05, 0.05, r * 0.13), fenceMat); rail.position.set(Math.cos(a2) * r, 0.3, Math.sin(a2) * r); rail.rotation.y = -a2; root.add(rail);
      addStatic(new CANNON.Box(new CANNON.Vec3(0.025, 0.025, r * 0.065)), rail.position.x, 0.3, rail.position.z, mGround, qAxis(0, 1, 0, -a2)); }
  }
  const lampPost = mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 8), std(0x1d2b27)); lampPost.position.set(1.55, 0.65, 2.5); root.add(lampPost);
  addStatic(new CANNON.Cylinder(0.05, 0.05, 1.3, 8), 1.55, 0.65, 2.5);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc35a, emissiveIntensity: 1.5 })); bulb.position.set(1.55, 1.36, 2.5); root.add(bulb);
  addStatic(new CANNON.Sphere(0.11), 1.55, 1.36, 2.5);
  const lampLight = new THREE.PointLight(0xffc35a, 4, 4, 1.8); lampLight.position.copy(bulb.position); root.add(lampLight);

  // ---------- house (with matching physics: walls, two roof slopes, chimney) ----------
  const house = new THREE.Group(); house.position.set(H.x, 0, H.z); root.add(house);
  house.add(at(mesh(new THREE.BoxGeometry(H.hw * 2 + 0.1, 0.16, H.hd * 2 + 0.1), std(0xbdb4a2)), 0, 0.08, 0));
  const walls = mesh(new THREE.BoxGeometry(H.hw * 2, H.wall, H.hd * 2), std(0xece5d8, { flatShading: false, roughness: 0.92 })); walls.position.y = H.wall / 2; house.add(walls);
  addStatic(new CANNON.Box(new CANNON.Vec3(H.hw, H.wall / 2, H.hd)), H.x, H.wall / 2, H.z);
  const rs = new THREE.Shape(); const rw = H.hd + H.ov;
  rs.moveTo(-rw, 0); rs.lineTo(0, H.roofH); rs.lineTo(rw, 0); rs.lineTo(rw - 0.08, -0.08); rs.lineTo(0, H.roofH - 0.12); rs.lineTo(-rw + 0.08, -0.08); rs.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(rs, { depth: H.hw * 2 + H.ov * 2, bevelEnabled: false }); roofGeo.translate(0, 0, -(H.hw + H.ov));
  const roof = mesh(roofGeo, std(0x26b088, { roughness: 0.5 })); roof.rotation.y = Math.PI / 2; roof.position.y = H.wall; house.add(roof);
  { // each roof slope is a thin box tilted to the pitch; its top face sits exactly on the visible roof
    const theta = Math.atan2(H.roofH, rw), L = Math.hypot(rw, H.roofH), th = 0.06;
    [1, -1].forEach(side => {
      const nY = Math.cos(theta), nZ = side * Math.sin(theta); // outward normal of this slope
      addStatic(new CANNON.Box(new CANNON.Vec3(H.hw + H.ov, th, L / 2)), H.x, H.wall + H.roofH / 2 - nY * th, H.z + side * rw / 2 - nZ * th, mRoof, qAxis(1, 0, 0, side * theta));
    });
  }
  const gableMat = std(0xece5d8, { flatShading: false, roughness: 0.92 });
  [-1, 1].forEach(sx => { const g = new THREE.Shape(); g.moveTo(-H.hd, 0); g.lineTo(0, H.roofH - 0.12); g.lineTo(H.hd, 0); g.closePath(); const gm = mesh(new THREE.ShapeGeometry(g), gableMat); gm.rotation.y = Math.PI / 2 * sx; gm.position.set(sx * (H.hw - 0.001), H.wall, 0); gm.material.side = THREE.DoubleSide; house.add(gm); });
  const chim = { x: -0.7, z: -0.35 };
  const chimney = mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), std(0xb2604a)); chimney.position.set(chim.x, H.wall + 0.75, chim.z); house.add(chimney);
  const chimTop = mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), std(0x7e4232)); chimTop.position.set(chim.x, H.wall + 1.22, chim.z); house.add(chimTop);
  addStatic(new CANNON.Box(new CANNON.Vec3(0.21, 0.5, 0.21)), H.x + chim.x, H.wall + 0.78, H.z + chim.z);
  const door = mesh(new THREE.BoxGeometry(0.52, 0.95, 0.06), std(0x0b5d4b, { flatShading: false, roughness: 0.5 })); door.position.set(0, 0.55, H.hd + 0.01); house.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0b44a, metalness: 1, roughness: 0.25, envMap: envTex, envMapIntensity: 0.7 })); knob.position.set(0.17, 0.55, H.hd + 0.05); house.add(knob);
  const porch = mesh(new THREE.BoxGeometry(0.8, 0.1, 0.35), std(0xbdb4a2)); porch.position.set(0, 0.05, H.hd + 0.2); house.add(porch);
  addStatic(new CANNON.Box(new CANNON.Vec3(0.4, 0.05, 0.175)), H.x, 0.05, H.z + H.hd + 0.2);
  const glass = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffaa45, emissiveIntensity: 1.35, roughness: 0.3 });
  const frameMat = std(0xf4f1ea);
  const windowAt = (x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.04), glass));
    [[0, 0.25, 0.58, 0.06], [0, -0.25, 0.58, 0.06], [0.27, 0, 0.06, 0.56], [-0.27, 0, 0.06, 0.56], [0, 0, 0.04, 0.46], [0, 0, 0.5, 0.04]].forEach(([fx, fy, w, h]) => { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat); f.position.set(fx, fy, 0.01); g.add(f); });
    house.add(g); };
  windowAt(-0.72, 1.05, H.hd + 0.01, 0); windowAt(0.72, 1.05, H.hd + 0.01, 0); windowAt(H.hw + 0.01, 1.05, 0.3, Math.PI / 2); windowAt(-H.hw - 0.01, 1.05, -0.2, -Math.PI / 2);
  const inside = new THREE.PointLight(0xffa64a, 3.2, 3.5, 1.5); inside.position.set(0, 1, 1.4); house.add(inside);

  // mailbox that sends statements
  const mb = new THREE.Group(); mb.position.set(1.5, 0, 3.4); mb.rotation.y = -0.3; root.add(mb);
  mb.add(at(mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), std(0x5a3e2d)), 0, 0.35, 0));
  const box = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 14, 1, false, 0, Math.PI), std(0x26b088, { roughness: 0.45 })); box.rotation.set(0, 0, Math.PI / 2); box.position.set(0, 0.72, 0); mb.add(box);
  mb.add(at(mesh(new THREE.BoxGeometry(0.42, 0.16, 0.32), std(0x26b088, { roughness: 0.45 })), 0, 0.66, 0));
  addStatic(new CANNON.Box(new CANNON.Vec3(0.21, 0.4, 0.16)), 1.5, 0.4, 3.4, mGround, qAxis(0, 1, 0, -0.3));
  const flag = mesh(new THREE.BoxGeometry(0.03, 0.2, 0.1), std(0xe5704f)); flag.position.set(0.22, 0.82, 0.08); mb.add(flag);
  const envelopes = [];
  const envMat = std(0xf2f2ee, { flatShading: false }), envFlapMat = std(0xdfe5e7);
  function sendEnvelope() {
    const e = new THREE.Group();
    e.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), envMat));
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.021, 3), envFlapMat); fl.rotation.y = Math.PI / 6; fl.scale.set(1, 1, 0.75); fl.position.y = 0.012; e.add(fl);
    const p = new THREE.Vector3(); box.getWorldPosition(p); root.worldToLocal(p); e.position.copy(p);
    root.add(e); envelopes.push({ e, t: 0, vx: rndLive(-0.6, 0.6), vz: rndLive(0.4, 1.2) });
    flag.rotation.z = -1.2; setTimeout(() => (flag.rotation.z = 0), 600);
  }

  // ---------- trees (trunks + crowns are physical: coins bounce off them) ----------
  const swayers = [];
  const pine = (x, z, s) => { const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s);
    t.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6), std(0x5a3e2d)), 0, 0.25, 0));
    const crown = new THREE.Group(); crown.position.y = 0.4; t.add(crown);
    [[0.55, 0.75, 0.3], [0.43, 0.65, 0.68], [0.3, 0.55, 1.02]].forEach(([r, h, y], i) => crown.add(at(mesh(new THREE.ConeGeometry(r, h, 7), std([0x1b6b51, 0x1f785d, 0x258a69][i])), 0, y, 0)));
    root.add(t); swayers.push({ o: crown, p: rnd(0, 6) });
    addStatic(new CANNON.Cylinder(0.1 * s, 0.1 * s, 0.5 * s, 8), x, 0.25 * s, z);
    addStatic(new CANNON.Cylinder(0.05 * s, 0.55 * s, 1.37 * s, 10), x, (0.325 + 0.685) * s, z, mLeaf); };
  const round = (x, z, s) => { const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s);
    t.add(at(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 6), std(0x5a3e2d)), 0, 0.3, 0));
    const c = mesh(new THREE.IcosahedronGeometry(0.5, 0), std(0x35986c)); c.position.y = 0.9; t.add(c);
    const c2 = mesh(new THREE.IcosahedronGeometry(0.32, 0), std(0x43aa7a)); c2.position.set(0.25, 1.15, 0.1); t.add(c2);
    root.add(t); swayers.push({ o: c, p: rnd(0, 6) });
    addStatic(new CANNON.Cylinder(0.1 * s, 0.1 * s, 0.6 * s, 8), x, 0.3 * s, z);
    addStatic(new CANNON.Sphere(0.47 * s), x, 0.9 * s, z, mLeaf); addStatic(new CANNON.Sphere(0.3 * s), x + 0.25 * s, 1.15 * s, z + 0.1 * s, mLeaf); };
  pine(-2.9, -1.3, 1.05); pine(-1.9, -2.7, 0.85); pine(3.1, -1.6, 1.1); round(3.2, 0.9, 0.9); round(-3.2, 0.3, 0.8); pine(2.3, -3.0, 0.75);
  for (let i = 0; i < 6; i++) { const b = mesh(new THREE.IcosahedronGeometry(rnd(0.16, 0.26), 0), std(0x35986c)); b.position.set(H.x + rnd(-1.3, 1.3), 0.12, H.z + H.hd + 0.35 + rnd(-0.05, 0.1)); if (Math.abs(b.position.x - H.x) > 0.5) root.add(b); }
  const flowerCols = [0xe5704f, 0xe0b44a, 0xf2efe8, 0xb7a5ea];
  for (let i = 0; i < 30; i++) { const a = rnd(0, Math.PI * 2), r = rnd(1.8, R - 0.6); const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clearOf(x, z, 0.3)) continue;
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), std(flowerCols[i % 4])); f.position.set(x, 0.07, z); root.add(f); }

  // ---------- chimney smoke ----------
  const smoke = []; const smokeMat = new THREE.MeshStandardMaterial({ color: 0xc9d6d1, roughness: 1, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
  const chimTopLocal = () => new THREE.Vector3(H.x + chim.x, H.wall + 1.32, H.z + chim.z);
  function puff(big = false) { if (smoke.length > 24) return; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 0.2 : 0.13, 0), smokeMat.clone()); m.position.copy(chimTopLocal()); root.add(m); smoke.push({ m, t: 0, life: rndLive(2.6, 3.6), dx: rndLive(-0.15, 0.25) }); }

  // ---------- clouds + fireflies (dim) ----------
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xe9f1ee, emissive: 0x9fb8b0, emissiveIntensity: 0.18, roughness: 1, flatShading: true, transparent: true, opacity: 0.8 });
    for (let j = 0; j < 4; j++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.32, 0.55), 1), m); s.position.set(j * 0.45 - 0.7, rnd(-0.1, 0.15), rnd(-0.2, 0.2)); c.add(s); }
    c.userData = { a: (i / 4) * Math.PI * 2 + 0.6, r: rnd(5.0, 6.0), y: rnd(1.6, 3.0), sp: rnd(0.03, 0.06) }; root.add(c); clouds.push(c);
  }
  const FF = 70; const ffGeo = new THREE.BufferGeometry(); const ffPos = new Float32Array(FF * 3); const ffSeed = [];
  for (let i = 0; i < FF; i++) { const a = rnd(0, Math.PI * 2), r = rnd(1, 6.5); ffPos.set([Math.cos(a) * r, rnd(0.2, 3.5), Math.sin(a) * r], i * 3); ffSeed.push({ a, r, y: ffPos[i * 3 + 1], s: rnd(0.2, 0.5), p: rnd(0, 6) }); }
  ffGeo.setAttribute("position", new THREE.BufferAttribute(ffPos, 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xb8f5d8, size: 0.045, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  root.add(fireflies);

  // ---------- coins: real rigid bodies ----------
  const faceTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 256); g.strokeStyle = "#a9a9a9"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 88, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#8c8c8c"; g.font = "bold 128px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", 128, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const CR = 0.3, CT = 0.07;
  const coinGeo = new THREE.CylinderGeometry(CR, CR, CT, 32);
  const coinShape = new CANNON.Cylinder(CR, CR, CT, 12);
  const metal = hex => { const side = new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: 0.38, envMap: envTex, envMapIntensity: 0.7 });
    const face = new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness: 0.3, map: faceTex, envMap: envTex, envMapIntensity: 0.7 }); return [side, face, face]; };
  const MATS = [metal(0xd9a93e), metal(0x27b98c), metal(0xd9a93e)];
  const coins = []; const MAX = reduce ? 24 : (small() ? 40 : 70);
  const impacts = []; // dust rings where coins hit hard
  function removeCoin(c) { world.removeBody(c.body); root.remove(c.mesh); }
  function spawn(p, v, spin = true) {
    if (coins.length >= MAX) { const i = coins.findIndex(c => c !== grabbed); removeCoin(coins[i]); coins.splice(i, 1); }
    const m = new THREE.Mesh(coinGeo, MATS[(Math.random() * 3) | 0]); m.castShadow = true; m.receiveShadow = true; root.add(m);
    const b = new CANNON.Body({ mass: 0.08, material: mCoin, linearDamping: 0.03, angularDamping: 0.08, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.6 });
    b.addShape(coinShape); b.position.set(p.x, p.y, p.z);
    b.quaternion.setFromEuler(rndLive(0, 6), rndLive(0, 6), rndLive(0, 6));
    if (v) b.velocity.set(v.x, v.y, v.z);
    if (spin) b.angularVelocity.set(rndLive(-12, 12), rndLive(-6, 6), rndLive(-12, 12));
    const c = { mesh: m, body: b, sink: 0 };
    b.addEventListener("collide", e => { const s = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (s > 3.2 && impacts.length < 12) impacts.push({ x: b.position.x, y: b.position.y, z: b.position.z, s, t: 0, m: null }); });
    world.addBody(b); coins.push(c); return c;
  }
  const rainOne = () => spawn(new THREE.Vector3(rndLive(-3.2, 3.2), rndLive(7, 11), rndLive(-3.2, 3.2)), new THREE.Vector3(0, -1, 0));
  function mintBurst(n = 12) {
    const p = chimTopLocal(); puff(true); puff(true);
    for (let i = 0; i < n; i++) { const a = rndLive(0, Math.PI * 2), s = rndLive(1, 2.8); spawn(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.08, 0.2 + i * 0.02, Math.sin(a) * 0.08)), new THREE.Vector3(Math.cos(a) * s, rndLive(6, 9), Math.sin(a) * s)); }
  }

  // ---------- pointer: hover nudges, drag to grab and throw, click to mint ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3(999, 0, 999); let mx = 0, my = 0, pointerIn = false, lastMove = 0;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.86, 48), new THREE.MeshBasicMaterial({ color: 0x5fe0b6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; root.add(halo);
  const hand = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0, collisionFilterMask: 0 }); world.addBody(hand);
  let grabbed = null, joint = null; const dragPlane = new THREE.Plane(), tmpV = new THREE.Vector3(), handW = new THREE.Vector3();
  const setNdc = e => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); mx = ndc.x; my = ndc.y; pointerIn = e.clientY >= r.top && e.clientY < r.bottom; };
  addEventListener("pointermove", e => { setNdc(e); lastMove = performance.now(); if (grabbed) moveHand(); }, { passive: true });
  function moveHand() { ray.setFromCamera(ndc, camera); if (ray.ray.intersectPlane(dragPlane, handW)) { tmpV.copy(handW); root.worldToLocal(tmpV); tmpV.y = Math.max(tmpV.y, 0.15); hand.position.set(tmpV.x, tmpV.y, tmpV.z); } }
  canvas.addEventListener("pointerdown", e => {
    setNdc(e);
    if (e.pointerType === "mouse" && finePointer && !reduce) {
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(coins.filter(c => !c.sink).map(c => c.mesh), false);
      if (hits.length) {
        grabbed = coins.find(c => c.mesh === hits[0].object);
        // drag in a plane facing the camera through the grab point
        camera.getWorldDirection(tmpV); dragPlane.setFromNormalAndCoplanarPoint(tmpV.negate(), hits[0].point);
        const local = root.worldToLocal(hits[0].point.clone()); hand.position.set(local.x, local.y, local.z);
        const b = grabbed.body; b.wakeUp();
        const pivot = b.quaternion.inverse().vmult(new CANNON.Vec3(local.x - b.position.x, local.y - b.position.y, local.z - b.position.z));
        joint = new CANNON.PointToPointConstraint(b, pivot, hand, new CANNON.Vec3(0, 0, 0), 4); world.addConstraint(joint);
        b.linearDamping = 0.35; b.angularDamping = 0.5; canvas.style.cursor = "grabbing"; canvas.setPointerCapture?.(e.pointerId);
        return;
      }
    }
    mintBurst();
  });
  addEventListener("pointerup", () => { if (!grabbed) return; world.removeConstraint(joint); joint = null; grabbed.body.linearDamping = 0.03; grabbed.body.angularDamping = 0.08; grabbed.body.wakeUp(); grabbed = null; canvas.style.cursor = ""; });

  // ---------- sizing / camera ----------
  const camBase = new THREE.Vector3(12.5, 10.5, 15.5);
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize); resize();
  const offset = () => (canvas.clientWidth >= 900 ? new THREE.Vector3(3.1, -0.3, -2.4) : new THREE.Vector3(0, -1.6, 0));

  // ---------- per-step game rules on top of the physics ----------
  const tmp = new THREE.Vector3();
  function rules(dt) {
    hit.set(999, 0, 999);
    if (pointerIn && !grabbed) { ray.setFromCamera(ndc, camera); const o = new THREE.Vector3(); ground.constant = -root.position.y; if (ray.ray.intersectPlane(ground, o)) { root.worldToLocal(o); if (Math.hypot(o.x, o.z) < R + 0.5) hit.copy(o); } }
    halo.position.set(hit.x, 0.03, hit.z); halo.material.opacity += ((hit.x < 900 ? 0.35 : 0) - halo.material.opacity) * 0.12;
    const moving = performance.now() - lastMove < 120;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i], b = c.body;
      if (c.sink) { // sinking in the pond, then it comes back as rain
        c.sink += dt; c.mesh.position.y -= dt * 0.22; c.mesh.rotation.x += dt * 1.5;
        if (c.sink > 1.4) { root.remove(c.mesh); coins.splice(i, 1); }
        continue;
      }
      // hover: a gentle physical nudge (only while the mouse is actually moving)
      if (moving && hit.x < 900 && c !== grabbed) { tmp.set(b.position.x - hit.x, 0, b.position.z - hit.z); const d = tmp.length();
        if (d < 0.85 && b.position.y < 1.0) { tmp.normalize(); b.wakeUp(); b.applyImpulse(new CANNON.Vec3(tmp.x * 0.05 * (1 - d), 0.09 * (1 - d) + 0.04, tmp.z * 0.05 * (1 - d))); b.angularVelocity.x += rndLive(-3, 3); b.angularVelocity.z += rndLive(-3, 3); } }
      // pond: splash and sink
      // a coin touches the water as soon as its lowest edge does, including a coin that lands standing on its rim
      if (c !== grabbed && Math.hypot(b.position.x - pond.x, b.position.z - pond.z) < pond.r - 0.08 && b.position.y < CR + 0.12) {
        ripple(b.position.x, b.position.z); setTimeout(() => ripple(b.position.x, b.position.z), 140); world.removeBody(b); c.sink = 0.001; continue;
      }
      // fell off the island
      if (b.position.y < -14) { removeCoin(c); coins.splice(i, 1); }
    }
  }
  function sync() { for (const c of coins) if (!c.sink) { c.mesh.position.copy(c.body.position); c.mesh.quaternion.copy(c.body.quaternion); } }

  // ---------- intro + loop ----------
  let visible = true, t = 0, intro = 0, scrollK = 0, sendTimer = 2.5, smokeTimer = 0, rainTimer = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  addEventListener("scroll", () => { scrollK = Math.min(1, scrollY / innerHeight); }, { passive: true });
  if (!reduce) { for (let i = 0; i < 26; i++) setTimeout(rainOne, 900 + i * 90); }
  else { for (let i = 0; i < 20; i++) { const c = spawn(new THREE.Vector3(rnd(-3, 3), CT / 2, rnd(-3, 3)), null, false); c.body.quaternion.set(0, 0, 0, 1); if (!clearOf(c.body.position.x, c.body.position.z, 0.3)) c.body.position.set(rnd(1.8, 3), CT / 2, rnd(1, 2.5)); c.body.sleep(); } sync(); }
  const clock = new THREE.Clock(); const camPos = camBase.clone().multiplyScalar(small() ? 1.5 : 1); const look = new THREE.Vector3(); camera.position.copy(camPos);
  if (opts.debug) window.__hero = { world, coins, spawn, CANNON, root, camera, get grabbed() { return grabbed; } };
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (!visible || document.hidden) return;
    t += dt; intro = reduce ? 1 : Math.min(1, intro + dt / 1.8);
    const e = 1 - Math.pow(1 - intro, 4), off = offset();
    root.position.set(off.x, off.y + (1 - e) * -3 + Math.sin(t * 0.8) * 0.08, off.z);
    root.scale.setScalar(0.7 + 0.3 * e); root.rotation.y = (1 - e) * -0.8 + Math.sin(t * 0.22) * 0.05;
    const far = small() ? 1.5 : 1;
    camPos.set(camBase.x * far + mx * 1.2, camBase.y * far + my * 0.8 + scrollK * 3, camBase.z * far + scrollK * 4);
    camera.position.lerp(camPos, grabbed ? 0.02 : 0.06); look.set(off.x * 0.85, 0.5 + off.y * 0.5 - scrollK * 1.5, off.z * 0.85); camera.lookAt(look);
    if (!reduce) {
      if (grabbed) moveHand();
      world.fixedStep(1 / 60, 4);
      rules(dt); sync();
      rainTimer -= dt; if (rainTimer <= 0) { rainOne(); rainTimer = 1.2; }
      smokeTimer -= dt; if (smokeTimer <= 0) { puff(); smokeTimer = 0.5; }
      sendTimer -= dt; if (sendTimer <= 0) { sendEnvelope(); sendTimer = 6; }
      swayers.forEach(s => (s.o.rotation.z = Math.sin(t * 1.3 + s.p) * 0.035));
      floaters.forEach(f => (f.position.y = f.userData.y + Math.sin(t * f.userData.s + f.userData.p) * 0.18));
      clouds.forEach(c => { c.userData.a += c.userData.sp * dt; c.position.set(Math.cos(c.userData.a) * c.userData.r, c.userData.y + Math.sin(t + c.userData.a) * 0.1, Math.sin(c.userData.a) * c.userData.r); });
      const fp = ffGeo.attributes.position; for (let i = 0; i < FF; i++) { const s = ffSeed[i]; s.a += dt * 0.05 * s.s; fp.setXYZ(i, Math.cos(s.a) * s.r, s.y + Math.sin(t * s.s * 2 + s.p) * 0.25, Math.sin(s.a) * s.r); } fp.needsUpdate = true;
      fireflies.material.opacity = 0.45 + Math.sin(t * 1.7) * 0.1;
      for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.t += dt; const k = s.t / s.life; s.m.position.y += dt * 0.5; s.m.position.x += s.dx * dt; s.m.scale.setScalar(1 + k * 2.2); s.m.material.opacity = 0.55 * (1 - k); s.m.rotation.y += dt; if (k >= 1) { root.remove(s.m); s.m.material.dispose(); smoke.splice(i, 1); } }
      for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.t += dt; r.m.scale.setScalar(1 + r.t * 7); r.m.material.opacity = 0.6 * (1 - r.t / 0.9); if (r.t > 0.9) { root.remove(r.m); r.m.material.dispose(); r.m.geometry.dispose(); ripples.splice(i, 1); } }
      for (let i = impacts.length - 1; i >= 0; i--) { const d = impacts[i]; if (!d.m) { if (d.y > 0.3) { impacts.splice(i, 1); continue; } d.m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 24), rippleMat.clone()); d.m.rotation.x = -Math.PI / 2; d.m.position.set(d.x, 0.02, d.z); root.add(d.m); }
        d.t += dt; d.m.scale.setScalar(1 + d.t * 5); d.m.material.opacity = 0.35 * (1 - d.t / 0.5); if (d.t > 0.5) { root.remove(d.m); d.m.material.dispose(); d.m.geometry.dispose(); impacts.splice(i, 1); } }
      for (let i = envelopes.length - 1; i >= 0; i--) { const v = envelopes[i]; v.t += dt; v.e.position.y += dt * (1.2 + v.t * 0.6); v.e.position.x += v.vx * dt; v.e.position.z += v.vz * dt; v.e.rotation.y += dt * 2.5; v.e.rotation.z = Math.sin(v.t * 4) * 0.3; if (v.t > 4) { root.remove(v.e); envelopes.splice(i, 1); } }
      inside.intensity = 3.2 + Math.sin(t * 7) * 0.25 + Math.sin(t * 13) * 0.12;
    }
    composer.render();
  }
  frame();
}
