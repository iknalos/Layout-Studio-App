// Export of fractured, dose-classed figures.
//  mode 'datatype' : layer = output layer, DATATYPE = dose class (1…N)          + dose table
//  mode 'layer'    : LAYER = layerBase + class, DATATYPE 0                        + dose table
//  mode 'raith'    : DATATYPE = round(1000 × dose factor) (Raith GDS convention, verify on your tool)
//  two passes      : bulk-pass figures go to layer + bulkOffset (fine pass keeps the layer), written after the fine pass;
//                    shared-seam figures (in both passes at half dose) use classes N+1…2N = half of classes 1…N

import { chainOutline, trapArea } from './geom.js';
const enc = new TextEncoder();
class GdsOut {
  constructor() { this.parts = []; this.size = 0; }
  rec(type, dt, body) { const l = 4 + (body ? body.length : 0), b = new Uint8Array(l), v = new DataView(b.buffer); v.setUint16(0, l); b[2] = type; b[3] = dt; if (body) b.set(body, 4); this.parts.push(b); this.size += l; }
  i16(type, ...n) { const b = new Uint8Array(2 * n.length), v = new DataView(b.buffer); n.forEach((x, i) => v.setInt16(2 * i, x)); this.rec(type, 2, b); }
  str(type, s) { let t = s; if (t.length % 2) t += '\0'; this.rec(type, 6, enc.encode(t)); }
  xy(pts) { const b = new Uint8Array(pts.length * 4), v = new DataView(b.buffer); pts.forEach((p, i) => v.setInt32(4 * i, p)); this.rec(0x10, 3, b); }
  real8(...vals) {
    const b = new Uint8Array(8 * vals.length);
    vals.forEach((val, k) => { // IBM 370 excess-64 base-16 float
      const r = b.subarray(8 * k, 8 * k + 8); if (!val) return; let v = Math.abs(val), e = 64;
      while (v >= 1) { v /= 16; e++; } while (v < 1 / 16) { v *= 16; e--; }
      r[0] = (val < 0 ? 0x80 : 0) | (e & 0x7f); for (let i = 1; i < 8; i++) { v *= 256; r[i] = Math.floor(v); v -= r[i]; }
    });
    this.rec(0x03, 5, b);
  }
  stamp(type) { const d = new Date(), t = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]; this.i16(type, ...t, ...t); }
  bytes() { const out = new Uint8Array(this.size); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

// polygon (nm) → integer polygon on the database grid (closed): repeated and collinear points dropped; null if it
// has no area left after rounding (a sub-grid sliver)
function polyPts(P, k) {
  let Q = []; for (const [x, y] of P) { const p = [Math.round(x / k), Math.round(y / k)], q = Q[Q.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) Q.push(p); }
  if (Q.length > 1 && Q[0][0] === Q[Q.length - 1][0] && Q[0][1] === Q[Q.length - 1][1]) Q.pop();
  for (let changed = true; changed && Q.length >= 3;) { changed = false; for (let i = 0; i < Q.length; i++) { const a = Q[(i + Q.length - 1) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length]; if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) === 0) { Q.splice(i, 1); changed = true; break; } } }
  if (Q.length < 3) return null;
  let A = 0; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; A += a[0] * b[1] - b[0] * a[1]; } if (A === 0) return null;
  const flat = []; for (const p of Q) flat.push(p[0], p[1]); flat.push(Q[0][0], Q[0][1]); return flat;
}
const trapPoly = (t, o) => [[t[o + 2], t[o]], [t[o + 3], t[o]], [t[o + 5], t[o + 1]], [t[o + 4], t[o + 1]]];

