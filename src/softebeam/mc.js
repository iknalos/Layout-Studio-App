// Monte Carlo electron scattering in a resist/substrate stack → radial energy-deposition PSF in the resist.
// Single-scattering model (Joy 1995): screened-Rutherford elastic cross-section with relativistic correction,
// continuous slowing down with relativistic Bethe (ICRU 37) + Joy–Luo low-energy form, element picked per collision by cross-section,
// plus fast secondary electrons (Møller events above Ec) in the hybrid model: the primary loses only the restricted
// stopping power continuously, and each knock-on electron is transported like a primary.

// Z, A (g/mol), I (eV; ICRU-37/49 where tabulated)
export const ELEMENTS = {
  H: [1, 1.008, 19.2], Li: [3, 6.94, 40], B: [5, 10.81, 76], C: [6, 12.011, 78], N: [7, 14.007, 82], O: [8, 15.999, 95], F: [9, 18.998, 115],
  Na: [11, 22.99, 149], Al: [13, 26.982, 166], Si: [14, 28.086, 173], P: [15, 30.974, 173], S: [16, 32.06, 180], Cl: [17, 35.45, 174],
  Ti: [22, 47.867, 233], Cr: [24, 51.996, 257], Ni: [28, 58.693, 311], Cu: [29, 63.546, 322], Ga: [31, 69.723, 334], Ge: [32, 72.63, 350],
  As: [33, 74.922, 347], Nb: [41, 92.906, 417], Mo: [42, 95.95, 424], Ag: [47, 107.87, 470], In: [49, 114.82, 488], Sn: [50, 118.71, 488],
  Ta: [73, 180.95, 718], W: [74, 183.84, 727], Pt: [78, 195.08, 790], Au: [79, 196.97, 790],
};
// formula (atom counts) + density g/cm³
export const MATERIALS = {
  PMMA: { f: { C: 5, H: 8, O: 2 }, rho: 1.19, resist: true },
  'ZEP520A': { f: { C: 13, H: 15, Cl: 1, O: 2 }, rho: 1.11, resist: true },
  'CSAR 62': { f: { C: 13, H: 15, Cl: 1, O: 2 }, rho: 1.18, resist: true },
  HSQ: { f: { H: 1, Si: 1, O: 1.5 }, rho: 1.4, resist: true },
  'ma-N 2400': { f: { C: 8, H: 8, O: 1 }, rho: 1.2, resist: true },
  'SU-8': { f: { C: 87, H: 118, O: 16 }, rho: 1.19, resist: true },
  Si: { f: { Si: 1 }, rho: 2.329 }, SiO2: { f: { Si: 1, O: 2 }, rho: 2.2 }, Quartz: { f: { Si: 1, O: 2 }, rho: 2.65 },
  Si3N4: { f: { Si: 3, N: 4 }, rho: 3.1 }, GaAs: { f: { Ga: 1, As: 1 }, rho: 5.317 }, InP: { f: { In: 1, P: 1 }, rho: 4.81 },
  GaN: { f: { Ga: 1, N: 1 }, rho: 6.15 }, Sapphire: { f: { Al: 2, O: 3 }, rho: 3.98 }, AlN: { f: { Al: 1, N: 1 }, rho: 3.26 },
  LiNbO3: { f: { Li: 1, Nb: 1, O: 3 }, rho: 4.65 }, Diamond: { f: { C: 1 }, rho: 3.515 }, Ge: { f: { Ge: 1 }, rho: 5.323 },
  ITO: { f: { In: 2, O: 3 }, rho: 7.14 },
  Al: { f: { Al: 1 }, rho: 2.70 }, Ti: { f: { Ti: 1 }, rho: 4.506 }, Cr: { f: { Cr: 1 }, rho: 7.19 }, Ni: { f: { Ni: 1 }, rho: 8.908 },
  Cu: { f: { Cu: 1 }, rho: 8.96 }, Mo: { f: { Mo: 1 }, rho: 10.28 }, Ag: { f: { Ag: 1 }, rho: 10.49 }, Ta: { f: { Ta: 1 }, rho: 16.69 },
  W: { f: { W: 1 }, rho: 19.25 }, Pt: { f: { Pt: 1 }, rho: 21.45 }, Au: { f: { Au: 1 }, rho: 19.32 },
};

