import { healAndFracture, fragmentForPEC, tileFields, trapArea, trapContains, ringArea, biasRing, flattenLib, toRectangles } from '../geom.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const R = (x0, y0, x1, y1) => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1]);
const circ = (cx, cy, r, n = 128) => { const a = []; for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; a.push(cx + r * Math.cos(t), cy + r * Math.sin(t)); } return new Float64Array(a); };
const sumArea = tr => { let s = 0; for (let i = 0; i < tr.n; i++) s += trapArea(tr.t, i * 6); return s; };
const norm = r => ringArea(r) < 0 ? (() => { const g = new Float64Array(r.length); for (let i = 0, j = r.length - 2; j >= 0; i += 2, j -= 2) { g[i] = r[j]; g[i + 1] = r[j + 1]; } return g; })() : r;
function rasterArea(rings, step) { // nonzero-winding raster estimate of the union
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
  let c = 0;
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
    for (const r of rings) { let w = 0; for (let i = 0; i < r.length; i += 2) { const j = (i + 2) % r.length; const ax = r[i], ay = r[i + 1], bx = r[j], by = r[j + 1]; if ((ay <= y) !== (by <= y)) { const xx = ax + (bx - ax) * (y - ay) / (by - ay); if (xx > x) w += by > ay ? 1 : -1; } } if (w) { c++; break; } }
  }
  return c * step * step;
}

