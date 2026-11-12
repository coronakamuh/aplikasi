import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const KEY = 'rencana-bangunan-3d:v1';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cm = (m) => Math.round(m * 100).toLocaleString('id-ID') + ' cm';

/* ---------- Data ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.walls)) {
      return {
        walls: d.walls.filter((w) => [w.x1, w.y1, w.x2, w.y2].every(Number.isFinite)),
        height: Number.isFinite(d.height) ? d.height : 3,
        thickness: Number.isFinite(d.thickness) ? d.thickness : 15,
      };
    }
  } catch {
    /* abaikan data rusak */
  }
  return null;
}
const state = load() || { walls: [], height: 3, thickness: 15 };
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/* ---------- Denah 2D ---------- */
const plan = $('plan');
const ctx = plan.getContext('2d');
let dpr = 1;
const view = { x: 0, y: 0, s: 40 }; // s = piksel per meter
let tool = 'wall';
let start = null;
let cursor = null;

const toWorld = (p) => ({ x: (p.x - view.x) / view.s, y: (p.y - view.y) / view.s });

function segLen(w) {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

function distSeg(px, py, w) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - w.x1) * dx + (py - w.y1) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
}

function snap(wx, wy) {
  let best = null;
  let bd = 14 / view.s;
  for (const w of state.walls) {
    for (const p of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const d = Math.hypot(p[0] - wx, p[1] - wy);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  }
  if (best) return { x: best[0], y: best[1] };
  const g = 0.25;
  return { x: Math.round(wx / g) * g, y: Math.round(wy / g) * g };
}

function fitView() {
  const w = plan.clientWidth;
  const h = plan.clientHeight;
  if (!state.walls.length) {
    view.s = 40;
    view.x = w / 2;
    view.y = h / 2;
    return;
  }
  const xs = state.walls.flatMap((k) => [k.x1, k.x2]);
  const ys = state.walls.flatMap((k) => [k.y1, k.y2]);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  const pad = 1.5;
  const bw = Math.max(maxx - minx, 1) + pad * 2;
  const bh = Math.max(maxy - miny, 1) + pad * 2;
  view.s = clamp(Math.min(w / bw, h / bh), 8, 200);
  view.x = w / 2 - ((minx + maxx) / 2) * view.s;
  view.y = h / 2 - ((miny + maxy) / 2) * view.s;
}

function resizePlan() {
  dpr = window.devicePixelRatio || 1;
  plan.width = Math.round(plan.clientWidth * dpr);
  plan.height = Math.round(plan.clientHeight * dpr);
  draw();
}

function label(text, x, y) {
  ctx.font = '12px Inter, system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x - tw / 2 - 4, y - 9, tw + 8, 18);
  ctx.fillStyle = '#12263f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function draw() {
  const w = plan.clientWidth;
  const h = plan.clientHeight;
  const s = view.s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // grid
  const step = s >= 30 ? 1 : s >= 14 ? 2 : 5;
  const gx0 = Math.floor(-view.x / s / step) * step;
  const gx1 = (w - view.x) / s;
  const gy0 = Math.floor(-view.y / s / step) * step;
  const gy1 = (h - view.y) / s;
  ctx.lineWidth = 1;
  for (let x = gx0; x <= gx1; x += step) {
    const sx = Math.round(x * s + view.x) + 0.5;
    ctx.strokeStyle = x === 0 ? '#9aa6b6' : '#e4e8ee';
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }
  for (let y = gy0; y <= gy1; y += step) {
    const sy = Math.round(y * s + view.y) + 0.5;
    ctx.strokeStyle = y === 0 ? '#9aa6b6' : '#e4e8ee';
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }

  // dinding
  ctx.lineCap = 'square';
  ctx.lineWidth = Math.max(3, (state.thickness / 100) * s);
  ctx.strokeStyle = '#12263f';
  for (const k of state.walls) {
    ctx.beginPath();
    ctx.moveTo(k.x1 * s + view.x, k.y1 * s + view.y);
    ctx.lineTo(k.x2 * s + view.x, k.y2 * s + view.y);
    ctx.stroke();
  }
  for (const k of state.walls) {
    const len = segLen(k);
    if (len * s < 44) continue;
    label(cm(len), ((k.x1 + k.x2) / 2) * s + view.x, ((k.y1 + k.y2) / 2) * s + view.y - 14);
  }

  // garis sementara
  if (tool === 'wall' && start) {
    const sx = start.x * s + view.x;
    const sy = start.y * s + view.y;
    if (cursor) {
      const ex = cursor.x * s + view.x;
      const ey = cursor.y * s + view.y;
      ctx.lineCap = 'butt';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#1f5fbf';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      const len = Math.hypot(cursor.x - start.x, cursor.y - start.y);
      if (len > 0.05) label(cm(len), (sx + ex) / 2, (sy + ey) / 2 - 14);
    }
    ctx.fillStyle = '#1f5fbf';
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateInfo() {
  const n = state.walls.length;
  const total = state.walls.reduce((a, k) => a + segLen(k), 0);
  $('info').textContent = n ? `${n} dinding · ${cm(total)}` : 'Belum ada dinding';
}

function updateHint() {
  const hint = $('hint');
  if (tool === 'erase') hint.textContent = 'Ketuk dinding untuk menghapusnya.';
  else if (!start) hint.textContent = 'Ketuk titik awal dinding. Geser untuk menggeser denah, cubit untuk zoom.';
  else hint.textContent = 'Ketuk titik berikutnya. Tekan Akhiri untuk berhenti menggambar.';
}

function setTool(t) {
  tool = t;
  start = null;
  cursor = null;
  $('btn-wall').classList.toggle('active', t === 'wall');
  $('btn-erase').classList.toggle('active', t === 'erase');
  updateHint();
  draw();
}

function tap(p) {
  const w = toWorld(p);
  if (tool === 'wall') {
    const q = snap(w.x, w.y);
    if (!start) {
      start = q;
    } else if (Math.hypot(q.x - start.x, q.y - start.y) > 0.05) {
      state.walls.push({ x1: start.x, y1: start.y, x2: q.x, y2: q.y });
      start = q;
      save();
      updateInfo();
    }
    cursor = q;
  } else {
    let bi = -1;
    let bd = 14 / view.s;
    state.walls.forEach((k, i) => {
      const d = distSeg(w.x, w.y, k);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bi >= 0) {
      state.walls.splice(bi, 1);
      save();
      updateInfo();
    }
  }
  updateHint();
  draw();
}

/* gestur: geser, cubit, ketuk */
const pts = new Map();
let gest = null;
let pinch = null;

function local(e) {
  const r = plan.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

plan.addEventListener('pointerdown', (e) => {
  plan.setPointerCapture(e.pointerId);
  const p = local(e);
  pts.set(e.pointerId, { x: p.x, y: p.y });
  if (pts.size === 1) {
    gest = { sx: p.x, sy: p.y, moved: false, noTap: false };
  } else if (pts.size === 2 && gest) {
    gest.noTap = true;
    const [a, b] = [...pts.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s, w: toWorld(mid) };
  }
});

plan.addEventListener('pointermove', (e) => {
  const p = local(e);
  const rec = pts.get(e.pointerId);
  if (!rec) {
    const w = toWorld(p);
    cursor = snap(w.x, w.y);
    if (start) draw();
    return;
  }
  if (pts.size === 2 && pinch) {
    rec.x = p.x;
    rec.y = p.y;
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.s = clamp((pinch.s * d) / pinch.d, 8, 200);
    view.x = mid.x - pinch.w.x * view.s;
    view.y = mid.y - pinch.w.y * view.s;
    draw();
    return;
  }
  if (pts.size === 1 && gest) {
    if (!gest.moved && Math.hypot(p.x - gest.sx, p.y - gest.sy) > 8) gest.moved = true;
    if (gest.moved) {
      view.x += p.x - rec.x;
      view.y += p.y - rec.y;
    } else {
      const w = toWorld(p);
      cursor = snap(w.x, w.y);
    }
    rec.x = p.x;
    rec.y = p.y;
    draw();
  }
});

function endPointer(e) {
  if (!pts.has(e.pointerId)) return;
  const wasSingle = pts.size === 1;
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (wasSingle && gest && !gest.moved && !gest.noTap && e.type === 'pointerup') tap(local(e));
  if (pts.size === 1 && gest) gest.moved = true;
  if (pts.size === 0) gest = null;
}
plan.addEventListener('pointerup', endPointer);
plan.addEventListener('pointercancel', endPointer);

plan.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = local(e);
    const w = toWorld(p);
    view.s = clamp(view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 8, 200);
    view.x = p.x - w.x * view.s;
    view.y = p.y - w.y * view.s;
    draw();
  },
  { passive: false }
);

/* ---------- Tampilan 3D ---------- */
let renderer;
let scene;
let camera;
let controls;
let group;
let raf = 0;
let fitted3D = false;

function init3D() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  $('three').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef1f5);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.02;
  controls.minDistance = 2;
  controls.maxDistance = 120;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b0, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 35, 15);
  scene.add(sun);
  scene.add(new THREE.GridHelper(80, 80, 0xb5bcc8, 0xd3d8e0));
  group = new THREE.Group();
  scene.add(group);
}

