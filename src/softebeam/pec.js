// Proximity effect correction + exposure simulation.
// Energy model: E(x) = Σ_f D_g(f) ∫_f PSF(x − x') dA',  PSF = Σ_t w_t G(·; s_t) / Σ w_t   (G normalised, s = 1/e radius)
// A large uniformly exposed area at dose 1 therefore receives E = 1; its edge receives ≈ 0.5.
// Each dose group has a control point and a target (0.5 on outline edges, 1.0 inside large areas).
import { trapArea, trapCentroid } from './geom.js';

export function erf(x) { // Abramowitz & Stegun 7.1.26, |ε| ≤ 1.5e-7
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}

// ∫ over trapezoid (t,o) of exp(−r²/s²)/(π s²) centred at (x,y)
export function gaussTrap(t, o, x, y, s) {
  const y0 = t[o], y1 = t[o + 1], R = 4.5 * s;
  const ya = Math.max(y0, y - R), yb = Math.min(y1, y + R); if (yb <= ya) return 0;
  const xl0 = t[o + 2], xr0 = t[o + 3], xl1 = t[o + 4], xr1 = t[o + 5];
  if (xl0 === xl1 && xr0 === xr1) {
    if (xr0 < x - R || xl0 > x + R) return 0;
    return 0.25 * (erf((xr0 - x) / s) - erf((xl0 - x) / s)) * (erf((yb - y) / s) - erf((ya - y) / s));
  }
  const H = y1 - y0, n = Math.min(64, Math.max(1, Math.ceil((yb - ya) / (0.4 * s))));
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const a = ya + (yb - ya) * k / n, b = ya + (yb - ya) * (k + 1) / n, f = (0.5 * (a + b) - y0) / H;
    const xl = xl0 + (xl1 - xl0) * f, xr = xr0 + (xr1 - xr0) * f;
    if (xr < x - R || xl > x + R || xr <= xl) continue;
    sum += 0.25 * (erf((xr - x) / s) - erf((xl - x) / s)) * (erf((b - y) / s) - erf((a - y) / s));
  }
  return sum;
}

function fragsBBox(fr) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const t = fr.t;
  for (let i = 0; i < fr.n; i++) { const o = i * 6; x0 = Math.min(x0, t[o + 2], t[o + 4]); x1 = Math.max(x1, t[o + 3], t[o + 5]); y0 = Math.min(y0, t[o]); y1 = Math.max(y1, t[o + 1]); }
  return { x0, y0, x1, y1 };
}

// ── short-range: sparse matrix rows = control points, cols = dose groups ──
function buildShortMatrix(fr, fragGroup, nGroups, ctrl, terms, onProgress) {
  const rowPtr = new Int32Array(nGroups + 1); if (!terms.length) return { rowPtr, col: new Int32Array(0), val: new Float64Array(0) };
  const sMax = Math.max(...terms.map(t => t.s)), R = 4.5 * sMax, t = fr.t;
  let sz = 0; for (let i = 0; i < fr.n; i++) { const o = i * 6; sz += Math.max(t[o + 1] - t[o], Math.max(t[o + 3], t[o + 5]) - Math.min(t[o + 2], t[o + 4])); }
  const cs = Math.max(2 * R, 2 * sz / Math.max(1, fr.n));
  const grid = new Map(), big = [];
  for (let i = 0; i < fr.n; i++) {
    const o = i * 6, gx0 = Math.floor((Math.min(t[o + 2], t[o + 4]) - R) / cs), gx1 = Math.floor((Math.max(t[o + 3], t[o + 5]) + R) / cs), gy0 = Math.floor((t[o] - R) / cs), gy1 = Math.floor((t[o + 1] + R) / cs);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 64) { big.push(i); continue; }
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const k = gx * 1048576 + gy; let L = grid.get(k); if (!L) grid.set(k, L = []); L.push(i); }
  }
  const acc = new Float64Array(nGroups), touched = new Int32Array(nGroups), mark = new Uint8Array(nGroups);
  const cols = [], vals = [];
  for (let g = 0; g < nGroups; g++) {
    const x = ctrl[2 * g], y = ctrl[2 * g + 1];
    const L = grid.get(Math.floor(x / cs) * 1048576 + Math.floor(y / cs)) || [];
    let nt = 0;
    const visit = i => {
      const o = i * 6; if (t[o] > y + R || t[o + 1] < y - R) return;
      let v = 0; for (const tm of terms) v += tm.w * gaussTrap(t, o, x, y, tm.s);
      if (v <= 1e-12) return; const c = fragGroup[i];
      if (!mark[c]) { mark[c] = 1; touched[nt++] = c; } acc[c] += v;
    };
    for (const i of L) visit(i); for (const i of big) visit(i);
    rowPtr[g + 1] = rowPtr[g] + nt;
    for (let k = 0; k < nt; k++) { const c = touched[k]; cols.push(c); vals.push(acc[c]); acc[c] = 0; mark[c] = 0; }
    if (onProgress && g % 5000 === 0) onProgress(g / nGroups);
  }
  return { rowPtr, col: Int32Array.from(cols), val: Float64Array.from(vals) };
}

