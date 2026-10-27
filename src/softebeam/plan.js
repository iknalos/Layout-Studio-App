// Write plans: one cost model scores every way of writing the pattern, and the best three are offered.
//   field size — every size the machine offers; the address grid (size / 2^DAC bits) must not exceed the fine beam step
//   placement  — per device TYPE the cheapest decomposition, chosen by the model, not by a rule per structure:
//                whole in one floating field if it fits, otherwise a grid whose offset avoids critical zones and
//                narrow features, or fields that follow the geometry (centre first / from one end). Solved once on one
//                copy and reused for every repeat. Fixed grid (BEAMER's default) is scored as a baseline.
//   passes     — one pass with the fine beam, or a fine pass plus a bulk pass at a high current
// score = 100 · critical zones cut + Σ stitch weights + 0.2 · cut length [mm] + w_time · write time [h]
// stitch weight = min(1, (1 µm / feature width)²): a field offset Δ costs ∝ (Δ/w)² (RESEARCH.md §5.2)
import { TrapBuf, tileFields, fragmentAdjacency, followGeometryFields, straightenCuts, fieldMetrics, fieldSequence } from './geom.js';
import { cutWeight, zonesSplit, STITCH_REF } from './analyze.js';

export const MACHINE = { sizes: [100, 200, 500, 1000], dacBits: 20, iFine: 1, bssFine: 5, iBulk: 20, bssBulk: 40, minDwell: 20, tSwitch: 300, tField: 1, baseDose: 300 };
export const PRIORITY = { quality: 0.25, balanced: 1, speed: 4 }; // weight of one hour of machine time
const MARGIN = 0.002, METHODS = ['gridW', 'followCenter', 'followEnd'];
export const METHOD_LABEL = { fit: 'whole, one field', gridW: 'grid around critical spots', followCenter: 'follow geometry (centre first)', followEnd: 'follow geometry (from one end)', grid: 'fixed grid' };

// figures grouped by device
export function deviceIndex(F, an) {
  const fr = F.frags, n = fr.n, t = fr.t, nd = an.nDev, dev = new Int32Array(n), start = new Int32Array(nd + 1);
  for (let i = 0; i < n; i++) { dev[i] = an.devComp[fr.comp[i]]; start[dev[i] + 1]++; }
  for (let d = 0; d < nd; d++) start[d + 1] += start[d];
  const list = new Int32Array(n), fill = start.slice(0, nd); for (let i = 0; i < n; i++) list[fill[dev[i]]++] = i;
  const box = new Float64Array(nd * 4); for (let d = 0; d < nd; d++) { box[4 * d] = box[4 * d + 1] = Infinity; box[4 * d + 2] = box[4 * d + 3] = -Infinity; }
  for (let i = 0; i < n; i++) { const o = i * 6, q = 4 * dev[i]; box[q] = Math.min(box[q], t[o + 2], t[o + 4]); box[q + 1] = Math.min(box[q + 1], t[o]); box[q + 2] = Math.max(box[q + 2], t[o + 3], t[o + 5]); box[q + 3] = Math.max(box[q + 3], t[o + 1]); }
  const zones = Array.from({ length: nd }, () => []); for (let z = 0; z < an.nz; z++) zones[an.zoneDev[z]].push(z);
  const byType = an.types.map(() => []); for (let d = 0; d < nd; d++) if (start[d + 1] > start[d]) byType[an.devType[d]].push(d);
  let bx0 = Infinity, by0 = Infinity; for (let d = 0; d < nd; d++) if (start[d + 1] > start[d]) { bx0 = Math.min(bx0, box[4 * d]); by0 = Math.min(by0, box[4 * d + 1]); }
  return { n, nd, dev, start, list, box, zones, byType, bx0, by0 };
}
const devW = (DI, d) => DI.box[4 * d + 2] - DI.box[4 * d], devH = (DI, d) => DI.box[4 * d + 3] - DI.box[4 * d + 1];
const bbOf = (DI, d) => ({ x0: DI.box[4 * d], y0: DI.box[4 * d + 1], x1: DI.box[4 * d + 2], y1: DI.box[4 * d + 3] });

