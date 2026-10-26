// PSF model: f(r) = Σ w_t·G(r; s_t) / Σ w_t,  G(r; s) = exp(-r²/s²)/(π s²)   (s = 1/e radius, nm)
// Classic double Gaussian: terms [{s:α,w:1},{s:β,w:η}], optional third {s:γ,w:ν}.

export const G = (r, s) => Math.exp(-(r * r) / (s * s)) / (Math.PI * s * s);

export function psfFromParams({ alpha, beta, eta, gamma = 0, nu = 0, beamFWHM = 0 }) {
  const ab = beamFWHM > 0 ? beamFWHM / (2 * Math.sqrt(Math.LN2)) : 0; // beam blur folded into α
  const terms = [{ s: Math.sqrt(alpha * alpha + ab * ab), w: 1 }, { s: beta, w: eta }];
  if (gamma > 0 && nu > 0) terms.push({ s: gamma, w: nu });
  return { terms };
}

export function psfEval(psf, r) { let W = 0, v = 0; for (const t of psf.terms) { W += t.w; v += t.w * G(r, t.s); } return v / W; }

// normalise radial samples so ∫ f 2πr dr = 1 (trapezoid rule)
export function normalizeRadial(r, f) {
  let I = 0; for (let i = 1; i < r.length; i++) I += 0.5 * (f[i] * r[i] + f[i - 1] * r[i - 1]) * 2 * Math.PI * (r[i] - r[i - 1]);
  return f.map(v => v / I);
}

// Kanaya–Okayama electron range (µm), E in keV, A g/mol, ρ g/cm³
export const rangeKO = (E, A, Z, rho) => 0.0276 * A * Math.pow(E, 1.67) / (Math.pow(Z, 0.889) * rho);

// ── Nelder–Mead ──────────────────────────────────────────
export function nelderMead(f, x0, step, { maxIter = 4000, tol = 1e-10 } = {}) {
  const n = x0.length; let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; S.push(x); }
  let F = S.map(f);
  for (let it = 0; it < maxIter; it++) {
    const idx = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = idx.map(i => S[i]); F = idx.map(i => F[i]);
    if (Math.abs(F[n] - F[0]) < tol * (1 + Math.abs(F[0]))) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const at = k => c.map((v, j) => v + k * (S[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < F[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = fr < F[n] ? at(-0.5) : at(0.5), fc = f(xc);
      if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; }
      else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } } }
  }
  return { x: S[0], f: F[0] };
}

// Fit 2- or 3-Gaussian PSF to radial data (r nm, f normalised). Least squares on ln f, uniform weight per log-r sample.
export function fitPSF(r, f, { nTerms = 2, rMin = 0.5, rMax = Infinity, init } = {}) {
  f = normalizeRadial(r, f); const R = [], LF = [];
  for (let i = 0; i < r.length; i++) if (r[i] >= rMin && r[i] <= rMax && f[i] > 0) { R.push(r[i]); LF.push(Math.log(f[i])); }
  if (R.length < 6) throw new Error('not enough PSF samples to fit');
  // initial guesses: α from the half-energy radius of the core, β from where the tail starts dropping
  let cum = 0, a0 = 10, b0 = 1000; const tot = [];
  for (let i = 1; i < r.length; i++) { cum += 0.5 * (f[i] * r[i] + f[i - 1] * r[i - 1]) * 2 * Math.PI * (r[i] - r[i - 1]); tot.push([r[i], cum]); }
  for (const [ri, c] of tot) if (c >= 0.25) { a0 = Math.max(1, ri); break; }
  for (const [ri, c] of tot) if (c >= 0.8) { b0 = Math.max(a0 * 10, ri); break; }
  const model = p => { const t = [{ s: Math.exp(p[0]), w: 1 }, { s: Math.exp(p[1]), w: Math.exp(p[2]) }]; if (nTerms === 3) t.push({ s: Math.exp(p[3]), w: Math.exp(p[4]) }); return { terms: t }; };
  const p0 = (init || (nTerms === 3 ? [Math.log(a0), Math.log(b0), Math.log(0.6), Math.log(Math.sqrt(a0 * b0)), Math.log(0.1)] : [Math.log(a0), Math.log(b0), Math.log(0.6)])).concat([0]);
  const nA = p0.length - 1; // last parameter = free log amplitude (data normalisation is uncertain)
  { const m0 = model(p0); let s = 0; for (let i = 0; i < R.length; i++) s += LF[i] - Math.log(Math.max(1e-300, psfEval(m0, R[i]))); p0[nA] = s / R.length; }
  const cost = p => {
    if (p[1] < p[0]) return 1e9; let s = 0; const m = model(p);
    for (let i = 0; i < R.length; i++) { const v = psfEval(m, R[i]); const d = (v > 0 ? Math.log(v) : -700) + p[nA] - LF[i]; s += d * d; }
    return s / R.length;
  };
  let best = nelderMead(cost, p0, p0.map(() => 0.5));
  for (let k = 0; k < 3; k++) best = nelderMead(cost, best.x, best.x.map(() => 0.2));
  const m = model(best.x), rms = Math.sqrt(best.f);
  const out = { alpha: m.terms[0].s, beta: m.terms[1].s, eta: m.terms[1].w, rmsLog: rms, psf: m };
  if (nTerms === 3) { out.gamma = m.terms[2].s; out.nu = m.terms[2].w; }
  return out;
}