const NA = 6.02214076e23;
const sigmaSR = (Z, E) => { // cm², E keV
  const a = 3.4e-3 * Math.pow(Z, 0.67) / E;
  const rel = (E + 511) / (E + 1024);
  return 5.21e-21 * (Z * Z) / (E * E) * (4 * Math.PI / (a * (1 + a))) * rel * rel;
};

// Stopping power: relativistic Bethe (ICRU 37 / NIST ESTAR form) with the Joy–Luo low-energy substitution
// I' = I/(1 + kI/E), so it matches ESTAR at 20–100 keV and stays finite down to ~0.1 keV. When fast secondaries are
// simulated, the primary loses only the restricted part (transfers below Ec); larger transfers are Møller events.
const MC2 = 511, RE2 = 2.5496e-22; // mc² keV; 2π r_e² mc² in keV·cm²
// condensed-phase I for constituents of compounds (ICRU 37 modified Bragg rule)
const I_COND = { H: 19.2, C: 81, N: 82, O: 106, Cl: 180 };
function stopping(els, rho, E, Ec) { // keV/cm; restricted to transfers < Ec when 0 < Ec < E/2
  const tau = E / MC2, b2 = tau * (tau + 2) / ((tau + 1) ** 2), D = Ec / MC2, restricted = Ec > 0 && Ec < E / 2;
  let sum = 0;
  for (const e of els) {
    const I = e.J / (1 + e.k * e.J / E) / MC2; // J keV → I'/mc²
    let br;
    if (restricted) br = Math.log(2 * (tau + 2) / (I * I)) - 1 - b2 + Math.log((tau - D) * D) + tau / (tau - D) + (D * D / 2 + (2 * tau + 1) * Math.log(1 - D / tau)) / ((tau + 1) ** 2);
    else br = Math.log(tau * tau * (tau + 2) / (2 * I * I)) + 1 - b2 + (tau * tau / 8 - (2 * tau + 1) * Math.LN2) / ((tau + 1) ** 2);
    sum += e.w * e.Z / e.A * Math.max(0.05, br);
  }
  return 0.153537 * sum / b2 * rho * 1000; // MeV·cm²/g·ρ → keV/cm
}
// Møller cross-section per free electron for transfers ε ∈ [εc, ½] (relativistic), cm²
function sigmaMoller(E, Ec) {
  const tau = E / MC2, b2 = tau * (tau + 2) / ((tau + 1) ** 2), ec = Ec / E;
  if (!(ec < 0.5)) return 0;
  const c1 = (tau / (tau + 1)) ** 2, c2 = (2 * tau + 1) / ((tau + 1) ** 2);
  return RE2 / (b2 * E) * (1 / ec - 1 / (1 - ec) + c1 * (0.5 - ec) - c2 * Math.log((1 - ec) / ec));
}

