import { healAndFracture, fragmentForPEC, tileFields, trapArea } from '../geom.js';
import { exportGDS, readGDS, doseTable } from '../export.js';
let fail = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
const R = (x0, y0, x1, y1) => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1]);
const tri = new Float64Array([3000, 0, 4000, 0, 3500, 800]);
const { traps, nComp } = healAndFracture([R(0, 0, 2000, 1500), tri], [7, 7]);
const F = fragmentForPEC(traps, nComp, { fragMax: 500, edgeW: 100, smallSize: 200 });
const groupClass = Uint16Array.from({ length: F.nGroups }, (_, g) => 1 + (g % 3)), classDose = Float64Array.from([0, 0.9, 1.0, 1.25]);
const area = (cells, pred = () => true) => { let A = 0; for (const c of cells) for (const e of c.els) if (e.type === 'boundary' && pred(e)) { let a = 0; for (let i = 0; i + 1 < e.xy.length; i++) a += e.xy[i][0] * e.xy[i + 1][1] - e.xy[i + 1][0] * e.xy[i][1]; A += a / 2; } return A; };
let A0 = 0; for (let i = 0; i < traps.n; i++) A0 += trapArea(traps.t, i * 6);
{
  const b = exportGDS({ frags: F.frags, fragGroup: F.fragGroup, groupClass, classDose }, { mode: 'datatype' });
  const cells = readGDS(b);
  ok(cells.length === 1 && cells[0].els.length === F.frags.n, `datatype mode: 1 cell, ${cells[0].els.length} boundaries`);
  ok(Math.abs(area(cells) - A0) / A0 < 1e-3, `area round-trip ${area(cells)} vs ${A0}`);
  ok(cells[0].els.every(e => e.layer === 7 && e.datatype >= 1 && e.datatype <= 3), 'layer kept, datatype = class');
}
{
  const cells = readGDS(exportGDS({ frags: F.frags, fragGroup: F.fragGroup, groupClass, classDose }, { mode: 'raith', layerOut: 1 }));
  ok(cells[0].els.every(e => e.layer === 1 && [900, 1000, 1250].includes(e.datatype)), 'raith: datatype = 1000·DF');
  const cl = readGDS(exportGDS({ frags: F.frags, fragGroup: F.fragGroup, groupClass, classDose }, { mode: 'layer', layerBase: 50 }));
  ok(cl[0].els.every(e => e.layer >= 51 && e.layer <= 53 && e.datatype === 0), 'layer mode: layer = base + class');
}
{
  const T = tileFields(F.frags, F.fragGroup, { size: 1000, bbox: { x0: 0, y0: 0, x1: 4000, y1: 1500 } });
  const job = { frags: T.frags, fragGroup: T.fragGroup, groupClass, classDose, fragField: T.fragField, fields: T.fields, order: T.order };
  const cells = readGDS(exportGDS(job, { cellPerField: true }));
  const top = cells.find(c => c.name === 'TOP');
  ok(top && top.els.every(e => e.type === 'sref'), `cell per field: ${cells.length - 1} field cells + TOP with ${top.els.length} SREFs`);
  ok(Math.abs(area(cells) - A0) / A0 < 1e-3, 'field cells keep area');
  const tb = doseTable(classDose, [0, 5, 6, 7], null, { baseDose: 300 }); ok(tb.includes('375.00'), 'dose table with absolute doses');
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
{ // writing order is preserved in the file
  const { fieldSequence, figureSequence } = await import('../geom.js');
  const T = tileFields(F.frags, F.fragGroup, { size: 1000, bbox: { x0: 0, y0: 0, x1: 4000, y1: 1500 } });
  const fs = fieldSequence(T.NX, T.NY, 'rasterX', 'tl'), o = figureSequence(T.frags, T.fragField, T.fields, fs, { figOrder: 'raster', start: 'tl' });
  const cells = readGDS(exportGDS({ frags: T.frags, fragGroup: T.fragGroup, groupClass, classDose, fragField: T.fragField, fields: T.fields, order: fs, seq: o.seq }, {}));
  const ys = cells[0].els.map(e => Math.max(...e.xy.map(p => p[1])));
  const firstField = T.fields[fs[0]];
  ok(cells[0].els.length === T.frags.n && ys[0] >= ys[ys.length - 1] && firstField.y1 >= 1500 - 1e-6, 'GDS element order follows the writing order (top fields first)');
  const cf = readGDS(exportGDS({ frags: T.frags, fragGroup: T.fragGroup, groupClass, classDose, fragField: T.fragField, fields: T.fields, order: fs, seq: o.seq }, { cellPerField: true }));
  ok(cf.find(c => c.name === 'TOP').els[0].sname === `F${firstField.j}_${firstField.i}`, 'cell-per-field: first SREF is the first written field');
  console.log(fail ? `${fail} FAILED` : 'ALL PASS (incl. order)');
}
