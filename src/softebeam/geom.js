// Soft-EBeam geometry engine. All coordinates in nm (float64).
// Pipeline: flattenLib → biasRings → healAndFracture (union + trapezoids) → fragmentForPEC → tileFields

// ── growable typed buffers ───────────────────────────────
export class TrapBuf {
  // stride 6: y0,y1,xl0,xr0,xl1,xr1  (bottom edge at y0 spans xl0..xr0, top edge at y1 spans xl1..xr1)
  constructor(cap = 1024) { this.n = 0; this.t = new Float64Array(cap * 6); this.layer = new Int32Array(cap); this.comp = new Int32Array(cap); }
  grow() { const c = this.layer.length * 2; const t = new Float64Array(c * 6); t.set(this.t); this.t = t; const l = new Int32Array(c); l.set(this.layer); this.layer = l; const m = new Int32Array(c); m.set(this.comp); this.comp = m; }
  push(y0, y1, xl0, xr0, xl1, xr1, layer, comp) {
    if (this.n >= this.layer.length) this.grow();
    const o = this.n * 6, t = this.t; t[o] = y0; t[o + 1] = y1; t[o + 2] = xl0; t[o + 3] = xr0; t[o + 4] = xl1; t[o + 5] = xr1;
    this.layer[this.n] = layer; this.comp[this.n] = comp; return this.n++;
  }
  trim() { return { n: this.n, t: this.t.slice(0, this.n * 6), layer: this.layer.slice(0, this.n), comp: this.comp.slice(0, this.n) }; }
}
export const trapArea = (t, o) => 0.5 * ((t[o + 3] - t[o + 2]) + (t[o + 5] - t[o + 4])) * (t[o + 1] - t[o]);

// ── hierarchy ────────────────────────────────────────────
export function topCells(lib) {
  const used = new Set();
  for (const c of lib.cells) for (const e of c.elements) if (e.type === 'sref' || e.type === 'aref') used.add(e.sname);
  const tops = lib.cells.filter(c => !used.has(c.name)).map(c => c.name);
  return tops.length ? tops : lib.cells.map(c => c.name);
}

export function layersOf(lib) {
  const s = new Set();
  for (const c of lib.cells) for (const e of c.elements) if (e.type === 'boundary' || e.type === 'path') s.add(e.layer);
  return [...s].sort((a, b) => a - b);
}

const refXY = e => typeof e.xy[0] === 'number' ? e.xy : e.xy[0];

function pathPolygon(xy, w) {
  // flush-ended path with mitred joins
  const n = xy.length, h = Math.abs(w) / 2; if (n < 2 || !h) return null;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = xy[i], a = xy[Math.max(0, i - 1)], b = xy[Math.min(n - 1, i + 1)];
    let d1x = p[0] - a[0], d1y = p[1] - a[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
    if (i === 0) { d1x = d2x; d1y = d2y; } if (i === n - 1) { d2x = d1x; d2y = d1y; }
    const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
    const n1x = -d1y / l1, n1y = d1x / l1, n2x = -d2y / l2, n2y = d2x / l2;
    const den = Math.max(0.2, 1 + n1x * n2x + n1y * n2y), mx = (n1x + n2x) / den * h, my = (n1y + n2y) / den * h;
    L.push(p[0] + mx, p[1] + my); R.push(p[0] - mx, p[1] - my);
  }
  const out = new Float64Array(L.length + R.length); out.set(L);
  for (let i = R.length - 2, k = L.length; i >= 0; i -= 2, k += 2) { out[k] = R[i]; out[k + 1] = R[i + 1]; }
  return out;
}