// ── non-negative least squares (Lawson–Hanson) for small dense problems: min ||A x − b||, x ≥ 0 ──
export function nnls(A, b, m, n, maxIter = 500) {
  // A row-major m×n
  const x = new Float64Array(n), P = new Uint8Array(n);
  const grad = () => { const r = new Float64Array(m); for (let i = 0; i < m; i++) { let s = b[i]; for (let j = 0; j < n; j++) s -= A[i * n + j] * x[j]; r[i] = s; } const w = new Float64Array(n); for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += A[i * n + j] * r[i]; w[j] = s; } return w; };
  const lsq = idx => { // unconstrained LS on columns idx via normal equations (Cholesky with tiny ridge)
    const k = idx.length, M = new Float64Array(k * k), v = new Float64Array(k);
    for (let a = 0; a < k; a++) { for (let c = 0; c < k; c++) { let s = 0; for (let i = 0; i < m; i++) s += A[i * n + idx[a]] * A[i * n + idx[c]]; M[a * k + c] = s; } let s = 0; for (let i = 0; i < m; i++) s += A[i * n + idx[a]] * b[i]; v[a] = s; }
    for (let a = 0; a < k; a++) M[a * k + a] *= 1 + 1e-12;
    for (let a = 0; a < k; a++) { for (let c = 0; c < a; c++) { let s = M[a * k + c]; for (let d = 0; d < c; d++) s -= M[a * k + d] * M[c * k + d]; M[a * k + c] = s / M[c * k + c]; } let s = M[a * k + a]; for (let d = 0; d < a; d++) s -= M[a * k + d] ** 2; M[a * k + a] = Math.sqrt(Math.max(s, 1e-300)); }
    const y = new Float64Array(k); for (let a = 0; a < k; a++) { let s = v[a]; for (let d = 0; d < a; d++) s -= M[a * k + d] * y[d]; y[a] = s / M[a * k + a]; }
    const z = new Float64Array(k); for (let a = k - 1; a >= 0; a--) { let s = y[a]; for (let d = a + 1; d < k; d++) s -= M[d * k + a] * z[d]; z[a] = s / M[a * k + a]; }
    return z;
  };
  for (let it = 0; it < maxIter; it++) {
    const w = grad(); let jm = -1, wm = 1e-12;
    for (let j = 0; j < n; j++) if (!P[j] && w[j] > wm) { wm = w[j]; jm = j; }
    if (jm < 0) break; P[jm] = 1;
    for (let inner = 0; inner < 100; inner++) {
      const idx = []; for (let j = 0; j < n; j++) if (P[j]) idx.push(j);
      const z = lsq(idx);
      if (z.every(v => v > 0)) { idx.forEach((j, a) => x[j] = z[a]); break; }
      let al = Infinity; idx.forEach((j, a) => { if (z[a] <= 0) al = Math.min(al, x[j] / (x[j] - z[a])); });
      idx.forEach((j, a) => { x[j] += al * (z[a] - x[j]); if (x[j] <= 1e-15) { x[j] = 0; P[j] = 0; } });
    }
  }
  return x;
}

