// Structure analysis: what the pattern is made of, before any correction is applied.
//  · local width and distance to the outline, from chords in four directions (0°, 90°, ±45°; at most 8 % high)
//  · tight gaps between separate shapes (exact trapezoid-to-trapezoid distance)
//  · critical zones = narrow features or tight gaps: a field edge must never run through them
//  · devices = shapes closer than `keep` (they must stay aligned to each other) and repeats of identical devices
//  · fine / bulk pass: narrow parts and an outline sleeve need the fine beam; wide interiors can take a coarse one
// Stitch cost model (docs/soft-ebeam/RESEARCH.md §5.2): a field-to-field offset Δ (σ ≈ 20–30 nm) costs ∝ (Δ/w)² on a
// feature of width w, so a cut through a waveguide matters and a cut through a pad does not.
import { healAndFracture, trapArea } from './geom.js';

const R2 = Math.SQRT1_2;
// proper rotations only (det +1) so rings stay counter-clockwise; frame k turns direction k onto +x
const FRAMES = [[1, 0, 0, 1], [0, 1, -1, 0], [R2, R2, -R2, R2], [R2, -R2, R2, R2]];
export const CLS = { critical: 0, fine: 1, bulk: 2 };

// ── spatial grids ────────────────────────────────────────
// CSR uniform grid over boxes; boxes spanning more than maxCells cells go to a `big` list
function boxGrid(n, box, cs, maxCells = 256) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const b = new Float64Array(4);
  for (let i = 0; i < n; i++) { box(i, b); if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; }
  if (!n) { x0 = y0 = 0; x1 = y1 = 1; }
  while (((x1 - x0) / cs + 1) * ((y1 - y0) / cs + 1) > 4e6) cs *= 1.5;
  const GX = Math.floor((x1 - x0) / cs) + 1, GY = Math.floor((y1 - y0) / cs) + 1, cnt = new Int32Array(GX * GY + 1), big = [];
  const span = i => { box(i, b); return [Math.floor((b[0] - x0) / cs), Math.floor((b[1] - y0) / cs), Math.floor((b[2] - x0) / cs), Math.floor((b[3] - y0) / cs)]; };
  const isBig = s => (s[2] - s[0] + 1) * (s[3] - s[1] + 1) > maxCells;
  for (let i = 0; i < n; i++) { const s = span(i); if (isBig(s)) { big.push(i); continue; } for (let gy = s[1]; gy <= s[3]; gy++) for (let gx = s[0]; gx <= s[2]; gx++) cnt[gy * GX + gx + 1]++; }
  for (let c = 0; c < GX * GY; c++) cnt[c + 1] += cnt[c];
  const idx = new Int32Array(cnt[GX * GY]), fill = cnt.slice(0, GX * GY);
  for (let i = 0; i < n; i++) { const s = span(i); if (isBig(s)) continue; for (let gy = s[1]; gy <= s[3]; gy++) for (let gx = s[0]; gx <= s[2]; gx++) idx[fill[gy * GX + gx]++] = i; }
  return { x0, y0, cs, GX, GY, start: cnt, idx, big };
}
function gridVisit(g, x0, y0, x1, y1, cb) { // every entry whose cell overlaps the box (may repeat), then the big list
  const a0 = Math.max(0, Math.floor((x0 - g.x0) / g.cs)), a1 = Math.min(g.GX - 1, Math.floor((x1 - g.x0) / g.cs));
  const b0 = Math.max(0, Math.floor((y0 - g.y0) / g.cs)), b1 = Math.min(g.GY - 1, Math.floor((y1 - g.y0) / g.cs));
  for (let gy = b0; gy <= b1; gy++) for (let gx = a0; gx <= a1; gx++) { const c = gy * g.GX + gx; for (let k = g.start[c]; k < g.start[c + 1]; k++) cb(g.idx[k]); }
  for (const i of g.big) cb(i);
}

