import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { runMC, mcToRadial } from '../mc.js';
import { parseLpsfXml, cleanRadial, fitMultiGauss, psfEnclosed, fitPSF } from '../psf.js';
let fail = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
const N = +(process.argv[2] || 20000);
// 1) backscatter coefficients, bulk targets at 20 keV (thin dummy resist of the same material)
for (const [m, lo, hi] of [['Si', 0.13, 0.22], ['Cu', 0.24, 0.36], ['Au', 0.38, 0.56]]) {
  const t0 = Date.now(); const r = runMC({ layers: [{ mat: m, t: 10 }, { mat: m, t: Infinity }], E0: 20, n: 4000, seed: 3 });
  const eta = r.nBack / r.n; ok(eta > lo && eta < hi, `${m} 20 keV backscatter coefficient ${eta.toFixed(3)} (lit. range ${lo}-${hi}) ${Date.now() - t0} ms`);
}
// 2) PSF vs TRACER: PMMA 100 nm / Si, 50 kV, slab z=40..50 nm
const t0 = Date.now();
const res = runMC({ layers: [{ mat: 'PMMA', t: 100 }, { mat: 'Si', t: Infinity }], E0: 50, n: N, beamSigma: 0.75 / Math.SQRT2, seed: 7, zWin: [40, 50] });
const dt = Date.now() - t0;
const rad = mcToRadial(res), fit = fitMultiGauss(rad), g2 = fitPSF(rad.r, rad.f);
console.log(`   MC ${N} e⁻ in ${dt} ms (${(N / dt * 1000).toFixed(0)} e/s); BSE ${rad.bse.toFixed(3)}; 2G α=${g2.alpha.toFixed(1)} β=${(g2.beta / 1000).toFixed(2)}µm η=${g2.eta.toFixed(2)}`);
const ref = 'C:/Program Files/BEAMER/7.6.1_x64/Repository/2D.Archive/psf2data/trc20131108T132234.lpsf';
if (existsSync(ref)) {
  const d = cleanRadial(parseLpsfXml(inflateSync(readFileSync(ref)).toString('latin1'))), tf = fitMultiGauss(d), t2 = fitPSF(d.r, d.f);
  console.log(`   TRACER 2G α=${t2.alpha.toFixed(1)} β=${(t2.beta / 1000).toFixed(2)}µm η=${t2.eta.toFixed(2)}`);
  console.log('   enclosed energy  r:      ours   TRACER');
  let worst = 0;
  for (const R of [2, 5, 10, 30, 100, 300, 1000, 3000, 6000, 10000, 15000]) {
    const a = psfEnclosed(fit.psf, R), b = psfEnclosed(tf.psf, R); worst = Math.max(worst, Math.abs(a - b));
    console.log(`   ${String(R).padStart(14)} nm  ${a.toFixed(3)}   ${b.toFixed(3)}`);
  }
  ok(worst < 0.06, `max enclosed-energy difference vs TRACER ${worst.toFixed(3)}`);
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