// ── long-range: one coarse grid per Gaussian term (pitch s/4), separable convolution ──
export class TermGrid {
  constructor(bbox, s, maxCells) {
    this.s = s; let h = s / 4;
    const W = bbox.x1 - bbox.x0, H = bbox.y1 - bbox.y0;
    if ((W / h + 2) * (H / h + 2) > maxCells) h = Math.sqrt(W * H / maxCells) * 1.02 + 1e-9;
    this.h = h; this.x0 = bbox.x0 - h; this.y0 = bbox.y0 - h;
    this.nx = Math.ceil(W / h) + 3; this.ny = Math.ceil(H / h) + 3;
    this.a = new Float64Array(this.nx * this.ny); this.b = new Float64Array(this.nx * this.ny);
    const K = Math.max(1, Math.ceil(3.2 * s / h)), k = new Float64Array(2 * K + 1); let S = 0;
    for (let j = -K; j <= K; j++) { k[j + K] = Math.exp(-((j * h) ** 2) / (s * s)); S += k[j + K]; }
    for (let j = 0; j < k.length; j++) k[j] /= S; this.k = k; this.K = K;
  }
  get coarse() { return this.h > this.s / 1.5; }
  clear() { this.a.fill(0); }
  addPoint(x, y, q) {
    const fx = (x - this.x0) / this.h, fy = (y - this.y0) / this.h, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy, nx = this.nx, a = this.a;
    const p = iy * nx + ix; a[p] += q * (1 - u) * (1 - v); a[p + 1] += q * u * (1 - v); a[p + nx] += q * (1 - u) * v; a[p + nx + 1] += q * u * v;
  }
  splat(fr, fragGroup, D) {
    const t = fr.t, half = this.h / 2;
    for (let i = 0; i < fr.n; i++) {
      const o = i * 6, d = D[fragGroup[i]]; if (!d) continue;
      const y0 = t[o], y1 = t[o + 1], H = y1 - y0, wmax = Math.max(t[o + 3] - t[o + 2], t[o + 5] - t[o + 4]);
      const ny = Math.min(256, Math.max(1, Math.ceil(H / half))), nx = Math.min(256, Math.max(1, Math.ceil(wmax / half)));
      if (nx === 1 && ny === 1) { const A = trapArea(t, o); if (A <= 0) continue; const c = trapCentroid(t, o, A); this.addPoint(c[0], c[1], A * d); continue; }
      for (let r = 0; r < ny; r++) {
        const ya = y0 + H * r / ny, yb = y0 + H * (r + 1) / ny, fm = (0.5 * (ya + yb) - y0) / (H || 1);
        const xl = t[o + 2] + (t[o + 4] - t[o + 2]) * fm, xr = t[o + 3] + (t[o + 5] - t[o + 3]) * fm, w = (xr - xl) / nx, ym = 0.5 * (ya + yb);
        if (w <= 0) continue; const q = w * (yb - ya) * d;
        for (let c = 0; c < nx; c++) this.addPoint(xl + w * (c + 0.5), ym, q);
      }
    }
  }
  convolve() {
    const { nx, ny, a, b, k, K } = this;
    for (let y = 0; y < ny; y++) { const r = y * nx; for (let x = 0; x < nx; x++) { let s = 0; const j0 = Math.max(-K, -x), j1 = Math.min(K, nx - 1 - x); for (let j = j0; j <= j1; j++) s += a[r + x + j] * k[j + K]; b[r + x] = s; } }
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { let s = 0; const j0 = Math.max(-K, -y), j1 = Math.min(K, ny - 1 - y); for (let j = j0; j <= j1; j++) s += b[(y + j) * nx + x] * k[j + K]; a[y * nx + x] = s; }
    const inv = 1 / (this.h * this.h); for (let i = 0; i < a.length; i++) a[i] *= inv;
  }
  sample(x, y) {
    const fx = (x - this.x0) / this.h, fy = (y - this.y0) / this.h; let ix = Math.floor(fx), iy = Math.floor(fy);
    ix = Math.max(0, Math.min(this.nx - 2, ix)); iy = Math.max(0, Math.min(this.ny - 2, iy));
    const u = Math.min(1, Math.max(0, fx - ix)), v = Math.min(1, Math.max(0, fy - iy)), p = iy * this.nx + ix, a = this.a, nx = this.nx;
    return a[p] * (1 - u) * (1 - v) + a[p + 1] * u * (1 - v) + a[p + nx] * (1 - u) * v + a[p + nx + 1] * u * v;
  }
}