// point location in trapezoids
export class TrapIndex {
  constructor(tr) {
    const n = tr.n, t = tr.t; this.t = t;
    const ext = new Float64Array(n); let A = 0;
    for (let i = 0; i < n; i++) { const o = i * 6, w = Math.max(t[o + 3], t[o + 5]) - Math.min(t[o + 2], t[o + 4]), h = t[o + 1] - t[o]; ext[i] = Math.max(w, h); A += w * h; }
    const med = n ? ext.slice().sort()[n >> 1] : 1;
    this.g = boxGrid(n, (i, b) => { const o = i * 6; b[0] = Math.min(t[o + 2], t[o + 4]); b[1] = t[o]; b[2] = Math.max(t[o + 3], t[o + 5]); b[3] = t[o + 1]; }, Math.max(2 * med, Math.sqrt(A / Math.max(1, n)), 1e-3));
  }
  find(x, y) {
    const g = this.g, t = this.t, E = 1e-6, gx = Math.floor((x - g.x0) / g.cs), gy = Math.floor((y - g.y0) / g.cs);
    const inside = i => { const o = i * 6; if (y < t[o] - E || y > t[o + 1] + E) return false; const f = (y - t[o]) / ((t[o + 1] - t[o]) || 1); return x >= t[o + 2] + (t[o + 4] - t[o + 2]) * f - E && x <= t[o + 3] + (t[o + 5] - t[o + 3]) * f + E; };
    if (gx >= 0 && gy >= 0 && gx < g.GX && gy < g.GY) { const c = gy * g.GX + gx; for (let k = g.start[c]; k < g.start[c + 1]; k++) if (inside(g.idx[k])) return g.idx[k]; }
    for (const i of g.big) if (inside(i)) return i;
    return -1;
  }
}

// ── exact distances between trapezoids (convex quads, possibly triangles) ──
const quadPts = (t, o) => [t[o + 2], t[o], t[o + 3], t[o], t[o + 5], t[o + 1], t[o + 4], t[o + 1]];
function segD2(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let u = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; u = u < 0 ? 0 : u > 1 ? 1 : u; const ex = ax + u * dx - px, ey = ay + u * dy - py; return ex * ex + ey * ey; }
function inQuad(P, x, y) { for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8, ex = P[j] - P[i], ey = P[j + 1] - P[i + 1]; if (!ex && !ey) continue; if (ex * (y - P[i + 1]) - ey * (x - P[i]) < -1e-9 * (Math.abs(ex) + Math.abs(ey))) return false; } return true; }
function ptQuadDist(P, x, y) { if (inQuad(P, x, y)) return 0; let m = Infinity; for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8; m = Math.min(m, segD2(x, y, P[i], P[i + 1], P[j], P[j + 1])); } return Math.sqrt(m); }
// separate shapes never cross (they would have been merged), so the closest pair is always a vertex and an edge
function quadDist(P, Q) { let m = Infinity; for (let i = 0; i < 8 && m > 0; i += 2) m = Math.min(m, ptQuadDist(Q, P[i], P[i + 1]), ptQuadDist(P, Q[i], Q[i + 1])); return m; }