// one device as its own figure set; fragGroup = local index, so results can be mapped onto any identical copy
function subset(F, DI, d) {
  const a = DI.start[d], m = DI.start[d + 1] - a, fr = F.frags, s = { n: m, t: new Float64Array(m * 6), layer: new Int32Array(m), comp: new Int32Array(m) }, sg = new Int32Array(m);
  for (let k = 0; k < m; k++) { const i = DI.list[a + k]; s.t.set(fr.t.subarray(i * 6, i * 6 + 6), k * 6); s.layer[k] = fr.layer[i]; s.comp[k] = fr.comp[i]; sg[k] = k; }
  return { s, sg };
}
// keep fields that hold figures, renumbered in writing order
function compact(frags, grp, fld, fields, seq) {
  const used = new Uint8Array(fields.length); for (const f of fld) used[f] = 1;
  const map = new Int32Array(fields.length).fill(-1), out = [];
  for (const f of [...seq, ...fields.keys()]) if (used[f] && map[f] < 0) { map[f] = out.length; out.push(fields[f]); }
  return { frags, fragGroup: grp, fragField: Int32Array.from(fld, f => map[f]), fields: out.map((F, k) => ({ x0: F.x0, y0: F.y0, x1: F.x1, y1: F.y1, i: k, j: 0 })), seq: out.map((_, k) => k) };
}
// grid offset (relative to the device corner) minimising Σ cut length × weight; critical zones effectively forbidden
function gridOffset(F, an, DI, d, size, steps = 48) {
  const t = F.frags.t, X0 = DI.box[4 * d], Y0 = DI.box[4 * d + 1], W = devW(DI, d), H = devH(DI, d), ids = DI.list.subarray(DI.start[d], DI.start[d + 1]);
  const wgt = new Float64Array(ids.length);
  for (let k = 0; k < ids.length; k++) { const i = ids[k], w = an.width[i]; wgt[k] = an.cls[i] === 0 ? 1e4 : 1 + 1000 * (w > STITCH_REF ? (STITCH_REF / w) ** 2 : 1); }
  const res = [0, 0];
  for (let axis = 0; axis < 2; axis++) {
    let bo = 0, bc = Infinity; const ext = axis ? H : W, base = axis ? Y0 : X0;
    for (let s = 0; s < steps; s++) {
      const off = -size + size * (s + 0.5) / steps; let c = 1e3 * Math.ceil((ext - off) / size); // a little per field
      for (let k = 0; k < ids.length; k++) { const o = ids[k] * 6, a = axis ? t[o] : Math.min(t[o + 2], t[o + 4]), b = axis ? t[o + 1] : Math.max(t[o + 3], t[o + 5]); if (Math.floor((a - base - off) / size) !== Math.floor((b - base - off) / size)) c += wgt[k] * (axis ? Math.max(t[o + 3] - t[o + 2], t[o + 5] - t[o + 4]) : t[o + 1] - t[o]); }
      for (const z of DI.zones[d]) { const a = an.zones[4 * z + axis] - base, b = an.zones[4 * z + 2 + axis] - base; if (Math.floor((a - off) / size) !== Math.floor((b - off) / size)) c += 1e12; }
      if (c < bc) { bc = c; bo = off; }
    }
    res[axis] = bo;
  }
  return res;
}
// decompose one device with a method → {frags, fragGroup (local index), fragField, fields, seq}
function runMethod(F, an, DI, d, method, size, sub, origin) {
  const { s, sg } = sub || subset(F, DI, d), bb = bbOf(DI, d);
  if (method === 'gridW' || method === 'grid') {
    const o = method === 'grid' ? origin : (off => [bb.x0 + off[0], bb.y0 + off[1]])(gridOffset(F, an, DI, d, size));
    const T = tileFields(s, sg, { size, originMode: 'custom', ox: o[0], oy: o[1], bbox: bb });
    return compact(T.frags, T.fragGroup, T.fragField, T.fields, fieldSequence(T.NX, T.NY, 'meanderX', 'tl'));
  }
  const adj = fragmentAdjacency(s), r = followGeometryFields(s, adj, { size, start: method === 'followCenter' ? 'center' : 'end' });
  const z = straightenCuts(s, sg, adj, r.fragField, r.fields, size);
  return compact(z.frags, z.fragGroup, z.fragField, z.fields, r.fieldSeq);
}
function measure(an, R) {
  const a = fragmentAdjacency(R.frags), m = fieldMetrics(R.frags, a, R.fragField, R.fields, R.seq, cutWeight(an, R.frags)), z = zonesSplit(an, R.frags, R.fragField);
  return { fields: R.fields.length, stitches: m.stitches, risk: m.cost, cutLen: m.cutLen, crit: z.n };
}
const typeScore = m => 100 * m.crit + m.risk + 0.2 * m.cutLen / 1e6 + 0.02 * m.fields;