function build3D() {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  group.clear();
  const walls = state.walls;
  $('empty3d').hidden = walls.length > 0;
  if (!walls.length) {
    fitted3D = false;
    return;
  }
  const h = state.height;
  const t = state.thickness / 100;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1ece4, roughness: 0.9 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8a8f98 });

  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (const k of walls) {
    minx = Math.min(minx, k.x1, k.x2);
    maxx = Math.max(maxx, k.x1, k.x2);
    miny = Math.min(miny, k.y1, k.y2);
    maxy = Math.max(maxy, k.y1, k.y2);
    const len = segLen(k);
    if (len < 0.01) continue;
    const geo = new THREE.BoxGeometry(len + t, h, t);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set((k.x1 + k.x2) / 2, h / 2, (k.y1 + k.y2) / 2);
    mesh.rotation.y = -Math.atan2(k.y2 - k.y1, k.x2 - k.x1);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    group.add(edges);
  }

  const fw = maxx - minx + 1;
  const fh = maxy - miny + 1;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(fw, fh),
    new THREE.MeshStandardMaterial({ color: 0xd9d4cb, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((minx + maxx) / 2, 0.01, (miny + maxy) / 2);
  group.add(floor);

  if (!fitted3D) {
    const cx = (minx + maxx) / 2;
    const cz = (miny + maxy) / 2;
    const r = Math.max(maxx - minx, maxy - miny, h, 3);
    const d = r * 1.3 + 3;
    camera.position.set(cx + d, d * 0.85, cz + d);
    controls.target.set(cx, h / 3, cz);
    controls.update();
    fitted3D = true;
  }
}

function resize3D() {
  const c = $('three');
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function loop() {
  raf = requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
}

/* ---------- Tab ---------- */
function setTab(name) {
  const is3d = name === '3d';
  $('view-plan').classList.toggle('active', !is3d);
  $('view-3d').classList.toggle('active', is3d);
  $('tab-plan').classList.toggle('active', !is3d);
  $('tab-3d').classList.toggle('active', is3d);
  $('panel').hidden = is3d;
  cancelAnimationFrame(raf);
  raf = 0;
  if (is3d) {
    init3D();
    build3D();
    resize3D();
    loop();
  } else {
    requestAnimationFrame(resizePlan);
  }
}

/* ---------- Tombol ---------- */
$('tab-plan').addEventListener('click', () => setTab('plan'));
$('tab-3d').addEventListener('click', () => setTab('3d'));
$('btn-wall').addEventListener('click', () => setTool('wall'));
$('btn-erase').addEventListener('click', () => setTool('erase'));
$('btn-finish').addEventListener('click', () => {
  start = null;
  cursor = null;
  updateHint();
  draw();
});
$('btn-undo').addEventListener('click', () => {
  const k = state.walls.pop();
  if (!k) return;
  if (start) start = { x: k.x1, y: k.y1 };
  save();
  updateInfo();
  draw();
});
$('btn-fit').addEventListener('click', () => {
  fitView();
  draw();
});
$('btn-clear').addEventListener('click', () => {
  if (!state.walls.length) return;
  if (!window.confirm('Hapus semua dinding?')) return;
  state.walls = [];
  start = null;
  cursor = null;
  save();
  updateInfo();
  updateHint();
  fitView();
  draw();
});

$('in-height').value = Math.round(state.height * 100);
$('in-thick').value = state.thickness;
$('in-height').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  state.height = Number.isFinite(v) ? clamp(v, 100, 2000) / 100 : 3;
  e.target.value = Math.round(state.height * 100);
  save();
});
$('in-thick').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  state.thickness = Number.isFinite(v) ? clamp(v, 5, 60) : 15;
  e.target.value = state.thickness;
  save();
  draw();
});

window.addEventListener('resize', () => {
  if ($('view-3d').classList.contains('active')) resize3D();
  else resizePlan();
});

/* ---------- Mulai ---------- */
updateInfo();
updateHint();
resizePlan();
fitView();
draw();