export function ringArea(r) { let a = 0; const n = r.length; for (let i = 0; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return a / 2; }

function cleanRing(r) {
  // drop repeated / closing points, normalise to CCW
  const o = []; const n = r.length;
  for (let i = 0; i < n; i += 2) { const k = o.length; if (k && o[k - 2] === r[i] && o[k - 1] === r[i + 1]) continue; o.push(r[i], r[i + 1]); }
  while (o.length > 4 && o[0] === o[o.length - 2] && o[1] === o[o.length - 1]) o.length -= 2;
  if (o.length < 6) return null;
  let f = new Float64Array(o); const a = ringArea(f);
  if (Math.abs(a) < 1e-9) return null;
  if (a < 0) { const g = new Float64Array(f.length); for (let i = 0, j = f.length - 2; j >= 0; i += 2, j -= 2) { g[i] = f[j]; g[i + 1] = f[j + 1]; } f = g; }
  return f;
}

export function cellBBoxes(lib) {
  // per-cell bbox in DB units, memoised, ignoring rotation of children (bbox of rotated bbox used)
  const memo = new Map(), map = lib.cellMap;
  const bb = (name, depth) => {
    if (memo.has(name)) return memo.get(name); const c = map[name]; if (!c || depth > 64) return null;
    memo.set(name, null);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const e of c.elements) {
      if (e.type === 'boundary') for (const p of e.xy) add(p[0], p[1]);
      else if (e.type === 'path') { const h = Math.abs(e.width || 0) / 2; for (const p of e.xy) { add(p[0] - h, p[1] - h); add(p[0] + h, p[1] + h); } }
      else if (e.type === 'sref' || e.type === 'aref') {
        const cb = bb(e.sname, depth + 1); if (!cb) continue;
        const corners = xformBox(cb, e.angle || 0, e.mag || 1);
        const pos = e.type === 'sref' ? [refXY(e)] : arefCorners(e);
        for (const [px, py] of pos) { add(corners.x0 + px, corners.y0 + py); add(corners.x1 + px, corners.y1 + py); }
      }
    }
    const r = x0 === Infinity ? null : { x0, y0, x1, y1 }; memo.set(name, r); return r;
  };
  for (const c of lib.cells) bb(c.name, 0);
  return memo;
}
function xformBox(b, ang, mag) {
  const c = Math.cos(ang * Math.PI / 180) * mag, s = Math.sin(ang * Math.PI / 180) * mag;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) { const X = c * x - s * y, Y = s * x + c * y; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
  return { x0, y0, x1, y1 };
}
function arefLattice(e) {
  const [nc, nr] = e.colrow || [1, 1], o = e.xy[0];
  return { nc, nr, ox: o[0], oy: o[1], cx: (e.xy[1][0] - o[0]) / nc, cy: (e.xy[1][1] - o[1]) / nc, rx: (e.xy[2][0] - o[0]) / nr, ry: (e.xy[2][1] - o[1]) / nr };
}
function arefCorners(e) {
  const L = arefLattice(e), out = [];
  for (const r of [0, L.nr - 1]) for (const c of [0, L.nc - 1]) out.push([L.ox + c * L.cx + r * L.rx, L.oy + c * L.cy + r * L.ry]);
  return out;
}

// Flatten hierarchy into CCW rings (nm). opts: {top, layers:Set|null, window:{x0,y0,x1,y1} nm|null, maxPolys}
export function flattenLib(lib, opts = {}) {
  const u = (lib.dbUnit || 1e-9) * 1e9, map = lib.cellMap, maxPolys = opts.maxPolys || 400000;
  const top = opts.top || topCells(lib)[0], layers = opts.layers || null, win = opts.window || null;
  const boxes = cellBBoxes(lib);
  const rings = [], ringLayer = [];
  let truncated = false;
  const W = win ? { x0: win.x0 / u, y0: win.y0 / u, x1: win.x1 / u, y1: win.y1 / u } : null; // window in DB units
  // M = [a,b,c,d,tx,ty] maps child DB coords → top DB coords
  const visit = (name, M, depth) => {
    if (truncated) return; const cell = map[name]; if (!cell || depth > 64) return;
    for (const e of cell.elements) {
      if (truncated) return;
      if (e.type === 'boundary' || e.type === 'path') {
        if (layers && !layers.has(e.layer)) continue;
        let src;
        if (e.type === 'boundary') { src = new Float64Array(e.xy.length * 2); e.xy.forEach((p, i) => { src[2 * i] = p[0]; src[2 * i + 1] = p[1]; }); }
        else { src = pathPolygon(e.xy, e.width || 0); if (!src) continue; }
        const r = new Float64Array(src.length);
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
        for (let i = 0; i < src.length; i += 2) {
          const X = M[0] * src[i] + M[1] * src[i + 1] + M[4], Y = M[2] * src[i] + M[3] * src[i + 1] + M[5];
          r[i] = X * u; r[i + 1] = Y * u;
          if (X < bx0) bx0 = X; if (X > bx1) bx1 = X; if (Y < by0) by0 = Y; if (Y > by1) by1 = Y;
        }
        if (W && (bx1 < W.x0 || bx0 > W.x1 || by1 < W.y0 || by0 > W.y1)) continue;
        const cr = cleanRing(r); if (!cr) continue;
        rings.push(cr); ringLayer.push(e.layer);
        if (rings.length >= maxPolys) { truncated = true; return; }
      } else if (e.type === 'sref' || e.type === 'aref') {
        const cb = boxes.get(e.sname); if (!cb) continue;
        const ang = (e.angle || 0) * Math.PI / 180, mg = e.mag || 1, ca = Math.cos(ang) * mg, sa = Math.sin(ang) * mg;
        const R = [M[0] * ca + M[1] * sa, -M[0] * sa + M[1] * ca, M[2] * ca + M[3] * sa, -M[2] * sa + M[3] * ca];
        const lb = xformBox(cb, e.angle || 0, mg);
        const place = (px, py) => {
          const tx = M[0] * px + M[1] * py + M[4], ty = M[2] * px + M[3] * py + M[5];
          if (W) { // cull instance by its transformed bbox
            const cs = [[lb.x0 + px, lb.y0 + py], [lb.x1 + px, lb.y0 + py], [lb.x0 + px, lb.y1 + py], [lb.x1 + px, lb.y1 + py]];
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const [x, y] of cs) { const X = M[0] * x + M[1] * y + M[4], Y = M[2] * x + M[3] * y + M[5]; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
            if (x1 < W.x0 || x0 > W.x1 || y1 < W.y0 || y0 > W.y1) return;
          }
          visit(e.sname, [R[0], R[1], R[2], R[3], tx, ty], depth + 1);
        };
        if (e.type === 'sref') { const p = refXY(e); place(p[0], p[1]); }
        else if (e.xy.length >= 3) {
          const L = arefLattice(e);
          for (let r = 0; r < L.nr && !truncated; r++) for (let c = 0; c < L.nc && !truncated; c++) place(L.ox + c * L.cx + r * L.rx, L.oy + c * L.cy + r * L.ry);
        }
      }
    }
  };
  visit(top, [1, 0, 0, 1, 0, 0], 0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) { if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i]; if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1]; }
  return { rings, ringLayer, truncated, bbox: rings.length ? { x0, y0, x1, y1 } : null, top };
}

