// Validates PSF import + fitting against the TRACER PSFs shipped with a local BEAMER install (read-only, not redistributed).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { parseLpsfXml, cleanRadial, fitPSF, psfEval, psfFromParams, fitMultiGauss } from '../psf.js';
const dir = process.argv[2] || 'C:/Program Files/BEAMER/7.6.1_x64/Repository/2D.Archive/psf2data';
let fail = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
{ // synthetic round-trip
  const truth = psfFromParams({ alpha: 12, beta: 9500, eta: 0.74 });
  const r = []; for (let x = 1; x < 60000; x *= 1.05) r.push(x);
  const f = r.map(x => psfEval(truth, x));
  const fit = fitPSF(r, f);
  ok(Math.abs(fit.alpha / 12 - 1) < 0.01 && Math.abs(fit.beta / 9500 - 1) < 0.01 && Math.abs(fit.eta / 0.74 - 1) < 0.01, `synthetic fit α=${fit.alpha.toFixed(2)} β=${fit.beta.toFixed(0)} η=${fit.eta.toFixed(3)}`);
}
if (existsSync(dir)) {
  const out = [];
  for (const fn of readdirSync(dir).filter(f => f.endsWith('.lpsf'))) {
    const d = parseLpsfXml(inflateSync(readFileSync(`${dir}/${fn}`)).toString('latin1'));
    const c = cleanRadial(d);
    const f2 = fitPSF(c.r, c.f), f3 = fitPSF(c.r, c.f, { nTerms: 3 });
    const mg = fitMultiGauss(c);
    if (mg.maxCumErr > 0.01 || mg.negMass > 0.01) { fail++; console.log('FAIL multi-Gauss enclosed-energy error', mg.maxCumErr.toFixed(4), 'negative mass', mg.negMass.toExponential(1), fn); }
    out.push({ neg: mg.negMass, mgc: mg.maxCumErr, mg: mg.rmsLog, mgn: mg.psf.terms.length, kV: d.energy_kV, stack: d.stack.map(s => `${s.material} ${s.thickness_nm}`).join(' / '), z: d.z_um, n: c.r.length, rmax: c.r[c.r.length - 1], a2: f2.alpha, b2: f2.beta, e2: f2.eta, rms2: f2.rmsLog, a3: f3.alpha, b3: f3.beta, e3: f3.eta, g3: f3.gamma, n3: f3.nu, rms3: f3.rmsLog });
  }
  out.sort((a, b) => (a.stack > b.stack ? 1 : -1) || a.kV - b.kV);
  for (const o of out) console.log(`${String(o.kV).padStart(3)} kV | ${o.stack.padEnd(34)} z=${o.z}µm | 2G α=${o.a2.toFixed(1)} β=${(o.b2 / 1000).toFixed(2)}µm η=${o.e2.toFixed(3)} rms=${o.rms2.toFixed(2)} | 3G α=${o.a3.toFixed(1)} β=${(o.b3 / 1000).toFixed(2)} η=${o.e3.toFixed(3)} γ=${o.g3.toFixed(0)} ν=${o.n3.toFixed(3)} rms=${o.rms3.toFixed(2)} | multiG(${o.mgn}) rms=${o.mg.toFixed(3)} maxΔE=${o.mgc.toFixed(4)} neg=${o.neg.toExponential(1)}`);
  ok(out.length > 0, `parsed ${out.length} TRACER PSFs`);
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