// split PSF terms: raster where a s/4 grid fits and s is not tiny vs the fragments; analytic otherwise
export function planTerms(psf, bbox, { maxCells = 2e6, fragMax = 1000 } = {}) {
  let W = 0; for (const t of psf.terms) W += t.w;
  const area = Math.max(1, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0));
  const short = [], long = [];
  for (const t of psf.terms) {
    const cells = area / ((t.s / 4) ** 2);
    if (t.s >= 0.75 * fragMax && cells <= maxCells) long.push({ s: t.s, w: t.w / W });
    else if (t.s >= 4 * fragMax) long.push({ s: t.s, w: t.w / W, coarse: true }); // too big to keep analytic: accept coarser grid
    else short.push({ s: t.s, w: t.w / W });
  }
  return { short, long };
}

// ── main solver ──────────────────────────────────────────
// F = {frags, fragGroup, nGroups, ctrl, target}; returns {dose, energy, iters, maxErr, rmsErr, history, plan}
export function runPEC(F, psf, opts = {}, onProgress = () => {}) {
  const { maxIter = 50, tol = 0.01, omega = 1, dMin = 0.05, dMax = 20, maxCells = 2e6, fragMax = 1000 } = opts;
  const { frags, fragGroup, nGroups, ctrl } = F;
  const bbox = fragsBBox(frags), plan = planTerms(psf, bbox, { maxCells, fragMax });
  onProgress({ stage: 'matrix', p: 0 });
  const K = buildShortMatrix(frags, fragGroup, nGroups, ctrl, plan.short, p => onProgress({ stage: 'matrix', p }));
  const grids = plan.long.map(t => Object.assign(new TermGrid(bbox, t.s, maxCells), { w: t.w }));
  const D = new Float64Array(nGroups).fill(1), E = new Float64Array(nGroups);
  // Targets. With a mix factor m (GenISys convention: 1 = edge equalization, 0 = uniform clearing) the wide-feature
  // dose is D = (1+η)/(1 + η(1+m)P); edges then sit at (½+ηP)/(1+η(1+m)P) and interiors at (1+ηP)/(1+η(1+m)P),
  // P = backscatter-weighted pattern density at the control point, η = backscatter/forward energy of the PSF.
  let target = F.target, eta = null, Pd = null;
  if (opts.mix != null && F.kind) {
    const sMax = Math.max(...psf.terms.map(t => t.s)), bs = t => t.s >= 0.1 * sMax;
    let Wb = 0, Wf = 0; for (const t of psf.terms) (bs(t) ? (Wb += t.w) : (Wf += t.w)); eta = Wb / Math.max(1e-12, Wf);
    Pd = new Float64Array(nGroups); const ones = new Float64Array(nGroups).fill(1);
    for (const t of psf.terms) if (bs(t)) { const G = new TermGrid(bbox, t.s, maxCells); G.splat(frags, fragGroup, ones); G.convolve(); for (let g = 0; g < nGroups; g++) Pd[g] += t.w / Wb * G.sample(ctrl[2 * g], ctrl[2 * g + 1]); }
    // forward coverage f at each control point (analytic short-range part at unit dose): ½ on a straight edge,
    // 1 deep inside. Interior points use their real f, so thin pieces just inside a shallow outline don't get a
    // full-interior target that would fight the edge next to them. Edge points use ½ — except where the point sits in
    // a concave spot of its OWN shape (inner corner, grid-snapping notch), where ½ is unreachable; there the shape's
    // own coverage is used. Gaps to other shapes still count as ½, so narrow spaces stay corrected.
    let Ws = 0; for (const t of plan.short) Ws += t.w;
    const gc = F.groupComp;
    target = new Float64Array(nGroups); const m = opts.mix;
    for (let g = 0; g < nGroups; g++) {
      const P = Math.min(1, Pd[g]), den = 1 + eta * (1 + m) * P;
      let f = F.kind[g] ? 0.5 : 1;
      if (Ws > 0) {
        let r = 0, rs = 0; for (let k = K.rowPtr[g]; k < K.rowPtr[g + 1]; k++) { r += K.val[k]; if (gc && gc[K.col[k]] === gc[g]) rs += K.val[k]; }
        f = F.kind[g] ? Math.min(1, Math.max(0.5, gc ? rs / Ws : 0.5)) : Math.min(1, Math.max(0.5, r / Ws));
      }
      target[g] = (f + eta * P) / den;
    }
  }
  const evalE = dose => {
    for (let g = 0; g < nGroups; g++) { let s = 0; for (let k = K.rowPtr[g]; k < K.rowPtr[g + 1]; k++) s += K.val[k] * dose[K.col[k]]; E[g] = s; }
    for (const G of grids) { G.clear(); G.splat(frags, fragGroup, dose); G.convolve(); for (let g = 0; g < nGroups; g++) E[g] += G.w * G.sample(ctrl[2 * g], ctrl[2 * g + 1]); }
  };
  const errs = () => { let mx = 0, ss = 0; for (let g = 0; g < nGroups; g++) { const e = E[g] / target[g] - 1; mx = Math.max(mx, Math.abs(e)); ss += e * e; } return { mx, rms: Math.sqrt(ss / Math.max(1, nGroups)) }; };
  const history = []; let it = 0, er;
  for (; it < maxIter; it++) {
    evalE(D); er = errs(); history.push(er.mx); onProgress({ stage: 'iterate', iter: it, maxErr: er.mx, rmsErr: er.rms });
    if (er.mx < tol) break;
    for (let g = 0; g < nGroups; g++) D[g] = Math.min(dMax, Math.max(dMin, D[g] * Math.pow(target[g] / Math.max(1e-9, E[g]), omega)));
  }
  if (it === maxIter) { evalE(D); er = errs(); }
  return { dose: D, energy: E.slice(), target, eta, density: Pd, iters: it, maxErr: er.mx, rmsErr: er.rms, history, plan, evalE, errs };
}

