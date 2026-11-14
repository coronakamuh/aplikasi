import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeWalls, prismData, wallElevations, wallProfileHeight, projectOnSegment, round2 } from './geometry.js';
import './style.css';

const KEY = 'rencana-bangunan-3d:v2';
const HELP_KEY = 'rencana-bangunan-3d:help';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => round2(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const vib = (ms) => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* tidak apa-apa */
  }
};

/* ---------- Data (satuan cm) ---------- */
const defaultCfg = () => ({ v: 3, defT: 15, defH: 200, newLen: 200, cloneGap: 100, grid: 5, labels: true, snap: true });
let state = { nodes: [], walls: [], next: 1 };
let cfg = defaultCfg();
const hist = [];
const redoStack = [];

function parseData(d) {
  if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.walls)) return null;
  const nodes = d.nodes.filter((n) => Number.isFinite(n.id) && Number.isFinite(n.x) && Number.isFinite(n.y));
  const ids = new Set(nodes.map((n) => n.id));
  const walls = d.walls
    .filter((w) => ids.has(w.a) && ids.has(w.b) && w.a !== w.b && Number.isFinite(w.id) && Number.isFinite(w.t))
    .map((w) => {
      const h = Number.isFinite(w.h) ? w.h : 300;
      const { h: _old, flip: _flip, ...rest } = w;
      return {
        ...rest,
        hA: Number.isFinite(w.hA) ? w.hA : h,
        hB: Number.isFinite(w.hB) ? w.hB : h,
        iA: Number.isFinite(w.iA) ? w.iA : 0,
        iB: Number.isFinite(w.iB) ? w.iB : 0,
        on: w.on ?? null,
      };
    });
  const maxId = Math.max(0, ...nodes.map((n) => n.id), ...walls.map((w) => w.id));
  const c = Object.assign(defaultCfg(), d.cfg || {});
  if (c.v !== 3) {
    c.v = 3;
    c.defH = 200;
    c.newLen = 200;
  }
  return { st: { nodes, walls, next: Math.max(Number.isFinite(d.next) ? d.next : 1, maxId + 1) }, cfg: c };
}

function loadData() {
  try {
    const r = parseData(JSON.parse(localStorage.getItem(KEY)));
    if (r) {
      state = r.st;
      cfg = r.cfg;
    }
  } catch {
    /* abaikan data rusak */
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, cfg }));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

const nodeById = (id) => state.nodes.find((n) => n.id === id);
const wallById = (id) => state.walls.find((w) => w.id === id);
const wallBetween = (a, b) => state.walls.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));

function addNode(x, y) {
  const n = { id: state.next++, x: round2(x), y: round2(y) };
  state.nodes.push(n);
  return n.id;
}
function addWall(a, b, on = null) {
  const w = { id: state.next++, a, b, t: cfg.defT, hA: cfg.defH, hB: cfg.defH, iA: 0, iB: 0, on };
  state.walls.push(w);
  return w.id;
}
function splitWall(wid, x, y) {
  const w = wallById(wid);
  const A = nodeById(w.a);
  const B = nodeById(w.b);
  const nid = addNode(x, y);
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  const pr = projectOnSegment({ x, y }, A, B);
  const s = pr.t * L;
  const iA = Math.min(w.iA || 0, L);
  const iB = Math.min(w.iB || 0, L - iA);
  const hMid = round2(wallProfileHeight({ hA: w.hA, hB: w.hB, iA, iB, L }, s));
  const w2 = { ...w, id: state.next++, a: nid, hA: hMid, iA: 0, iB: round2(Math.max(0, Math.min(iB, L - s))) };
  w.b = nid;
  w.hB = hMid;
  w.iB = 0;
  w.iA = round2(Math.min(iA, s));
  state.walls.push(w2);
  return nid;
}
/* gabungkan titik 'from' ke titik 'to' (dinding ikut tersambung) */
function mergeInto(from, to) {
  if (from === to) return;
  for (const w of state.walls) {
    if (w.a === from) w.a = to;
    if (w.b === from) w.b = to;
  }
  const seen = new Map();
  const drop = new Set();
  for (const w of state.walls) {
    const k = w.a < w.b ? `${w.a}-${w.b}-${w.on}` : `${w.b}-${w.a}-${w.on}`;
    if (w.a === w.b || seen.has(k)) drop.add(w.id);
    else seen.set(k, w.id);
  }
  state.walls = state.walls.filter((w) => !drop.has(w.id));
  for (const w of state.walls) if (drop.has(w.on)) w.on = null;
  state.nodes = state.nodes.filter((n) => n.id !== from);
}
function cleanOrphans() {
  const used = new Set();
  for (const w of state.walls) {
    used.add(w.a);
    used.add(w.b);
  }
  state.nodes = state.nodes.filter((n) => used.has(n.id));
}

/* ---------- Status antarmuka ---------- */
let sel = null; // { type: 'wall' | 'node', id }
let locked = false;
let geo = new Map();
let elev = new Map();
let nodeElev = new Map();
let snapMark = null; // { x, y, h } penanda tujuan magnet

const selWall = () => (sel && sel.type === 'wall' ? wallById(sel.id) : null);
const selNode = () => (sel && sel.type === 'node' ? nodeById(sel.id) : null);
const elevOfNode = (id) => (nodeElev.has(id) ? nodeElev.get(id) : 0);

function pushHist(before) {
  hist.push(before);
  if (hist.length > 80) hist.shift();
  redoStack.length = 0;
}

function commit(fn) {
  const before = JSON.stringify(state);
  fn();
  cleanOrphans();
  if (JSON.stringify(state) !== before) pushHist(before);
  refresh();
}

function undo() {
  const p = hist.pop();
  if (!p) return;
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(p);
  sel = null;
  refresh();
}

function redo() {
  const n = redoStack.pop();
  if (!n) return;
  hist.push(JSON.stringify(state));
  state = JSON.parse(n);
  sel = null;
  refresh();
}

let toastTimer = 0;
function toast(text, withUndo = false) {
  $('toast-t').textContent = text;
  $('toast-undo').hidden = !withUndo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 4500);
}

/* ---------- Scene 3D ---------- */
const host = $('three');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f5);
const camera = new THREE.PerspectiveCamera(50, 1, 5, 200000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2.02;
controls.minDistance = 40;
controls.maxDistance = 60000;

scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b0, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2000, 3500, 1500);
scene.add(sun);
scene.add(new THREE.GridHelper(10000, 100, 0xb5bcc8, 0xd3d8e0));

