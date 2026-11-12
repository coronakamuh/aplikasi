import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeWalls, prismData, wallElevations, wallProfileHeight, projectOnSegment, round2 } from './geometry.js';
import './style.css';

const KEY = 'rencana-bangunan-3d:v2';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => round2(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const deg = (r) => (((r * 180) / Math.PI) % 360 + 360) % 360;

/* ---------- Data (satuan cm) ---------- */
const defaultCfg = () => ({ defT: 15, defH: 300, grid: 5, labels: true, snap: true });
let state = { nodes: [], walls: [], next: 1 };
let cfg = defaultCfg();
const hist = [];
const redoStack = [];

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.walls)) return;
    const nodes = d.nodes.filter((n) => Number.isFinite(n.id) && Number.isFinite(n.x) && Number.isFinite(n.y));
    const ids = new Set(nodes.map((n) => n.id));
    const walls = d.walls
      .filter((w) => ids.has(w.a) && ids.has(w.b) && w.a !== w.b && Number.isFinite(w.id) && Number.isFinite(w.t))
      .map((w) => {
        const h = Number.isFinite(w.h) ? w.h : 300;
        const { h: _old, ...rest } = w;
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
    state = { nodes, walls, next: Math.max(Number.isFinite(d.next) ? d.next : 1, maxId + 1) };
    cfg = Object.assign(defaultCfg(), d.cfg || {});
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
  const w = { id: state.next++, a, b, t: cfg.defT, hA: cfg.defH, hB: cfg.defH, iA: 0, iB: 0, on, flip: false };
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
function cleanOrphans() {
  const used = new Set();
  for (const w of state.walls) {
    used.add(w.a);
    used.add(w.b);
  }
  state.nodes = state.nodes.filter((n) => used.has(n.id) || n.id === start);
}

/* ---------- Status antarmuka ---------- */
let mode = 'draw'; // 'draw' | 'select'
let level = 'floor'; // 'floor' | 'top' (menggambar di lantai atau di atas dinding)
let start = null; // id titik awal saat menggambar
let lastDir = null; // arah (radian) dinding terakhir pada rantai
let drawY = 0; // ketinggian bidang gambar rantai saat ini
let drawOn = null; // dinding tempat rantai saat ini berdiri
let sel = null; // { type: 'wall' | 'node', id }
let geo = new Map();
let elev = new Map();
let nodeElev = new Map();
let prev = null; // { mid:{x,y,z}, text }

const selWall = () => (sel && sel.type === 'wall' ? wallById(sel.id) : null);
const selNode = () => (sel && sel.type === 'node' ? nodeById(sel.id) : null);
const elevOfNode = (id) => (nodeElev.has(id) ? nodeElev.get(id) : id === start ? drawY : 0);

function resetChain() {
  start = null;
  lastDir = null;
  drawY = 0;
  drawOn = null;
}

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
  resetChain();
  sel = null;
  refresh();
}

function redo() {
  const n = redoStack.pop();
  if (!n) return;
  hist.push(JSON.stringify(state));
  state = JSON.parse(n);
  resetChain();
  sel = null;
  refresh();
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
const lineHandle = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false });

const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
const markerMats = {
  normal: new THREE.MeshBasicMaterial({ color: 0x1f5fbf, depthTest: false }),
  start: new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false }),
  sel: new THREE.MeshBasicMaterial({ color: 0xd62d20, depthTest: false }),
  top: new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false }),
  inner: new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
};
const MARKER_K = 0.011; // ukuran titik relatif jarak kamera (kecil, bergaris)

function makeMarker(outerMat) {
  const g = new THREE.Group();
  const o = new THREE.Mesh(sphereGeo, outerMat);
  o.renderOrder = 999;
  const i = new THREE.Mesh(sphereGeo, markerMats.inner);
  i.scale.setScalar(0.6);
  i.renderOrder = 1000;
  g.add(o, i);
  return g;
}

const wallGroup = new THREE.Group();
const markerGroup = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(wallGroup, markerGroup, handleGroup);
const wallMeshes = [];
const markers = [];
const topHandles = []; // { end, m, wid, px, py, top }