// per-material lookup tables on a log-E grid: mean free path (nm), stopping power (keV/nm), element cdf, Møller fraction, CSDA range
function buildTables(mat, Emin, Emax, Ec = 1, N = 600) {
  const compound = Object.keys(mat.f).length > 1;
  const els = Object.entries(mat.f).map(([s, c]) => { const [Z, A, I] = ELEMENTS[s]; return { s, c, Z, A, J: (compound ? (I_COND[s] || 1.13 * I) : I) * 1e-3, k: 0.731 + 0.0688 * Math.log10(Z) }; });
  const M = els.reduce((a, e) => a + e.c * e.A, 0);
  for (const e of els) { e.n = mat.rho * NA * e.c / M; e.w = e.c * e.A / M; } // atoms/cm³, mass fraction
  const lE0 = Math.log(Emin), dl = (Math.log(Emax) - lE0) / (N - 1);
  const ne = els.reduce((a, e) => a + e.n * e.Z, 0); // electrons/cm³
  const lam = new Float64Array(N), S = new Float64Array(N), cdf = new Float64Array(N * els.length), pM = new Float64Array(N), Rg = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const E = Math.exp(lE0 + i * dl); let tot = 0;
    for (let k = 0; k < els.length; k++) { tot += els[k].n * sigmaSR(els[k].Z, E); cdf[i * els.length + k] = tot; }
    for (let k = 0; k < els.length; k++) cdf[i * els.length + k] /= tot;
    const muM = Ec > 0 ? ne * sigmaMoller(E, Ec) : 0;                       // 1/cm
    lam[i] = 1e7 / (tot + muM); pM[i] = muM / (tot + muM);                  // nm; P(collision is Møller)
    S[i] = stopping(els, mat.rho, E, Ec > 0 ? Ec : 0) * 1e-7;               // keV/nm
    const Su = stopping(els, mat.rho, E, 0) * 1e-7;                         // unrestricted, for the range table
    Rg[i] = i ? Rg[i - 1] + (E - Math.exp(lE0 + (i - 1) * dl)) / Su : 0;    // CSDA range above Emin, nm
  }
  return { els, lE0, dl, N, lam, S, cdf, pM, Rg, aZ: els.map(e => 3.4e-3 * Math.pow(e.Z, 0.67)), Zeff: els.reduce((a, e) => a + e.w * e.Z, 0), Aeff: M / els.reduce((a, e) => a + e.c, 0) };
}
export const _test = { stopping, sigmaMoller, buildTables };

function rng(seed) { // sfc32
  let a = 0x9E3779B9 ^ seed, b = 0x243F6A88 ^ (seed * 7919), c = 0xB7E15162, d = seed | 1;
  for (let i = 0; i < 16; i++) next();
  function next() { a |= 0; b |= 0; c |= 0; d |= 0; const t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = c << 21 | c >>> 11; c = c + t | 0; return (t >>> 0) / 4294967296; }
  return () => { let u; do u = next(); while (u === 0); return u; };
}

export function radialBins(rMax, r0 = 0.5, perDecade = 40) {
  const edges = [0, r0]; while (edges[edges.length - 1] < rMax) edges.push(edges[edges.length - 1] * Math.pow(10, 1 / perDecade));
  return Float64Array.from(edges);
}

