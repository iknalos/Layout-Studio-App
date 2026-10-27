/* eslint-disable no-restricted-globals */
// Soft-EBeam pipeline worker: keeps the layout and every stage result off the UI thread.
import { absorbSlivers, beamStepFit, TrapBuf, flattenLib, biasRing, healAndFracture, toRectangles, fragmentForPEC, tileFields, fieldSequence, figureSequence, topCells, layersOf, trapArea, fragmentAdjacency, followGeometryFields, straightenCuts, bestGridOffset, fieldMetrics, structureSeeds, geoDistance, mergeFigures, trapGap } from './geom.js';
import { runPEC, quantizeDoses, quantizeLadder, simulate, contour, energyAt } from './pec.js';
import { exportGDS, doseTable } from './export.js';
import { analyzeStructure, cutWeight, zonesSplit } from './analyze.js';
import { deviceIndex, evaluateSize, rankPlans, buildPlanFields, METHOD_LABEL } from './plan.js';

const S = {};
const post = (msg, transfer) => self.postMessage(msg, transfer || []);

function flatRings(rings, ringLayer) { // pack rings for drawing: coords + offsets + layer
  let n = 0; for (const r of rings) n += r.length;
  const xy = new Float64Array(n), off = new Int32Array(rings.length + 1); let o = 0;
  rings.forEach((r, i) => { xy.set(r, o); o += r.length; off[i + 1] = o; });
  return { xy, off, layer: Int32Array.from(ringLayer) };
}
const copyTraps = tr => ({ n: tr.n, t: tr.t.slice(), layer: tr.layer.slice(), comp: tr.comp.slice() });
const DOWNSTREAM = ['pec', 'T', 'q', 'adjF', 'dose', 'Dq', 'areas', 'areasPass'];
const clear = keys => keys.forEach(k => delete S[k]);
const fragKey = frag => JSON.stringify([frag.fragMax, frag.edgeW, frag.smallSize, frag.sleeve || 0, frag.minFig || 0]);
const ensureFrags = frag => { if (!S.F || S.fragKey !== fragKey(frag)) { S.F = fragmentForPEC(S.traps, S.nComp, frag); S.fragKey = fragKey(frag); clear(['an', 'DI', 'evals']); return true; } return false; };
// pass of a dose group: 0 fine (critical + fine), 1 bulk
const passOfGroup = () => S.an ? Uint8Array.from(S.an.groupCls, c => c === 2 ? 1 : 0) : null;
const slimPlan = p => ({ rank: p.rank, size: p.size, placement: p.placement, passes: p.passes, fields: p.fields, stitches: p.stitches, crit: p.crit, risk: p.risk, cutLen: p.cutLen, time: p.time, beam: p.beam, overhead: p.overhead, score: p.score, feasible: p.feasible, addr: p.addr, fitDevices: p.fitDevices, bigDevices: p.bigDevices, methods: p.methods, why: p.why, sampled: p.sampled || false });

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
    clear(['traps', 'F', 'fragKey', 'an', 'DI', 'evals', ...DOWNSTREAM]);
    const pack = flatRings(rings, F.ringLayer);
    return { result: { nRings: rings.length, bbox: F.bbox, truncated: F.truncated, top: F.top, ...pack }, transfer: [pack.xy.buffer, pack.off.buffer, pack.layer.buffer] };
  },
  fracture({ mode, rectStep }) {
    if (!S.rings || !S.rings.length) throw new Error('nothing imported (no shapes on the selected layers / region)');
    let { traps, nComp, compSrc } = healAndFracture(S.rings, S.ringLayer);
    if (mode === 'rect') traps = toRectangles(traps, rectStep || 10);
    S.traps = traps; S.nComp = nComp; S.compSrc = compSrc;
    clear(['F', 'fragKey', 'an', 'DI', 'evals', ...DOWNSTREAM]);
    let area = 0; for (let i = 0; i < traps.n; i++) area += trapArea(traps.t, i * 6);
    const c = copyTraps(traps);
    return { result: { n: traps.n, nComp, area, traps: c }, transfer: [c.t.buffer, c.layer.buffer, c.comp.buffer] };
  },
  // structure analysis + every write plan scored with the machine model
  analyze({ frag, crit = 150, keep = 1000, fine = 3000, sleeve = 500, sizes = [100, 200, 500, 1000], machine = {}, priority = 'balanced' }, progress) {
    if (!S.traps) throw new Error('run Heal & Fracture first');
    S.F = null; ensureFrags(frag); clear(DOWNSTREAM);
    const t0 = performance.now();
    S.an = analyzeStructure(S.rings, S.ringLayer, S.traps, S.nComp, S.F, { crit, keep, fine, sleeve }, progress);
    S.DI = deviceIndex(S.F, S.an); S.evals = new Map();
    const tA = performance.now();
    for (const s of sizes) { progress({ label: `Plans: ${s} µm fields` }); S.evals.set(s, evaluateSize(S.F, S.an, S.DI, s * 1000, progress)); }
    const plans = rankPlans(sizes.map(s => S.evals.get(s)), S.an, machine, priority).map(slimPlan), an = S.an;
    const fr = copyTraps(S.F.frags), cls = an.cls.slice(), zones = an.zones.slice(), devBox = an.devBox.slice(), devType = an.devType.slice();
    const zlist = []; for (let z = 0; z < Math.min(an.nz, 500); z++) { const zi = an.zinfo[z]; zlist.push({ z, kind: zi.kind, minW: zi.minW, minG: zi.minG, dev: an.zoneDev[z], x0: zones[4 * z], y0: zones[4 * z + 1], x1: zones[4 * z + 2], y1: zones[4 * z + 3] }); }
    return { result: { frags: fr, cls, zones, nz: an.nz, zlist, devBox, devType, nDev: an.nDev, types: an.types.map(t => ({ n: t.n, w: t.w, h: t.h, zones: t.zones })), areas: an.areas, counts: an.counts, minGap: an.minGap, minWidth: an.minWidth, maxDev: an.maxDev, slivers: an.slivers,
      crit, keep, fine, sleeve, plans, sizes, msAnalyze: Math.round(tA - t0), msPlans: Math.round(performance.now() - tA) },
      transfer: [fr.t.buffer, fr.layer.buffer, fr.comp.buffer, cls.buffer, zones.buffer, devBox.buffer, devType.buffer] };
  },
  // re-rank (new machine settings / priority / field sizes) without repeating the analysis
  plans({ sizes, machine = {}, priority = 'balanced', dose }, progress) {
    if (!S.an) throw new Error('run Analyze first');
    for (const s of sizes) if (!S.evals.has(s)) { progress({ label: `Plans: ${s} µm fields` }); S.evals.set(s, evaluateSize(S.F, S.an, S.DI, s * 1000, progress)); }
    return { plans: rankPlans(sizes.map(s => S.evals.get(s)), S.an, machine, priority, dose).map(slimPlan) };
  },
  pec({ frag, psf, pec, classes }, progress) {
    if (!S.traps) throw new Error('run Heal & Fracture first');
    const fresh = ensureFrags(frag), F = S.F;
    let dose, P = null;
    if (pec.enabled) {
      P = runPEC(F, psf, { ...pec, fragMax: frag.fragMax }, m => progress(m));
      dose = P.dose;
    } else dose = new Float64Array(F.nGroups).fill(1);
    const q = classes.mode === 'accuracy' ? quantizeLadder(dose, classes.acc, classes.max) : quantizeDoses(dose, classes.n, classes.mode === 'fixedlog' ? 'log' : 'linear');
    const Dq = Float64Array.from(dose, (d, i) => q.classDose[q.cls[i]]);
    const qErr = P ? energyAt(P, Dq) : null;
    // area per class (and per pass when the analysis split the pattern)
    const areas = new Float64Array(q.n + 1), t = F.frags.t, pg = passOfGroup(), areasPass = pg ? [new Float64Array(q.n + 1), new Float64Array(q.n + 1)] : null;
    for (let i = 0; i < F.frags.n; i++) { const a = trapArea(t, i * 6), g = F.fragGroup[i], c = q.cls[g]; areas[c] += a; if (pg) areasPass[pg[g]][c] += a; }
    S.pec = P; S.dose = dose; S.q = q; S.Dq = Dq; S.areas = areas; S.areasPass = areasPass; delete S.T; delete S.adjF;
    const fr = fresh || !S.an ? copyTraps(F.frags) : null, out = {
      nFrags: F.frags.n, nGroups: F.nGroups, frags: fr, fragGroup: F.fragGroup.slice(), ctrl: F.ctrl.slice(), kind: F.kind.slice(),
      dose: dose.slice(), cls: q.cls.slice(), classDose: q.classDose.slice(), counts: Array.from(q.counts || []), areas: Array.from(areas), areasPass: areasPass && areasPass.map(a => Array.from(a)), nClasses: q.n, accuracy: q.accuracy,
      iters: P ? P.iters : 0, maxErr: P ? P.maxErr : null, rmsErr: P ? P.rmsErr : null, history: P ? P.history : [], qMaxErr: qErr ? qErr.mx : null, qRmsErr: qErr ? qErr.rms : null,
      eta: P ? P.eta : null, plan: P ? { short: P.plan.short.length, long: P.plan.long.length } : null, corrected: !!pec.enabled, staleAnalysis: fresh,
    };
    const tr = [out.fragGroup.buffer, out.ctrl.buffer, out.kind.buffer, out.dose.buffer, out.cls.buffer]; if (fr) tr.push(fr.t.buffer, fr.layer.buffer, fr.comp.buffer);
    return { result: out, transfer: tr };
  },
  fields({ fieldsOn = true, size, originMode, ox, oy, traversal = 'meanderX', start = 'bl', figOrder = 'meander', placement = 'plan', plan = null, passes = false, merge = true, slivers = true, stepFit = false, bss = [10, 40] }, progress) {
    if (!S.F || !S.q) throw new Error('run PEC first');
    const t = S.F.frags.t; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < S.F.frags.n; i++) { const o = i * 6; x0 = Math.min(x0, t[o + 2], t[o + 4]); x1 = Math.max(x1, t[o + 3], t[o + 5]); y0 = Math.min(y0, t[o]); y1 = Math.max(y1, t[o + 1]); }
    const bbox = { x0, y0, x1, y1 }, whole = Math.max(x1 - x0, y1 - y0) * 1.001 + 1, an = S.an;
    if (placement === 'plan' && !(plan && an)) placement = 'auto';
    if (plan && placement === 'plan') size = plan.size;
    const measure = (T, seq) => { const a = fragmentAdjacency(T.frags), m = fieldMetrics(T.frags, a, T.fragField, T.fields, seq, an ? cutWeight(an, T.frags) : null), z = an ? zonesSplit(an, T.frags, T.fragField) : { n: 0, pts: new Float64Array(0) }; return { ...m, crit: z.n, critPts: z.pts, adj: a }; };
    const grid = (name, T) => { const seq = fieldSequence(T.NX, T.NY, traversal, start); return { name, T, seq, m: measure(T, seq), seedMode: 'end' }; };
    const follow = (name, st) => {
      if (!S.adjF) S.adjF = fragmentAdjacency(S.F.frags);
      const r = followGeometryFields(S.F.frags, S.adjF, { size, start: st }), z = straightenCuts(S.F.frags, S.F.fragGroup, S.adjF, r.fragField, r.fields, size);
      const T = { frags: z.frags, fragGroup: z.fragGroup, fragField: z.fragField, fields: z.fields, NX: z.fields.length, NY: 1 };
      return { name, T, seq: r.fieldSeq, m: measure(T, r.fieldSeq), seedMode: st };
    };
    const adaptive = (name, methods, pl = 'adaptive') => { const B = buildPlanFields(S.F, an, S.DI, size, methods, pl); const T = { frags: B.frags, fragGroup: B.fragGroup, fragField: B.fragField, fields: B.fields, NX: B.NX, NY: 1 }; return { name, T, seq: B.fieldSeq, m: measure(T, B.fieldSeq), seedMode: 'end' }; };
    const cands = [];
    if (!fieldsOn) cands.push(grid('One field', tileFields(S.F.frags, S.F.fragGroup, { size: whole, originMode: 'bbox', bbox })));
    else if (placement === 'plan') { progress({ label: 'Fields: building the write plan' }); cands.push(adaptive(plan.placement === 'grid' ? 'Write plan: fixed grid' : 'Write plan', plan.methods || [], plan.placement)); }
    else {
      const want = k => placement === k || placement === 'auto';
      if (an && want('devices')) { progress({ label: 'Fields: adaptive per device' }); const ev = S.evals && S.evals.get(size / 1000) || evaluateSize(S.F, an, S.DI, size); cands.push(adaptive('Adaptive per device', ev.types.map(T => T ? T.opts[T.best].method : null))); }
      const done = cands.length && cands[0].m.stitches === 0 && cands[0].m.crit === 0; // nothing left to improve
      if (!done) {
        if (want('grid')) { progress({ label: 'Fields: fixed grid' }); cands.push(grid('Fixed grid', tileFields(S.F.frags, S.F.fragGroup, { size, originMode, ox, oy, bbox }))); }
        if (want('gridOpt')) { progress({ label: 'Fields: optimising grid offset' }); const o = bestGridOffset(S.F.frags, size, bbox); cands.push(grid('Fixed grid, optimised offset', tileFields(S.F.frags, S.F.fragGroup, { size, originMode: 'custom', ox: o.X0, oy: o.Y0, bbox }))); }
        if (want('followCenter')) { progress({ label: 'Fields: follow geometry (centre first)' }); cands.push(follow('Follow geometry, centre first', 'center')); }
        if (want('followEnd')) { progress({ label: 'Fields: follow geometry (from one end)' }); cands.push(follow('Follow geometry, from one end', 'end')); }
      }
    }
    // critical cuts first, then weighted stitches and cut length; field count and stage travel break ties
    const score = c => 100 * c.m.crit + c.m.cost + 0.2 * c.m.cutLen / 1e6 + 0.02 * c.m.fields + 0.01 * c.m.travel / 1e6;
    let best = cands[0]; for (const c of cands) if (score(c) < score(best)) best = c;
    let T = best.T; const nBefore = T.frags.n;
    const pg = passes ? passOfGroup() : null;
    let pass = pg ? Uint8Array.from(T.fragGroup, g => pg[g]) : null, share = null, nSeam = 0;
    if (pg) {
      // Shared seam: fine figures that border the bulk pass are written in BOTH passes at half dose. Aligned, the dose is
      // unchanged; if the bulk pass lands Δ off, a Δ-wide strip gets half dose instead of none (no unexposed slit).
      const a0 = fragmentAdjacency(T.frags), seam = [];
      for (let i = 0; i < T.frags.n; i++) { if (pass[i] || S.an.groupCls[T.fragGroup[i]] === 0 || S.F.kind[T.fragGroup[i]]) continue; /* never the outline itself */ for (let k = a0.start[i]; k < a0.start[i + 1]; k++) if (pass[a0.nb[k]]) { seam.push(i); break; } }
      if (seam.length) {
        const n0 = T.frags.n, m = n0 + seam.length, buf = new TrapBuf(m), t0 = T.frags.t;
        for (let i = 0; i < n0; i++) { const o = i * 6; buf.push(t0[o], t0[o + 1], t0[o + 2], t0[o + 3], t0[o + 4], t0[o + 5], T.frags.layer[i], T.frags.comp[i]); }
        for (const i of seam) { const o = i * 6; buf.push(t0[o], t0[o + 1], t0[o + 2], t0[o + 3], t0[o + 4], t0[o + 5], T.frags.layer[i], T.frags.comp[i]); }
        const grp = new Int32Array(m), fld = new Int32Array(m), ps = new Uint8Array(m); share = new Uint8Array(m);
        grp.set(T.fragGroup); fld.set(T.fragField); ps.set(pass);
        seam.forEach((i, k) => { grp[n0 + k] = T.fragGroup[i]; fld[n0 + k] = T.fragField[i]; ps[n0 + k] = 1; share[i] = 1; share[n0 + k] = 1; });
        T = { ...T, frags: buf.trim(), fragGroup: grp, fragField: fld }; pass = ps; nSeam = seam.length;
      }
    }
    // merge same-dose neighbours inside each field (and pass): the machine gets whole pieces, not PEC fragments
    if (merge) {
      progress({ label: 'Fields: merging same-dose figures' });
      const M = mergeFigures(T.frags, T.fragGroup, T.fragField, i => S.q.cls[T.fragGroup[i]] + (pass ? pass[i] * 65536 : 0) + (share ? share[i] * 131072 : 0));
      T = { ...T, frags: M.frags, fragGroup: M.fragGroup, fragField: M.fragField };
      const p0 = pass, s0 = share; if (p0) pass = Uint8Array.from(M.src, i => p0[i]); if (s0) share = Uint8Array.from(M.src, i => s0[i]);
    }
    // slivers thinner than the beam step of their pass are merged into a neighbour (see absorbSlivers)
    const thinCount = (fr, ps) => { let c = 0; for (let i = 0; i < fr.n; i++) { const o6 = i * 6, h = fr.t[o6 + 1] - fr.t[o6], w = h > 0 ? trapArea(fr.t, o6) / h : 0; if (Math.min(h, w) < bss[ps && ps[i] ? 1 : 0]) c++; } return c; };
    const thinBefore = thinCount(T.frags, pass); let chains = null;
    if (slivers) {
      progress({ label: 'Fields: merging slivers into neighbours' });
      const A = absorbSlivers(T.frags, T.fragGroup, T.fragField, { key: i => `${T.fragField[i]}|${pass ? pass[i] : 0}|${share ? share[i] : 0}|${T.frags.layer[i]}`, thinOf: i => bss[pass && pass[i] ? 1 : 0], cls: i => S.q.cls[T.fragGroup[i]] });
      T = { ...T, frags: A.frags, fragGroup: A.fragGroup, fragField: A.fragField };
      const p0 = pass, s0 = share; if (p0) pass = Uint8Array.from(A.src, i => p0[i]); if (s0) share = Uint8Array.from(A.src, i => s0[i]);
      chains = { chainOf: A.chainOf, chains: A.chains, chainGroup: A.chainGroup };
    }
    // The writing order is found before the whole-step split: split halves overlap instead of sharing an edge, so the
    // structure would no longer be connected for the walk. Pieces of one figure are written one after the other.
    progress({ label: 'Fields: writing order' });
    const geo = figOrder === 'shapes' || figOrder === 'auto';
    const dose = figOrder === 'dose' ? Float64Array.from(T.fragGroup, g => S.q.classDose[S.q.cls[g]]) : null;
    // each pass is ordered on its own figures: the fine pass of a pad is its outline ring, which must be walked around,
    // not crossed band by band as if the (bulk) interior were still there
    const orderOf = ids => {
      const m = ids.length, buf = new TrapBuf(Math.max(1, m)), sf = new Int32Array(m), sd = dose ? new Float64Array(m) : null, tt = T.frags.t;
      for (let k = 0; k < m; k++) { const i = ids[k], o6 = i * 6; buf.push(tt[o6], tt[o6 + 1], tt[o6 + 2], tt[o6 + 3], tt[o6 + 4], tt[o6 + 5], T.frags.layer[i], T.frags.comp[i]); sf[k] = T.fragField[i]; if (sd) sd[k] = dose[i]; }
      const fr = buf.trim(), a = fragmentAdjacency(fr), d = geo ? geoDistance(fr, a, structureSeeds(fr, a, best.seedMode)) : null;
      const o = figureSequence(fr, sf, T.fields, best.seq, { figOrder, start, dose: sd, dist: d, adj: a });
      return { seq: Int32Array.from(o.seq, k => ids[k]), o };
    };
    let seq, o;
    if (pass) {
      const f = [], bl = []; for (let i = 0; i < T.frags.n; i++) (pass[i] ? bl : f).push(i);
      const A = orderOf(f), Bq = orderOf(bl); seq = new Int32Array(T.frags.n); seq.set(A.seq); seq.set(Bq.seq, A.seq.length);
      o = { travel: A.o.travel + Bq.o.travel, jumpMax: Math.max(A.o.jumpMax, Bq.o.jumpMax), fieldJumps: A.o.fieldJumps + Bq.o.fieldJumps, jumps: A.o.jumps + Bq.o.jumps, followed: A.o.followed + Bq.o.followed, inRows: A.o.inRows + Bq.o.inRows };
    } else {
      const adj = fragmentAdjacency(T.frags), dist = geo ? geoDistance(T.frags, adj, structureSeeds(T.frags, adj, best.seedMode)) : null;
      o = figureSequence(T.frags, T.fragField, T.fields, best.seq, { figOrder, start, dose, dist, adj }); seq = o.seq;
    }
    // whole beam steps: no figure edge is left to the tool's rounding (see beamStepFit)
    let stepRows = 0, stepCols = 0;
    if (stepFit) {
      progress({ label: 'Fields: whole beam steps' });
      const inChain = chains ? chains.chainOf : null, W = beamStepFit(T.frags, { stepOf: i => bss[pass && pass[i] ? 1 : 0], keep: inChain ? i => inChain[i] >= 0 : null }), s = W.src;
      const first = new Int32Array(T.frags.n + 1).fill(-1); for (let k = s.length - 1; k >= 0; k--) first[s[k]] = k; // pieces of one figure are contiguous
      // pieces of a figure are written from the end nearer the beam, and toward the next figure
      const ns = new Int32Array(s.length), wt = W.frags.t; let p = 0;
      for (let q = 0; q < seq.length; q++) {
        const i = seq[q], k0 = first[i]; let k1 = k0; while (k1 + 1 < s.length && s[k1 + 1] === i) k1++;
        let rev = false;
        if (k1 > k0) {
          const nx = q + 1 < seq.length ? seq[q + 1] : -1, n0 = nx >= 0 ? first[nx] : -1;
          let n1 = n0; if (n0 >= 0) while (n1 + 1 < s.length && s[n1 + 1] === nx) n1++;
          const next = k => n0 < 0 ? 0 : Math.min(trapGap(wt, k, n0), trapGap(wt, k, n1)), prev = p ? ns[p - 1] : -1;
          rev = (prev >= 0 ? trapGap(wt, prev, k1) : 0) + next(k0) < (prev >= 0 ? trapGap(wt, prev, k0) : 0) + next(k1);
        }
        if (rev) for (let k = k1; k >= k0; k--) ns[p++] = k; else for (let k = k0; k <= k1; k++) ns[p++] = k;
      }
      seq = ns;
      if (chains) chains = { chainOf: Int32Array.from(s, i => inChain[i]), chains: chains.chains.map(L => L.map(i => first[i])), chainGroup: chains.chainGroup };
      T = { ...T, frags: W.frags, fragGroup: Int32Array.from(s, i => T.fragGroup[i]), fragField: Int32Array.from(s, i => T.fragField[i]) };
      const p0 = pass, s0 = share; if (p0) pass = Uint8Array.from(s, i => p0[i]); if (s0) share = Uint8Array.from(s, i => s0[i]);
      stepRows = W.rows; stepCols = W.cols;
    }
    let thinAfter = 0, skipAfter = 0; { const inChain = chains ? chains.chainOf : null; for (let i = 0; i < T.frags.n; i++) { if (inChain && inChain[i] >= 0) continue; const o6 = i * 6, h = T.frags.t[o6 + 1] - T.frags.t[o6], w = h > 0 ? trapArea(T.frags.t, o6) / h : 0, m = Math.min(h, w), s = bss[pass && pass[i] ? 1 : 0]; if (m < s) { thinAfter++; if (m < s / 2) skipAfter++; } } }
    let nFine = T.frags.n; if (pass) { nFine = 0; for (let i = 0; i < T.frags.n; i++) if (!pass[i]) nFine++; }
    S.T = { ...T, order: best.seq, seq, pass, share, chains };
    const fr = copyTraps(T.frags), sq = seq.slice(), pts = best.m.pts.slice(), cpts = best.m.critPts.slice();
    return { result: { n: T.frags.n, nBefore, frags: fr, fragGroup: T.fragGroup.slice(), fragField: T.fragField.slice(), fields: T.fields, order: best.seq, fieldSeq: best.seq, seq: sq, NX: T.NX, NY: T.NY, fieldsOn, travel: o.travel, jumpMax: o.jumpMax, fieldJumps: o.fieldJumps, jumps: o.jumps, followed: o.followed, inRows: o.inRows, figOrder,
      placementUsed: best.name, stitches: best.m.stitches, stitchCost: best.m.cost, critCut: best.m.crit, cutLen: best.m.cutLen, nFields: best.m.fields, stageTravel: best.m.travel, stitchPts: pts, critPts: cpts, size,
      passes: !!pass, nFine, nSeam, pass: pass && pass.slice(), thinBefore, thinAfter, skipAfter, stepRows, stepCols, nChains: chains ? chains.chains.length : 0, nPolygons: T.frags.n - (chains ? chains.chains.reduce((a, L) => a + L.length - 1, 0) : 0),
      candidates: cands.length > 1 ? cands.map(c => ({ name: c.name, stitches: c.m.stitches, crit: c.m.crit, cost: c.m.cost, cutLen: c.m.cutLen, fields: c.m.fields, travel: c.m.travel, chosen: c === best })) : null },
      transfer: [fr.t.buffer, fr.layer.buffer, fr.comp.buffer, sq.buffer, pts.buffer, cpts.buffer] };
  },
  sim({ win, pitch, thr, psf, uniform }) {
    if (!S.F || !S.q) throw new Error('run PEC first');
    const D = uniform ? new Float64Array(S.F.nGroups).fill(1) : S.Dq;
    const sim = simulate(S.F, D, psf, win, pitch);
    const seg = contour(sim, thr);
    return { result: { ...sim, seg }, transfer: [sim.E.buffer, seg.buffer] };
  },
  export({ opts, baseDose }) {
    if (!S.F || !S.q) throw new Error('run PEC first');
    const src = S.T || null; // written in the chosen writing order; one cell per field only when fields are on
    const job = { frags: src ? src.frags : S.F.frags, fragGroup: src ? src.fragGroup : S.F.fragGroup, groupClass: S.q.cls, classDose: S.q.classDose, fragField: src && src.fragField, fields: src && src.fields, order: src && src.order, seq: src && src.seq, pass: src && src.pass, share: src && src.share, chains: src && src.chains };
    const bytes = exportGDS(job, opts);
    const table = doseTable(S.q.classDose, S.q.counts, S.areas, { baseDose, mode: opts.mode, layerBase: opts.layerBase, passes: job.pass ? { bulkOffset: opts.bulkOffset || 100, areasPass: S.areasPass } : null, shared: !!(job.share && job.share.some(v => v)) });
    return { result: { bytes, table, report: job.report }, transfer: [bytes.buffer] };
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