// ── main analysis ────────────────────────────────────────
// rings/ringLayer: healed input (CCW); traps/nComp: healAndFracture result; F: fragmentForPEC result
// opts: crit (critical width/gap), keep (devices: shapes closer than this belong together), fine (narrower → fine pass),
//       sleeve (outline band written with the fine beam)
export function analyzeStructure(rings, ringLayer, traps, nComp, F, opts = {}, progress = () => {}) {
  const { crit = 150, keep = 1000, fine = 3000, sleeve = 500, link = 1000 } = opts;
  const T0 = performance.now(), ms = () => Math.round(performance.now() - T0);
  // 1. chords. Horizontal: each figure's own trapezoid. Vertical: a 90° re-fracture. ±45°: only for shapes with slanted
  //    edges (on Manhattan shapes diagonals add nothing but false short chords at corners).
  const tt = traps.t, nt = traps.n, slanted = new Uint8Array(nComp); let nSl = 0;
  for (let i = 0; i < nt; i++) { const o = i * 6; if ((tt[o + 2] !== tt[o + 4] || tt[o + 3] !== tt[o + 5]) && !slanted[traps.comp[i]]) { slanted[traps.comp[i]] = 1; nSl++; } }
  const rotRings = (k, src) => { const [a, b, c, d] = FRAMES[k]; return src.map(r => { const q = new Float64Array(r.length); for (let i = 0; i < r.length; i += 2) { q[i] = a * r[i] + b * r[i + 1]; q[i + 1] = c * r[i] + d * r[i + 1]; } return q; }); };
  const IDX = [new TrapIndex(traps)];
  progress({ label: 'Analyze: vertical chords' }); IDX[1] = new TrapIndex(healAndFracture(rotRings(1, rings), ringLayer).traps);
  if (nSl) {
    let src = rings, srcL = ringLayer;
    if (nSl < 0.5 * nComp) { src = []; srcL = []; for (let i = 0; i < nt; i++) if (slanted[traps.comp[i]]) { const o = i * 6; src.push(Float64Array.of(tt[o + 2], tt[o], tt[o + 3], tt[o], tt[o + 5], tt[o + 1], tt[o + 4], tt[o + 1])); srcL.push(traps.layer[i]); } }
    for (const k of [2, 3]) { progress({ label: `Analyze: diagonal chords ${k === 2 ? '+45°' : '−45°'}` }); IDX[k] = new TrapIndex(healAndFracture(rotRings(k, src), srcL).traps); }
  }
  // out = [width (shortest chord), distance to the outline, width from the axis chords only]
  const probe = (x, y, out, trap = -1) => {
    let w = Infinity, e = Infinity, comp = -1;
    const i0 = trap >= 0 ? trap : IDX[0].find(x, y);
    if (i0 >= 0) { const o = i0 * 6, f = (y - tt[o]) / ((tt[o + 1] - tt[o]) || 1), xl = tt[o + 2] + (tt[o + 4] - tt[o + 2]) * f, xr = tt[o + 3] + (tt[o + 5] - tt[o + 3]) * f; w = xr - xl; e = Math.min(x - xl, xr - x); comp = traps.comp[i0]; }
    for (let k = 1; k < 4; k++) {
      if (k === 2) { out[2] = w; if (!IDX[2] || (comp >= 0 && !slanted[comp])) break; }
      const [a, b, c, d] = FRAMES[k], X = a * x + b * y, Y = c * x + d * y, ix = IDX[k], i = ix.find(X, Y); if (i < 0) continue;
      const o = i * 6, t = ix.t, f = (Y - t[o]) / ((t[o + 1] - t[o]) || 1), xl = t[o + 2] + (t[o + 4] - t[o + 2]) * f, xr = t[o + 3] + (t[o + 5] - t[o + 3]) * f;
      if (xr - xl < w) w = xr - xl; e = Math.min(e, X - xl, xr - X);
    }
    if (!IDX[2] || (comp >= 0 && !slanted[comp])) out[2] = w;
    out[0] = w; out[1] = Math.max(0, e); return out;
  };
  const tmp = new Float64Array(3), widthAt = (x, y) => probe(x, y, tmp)[0];
  // 2. per-figure width and outline distance
  progress({ label: 'Analyze: local width' });
  const fr = F.frags, n = fr.n, ft = fr.t, width = new Float32Array(n), dEdge = new Float32Array(n), ftrap = F.fragTrap;
  for (let i = 0; i < n; i++) {
    const o = i * 6, cx = 0.25 * (ft[o + 2] + ft[o + 3] + ft[o + 4] + ft[o + 5]), cy = 0.5 * (ft[o] + ft[o + 1]);
    probe(cx, cy, tmp, ftrap ? ftrap[i] : -1);
    if (isFinite(tmp[0])) { width[i] = tmp[0]; dEdge[i] = tmp[1]; } else { width[i] = Math.min(ft[o + 1] - ft[o], Math.max(ft[o + 3] - ft[o + 2], ft[o + 5] - ft[o + 4])); dEdge[i] = 0; }
    // A diagonal chord is short across every convex corner, even on a wide pad. When only a diagonal says "narrow", the
    // feature counts as narrow only if no deep interior is close by: thickness = 2 × the largest outline distance
    // within crit of the point.
    if (width[i] < crit && tmp[2] >= crit) {
      let R = dEdge[i];
      for (const r of [0.25, 0.5, 1]) for (let k = 0; k < 8; k++) { probe(cx + r * crit * Math.cos(k * Math.PI / 4), cy + r * crit * Math.sin(k * Math.PI / 4), tmp); if (isFinite(tmp[0])) R = Math.max(R, tmp[1]); }
      width[i] = Math.max(width[i], Math.min(2 * R, fine));
    }
  }
  // 3. separate shapes close to each other: devices (< keep) and critical gaps (< crit, same layer)
  progress({ label: 'Analyze: gaps between shapes' });
  const cb = new Float64Array(nComp * 4).fill(NaN);
  for (let i = 0; i < nt; i++) { const o = i * 6, c = traps.comp[i] * 4, x0 = Math.min(tt[o + 2], tt[o + 4]), x1 = Math.max(tt[o + 3], tt[o + 5]); if (isNaN(cb[c])) { cb[c] = x0; cb[c + 1] = tt[o]; cb[c + 2] = x1; cb[c + 3] = tt[o + 1]; } else { cb[c] = Math.min(cb[c], x0); cb[c + 1] = Math.min(cb[c + 1], tt[o]); cb[c + 2] = Math.max(cb[c + 2], x1); cb[c + 3] = Math.max(cb[c + 3], tt[o + 1]); } }
  const dsu = Int32Array.from({ length: nComp }, (_, i) => i), find = a => { while (dsu[a] !== a) a = dsu[a] = dsu[dsu[a]]; return a; };
  const bi = new Float64Array(4), bj = new Float64Array(4);
  // devices: shapes whose bounding boxes come closer than `keep` (component level, so dense text stays cheap)
  { const h = keep / 2, cg = boxGrid(nComp, (c, b) => { b[0] = cb[4 * c] - h; b[1] = cb[4 * c + 1] - h; b[2] = cb[4 * c + 2] + h; b[3] = cb[4 * c + 3] + h; }, 2 * keep);
    const near = (c, d) => Math.hypot(Math.max(0, cb[4 * d] - cb[4 * c + 2], cb[4 * c] - cb[4 * d + 2]), Math.max(0, cb[4 * d + 1] - cb[4 * c + 3], cb[4 * c + 1] - cb[4 * d + 3])) < keep;
    for (let k = 0; k < cg.GX * cg.GY; k++) for (let p = cg.start[k]; p < cg.start[k + 1]; p++) for (let r = p + 1; r < cg.start[k + 1]; r++) { const c = cg.idx[p], d = cg.idx[r]; if (find(c) !== find(d) && near(c, d)) dsu[find(c)] = find(d); }
    for (const c of cg.big) for (let d = 0; d < nComp; d++) if (d !== c && !isNaN(cb[4 * d]) && find(c) !== find(d) && near(c, d)) dsu[find(c)] = find(d); }
  // critical gaps: trapezoid pairs of different shapes (same layer) closer than crit, exact distance
  const hc = crit / 2, TB = new Float64Array(nt * 4);
  for (let i = 0; i < nt; i++) { const o = i * 6; TB[4 * i] = Math.min(tt[o + 2], tt[o + 4]) - hc; TB[4 * i + 1] = tt[o] - hc; TB[4 * i + 2] = Math.max(tt[o + 3], tt[o + 5]) + hc; TB[4 * i + 3] = tt[o + 1] + hc; }
  const G = boxGrid(nt, (i, b) => { b[0] = TB[4 * i]; b[1] = TB[4 * i + 1]; b[2] = TB[4 * i + 2]; b[3] = TB[4 * i + 3]; }, Math.max(IDX[0].g.cs, 4 * crit));
  // critical marks accumulate on a square grid (q ≈ 250 nm): memory bounded by area, clustering by neighbour lookup.
  // Each square keeps the true extent of what marked it, so zone boxes stay tight. Only touching marks form one zone:
  // separate narrow features further apart than ~q are separate zones (a field edge between them cuts nothing).
  const q = Math.max(crit, 250), SQ = new Map(); let nsq = 0, cap = 1024;
  let sqK = new Uint8Array(cap), sqW = new Float32Array(cap), sqG = new Float32Array(cap), sqA = new Float64Array(cap), sqC = new Int32Array(cap), sqB = new Float64Array(cap * 4);
  const growSq = () => { cap *= 2; const k = new Uint8Array(cap); k.set(sqK); sqK = k; const w = new Float32Array(cap); w.set(sqW); sqW = w; const g = new Float32Array(cap); g.set(sqG); sqG = g; const ar = new Float64Array(cap); ar.set(sqA); sqA = ar; const c = new Int32Array(cap); c.set(sqC); sqC = c; const bb = new Float64Array(cap * 4); bb.set(sqB); sqB = bb; };
  const sqKey = (gx, gy) => (gx + 1048576) * 2097152 + (gy + 1048576);
  const mark = (x0, y0, x1, y1, kind, val, area, comp) => {
    const a0 = Math.floor(x0 / q), a1 = Math.floor(x1 / q), b0 = Math.floor(y0 / q), b1 = Math.floor(y1 / q), share = area / ((a1 - a0 + 1) * (b1 - b0 + 1));
    for (let gx = a0; gx <= a1; gx++) for (let gy = b0; gy <= b1; gy++) {
      const key = sqKey(gx, gy); let k = SQ.get(key);
      if (k === undefined) { if (nsq >= cap) growSq(); k = nsq++; SQ.set(key, k); sqW[k] = sqG[k] = Infinity; sqC[k] = comp; sqB[4 * k] = sqB[4 * k + 1] = Infinity; sqB[4 * k + 2] = sqB[4 * k + 3] = -Infinity; }
      sqK[k] |= kind; if (kind === 1) { sqW[k] = Math.min(sqW[k], val); sqA[k] += share; } else sqG[k] = Math.min(sqG[k], val);
      sqB[4 * k] = Math.min(sqB[4 * k], Math.max(x0, gx * q)); sqB[4 * k + 1] = Math.min(sqB[4 * k + 1], Math.max(y0, gy * q)); sqB[4 * k + 2] = Math.max(sqB[4 * k + 2], Math.min(x1, (gx + 1) * q)); sqB[4 * k + 3] = Math.max(sqB[4 * k + 3], Math.min(y1, (gy + 1) * q));
    }
  };
  let minGap = Infinity, pairs = 0;
  const sampleGap = (P, Q, comp) => { // stretches of P's boundary closer than crit to Q, as cells ≤ link long
    for (let e = 0; e < 8; e += 2) {
      const f = (e + 2) % 8, L = Math.hypot(P[f] - P[e], P[f + 1] - P[e + 1]); if (!(L > 0)) continue;
      const m = Math.min(4000, Math.max(1, Math.ceil(L / hc))), per = Math.max(1, Math.floor(q / (L / m)));
      let run = null; const flush = () => { if (run) { mark(run[0] - hc, run[1] - hc, run[2] + hc, run[3] + hc, 2, run[4], 0, comp); run = null; } };
      for (let s = 0; s <= m; s++) {
        const x = P[e] + (P[f] - P[e]) * s / m, y = P[e + 1] + (P[f + 1] - P[e + 1]) * s / m, d = ptQuadDist(Q, x, y);
        if (d < crit) { if (!run) run = [x, y, x, y, d, 0]; else { run[0] = Math.min(run[0], x); run[1] = Math.min(run[1], y); run[2] = Math.max(run[2], x); run[3] = Math.max(run[3], y); run[4] = Math.min(run[4], d); } if (++run[5] >= per) flush(); }
        else flush();
      }
      flush();
    }
  };
  const pair = (i, j) => {
    const ci = traps.comp[i], cj = traps.comp[j]; if (ci === cj || traps.layer[i] !== traps.layer[j]) return;
    const i4 = 4 * i, j4 = 4 * j; if (TB[i4] > TB[j4 + 2] || TB[j4] > TB[i4 + 2] || TB[i4 + 1] > TB[j4 + 3] || TB[j4 + 1] > TB[i4 + 3]) return;
    const P = quadPts(tt, i * 6), Q = quadPts(tt, j * 6), d = quadDist(P, Q); pairs++;
    if (!(d < crit)) return;
    minGap = Math.min(minGap, d);
    // the overlap of the two boxes grown by crit/2 is the gap strip itself when it is thin (slab trapezoids, facing
    // pads); only large slanted pairs need their boundaries sampled
    const x0 = Math.max(TB[i4], TB[j4]), y0 = Math.max(TB[i4 + 1], TB[j4 + 1]), x1 = Math.min(TB[i4 + 2], TB[j4 + 2]), y1 = Math.min(TB[i4 + 3], TB[j4 + 3]);
    if (Math.min(x1 - x0, y1 - y0) <= 3 * crit) mark(x0, y0, x1, y1, 2, d, 0, ci);
    else { sampleGap(P, Q, ci); sampleGap(Q, P, cj); }
  };
  // each pair once: in the cell holding the lower-left corner of the two boxes' overlap
  for (let c = 0; c < G.GX * G.GY; c++) {
    const a = G.start[c], z = G.start[c + 1]; if (z - a < 2) continue;
    const gx = c % G.GX, gy = (c - gx) / G.GX;
    for (let p = a; p < z; p++) { const i = G.idx[p], ci = traps.comp[i], i4 = 4 * i; for (let r = p + 1; r < z; r++) {
      const j = G.idx[r]; if (traps.comp[j] === ci) continue; const j4 = 4 * j;
      if (TB[i4] > TB[j4 + 2] || TB[j4] > TB[i4 + 2] || TB[i4 + 1] > TB[j4 + 3] || TB[j4 + 1] > TB[i4 + 3]) continue;
      if (Math.floor((Math.max(TB[i4], TB[j4]) - G.x0) / G.cs) !== gx || Math.floor((Math.max(TB[i4 + 1], TB[j4 + 1]) - G.y0) / G.cs) !== gy) continue;
      pair(i, j);
    } }
  }
  if (G.big.length) { const isBig = new Uint8Array(nt); for (const i of G.big) isBig[i] = 1; for (const i of G.big) for (let j = 0; j < nt; j++) if (j !== i && (!isBig[j] || j > i)) pair(i, j); }
  // 4. narrow features mark the grid too
  for (let i = 0; i < n; i++) if (width[i] < crit) { const o = i * 6; mark(Math.min(ft[o + 2], ft[o + 4]), ft[o], Math.max(ft[o + 3], ft[o + 5]), ft[o + 1], 1, width[i], trapArea(ft, o), fr.comp[i]); }
  // 5. critical zones: 8-connected marked squares
  progress({ label: 'Analyze: critical zones' });
  const zp = Int32Array.from({ length: nsq }, (_, i) => i), zf = a => { while (zp[a] !== a) a = zp[a] = zp[zp[a]]; return a; };
  for (const [key, k] of SQ) { const gx = Math.floor(key / 2097152) - 1048576, gy = key % 2097152 - 1048576;
    for (let dx = 0; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && dy <= 0) continue; const j = SQ.get(sqKey(gx + dx, gy + dy)); if (j !== undefined) { const r1 = zf(k), r2 = zf(j); if (r1 !== r2) zp[r1] = r2; } } }
  // a zone made only of narrow figures with almost no area is a drawing artefact (a few-nm jog or spike), not a feature
  const rootKind = new Map(), rootArea = new Map();
  for (let k = 0; k < nsq; k++) { const r = zf(k); rootKind.set(r, (rootKind.get(r) || 0) | sqK[k]); rootArea.set(r, (rootArea.get(r) || 0) + sqA[k]); }
  const minArea = (crit / 2) ** 2, zid = new Map(), sqZone = new Int32Array(nsq).fill(-1), zb = [], zinfo = []; let slivers = 0, minWidth = Infinity;
  for (const [r, k] of rootKind) if (k === 1 && rootArea.get(r) < minArea) { zid.set(r, -1); slivers++; }
  for (let k = 0; k < nsq; k++) {
    const r = zf(k); let z = zid.get(r); if (z === -1) continue;
    if (z === undefined) { z = zb.length / 4; zid.set(r, z); zb.push(Infinity, Infinity, -Infinity, -Infinity); zinfo.push({ kind: 0, minW: Infinity, minG: Infinity, comp: sqC[k], cells: 0 }); }
    sqZone[k] = z; const o = 4 * z; zb[o] = Math.min(zb[o], sqB[4 * k]); zb[o + 1] = Math.min(zb[o + 1], sqB[4 * k + 1]); zb[o + 2] = Math.max(zb[o + 2], sqB[4 * k + 2]); zb[o + 3] = Math.max(zb[o + 3], sqB[4 * k + 3]);
    const zi = zinfo[z]; zi.kind |= sqK[k]; zi.cells++; zi.minW = Math.min(zi.minW, sqW[k]); zi.minG = Math.min(zi.minG, sqG[k]); if (sqK[k] & 1) minWidth = Math.min(minWidth, sqW[k]);
  }
  const zones = Float64Array.from(zb), nz = zinfo.length;
  // zones touched by a box (against the marked extents of the squares it overlaps)
  const zonesIn = (x0, y0, x1, y1, cbz) => {
    const a0 = Math.floor(x0 / q), a1 = Math.floor(x1 / q), b0 = Math.floor(y0 / q), b1 = Math.floor(y1 / q); if (!nsq || (a1 - a0 + 1) * (b1 - b0 + 1) > 4096) return;
    for (let gx = a0; gx <= a1; gx++) for (let gy = b0; gy <= b1; gy++) { const k = SQ.get(sqKey(gx, gy)); if (k === undefined || sqZone[k] < 0) continue; if (sqB[4 * k] <= x1 && sqB[4 * k + 2] >= x0 && sqB[4 * k + 1] <= y1 && sqB[4 * k + 3] >= y0) cbz(sqZone[k], sqK[k]); }
  };
  // 6. devices and repeats
  progress({ label: 'Analyze: devices and repeats' });
  const devComp = new Int32Array(nComp), dmap = new Map(); for (let c = 0; c < nComp; c++) { const r = find(c); let d = dmap.get(r); if (d === undefined) { d = dmap.size; dmap.set(r, d); } devComp[c] = d; }
  const nd = dmap.size, devBox = new Float64Array(nd * 4); for (let d = 0; d < nd; d++) { devBox[4 * d] = devBox[4 * d + 1] = Infinity; devBox[4 * d + 2] = devBox[4 * d + 3] = -Infinity; }
  for (let c = 0; c < nComp; c++) { if (isNaN(cb[4 * c])) continue; const q = 4 * devComp[c]; devBox[q] = Math.min(devBox[q], cb[4 * c]); devBox[q + 1] = Math.min(devBox[q + 1], cb[4 * c + 1]); devBox[q + 2] = Math.max(devBox[q + 2], cb[4 * c + 2]); devBox[q + 3] = Math.max(devBox[q + 3], cb[4 * c + 3]); }
  // geometry signature per device: its trapezoids relative to the device corner at 1 pm (coarser rounding flips on the
  // quarter-nm values slanted edges produce), two 32-bit hashes over the low and high parts of each value
  const devTraps = Array.from({ length: nd }, () => []); for (let i = 0; i < nt; i++) devTraps[devComp[traps.comp[i]]].push(i);
  const types = [], typeOf = new Map(), devType = new Int32Array(nd);
  for (let d = 0; d < nd; d++) {
    const X0 = devBox[4 * d], Y0 = devBox[4 * d + 1], pm = v => Math.round(v * 1000), L = devTraps[d].map(i => { const o = i * 6; return [pm(tt[o] - Y0), pm(tt[o + 2] - X0), pm(tt[o + 1] - Y0), pm(tt[o + 3] - X0), pm(tt[o + 4] - X0), pm(tt[o + 5] - X0), traps.layer[i]]; });
    L.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
    let h1 = 2166136261, h2 = 5381; for (const r of L) for (const v of r) { const lo = v % 1073741824, hi = Math.floor(v / 1073741824); h1 = Math.imul(h1 ^ lo, 16777619) >>> 0; h1 = Math.imul(h1 ^ hi, 16777619) >>> 0; h2 = (Math.imul(h2, 33) + lo) >>> 0; h2 = (Math.imul(h2, 33) + hi) >>> 0; }
    const key = `${h1}:${h2}:${L.length}`; let ty = typeOf.get(key);
    if (ty === undefined) { ty = types.length; typeOf.set(key, ty); types.push({ n: 0, rep: d, w: devBox[4 * d + 2] - X0, h: devBox[4 * d + 3] - Y0, zones: 0 }); }
    types[ty].n++; devType[d] = ty;
  }
  const zoneDev = new Int32Array(nz); for (let z = 0; z < nz; z++) { zoneDev[z] = devComp[zinfo[z].comp]; if (types[devType[zoneDev[z]]].rep === zoneDev[z]) types[devType[zoneDev[z]]].zones++; }
  // 7. classes: critical (narrow, or at a tight gap) → fine (narrower than `fine`, or within `sleeve` of the outline) → bulk
  progress({ label: 'Analyze: passes' });
  const artefact = i => { const o = i * 6; let kept = false; zonesIn(Math.min(ft[o + 2], ft[o + 4]), ft[o], Math.max(ft[o + 3], ft[o + 5]), ft[o + 1], () => { kept = true; }); return !kept; };
  const cls = new Uint8Array(n), areas = [0, 0, 0], counts = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    // bulk only when the WHOLE figure is a sleeve inside the outline. The distance to the outline changes by at most
    // 1 nm per nm, so a figure whose centre is further in than sleeve + half its diagonal is surely bulk; borderline
    // figures are decided by their corners (pulled 1 nm inwards)
    const o6 = i * 6, hd = 0.5 * Math.hypot(ft[o6 + 1] - ft[o6], Math.max(ft[o6 + 3], ft[o6 + 5]) - Math.min(ft[o6 + 2], ft[o6 + 4])), sl = 0.99 * sleeve;
    let c = width[i] < crit && !artefact(i) ? 0 : (width[i] < fine || dEdge[i] < sl) ? 1 : 2;
    if (c === 2 && dEdge[i] - hd < sl) {
      const cx = 0.25 * (ft[o6 + 2] + ft[o6 + 3] + ft[o6 + 4] + ft[o6 + 5]), cy = 0.5 * (ft[o6] + ft[o6 + 1]);
      const pts = [ft[o6 + 2], ft[o6], ft[o6 + 3], ft[o6], ft[o6 + 5], ft[o6 + 1], ft[o6 + 4], ft[o6 + 1]];
      for (let k = 0; k < 8 && c === 2; k += 2) { const x = pts[k], y = pts[k + 1], l = Math.hypot(cx - x, cy - y) || 1; probe(x + (cx - x) / l, y + (cy - y) / l, tmp); if (isFinite(tmp[0]) && tmp[1] < sl) c = 1; }
    }
    if (c && dEdge[i] < crit) { const o = i * 6; let gap = false; zonesIn(Math.min(ft[o + 2], ft[o + 4]), ft[o], Math.max(ft[o + 3], ft[o + 5]), ft[o + 1], (z, k) => { if (k === 2) gap = true; }); if (gap) c = 0; }
    cls[i] = c; const a = trapArea(ft, i * 6); areas[c] += a; counts[c]++;
  }
  const groupCls = new Uint8Array(F.nGroups).fill(2); for (let i = 0; i < n; i++) { const g = F.fragGroup[i]; if (cls[i] < groupCls[g]) groupCls[g] = cls[i]; }
  let maxDev = 0; for (let d = 0; d < nd; d++) maxDev = Math.max(maxDev, devBox[4 * d + 2] - devBox[4 * d], devBox[4 * d + 3] - devBox[4 * d + 1]);
  return { crit, keep, fine, sleeve, widthAt, zonesIn, zones, zinfo, nz, zoneDev, devComp, devBox, devType, nDev: nd, types, cls, groupCls, width, dEdge, areas, counts, minGap, minWidth, maxDev, pairs, slivers, ms: ms() };
}