// cfg: {layers:[{mat, t (nm, Infinity for substrate)}], resist:0, E0 keV, n, beamSigma nm, seed, Ecut keV, zWin:[z0,z1]|null}
export function runMC(cfg, onProgress) {
  const { layers, resist = 0, E0, n = 20000, beamSigma = 1, seed = 1, Ecut = 0.5, zWin = null, Ec = 1 } = cfg;
  const tabs = layers.map(L => buildTables(MATERIALS[L.mat], Ecut * 0.8, E0 * 1.01, Ec));
  const zTop = [0]; for (const L of layers) zTop.push(zTop[zTop.length - 1] + (isFinite(L.t) ? L.t : 1e12));
  const sub = tabs[tabs.length - 1];
  const rMax = 2.2 * 1000 * 0.0276 * sub.Aeff * Math.pow(E0, 1.67) / (Math.pow(sub.Zeff, 0.889) * MATERIALS[layers[layers.length - 1].mat].rho);
  const edges = radialBins(rMax), nb = edges.length - 1, tally = new Float64Array(nb + 1);
  const logEdge = Math.log(edges[2] / edges[1]), lr1 = Math.log(edges[1]);
  const rz0 = zWin ? zWin[0] : zTop[resist], rz1 = zWin ? zWin[1] : zTop[resist + 1];
  const bin = r => r < edges[1] ? 0 : Math.min(nb, 1 + Math.floor((Math.log(r) - lr1) / logEdge));
  const R = rng(seed >>> 0);
  // range rejection: below the resist, an electron whose CSDA range (most penetrating layer) is shorter than its
  // depth below the resist can never deposit there or escape — stop it (unbiased for both tallies)
  const zRes = zTop[resist + 1], below = tabs.slice(resist + 1);
  const maxRange = E => { let m = 0; for (const T of below) { let fi = (Math.log(E) - T.lE0) / T.dl; fi = Math.max(0, Math.min(T.N - 1.001, fi)); const i = Math.floor(fi), u = fi - i; m = Math.max(m, T.Rg[i] * (1 - u) + T.Rg[i + 1] * u); } return m; };
  let nBack = 0, nTrans = 0, eBack = 0, eResist = 0;
  const deposit = (x0, y0, z0, x1, y1, z1, dE) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), m = Math.min(400, Math.max(1, Math.ceil(len / 2))), q = dE / m;
    for (let k = 0; k < m; k++) {
      const f = (k + R()) / m, z = z0 + (z1 - z0) * f; if (z < rz0 || z > rz1) continue;
      const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f; tally[bin(Math.hypot(x, y))] += q; eResist += q;
    }
  };
  const stack = []; let nSec = 0;
  const rotate = (d, ct, p2) => { // new direction at polar angle acos(ct), azimuth p2 relative to d
    const st = Math.sqrt(Math.max(0, 1 - ct * ct)), cp = Math.cos(p2), sp = Math.sin(p2); let [cx, cy, cz] = d;
    if (Math.abs(cz) > 0.99999) return [st * cp, st * sp, cz > 0 ? ct : -ct];
    const sq = Math.sqrt(1 - cz * cz);
    const nx = cx * ct + st * (cx * cz * cp - cy * sp) / sq, ny = cy * ct + st * (cy * cz * cp + cx * sp) / sq, nz = cz * ct - sq * st * cp, nn = 1 / Math.hypot(nx, ny, nz);
    return [nx * nn, ny * nn, nz * nn];
  };
  for (let e = 0; e < n; e++) {
    const rr = beamSigma * Math.sqrt(-2 * Math.log(R())), ph = 2 * Math.PI * R();
    stack.push([rr * Math.cos(ph), rr * Math.sin(ph), 0, 0, 0, 1, E0, 0, 1]);
    while (stack.length) {
    let [x, y, z, cx, cy, cz, E, L, primary] = stack.pop();
    for (let guard = 0; guard < 200000; guard++) {
      const T = tabs[L]; let fi = (Math.log(E) - T.lE0) / T.dl; fi = Math.max(0, Math.min(T.N - 1.001, fi));
      const i = Math.floor(fi), u = fi - i, lam = T.lam[i] * (1 - u) + T.lam[i + 1] * u, Sp = T.S[i] * (1 - u) + T.S[i + 1] * u;
      if (L > resist && !zWin && z - zRes > maxRange(E)) break;
      let s = -lam * Math.log(R());
      const dB = cz > 0 ? (zTop[L + 1] - z) / cz : cz < 0 ? (zTop[L] - z) / cz : Infinity;
      const cross = s >= dB; if (cross) s = dB;
      let dE = Sp * s, stop = false;
      if (E - dE <= Ecut) { s = s * (E - Ecut) / dE; dE = E; stop = true; } // ran out of energy mid-step: dump the rest
      const nx = x + cx * s, ny = y + cy * s, nz = z + cz * s;
      if (L === resist || (zWin && nz >= rz0 - 1e-9 && z <= rz1 + 1e-9)) deposit(x, y, z, nx, ny, nz, dE);
      x = nx; y = ny; z = nz; E -= dE;
      if (stop) break;
      if (cross) {
        if (cz < 0) { L--; if (L < 0) { if (primary) { nBack++; eBack += E; } break; } z = zTop[L + 1] - 1e-9; }
        else { L++; if (L >= layers.length) { if (primary) nTrans++; break; } z = zTop[L] + 1e-9; }
        continue;
      }
      if (R() < T.pM[i] * (1 - u) + T.pM[i + 1] * u) { // Møller knock-on: propose ε ∝ 1/ε², accept with g(ε)/g(½)
        const ec = Ec / E, tau = E / 511, c1 = (tau / (tau + 1)) ** 2, c2 = (2 * tau + 1) / ((tau + 1) ** 2), gmax = (2.25 * tau * tau + 2 * tau + 1) / ((tau + 1) ** 2);
        let eps; do { eps = ec / (1 - R() * (1 - 2 * ec)); } while (R() * gmax > 1 + (eps / (1 - eps)) ** 2 + c1 * eps * eps - c2 * eps / (1 - eps));
        const w = eps * E, p2 = 2 * Math.PI * R();
        const s2p = 2 * eps / (2 + tau - tau * eps), s2s = 2 * (1 - eps) / (2 + tau * eps); // non-rel. limit: sin²β=ε, sin²α=1−ε
        const ds = rotate([cx, cy, cz], Math.sqrt(1 - Math.min(1, s2s)), p2 + Math.PI);
        stack.push([x, y, z, ds[0], ds[1], ds[2], w, L, 0]); nSec++;
        E -= w; [cx, cy, cz] = rotate([cx, cy, cz], Math.sqrt(1 - Math.min(1, s2p)), p2);
        if (E <= Ecut) { if (L === resist) deposit(x, y, z, x, y, z, E); break; }
        continue;
      }
      // elastic collision
      const nel = T.els.length; let k = 0;
      if (nel > 1) { const r = R(), base = i * nel; while (k < nel - 1 && r > T.cdf[base + k]) k++; }
      const a = T.aZ[k] / E, r2 = R(), ct = 1 - 2 * a * r2 / (1 + a - r2), st = Math.sqrt(Math.max(0, 1 - ct * ct)), p2 = 2 * Math.PI * R(), cp = Math.cos(p2), sp = Math.sin(p2);
      if (Math.abs(cz) > 0.99999) { cx = st * cp; cy = st * sp; cz = cz > 0 ? ct : -ct; }
      else {
        const sq = Math.sqrt(1 - cz * cz);
        const ncx = cx * ct + st * (cx * cz * cp - cy * sp) / sq, ncy = cy * ct + st * (cy * cz * cp + cx * sp) / sq, ncz = cz * ct - sq * st * cp;
        const nn = 1 / Math.hypot(ncx, ncy, ncz); cx = ncx * nn; cy = ncy * nn; cz = ncz * nn;
      }
    }
    }
    if (onProgress && (e & 1023) === 1023) onProgress((e + 1) / n);
  }
  return { edges, tally, n, nBack, nTrans, eBack, eResist, E0, rMax, nSec };
}

