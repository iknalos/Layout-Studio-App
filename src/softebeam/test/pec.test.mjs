import { healAndFracture, fragmentForPEC } from '../geom.js';
import { runPEC, quantizeDoses, simulate, contour, energyAt, gaussTrap, erf } from '../pec.js';
import { psfFromParams } from '../psf.js';
let fail = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
const R = (x0, y0, x1, y1) => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1]);

{ // integrals
  ok(Math.abs(erf(0.5) - 0.5204998778) < 2e-7, 'erf(0.5)');
  const t = new Float64Array([-1e6, 1e6, -1e6, 1e6, -1e6, 1e6]); ok(Math.abs(gaussTrap(t, 0, 0, 0, 50) - 1) < 1e-6, 'full plane = 1');
  const h = new Float64Array([-1e6, 1e6, 0, 1e6, 0, 1e6]); ok(Math.abs(gaussTrap(h, 0, 0, 0, 50) - 0.5) < 1e-6, 'half plane at edge = 0.5');
  const tri = new Float64Array([0, 1000, 0, 1000, 0, 0]); // right triangle area 500k, check vs fine Riemann
  let s = 0; const sg = 300; for (let y = 0.5; y < 1000; y++) for (let x = 0.5; x < 1000 - y; x++) s += Math.exp(-((x - 200) ** 2 + (y - 300) ** 2) / (sg * sg)) / (Math.PI * sg * sg);
  ok(Math.abs(gaussTrap(tri, 0, 200, 300, sg) - s) < 2e-3, `slanted trapezoid ${gaussTrap(tri, 0, 200, 300, sg).toFixed(5)} vs ${s.toFixed(5)}`);
}

