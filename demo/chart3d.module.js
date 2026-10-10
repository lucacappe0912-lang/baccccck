<script type="module">
// 3D finance chart for the demo: same scene as the hub's React Three Fiber chart, in plain three.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const SERIES = [
  { key: "income", label: "Entrate", color: "#3987e5" },
  { key: "expenses", label: "Uscite", color: "#d95926" },
  { key: "profit", label: "Utile / Perdita", color: "#9085e9" },
];
const SPACING = 1.55, BAR_W = 0.34, GAP = 0.05, MAX_H = 4.2;

function createChart(host, { months, mode, series, fmtEur, fmtPct, MONTHS }) {
  host.innerHTML = "";
  const W = () => host.clientWidth, H = () => host.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);
  const layer = document.createElement("div");
  layer.className = "tip-layer";
  host.appendChild(layer);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
  // Pull the camera back on narrow screens so all twelve months stay in frame.
  const fitCamera = () => {
    camera.aspect = W() / H();
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const dist = Math.max(12, ((months.length - 1) * SPACING + 2.4) / 2 / Math.tan(hfov / 2));
    camera.position.set(0, 3.4 * (dist / 12), dist);
    camera.updateProjectionMatrix();
  };
  fitCamera();
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(6, 10, 6);
  scene.add(dir);

  const root = new THREE.Group();
  root.position.y = mode === "pl" ? -1.5 : -1.2;
  scene.add(root);
  const offset = ((months.length - 1) * SPACING) / 2;
  const width = (months.length - 1) * SPACING;

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width + 4, 5), new THREE.MeshPhysicalMaterial({ color: 0x0d0d10, metalness: 0.6, roughness: 0.6, envMapIntensity: 0.25, transparent: true, opacity: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const grid = new THREE.GridHelper(width + 4, Math.round(width + 4), 0x2a2a2e, 0x18181b);
  grid.position.y = 0.001;
  root.add(grid);

  const hitboxes = [], highlight = [], animated = [], labels = [];
  const label = (text, pos) => {
    const el = document.createElement("div");
    el.className = "month-label";
    el.textContent = text;
    layer.appendChild(el);
    labels.push({ el, pos });
  };
  const hitbox = (i, x, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(SPACING * 0.95, h, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, 0.5, 0);
    m.userData.i = i;
    root.add(m);
    hitboxes.push(m);
  };

  let tipFor;
  if (mode === "pl") {
    const active = SERIES.filter((s) => series[s.key]);
    const maxAbs = Math.max(1, ...months.flatMap((d) => active.map((s) => Math.abs(d[s.key]))));
    const scale = MAX_H / maxAbs;
    const groupW = active.length * BAR_W + (active.length - 1) * GAP;
    months.forEach((d, i) => {
      const gx = i * SPACING - offset;
      highlight[i] = [];
      active.forEach((s, j) => {
        const v = d[s.key] * scale;
        if (v === 0) return;
        const h = Math.max(Math.abs(v), 0.02), sign = v < 0 ? -1 : 1;
        const mat = new THREE.MeshPhysicalMaterial({ color: s.color, metalness: 0.75, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4, emissive: s.color, emissiveIntensity: 0.06 });
        const mesh = new THREE.Mesh(new RoundedBoxGeometry(BAR_W, h, BAR_W, 4, 0.05), mat);
        mesh.position.y = (sign * h) / 2;
        const g = new THREE.Group();
        g.position.x = gx - groupW / 2 + BAR_W / 2 + j * (BAR_W + GAP);
        g.scale.y = 0.0001;
        g.add(mesh);
        root.add(g);
        animated.push({ g, delay: i * 0.04 + j * 0.05 });
        highlight[i].push(mat);
      });
      hitbox(i, gx, MAX_H * 2.2);
      label(MONTHS[d.month - 1], new THREE.Vector3(gx, -0.05, 0.95));
    });
    tipFor = (i) => {
      const d = months[i];
      const top = Math.max(0.6, d.income * scale, d.expenses * scale, d.profit * scale) + 0.4;
      return {
        pos: new THREE.Vector3(i * SPACING - offset, top, 0),
        html: `<div style="font-weight:600;margin-bottom:6px">${MONTHS[d.month - 1]}</div>` +
          SERIES.map((s) => `<div class="r"><span class="muted"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:6px"></i>${s.label}</span><span>${fmtEur(d[s.key])}</span></div>`).join("") +
          `<div class="r" style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.1)"><span class="muted">Margine</span><span>${d.margin === null ? "—" : fmtPct(d.margin)}</span></div>`,
      };
    };
  } else {
    let acc = 0;
    const cum = months.map((d) => (acc += d.profit));
    const s = MAX_H / Math.max(1, ...cum.map(Math.abs));
    const pts = cum.map((v, i) => new THREE.Vector3(i * SPACING - offset, v * s, 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.07, 24, false), new THREE.MeshPhysicalMaterial({ color: 0xe8ebef, metalness: 1, roughness: 0.08, clearcoat: 1, envMapIntensity: 2 })));
    pts.forEach((p, i) => {
      const c = cum[i] >= 0 ? "#9085e9" : "#d95926";
      const mat = new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.8, roughness: 0.15, clearcoat: 1, emissive: c, emissiveIntensity: 0.15 });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 32), mat);
      sphere.position.copy(p);
      root.add(sphere);
      highlight[i] = [mat];
      hitbox(i, p.x, MAX_H * 2.4);
      label(MONTHS[months[i].month - 1], new THREE.Vector3(p.x, -0.05, 0.95));
    });
    tipFor = (i) => ({
      pos: pts[i].clone().add(new THREE.Vector3(0, 0.35, 0)),
      html: `<div style="font-weight:600;margin-bottom:6px">Fine ${MONTHS[months[i].month - 1]}</div><div class="r"><span class="muted">Cassa cumulata</span><span>${fmtEur(cum[i])}</span></div><div class="r"><span class="muted">Flusso del mese</span><span>${fmtEur(months[i].profit)}</span></div>`,
    });
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enablePan: false, enableZoom: false, enableDamping: true, minPolarAngle: 0.75, maxPolarAngle: 1.5, minAzimuthAngle: -0.7, maxAzimuthAngle: 0.7 });

  // hover
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  layer.appendChild(tip);
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let hover = null;
  const setHover = (i) => {
    if (hover === i) return;
    if (hover !== null) highlight[hover]?.forEach((m) => (m.emissiveIntensity = mode === "pl" ? 0.06 : 0.15));
    hover = i;
    if (i === null) { tip.hidden = true; return; }
    highlight[i]?.forEach((m) => (m.emissiveIntensity = 0.5));
    const t = tipFor(i);
    tip.innerHTML = t.html;
    tip.dataset.x = t.pos.x; tip.dataset.y = t.pos.y; tip.dataset.z = t.pos.z;
    tip.hidden = false;
  };
  const onMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(hitboxes)[0];
    setHover(hit ? hit.object.userData.i : null);
  };
  const onLeave = () => setHover(null);
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);

  const project = (v, el) => {
    const p = v.clone();
    root.localToWorld(p);
    p.project(camera);
    el.style.left = `${((p.x + 1) / 2) * W()}px`;
    el.style.top = `${((1 - p.y) / 2) * H()}px`;
  };

  const ro = new ResizeObserver(() => { fitCamera(); renderer.setSize(W(), H()); });
  ro.observe(host);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let raf;
  const tick = () => {
    const t = clock.getElapsedTime();
    for (const a of animated) {
      const p = reduce ? 1 : Math.min(1, Math.max(0, (t - a.delay) / 0.9));
      a.g.scale.y = Math.max(0.0001, 1 - Math.pow(1 - p, 3));
    }
    controls.update();
    renderer.render(scene, camera);
    for (const l of labels) project(l.pos, l.el);
    if (!tip.hidden) project(new THREE.Vector3(+tip.dataset.x, +tip.dataset.y, +tip.dataset.z), tip);
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

window.__chartReady(createChart);
</script>