export function mergeMC(parts) {
  const a = parts[0], tally = new Float64Array(a.tally.length);
  let n = 0, nBack = 0, nTrans = 0, eBack = 0, eResist = 0;
  for (const p of parts) { for (let i = 0; i < tally.length; i++) tally[i] += p.tally[i]; n += p.n; nBack += p.nBack; nTrans += p.nTrans; eBack += p.eBack; eResist += p.eResist; }
  return { ...a, tally, n, nBack, nTrans, eBack, eResist };
}

// tally → {r, f, f0, r0} normalised to ∫ f 2πr dr = 1 (f0 = mean density of the central disk)
export function mcToRadial(res) {
  const { edges, tally } = res; let tot = 0; for (const v of tally) tot += v;
  const r = [], f = []; const f0 = tally[0] / (Math.PI * edges[1] ** 2) / tot;
  for (let i = 1; i < tally.length; i++) {
    const a = edges[i], b = edges[i + 1]; if (b === undefined) break;
    if (tally[i] > 0) { r.push(Math.sqrt(a * b)); f.push(tally[i] / (Math.PI * (b * b - a * a)) / tot); }
  }
  return { r, f, f0, r0: edges[1], bse: res.nBack / res.n, eta_energyBack: res.eBack / (res.n * res.E0) };
}