// Represent any radial PSF as Σ w_k G(r; s_k) with log-spaced s_k. NNLS on two row blocks:
// relative density error (shape over all decades) + absolute enclosed-energy error (where the energy is).
// Every term stays a separable Gaussian, so PEC/simulation can use fast separable convolutions.
// d = {r, f, f0, r0}: f0 = mean density of the central disk of radius r0 (TRACER bin 0), may be null.
export function fitMultiGauss(d, { nTerms = 30, cumTol = 0.002, signedFrom = 300, ridge = 0.02 } = {}) {
  const { r, f } = d, f0 = d.f0 || 0, r0 = d.r0 || r[0];
  const cum = [], E0 = f0 * Math.PI * r0 * r0; let c = E0;
  for (let i = 0; i < r.length; i++) { if (i) c += 0.5 * (f[i] * r[i] + f[i - 1] * r[i - 1]) * 2 * Math.PI * (r[i] - r[i - 1]); cum.push(c); }
  const I = c; let rq = r[r.length - 1];
  for (let i = 0; i < r.length; i++) if (cum[i] / I > 0.99995) { rq = r[i]; break; }
  const lo = Math.max(0.2, r0 * 0.35), hi = rq * 0.75;
  const S = []; for (let k = 0; k < nTerms; k++) S.push(lo * Math.pow(hi / lo, k / (nTerms - 1)));
  const rows = []; for (let i = 0; i < r.length; i++) if (r[i] <= rq && f[i] > 0) rows.push(i);
  // wide terms may also enter with negative sign (the substrate backscatter halo has a flatter top / sharper
  // edge than any positive Gaussian mix); narrow ones stay positive so the core can't ring
  const neg = S.map((s, k) => s >= signedFrom ? k : -1).filter(k => k >= 0);
  const SS = S.concat(neg.map(k => S[k])), sg = S.map(() => 1).concat(neg.map(() => -1));
  const n = SS.length, A = [], b = [];
  const pushRow = (vals, rhs) => { A.push(...vals.map((v, k) => v * sg[k])); b.push(rhs); };
  for (const i of rows) pushRow(SS.map(s => G(r[i], s) * I / f[i]), 1);                         // relative density
  if (f0 > 0) pushRow(SS.map(s => (1 - Math.exp(-(r0 * r0) / (s * s))) / (Math.PI * r0 * r0) * I / f0), 1); // core disk mean
  for (const i of rows) pushRow(SS.map(s => (1 - Math.exp(-(r[i] * r[i]) / (s * s))) / cumTol), cum[i] / I / cumTol); // enclosed energy
  for (let x = rq * 1.1; x < rq * 4; x *= 1.1) pushRow(SS.map(s => (1 - Math.exp(-(x * x) / (s * s))) / cumTol), 1 / cumTol); // no overshoot past the halo
  for (let k = 0; k < n; k++) { const v = new Array(n).fill(0); v[k] = ridge * sg[k]; pushRow(v, 0); }       // small ridge
  const m = b.length, w = nnls(Float64Array.from(A), Float64Array.from(b), m, n);
  const wn = new Float64Array(nTerms); for (let k = 0; k < n; k++) wn[k < nTerms ? k : neg[k - nTerms]] += sg[k] * w[k];
  let W = 0; for (const v of wn) W += v;
  const terms = []; for (let k = 0; k < nTerms; k++) if (Math.abs(wn[k]) > 1e-7 * Math.abs(W)) terms.push({ s: S[k], w: wn[k] / W });
  const psf = { terms };
  let e = 0, maxCum = 0;
  for (const i of rows) { const q = Math.log(Math.max(1e-30, psfEval(psf, r[i])) * I / f[i]); e += q * q; maxCum = Math.max(maxCum, Math.abs(psfEnclosed(psf, r[i]) - cum[i] / I)); }
  let negMass = 0; for (let x = r[0]; x < rq * 4; x *= 1.01) { const v = psfEval(psf, x); if (v < 0) negMass -= v * 2 * Math.PI * x * x * 0.01; }
  return { psf, rmsLog: Math.sqrt(e / rows.length), maxCumErr: maxCum, rMax: rq, norm: I, negMass };
}

// energy fraction of a PSF inside radius R
export function psfEnclosed(psf, R) { let W = 0, v = 0; for (const t of psf.terms) { W += t.w; v += t.w * (1 - Math.exp(-(R * R) / (t.s * t.s))); } return v / W; }