// ── bias (mitred offset of CCW rings; d>0 grows) ─────────
export function biasRing(r, d) {
  if (!d) return r; const n = r.length / 2, o = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const px = r[2 * i], py = r[2 * i + 1];
    let e1x = px - r[2 * a], e1y = py - r[2 * a + 1], e2x = r[2 * b] - px, e2y = r[2 * b + 1] - py;
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    const n1x = e1y / l1, n1y = -e1x / l1, n2x = e2y / l2, n2y = -e2x / l2; // outward normals (CCW)
    const den = 1 + n1x * n2x + n1y * n2y;
    if (den < 0.25) { o.push(px + d * n1x, py + d * n1y, px + d * n2x, py + d * n2y); }
    else o.push(px + d * (n1x + n2x) / den, py + d * (n1y + n2y) / den);
  }
  return new Float64Array(o);
}

// ── union + trapezoid decomposition (slab sweep, positive winding) ──
// Rings must be CCW. Emits merged trapezoids into buf with the given layer; returns number emitted.
// compBase: component ids are compBase + local union-find root index.
function sweepCluster(rings, buf, layer, uf, eps) {
  let ne = 0; for (const r of rings) ne += r.length / 2;
  const ylo = new Float64Array(ne), yhi = new Float64Array(ne), xlo = new Float64Array(ne), xhi = new Float64Array(ne), w = new Int8Array(ne);
  let k = 0; const ys = [];
  for (const r of rings) {
    const n = r.length;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n, x1 = r[i], y1 = r[i + 1], x2 = r[j], y2 = r[j + 1];
      if (y1 === y2) continue;
      if (y1 < y2) { ylo[k] = y1; yhi[k] = y2; xlo[k] = x1; xhi[k] = x2; w[k] = -1; } // upward = right side
      else { ylo[k] = y2; yhi[k] = y1; xlo[k] = x2; xhi[k] = x1; w[k] = 1; }          // downward = left side
      ys.push(y1, y2); k++;
    }
  }
  ne = k; if (!ne) return;
  ys.sort((a, b) => a - b);
  const Y = []; for (const y of ys) if (!Y.length || y - Y[Y.length - 1] > eps) Y.push(y);
  const order = new Int32Array(ne); for (let i = 0; i < ne; i++) order[i] = i;
  order.sort((a, b) => ylo[a] - ylo[b]);
  const xAt = (e, y) => yhi[e] === ylo[e] ? xlo[e] : xlo[e] + (xhi[e] - xlo[e]) * (y - ylo[e]) / (yhi[e] - ylo[e]);
  let active = [], ei = 0; const XA = new Float64Array(ne), XB = new Float64Array(ne);
  // open trapezoids touching the current y from below: {id, xl, xr, sl, sr}
  let open = [];
  const slope = (a, b, h) => (b - a) / h;
  const emitSlab = (y0, y1, A) => {
    // A sorted by x at y0 (ties: x at y1, then left sides first)
    const h = y1 - y0, nxt = []; let wind = 0, left = -1;
    for (const e of A) {
      const prev = wind; wind += w[e];
      if (prev <= 0 && wind > 0) left = e;
      else if (prev > 0 && wind <= 0) {
        const xl0 = xAt(left, y0), xr0 = xAt(e, y0), xl1 = xAt(left, y1), xr1 = xAt(e, y1);
        if (xr0 - xl0 > eps || xr1 - xl1 > eps) nxt.push({ xl0, xr0, xl1, xr1, sl: slope(xl0, xl1, h), sr: slope(xr0, xr1, h) });
      }
    }
    // match against open trapezoids: merge collinear continuations, union overlapping ones
    const merged = [];
    let p = 0;
    for (const t of nxt) {
      while (p < open.length && open[p].xr < t.xl0 - eps) p++;
      let q = p, id = -1;
      while (q < open.length && open[q].xl <= t.xr0 + eps) {
        const o = open[q];
        const ov = Math.min(o.xr, t.xr0) - Math.max(o.xl, t.xl0);
        if (ov > eps) {
          if (id < 0 && Math.abs(o.xl - t.xl0) <= eps && Math.abs(o.xr - t.xr0) <= eps && Math.abs(o.sl - t.sl) <= 1e-9 * (1 + Math.abs(t.sl)) && Math.abs(o.sr - t.sr) <= 1e-9 * (1 + Math.abs(t.sr))) {
            id = o.id; const b = id * 6; buf.t[b + 1] = y1; buf.t[b + 4] = t.xl1; buf.t[b + 5] = t.xr1;
          }
          t.link = t.link || []; t.link.push(o.id);
        }
        q++;
      }
      if (id < 0) id = buf.push(y0, y1, t.xl0, t.xr0, t.xl1, t.xr1, layer, 0);
      uf.make(id); if (t.link) for (const l of t.link) uf.union(id, l);
      merged.push({ id, xl: t.xl1, xr: t.xr1, sl: t.sl, sr: t.sr });
    }
    open = merged;
  };
  for (let s = 0; s + 1 < Y.length; s++) {
    const ya = Y[s], yb = Y[s + 1];
    active = active.filter(e => yhi[e] > ya + eps);
    while (ei < ne && ylo[order[ei]] <= ya + eps) { const e = order[ei++]; if (yhi[e] > ya + eps) active.push(e); }
    if (!active.length) { open = []; continue; }
    let y0 = ya, guard = 0;
    while (y0 < yb - eps && guard++ < 10000) {
      for (const e of active) { XA[e] = xAt(e, y0); XB[e] = xAt(e, yb); }
      active.sort((a, b) => (XA[a] - XA[b]) || (XB[a] - XB[b]) || (w[b] - w[a]));
      let y1 = yb;
      for (let i = 0; i + 1 < active.length; i++) {
        const a = active[i], b = active[i + 1];
        const da = XA[b] - XA[a], db = XB[b] - XB[a];
        if (db < -eps && da >= -eps) { const t = da / (da - db), yc = y0 + (yb - y0) * t; if (yc > y0 + eps && yc < y1) y1 = yc; }
      }
      emitSlab(y0, y1, active);
      y0 = y1;
    }
  }
}