// layout: isolated 100 nm line, grating 100/200 nm pitch, 20 µm pad
const rings = [R(0, 0, 100, 10000)];
for (let i = 0; i < 40; i++) rings.push(R(5000 + i * 200, 0, 5100 + i * 200, 10000));
rings.push(R(20000, 0, 40000, 20000));
const { traps, nComp } = healAndFracture(rings, rings.map(() => 1));
const F = fragmentForPEC(traps, nComp, { fragMax: 1000, edgeW: 100, smallSize: 500 });
const psf = psfFromParams({ alpha: 15, beta: 10000, eta: 0.7 });
let t0 = Date.now();
const pec = runPEC(F, psf, { fragMax: 1000, tol: 0.01 });
console.log(`   PEC: ${F.frags.n} frags, ${F.nGroups} groups, ${pec.iters} iters, maxErr ${(pec.maxErr * 100).toFixed(2)}%, ${Date.now() - t0} ms; terms short=${pec.plan.short.map(t => t.s)} long=${pec.plan.long.map(t => t.s)}`);
ok(pec.maxErr < 0.01, 'converged < 1%');
// doses by region
const meanDose = (xa, xb) => { let s = 0, n = 0; for (let i = 0; i < F.frags.n; i++) { const o = i * 6, cx = 0.25 * (F.frags.t[o + 2] + F.frags.t[o + 3] + F.frags.t[o + 4] + F.frags.t[o + 5]), cy = 0.5 * (F.frags.t[o] + F.frags.t[o + 1]); if (cx > xa && cx < xb && cy > 3000 && cy < 7000) { s += pec.dose[F.fragGroup[i]]; n++; } } return s / n; };
const dIso = meanDose(0, 100), dGrat = meanDose(8900, 9100), dPad = meanDose(29000, 31000);
console.log(`   doses: isolated ${dIso.toFixed(3)}  grating centre ${dGrat.toFixed(3)}  pad centre ${dPad.toFixed(3)}`);
ok(dIso > 1.5 && dIso < 1.72, 'isolated line ≈ 1+η minus grating backscatter');
ok(dGrat < dIso && dGrat > 0.8, 'grating < isolated');
const padTheory = 1.7 / (1 + 0.7 * erf(1) ** 2); ok(Math.abs(dPad - padTheory) < 0.05, `pad centre ≈ (1+η)/(1+η·erf(1)²) = ${padTheory.toFixed(3)}`);
// quantise
const q = quantizeDoses(pec.dose, 32);
const Dq = Float64Array.from(pec.dose, (d, i) => q.classDose[q.cls[i]]);
const eq = energyAt(pec, Dq); console.log(`   32 classes: ${q.lo.toFixed(3)}–${q.hi.toFixed(3)}, maxErr ${(eq.mx * 100).toFixed(2)}%`);
ok(eq.mx < 0.03, 'quantised error < 3%');
// simulate CD across lines at y=5000
const cd = (D, xa, xb) => {
  const sim = simulate(F, D, psf, { x0: xa, y0: 4990, x1: xb, y1: 5010 }, 1);
  const row = Math.floor(sim.ny / 2), widths = []; let start = null;
  for (let i = 0; i < sim.nx; i++) { const v = sim.E[row * sim.nx + i], x = sim.x0 + (i + 0.5) * sim.pitch;
    const vp = i ? sim.E[row * sim.nx + i - 1] : 0, xp = x - sim.pitch;
    if (vp < 0.5 && v >= 0.5) start = xp + (0.5 - vp) / (v - vp) * sim.pitch;
    if (vp >= 0.5 && v < 0.5 && start !== null) { widths.push(xp + (vp - 0.5) / (vp - v) * sim.pitch - start); start = null; } }
  return widths;
};
const ones = new Float64Array(F.nGroups).fill(1);
const wIso0 = cd(ones, -200, 300), wIso = cd(Dq, -200, 300);
const wG0 = cd(ones, 8800, 9200), wG = cd(Dq, 8800, 9200);
const wP0 = cd(ones, 19700, 20300), wP = cd(Dq, 19700, 20300);
console.log(`   uncorrected: iso ${wIso0.map(v => v.toFixed(1))}  grating ${wG0.map(v => v.toFixed(1))}`);
console.log(`   corrected  : iso ${wIso.map(v => v.toFixed(1))}  grating ${wG.map(v => v.toFixed(1))}`);
ok(wIso.length === 1 && Math.abs(wIso[0] - 100) < 6, 'isolated line CD ≈ 100 nm after PEC');
ok(wG.length >= 1 && wG.every(w => Math.abs(w - 100) < 8), 'grating CD ≈ 100 nm after PEC');
const sim = simulate(F, Dq, psf, { x0: 19000, y0: 19000, x1: 21000, y1: 21000 }, 10);
const seg = contour(sim, 0.5); ok(seg.length > 0, `pad-corner contour ${seg.length / 4} segments`);
// pad edge position
const pe = (() => { const s2 = simulate(F, Dq, psf, { x0: 19800, y0: 9990, x1: 20200, y1: 10010 }, 1), row = Math.floor(s2.ny / 2); for (let i = 1; i < s2.nx; i++) { const a = s2.E[row * s2.nx + i - 1], b = s2.E[row * s2.nx + i]; if (a < 0.5 && b >= 0.5) return s2.x0 + (i - 0.5 + (0.5 - a) / (b - a)) * s2.pitch; } return NaN; })();
ok(Math.abs(pe - 20000) < 6, `pad edge at ${pe.toFixed(1)} nm (drawn 20000)`);
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
{ // mix factor + ladder classes
  const { quantizeLadder } = await import('../pec.js');
  const p1 = runPEC(F, psf, { fragMax: 1000, tol: 0.01, mix: 1 }), p0 = runPEC(F, psf, { fragMax: 1000, tol: 0.01, mix: 0 });
  ok(p1.maxErr < 0.01 && p0.maxErr < 0.01, `mix=1 / mix=0 converge (${p1.iters}, ${p0.iters} iters), η=${p1.eta.toFixed(2)}`);
  const pad = D => { let s = 0, n = 0; for (let i = 0; i < F.frags.n; i++) { const o = i * 6, t = F.frags.t, cx = 0.25 * (t[o + 2] + t[o + 3] + t[o + 4] + t[o + 5]), cy = 0.5 * (t[o] + t[o + 1]); if (cx > 29000 && cx < 31000 && cy > 9000 && cy < 11000) { s += D[F.fragGroup[i]]; n++; } } return s / n; };
  ok(pad(p1.dose) < pad(p0.dose), `edge equalization uses less dose in pads (${pad(p1.dose).toFixed(3)}) than uniform clearing (${pad(p0.dose).toFixed(3)})`);
  const q = quantizeLadder(p1.dose, 0.03);
  ok(q.n > 3 && Math.abs(q.classDose[1] / q.classDose[2] - 1 / 1.03) < 1e-9, `3% ladder: ${q.n} classes ${q.classDose[1].toFixed(3)}…${q.classDose[q.n].toFixed(3)}`);
  const Dq = Float64Array.from(p1.dose, (d, i) => q.classDose[q.cls[i]]);
  const w = cd(Dq, 8800, 9200); ok(w.every(v => Math.abs(v - 100) < 8), `edge-equalized + 3% ladder grating CD ${w.map(v => v.toFixed(1))}`);
  console.log(fail ? `${fail} FAILED` : 'ALL PASS (incl. mix/ladder)');
}