// ── import: BEAMER/TRACER .lpsf (zlib-compressed boost XML archive) or two-column text ──
export async function inflateZlib(buf) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}
export function parseLpsfXml(xml) {
  const sec = (xml.match(/<m_PSFDataOriginal[\s\S]*?<\/m_PSFDataOriginal>/) || [''])[0];
  const r = [], f = [];
  const re = /<m_x>([^<]+)<\/m_x>\s*<m_y>([^<]+)<\/m_y>/g; let m;
  while ((m = re.exec(sec))) { r.push(+m[1]); f.push(+m[2]); }
  const tag = k => { const q = xml.match(new RegExp(`<${k}>([^<]*)</${k}>`)); return q ? q[1] : null; };
  const stack = []; const st = (xml.match(/<m_Stack[\s\S]*?<\/m_Stack>/) || [''])[0];
  const re2 = /<first>([^<]*)<\/first>\s*<second>([^<]*)<\/second>/g; while ((m = re2.exec(st))) stack.push({ material: m[1], thickness_nm: +m[2] });
  const comments = [...xml.matchAll(/<item>([^<]*)<\/item>/g)].map(x => x[1]).filter(s => /^\s*[#A-Za-z -]/.test(s)).slice(0, 60);
  return { r, f, energy_kV: +tag('m_lBeam_Energy_kV') || null, z_um: +tag('m_dZ_Position') || null, electrons: +tag('m_lElectrons') || null, simulator: tag('m_sSimulator'), stack, comments };
}
export function parseTextPSF(text, unit = 'nm') {
  const k = unit === 'um' ? 1000 : 1; const r = [], f = [];
  for (const line of text.split(/\r?\n/)) { const m = line.trim().split(/[\s,;]+/).map(Number); if (m.length >= 2 && isFinite(m[0]) && isFinite(m[1])) { r.push(m[0] * k); f.push(m[1]); } }
  return { r, f };
}
// radial data → {r, f, f0, r0}; an r=0 sample is the mean density of the central disk (radius = first r>0)
export function cleanRadial(d) {
  const r = [], f = []; let f0 = null;
  for (let i = 0; i < d.r.length; i++) { if (d.r[i] === 0 && d.f[i] > 0) f0 = d.f[i]; else if (d.r[i] > 0 && d.f[i] > 0) { r.push(d.r[i]); f.push(d.f[i]); } }
  return { r, f, f0, r0: r[0] };
}

// Literature PSF parameters (1/e convention). α is resist-thickness/beam dependent — treat it as a starting value
// and set the effective blur from your own CD-vs-dose data. Sources: docs/soft-ebeam/RESEARCH.md §2.2.
export const PSF_PRESETS = [
  { id: 'si10', label: 'Si · 10 kV · 0.5 µm resist', alpha: 390, beta: 600, eta: 0.74, src: 'Owen 1990' },
  { id: 'si20', label: 'Si · 20 kV · 0.5 µm resist', alpha: 120, beta: 2000, eta: 0.74, src: 'Owen 1990' },
  { id: 'si25', label: 'Si · 25 kV · PMMA 0.5 µm', alpha: 39, beta: 3100, eta: 0.70, src: 'Svintsov 2022 (exp.)' },
  { id: 'si30', label: 'Si · 30 kV · PMMA', alpha: 30, beta: 4000, eta: 0.69, src: 'Svintsov 2022' },
  { id: 'si50', label: 'Si · 50 kV · 0.5 µm resist', alpha: 24, beta: 9500, eta: 0.74, src: 'Owen 1990' },
  { id: 'si100', label: 'Si · 100 kV · 0.5 µm resist', alpha: 7, beta: 31200, eta: 0.74, src: 'Owen 1990' },
  { id: 'si100zep', label: 'Si · 100 kV · ZEP520A 495 nm', alpha: 11.8, beta: 33300, eta: 0.61, src: 'Georgia Tech (SCELETON MC)' },
  { id: 'si100hsq', label: 'Si · 100 kV · HSQ 50 nm', alpha: 2.4, beta: 27870, eta: 0.718, src: 'Mao 2025 (MC)' },
  { id: 'si150', label: 'Si · 150 kV · CSAR 180 nm', alpha: 5, beta: 57200, eta: 0.72, src: 'Hougs 2025 (MC; α assumed)' },
  { id: 'gaas25', label: 'GaAs · 25 kV · PMMA', alpha: 39, beta: 1500, eta: 1.16, src: 'Svintsov 2022 (α assumed)' },
  { id: 'gaas100', label: 'GaAs · 100 kV · ZEP', alpha: 12, beta: 13080, eta: 1.09, src: 'Georgia Tech (α assumed)' },
  { id: 'sio2_100', label: 'SiO₂ / quartz · 100 kV', alpha: 10, beta: 31800, eta: 0.52, src: 'Georgia Tech (α assumed)' },
  { id: 'sapph100', label: 'Sapphire · 100 kV', alpha: 10, beta: 13300, eta: 0.74, src: 'Georgia Tech (α assumed)' },
  { id: 'ge100', label: 'Ge · 100 kV', alpha: 10, beta: 13000, eta: 1.06, src: 'Georgia Tech (α assumed)' },
  { id: 'linbo3_100', label: 'LiNbO₃ · 100 kV', alpha: 10, beta: 14800, eta: 0.92, src: 'Georgia Tech (α assumed)' },
  { id: 'inp150', label: 'InP · 150 kV', alpha: 5, beta: 23000, eta: 1.16, src: 'Hougs 2025 (exp.; α assumed)' },
  { id: 'au100', label: 'Au (bulk) · 100 kV', alpha: 10, beta: 2320, eta: 1.16, src: 'Georgia Tech (α assumed)' },
];