// devices that fit, packed into shared floating fields (rows of one field height from the top, serpentine);
// each field is shifted so its critical zones sit as close to the centre as the content allows
// writing rows from the devices' own spacing (a new row when the centre drops by more than half the median device
// height, never more than one field), serpentine inside each row; `row` maps device → row index
function orderDevices(DI, size) {
  const ds = []; for (let d = 0; d < DI.nd; d++) if (DI.start[d + 1] > DI.start[d]) ds.push(d);
  const cx = d => (DI.box[4 * d] + DI.box[4 * d + 2]) / 2, cy = d => (DI.box[4 * d + 1] + DI.box[4 * d + 3]) / 2;
  const hs = ds.map(d => devH(DI, d)).sort((a, b) => a - b), tol = Math.min(size, Math.max(1, 0.5 * (hs[hs.length >> 1] || 0)));
  ds.sort((a, b) => cy(b) - cy(a));
  const row = new Map(); let r = -1, top = Infinity; for (const d of ds) { if (top - cy(d) > tol) { r++; top = cy(d); } row.set(d, r); }
  ds.sort((a, b) => (row.get(a) - row.get(b)) || ((row.get(a) & 1 ? -1 : 1) * (cx(a) - cx(b))));
  ds.row = row; return ds;
}
function packFields(DI, an, ds, size, fits) {
  const lim = size * (1 - MARGIN), out = [], open = [];
  const flush = () => { for (const f of open) out.push(place(f)); open.length = 0; };
  const place = f => {
    const U = f.u; let zx = 0, zy = 0, zn = 0; for (const d of f.devs) for (const z of DI.zones[d]) { zx += (an.zones[4 * z] + an.zones[4 * z + 2]) / 2; zy += (an.zones[4 * z + 1] + an.zones[4 * z + 3]) / 2; zn++; }
    const tx = zn ? zx / zn : (U[0] + U[2]) / 2, ty = zn ? zy / zn : (U[1] + U[3]) / 2, m = (size - lim) / 2;
    const cx = Math.min(U[0] + size / 2 - m, Math.max(U[2] - size / 2 + m, tx)), cy = Math.min(U[1] + size / 2 - m, Math.max(U[3] - size / 2 + m, ty));
    return { x0: cx - size / 2, y0: cy - size / 2, x1: cx + size / 2, y1: cy + size / 2, devs: f.devs };
  };
  const units = [];
  for (const d of ds) {
    if (!fits(d)) { units.push({ big: d }); continue; }
    // devices arrive top to bottom: a field whose top is more than one field above this device can never take it
    for (let k = open.length - 1; k >= 0; k--) if (DI.box[4 * d + 1] < open[k].u[3] - lim) { out.push(place(open[k])); open.splice(k, 1); }
    const b = [DI.box[4 * d], DI.box[4 * d + 1], DI.box[4 * d + 2], DI.box[4 * d + 3]]; let joined = false;
    for (const f of open) { const u = [Math.min(f.u[0], b[0]), Math.min(f.u[1], b[1]), Math.max(f.u[2], b[2]), Math.max(f.u[3], b[3])]; if (u[2] - u[0] <= lim && u[3] - u[1] <= lim) { f.u = u; f.devs.push(d); joined = true; break; } }
    if (!joined) { const f = { u: b, devs: [d] }; open.push(f); units.push({ pack: f }); }
  }
  flush();
  const placed = new Map(); out.forEach(f => placed.set(f.devs[0], f));
  return units.map(u => u.big != null ? u : { field: placed.get(u.pack.devs[0]) });
}

