// Run the Soft-EBeam worker headless, exactly as the app does: node run_flow.mjs <file.gds> key=value ...
// Writes <out>.gds, <out>_dose_table.txt and <out>_figs.json (every written figure, in order, for check_machine.py)
//   top=CELL layers=1,31 preset=si100hsq blur=15 bss=6 current=8 passes=auto|single|split figOrder=meander
//   edgeW=<nm> (default: from the PSF, whole beam steps as in the app) stepFit=0|1 (default 1) out=prefix
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGDS } from './gdslib.mjs';
import { PSF_PRESETS, psfFromParams, psfEnclosed } from '../../../src/softebeam/psf.js';

const A = Object.fromEntries(process.argv.slice(3).map(s => s.split('=')));
const gds = process.argv[2], out = A.out || 'flow';
let last = null; globalThis.self = { postMessage: m => { if (!m.progress) last = m; } };
await import('../../../src/softebeam/engine.worker.js');
let seq = 0; const call = (cmd, args) => { self.onmessage({ data: { id: ++seq, cmd, args } }); if (!last.ok) throw new Error(cmd + ': ' + last.error); return last.result; };
const T = () => performance.now(); let t;

// PSF + automatic fragment sizes, as SoftEBeam.tsx derives them
const pre = PSF_PRESETS.find(p => p.id === (A.preset || 'si100hsq')), blur = +(A.blur ?? 15), blurA = blur > 0 ? blur / (2 * Math.sqrt(Math.LN2)) : 0;
const base = psfFromParams(pre), psf = { terms: base.terms.map(q => ({ s: Math.sqrt(q.s * q.s + blurA * blurA), w: q.w })) };
const sMax = Math.max(...psf.terms.map(q => q.s)), fwd = { terms: psf.terms.filter(q => q.s < 0.1 * sMax) };
let lo = 0.01, hi = 0.1 * sMax; for (let k = 0; k < 60; k++) { const m = Math.sqrt(lo * hi); psfEnclosed(fwd, m) < 1 - 1 / Math.E ? (lo = m) : (hi = m); }
const bss = +(A.bss || 10), current = +(A.current || 1), sleeve = 500;
const e0 = Math.round(Math.min(250, Math.max(20, 3 * hi))), edgeW = A.edgeW ? +A.edgeW : Math.max(bss, Math.round(e0 / bss) * bss), fragMax = Math.round(Math.min(5000, Math.max(4 * edgeW, sMax / 10)));
const frag = { fragMax, edgeW, smallSize: Math.max(300, 4 * edgeW), sleeve, minFig: bss };
const machine = { dacBits: 20, iFine: current, bssFine: bss, iBulk: +(A.iBulk || 20), bssBulk: +(A.bssBulk || 40), minDwell: 20, tSwitch: 300, tField: 1, baseDose: +(A.baseDose || 300) };
const sizes = (A.sizes || '100,200,500,1000').split(',').map(Number);
console.log(`PSF ${pre.label} + ${blur} nm beam: forward α_eff ${hi.toFixed(1)} nm, β ${(sMax / 1000).toFixed(1)} µm; frag`, JSON.stringify(frag));