// energy at control points for any dose vector (re-uses the solver's operators)
export function energyAt(pec, D) { pec.evalE(D); return pec.errs(); }

// ── dose classes ─────────────────────────────────────────
// 'accuracy': geometric ladder (1+a)^k anchored at 1.0, k = round(ln D / ln(1+a)); widened if it needs > maxClasses
export function quantizeLadder(D, acc = 0.01, maxClasses = 256) {
  let lo = Infinity, hi = -Infinity; for (const d of D) { if (d < lo) lo = d; if (d > hi) hi = d; }
  let a = acc, q = Math.log(1 + a);
  while (Math.round(Math.log(hi) / q) - Math.round(Math.log(lo) / q) + 1 > maxClasses) { a *= 1.1; q = Math.log(1 + a); }
  const k0 = Math.round(Math.log(lo) / q), n = Math.round(Math.log(hi) / q) - k0 + 1;
  const cls = new Uint16Array(D.length), classDose = new Float64Array(n + 1), counts = new Float64Array(n + 1);
  for (let c = 1; c <= n; c++) classDose[c] = Math.exp((k0 + c - 1) * q);
  for (let i = 0; i < D.length; i++) { const c = Math.round(Math.log(D[i]) / q) - k0 + 1; cls[i] = c; counts[c]++; }
  return { cls, classDose, n, lo, hi, counts, accuracy: a };
}
export function quantizeDoses(D, n, mode = 'linear') {
  let lo = Infinity, hi = -Infinity; for (const d of D) { if (d < lo) lo = d; if (d > hi) hi = d; }
  const cls = new Uint16Array(D.length), sum = new Float64Array(n + 1), cnt = new Float64Array(n + 1);
  if (!(hi > lo * (1 + 1e-9))) { cls.fill(1); return { cls, classDose: Float64Array.from([0, lo]), n: 1, lo, hi }; }
  const f = mode === 'log' ? (d => Math.log(d / lo) / Math.log(hi / lo)) : (d => (d - lo) / (hi - lo));
  for (let i = 0; i < D.length; i++) { const c = Math.min(n, 1 + Math.floor(f(D[i]) * n)); cls[i] = c; sum[c] += D[i]; cnt[c]++; }
  const classDose = new Float64Array(n + 1);
  for (let c = 1; c <= n; c++) { const a = mode === 'log' ? lo * Math.pow(hi / lo, (c - 0.5) / n) : lo + (hi - lo) * (c - 0.5) / n; classDose[c] = cnt[c] ? sum[c] / cnt[c] : a; }
  return { cls, classDose, n, lo, hi, counts: cnt };
}

