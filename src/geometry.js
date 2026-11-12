// Geometri murni (tanpa DOM) untuk dinding yang menyatu.
// Koordinat denah: x ke kanan, y ke bawah (dilihat dari atas), satuan cm.
// Garis yang digambar = sisi luar dinding. Tebal dinding tumbuh ke KANAN arah gambar,
// sehingga menggambar searah jarum jam membuat tebal masuk ke dalam ruangan.

const EPS = 1e-9;

// Ukuran satu ulangan tekstur bata (2 bata lebar x 2 lapis), dalam cm.
export const BRICK_U = 44;
export const BRICK_V = 14;

export const round2 = (v) => Math.round(v * 100) / 100;

export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, t, d: Math.hypot(p.x - x, p.y - y) };
}

function unit(dx, dy) {
  const l = Math.hypot(dx, dy);
  return l < EPS ? null : { x: dx / l, y: dy / l, l };
}

const rightNormal = (u) => ({ x: -u.y, y: u.x });
const dot = (a, b) => a.x * b.x + a.y * b.y;

// Titik pertemuan sisi kanan dinding i dengan sisi kiri dinding j di titik N.
function joinPoints(N, ei, ej) {
  const ri = rightNormal(ei.u);
  const rj = rightNormal(ej.u);
  const p1 = { x: N.x + ri.x * ei.hi, y: N.y + ri.y * ei.hi };
  const p2 = { x: N.x + rj.x * ej.lo, y: N.y + rj.y * ej.lo };
  const cross = ei.u.x * ej.u.y - ei.u.y * ej.u.x;
  if (Math.abs(cross) < 1e-6) return { pi: p1, pj: p2 }; // sejajar: potongan lurus
  const wx = p2.x - p1.x;
  const wy = p2.y - p1.y;
  const s = (wx * ej.u.y - wy * ej.u.x) / cross;
  const P = { x: p1.x + ei.u.x * s, y: p1.y + ei.u.y * s };
  const limit = 8 * Math.max(ei.t, ej.t, 1);
  if (Math.hypot(P.x - N.x, P.y - N.y) > limit) return { pi: p1, pj: p2 }; // sudut terlalu lancip
  return { pi: P, pj: P };
}

/**
 * nodes: [{id,x,y}], walls: [{id,a,b,t,flip,...}]
 * Hasil: Map idDinding -> { poly:[4 titik], t:[4 parameter], length, outerLen, innerLen, mid }
 *  - length   : jarak antar titik (garis gambar = sisi luar)
 *  - innerLen : panjang sisi seberang setelah dinding menyatu
 *  - t        : posisi tiap sudut poly sepanjang dinding (0 = titik A, 1 = titik B), untuk tinggi miring
 */
export function computeWalls(nodes, walls) {
  const nm = new Map(nodes.map((n) => [n.id, n]));
  const ends = new Map();
  const pushEnd = (id, e) => {
    if (!ends.has(id)) ends.set(id, []);
    ends.get(id).push(e);
  };
  const items = new Map();

  for (const w of walls) {
    const A = nm.get(w.a);
    const B = nm.get(w.b);
    if (!A || !B) continue;
    const d = unit(B.x - A.x, B.y - A.y);
    if (!d) continue;
    const sg = 1; // tebal selalu ke kanan arah gambar (tidak ada lagi balik sisi)
    const rn = rightNormal(d);
    const o = { x: rn.x * sg, y: rn.y * sg };
    const mk = (node, u) => {
      const dsn = dot(o, rightNormal(u));
      const e = {
        N: node,
        u: { x: u.x, y: u.y },
        t: w.t,
        lo: dsn > 0 ? 0 : -w.t,
        hi: dsn > 0 ? w.t : 0,
        ang: Math.atan2(u.y, u.x),
      };
      pushEnd(node.id, e);
      return e;
    };
    items.set(w.id, { w, A, B, d, ea: mk(A, d), eb: mk(B, { x: -d.x, y: -d.y }) });
  }

  for (const [nid, list] of ends) {
    const N = nm.get(nid);
    if (list.length === 1) {
      const e = list[0];
      const r = rightNormal(e.u);
      e.cornerR = { x: N.x + r.x * e.hi, y: N.y + r.y * e.hi };
      e.cornerL = { x: N.x + r.x * e.lo, y: N.y + r.y * e.lo };
      continue;
    }
    list.sort((p, q) => p.ang - q.ang); // searah jarum jam (tampak dari atas)
    for (let i = 0; i < list.length; i++) {
      const ei = list[i];
      const ej = list[(i + 1) % list.length];
      const { pi, pj } = joinPoints(N, ei, ej);
      ei.cornerR = pi;
      ej.cornerL = pj;
    }
  }

  const res = new Map();
  for (const [id, it] of items) {
    const LA = it.ea.cornerL;
    const RA = it.ea.cornerR;
    const LB = it.eb.cornerL;
    const RB = it.eb.cornerR;
    const leftLen = Math.hypot(RB.x - LA.x, RB.y - LA.y);
    const rightLen = Math.hypot(LB.x - RA.x, LB.y - RA.y);
    const refIsLeft = true;
    const poly = [LA, RB, LB, RA];
    res.set(id, {
      poly,
      t: poly.map((p) => ((p.x - it.A.x) * it.d.x + (p.y - it.A.y) * it.d.y) / it.d.l),
      dir: { x: it.d.x, y: it.d.y },
      length: it.d.l,
      outerLen: refIsLeft ? leftLen : rightLen,
      innerLen: refIsLeft ? rightLen : leftLen,
      mid: { x: (it.A.x + it.B.x) / 2, y: (it.A.y + it.B.y) / 2 },
    });
  }
  return res;
}