const lib = parseGDS(readFileSync(gds));
const meta = call('load', { lib }); console.log('cells', meta.cells, 'tops', meta.tops, 'layers', JSON.stringify(meta.layers));
t = T(); const im = call('import', { top: A.top || meta.tops[0], layers: A.layers ? A.layers.split(',').map(Number) : null, window: null, maxPolys: 2e6, bias: 0 });
console.log(`import: ${im.nRings} shapes (${(T() - t).toFixed(0)} ms), bbox`, JSON.stringify(im.bbox));
t = T(); const fr = call('fracture', { mode: 'trap' }); console.log(`fracture: ${fr.n} trapezoids, ${fr.nComp} shapes, ${(fr.area / 1e6).toFixed(1)} µm² (${(T() - t).toFixed(0)} ms)`);
t = T(); const an = call('analyze', { frag, crit: 150, keep: 1000, fine: 3000, sleeve, sizes, machine, priority: 'balanced' });
console.log(`analyze: ${an.nDev} devices (${an.types.length} unique), ${an.nz} critical spots, narrowest ${an.minWidth.toFixed(1)} nm, tightest gap ${an.minGap.toFixed(1)} nm, areas crit/fine/bulk ${an.areas.map(a => (a / 1e6).toFixed(1)).join('/')} µm² (${(T() - t).toFixed(0)} ms)`);
const kinds = {}; for (const z of an.zlist) kinds[z.kind] = (kinds[z.kind] || 0) + 1; console.log('  zone kinds (1 narrow, 2 gap, 3 both):', JSON.stringify(kinds));
for (const p of an.plans.slice(0, 6)) console.log(`  plan #${p.rank}: ${p.size / 1000} µm ${p.placement} ${p.passes}, ${p.fields} fields, ${Math.round(p.stitches)} stitches, ${p.crit} critical, ${(p.time / 60).toFixed(1)} min, score ${p.score.toFixed(1)}`);
const want = A.passes || 'auto', plan = an.plans.find(p => want === 'auto' || p.passes === want);
t = T(); const pe = call('pec', { frag, psf, pec: { enabled: A.pec !== '0', mix: 1, tol: 0.01, maxIter: 60 }, classes: { mode: 'accuracy', acc: 0.01, n: 64, max: 256 } });
let dmin = Infinity, dmax = 0; for (const d of pe.classDose) { dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
console.log(`PEC: ${pe.nFrags} pieces, ${pe.nGroups} dose groups, ${pe.nClasses} classes, dose ${dmin.toFixed(3)}..${dmax.toFixed(3)}, max err ${(100 * (pe.maxErr || 0)).toFixed(2)} % in ${pe.iters} it (${(T() - t).toFixed(0)} ms)`);
const passes = plan.passes === 'split';
t = T(); const fi = call('fields', { fieldsOn: true, size: plan.size, originMode: 'bbox', traversal: 'meanderX', start: 'tl', figOrder: A.figOrder || 'meander', placement: 'plan', plan: { size: plan.size, placement: plan.placement, methods: plan.methods, passes: plan.passes }, passes, merge: true, slivers: true, stepFit: A.stepFit !== '0', bss: [bss, passes ? machine.bssBulk : bss] });
console.log(`fields: plan #${plan.rank} ${fi.placementUsed}, ${fi.nFields} fields of ${fi.size / 1000} µm, ${fi.stitches} stitches (${fi.critCut} critical), ${fi.n} figures (from ${fi.nBefore}), thin ${fi.thinAfter} (was ${fi.thinBefore}), skip-risk ${fi.skipAfter}, whole-step splits ${fi.stepRows}/${fi.stepCols}, passes ${fi.passes} (${(T() - t).toFixed(0)} ms)`);
const ex = call('export', { opts: { mode: 'datatype', layerOut: null, layerBase: 100, cellPerField: false, useFields: true, dbuNm: 1, libName: 'SOFTEBEAM', top: 'TOP', bulkOffset: 100, bss: [bss, passes ? machine.bssBulk : bss] }, baseDose: machine.baseDose });
writeFileSync(out + '.gds', ex.bytes); writeFileSync(out + '_dose_table.txt', ex.table);
console.log('export:', ex.bytes.length, 'bytes; machine check', JSON.stringify(ex.report));
// figure geometry for the machine model: every written figure with its field, pass and dose
const job = { bss, classDose: Array.from(pe.classDose), fields: fi.fields, figs: [] };
const tt = fi.frags.t; for (let k = 0; k < fi.n; k++) { const i = fi.seq[k], o = i * 6; job.figs.push([+tt[o].toFixed(3), +tt[o + 1].toFixed(3), +tt[o + 2].toFixed(3), +tt[o + 3].toFixed(3), +tt[o + 4].toFixed(3), +tt[o + 5].toFixed(3), pe.cls[fi.fragGroup[i]], fi.fragField[i], fi.pass ? fi.pass[i] : 0]); }
writeFileSync(out + '_figs.json', JSON.stringify(job)); console.log('wrote', out + '.gds', out + '_figs.json');