class UF {
  constructor() { this.p = new Map(); }
  make(a) { if (!this.p.has(a)) this.p.set(a, a); }
  find(a) { let r = a; while (this.p.get(r) !== r) r = this.p.get(r); while (this.p.get(a) !== r) { const n = this.p.get(a); this.p.set(a, r); a = n; } return r; }
  union(a, b) { const x = this.find(a), y = this.find(b); if (x !== y) this.p.set(x, y); }
}

// Group rings into clusters whose bboxes touch (so each cluster can be swept independently).
function clusterRings(rings) {
  const n = rings.length, bb = new Float64Array(n * 4);
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const r = rings[i]; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let j = 0; j < r.length; j += 2) { if (r[j] < x0) x0 = r[j]; if (r[j] > x1) x1 = r[j]; if (r[j + 1] < y0) y0 = r[j + 1]; if (r[j + 1] > y1) y1 = r[j + 1]; }
    bb[4 * i] = x0; bb[4 * i + 1] = y0; bb[4 * i + 2] = x1; bb[4 * i + 3] = y1; sx += x1 - x0; sy += y1 - y0;
  }
  const cs = Math.max(1, 2 * Math.max(sx, sy) / Math.max(1, n));
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const grid = new Map(), bigs = [];
  const hit = (i, j) => bb[4 * j] <= bb[4 * i + 2] && bb[4 * j + 2] >= bb[4 * i] && bb[4 * j + 1] <= bb[4 * i + 3] && bb[4 * j + 3] >= bb[4 * i + 1];
  for (let i = 0; i < n; i++) {
    const gx0 = Math.floor(bb[4 * i] / cs), gy0 = Math.floor(bb[4 * i + 1] / cs), gx1 = Math.floor(bb[4 * i + 2] / cs), gy1 = Math.floor(bb[4 * i + 3] / cs);
    for (const j of bigs) if (hit(i, j)) parent[find(i)] = find(j);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 4096) { // huge polygon: test against everything seen so far
      for (let j = 0; j < i; j++) if (hit(i, j)) parent[find(i)] = find(j);
      bigs.push(i); continue;
    }
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const key = gx + ',' + gy; let L = grid.get(key); if (!L) grid.set(key, L = []);
      for (const j of L) if (hit(i, j)) parent[find(i)] = find(j);
      L.push(i);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(i); }
  return [...groups.values()];
}