/* tekstur bata tipis: 22 x 7 cm, warna lembut dan garis sambungan samar */
function makeBrickTexture() {
  const c = document.createElement('canvas');
  c.width = 264;
  c.height = 84;
  const g = c.getContext('2d');
  const cols = ['#ead9ca', '#f0e2d6', '#eddcce', '#f1e4d8'];
  const bw = 132;
  const bh = 42;
  let k = 0;
  g.fillStyle = '#dcc9b9';
  g.fillRect(0, 0, c.width, c.height);
  const brick = (x, y, w) => {
    g.fillStyle = cols[k++ % cols.length];
    g.fillRect(x + 1, y + 1, w - 2, bh - 2);
  };
  brick(0, 0, bw);
  brick(bw, 0, bw);
  brick(0, bh, bw / 2);
  brick(bw / 2, bh, bw);
  brick(bw * 1.5, bh, bw / 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const brickTex = makeBrickTexture();

const matPlain = new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.95, side: THREE.DoubleSide });
const matPlainSel = new THREE.MeshStandardMaterial({ color: 0xbfd6f7, roughness: 0.95, side: THREE.DoubleSide });
const matBrick = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95, side: THREE.DoubleSide });
const matBrickSel = new THREE.MeshStandardMaterial({ map: brickTex, color: 0xbfd6f7, roughness: 0.95, side: THREE.DoubleSide });
const lineMat = new THREE.LineBasicMaterial({ color: 0x7d8794 });
const lineSel = new THREE.LineBasicMaterial({ color: 0x1f5fbf });
const lineHandle = new THREE.LineBasicMaterial({ color: 0xf59e0b });

const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
const markerMats = {
  normal: new THREE.MeshBasicMaterial({ color: 0x1f5fbf }),
  sel: new THREE.MeshBasicMaterial({ color: 0xd62d20 }),
  top: new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
  snap: new THREE.MeshBasicMaterial({ color: 0x16a34a }),
  ring: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }),
};
const MARKER_K = 0.011; // ukuran titik relatif jarak kamera (kecil, bergaris)

/* titik berwarna dengan garis tepi putih; ikut tersembunyi jika tertutup benda lain */
function makeMarker(mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(sphereGeo, mat));
  const ring = new THREE.Mesh(sphereGeo, markerMats.ring);
  ring.scale.setScalar(1.3);
  g.add(ring);
  return g;
}

const wallGroup = new THREE.Group();
const markerGroup = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(wallGroup, markerGroup, handleGroup);
const wallMeshes = [];
const markers = []; // titik biru (sudut)
const topHandles = []; // titik oranye { end, m, wid, px, py, top }
let armedKey = null; // titik yang sedang siap diseret (diperbesar)

const labelsEl = $('labels');
const labelEls = [];

function rebuildScene() {
  geo = computeWalls(state.nodes, state.walls);
  elev = wallElevations(state.nodes, state.walls);
  nodeElev = new Map();
  for (const w of state.walls) {
    const e = elev.get(w.id);
    if (!e) continue;
    if (!nodeElev.has(w.a)) nodeElev.set(w.a, e.baseA);
    if (!nodeElev.has(w.b)) nodeElev.set(w.b, e.baseB);
  }

  for (const c of wallGroup.children) c.geometry.dispose();
  wallGroup.clear();
  wallMeshes.length = 0;
  for (const w of state.walls) {
    const g = geo.get(w.id);
    const e = elev.get(w.id);
    if (!g || !e) continue;
    const isSel = sel && sel.type === 'wall' && sel.id === w.id;
    const d = g.dir;
    const bots = g.t.map((t) => e.baseA + (e.baseB - e.baseA) * t);
    const tops = [e.topA, e.topB, e.topB, e.topA].map((v, i) => Math.max(bots[i], v));
    const sh = [e.iA, -e.iB, -e.iB, e.iA]; // pergeseran titik atas sepanjang dinding
    const topPoly = g.poly.map((p, i) => ({ x: p.x + d.x * sh[i], y: p.y + d.y * sh[i] }));
    const pd = prismData(g.poly, bots, tops, topPoly);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pd.positions, 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(pd.uvs, 2));
    bg.addGroup(0, pd.planeVerts, 0);
    bg.addGroup(pd.planeVerts, pd.sideVerts, 1);
    bg.computeVertexNormals();
    const mesh = new THREE.Mesh(bg, isSel ? [matPlainSel, matBrickSel] : [matPlain, matBrick]);
    mesh.userData.id = w.id;
    wallGroup.add(mesh);
    wallMeshes.push(mesh);
    wallGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(bg, 25), isSel ? lineSel : lineMat));
  }
  wallGroup.updateMatrixWorld(true);

  markerGroup.clear();
  markers.length = 0;
  for (const n of state.nodes) {
    const isSel = sel && sel.type === 'node' && sel.id === n.id;
    const m = makeMarker(isSel ? markerMats.sel : markerMats.normal);
    m.position.set(n.x, elevOfNode(n.id) + 1.5, n.y);
    m.userData.id = n.id;
    markerGroup.add(m);
    markers.push(m);
  }
  if (snapMark) {
    const m = makeMarker(markerMats.snap);
    m.position.set(snapMark.x, snapMark.h + 2, snapMark.y);
    m.userData.snap = true;
    markerGroup.add(m);
  }

  for (const c of handleGroup.children) if (c.isLine) c.geometry.dispose();
  handleGroup.clear();
  topHandles.length = 0;

  labelsEl.innerHTML = '';
  labelEls.length = 0;
  const addLabel = (text, cls, x, y, z, dy = 0, occl = false) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    labelsEl.appendChild(el);
    labelEls.push({ el, x, y, z, dy, occl });
  };

  for (const w of state.walls) {
    const g = geo.get(w.id);
    const e = elev.get(w.id);
    const A = nodeById(w.a);
    const B = nodeById(w.b);
    if (!g || !e || !A || !B) continue;
    const d = g.dir;
    const isSel = sel && sel.type === 'wall' && sel.id === w.id;
    if (isSel && cfg.labels) addLabel(num(g.length), 'lbl sel', g.mid.x, (e.topA + e.topB) / 2 + 6, g.mid.y);
    const ends = [
      ['a', A, e.baseA, e.topA, e.hA, A.x + d.x * e.iA, A.y + d.y * e.iA],
      ['b', B, e.baseB, e.topB, e.hB, B.x - d.x * e.iB, B.y - d.y * e.iB],
    ];
    for (const [end, N, base, top, h, px, py] of ends) {
      const m = makeMarker(markerMats.top);
      m.position.set(px, top + 1, py);
      m.userData.key = `t${w.id}${end}`;
      handleGroup.add(m);
      topHandles.push({ end, m, wid: w.id, px, py, top });
      if (isSel) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute([N.x, base, N.y, px, top, py], 3));
        handleGroup.add(new THREE.Line(lg, lineHandle));
        if (cfg.labels) addLabel(num(h), 'lbl hl', px, top, py, -16, true);
      }
    }
  }
}

