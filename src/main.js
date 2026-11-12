import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeWalls, prismData, wallElevations, projectOnSegment, round2 } from './geometry.js';
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
        return { ...rest, hA: Number.isFinite(w.hA) ? w.hA : h, hB: Number.isFinite(w.hB) ? w.hB : h, on: w.on ?? null };
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
  const w = { id: state.next++, a, b, t: cfg.defT, hA: cfg.defH, hB: cfg.defH, on, flip: false };
  state.walls.push(w);
  return w.id;
}
function splitWall(wid, x, y) {
  const w = wallById(wid);
  const A = nodeById(w.a);
  const B = nodeById(w.b);
  const nid = addNode(x, y);
  const pr = projectOnSegment({ x, y }, A, B);
  const hMid = round2(w.hA + (w.hB - w.hA) * pr.t);
  const w2 = { ...w, id: state.next++, a: nid, hA: hMid };
  w.b = nid;
  w.hB = hMid;
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
let start = null; // id titik awal saat menggambar
let lastDir = null; // arah (radian) dinding terakhir pada rantai
let sel = null; // { type: 'wall' | 'node', id }
let geo = new Map();
let elev = new Map();
let nodeElev = new Map();
let prev = null; // { mid:{x,y,z}, text }

const selWall = () => (sel && sel.type === 'wall' ? wallById(sel.id) : null);
const selNode = () => (sel && sel.type === 'node' ? nodeById(sel.id) : null);

function commit(fn) {
  const before = JSON.stringify(state);
  fn();
  cleanOrphans();
  if (JSON.stringify(state) !== before) {
    hist.push(before);
    if (hist.length > 80) hist.shift();
  }
  refresh();
}

function undo() {
  const prevState = hist.pop();
  if (!prevState) return;
  state = JSON.parse(prevState);
  start = null;
  lastDir = null;
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
const topHandles = [];

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
    const bots = g.t.map((t) => e.baseA + (e.baseB - e.baseA) * t);
    const tops = g.t.map((t, i) => Math.max(bots[i], e.topA + (e.topB - e.topA) * t));
    const d = prismData(g.poly, bots, tops);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));
    bg.addGroup(0, d.planeVerts, 0);
    bg.addGroup(d.planeVerts, d.sideVerts, 1);
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
    m.position.set(n.x, (nodeElev.get(n.id) || 0) + 1.5, n.y);
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

  const sw = selWall();
  if (sw && mode === 'select') {
    const e = elev.get(sw.id);
    const A = nodeById(sw.a);
    const B = nodeById(sw.b);
    if (e && A && B) {
      for (const [end, N, base, top, h] of [
        ['a', A, e.baseA, e.topA, e.hA],
        ['b', B, e.baseB, e.topB, e.hB],
      ]) {
        const m = makeMarker(markerMats.top);
        m.position.set(N.x, top, N.y);
        handleGroup.add(m);
        topHandles.push({ end, m, wid: sw.id });
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute([N.x, base, N.y, N.x, top, N.y], 3));
        handleGroup.add(new THREE.Line(lg, lineHandle));
        addLabel(num(h), 'lbl hl', N.x, top, N.y, -16);
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

/* ---------- Titik di lantai, tempel ke grid / titik / dinding ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const gp = new THREE.Vector3();

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

function snapPoint(p, exclude = null, useWalls = true) {
  const g = cfg.grid;
  if (cfg.snap) {
    const tol = SNAP_PX * cmPerPx(p.dist);
    let best = null;
    let bd = tol;
    for (const n of state.nodes) {
      if (n.id === exclude) continue;
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
      best = m.userData.id;
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
      best = h;
    }
  }
  return best;
}

/* ---------- Menggambar ---------- */
function drawTap(cx, cy) {
  const p = groundPoint(cx, cy);
  if (!p) return;
  const s = snapPoint(p);
  hidePreview();
  commit(() => {
    const id = resolveNode(s);
    if (start == null) {
      start = id;
      lastDir = null;
    } else if (id !== start) {
      if (!wallBetween(start, id)) addWall(start, id);
      const a = nodeById(start);
      const b = nodeById(id);
      lastDir = Math.atan2(b.y - a.y, b.x - a.x);
      start = id;
    }
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
      if (n.id !== start && Math.hypot(n.x - P.x, n.y - P.y) < 0.5) id = n.id;
    }
    if (id == null) id = addNode(P.x, P.y);
    if (id !== start && !wallBetween(start, id)) addWall(start, id);
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
  const p = a ? groundPoint(e.clientX, e.clientY) : null;
  if (!p) {
    hidePreview();
    return;
  }
  const s = snapPoint(p);
  const arr = previewGeo.attributes.position.array;
  arr.set([a.x, 3, a.y, s.x, 3, s.y]);
  previewGeo.attributes.position.needsUpdate = true;
  previewLine.visible = true;
  const len = Math.hypot(s.x - a.x, s.y - a.y);
  prev = {
    mid: { x: (a.x + s.x) / 2, y: 20, z: (a.y + s.y) / 2 },
    text: `${num(len)} cm · ${num(deg(Math.atan2(s.y - a.y, s.x - a.x)))}°`,
  };
  requestRender();
}

/* ---------- Gestur: ketuk, seret titik, tarik titik atas ---------- */
const ptrs = new Set();
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
    if (ptrs.size === 1) {
      tapRec = { x: e.clientX, y: e.clientY, t: performance.now(), ok: true };
      if (mode === 'select') {
        const th = pickTop(e.clientX, e.clientY);
        if (th) {
          const w = wallById(th.wid);
          startDrag(e, {
            type: 'top',
            wid: th.wid,
            end: th.end,
            y0: e.clientY,
            h0: th.end === 'a' ? w.hA : w.hB,
            dist: camera.position.distanceTo(th.m.position),
          });
          return;
        }
        const id = pickNode(e.clientX, e.clientY);
        if (id != null) {
          sel = { type: 'node', id };
          startDrag(e, { type: 'node', id });
          refresh();
        }
      }
    } else if (tapRec) {
      tapRec.ok = false;
    }
  },
  true
);

host.addEventListener('pointermove', (e) => {
  if (drag) {
    if (drag.type === 'top') {
      const w = wallById(drag.wid);
      if (!w) return;
      const step = Math.max(cfg.grid, 1);
      let v = drag.h0 + (drag.y0 - e.clientY) * cmPerPx(drag.dist);
      v = clamp(Math.round(v / step) * step, 0, 3000);
      if (drag.end === 'a') w.hA = v;
      else w.hB = v;
      scheduleRebuild();
      return;
    }
    const n = nodeById(drag.id);
    const p = n ? groundPoint(e.clientX, e.clientY, nodeElev.get(n.id) || 0) : null;
    if (!p) return;
    const s = snapPoint(p, drag.id, false);
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
  if (drag) {
    if (JSON.stringify(state) !== dragBefore) {
      hist.push(dragBefore);
      if (hist.length > 80) hist.shift();
    }
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
  const nid = pickNode(cx, cy);
  if (nid != null) {
    sel = { type: 'node', id: nid };
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
    t = start == null
      ? 'Ketuk lantai untuk titik awal dinding. Satu jari memutar kamera, dua jari menggeser dan zoom.'
      : 'Ketuk titik berikutnya, atau ketik panjang dan sudut lalu tekan Tambah dinding. Tekan Akhiri untuk berhenti.';
  } else {
    t = 'Ketuk dinding atau titik untuk mengubah ukurannya. Seret titik untuk memindahkan; tarik titik oranye untuk mengubah tinggi.';
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

  if (drawing) {
    const s = start != null ? nodeById(start) : null;
    let t = 'Ketuk lantai untuk memilih titik awal.';
    if (s) {
      t = `Titik awal: ${num(s.x)}, ${num(s.y)} cm`;
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
  if (start != null && !nodeById(start)) start = null;
  rebuildScene();
  updateInfo();
  updateHint();
  updateCtx();
  save();
  requestRender();
}

function setMode(m) {
  mode = m;
  start = null;
  lastDir = null;
  sel = null;
  drag = null;
  hidePreview();
  $('m-draw').classList.toggle('active', m === 'draw');
  $('m-select').classList.toggle('active', m === 'select');
  commit(() => {});
}

/* ---------- Tombol dan isian ---------- */
$('m-draw').addEventListener('click', () => setMode('draw'));
$('m-select').addEventListener('click', () => setMode('select'));
$('b-top').addEventListener('click', () => fitCamera(true));
$('b-fit').addEventListener('click', () => fitCamera(false));
$('b-undo').addEventListener('click', undo);
$('d-add').addEventListener('click', addTyped);
$('d-end').addEventListener('click', () => {
  start = null;
  lastDir = null;
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
    if (start === n.id) start = null;
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