const previewGeo = new THREE.BufferGeometry();
previewGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const previewLine = new THREE.Line(previewGeo, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
previewLine.renderOrder = 998;
previewLine.visible = false;
previewLine.frustumCulled = false;
scene.add(previewLine);

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

  markerGroup.clear();
  markers.length = 0;
  for (const n of state.nodes) {
    const isSel = sel && sel.type === 'node' && sel.id === n.id;
    const m = makeMarker(isSel ? markerMats.sel : n.id === start ? markerMats.start : markerMats.normal);
    m.position.set(n.x, elevOfNode(n.id) + 1.5, n.y);
    m.userData.id = n.id;
    markerGroup.add(m);
    markers.push(m);
  }

  for (const c of handleGroup.children) if (c.isLine) c.geometry.dispose();
  handleGroup.clear();
  topHandles.length = 0;

  labelsEl.innerHTML = '';
  labelEls.length = 0;
  const addLabel = (text, cls, x, y, z, dy = 0) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    labelsEl.appendChild(el);
    labelEls.push({ el, x, y, z, dy });
  };

  if (cfg.labels) {
    for (const w of state.walls) {
      const g = geo.get(w.id);
      const e = elev.get(w.id);
      if (!g || !e) continue;
      const isSel = sel && sel.type === 'wall' && sel.id === w.id;
      addLabel(num(g.length), 'lbl' + (isSel ? ' sel' : ''), g.mid.x, (e.topA + e.topB) / 2 + 6, g.mid.y);
    }
  }

  const showHandles = mode === 'select' || (mode === 'draw' && level === 'top');
  if (showHandles) {
    for (const w of state.walls) {
      const g = geo.get(w.id);
      const e = elev.get(w.id);
      const A = nodeById(w.a);
      const B = nodeById(w.b);
      if (!g || !e || !A || !B) continue;
      const d = g.dir;
      const isSel = sel && sel.type === 'wall' && sel.id === w.id;
      const ends = [
        ['a', A, e.baseA, e.topA, e.hA, A.x + d.x * e.iA, A.y + d.y * e.iA],
        ['b', B, e.baseB, e.topB, e.hB, B.x - d.x * e.iB, B.y - d.y * e.iB],
      ];
      for (const [end, N, base, top, h, px, py] of ends) {
        const m = makeMarker(markerMats.top);
        m.position.set(px, top, py);
        handleGroup.add(m);
        topHandles.push({ end, m, wid: w.id, px, py, top });
        if (isSel) {
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.Float32BufferAttribute([N.x, base, N.y, px, top, py], 3));
          handleGroup.add(new THREE.Line(lg, lineHandle));
        }
        addLabel(num(mode === 'draw' ? top : h), 'lbl hl', px, top, py, -16);
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
  for (const m of markers) m.scale.setScalar(camera.position.distanceTo(m.position) * MARKER_K);
  for (const h of topHandles) h.m.scale.setScalar(camera.position.distanceTo(h.m.position) * MARKER_K);
  renderer.render(scene, camera);
  for (const l of labelEls) place(l.el, project(l.x, l.y, l.z), l.dy);
  const pl = $('prevlbl');
  if (prev) {
    pl.hidden = false;
    pl.textContent = prev.text;
    place(pl, project(prev.mid.x, prev.mid.y, prev.mid.z));
  } else {
    pl.hidden = true;
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

/* putar kamera mengelilingi bangunan (sumbu tegak) */
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const orbitOff = new THREE.Vector3();
function orbitAzimuth(phi) {
  orbitOff.copy(camera.position).sub(controls.target).applyAxisAngle(Y_AXIS, phi);
  camera.position.copy(controls.target).add(orbitOff);
  camera.lookAt(controls.target);
  controls.update();
  requestRender();
}

/* ---------- Titik di lantai, tempel ke grid / titik / dinding ---------- */
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

const SNAP_PX = 9; // jarak tempel ke titik/dinding lain (piksel layar)

function snapPoint(p, exclude = null, useWalls = true, atY = 0) {
  const g = cfg.grid;
  if (cfg.snap) {
    const tol = SNAP_PX * cmPerPx(p.dist);
    let best = null;
    let bd = tol;
    for (const n of state.nodes) {
      if (n.id === exclude || Math.abs(elevOfNode(n.id) - atY) >= 1) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) {
        bd = d;
        best = { x: n.x, y: n.y, node: n.id };
      }
    }
    if (best) return best;

    if (useWalls) {
      bd = tol;
      for (const w of state.walls) {
        const e = elev.get(w.id);
        if (!e || Math.abs(e.baseA - atY) >= 1 || Math.abs(e.baseB - atY) >= 1) continue;
        const A = nodeById(w.a);
        const B = nodeById(w.b);
        const pr = projectOnSegment(p, A, B);
        if (pr.d < bd && pr.t > 0 && pr.t < 1) {
          const len = Math.hypot(B.x - A.x, B.y - A.y);
          let ds = Math.round((pr.t * len) / g) * g;
          if (ds <= 0 || ds >= len) ds = pr.t * len;
          bd = pr.d;
          best = { x: A.x + ((B.x - A.x) / len) * ds, y: A.y + ((B.y - A.y) / len) * ds, wall: w.id };
        }
      }
      if (best) return best;
    }
  }
  return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
}

function resolveNode(s) {
  if (s.node != null) return s.node;
  if (s.wall != null) return splitWall(s.wall, s.x, s.y);
  return addNode(s.x, s.y);
}

function pickNode(cx, cy) {
  const r = host.getBoundingClientRect();
  let best = null;
  let bd = 22;
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const p = project(m.position.x, m.position.y, m.position.z);
    if (!p) continue;
    const d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top));
    if (d < bd) {
      bd = d;
      best = { id: m.userData.id, d };
    }
  }
  return best;
}