const isAxisRect = r => r.length === 8 && ((r[1] === r[3] && r[2] === r[4] && r[5] === r[7] && r[6] === r[0]) || (r[0] === r[2] && r[3] === r[5] && r[4] === r[6] && r[7] === r[1]));

// Heal (union per layer) + fracture to trapezoids. Returns {traps (TrapBuf trimmed), comps, compSrc}
// compSrc[c] = index of the single source ring if the component came from exactly one ring, else -1
export function healAndFracture(rings, ringLayer, eps = 1e-6) {
  const buf = new TrapBuf(Math.max(1024, rings.length * 4));
  const byLayer = new Map();
  rings.forEach((r, i) => { const l = ringLayer[i]; let L = byLayer.get(l); if (!L) byLayer.set(l, L = []); L.push(i); });
  const compOfTrap = [], compSrc = [];
  for (const [layer, idx] of byLayer) {
    const clusters = clusterRings(idx.map(i => rings[i]));
    for (const cl of clusters) {
      const ids = cl.map(k => idx[k]);
      if (ids.length === 1 && isAxisRect(rings[ids[0]])) { // fast path
        const r = rings[ids[0]]; const x0 = Math.min(r[0], r[2], r[4]), x1 = Math.max(r[0], r[2], r[4]), y0 = Math.min(r[1], r[3], r[5]), y1 = Math.max(r[1], r[3], r[5]);
        const t = buf.push(y0, y1, x0, x1, x0, x1, layer, 0); compOfTrap[t] = compSrc.length; compSrc.push(ids[0]); continue;
      }
      const uf = new UF(), start = buf.n;
      sweepCluster(ids.map(i => rings[i]), buf, layer, uf, eps);
      const rootComp = new Map();
      for (let t = start; t < buf.n; t++) {
        const r = uf.find(t); let c = rootComp.get(r);
        if (c === undefined) { c = compSrc.length; rootComp.set(r, c); compSrc.push(ids.length === 1 ? ids[0] : -1); }
        compOfTrap[t] = c;
      }
      if (ids.length > 1 && rootComp.size === 1) { /* merged multi-ring component: keep -1 */ }
    }
  }
  for (let t = 0; t < buf.n; t++) buf.comp[t] = compOfTrap[t];
  return { traps: buf.trim(), nComp: compSrc.length, compSrc };
}

// ── Manhattanise: replace slanted sides with stair steps of height `step` (rect-only machines) ──
export function toRectangles(traps, step) {
  const out = new TrapBuf(traps.n * 2), t = traps.t;
  for (let i = 0; i < traps.n; i++) {
    const o = i * 6, y0 = t[o], y1 = t[o + 1];
    if (t[o + 2] === t[o + 4] && t[o + 3] === t[o + 5]) { out.push(y0, y1, t[o + 2], t[o + 3], t[o + 2], t[o + 3], traps.layer[i], traps.comp[i]); continue; }
    const k = Math.max(1, Math.ceil((y1 - y0) / step));
    for (let j = 0; j < k; j++) {
      const ya = y0 + (y1 - y0) * j / k, yb = y0 + (y1 - y0) * (j + 1) / k, f = (j + 0.5) / k;
      const xl = t[o + 2] + (t[o + 4] - t[o + 2]) * f, xr = t[o + 3] + (t[o + 5] - t[o + 3]) * f;
      if (xr > xl) out.push(ya, yb, xl, xr, xl, xr, traps.layer[i], traps.comp[i]);
    }
  }
  return out.trim();
}