// Final merge: any fields (packed devices, or pieces of devices larger than a field) whose contents fit in one field
// together become one field. Boxes arrive in writing order, roughly top to bottom. Returns content unions + mapping.
function mergeBoxes(boxes, size) {
  const lim = size * (1 - MARGIN), open = [], rects = [], map = new Int32Array(boxes.length), count = [];
  boxes.forEach((b, k) => {
    for (let q = open.length - 1; q >= 0; q--) if (b[1] < rects[open[q]][3] - lim) open.splice(q, 1);
    let hit = -1; for (const f of open) { const u = rects[f]; if (Math.max(u[2], b[2]) - Math.min(u[0], b[0]) <= lim && Math.max(u[3], b[3]) - Math.min(u[1], b[1]) <= lim) { hit = f; break; } }
    if (hit < 0) { hit = rects.length; rects.push([b[0], b[1], b[2], b[3]]); open.push(hit); count.push(0); }
    else { const u = rects[hit]; u[0] = Math.min(u[0], b[0]); u[1] = Math.min(u[1], b[1]); u[2] = Math.max(u[2], b[2]); u[3] = Math.max(u[3], b[3]); }
    map[k] = hit; count[hit]++;
  });
  return { map, rects, count };
}
const contentBoxes = (frags, fragField, nf) => { const B = Array.from({ length: nf }, () => [Infinity, Infinity, -Infinity, -Infinity]), t = frags.t; for (let i = 0; i < frags.n; i++) { const o = i * 6, b = B[fragField[i]]; b[0] = Math.min(b[0], t[o + 2], t[o + 4]); b[1] = Math.min(b[1], t[o]); b[2] = Math.max(b[2], t[o + 3], t[o + 5]); b[3] = Math.max(b[3], t[o + 1]); } return B; };