function pickTop(cx, cy) {
  const r = host.getBoundingClientRect();
  let best = null;
  let bd = 26;
  for (const h of topHandles) {
    const p = project(h.m.position.x, h.m.position.y, h.m.position.z);
    if (!p) continue;
    const d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top));
    if (d < bd) {
      bd = d;
      best = { h, d };
    }
  }
  return best;
}

/* ---------- Menggambar ---------- */
function drawTap(cx, cy) {
  if (level === 'top' && start == null) {
    startOnTop(cx, cy);
    return;
  }
  const atY = start != null ? drawY : 0;
  const p = groundPoint(cx, cy, atY);
  if (!p) return;
  const s = snapPoint(p, null, true, atY);
  hidePreview();
  commit(() => {
    const id = resolveNode(s);
    if (start == null) {
      start = id;
      lastDir = null;
    } else if (id !== start) {
      if (!wallBetween(start, id)) addWall(start, id, drawOn);
      const a = nodeById(start);
      const b = nodeById(id);
      lastDir = Math.atan2(b.y - a.y, b.x - a.x);
      start = id;
    }
  });
}

/* mulai menggambar dari puncak dinding (titik oranye atau permukaan atas) */
function startOnTop(cx, cy) {
  let wid = null;
  let x;
  let y;
  let h;
  const th = pickTop(cx, cy);
  if (th) {
    wid = th.h.wid;
    x = th.h.px;
    y = th.h.py;
    h = th.h.top;
  } else {
    setRay(cx, cy);
    const hit = ray.intersectObjects(wallMeshes, false).find((r) => r.face && Math.abs(r.face.normal.y) > 0.5);
    if (!hit) return;
    const g = cfg.grid;
    wid = hit.object.userData.id;
    x = Math.round(hit.point.x / g) * g;
    y = Math.round(hit.point.z / g) * g;
    h = hit.point.y;
  }
  const tol = SNAP_PX * cmPerPx(camera.position.distanceTo(tmpP.set(x, h, y)));
  hidePreview();
  commit(() => {
    drawOn = wid;
    drawY = h;
    lastDir = null;
    let id = null;
    for (const n of state.nodes) {
      if (Math.abs(elevOfNode(n.id) - h) < 1 && Math.hypot(n.x - x, n.y - y) < tol) id = n.id;
    }
    start = id != null ? id : addNode(x, y);
  });
}

