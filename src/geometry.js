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
    const sg = w.flip ? -1 : 1;
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
    const refIsLeft = !it.w.flip;
    const poly = [LA, RB, LB, RA];
    res.set(id, {
      poly,
      t: poly.map((p) => ((p.x - it.A.x) * it.d.x + (p.y - it.A.y) * it.d.y) / it.d.l),
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
 * Ketinggian tiap dinding. Tinggi hA/hB diukur dari dasar dinding itu sendiri.
 * Dinding bertumpuk (w.on = id dinding bawah) berdiri di puncak dinding bawah,
 * mengikuti kemiringan puncaknya.
 * Hasil: Map idDinding -> { baseA, baseB, topA, topB, hA, hB }  (nilai absolut dari lantai)
 */
export function wallElevations(nodes, walls) {
  const nm = new Map(nodes.map((n) => [n.id, n]));
  const wm = new Map(walls.map((w) => [w.id, w]));
  const memo = new Map();

  const calc = (w, depth) => {
    if (memo.has(w.id)) return memo.get(w.id);
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
          return pe.topA + (pe.topB - pe.topA) * pr.t;
        };
        baseA = at(w.a);
        baseB = at(w.b);
      }
    }
    const hA = finiteOr(w.hA, finiteOr(w.h, 300));
    const hB = finiteOr(w.hB, finiteOr(w.h, 300));
    const r = { baseA, baseB, topA: baseA + hA, topB: baseB + hB, hA, hB };
    memo.set(w.id, r);
    return r;
  };

  const out = new Map();
  for (const w of walls) out.set(w.id, calc(w, 0));
  return out;
}

/**
 * Data segitiga prisma dinding. poly 4 titik, bots/tops = tinggi dasar/puncak tiap sudut.
 * Plan (x,y) -> three (x, tinggi, y). 12 titik pertama = tutup atas/bawah (grup 0),
 * 24 titik berikutnya = sisi samping (grup 1, diberi UV untuk tekstur bata).
 */
export function prismData(poly, bots, tops) {
  const pos = [];
  const uv = [];
  const us = [0];
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    us.push(us[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const v = (i, y, u) => {
    pos.push(poly[i].x, y, poly[i].y);
    uv.push(u / BRICK_U, y / BRICK_V);
  };
  const tri = (a, ay, b, by, c, cy) => {
    v(a, ay, 0);
    v(b, by, 0);
    v(c, cy, 0);
  };
  tri(0, tops[0], 1, tops[1], 2, tops[2]);
  tri(0, tops[0], 2, tops[2], 3, tops[3]);
  tri(0, bots[0], 2, bots[2], 1, bots[1]);
  tri(0, bots[0], 3, bots[3], 2, bots[2]);
  for (let i = 0; i < 4; i++) {
    const a = i;
    const b = (i + 1) % 4;
    const ua = us[i];
    const ub = us[i + 1];
    v(a, bots[a], ua);
    v(b, bots[b], ub);
    v(b, tops[b], ub);
    v(a, bots[a], ua);
    v(b, tops[b], ub);
    v(a, tops[a], ua);
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), planeVerts: 12, sideVerts: 24 };
}