// ── exposure simulation on a window ──────────────────────
// win {x0,y0,x1,y1} nm, pitch nm. dose: per group. Returns {nx, ny, x0, y0, pitch, E: Float32Array}
export function simulate(F, dose, psf, win, pitch, opts = {}) {
  const { maxPx = 1.5e6, maxCells = 2e6 } = opts;
  let p = pitch; const Ww = win.x1 - win.x0, Hw = win.y1 - win.y0;
  if ((Ww / p) * (Hw / p) > maxPx) p = Math.sqrt(Ww * Hw / maxPx);
  const nx = Math.max(2, Math.ceil(Ww / p)), ny = Math.max(2, Math.ceil(Hw / p));
  const E = new Float32Array(nx * ny);
  const { frags, fragGroup } = F, t = frags.t;
  let Wsum = 0; for (const tm of psf.terms) Wsum += tm.w;
  const bbox = fragsBBox(frags);
  for (const tm of psf.terms) {
    const w = tm.w / Wsum, s = tm.s, m = 3.2 * s;
    const fx = Math.ceil((Ww + 2 * m) / p), fy = Math.ceil((Hw + 2 * m) / p);
    if (fx * fy <= 4 * maxPx && s < 20 * Math.max(Ww, Hw)) {
      // fine local raster with exact horizontal coverage (4 sub-rows per pixel)
      const gx0 = win.x0 - Math.ceil(m / p) * p, gy0 = win.y0 - Math.ceil(m / p) * p, GX = nx + 2 * Math.ceil(m / p), GY = ny + 2 * Math.ceil(m / p);
      const A = new Float64Array(GX * GY), B = new Float64Array(GX * GY);
      const X1 = gx0 + GX * p, Y1 = gy0 + GY * p;
      for (let i = 0; i < frags.n; i++) {
        const o = i * 6, d = dose[fragGroup[i]]; if (!d) continue;
        if (t[o + 1] < gy0 || t[o] > Y1 || Math.max(t[o + 3], t[o + 5]) < gx0 || Math.min(t[o + 2], t[o + 4]) > X1) continue;
        const r0 = Math.max(0, Math.floor((t[o] - gy0) / p)), r1 = Math.min(GY - 1, Math.floor((t[o + 1] - gy0) / p)), H = t[o + 1] - t[o];
        for (let r = r0; r <= r1; r++) for (let k = 0; k < 4; k++) {
          const y = gy0 + (r + (k + 0.5) / 4) * p; if (y < t[o] || y >= t[o + 1]) continue;
          const f = (y - t[o]) / H; let xl = t[o + 2] + (t[o + 4] - t[o + 2]) * f, xr = t[o + 3] + (t[o + 5] - t[o + 3]) * f;
          xl = Math.max(xl, gx0); xr = Math.min(xr, X1 - 1e-9); if (xr <= xl) continue;
          const cl = (xl - gx0) / p, cr = (xr - gx0) / p, il = Math.floor(cl), ir = Math.floor(cr), q = 0.25 * d, row = r * GX;
          if (il === ir) A[row + il] += q * (cr - cl);
          else { A[row + il] += q * (il + 1 - cl); for (let c = il + 1; c < ir; c++) A[row + c] += q; A[row + ir] += q * (cr - ir); }
        }
      }
      const K = Math.max(1, Math.ceil(m / p)), k = new Float64Array(2 * K + 1); let S = 0;
      for (let j = -K; j <= K; j++) { k[j + K] = Math.exp(-((j * p) ** 2) / (s * s)); S += k[j + K]; } for (let j = 0; j < k.length; j++) k[j] /= S;
      if (s < 0.3 * p) { for (let i = 0; i < A.length; i++) B[i] = A[i]; } else {
        for (let y = 0; y < GY; y++) { const r = y * GX; for (let x = 0; x < GX; x++) { let v = 0; const j0 = Math.max(-K, -x), j1 = Math.min(K, GX - 1 - x); for (let j = j0; j <= j1; j++) v += A[r + x + j] * k[j + K]; B[r + x] = v; } }
        for (let x = 0; x < GX; x++) for (let y = 0; y < GY; y++) { let v = 0; const j0 = Math.max(-K, -y), j1 = Math.min(K, GY - 1 - y); for (let j = j0; j <= j1; j++) v += B[(y + j) * GX + x] * k[j + K]; A[y * GX + x] = v; }
        for (let i = 0; i < A.length; i++) B[i] = A[i];
      }
      const ox = Math.round((win.x0 - gx0) / p), oy = Math.round((win.y0 - gy0) / p);
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) E[y * nx + x] += w * B[(y + oy) * GX + x + ox];
    } else {
      const G = new TermGrid(bbox, s, maxCells); G.splat(frags, fragGroup, dose); G.convolve();
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) E[y * nx + x] += w * G.sample(win.x0 + (x + 0.5) * p, win.y0 + (y + 0.5) * p);
    }
  }
  return { nx, ny, x0: win.x0, y0: win.y0, pitch: p, E };
}