// ── stitch weighting ─────────────────────────────────────
// weight of cutting a figure: 1 for anything ≤ 1 µm wide, (1 µm / w)² above (≈1e-4 through an 88 µm pad)
export const STITCH_REF = 1000;
export function cutWeight(an, frags) {
  const t = frags.t; return i => { const o = i * 6, w = an.widthAt(0.25 * (t[o + 2] + t[o + 3] + t[o + 4] + t[o + 5]), 0.5 * (t[o] + t[o + 1])); return isFinite(w) && w > STITCH_REF ? (STITCH_REF / w) ** 2 : 1; };
}
// critical zones whose figures ended up in more than one field (a field edge runs through them)
export function zonesSplit(an, frags, fragField) {
  const zf = new Int32Array(an.nz).fill(-1), split = new Uint8Array(an.nz), t = frags.t; let k = 0;
  for (let i = 0; i < frags.n; i++) { const o = i * 6, f = fragField[i]; an.zonesIn(Math.min(t[o + 2], t[o + 4]), t[o], Math.max(t[o + 3], t[o + 5]), t[o + 1], z => { if (zf[z] < 0) zf[z] = f; else if (zf[z] !== f && !split[z]) { split[z] = 1; k++; } }); }
  const pts = []; for (let z = 0; z < an.nz; z++) if (split[z]) pts.push((an.zones[4 * z] + an.zones[4 * z + 2]) / 2, (an.zones[4 * z + 1] + an.zones[4 * z + 3]) / 2);
  return { n: k, pts: Float64Array.from(pts) };
}