// ── PEC fragmentation ────────────────────────────────────
// Splits trapezoids into PEC fragments: thin strips (edgeW) along the outline, interior pieces ≤ fragMax.
// Components whose bbox ≤ smallSize stay whole and share one dose group.
// Returns {frags, fragGroup, nGroups, ctrl (x,y per group), target (per group), groupComp}
export function fragmentForPEC(traps, nComp, opts) {
  const { fragMax = 1000, edgeW = 100, smallSize = 500, interiorTarget = 1.0, edgeTarget = 0.5 } = opts;
  const t = traps.t, n = traps.n;
  // component bboxes
  const cb = new Float64Array(nComp * 4).fill(NaN);
  for (let i = 0; i < n; i++) {
    const c = traps.comp[i], o = i * 6, b = c * 4;
    const x0 = Math.min(t[o + 2], t[o + 4]), x1 = Math.max(t[o + 3], t[o + 5]);
    if (isNaN(cb[b])) { cb[b] = x0; cb[b + 1] = t[o]; cb[b + 2] = x1; cb[b + 3] = t[o + 1]; }
    else { cb[b] = Math.min(cb[b], x0); cb[b + 1] = Math.min(cb[b + 1], t[o]); cb[b + 2] = Math.max(cb[b + 2], x1); cb[b + 3] = Math.max(cb[b + 3], t[o + 1]); }
  }
  // horizontal-edge coverage maps per (layer, y): intervals of trapezoid tops / bottoms
  const tops = new Map(), bots = new Map();
  const key = (l, y) => l + ':' + y;
  for (let i = 0; i < n; i++) {
    const o = i * 6, l = traps.layer[i];
    let a = tops.get(key(l, t[o + 1])); if (!a) tops.set(key(l, t[o + 1]), a = []); a.push(t[o + 4], t[o + 5]);
    let b = bots.get(key(l, t[o])); if (!b) bots.set(key(l, t[o]), b = []); b.push(t[o + 2], t[o + 3]);
  }
  const uncovered = (ints, a, b) => { // length of [a,b] not covered by intervals
    if (!ints) return b - a; let cov = 0; const segs = [];
    for (let i = 0; i < ints.length; i += 2) { const s = Math.max(a, ints[i]), e = Math.min(b, ints[i + 1]); if (e > s) segs.push([s, e]); }
    segs.sort((p, q) => p[0] - q[0]); let cur = -Infinity;
    for (const [s, e] of segs) { const s2 = Math.max(s, cur); if (e > s2) { cov += e - s2; cur = e; } }
    return (b - a) - cov;
  };
  const out = new TrapBuf(n * 4); const fragGroup = []; const ctrl = []; const target = []; const groupComp = []; const kind = [];
  const compGroup = new Int32Array(nComp).fill(-1);
  const bestSide = new Float64Array(nComp); // for small comps: widest slab
  for (let i = 0; i < n; i++) {
    const o = i * 6, c = traps.comp[i], b = c * 4, l = traps.layer[i];
    const y0 = t[o], y1 = t[o + 1], xl0 = t[o + 2], xr0 = t[o + 3], xl1 = t[o + 4], xr1 = t[o + 5];
    const small = Math.max(cb[b + 2] - cb[b], cb[b + 3] - cb[b + 1]) <= smallSize;
    if (small) {
      let g = compGroup[c];
      if (g < 0) { g = compGroup[c] = ctrl.length / 2; ctrl.push(0, 0); target.push(edgeTarget); kind.push(1); groupComp.push(c); bestSide[c] = -1; }
      const wmid = 0.5 * (xr0 + xr1 - xl0 - xl1);
      if (wmid > bestSide[c]) { bestSide[c] = wmid; ctrl[2 * g] = 0.5 * (xr0 + xr1); ctrl[2 * g + 1] = 0.5 * (y0 + y1); }
      out.push(y0, y1, xl0, xr0, xl1, xr1, l, c); fragGroup.push(g); continue;
    }
    const botOut = uncovered(tops.get(key(l, y0)), xl0, xr0) > edgeW * 0.25;
    const topOut = uncovered(bots.get(key(l, y1)), xl1, xr1) > edgeW * 0.25;
    // y cuts
    const H = y1 - y0, yc = [y0];
    let ya = y0, yb = y1;
    if (botOut && H > 2 * edgeW) { ya = y0 + edgeW; yc.push(ya); }
    if (topOut && H > 2 * edgeW) yb = y1 - edgeW;
    const nm = Math.max(1, Math.ceil((yb - ya) / fragMax)); for (let k = 1; k < nm; k++) yc.push(ya + (yb - ya) * k / nm);
    if (yb < y1) yc.push(yb); yc.push(y1);
    for (let r = 0; r + 1 < yc.length; r++) {
      const ry0 = yc[r], ry1 = yc[r + 1], f0 = (ry0 - y0) / H, f1 = (ry1 - y0) / H;
      const L0 = xl0 + (xl1 - xl0) * f0, R0 = xr0 + (xr1 - xr0) * f0, L1 = xl0 + (xl1 - xl0) * f1, R1 = xr0 + (xr1 - xr0) * f1;
      const Wm = 0.5 * (R0 + R1 - L0 - L1); if (Wm <= 0) continue;
      const tc = [0]; let ta = 0, tb = 1;
      if (Wm > 2 * edgeW) { ta = edgeW / Wm; tb = 1 - ta; tc.push(ta); }
      const ncol = Math.max(1, Math.ceil((tb - ta) * Wm / fragMax)); for (let k = 1; k < ncol; k++) tc.push(ta + (tb - ta) * k / ncol);
      if (tb < 1) tc.push(tb); tc.push(1);
      const rowBotOut = r === 0 && botOut, rowTopOut = r === yc.length - 2 && topOut;
      for (let q = 0; q + 1 < tc.length; q++) {
        const ta_ = tc[q], tb_ = tc[q + 1];
        const fl0 = L0 + (R0 - L0) * ta_, fr0 = L0 + (R0 - L0) * tb_, fl1 = L1 + (R1 - L1) * ta_, fr1 = L1 + (R1 - L1) * tb_;
        out.push(ry0, ry1, fl0, fr0, fl1, fr1, l, c);
        const g = ctrl.length / 2; fragGroup.push(g); groupComp.push(c);
        // pick the longest outline side as control location
        const sides = [];
        if (q === 0) sides.push([Math.hypot(fl1 - fl0, ry1 - ry0), 0.5 * (fl0 + fl1), 0.5 * (ry0 + ry1)]);
        if (q === tc.length - 2) sides.push([Math.hypot(fr1 - fr0, ry1 - ry0), 0.5 * (fr0 + fr1), 0.5 * (ry0 + ry1)]);
        if (rowBotOut) { const len = fr0 - fl0; if (uncovered(tops.get(key(l, y0)), fl0, fr0) > 0.5 * len) sides.push([len, 0.5 * (fl0 + fr0), ry0]); }
        if (rowTopOut) { const len = fr1 - fl1; if (uncovered(bots.get(key(l, y1)), fl1, fr1) > 0.5 * len) sides.push([len, 0.5 * (fl1 + fr1), ry1]); }
        if (sides.length) { sides.sort((p, s) => s[0] - p[0]); ctrl.push(sides[0][1], sides[0][2]); target.push(edgeTarget); kind.push(1); }
        else { const a = trapArea(out.t, (out.n - 1) * 6), cx = trapCentroid(out.t, (out.n - 1) * 6, a); ctrl.push(cx[0], cx[1]); target.push(interiorTarget); kind.push(0); }
      }
    }
  }
  const fr = out.trim();
  return { frags: fr, fragGroup: Int32Array.from(fragGroup), nGroups: ctrl.length / 2, ctrl: Float64Array.from(ctrl), target: Float64Array.from(target), kind: Uint8Array.from(kind), groupComp: Int32Array.from(groupComp) };
}