function addTyped() {
  if (start == null) return;
  const len = parseFloat($('d-len').value);
  let ang = parseFloat($('d-ang').value);
  if (!(len > 0)) return;
  if (!Number.isFinite(ang)) ang = 0;
  let theta = (ang * Math.PI) / 180;
  if ($('d-mode').value === 'turn' && lastDir != null) theta += lastDir;
  hidePreview();
  commit(() => {
    const S = nodeById(start);
    const P = { x: round2(S.x + Math.cos(theta) * len), y: round2(S.y + Math.sin(theta) * len) };
    let id = null;
    for (const n of state.nodes) {
      if (n.id !== start && Math.abs(elevOfNode(n.id) - drawY) < 1 && Math.hypot(n.x - P.x, n.y - P.y) < 0.5) id = n.id;
    }
    if (id == null) id = addNode(P.x, P.y);
    if (id !== start && !wallBetween(start, id)) addWall(start, id, drawOn);
    lastDir = theta;
    start = id;
  });
  $('d-len').value = '';
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
    const nw = wallById(id);
    nw.t = w.t;
    nw.flip = w.flip;
    sel = { type: 'wall', id };
  });
}

function hidePreview() {
  prev = null;
  previewLine.visible = false;
  requestRender();
}

function updatePreview(e) {
  const a = start != null ? nodeById(start) : null;
  const p = a ? groundPoint(e.clientX, e.clientY, drawY) : null;
  if (!p) {
    hidePreview();
    return;
  }
  const s = snapPoint(p, null, true, drawY);
  const arr = previewGeo.attributes.position.array;
  arr.set([a.x, drawY + 3, a.y, s.x, drawY + 3, s.y]);
  previewGeo.attributes.position.needsUpdate = true;
  previewLine.visible = true;
  const len = Math.hypot(s.x - a.x, s.y - a.y);
  prev = {
    mid: { x: (a.x + s.x) / 2, y: drawY + 20, z: (a.y + s.y) / 2 },
    text: `${num(len)} cm · ${num(deg(Math.atan2(s.y - a.y, s.x - a.x)))}°`,
  };
  requestRender();
}

/* ---------- Gestur: ketuk, seret titik, tarik titik atas, putar dua jari ---------- */
const ptrs = new Set();
const ptrPos = new Map();
let lastTwist = null;
let tapRec = null;
let drag = null; // { type:'node', id } | { type:'top', wid, end, y0, h0, dist }
let dragBefore = null;
let rebuildQueued = false;

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

function startDrag(e, d) {
  drag = d;
  dragBefore = JSON.stringify(state);
  controls.enabled = false;
  tapRec.ok = false;
  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch {
    /* tidak apa-apa */
  }
}