const v3 = new THREE.Vector3();
function project(x, y, z) {
  v3.set(x, y, z).project(camera);
  if (v3.z > 1 || v3.z < -1) return null;
  return { x: (v3.x * 0.5 + 0.5) * host.clientWidth, y: (-v3.y * 0.5 + 0.5) * host.clientHeight };
}

/* apakah titik di dunia terlihat dari kamera (tidak terhalang dinding) */
const visRay = new THREE.Raycaster();
const visTarget = new THREE.Vector3();
const visDir = new THREE.Vector3();
function isVisible(x, y, z) {
  visTarget.set(x, y, z);
  visDir.copy(visTarget).sub(camera.position);
  const dist = visDir.length();
  if (dist < 1e-6) return true;
  visDir.divideScalar(dist);
  const margin = Math.max(2, dist * MARKER_K * 1.6);
  visRay.set(camera.position, visDir);
  visRay.near = 0;
  visRay.far = dist - margin;
  return visRay.intersectObjects(wallMeshes, false).length === 0;
}

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(renderFrame);
}

function place(el, p, dy = 0) {
  if (!p) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.style.transform = `translate(${p.x}px, ${p.y + dy}px) translate(-50%, -50%)`;
}

function renderFrame() {
  renderQueued = false;
  camera.updateMatrixWorld();
  for (const m of markers) {
    const big = armedKey === `n${m.userData.id}` ? 1.7 : 1;
    m.scale.setScalar(camera.position.distanceTo(m.position) * MARKER_K * big);
  }
  for (const h of topHandles) {
    const big = armedKey === h.m.userData.key ? 1.7 : 1;
    h.m.scale.setScalar(camera.position.distanceTo(h.m.position) * MARKER_K * big);
  }
  for (const c of markerGroup.children) if (c.userData.snap) c.scale.setScalar(camera.position.distanceTo(c.position) * MARKER_K * 1.5);
  renderer.render(scene, camera);
  for (const l of labelEls) {
    if (l.occl && !isVisible(l.x, l.y, l.z)) {
      l.el.style.display = 'none';
      continue;
    }
    place(l.el, project(l.x, l.y, l.z), l.dy);
  }
}
controls.addEventListener('change', requestRender);

function resize() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
new ResizeObserver(resize).observe(host);

function fitCamera(top) {
  let minx = 0;
  let maxx = 600;
  let miny = 0;
  let maxy = 600;
  if (state.nodes.length) {
    const xs = state.nodes.map((n) => n.x);
    const ys = state.nodes.map((n) => n.y);
    minx = Math.min(...xs);
    maxx = Math.max(...xs);
    miny = Math.min(...ys);
    maxy = Math.max(...ys);
  }
  const cx = (minx + maxx) / 2;
  const cz = (miny + maxy) / 2;
  const size = Math.max(maxx - minx, maxy - miny, 300);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const dist = (size * 0.62) / (Math.tan(half) * Math.min(1, camera.aspect || 1)) + 80;
  controls.target.set(cx, 0, cz);
  if (top) camera.position.set(cx, dist, cz + dist * 0.002);
  else camera.position.set(cx + dist * 0.22, dist * 0.8, cz + dist * 0.55);
  camera.lookAt(controls.target);
  controls.update();
  requestRender();
}

/* putar kamera mengelilingi sumbu tegak yang melalui (px, pz) */
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const orbitOff = new THREE.Vector3();
function orbitAround(phi, px, pz) {
  orbitOff.set(camera.position.x - px, 0, camera.position.z - pz).applyAxisAngle(Y_AXIS, phi);
  camera.position.x = px + orbitOff.x;
  camera.position.z = pz + orbitOff.z;
  orbitOff.set(controls.target.x - px, 0, controls.target.z - pz).applyAxisAngle(Y_AXIS, phi);
  controls.target.x = px + orbitOff.x;
  controls.target.z = pz + orbitOff.z;
  camera.lookAt(controls.target);
  controls.update();
  requestRender();
}

/* ---------- Titik di lantai dan magnet ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const gp = new THREE.Vector3();
const wallPlane = new THREE.Plane();
const tmpN = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpHit = new THREE.Vector3();

function setRay(cx, cy) {
  const r = host.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}

function groundPoint(cx, cy, atY = 0) {
  setRay(cx, cy);
  groundPlane.constant = -atY;
  if (!ray.ray.intersectPlane(groundPlane, gp)) return null;
  const dist = camera.position.distanceTo(gp);
  if (dist > 60000) return null;
  return { x: gp.x, y: gp.z, dist };
}

const cmPerPx = (dist) => (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (host.clientHeight || 1);

const ATTRACT_PX = 13; // jarak tarik magnet (piksel layar)
const RELEASE_K = 1.3; // lepas setelah menjauh 1,3 x jarak tarik (tahan ringan)
let stuck = null; // { node, x, y } titik yang sedang menempel

const gridPt = (p) => ({ x: Math.round(p.x / cfg.grid) * cfg.grid, y: Math.round(p.y / cfg.grid) * cfg.grid });

function nearestNode(p, excl, atY, tol) {
  let best = null;
  let bd = tol;
  for (const n of state.nodes) {
    if (excl.has(n.id) || Math.abs(elevOfNode(n.id) - atY) >= 1) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/* magnet: menempel ke titik lain (sudut ke sudut) dan ke tengah dinding; tahan ringan sebelum lepas */
function magnetSnap(p, excl, exclWalls, useWalls, atY) {
  if (!cfg.snap) {
    stuck = null;
    return gridPt(p);
  }
  const attract = ATTRACT_PX * cmPerPx(p.dist);
  if (stuck) {
    const n = nodeById(stuck.node);
    if (n && !excl.has(n.id) && Math.hypot(n.x - p.x, n.y - p.y) <= attract * RELEASE_K) return { x: n.x, y: n.y, node: n.id };
    stuck = null;
  }
  const n = nearestNode(p, excl, atY, attract);
  if (n) {
    stuck = { node: n.id };
    vib(12);
    return { x: n.x, y: n.y, node: n.id };
  }
  if (useWalls) {
    let best = null;
    let bd = attract;
    for (const w of state.walls) {
      if (exclWalls.has(w.id)) continue;
      const e = elev.get(w.id);
      if (!e || Math.abs(e.baseA - atY) >= 1 || Math.abs(e.baseB - atY) >= 1) continue;
      const A = nodeById(w.a);
      const B = nodeById(w.b);
      const pr = projectOnSegment(p, A, B);
      if (pr.d < bd && pr.t > 0 && pr.t < 1) {
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        let ds = Math.round((pr.t * len) / cfg.grid) * cfg.grid;
        if (ds <= 0 || ds >= len) ds = pr.t * len;
        bd = pr.d;
        best = { x: A.x + ((B.x - A.x) / len) * ds, y: A.y + ((B.y - A.y) / len) * ds, wall: w.id };
      }
    }
    if (best) return best;
  }
  return gridPt(p);
}