export function trapCentroid(t, o) {
  // split into two triangles + use polygon centroid formula on the 4 corners
  const P = [t[o + 2], t[o], t[o + 3], t[o], t[o + 5], t[o + 1], t[o + 4], t[o + 1]];
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8, cr = P[i] * P[j + 1] - P[j] * P[i + 1]; a += cr; cx += (P[i] + P[j]) * cr; cy += (P[i + 1] + P[j + 1]) * cr; }
  if (Math.abs(a) < 1e-12) return [0.25 * (P[0] + P[2] + P[4] + P[6]), 0.5 * (t[o] + t[o + 1])];
  return [cx / (3 * a), cy / (3 * a)];
}

// ── write-field tiling ───────────────────────────────────
// Splits figures at field boundaries. Returns {frags, fragGroup, fragField, fields:[{i,j,x0,y0,x1,y1}], order}
export function tileFields(frags, fragGroup, opts) {
  const { size, originMode = 'bbox', bbox, ox = 0, oy = 0 } = opts;
  let X0, Y0;
  if (originMode === 'origin') { X0 = Math.floor(bbox.x0 / size) * size; Y0 = Math.floor(bbox.y0 / size) * size; }
  else if (originMode === 'center') { const nx = Math.ceil((bbox.x1 - bbox.x0) / size), ny = Math.ceil((bbox.y1 - bbox.y0) / size); X0 = (bbox.x0 + bbox.x1) / 2 - nx * size / 2; Y0 = (bbox.y0 + bbox.y1) / 2 - ny * size / 2; }
  else if (originMode === 'custom') { X0 = ox + Math.floor((bbox.x0 - ox) / size) * size; Y0 = oy + Math.floor((bbox.y0 - oy) / size) * size; }
  else { X0 = bbox.x0; Y0 = bbox.y0; }
  const NX = Math.max(1, Math.ceil((bbox.x1 - X0) / size - 1e-9)), NY = Math.max(1, Math.ceil((bbox.y1 - Y0) / size - 1e-9));
  const out = new TrapBuf(frags.n + 64), grp = [], fld = [];
  const t = frags.t, E = 1e-6;
  const emit = (y0, y1, a, b, c, d, i) => {
    if (y1 - y0 <= E || (b - a <= E && d - c <= E)) return;
    const cx = 0.25 * (a + b + c + d), cy = 0.5 * (y0 + y1);
    const fi = Math.min(NX - 1, Math.max(0, Math.floor((cx - X0) / size))), fj = Math.min(NY - 1, Math.max(0, Math.floor((cy - Y0) / size)));
    out.push(y0, y1, a, b, c, d, frags.layer[i], frags.comp[i]); grp.push(fragGroup[i]); fld.push(fj * NX + fi);
  };
  for (let i = 0; i < frags.n; i++) {
    const o = i * 6, y0 = t[o], y1 = t[o + 1], xl0 = t[o + 2], xr0 = t[o + 3], xl1 = t[o + 4], xr1 = t[o + 5];
    // horizontal field lines
    const ys = [y0]; for (let k = Math.floor((y0 - Y0) / size) + 1; Y0 + k * size < y1 - E; k++) ys.push(Y0 + k * size);
    const xmin = Math.min(xl0, xl1), xmax = Math.max(xr0, xr1);
    const xs = []; for (let k = Math.floor((xmin - X0) / size) + 1; X0 + k * size < xmax - E; k++) xs.push(X0 + k * size);
    // side/vertical-line crossings add y cuts so every piece stays a trapezoid
    const H = y1 - y0;
    for (const c of xs) {
      for (const [a, b] of [[xl0, xl1], [xr0, xr1]]) if ((a - c) * (b - c) < 0) ys.push(y0 + H * (c - a) / (b - a));
    }
    ys.push(y1); ys.sort((p, q) => p - q);
    for (let r = 0; r + 1 < ys.length; r++) {
      const ya = ys[r], yb = ys[r + 1]; if (yb - ya <= E) continue;
      const fa = (ya - y0) / H, fb = (yb - y0) / H;
      const La = xl0 + (xl1 - xl0) * fa, Ra = xr0 + (xr1 - xr0) * fa, Lb = xl0 + (xl1 - xl0) * fb, Rb = xr0 + (xr1 - xr0) * fb;
      if (!xs.length) { emit(ya, yb, La, Ra, Lb, Rb, i); continue; }
      const bounds = [-Infinity, ...xs, Infinity];
      for (let k = 0; k + 1 < bounds.length; k++) {
        const c0 = bounds[k], c1 = bounds[k + 1];
        const a = Math.max(La, c0), b = Math.min(Ra, c1), c = Math.max(Lb, c0), d = Math.min(Rb, c1);
        if (b - a > -E && d - c > -E) emit(ya, yb, a, Math.max(a, b), c, Math.max(c, d), i);
      }
    }
  }
  const fields = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) fields.push({ i, j, x0: X0 + i * size, y0: Y0 + j * size, x1: X0 + (i + 1) * size, y1: Y0 + (j + 1) * size });
  // serpentine (meander) field order
  const order = []; for (let j = 0; j < NY; j++) { if (j % 2 === 0) for (let i = 0; i < NX; i++) order.push(j * NX + i); else for (let i = NX - 1; i >= 0; i--) order.push(j * NX + i); }
  return { frags: out.trim(), fragGroup: Int32Array.from(grp), fragField: Int32Array.from(fld), fields, order, NX, NY, X0, Y0, size };
}

// ── point-in-figures (for tests / hover) ─────────────────
export function trapContains(t, o, x, y) {
  if (y < t[o] || y > t[o + 1]) return false;
  const f = (y - t[o]) / ((t[o + 1] - t[o]) || 1);
  return x >= t[o + 2] + (t[o + 4] - t[o + 2]) * f && x <= t[o + 3] + (t[o + 5] - t[o + 3]) * f;
}