// job = {frags, fragGroup, groupClass (Uint16 per group), classDose (Float64, index 1…N), fragField?, fields?, order?}
export function exportGDS(job, opts = {}) {
  const { libName = 'SOFTEBEAM', top = 'TOP', dbuNm = 1, mode = 'datatype', layerOut = null, layerBase = 100, cellPerField = false, bulkOffset = 100 } = opts;
  const { frags, fragGroup, groupClass } = job, t = frags.t, k = dbuNm, N = job.classDose ? job.classDose.length - 1 : 0;
  const classDose = job.share && job.classDose ? Float64Array.from({ length: 2 * N + 1 }, (_, c) => c <= N ? job.classDose[c] : job.classDose[c - N] / 2) : job.classDose;
  const g = new GdsOut();
  g.i16(0x00, 600); g.stamp(0x01); g.str(0x02, libName); g.real8(dbuNm * 1e-3, dbuNm * 1e-9);
  const layerDt = (i, grpOf = null) => {
    const c = (groupClass ? groupClass[grpOf != null ? grpOf : fragGroup[i]] : 1) + (job.share && job.share[i] ? N : 0), P = job.pass && job.pass[i] ? bulkOffset : 0, L = (layerOut == null ? frags.layer[i] : layerOut) + P;
    if (mode === 'layer') return [layerBase + P + c, 0];
    if (mode === 'raith') return [L, Math.min(32767, Math.max(0, Math.round(1000 * (classDose ? classDose[c] : 1))))];
    return [L, c];
  };
  // machine check, filled while writing
  // thin[pass]: thinner than the beam step (one line of shots); skip[pass]: thinner than half of it (a tool may write none)
  const R = job.report = { polygons: 0, maxVerts: 0, dropped: 0, droppedArea: 0, minLayer: Infinity, maxLayer: -Infinity, minDt: Infinity, maxDt: -Infinity, thin: [0, 0], skip: [0, 0], offStep: [0, 0], chains: 0 };
  const C = job.chains, written = C ? new Uint8Array(C.chains.length) : null, bss = opts.bss || [0, 0];
  const writeFig = i => {
    let P, grpOf = null;
    if (C && C.chainOf[i] >= 0) { const c = C.chainOf[i]; if (written[c]) return; written[c] = 1; P = chainOutline(t, C.chains[c]); grpOf = C.chainGroup[c]; R.chains++; }
    else P = trapPoly(t, i * 6);
    const p = polyPts(P, k); if (!p) { R.dropped++; R.droppedArea += Math.abs(trapArea(t, i * 6)); return; }
    const [L, D] = layerDt(i, grpOf); g.rec(0x08, 0); g.i16(0x0D, L); g.i16(0x0E, D); g.xy(p); g.rec(0x11, 0);
    R.polygons++; R.maxVerts = Math.max(R.maxVerts, p.length / 2 - 1); R.minLayer = Math.min(R.minLayer, L); R.maxLayer = Math.max(R.maxLayer, L); R.minDt = Math.min(R.minDt, D); R.maxDt = Math.max(R.maxDt, D);
    if (!grpOf) { const o = i * 6, h = t[o + 1] - t[o], w = h > 0 ? trapArea(t, o) / h : 0, ps = job.pass && job.pass[i] ? 1 : 0, m = Math.min(h, w); if (bss[ps] > 0 && m < bss[ps]) { R.thin[ps]++; if (m < bss[ps] / 2) R.skip[ps]++; } else if (bss[ps] > 0) { const rect = Math.abs(t[o + 2] - t[o + 4]) < 1e-6 && Math.abs(t[o + 3] - t[o + 5]) < 1e-6, off = v => Math.abs(v / bss[ps] - Math.round(v / bss[ps])) * bss[ps] > 0.05; if (off(h) || (rect && off(t[o + 3] - t[o + 2]))) R.offStep[ps]++; } }
  };
  const seq = job.seq || (job.fragField && job.order ? orderByField(job) : null);
  if (cellPerField && job.fragField && job.fields) {
    const byField = new Map(), order = [];
    for (let k = 0; k < frags.n; k++) { const i = seq ? seq[k] : k, f = job.fragField[i]; let L = byField.get(f); if (!L) { byField.set(f, L = []); order.push(f); } L.push(i); }
    const name = f => `F${job.fields[f].j}_${job.fields[f].i}`;
    for (const f of order) { g.stamp(0x05); g.str(0x06, name(f)); for (const i of byField.get(f)) writeFig(i); g.rec(0x07, 0); }
    g.stamp(0x05); g.str(0x06, top);
    for (const f of order) { g.rec(0x0A, 0); g.str(0x12, name(f)); g.xy([0, 0]); g.rec(0x11, 0); }
    g.rec(0x07, 0);
  } else {
    g.stamp(0x05); g.str(0x06, top);
    if (seq) for (const i of seq) writeFig(i); else for (let i = 0; i < frags.n; i++) writeFig(i);
    g.rec(0x07, 0);
  }
  g.rec(0x04, 0);
  return g.bytes();
}