/* ---------- Memilih titik ---------- */
function pickIn(list, cx, cy, tol, getPos) {
  const r = host.getBoundingClientRect();
  let best = null;
  let bd = tol;
  for (const item of list) {
    const pos = getPos(item);
    const p = project(pos.x, pos.y, pos.z);
    if (!p) continue;
    const d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top));
    if (d < bd && isVisible(pos.x, pos.y, pos.z)) {
      bd = d;
      best = { item, d };
    }
  }
  return best;
}
const pickNode = (cx, cy) => {
  const r = pickIn(markers, cx, cy, 22, (m) => m.position);
  return r ? { id: r.item.userData.id, d: r.d } : null;
};
const pickTop = (cx, cy) => {
  const r = pickIn(topHandles, cx, cy, 24, (h) => h.m.position);
  return r ? { h: r.item, d: r.d } : null;
};

/* ---------- Tambah dinding ---------- */
let turn = 90; // belok dinding baru: 0 lurus, 90 kanan, -90 kiri
function syncTurnButtons() {
  $('t-0').classList.toggle('active', turn === 0);
  $('t-r').classList.toggle('active', turn === 90);
  $('t-l').classList.toggle('active', turn === -90);
}
function setTurn(v) {
  turn = v;
  syncTurnButtons();
}

function addWallNow() {
  const len = Math.max(10, cfg.newLen || 200);
  commit(() => {
    const w = selWall();
    let startId;
    let theta;
    let on = null;
    let t = cfg.defT;
    let h = cfg.defH;
    if (w) {
      const cntA = state.walls.filter((x) => x.a === w.a || x.b === w.a).length;
      const cntB = state.walls.filter((x) => x.a === w.b || x.b === w.b).length;
      const useB = cntB <= cntA;
      const N = nodeById(useB ? w.b : w.a);
      const O = nodeById(useB ? w.a : w.b);
      const q = Math.PI / 2;
      theta = Math.round(Math.atan2(N.y - O.y, N.x - O.x) / q) * q + (turn * Math.PI) / 180;
      startId = N.id;
      on = w.on;
      t = w.t;
      h = Math.max(w.hA, w.hB);
    } else {
      camera.updateMatrixWorld();
      const r = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const base = Math.round(Math.atan2(r.z, r.x) / (Math.PI / 2)) * (Math.PI / 2);
      theta = base;
      const g = gridPt({ x: controls.target.x - (Math.cos(theta) * len) / 2, y: controls.target.z - (Math.sin(theta) * len) / 2 });
      startId = addNode(g.x, g.y);
    }
    const S = nodeById(startId);
    const ex = round2(S.x + Math.cos(theta) * len);
    const ey = round2(S.y + Math.sin(theta) * len);
    const atY = elevOfNode(startId);
    let endId = null;
    for (const n of state.nodes) {
      if (n.id !== startId && Math.abs(elevOfNode(n.id) - atY) < 1 && Math.hypot(n.x - ex, n.y - ey) < 0.5) endId = n.id;
    }
    if (endId == null) endId = addNode(ex, ey);
    if (endId === startId || wallBetween(startId, endId)) return;
    const id = addWall(startId, endId, on);
    const nw = wallById(id);
    nw.t = t;
    nw.hA = h;
    nw.hB = h;
    sel = { type: 'wall', id };
  });
}

function cloneSelected() {
  const w = selWall();
  if (!w) return;
  commit(() => {
    const A = nodeById(w.a);
    const B = nodeById(w.b);
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-6) return;
    const gap = cfg.cloneGap || 100;
    const nx = (-(B.y - A.y) / L) * gap; // ke kanan arah gambar
    const ny = ((B.x - A.x) / L) * gap;
    const a2 = addNode(A.x + nx, A.y + ny);
    const b2 = addNode(B.x + nx, B.y + ny);
    const id = addWall(a2, b2, w.on);
    const nw = wallById(id);
    nw.t = w.t;
    nw.hA = w.hA;
    nw.hB = w.hB;
    nw.iA = w.iA || 0;
    nw.iB = w.iB || 0;
    sel = { type: 'wall', id };
  });
}

function stackOnSelected() {
  const w = selWall();
  if (!w) return;
  commit(() => {
    const A = nodeById(w.a);
    const B = nodeById(w.b);
    const a2 = addNode(A.x, A.y);
    const b2 = addNode(B.x, B.y);
    const id = addWall(a2, b2, w.id);
    wallById(id).t = w.t;
    sel = { type: 'wall', id };
  });
}