host.addEventListener(
  'pointerdown',
  (e) => {
    ptrs.add(e.pointerId);
    ptrPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastTwist = null;
    if (ptrs.size === 1) {
      tapRec = { x: e.clientX, y: e.clientY, t: performance.now(), ok: true };
      if (mode === 'select') {
        const th = pickTop(e.clientX, e.clientY);
        const nd = pickNode(e.clientX, e.clientY);
        const preferTop =
          th &&
          (!nd || th.d < nd.d - 5 || (Math.abs(th.d - nd.d) <= 5 && sel && sel.type === 'wall' && sel.id === th.h.wid));
        if (preferTop) {
          const w = wallById(th.h.wid);
          sel = { type: 'wall', id: w.id };
          startDrag(e, {
            type: 'top',
            wid: w.id,
            end: th.h.end,
            y0: e.clientY,
            h0: th.h.end === 'a' ? w.hA : w.hB,
            dist: camera.position.distanceTo(th.h.m.position),
          });
          refresh();
          return;
        }
        if (nd) {
          sel = { type: 'node', id: nd.id };
          startDrag(e, { type: 'node', id: nd.id });
          refresh();
        }
      }
    } else if (tapRec) {
      tapRec.ok = false;
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

  // titik atas lain: menempel agar bisa bertemu di satu puncak
  const sO = isA ? L - el.iB : el.iA;
  const yO = isA ? el.topB : el.topA;
  let snapped = false;
  if (Math.abs(s - sO) < tol) {
    s = sO;
    snapped = true;
    if (Math.abs(y - yO) < tol) y = yO;
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

host.addEventListener('pointermove', (e) => {
  if (ptrPos.has(e.pointerId)) ptrPos.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // dua jari diputar searah: bangunan ikut berputar searah jari
  if (!drag && ptrPos.size === 2) {
    const [a, b] = [...ptrPos.values()];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (lastTwist != null) {
      let dt = ang - lastTwist;
      while (dt > Math.PI) dt -= 2 * Math.PI;
      while (dt < -Math.PI) dt += 2 * Math.PI;
      if (Math.abs(dt) > 0.002) orbitAzimuth(dt);
    }
    lastTwist = ang;
  }

  if (drag) {
    if (drag.type === 'top') {
      dragTop(e);
      return;
    }
    const n = nodeById(drag.id);
    const at = n ? elevOfNode(n.id) : 0;
    const p = n ? groundPoint(e.clientX, e.clientY, at) : null;
    if (!p) return;
    const s = snapPoint(p, drag.id, false, at);
    n.x = round2(s.x);
    n.y = round2(s.y);
    scheduleRebuild();
    return;
  }
  if (tapRec && ptrs.size === 1 && Math.hypot(e.clientX - tapRec.x, e.clientY - tapRec.y) > 8) tapRec.ok = false;
  if (mode === 'draw' && start != null && e.pointerType === 'mouse' && e.buttons === 0) updatePreview(e);
});

function onUp(e) {
  ptrs.delete(e.pointerId);
  ptrPos.delete(e.pointerId);
  lastTwist = null;
  if (drag) {
    if (JSON.stringify(state) !== dragBefore) pushHist(dragBefore);
    drag = null;
    controls.enabled = true;
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
  if (mode === 'draw') {
    drawTap(cx, cy);
    return;
  }
  const nd = pickNode(cx, cy);
  if (nd) {
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

function updateHint() {
  let t;
  if (mode === 'draw') {
    if (level === 'top') {
      t = start == null
        ? 'Ketuk titik oranye atau puncak dinding untuk mulai menggambar di atasnya.'
        : 'Ketuk titik berikutnya (ketinggian sama), atau ketik panjang dan sudut. Tekan Akhiri untuk kembali ke lantai.';
    } else {
      t = start == null
        ? 'Ketuk lantai untuk titik awal dinding. Satu jari memutar kamera, dua jari menggeser, zoom, dan memutar.'
        : 'Ketuk titik berikutnya, atau ketik panjang dan sudut lalu tekan Tambah dinding. Tekan Akhiri untuk berhenti.';
    }
  } else {
    t = 'Ketuk dinding atau titik untuk mengubah ukurannya. Seret titik biru untuk memindahkan, titik oranye untuk membentuk puncak dinding.';
  }
  $('hint').textContent = t;
}

function updateCtx() {
  const drawing = mode === 'draw';
  const w = selWall();
  const n = selNode();
  $('ctx-draw').hidden = !drawing;
  $('ctx-wall').hidden = drawing || !w;
  $('ctx-node').hidden = drawing || !n;
  $('l-floor').classList.toggle('active', level === 'floor');
  $('l-top').classList.toggle('active', level === 'top');
  $('b-undo').disabled = hist.length === 0;
  $('b-redo').disabled = redoStack.length === 0;

  if (drawing) {
    const s = start != null ? nodeById(start) : null;
    let t = level === 'top' ? 'Ketuk titik oranye atau puncak dinding untuk memilih titik awal.' : 'Ketuk lantai untuk memilih titik awal.';
    if (s) {
      t = `Titik awal: ${num(s.x)}, ${num(s.y)} cm`;
      if (drawOn != null) t += ` · ketinggian ${num(drawY)} cm`;
      if (lastDir != null) t += ` · dinding terakhir bersudut ${num(deg(lastDir))}°`;
    }
    $('d-status').textContent = t;
    $('d-add').disabled = start == null;
  }
  if (w) {
    const g = geo.get(w.id);
    const e = elev.get(w.id);
    setVal('w-len', g ? round2(g.length) : '');
    setVal('w-thick', w.t);
    setVal('w-hA', w.hA);
    setVal('w-hB', w.hB);
    setVal('w-iA', e ? round2(e.iA) : 0);
    setVal('w-iB', e ? round2(e.iB) : 0);
    let info = g ? `Sisi dalam setelah menyatu: ${num(g.innerLen)} cm` : '';
    if (e && w.on != null) info += ` · berdiri di atas dinding lain (dasar ${num(e.baseA)} / ${num(e.baseB)} cm)`;
    $('w-inner').textContent = info;
    $('w-unstack').hidden = w.on == null;
  }
  if (n) {
    setVal('n-x', n.x);
    setVal('n-y', n.y);
  }
}

function refresh() {
  if (sel && ((sel.type === 'wall' && !wallById(sel.id)) || (sel.type === 'node' && !nodeById(sel.id)))) sel = null;
  if (start != null && !nodeById(start)) resetChain();
  rebuildScene();
  updateInfo();
  updateHint();
  updateCtx();
  save();
  requestRender();
}

function setMode(m) {
  mode = m;
  resetChain();
  sel = null;
  drag = null;
  hidePreview();
  $('m-draw').classList.toggle('active', m === 'draw');
  $('m-select').classList.toggle('active', m === 'select');
  commit(() => {});
}

function setLevel(l) {
  level = l;
  resetChain();
  hidePreview();
  commit(() => {});
}

/* ---------- Tombol dan isian ---------- */
$('m-draw').addEventListener('click', () => setMode('draw'));
$('m-select').addEventListener('click', () => setMode('select'));
$('l-floor').addEventListener('click', () => setLevel('floor'));
$('l-top').addEventListener('click', () => setLevel('top'));
$('b-top').addEventListener('click', () => fitCamera(true));
$('b-fit').addEventListener('click', () => fitCamera(false));
$('b-undo').addEventListener('click', undo);
$('b-redo').addEventListener('click', redo);
$('d-add').addEventListener('click', addTyped);
$('d-end').addEventListener('click', () => {
  resetChain();
  hidePreview();
  commit(() => {});
});
for (const id of ['d-len', 'd-ang']) {
  $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTyped();
  });
}

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
    B.x = round2(A.x + (dx / l) * v);
    B.y = round2(A.y + (dy / l) * v);
  });
});
onChange('w-thick', (v) => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    w.t = clamp(v, 2, 100);
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
$('w-unstack').addEventListener('click', () => {
  const w = selWall();
  if (w) commit(() => (w.on = null));
});
$('w-flip').addEventListener('click', () => {
  const w = selWall();
  if (w) commit(() => (w.flip = !w.flip));
});
$('w-del').addEventListener('click', () => {
  const w = selWall();
  if (!w) return;
  commit(() => {
    for (const x of state.walls) if (x.on === w.id) x.on = null;
    state.walls = state.walls.filter((x) => x.id !== w.id);
    sel = null;
  });
});
onChange('n-x', (v) => {
  const n = selNode();
  if (n) commit(() => (n.x = round2(v)));
});
onChange('n-y', (v) => {
  const n = selNode();
  if (n) commit(() => (n.y = round2(v)));
});
$('n-del').addEventListener('click', () => {
  const n = selNode();
  if (!n) return;
  commit(() => {
    const gone = new Set(state.walls.filter((x) => x.a === n.id || x.b === n.id).map((x) => x.id));
    for (const x of state.walls) if (gone.has(x.on)) x.on = null;
    state.walls = state.walls.filter((x) => !gone.has(x.id));
    state.nodes = state.nodes.filter((x) => x.id !== n.id);
    if (start === n.id) resetChain();
    sel = null;
  });
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

/* ---------- Mulai ---------- */
loadData();
$('s-thick').value = cfg.defT;
$('s-height').value = cfg.defH;
$('s-grid').value = String(cfg.grid);
$('s-labels').checked = cfg.labels;
$('s-snap').checked = cfg.snap;
resize();
fitCamera(false);
refresh();