// ── evaluate one field size: per type, every applicable method on one copy ──
export function evaluateSize(F, an, DI, size, progress = () => {}) {
  const lim = size * (1 - MARGIN), types = [];
  for (let ty = 0; ty < an.types.length; ty++) {
    const devs = DI.byType[ty]; if (!devs.length) { types.push(null); continue; }
    const rep = devs[0], fits = devW(DI, rep) <= lim && devH(DI, rep) <= lim;
    if (fits) { types.push({ n: devs.length, fits, opts: [{ method: 'fit', fields: 1, stitches: 0, risk: 0, cutLen: 0, crit: 0 }], best: 0 }); continue; }
    const sub = subset(F, DI, rep), opts = [];
    const res = [];
    for (const m of METHODS) { progress({ label: `Plans: ${size / 1000} µm fields · type ${ty + 1}/${an.types.length} · ${METHOD_LABEL[m]}` }); const Rm = runMethod(F, an, DI, rep, m, size, sub); res.push(Rm); opts.push({ method: m, ...measure(an, Rm) }); }
    let best = 0; opts.forEach((o, k) => { if (typeScore(o) < typeScore(opts[best])) best = k; });
    types.push({ n: devs.length, fits, opts, best, boxes: contentBoxes(res[best].frags, res[best].fragField, res[best].fields.length).map((b, k) => [b, res[best].seq.indexOf(k)]).sort((a, b) => a[1] - b[1]).map(x => x[0]), rep });
  }
  // adaptive: sum over types (fitting devices share packed fields)
  const ds = orderDevices(DI, size), fitsD = d => devW(DI, d) <= lim && devH(DI, d) <= lim, units = packFields(DI, an, ds, size, fitsD);
  const A = { fields: 0, stitches: 0, risk: 0, cutLen: 0, crit: 0, fitDevices: 0, bigDevices: 0 };
  const boxes = [];
  for (const u of units) {
    if (u.field) { A.fitDevices += u.field.devs.length; const f = u.field; let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const d of f.devs) b = [Math.min(b[0], DI.box[4 * d]), Math.min(b[1], DI.box[4 * d + 1]), Math.max(b[2], DI.box[4 * d + 2]), Math.max(b[3], DI.box[4 * d + 3])]; boxes.push(b); continue; }
    const T = types[an.devType[u.big]], dx = DI.box[4 * u.big] - DI.box[4 * T.rep], dy = DI.box[4 * u.big + 1] - DI.box[4 * T.rep + 1];
    for (const b of T.boxes) boxes.push([b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]);
  }
  A.fields = mergeBoxes(boxes, size).rects.length;
  types.forEach(T => { if (!T || T.fits) return; const o = T.opts[T.best]; A.bigDevices += T.n; for (const k of ['stitches', 'risk', 'cutLen', 'crit']) A[k] += T.n * o[k]; });
  // fixed grid from the pattern corner (baseline): devices grouped by their offset to the grid, ≤ 4 samples per type
  const G = { fields: 0, stitches: 0, risk: 0, cutLen: 0, crit: 0, sampled: false };
  for (let ty = 0; ty < an.types.length; ty++) {
    const devs = DI.byType[ty]; if (!devs.length) continue;
    const cls = new Map(); for (const d of devs) { const k = `${Math.round(((DI.box[4 * d] - DI.bx0) % size + size) % size)},${Math.round(((DI.box[4 * d + 1] - DI.by0) % size + size) % size)}`; let L = cls.get(k); if (!L) cls.set(k, L = []); L.push(d); }
    const groups = [...cls.values()], pick = groups.length <= 4 ? groups : [0, 1, 2, 3].map(q => groups[Math.floor(q * groups.length / 4)]);
    if (pick.length < groups.length) G.sampled = true;
    let wsum = 0; const acc = { fields: 0, stitches: 0, risk: 0, cutLen: 0, crit: 0 };
    for (const g of pick) { const m = measure(an, runMethod(F, an, DI, g[0], 'grid', size, null, [DI.bx0, DI.by0])); for (const k in acc) acc[k] += m[k] * g.length; wsum += g.length; }
    for (const k in acc) if (k !== 'fields') G[k] += acc[k] * devs.length / wsum;
  }
  const cells = new Set(); for (let d = 0; d < DI.nd; d++) { if (DI.start[d + 1] <= DI.start[d]) continue; 
    for (let i = Math.floor((DI.box[4 * d] - DI.bx0) / size); i <= Math.floor((DI.box[4 * d + 2] - DI.bx0) / size - 1e-9); i++) for (let j = Math.floor((DI.box[4 * d + 1] - DI.by0) / size); j <= Math.floor((DI.box[4 * d + 3] - DI.by0) / size - 1e-9); j++) cells.add(i * 1e6 + j); }
  G.fields = cells.size;
  for (const T of types) if (T) delete T.boxes;
  return { size, types, adaptive: A, grid: G };
}