{ // 1: overlapping rects → union, no double coverage
  const rings = [R(0, 0, 100, 100), R(50, 50, 150, 150), R(100, 0, 200, 40)];
  const { traps, nComp } = healAndFracture(rings, [1, 1, 1]);
  const A = sumArea(traps), Ar = 100 * 100 + 100 * 100 - 50 * 50 + 100 * 40;
  ok(Math.abs(A - Ar) < 1e-6, `union area ${A} vs ${Ar}`); ok(nComp === 1, `components=${nComp}`);
  let dbl = 0; for (let y = 0.5; y < 150; y += 3) for (let x = 0.5; x < 200; x += 3) { let k = 0; for (let i = 0; i < traps.n; i++) if (trapContains(traps.t, i * 6, x, y)) k++; if (k > 1) dbl++; }
  ok(dbl === 0, `no double coverage (${dbl}); traps=${traps.n}`);
}
{ // 2: touching rects merge into one trapezoid; separate rect is its own component
  const { traps, nComp } = healAndFracture([R(0, 0, 100, 100), R(100, 0, 200, 100), R(500, 0, 600, 50)], [1, 1, 1]);
  ok(nComp === 2, `touching merged into 2 comps (got ${nComp})`); ok(sumArea(traps) === 25000, 'area 25000');
  ok(traps.n === 2, `touching rects merged to 1 trapezoid (traps=${traps.n})`);
}
{ // 3: circles + overlapping circles + rotated square vs raster
  const rings = [circ(0, 0, 100), circ(150, 0, 100), circ(600, 0, 50), new Float64Array([300, 300, 400, 400, 300, 500, 200, 400])];
  const { traps, nComp } = healAndFracture(rings, [1, 1, 1, 1]);
  const A = sumArea(traps), Ar = rasterArea(rings, 1);
  ok(Math.abs(A - Ar) / Ar < 0.005, `circles union area ${A.toFixed(0)} vs raster ${Ar.toFixed(0)}`); ok(nComp === 3, `comps ${nComp}`);
}
{ // 4: keyhole polygon (square with hole through a cut line)
  const key = norm(new Float64Array([0, 0, 1000, 0, 1000, 1000, 0, 1000, 0, 500, 250, 500, 250, 750, 750, 750, 750, 250, 250, 250, 250, 500, 0, 500]));
  const { traps } = healAndFracture([key], [1]);
  ok(Math.abs(sumArea(traps) - 750000) < 1e-6, `keyhole area ${sumArea(traps)} vs 750000`);
}
{ // 5: fragmentation & fields keep area; pieces inside fields
  const rings = [R(0, 0, 5000, 3000), circ(8000, 0, 150), new Float64Array([10000, 0, 14000, 0, 13000, 2000, 11000, 2000])];
  const { traps, nComp } = healAndFracture(rings, [1, 1, 1]);
  const A = sumArea(traps);
  const F = fragmentForPEC(traps, nComp, { fragMax: 1000, edgeW: 100, smallSize: 500 });
  ok(Math.abs(sumArea(F.frags) - A) < 1e-3, `fragment area kept ${sumArea(F.frags).toFixed(1)} vs ${A.toFixed(1)}`);
  const edges = Array.from(F.target).filter(v => v === 0.5).length;
  ok(F.nGroups > 10, `groups ${F.nGroups}, frags ${F.frags.n}, edge groups ${edges}, interior ${F.nGroups - edges}`);
  const T = tileFields(F.frags, F.fragGroup, { size: 2500, bbox: { x0: 0, y0: -150, x1: 14000, y1: 3000 } });
  ok(Math.abs(sumArea(T.frags) - A) < 1e-3, `field-split area kept ${sumArea(T.frags).toFixed(1)}`);
  let bad = 0; for (let i = 0; i < T.frags.n; i++) { const o = i * 6, f = T.fields[T.fragField[i]], t = T.frags.t; const xs = [t[o + 2], t[o + 3], t[o + 4], t[o + 5]]; if (Math.min(...xs) < f.x0 - 1e-6 || Math.max(...xs) > f.x1 + 1e-6 || t[o] < f.y0 - 1e-6 || t[o + 1] > f.y1 + 1e-6) bad++; }
  ok(bad === 0, `pieces inside their fields (bad=${bad}), fields ${T.NX}x${T.NY}, pieces ${T.frags.n}`);
  const RR = toRectangles(traps, 10); ok(Math.abs(sumArea(RR) - A) / A < 0.01, `rectangles area ${sumArea(RR).toFixed(0)}`);
}
{ // 6: bias
  ok(Math.abs(ringArea(biasRing(R(0, 0, 100, 100), 10)) - 120 * 120) < 1e-6, 'bias +10');
  ok(Math.abs(ringArea(biasRing(R(0, 0, 100, 100), -10)) - 80 * 80) < 1e-6, 'bias -10');
}
{ // 7: flatten with aref + rotation + path + window
  const lib = { dbUnit: 1e-9, cells: [], cellMap: {} };
  const add = c => { lib.cells.push(c); lib.cellMap[c.name] = c; };
  add({ name: 'dot', elements: [{ type: 'boundary', layer: 1, datatype: 0, xy: [[0, 0], [10, 0], [10, 20], [0, 20], [0, 0]] }] });
  add({ name: 'top', elements: [{ type: 'aref', sname: 'dot', colrow: [3, 2], xy: [[0, 0], [300, 0], [0, 200]] }, { type: 'sref', sname: 'dot', xy: [1000, 0], angle: 90 }, { type: 'path', layer: 2, width: 10, xy: [[0, 500], [100, 500], [100, 600]] }] });
  const F = flattenLib(lib, {});
  ok(F.rings.length === 8, `flatten count ${F.rings.length}`);
  const r6 = Array.from(F.rings[6]).map(v => Math.round(v)); ok(Math.min(...r6.filter((_, i) => i % 2 === 0)) === 980, `rotated sref x-range ${r6}`);
  ok(Math.abs(ringArea(F.rings[7]) - 2000) < 1, `path area ${ringArea(F.rings[7])}`);
  const W = flattenLib(lib, { window: { x0: -1, y0: -1, x1: 50, y1: 50 } }); ok(W.rings.length === 1, `window cull ${W.rings.length}`);
}
{ // 8: performance
  const rings = [], L = []; for (let i = 0; i < 20000; i++) { rings.push(circ((i % 200) * 400, Math.floor(i / 200) * 400, 100, 64)); L.push(1); }
  let t0 = Date.now(); const H = healAndFracture(rings, L); const t1 = Date.now();
  const F = fragmentForPEC(H.traps, H.nComp, { fragMax: 1000, edgeW: 100, smallSize: 500 }); const t2 = Date.now();
  ok(H.nComp === 20000, `perf: 20k circles → ${H.traps.n} traps in ${t1 - t0} ms; fragment ${t2 - t1} ms, groups ${F.nGroups}`);
  t0 = Date.now(); const Hb = healAndFracture([R(0, 0, 1e6, 1e6)], [1]); const Fb = fragmentForPEC(Hb.traps, Hb.nComp, { fragMax: 2000, edgeW: 100, smallSize: 500 });
  ok(Fb.frags.n > 0, `perf: 1 mm pad → ${Fb.frags.n} fragments in ${Date.now() - t0} ms`);
  const comb = []; for (let i = 0; i < 2000; i++) comb.push(R(i * 200, 0, i * 200 + 100, 50000)); comb.push(R(0, 50000, 400000, 52000));
  t0 = Date.now(); const Hc = healAndFracture(comb, comb.map(() => 1));
  ok(Hc.nComp === 1, `perf: 2000-finger comb (one component) → ${Hc.traps.n} traps in ${Date.now() - t0} ms`);
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
{ // 9: writing order
  const { fieldSequence, figureSequence } = await import('../geom.js');
  ok(JSON.stringify(fieldSequence(3, 2, 'meanderX', 'bl')) === '[0,1,2,5,4,3]', 'meander rows from bottom-left');
  ok(JSON.stringify(fieldSequence(3, 2, 'rasterX', 'tl')) === '[3,4,5,0,1,2]', 'raster rows from top-left (top → bottom)');
  ok(JSON.stringify(fieldSequence(2, 3, 'meanderY', 'bl')) === '[0,2,4,5,3,1]', 'meander columns');
  ok(fieldSequence(5, 5, 'spiral')[0] === 12, 'spiral starts at the centre field');
  const rings = []; for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) rings.push(R(i * 200, j * 200, i * 200 + 100, j * 200 + 100));
  const { traps, nComp } = healAndFracture(rings, rings.map(() => 1));
  const F = fragmentForPEC(traps, nComp, { fragMax: 1000, edgeW: 10, smallSize: 500 });
  const T = tileFields(F.frags, F.fragGroup, { size: 1e5, bbox: { x0: 0, y0: 0, x1: 900, y1: 700 } });
  const fs = fieldSequence(T.NX, T.NY), cxy = i => { const o = i * 6, t = T.frags.t; return [0.25 * (t[o + 2] + t[o + 3] + t[o + 4] + t[o + 5]), 0.5 * (t[o] + t[o + 1])]; };
  const tl = figureSequence(T.frags, T.fragField, T.fields, fs, { figOrder: 'raster', start: 'tl' });
  ok(cxy(tl.seq[0])[1] > 600 && cxy(tl.seq[0])[0] < 100 && cxy(tl.seq[tl.seq.length - 1])[1] < 100, 'raster from top-left writes top row first, bottom row last');
  const me = figureSequence(T.frags, T.fragField, T.fields, fs, { figOrder: 'meander', start: 'bl' });
  ok(cxy(me.seq[4])[0] > 800 && cxy(me.seq[5])[0] > 800 && cxy(me.seq[9])[0] < 100, 'meander reverses direction each row');
  const nn = figureSequence(T.frags, T.fragField, T.fields, fs, { figOrder: 'nearest' });
  ok(new Set(nn.seq).size === T.frags.n && nn.travel <= me.travel * 1.2, `shortest-path visits all ${T.frags.n} figures, travel ${nn.travel.toFixed(0)} vs meander ${me.travel.toFixed(0)} nm`);
  const big = []; for (let k = 0; k < 60000; k++) big.push(R((k % 300) * 300, Math.floor(k / 300) * 300, (k % 300) * 300 + 100, Math.floor(k / 300) * 300 + 100));
  const H2 = healAndFracture(big, big.map(() => 1)), F2 = fragmentForPEC(H2.traps, H2.nComp, { fragMax: 1000, edgeW: 10, smallSize: 500 });
  const T2 = tileFields(F2.frags, F2.fragGroup, { size: 1e6, bbox: { x0: 0, y0: 0, x1: 90000, y1: 60000 } });
  let t0 = Date.now(); const n2 = figureSequence(T2.frags, T2.fragField, T2.fields, fieldSequence(T2.NX, T2.NY), { figOrder: 'nearest' });
  ok(new Set(n2.seq).size === T2.frags.n, `shortest path on ${T2.frags.n} figures in ${Date.now() - t0} ms`);
  console.log(fail ? `${fail} FAILED` : 'ALL PASS (incl. order)');
}
{ // 10: follow-geometry order finishes each shape before the next
  const { fieldSequence, figureSequence } = await import('../geom.js');
  const rings = [R(0, 0, 3000, 3000), R(5000, 0, 8000, 3000)];
  const { traps, nComp } = healAndFracture(rings, [1, 1]);
  const F = fragmentForPEC(traps, nComp, { fragMax: 500, edgeW: 50, smallSize: 100 });
  const T = tileFields(F.frags, F.fragGroup, { size: 1e5, bbox: { x0: 0, y0: 0, x1: 8000, y1: 3000 } });
  const o = figureSequence(T.frags, T.fragField, T.fields, fieldSequence(T.NX, T.NY), { figOrder: 'shapes', start: 'tl' });
  const comps = Array.from(o.seq, i => T.frags.comp[i]); let switches = 0; for (let k = 1; k < comps.length; k++) if (comps[k] !== comps[k - 1]) switches++;
  ok(switches === 1, `follow geometry: one jump between the two pads (${switches})`);
  console.log(fail ? `${fail} FAILED` : 'ALL PASS (incl. follow geometry)');
}
