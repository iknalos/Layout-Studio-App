/* eslint-disable no-restricted-globals */
// Soft-EBeam pipeline worker: keeps the layout and every stage result off the UI thread.
import { flattenLib, biasRing, healAndFracture, toRectangles, fragmentForPEC, tileFields, topCells, layersOf, trapArea } from './geom.js';
import { runPEC, quantizeDoses, quantizeLadder, simulate, contour, energyAt } from './pec.js';
import { exportGDS, doseTable } from './export.js';

const S = {};
const post = (msg, transfer) => self.postMessage(msg, transfer || []);

function flatRings(rings, ringLayer) { // pack rings for drawing: coords + offsets + layer
  let n = 0; for (const r of rings) n += r.length;
  const xy = new Float64Array(n), off = new Int32Array(rings.length + 1); let o = 0;
  rings.forEach((r, i) => { xy.set(r, o); o += r.length; off[i + 1] = o; });
  return { xy, off, layer: Int32Array.from(ringLayer) };
}
const copyTraps = tr => ({ n: tr.n, t: tr.t.slice(), layer: tr.layer.slice(), comp: tr.comp.slice() });

const cmds = {
  load({ lib }) {
    Object.keys(S).forEach(k => delete S[k]); S.lib = lib;
    return { tops: topCells(lib), layers: layersOf(lib), cells: lib.cells.length, dbUnit: lib.dbUnit, name: lib.name };
  },
  import({ top, layers, window, maxPolys, bias }) {
    const F = flattenLib(S.lib, { top, layers: layers ? new Set(layers) : null, window, maxPolys });
    let rings = F.rings;
    if (bias) rings = rings.map(r => biasRing(r, bias));
    S.rings = rings; S.ringLayer = F.ringLayer; S.bbox = F.bbox;
    for (const k of ['traps', 'F', 'pec', 'T', 'q']) delete S[k];
    const pack = flatRings(rings, F.ringLayer);
    return { result: { nRings: rings.length, bbox: F.bbox, truncated: F.truncated, top: F.top, ...pack }, transfer: [pack.xy.buffer, pack.off.buffer, pack.layer.buffer] };
  },
  fracture({ mode, rectStep }) {
    if (!S.rings || !S.rings.length) throw new Error('nothing imported (no shapes on the selected layers / region)');
    let { traps, nComp, compSrc } = healAndFracture(S.rings, S.ringLayer);
    if (mode === 'rect') traps = toRectangles(traps, rectStep || 10);
    S.traps = traps; S.nComp = nComp; S.compSrc = compSrc;
    for (const k of ['F', 'pec', 'T', 'q']) delete S[k];
    let area = 0; for (let i = 0; i < traps.n; i++) area += trapArea(traps.t, i * 6);
    const c = copyTraps(traps);
    return { result: { n: traps.n, nComp, area, traps: c }, transfer: [c.t.buffer, c.layer.buffer, c.comp.buffer] };
  },
  pec({ frag, psf, pec, classes }, progress) {
    if (!S.traps) throw new Error('run Heal & Fracture first');
    const F = fragmentForPEC(S.traps, S.nComp, frag); S.F = F;
    let dose, P = null;
    if (pec.enabled) {
      P = runPEC(F, psf, { ...pec, fragMax: frag.fragMax }, m => progress(m));
      dose = P.dose;
    } else dose = new Float64Array(F.nGroups).fill(1);
    const q = classes.mode === 'accuracy' ? quantizeLadder(dose, classes.acc, classes.max) : quantizeDoses(dose, classes.n, classes.mode === 'fixedlog' ? 'log' : 'linear');
    const Dq = Float64Array.from(dose, (d, i) => q.classDose[q.cls[i]]);
    const qErr = P ? energyAt(P, Dq) : null;
    // area per class
    const areas = new Float64Array(q.n + 1), t = F.frags.t; for (let i = 0; i < F.frags.n; i++) areas[q.cls[F.fragGroup[i]]] += trapArea(t, i * 6);
    S.pec = P; S.dose = dose; S.q = q; S.Dq = Dq; S.areas = areas; delete S.T;
    const fr = copyTraps(F.frags), out = {
      nFrags: F.frags.n, nGroups: F.nGroups, frags: fr, fragGroup: F.fragGroup.slice(), ctrl: F.ctrl.slice(), kind: F.kind.slice(),
      dose: dose.slice(), cls: q.cls.slice(), classDose: q.classDose.slice(), counts: Array.from(q.counts || []), areas: Array.from(areas), nClasses: q.n, accuracy: q.accuracy,
      iters: P ? P.iters : 0, maxErr: P ? P.maxErr : null, rmsErr: P ? P.rmsErr : null, history: P ? P.history : [], qMaxErr: qErr ? qErr.mx : null, qRmsErr: qErr ? qErr.rms : null,
      eta: P ? P.eta : null, plan: P ? { short: P.plan.short.length, long: P.plan.long.length } : null, corrected: !!pec.enabled,
    };
    return { result: out, transfer: [fr.t.buffer, fr.layer.buffer, fr.comp.buffer, out.fragGroup.buffer, out.ctrl.buffer, out.kind.buffer, out.dose.buffer, out.cls.buffer] };
  },
  fields({ size, originMode, ox, oy }) {
    if (!S.F) throw new Error('run PEC first');
    const T = tileFields(S.F.frags, S.F.fragGroup, { size, originMode, ox, oy, bbox: S.bbox }); S.T = T;
    const fr = copyTraps(T.frags);
    return { result: { n: T.frags.n, frags: fr, fragGroup: T.fragGroup.slice(), fragField: T.fragField.slice(), fields: T.fields, order: T.order, NX: T.NX, NY: T.NY }, transfer: [fr.t.buffer, fr.layer.buffer, fr.comp.buffer] };
  },
  sim({ win, pitch, thr, psf, uniform }) {
    if (!S.F) throw new Error('run PEC first');
    const D = uniform ? new Float64Array(S.F.nGroups).fill(1) : S.Dq;
    const sim = simulate(S.F, D, psf, win, pitch);
    const seg = contour(sim, thr);
    return { result: { ...sim, seg }, transfer: [sim.E.buffer, seg.buffer] };
  },
  export({ opts, baseDose }) {
    if (!S.F) throw new Error('run PEC first');
    const src = S.T && opts.useFields ? S.T : null;
    const job = { frags: src ? src.frags : S.F.frags, fragGroup: src ? src.fragGroup : S.F.fragGroup, groupClass: S.q.cls, classDose: S.q.classDose, fragField: src && src.fragField, fields: src && src.fields, order: src && src.order };
    const bytes = exportGDS(job, opts);
    const table = doseTable(S.q.classDose, S.q.counts, S.areas, { baseDose, mode: opts.mode, layerBase: opts.layerBase });
    return { result: { bytes, table }, transfer: [bytes.buffer] };
  },
};

self.onmessage = e => {
  const { id, cmd, args } = e.data;
  const progress = p => post({ id, progress: p });
  try {
    const r = cmds[cmd](args || {}, progress);
    const { result, transfer } = r && r.result !== undefined ? r : { result: r, transfer: [] };
    post({ id, ok: true, result }, transfer);
  } catch (err) { post({ id, ok: false, error: (err && err.message) || String(err) }); }
};