// ── rank plans with the machine model ──
export function rankPlans(evals, an, machine = MACHINE, priority = 'balanced', dose = { fine: 1, bulk: 1 }) {
  const M = { ...MACHINE, ...machine }, wT = PRIORITY[priority] ?? 1, plans = [];
  const passT = (A, I, bss, df) => { if (!(A > 0)) return 0; const D = M.baseDose * df, dwell = 0.01 * D * bss * bss / I; return A / (bss * bss) * Math.max(dwell, M.minDwell) * 1e-9; }; // A nm², I nA, bss nm, dwell ns
  const Af = an.areas[0] + an.areas[1], Ab = an.areas[2];
  for (const ev of evals) {
    const addr = ev.size / 2 ** M.dacBits; // nm
    for (const pl of ['adaptive', 'grid']) {
      const m = ev[pl];
      for (const passes of Ab > 0 ? ['split', 'single'] : ['single']) {
        const beam = passes === 'split' ? passT(Af, M.iFine, M.bssFine, dose.fine) + passT(Ab, M.iBulk, M.bssBulk, dose.bulk) : passT(Af + Ab, M.iFine, M.bssFine, (dose.fine * Af + dose.bulk * Ab) / Math.max(1, Af + Ab));
        const over = m.fields * M.tField * (passes === 'split' ? 2 : 1) + (passes === 'split' ? M.tSwitch : 0), time = beam + over;
        const quality = 100 * m.crit + m.risk + 0.2 * m.cutLen / 1e6, feasible = addr <= M.bssFine;
        plans.push({ size: ev.size, placement: pl, passes, ...m, beam, overhead: over, time, quality, addr, feasible, score: feasible ? quality + wT * time / 3600 : Infinity,
          methods: pl === 'adaptive' ? ev.types.map(T => T ? T.opts[T.best].method : null) : null });
      }
    }
  }
  plans.sort((a, b) => a.score - b.score);
  plans.forEach((p, k) => { p.rank = k + 1; p.why = explain(p, an, M); });
  return plans;
}
const fmtT = s => s < 60 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(0)} min` : `${(s / 3600).toFixed(1)} h`;
function explain(p, an, M) {
  const out = [], um = p.size / 1000;
  if (!p.feasible) return [`Not possible on this machine: a ${um} µm field with a ${M.dacBits}-bit DAC has a ${p.addr.toFixed(1)} nm address grid, coarser than the ${M.bssFine} nm fine beam step.`];
  if (p.placement === 'adaptive') {
    if (!p.bigDevices) out.push(`Every device fits in one ${um} µm field, so nothing is stitched.`);
    else { const ms = [...new Set((p.methods || []).filter(Boolean))].filter(m => m !== 'fit').map(m => METHOD_LABEL[m]); out.push(`${p.fitDevices ? `${p.fitDevices} device${p.fitDevices > 1 ? 's' : ''} fit whole; ` : ''}${p.bigDevices} larger than a ${um} µm field are split by ${ms.join(' / ')}.`); }
  } else out.push(`Fixed ${um} µm grid from the pattern corner (BEAMER's default), for comparison.`);
  if (p.stitches) out.push(`${Math.round(p.stitches)} stitch${p.stitches > 1.5 ? 'es' : ''}${p.crit ? `, ${Math.round(p.crit)} through critical spots` : ', none through critical spots'}; risk ${p.risk.toFixed(1)} waveguide-stitch equivalents.`);
  if (an.nz && !p.crit && p.placement === 'adaptive') out.push(`All ${an.nz} critical spot${an.nz > 1 ? 's' : ''} stay inside one field, near its centre.`);
  out.push(p.passes === 'split' ? `Two passes: fine (${M.iFine} nA, ${M.bssFine} nm step) for narrow parts and a ${(an.sleeve / 1000).toFixed(1)} µm outline sleeve, bulk (${M.iBulk} nA, ${M.bssBulk} nm) for wide interiors: ${fmtT(p.time)} incl. ${fmtT(M.tSwitch)} current change.` : `One pass at ${M.iFine} nA: ${fmtT(p.time)}.`);
  return out;
}