function orderByField(job) {
  const rank = new Int32Array(job.fields.length); job.order.forEach((f, r) => rank[f] = r);
  const idx = Array.from({ length: job.frags.n }, (_, i) => i), t = job.frags.t;
  idx.sort((a, b) => (rank[job.fragField[a]] - rank[job.fragField[b]]) || (t[a * 6] - t[b * 6]) || (t[a * 6 + 2] - t[b * 6 + 2]));
  return idx;
}

// dose table: one row per class
export function doseTable(classDose, counts, areas, { baseDose = null, mode = 'datatype', layerBase = 100, passes = null, shared = false } = {}) {
  const lines = ['# Soft-EBeam dose table', `# relative dose = factor × base dose${baseDose ? ` (${baseDose} µC/cm²)` : ''}`];
  if (passes) lines.push('# two passes: pass 1 (fine beam) = source layer(s), written first; pass 2 (bulk beam, high current) = layer + ' + passes.bulkOffset + (mode === 'layer' ? ' (class layers shifted the same way)' : '') + '. Same dose factors in both passes.');
  lines.push(
    `# ${mode === 'layer' ? 'layer' : mode === 'raith' ? 'raith_datatype' : 'datatype'}\tclass\tdose_factor${baseDose ? '\tdose_uC_cm2' : ''}\tfigures\tarea_um2`);
  for (let c = 1; c < classDose.length; c++) {
    const key = mode === 'layer' ? layerBase + c : mode === 'raith' ? Math.round(1000 * classDose[c]) : c;
    lines.push([key, c, classDose[c].toFixed(4), ...(baseDose ? [(classDose[c] * baseDose).toFixed(2)] : []), counts ? counts[c] | 0 : '', areas ? (areas[c] / 1e6).toFixed(3) : ''].join('\t'));
  }
  if (shared) { // seam figures written in both passes, each at half dose
    const N = classDose.length - 1; lines.push('# shared seam (fine/bulk boundary, written in both passes at half dose)');
    for (let c = 1; c <= N; c++) { const key = mode === 'layer' ? layerBase + N + c : mode === 'raith' ? Math.round(500 * classDose[c]) : N + c; lines.push([key, N + c, (classDose[c] / 2).toFixed(4), ...(baseDose ? [(classDose[c] * baseDose / 2).toFixed(2)] : []), '', ''].join('\t')); }
  }
  return lines.join('\n') + '\n';
}

// minimal GDS reader for round-trip tests: returns [{name, els:[{type, layer, datatype, xy}]}]
export function readGDS(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), cells = []; let o = 0, cell = null, el = null;
  while (o + 4 <= bytes.length) {
    const len = v.getUint16(o), type = v.getUint8(o + 2), d = o + 4; if (len < 4) break;
    if (type === 0x05) cell = { name: '', els: [] };
    else if (type === 0x06) { cell.name = new TextDecoder().decode(bytes.subarray(d, o + len)).replace(/\0/g, ''); cells.push(cell); }
    else if (type === 0x08 || type === 0x0A) { el = { type: type === 0x08 ? 'boundary' : 'sref', xy: [] }; cell.els.push(el); }
    else if (type === 0x0D) el.layer = v.getInt16(d); else if (type === 0x0E) el.datatype = v.getInt16(d);
    else if (type === 0x12) el.sname = new TextDecoder().decode(bytes.subarray(d, o + len)).replace(/\0/g, '');
    else if (type === 0x10) for (let i = d; i < o + len; i += 8) el.xy.push([v.getInt32(i), v.getInt32(i + 4)]);
    o += len;
  }
  return cells;
}