/* ---------- Gestur ---------- */
/* ---- sudut selalu 90 derajat: dinding tetangga ikut memanjang/memendek ---- */
function buildOrtho() {
  const orig = new Map(state.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const axis = new Map();
  const at = new Map();
  for (const w of state.walls) {
    const A = orig.get(w.a);
    const B = orig.get(w.b);
    if (!A || !B) continue;
    const sameX = Math.abs(A.x - B.x) < 0.01;
    const sameY = Math.abs(A.y - B.y) < 0.01;
    axis.set(w.id, sameX && !sameY ? 'v' : sameY && !sameX ? 'h' : null);
    for (const id of [w.a, w.b]) {
      if (!at.has(id)) at.set(id, []);
      at.get(id).push(w);
    }
  }
  const byKey = new Map();
  for (const [id, p] of orig) {
    const k = `${round2(p.x)}|${round2(p.y)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(id);
  }
  const coin = new Map();
  for (const list of byKey.values()) for (const id of list) coin.set(id, list);
  return { orig, axis, at, coin };
}

/* seeds: Map id -> {dx, dy}. Hasil: Map id -> {dx, dy} termasuk titik yang ikut bergeser */
function spread(ctx, seeds) {
  const out = new Map();
  const q = [];
  const give = (id, comp, v) => {
    let d = out.get(id);
    if (!d) {
      d = { dx: 0, dy: 0, hx: false, hy: false };
      out.set(id, d);
    }
    if (comp === 'x') {
      if (d.hx) return;
      d.hx = true;
      d.dx = v;
    } else {
      if (d.hy) return;
      d.hy = true;
      d.dy = v;
    }
    q.push([id, comp, v]);
    for (const o of ctx.coin.get(id) || []) if (o !== id) give(o, comp, v);
  };
  for (const [id, s0] of seeds) {
    if (Math.abs(s0.dx) > 1e-9) give(id, 'x', s0.dx);
    if (Math.abs(s0.dy) > 1e-9) give(id, 'y', s0.dy);
  }
  while (q.length) {
    const [id, comp, v] = q.shift();
    for (const w of ctx.at.get(id) || []) {
      const ax = ctx.axis.get(w.id);
      if ((comp === 'y' && ax === 'h') || (comp === 'x' && ax === 'v')) give(w.a === id ? w.b : w.a, comp, v);
    }
  }
  return out;
}

function applySpread(ctx, out) {
  for (const [id, o] of ctx.orig) {
    const n = nodeById(id);
    if (!n) continue;
    const d = out.get(id);
    n.x = round2(o.x + (d ? d.dx : 0));
    n.y = round2(o.y + (d ? d.dy : 0));
  }
}

function moveNodeOrtho(id, x, y) {
  const n = nodeById(id);
  if (!n) return;
  const ctx = buildOrtho();
  applySpread(ctx, spread(ctx, new Map([[id, { dx: x - n.x, dy: y - n.y }]])));
}

/* sumbu yang dikunci untuk titik yang hanya boleh bergeser searah dindingnya */
function lockAxisFor(ctx, ids) {
  const seen = new Set();
  let ax = null;
  for (const id of ids) {
    for (const w of ctx.at.get(id) || []) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      const a = ctx.axis.get(w.id);
      if (!a || (ax && ax !== a)) return null;
      ax = a;
    }
  }
  return ax; // 'h' = hanya geser kiri-kanan, 'v' = hanya geser atas-bawah
}

const HOLD_MS = 420; // tahan sebentar sebelum titik bisa diseret
const MOVE_CANCEL = 10; // geser lebih dari ini sebelum siap = putar kamera
const ptrs = new Set();
const ptrPos = new Map();
let tapRec = null;
let pending = null; // { kind, pointerId, x, y, timer, ... }
let drag = null;
let dragBefore = null;
let lastSnap = null;
let topStuck = false;
let wallStuck = null;
let twist = null; // { mode: 'wait'|'free'|'pivot', start: Map, last }
let rebuildQueued = false;

function syncControls() {
  controls.enabled = !drag && !(twist && twist.mode === 'pivot');
}

function scheduleRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    rebuildScene();
    updateInfo();
    updateCtx();
    requestRender();
  });
}

function cancelPending() {
  if (pending) {
    clearTimeout(pending.timer);
    pending = null;
  }
}

function groupOf(id) {
  const n0 = nodeById(id);
  const ids = new Set([id]);
  for (const n of state.nodes) if (Math.abs(n.x - n0.x) < 0.01 && Math.abs(n.y - n0.y) < 0.01) ids.add(n.id);
  return ids;
}
const origOf = (ids) => new Map([...ids].map((i) => [i, { x: nodeById(i).x, y: nodeById(i).y }]));
const wallsOf = (ids) => new Set(state.walls.filter((w) => ids.has(w.a) || ids.has(w.b)).map((w) => w.id));

function arm() {
  const pd = pending;
  pending = null;
  if (!pd || ptrs.size !== 1 || !ptrs.has(pd.pointerId)) return;
  const cur = ptrPos.get(pd.pointerId) || { x: pd.x, y: pd.y };
  let d = null;
  if (pd.kind === 'node') {
    const n = nodeById(pd.id);
    if (!n) return;
    const at = elevOfNode(n.id);
    const p = groundPoint(cur.x, cur.y, at);
    if (!p) return;
    const ids = groupOf(n.id);
    const ctx = buildOrtho();
    d = { type: 'node', id: n.id, at, off: { x: n.x - p.x, y: n.y - p.y }, ids, orig: origOf(ids), excl: ids, exclW: wallsOf(new Set([n.id])), ctx, lock: lockAxisFor(ctx, ids) };
    sel = { type: 'node', id: n.id };
    armedKey = `n${n.id}`;
  } else if (pd.kind === 'top') {
    const w = wallById(pd.wid);
    if (!w) return;
    d = {
      type: 'top',
      wid: w.id,
      end: pd.end,
      y0: cur.y,
      h0: pd.end === 'a' ? w.hA : w.hB,
      dist: camera.position.distanceTo(pd.pos),
    };
    sel = { type: 'wall', id: w.id };
    armedKey = `t${w.id}${pd.end}`;
  } else {
    const w = wallById(pd.wid);
    if (!w) return;
    const at = elevOfNode(w.a);
    const p = groundPoint(cur.x, cur.y, pd.hitY);
    if (!p) return;
    const ids = new Set([...groupOf(w.a), ...groupOf(w.b)]);
    const ctx = buildOrtho();
    const others = new Set();
    for (const id of ids) for (const x of ctx.at.get(id) || []) if (x.id !== w.id) others.add(x.id);
    d = { type: 'wall', wid: w.id, at, hitY: pd.hitY, p0: { x: p.x, y: p.y }, ids, orig: origOf(ids), a: w.a, b: w.b, ctx, lock: others.size ? ctx.axis.get(w.id) : null };
    armedKey = null;
  }
  drag = d;
  dragBefore = JSON.stringify(state);
  stuck = null;
  topStuck = false;
  wallStuck = null;
  lastSnap = null;
  syncControls();
  if (tapRec) tapRec.ok = false;
  try {
    renderer.domElement.setPointerCapture(pd.pointerId);
  } catch {
    /* tidak apa-apa */
  }
  vib(25);
  refresh();
}

host.addEventListener(
  'pointerdown',
  (e) => {
    ptrs.add(e.pointerId);
    ptrPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      tapRec = { x: e.clientX, y: e.clientY, t: performance.now(), ok: true };
      cancelPending();
      if (!locked) {
        camera.updateMatrixWorld();
        const th = pickTop(e.clientX, e.clientY);
        const nd = pickNode(e.clientX, e.clientY);
        const base = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        if (th && (!nd || th.d <= nd.d)) {
          pending = { ...base, kind: 'top', wid: th.h.wid, end: th.h.end, pos: th.h.m.position.clone() };
        } else if (nd) {
          pending = { ...base, kind: 'node', id: nd.id };
        } else if (sel && sel.type === 'wall') {
          setRay(e.clientX, e.clientY);
          const hit = ray.intersectObjects(wallMeshes, false)[0];
          if (hit && hit.object.userData.id === sel.id) pending = { ...base, kind: 'wall', wid: sel.id, hitY: hit.point.y };
        }
        if (pending) pending.timer = setTimeout(arm, HOLD_MS);
      }
    } else {
      cancelPending();
      if (tapRec) tapRec.ok = false;
      if (ptrs.size === 2 && !drag) {
        const [a, b] = [...ptrPos.values()];
        twist = { mode: 'wait', start: new Map(ptrPos), last: Math.atan2(b.y - a.y, b.x - a.x) };
      }
    }
  },
  true
);

function dragTop(e) {
  const w = wallById(drag.wid);
  const g = w ? geo.get(w.id) : null;
  const el = w ? elev.get(w.id) : null;
  const A = w ? nodeById(w.a) : null;
  if (!w || !g || !el || !A) return;
  const L = g.length;
  const d = g.dir;
  const step = Math.max(cfg.grid, 1);
  const tol = 12 * cmPerPx(drag.dist);
  const isA = drag.end === 'a';
  const baseAt = (s) => (L > 0 ? el.baseA + ((el.baseB - el.baseA) * s) / L : el.baseA);

  // geser pada bidang tegak dinding: dapat posisi sepanjang dinding dan tinggi sekaligus
  let s = isA ? el.iA : L - el.iB;
  let y = isA ? el.topA : el.topB;
  let inPlane = false;
  setRay(e.clientX, e.clientY);
  tmpN.set(-d.y, 0, d.x);
  if (Math.abs(ray.ray.direction.dot(tmpN)) > 0.2) {
    wallPlane.setFromNormalAndCoplanarPoint(tmpN, tmpP.set(A.x, 0, A.y));
    if (ray.ray.intersectPlane(wallPlane, tmpHit)) {
      s = (tmpHit.x - A.x) * d.x + (tmpHit.z - A.y) * d.y;
      y = tmpHit.y;
      inPlane = true;
    }
  }
  if (!inPlane) y = baseAt(s) + drag.h0 + (drag.y0 - e.clientY) * cmPerPx(drag.dist);

  // titik atas lain: menempel (tahan ringan) agar bisa bertemu di satu puncak
  const sO = isA ? L - el.iB : el.iA;
  const yO = isA ? el.topB : el.topA;
  const lim = topStuck ? tol * RELEASE_K : tol;
  let snapped = false;
  if (cfg.snap && Math.abs(s - sO) < lim) {
    if (!topStuck) vib(12);
    topStuck = true;
    s = sO;
    snapped = true;
    if (Math.abs(y - yO) < tol) y = yO;
  } else {
    topStuck = false;
  }
  if (!snapped) s = Math.round(s / step) * step;
  let h = y - baseAt(s);
  if (!(snapped && Math.abs(y - yO) < 1e-6)) h = Math.round(h / step) * step;
  h = clamp(h, 0, 3000);

  if (isA) {
    w.iA = round2(clamp(s, 0, L - el.iB));
    w.hA = round2(h);
  } else {
    w.iB = round2(clamp(L - s, 0, L - el.iA));
    w.hB = round2(h);
  }
  scheduleRebuild();
}

function dragNode(e) {
  const n = nodeById(drag.id);
  if (!n) return;
  const p = groundPoint(e.clientX, e.clientY, drag.at);
  if (!p) return;
  const o = drag.orig.get(drag.id);
  const raw = { x: p.x + drag.off.x, y: p.y + drag.off.y, dist: p.dist };
  if (drag.lock === 'h') raw.y = o.y;
  else if (drag.lock === 'v') raw.x = o.x;
  const s = magnetSnap(raw, drag.excl, drag.exclW, true, drag.at);
  if (drag.lock === 'h') s.y = o.y;
  else if (drag.lock === 'v') s.x = o.x;
  lastSnap = s;
  snapMark = s.node != null || s.wall != null ? { x: s.x, y: s.y, h: drag.at } : null;
  applySpread(drag.ctx, spread(drag.ctx, new Map([[drag.id, { dx: s.x - o.x, dy: s.y - o.y }]])));
  scheduleRebuild();
}

function dragWall(e) {
  const p = groundPoint(e.clientX, e.clientY, drag.hitY);
  if (!p) return;
  // dinding yang tersambung hanya bergeser tegak lurus dindingnya (tetangga ikut memanjang)
  const dxr = drag.lock === 'h' ? 0 : p.x - drag.p0.x;
  const dyr = drag.lock === 'v' ? 0 : p.y - drag.p0.y;
  const A0 = drag.orig.get(drag.a);
  const B0 = drag.orig.get(drag.b);
  let dx;
  let dy;
  let mark = null;
  if (cfg.snap) {
    const attract = ATTRACT_PX * cmPerPx(p.dist);
    const cands = [
      { id: drag.a, o: A0 },
      { id: drag.b, o: B0 },
    ];
    let choice = null;
    if (wallStuck) {
      const c = cands.find((q) => q.id === wallStuck.which);
      const T = nodeById(wallStuck.node);
      if (c && T && Math.hypot(T.x - (c.o.x + dxr), T.y - (c.o.y + dyr)) <= attract * RELEASE_K) choice = { c, T };
      else wallStuck = null;
    }
    if (!choice) {
      let bd = attract;
      for (const c of cands) {
        const raw = { x: c.o.x + dxr, y: c.o.y + dyr };
        const T = nearestNode(raw, drag.ids, drag.at, bd);
        if (T) {
          bd = Math.hypot(T.x - raw.x, T.y - raw.y);
          choice = { c, T };
        }
      }
      if (choice) {
        wallStuck = { which: choice.c.id, node: choice.T.id };
        vib(12);
      }
    }
    if (choice) {
      dx = choice.T.x - choice.c.o.x;
      dy = choice.T.y - choice.c.o.y;
      mark = { x: choice.T.x, y: choice.T.y, h: drag.at };
    }
  }
  if (dx === undefined) {
    const g = gridPt({ x: A0.x + dxr, y: A0.y + dyr });
    dx = g.x - A0.x;
    dy = g.y - A0.y;
  }
  if (drag.lock === 'h') dx = 0;
  if (drag.lock === 'v') dy = 0;
  snapMark = mark;
  applySpread(
    drag.ctx,
    spread(
      drag.ctx,
      new Map([
        [drag.a, { dx, dy }],
        [drag.b, { dx, dy }],
      ])
    )
  );
  scheduleRebuild();
}

const wrapPi = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

function handleTwist() {
  if (drag || !twist || ptrPos.size !== 2) return;
  const ids = [...ptrPos.keys()];
  const a = ptrPos.get(ids[0]);
  const b = ptrPos.get(ids[1]);
  const sa = twist.start.get(ids[0]);
  const sb = twist.start.get(ids[1]);
  if (!sa || !sb) return;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  let pivot = null;
  if (twist.mode === 'wait') {
    const ma = Math.hypot(a.x - sa.x, a.y - sa.y);
    const mb = Math.hypot(b.x - sb.x, b.y - sb.y);
    if (Math.max(ma, mb) < 10) return;
    const aStill = ma < 6 && mb >= 10;
    const bStill = mb < 6 && ma >= 10;
    twist.mode = 'free';
    if (aStill || bStill) {
      const still = aStill ? a : b;
      const sStill = aStill ? sa : sb;
      const mv = aStill ? b : a;
      const smv = aStill ? sb : sa;
      const rx = smv.x - sStill.x;
      const ry = smv.y - sStill.y;
      const rl = Math.hypot(rx, ry) || 1;
      const mx = mv.x - smv.x;
      const my = mv.y - smv.y;
      const radial = Math.abs((mx * rx + my * ry) / rl);
      const tang = Math.abs((mx * ry - my * rx) / rl);
      if (tang > radial) {
        twist.mode = 'pivot';
        twist.still = aStill ? ids[0] : ids[1];
        syncControls();
      }
    }
  }
  if (twist.mode === 'pivot') {
    const st = ptrPos.get(twist.still);
    const gpt = st ? groundPoint(st.x, st.y, 0) : null;
    pivot = gpt ? { x: gpt.x, z: gpt.y } : { x: controls.target.x, z: controls.target.z };
    twist.pivot = twist.pivot || pivot; // poros tetap di titik saat dikunci
    pivot = twist.pivot;
  } else {
    pivot = { x: controls.target.x, z: controls.target.z };
  }
  const dt = wrapPi(ang - twist.last);
  if (Math.abs(dt) > 0.002) {
    orbitAround(dt, pivot.x, pivot.z);
    twist.last = ang;
  }
}

host.addEventListener('pointermove', (e) => {
  if (ptrPos.has(e.pointerId)) ptrPos.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pending && pending.pointerId === e.pointerId && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > MOVE_CANCEL) cancelPending();

  if (drag) {
    if (drag.type === 'top') dragTop(e);
    else if (drag.type === 'node') dragNode(e);
    else dragWall(e);
    return;
  }
  handleTwist();
  if (tapRec && ptrs.size === 1 && Math.hypot(e.clientX - tapRec.x, e.clientY - tapRec.y) > 8) tapRec.ok = false;
});

function tryMerge(id, skip) {
  const n = nodeById(id);
  if (!n) return;
  const at = elevOfNode(id);
  for (const o of state.nodes) {
    if (o.id === id || skip.has(o.id)) continue;
    if (Math.abs(o.x - n.x) < 0.5 && Math.abs(o.y - n.y) < 0.5 && Math.abs(elevOfNode(o.id) - at) < 1) {
      mergeInto(id, o.id);
      return;
    }
  }
}

function onUp(e) {
  ptrs.delete(e.pointerId);
  ptrPos.delete(e.pointerId);
  cancelPending();
  if (ptrs.size < 2 && twist) {
    twist = null;
    syncControls();
  }
  if (drag) {
    const d = drag;
    drag = null;
    armedKey = null;
    snapMark = null;
    stuck = null;
    if (d.type === 'node') {
      if (cfg.snap && lastSnap && lastSnap.wall != null && wallById(lastSnap.wall)) {
        const nid = splitWall(lastSnap.wall, lastSnap.x, lastSnap.y);
        mergeInto(d.id, nid);
      } else {
        tryMerge(d.id, d.ids);
      }
    } else if (d.type === 'wall') {
      tryMerge(d.a, d.ids);
      tryMerge(d.b, d.ids);
    }
    cleanOrphans();
    if (JSON.stringify(state) !== dragBefore) pushHist(dragBefore);
    syncControls();
    refresh();
    if (ptrs.size === 0) tapRec = null;
    return;
  }
  if (e.type === 'pointerup' && tapRec && tapRec.ok && ptrs.size === 0 && performance.now() - tapRec.t < 700) {
    handleTap(e.clientX, e.clientY);
  }
  if (ptrs.size === 0) tapRec = null;
}
host.addEventListener('pointerup', onUp);
host.addEventListener('pointercancel', onUp);

function handleTap(cx, cy) {
  camera.updateMatrixWorld();
  const th = pickTop(cx, cy);
  const nd = pickNode(cx, cy);
  if (th && (!nd || th.d <= nd.d)) {
    sel = { type: 'wall', id: th.h.wid };
  } else if (nd) {
    sel = { type: 'node', id: nd.id };
  } else {
    setRay(cx, cy);
    const hits = ray.intersectObjects(wallMeshes, false);
    sel = hits.length ? { type: 'wall', id: hits[0].object.userData.id } : null;
  }
  refresh();
}

/* ---------- Panel ---------- */
function setVal(id, v) {
  const el = $(id);
  if (document.activeElement !== el) el.value = v;
}

function updateInfo() {
  const n = state.walls.length;
  let total = 0;
  for (const g of geo.values()) total += g.length;
  $('info').textContent = n ? `${n} dinding · ${num(total)} cm` : 'Belum ada dinding';
}

function updateCtx() {
  const w = selWall();
  const n = selNode();
  $('ctx-wall').hidden = !w;
  $('ctx-node').hidden = !n;
  $('ctx-add').hidden = !!n;
  $('b-undo').disabled = hist.length === 0;
  $('b-redo').disabled = redoStack.length === 0;
  $('b-lock').classList.toggle('lockon', locked);
  $('b-lock').textContent = locked ? 'Titik terkunci' : 'Kunci titik';
  if (w) {
    const g = geo.get(w.id);
    const e = elev.get(w.id);
    setVal('w-len', g ? round2(g.length) : '');
    setVal('w-thick', w.t);
    setVal('w-h', w.hA === w.hB ? w.hA : '');
    $('w-h').placeholder = w.hA === w.hB ? '' : 'beda';
    setVal('w-hA', w.hA);
    setVal('w-hB', w.hB);
    setVal('w-iA', e ? round2(e.iA) : 0);
    setVal('w-iB', e ? round2(e.iB) : 0);
    $('w-inner').textContent = e && w.on != null ? `Berdiri di atas dinding lain (dasar ${num(e.baseA)} / ${num(e.baseB)} cm)` : '';
    $('w-unstack').hidden = w.on == null;
  }
  if (n) {
    setVal('n-x', n.x);
    setVal('n-y', n.y);
  }
}

function refresh() {
  if (sel && ((sel.type === 'wall' && !wallById(sel.id)) || (sel.type === 'node' && !nodeById(sel.id)))) sel = null;
  rebuildScene();
  updateInfo();
  updateCtx();
  save();
  requestRender();
}

/* ---------- Tombol dan isian ---------- */
$('b-wall').addEventListener('click', addWallNow);
$('b-lock').addEventListener('click', () => {
  locked = !locked;
  cancelPending();
  updateCtx();
});
$('t-0').addEventListener('click', () => setTurn(0));
$('t-r').addEventListener('click', () => setTurn(90));
$('t-l').addEventListener('click', () => setTurn(-90));
$('b-top').addEventListener('click', () => fitCamera(true));
$('b-fit').addEventListener('click', () => fitCamera(false));
$('b-undo').addEventListener('click', undo);
$('b-redo').addEventListener('click', redo);
$('toast-undo').addEventListener('click', () => {
  $('toast').hidden = true;
  undo();
});

function showHelp() {
  $('help').hidden = false;
}
function hideHelp() {
  $('help').hidden = true;
  try {
    localStorage.setItem(HELP_KEY, '1');
  } catch {
    /* tidak apa-apa */
  }
}
$('b-help').addEventListener('click', showHelp);
$('help-ok').addEventListener('click', hideHelp);

function onChange(id, fn) {
  $(id).addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    e.target.blur();
    if (!Number.isFinite(v)) {
      refresh();
      return;
    }
    fn(v);
  });
}

onChange('w-len', (v) => {
  const w = selWall();
  if (!w || v < 1) return refresh();
  commit(() => {
    const A = nodeById(w.a);
    const B = nodeById(w.b);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return;
    moveNodeOrtho(B.id, round2(A.x + (dx / l) * v), round2(A.y + (dy / l) * v));
  });
});
onChange('w-thick', (v) => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    w.t = clamp(v, 2, 100);
  });
});
onChange('w-h', (v) => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    w.hA = clamp(v, 0, 3000);
    w.hB = w.hA;
  });
});
onChange('w-hA', (v) => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    w.hA = clamp(v, 0, 3000);
  });
});
onChange('w-hB', (v) => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    w.hB = clamp(v, 0, 3000);
  });
});
onChange('w-iA', (v) => {
  const w = selWall();
  const g = w ? geo.get(w.id) : null;
  if (!g) return refresh();
  commit(() => {
    w.iA = round2(clamp(v, 0, g.length));
    w.iB = round2(Math.min(w.iB || 0, g.length - w.iA));
  });
});
onChange('w-iB', (v) => {
  const w = selWall();
  const g = w ? geo.get(w.id) : null;
  if (!g) return refresh();
  commit(() => {
    w.iB = round2(clamp(v, 0, g.length));
    w.iA = round2(Math.min(w.iA || 0, g.length - w.iB));
  });
});
$('w-tri').addEventListener('click', () => {
  const w = selWall();
  const g = w ? geo.get(w.id) : null;
  if (!g) return;
  commit(() => {
    const hm = Math.max(w.hA, w.hB);
    w.iA = round2(g.length / 2);
    w.iB = round2(g.length - w.iA);
    w.hA = hm;
    w.hB = hm;
  });
});
$('w-rect').addEventListener('click', () => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    const hm = Math.max(w.hA, w.hB);
    w.iA = 0;
    w.iB = 0;
    w.hA = hm;
    w.hB = hm;
  });
});
$('w-stack').addEventListener('click', stackOnSelected);
$('w-clone').addEventListener('click', cloneSelected);
$('w-unstack').addEventListener('click', () => {
  const w = selWall();
  if (w) commit(() => (w.on = null));
});
$('w-del').addEventListener('click', () => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    for (const x of state.walls) if (x.on === w.id) x.on = null;
    state.walls = state.walls.filter((x) => x.id !== w.id);
    sel = null;
  });
  toast('Dinding dihapus', true);
});
onChange('n-x', (v) => {
  const n = selNode();
  if (n) commit(() => moveNodeOrtho(n.id, round2(v), n.y));
});
onChange('n-y', (v) => {
  const n = selNode();
  if (n) commit(() => moveNodeOrtho(n.id, n.x, round2(v)));
});
$('n-del').addEventListener('click', () => {
  const n = selNode();
  if (!n) return;
  commit(() => {
    const gone = new Set(state.walls.filter((x) => x.a === n.id || x.b === n.id).map((x) => x.id));
    for (const x of state.walls) if (gone.has(x.on)) x.on = null;
    state.walls = state.walls.filter((x) => !gone.has(x.id));
    state.nodes = state.nodes.filter((x) => x.id !== n.id);
    sel = null;
  });
  toast('Titik dan dindingnya dihapus', true);
});

onChange('s-len', (v) => {
  cfg.newLen = clamp(v, 10, 5000);
  $('s-len').value = cfg.newLen;
  save();
});
onChange('s-gap', (v) => {
  cfg.cloneGap = clamp(v, 1, 5000);
  $('s-gap').value = cfg.cloneGap;
  save();
});
onChange('s-thick', (v) => {
  cfg.defT = clamp(v, 2, 100);
  $('s-thick').value = cfg.defT;
  save();
});
onChange('s-height', (v) => {
  cfg.defH = clamp(v, 10, 3000);
  $('s-height').value = cfg.defH;
  save();
});
$('s-grid').addEventListener('change', (e) => {
  cfg.grid = parseFloat(e.target.value) || 5;
  save();
});
$('s-labels').addEventListener('change', (e) => {
  cfg.labels = e.target.checked;
  refresh();
});
$('s-snap').addEventListener('change', (e) => {
  cfg.snap = e.target.checked;
  save();
});
$('s-apply').addEventListener('click', () => {
  commit(() => {
    for (const w of state.walls) {
      w.t = cfg.defT;
      w.hA = cfg.defH;
      w.hB = cfg.defH;
      w.iA = 0;
      w.iB = 0;
    }
  });
});

/* cadangan ke file */
$('s-backup').addEventListener('click', async () => {
  const data = JSON.stringify({ ...state, cfg }, null, 1);
  const name = 'rencana-bangunan-3d.json';
  try {
    const f = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: name });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Cadangan disimpan');
  } catch {
    toast('Cadangan gagal disimpan di perangkat ini');
  }
});
$('s-restore').addEventListener('click', () => $('s-file').click());
$('s-file').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const r = parseData(JSON.parse(await f.text()));
    if (!r) throw new Error('format');
    commit(() => {
      state = r.st;
      cfg = r.cfg;
      sel = null;
    });
    applyCfgToInputs();
    fitCamera(false);
    toast('Cadangan dibuka', true);
  } catch {
    toast('File cadangan tidak dikenali');
  }
});
$('s-sample').addEventListener('click', () => {
  commit(() => {
    const ids = [addNode(0, 0), addNode(400, 0), addNode(400, 300), addNode(0, 300)];
    state.nodes = state.nodes.filter((n) => ids.includes(n.id));
    state.walls = [];
    for (let i = 0; i < 4; i++) {
      const id = addWall(ids[i], ids[(i + 1) % 4]);
      const w = wallById(id);
      w.t = 15;
      w.hA = 250;
      w.hB = 250;
    }
    sel = null;
  });
  fitCamera(false);
  toast('Contoh dimuat', true);
});
$('s-clear').addEventListener('click', () => {
  if (!state.walls.length) return;
  commit(() => {
    state.walls = [];
    state.nodes = [];
    sel = null;
  });
  toast('Semua dinding dihapus', true);
});

function applyCfgToInputs() {
  $('s-len').value = cfg.newLen;
  $('s-gap').value = cfg.cloneGap;
  $('s-thick').value = cfg.defT;
  $('s-height').value = cfg.defH;
  $('s-grid').value = String(cfg.grid);
  $('s-labels').checked = cfg.labels;
  $('s-snap').checked = cfg.snap;
}

/* ---------- Mulai ---------- */
loadData();
syncTurnButtons();
applyCfgToInputs();
resize();
fitCamera(false);
refresh();
try {
  if (!localStorage.getItem(HELP_KEY)) showHelp();
} catch {
  showHelp();
}