// ── build the fields of a chosen plan ──
// typeMethod[ty]: method for devices of type ty that do not fit (default 'gridW'). Every fitting device is written whole.
// Results for one copy are translated to identical copies (checked figure by figure; otherwise solved again).
export function buildPlanFields(F, an, DI, size, typeMethod = [], placement = 'adaptive') {
  const lim = size * (1 - MARGIN), fr = F.frags, t = fr.t;
  const out = new TrapBuf(fr.n + 1024), grp = [], fld = [], fields = [], seq = [];
  const ds = orderDevices(DI, size), fits = d => placement === 'adaptive' && devW(DI, d) <= lim && devH(DI, d) <= lim;
  const units = packFields(DI, an, ds, size, fits), cache = new Map();
  let reused = 0, solved = 0;
  for (const u of units) {
    if (u.field) {
      const k = fields.length; fields.push({ i: k, j: 0, x0: u.field.x0, y0: u.field.y0, x1: u.field.x1, y1: u.field.y1 }); seq.push(k);
      for (const d of u.field.devs) for (let q = DI.start[d]; q < DI.start[d + 1]; q++) { const i = DI.list[q], o = i * 6; out.push(t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], fr.layer[i], fr.comp[i]); grp.push(F.fragGroup[i]); fld.push(k); }
      continue;
    }
    const d = u.big, ty = an.devType[d], method = placement === 'grid' ? 'grid' : (typeMethod[ty] || 'gridW');
    let R = null, dx = 0, dy = 0;
    if (method !== 'grid') { // fixed grid depends on where the copy sits, so it is never reused
      const c = cache.get(ty);
      if (c && sameShape(F, DI, c.d, d)) { R = c.R; dx = DI.box[4 * d] - DI.box[4 * c.d]; dy = DI.box[4 * d + 1] - DI.box[4 * c.d + 1]; reused++; }
    }
    if (!R) { R = runMethod(F, an, DI, d, method, size, null, [DI.bx0, DI.by0]); solved++; if (method !== 'grid' && !cache.has(ty)) cache.set(ty, { d, R }); }
    const base = fields.length, a = DI.start[d], rt = R.frags.t;
    R.fields.forEach(f => fields.push({ i: fields.length, j: 0, x0: f.x0 + dx, y0: f.y0 + dy, x1: f.x1 + dx, y1: f.y1 + dy })); R.seq.forEach(f => seq.push(base + f));
    for (let p = 0; p < R.frags.n; p++) { const o = p * 6, i = DI.list[a + R.fragGroup[p]]; out.push(rt[o] + dy, rt[o + 1] + dy, rt[o + 2] + dx, rt[o + 3] + dx, rt[o + 4] + dx, rt[o + 5] + dx, R.frags.layer[p], fr.comp[i]); grp.push(F.fragGroup[i]); fld.push(base + R.fragField[p]); }
  }
  // final merge: fields whose contents fit in one field together (seq order = writing order)
  const fr2 = out.trim(), fldA = Int32Array.from(fld), cb = contentBoxes(fr2, fldA, fields.length), M = mergeBoxes(seq.map(f => cb[f]), size);
  const toM = new Int32Array(fields.length); seq.forEach((f, k) => { toM[f] = M.map[k]; });
  const mf = M.rects.map((u, k) => { if (M.count[k] === 1) { const f = fields[seq[M.map.indexOf(k)]]; return { i: k, j: 0, x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1 }; } const cx = (u[0] + u[2]) / 2, cy = (u[1] + u[3]) / 2; return { i: k, j: 0, x0: cx - size / 2, y0: cy - size / 2, x1: cx + size / 2, y1: cy + size / 2 }; });
  for (let i = 0; i < fldA.length; i++) fldA[i] = toM[fldA[i]];
  return { frags: fr2, fragGroup: Int32Array.from(grp), fragField: fldA, fields: mf, fieldSeq: mf.map((_, k) => k), NX: mf.length, NY: 1, reused, solved, merged: fields.length - mf.length };
}
// identical figure lists up to a translation (same order, same layer)
function sameShape(F, DI, a, b) {
  const na = DI.start[a + 1] - DI.start[a]; if (na !== DI.start[b + 1] - DI.start[b]) return false;
  const t = F.frags.t, dx = DI.box[4 * b] - DI.box[4 * a], dy = DI.box[4 * b + 1] - DI.box[4 * a + 1], E = 1e-6 * (1 + Math.abs(dx) + Math.abs(dy));
  for (let k = 0; k < na; k++) {
    const i = DI.list[DI.start[a] + k], j = DI.list[DI.start[b] + k], oi = i * 6, oj = j * 6; if (F.frags.layer[i] !== F.frags.layer[j]) return false;
    if (Math.abs(t[oj] - t[oi] - dy) > E || Math.abs(t[oj + 1] - t[oi + 1] - dy) > E) return false;
    for (let q = 2; q < 6; q++) if (Math.abs(t[oj + q] - t[oi + q] - dx) > E) return false;
  }
  return true;
}
