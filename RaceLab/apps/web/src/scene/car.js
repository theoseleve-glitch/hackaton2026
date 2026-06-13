// scene/car.js — procedural Three.js RC buggy.
// Built entirely from primitives (no external models): a rounded-box body,
// a chassis plate, 4 cylinder wheels, a box wing, and accent shock cylinders.
// Returns named part handles so the tune sequence can scrub each one.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { env } from "../env.js";

export function createCar(container) {
  const scene = new THREE.Scene();

  // ~35deg perspective, framed three-quarter from above the front-right.
  const camera = new THREE.PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );
  camera.position.set(4.2, 2.2, 5.4);
  camera.lookAt(0, 0.3, 0);

  // Transparent renderer so the canvas composites over the dark page.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, env.isMobile ? 1.5 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Lighting: cool sky/ground hemi fill, a bright key, and an accent rim
  // that wraps the dark metal in a hot orange edge.
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0a0a0c, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff5a26, 1.6);
  rim.position.set(-6, 2, -4);
  scene.add(rim);
  // A soft fill from camera-side keeps the shadowed flank readable.
  const fill = new THREE.DirectionalLight(0xaab4c8, 0.5);
  fill.position.set(3, 1.5, -5);
  scene.add(fill);

  const group = new THREE.Group();
  scene.add(group);

  // Materials: dark metal shell, hot accent details, matte dark for rubber/floor.
  const metal = new THREE.MeshStandardMaterial({
    color: 0x1a1c21,
    metalness: 0.6,
    roughness: 0.35,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xff5a26,
    metalness: 0.4,
    roughness: 0.3,
    emissive: 0xff5a26,
    emissiveIntensity: 0.18,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x0e0f12,
    metalness: 0.2,
    roughness: 0.8,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x141519,
    metalness: 0.1,
    roughness: 0.9,
  });

  // --- Chassis plate: a thin slab under the body that the explode reveals. ---
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.12, 1.3),
    metal,
  );
  chassis.position.y = 0.35;

  // --- Body: rounded shell, the visual anchor of the buggy. ---
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(2.2, 0.6, 1.2, 4, 0.18),
    metal,
  );
  body.position.y = 0.75;
  // A tapered nose cone reads as the front of the car.
  const nose = new THREE.Mesh(
    new RoundedBoxGeometry(0.7, 0.34, 0.9, 3, 0.14),
    metal,
  );
  nose.position.set(1.15, 0.66, 0);
  nose.rotation.z = -0.12;
  body.add(nose);
  nose.position.sub(body.position); // keep child local to body origin
  // A bright accent cockpit/livery stripe across the deck.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.04, 0.5),
    accent,
  );
  stripe.position.set(0.1, 0.31, 0);
  body.add(stripe);

  // --- Wing: angled accent slab on a pair of mounts at the rear. ---
  const wing = new THREE.Group();
  const wingBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.06, 1.3),
    accent,
  );
  wingBlade.rotation.x = 0.18;
  const mountL = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.32, 0.05),
    metal,
  );
  mountL.position.set(0.04, -0.18, 0.45);
  const mountR = mountL.clone();
  mountR.position.z = -0.45;
  wing.add(wingBlade, mountL, mountR);
  wing.position.set(-1.05, 1.05, 0);
  wing.rotation.z = 0.18;

  // --- Wheels: cylinders laid flat, with a contrasting hub. ---
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 28);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.36, 16);
  const mkWheel = (x, z) => {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, rubber);
    const hub = new THREE.Mesh(hubGeo, accent);
    w.add(tyre, hub);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.42, z);
    return w;
  };
  const fl = mkWheel(0.85, 0.62);
  const fr = mkWheel(0.85, -0.62);
  const rl = mkWheel(-0.85, 0.62);
  const rr = mkWheel(-0.85, -0.62);
  const frontWheels = new THREE.Group();
  frontWheels.add(fl, fr);
  const rearWheels = new THREE.Group();
  rearWheels.add(rl, rr);

  // --- Shocks: slim accent cylinders bridging chassis to each corner. ---
  const shockGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 10);
  const mkShock = (x, z) => {
    const s = new THREE.Mesh(shockGeo, accent);
    s.position.set(x, 0.55, z);
    s.rotation.z = 0.3;
    return s;
  };
  const shocks = new THREE.Group();
  shocks.add(
    mkShock(0.85, 0.45),
    mkShock(0.85, -0.45),
    mkShock(-0.85, 0.45),
    mkShock(-0.85, -0.45),
  );

  group.add(chassis, body, wing, frontWheels, rearWheels, shocks);

  // --- Contact shadow: a soft dark radial disc on the floor (no real shadows). ---
  const shadowTex = makeRadialShadowTexture();
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 2.6),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  scene.add(contact);

  const parts = { body, chassis, wing, frontWheels, rearWheels, shocks, group };

  function render() {
    renderer.render(scene, camera);
  }
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { group, parts, render, resize, dispose, renderer, camera };
}

// Procedurally paints a soft radial gradient onto a canvas texture for the
// contact shadow — keeps the buggy grounded without needing shadow maps.
function makeRadialShadowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(0,0,0,0.85)");
  g.addColorStop(0.55, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