// marching squares → segments [x0,y0,x1,y1,...] in nm (pixel centres at x0+(i+0.5)p)
export function contour(sim, thr) {
  const { nx, ny, E, x0, y0, pitch: p } = sim, out = [];
  const P = (i, j) => [x0 + (i + 0.5) * p, y0 + (j + 0.5) * p];
  const lerp = (a, b, va, vb) => { const f = (thr - va) / ((vb - va) || 1e-30); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const v0 = E[j * nx + i], v1 = E[j * nx + i + 1], v2 = E[(j + 1) * nx + i + 1], v3 = E[(j + 1) * nx + i];
    const c = (v0 >= thr ? 1 : 0) | (v1 >= thr ? 2 : 0) | (v2 >= thr ? 4 : 0) | (v3 >= thr ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const p0 = P(i, j), p1 = P(i + 1, j), p2 = P(i + 1, j + 1), p3 = P(i, j + 1);
    const e = [lerp(p0, p1, v0, v1), lerp(p1, p2, v1, v2), lerp(p3, p2, v3, v2), lerp(p0, p3, v0, v3)]; // bottom,right,top,left
    const seg = (a, b) => out.push(e[a][0], e[a][1], e[b][0], e[b][1]);
    switch (c) {
      case 1: case 14: seg(3, 0); break; case 2: case 13: seg(0, 1); break; case 3: case 12: seg(3, 1); break;
      case 4: case 11: seg(1, 2); break; case 6: case 9: seg(0, 2); break; case 7: case 8: seg(3, 2); break;
      case 5: seg(3, 0); seg(1, 2); break; case 10: seg(0, 1); seg(3, 2); break;
    }
  }
  return new Float32Array(out);
}