const finiteOr = (v, d) => (Number.isFinite(v) ? v : d);

/**
 * Tinggi permukaan atas dinding (di atas dasarnya) pada jarak s dari titik A.
 * e = { hA, hB, iA, iB, L }. iA/iB = jarak titik atas A/B dari ujung dinding masing-masing.
 * Dengan iA = iB = 0 dinding berbentuk persegi panjang (puncak lurus/miring), dengan iA > 0
 * ujung dinding menjadi miring ke puncak, dan iA + iB = L membentuk segitiga.
 */
export function wallProfileHeight(e, s) {
  if (e.iA > 0 && s <= e.iA) return e.hA * (s / e.iA);
  const sb = e.L - e.iB;
  if (e.iB > 0 && s >= sb) return e.hB * ((e.L - s) / e.iB);
  const span = sb - e.iA;
  return span > 1e-9 ? e.hA + (e.hB - e.hA) * ((s - e.iA) / span) : e.hA;
}

/**
 * Ketinggian tiap dinding. Tinggi hA/hB diukur dari dasar dinding itu sendiri.
 * Dinding bertumpuk (w.on = id dinding bawah) berdiri di puncak dinding bawah,
 * mengikuti bentuk puncaknya (termasuk miring atau segitiga).
 * Hasil: Map idDinding -> { baseA, baseB, topA, topB, hA, hB, iA, iB, L }  (nilai absolut dari lantai)
 */
export function wallElevations(nodes, walls) {
  const nm = new Map(nodes.map((n) => [n.id, n]));
  const wm = new Map(walls.map((w) => [w.id, w]));
  const memo = new Map();

  const calc = (w, depth) => {
    if (memo.has(w.id)) return memo.get(w.id);
    const A = nm.get(w.a);
    const B = nm.get(w.b);
    const L = A && B ? Math.hypot(B.x - A.x, B.y - A.y) : 0;
    const hA = finiteOr(w.hA, finiteOr(w.h, 300));
    const hB = finiteOr(w.hB, finiteOr(w.h, 300));
    const iA = Math.min(Math.max(0, finiteOr(w.iA, 0)), L);
    const iB = Math.min(Math.max(0, finiteOr(w.iB, 0)), L - iA);

    let baseA = 0;
    let baseB = 0;
    if (w.on != null && depth < 12) {
      const p = wm.get(w.on);
      const PA = p ? nm.get(p.a) : null;
      const PB = p ? nm.get(p.b) : null;
      if (p && p.id !== w.id && PA && PB) {
        const pe = calc(p, depth + 1);
        const at = (nid) => {
          const n = nm.get(nid);
          if (!n) return 0;
          const pr = projectOnSegment(n, PA, PB);
          return pe.baseA + (pe.baseB - pe.baseA) * pr.t + wallProfileHeight(pe, pr.t * pe.L);
        };
        baseA = at(w.a);
        baseB = at(w.b);
      }
    }
    const baseAt = (s) => (L > 0 ? baseA + ((baseB - baseA) * s) / L : baseA);
    const r = { baseA, baseB, hA, hB, iA, iB, L, topA: baseAt(iA) + hA, topB: baseAt(L - iB) + hB };
    memo.set(w.id, r);
    return r;
  };

  const out = new Map();
  for (const w of walls) out.set(w.id, calc(w, 0));
  return out;
}

/**
 * Data segitiga prisma dinding. poly = 4 sudut dasar (denah), bots = tinggi dasar tiap sudut,
 * topPoly = 4 sudut puncak (denah; boleh bergeser dari dasar), tops = tinggi puncak tiap sudut.
 * Plan (x,y) -> three (x, tinggi, y). 12 titik pertama = tutup atas/bawah (grup 0),
 * 24 titik berikutnya = sisi samping (grup 1, diberi UV untuk tekstur bata).
 */
export function prismData(poly, bots, tops, topPoly = poly) {
  const pos = [];
  const uv = [];
  const us = [0];
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    us.push(us[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const vb = (i, u) => {
    pos.push(poly[i].x, bots[i], poly[i].y);
    uv.push(u / BRICK_U, bots[i] / BRICK_V);
  };
  const vt = (i, u) => {
    pos.push(topPoly[i].x, tops[i], topPoly[i].y);
    uv.push(u / BRICK_U, tops[i] / BRICK_V);
  };
  vt(0, 0); vt(1, 0); vt(2, 0);
  vt(0, 0); vt(2, 0); vt(3, 0);
  vb(0, 0); vb(2, 0); vb(1, 0);
  vb(0, 0); vb(3, 0); vb(2, 0);
  for (let i = 0; i < 4; i++) {
    const a = i;
    const b = (i + 1) % 4;
    const ua = us[i];
    const ub = us[i + 1];
    vb(a, ua); vb(b, ub); vt(b, ub);
    vb(a, ua); vt(b, ub); vt(a, ua);
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), planeVerts: 12, sideVerts: 24 };
}
