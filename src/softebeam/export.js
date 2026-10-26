// Export of fractured, dose-classed figures.
//  mode 'datatype' : layer = output layer, DATATYPE = dose class (1…N)          + dose table
//  mode 'layer'    : LAYER = layerBase + class, DATATYPE 0                        + dose table
//  mode 'raith'    : DATATYPE = round(1000 × dose factor) (Raith GDS convention, verify on your tool)

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

// trapezoid → integer polygon (closed), dropping repeated corners (triangles)
function trapPts(t, o, k) {
  const P = [[t[o + 2], t[o]], [t[o + 3], t[o]], [t[o + 5], t[o + 1]], [t[o + 4], t[o + 1]]].map(([x, y]) => [Math.round(x / k), Math.round(y / k)]);
  const Q = []; for (const p of P) { const q = Q[Q.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) Q.push(p); }
  if (Q.length > 1 && Q[0][0] === Q[Q.length - 1][0] && Q[0][1] === Q[Q.length - 1][1]) Q.pop();
  if (Q.length < 3) return null;
  const flat = []; for (const p of Q) flat.push(p[0], p[1]); flat.push(Q[0][0], Q[0][1]); return flat;
}

// job = {frags, fragGroup, groupClass (Uint16 per group), classDose (Float64, index 1…N), fragField?, fields?, order?}
export function exportGDS(job, opts = {}) {
  const { libName = 'SOFTEBEAM', top = 'TOP', dbuNm = 1, mode = 'datatype', layerOut = null, layerBase = 100, cellPerField = false } = opts;
  const { frags, fragGroup, groupClass, classDose } = job, t = frags.t, k = dbuNm;
  const g = new GdsOut();
  g.i16(0x00, 600); g.stamp(0x01); g.str(0x02, libName); g.real8(dbuNm * 1e-3, dbuNm * 1e-9);
  const layerDt = i => {
    const c = groupClass ? groupClass[fragGroup[i]] : 1, L = layerOut == null ? frags.layer[i] : layerOut;
    if (mode === 'layer') return [layerBase + c, 0];
    if (mode === 'raith') return [L, Math.min(32767, Math.max(0, Math.round(1000 * (classDose ? classDose[c] : 1))))];
    return [L, c];
  };
  const writeFig = i => { const p = trapPts(t, i * 6, k); if (!p) return; const [L, D] = layerDt(i); g.rec(0x08, 0); g.i16(0x0D, L); g.i16(0x0E, D); g.xy(p); g.rec(0x11, 0); };
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
export function doseTable(classDose, counts, areas, { baseDose = null, mode = 'datatype', layerBase = 100 } = {}) {
  const lines = ['# Soft-EBeam dose table', `# relative dose = factor × base dose${baseDose ? ` (${baseDose} µC/cm²)` : ''}`,
    `# ${mode === 'layer' ? 'layer' : mode === 'raith' ? 'raith_datatype' : 'datatype'}\tclass\tdose_factor${baseDose ? '\tdose_uC_cm2' : ''}\tfigures\tarea_um2`];
  for (let c = 1; c < classDose.length; c++) {
    const key = mode === 'layer' ? layerBase + c : mode === 'raith' ? Math.round(1000 * classDose[c]) : c;
    lines.push([key, c, classDose[c].toFixed(4), ...(baseDose ? [(classDose[c] * baseDose).toFixed(2)] : []), counts ? counts[c] | 0 : '', areas ? (areas[c] / 1e6).toFixed(3) : ''].join('\t'));
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
