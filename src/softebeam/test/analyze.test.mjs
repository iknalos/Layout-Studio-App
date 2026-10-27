import { healAndFracture, fragmentForPEC, fragmentAdjacency, fieldMetrics, mergeFigures, figureSequence, geoDistance, structureSeeds, trapArea } from '../geom.js';
import { analyzeStructure, cutWeight, zonesSplit } from '../analyze.js';
import { deviceIndex, evaluateSize, rankPlans, buildPlanFields } from '../plan.js';
import { exportGDS, readGDS } from '../export.js';
let fail = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
const R = (x0, y0, x1, y1) => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1]);
const P = pts => Float64Array.from(pts.flat());
const frag = { fragMax: 950, edgeW: 77, smallSize: 308 };
const run = (rings, opts = {}) => { const L = rings.map(() => 1), H = healAndFracture(rings, L), F = fragmentForPEC(H.traps, H.nComp, frag); return { H, F, an: analyzeStructure(rings, L, H.traps, H.nComp, F, opts), rings }; };
const area = fr => { let a = 0; for (let i = 0; i < fr.n; i++) a += trapArea(fr.t, i * 6); return a; };

// a small Y-branch: two arms and a stem whose 40 nm tips sit 80 nm apart (three separate shapes), pads at the ends
const Y = (ox, oy) => [
  P([[ox + 12400, oy - 400], [ox + 30000, oy - 4000], [ox + 30000, oy - 9000], [ox + 40000, oy - 9000], [ox + 40000, oy + 9000], [ox + 30000, oy + 9000], [ox + 30000, oy + 4000], [ox + 12400, oy + 400]]),
  P([[ox + 6080, oy + 0], [ox + 6720, oy + 0], [ox + 6720, oy + 40], [ox + 6080, oy + 40]]),
  P([[ox + 6080, oy - 240], [ox + 6720, oy - 240], [ox + 6720, oy - 200], [ox + 6080, oy - 200]]),
  P([[ox + 6200, oy - 120], [ox + 13200, oy - 400], [ox + 13200, oy + 400], [ox + 6200, oy - 80]]),
  P([[ox - 20000, oy + 8000], [ox - 10000, oy + 8000], [ox - 400, oy + 2400], [ox + 6080, oy + 40], [ox + 6080, oy + 0], [ox - 400, oy + 1600], [ox - 10000, oy + 2000], [ox - 20000, oy + 2000]].reverse()),
  P([[ox - 20000, oy - 8240], [ox - 10000, oy - 8240], [ox - 400, oy - 2640], [ox + 6080, oy - 240], [ox + 6080, oy - 200], [ox - 400, oy - 1840], [ox - 10000, oy - 2240], [ox - 20000, oy - 2240]]),
];
{ // 2 × 2 array of identical Y-branches
  const rings = []; for (const [x, y] of [[0, 0], [80000, 0], [0, 60000], [80000, 60000]]) rings.push(...Y(x, y));
  const fixCCW = r => { let a = 0; for (let i = 0; i < r.length; i += 2) { const j = (i + 2) % r.length; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } if (a < 0) { const q = new Float64Array(r.length); for (let i = 0; i < r.length; i += 2) { q[i] = r[r.length - 2 - i]; q[i + 1] = r[r.length - 1 - i]; } return q; } return r; };
  const { F, an } = run(rings.map(fixCCW));
  ok(an.nDev === 4 && an.types.length === 1 && an.types[0].n === 4, `Y array: ${an.nDev} devices, ${an.types.length} unique (expect 4 / 1)`);
  ok(an.nz === 4 && an.zinfo.every(z => z.kind === 3), `one critical zone per junction, narrow + gap (${an.nz} zones)`);
  ok(Math.abs(an.minWidth - 40) < 3 && an.minGap > 40 && an.minGap <= 80.5, `narrowest ${an.minWidth.toFixed(1)} nm (40), tightest gap ${an.minGap.toFixed(1)} nm (tips 80, arm-to-stem 44)`);
  ok(an.areas[2] > 0 && an.areas[0] > 0 && Math.abs(an.areas[0] + an.areas[1] + an.areas[2] - area(F.frags)) < 1, 'critical + fine + bulk areas add up to the pattern');
  const DI = deviceIndex(F, an), evals = [20, 100].map(s => evaluateSize(F, an, DI, s * 1000)), plans = rankPlans(evals, an, { sizes: [20, 100] });
  const p100 = plans.find(p => p.size === 100000 && p.placement === 'adaptive');
  ok(p100 && p100.stitches === 0 && p100.crit === 0 && p100.fields <= 4, `100 µm fields: every device whole, neighbours share fields (${p100 && p100.fields} fields, ${p100 && p100.stitches} stitches)`);
  const p20 = plans.find(p => p.size === 20000 && p.placement === 'adaptive');
  ok(p20 && p20.crit === 0 && p20.stitches > 0, `20 µm fields: devices must be split, junction never cut (${p20 && p20.stitches} stitches, ${p20 && p20.crit} critical)`);
  ok(plans[0].size === 100000, `recommended: ${plans[0].size / 1000} µm, ${plans[0].passes}`);
  const B = buildPlanFields(F, an, DI, 20000, p20.methods, 'adaptive');
  ok(Math.abs(area(B.frags) - area(F.frags)) < 1e-3 * area(F.frags), 'built plan conserves area');
  const adj = fragmentAdjacency(B.frags), m = fieldMetrics(B.frags, adj, B.fragField, B.fields, B.fieldSeq, cutWeight(an, B.frags)), z = zonesSplit(an, B.frags, B.fragField);
  ok(z.n === 0 && m.stitches === Math.round(p20.stitches), `built 20 µm plan: ${m.stitches} stitches (predicted ${p20.stitches}), ${z.n} critical`);
  ok(B.reused === 3 && B.solved === 1, `repeats solved once and reused (${B.solved} solved, ${B.reused} reused)`);
  let inside = true; for (let i = 0; i < B.frags.n; i++) { const o = i * 6, f = B.fields[B.fragField[i]], t = B.frags.t; if (Math.min(t[o + 2], t[o + 4]) < f.x0 - 1 || Math.max(t[o + 3], t[o + 5]) > f.x1 + 1 || t[o] < f.y0 - 1 || t[o + 1] > f.y1 + 1) inside = false; }
  ok(inside, 'every figure lies inside its field');
}
{ // local width: 100 nm lines at several angles; a 2 µm pad has no critical spot at its corners
  for (const deg of [0, 30, 45, 90]) {
    const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), L = 8000, w = 100;
    const r = P([[0, 0], [L * ux, L * uy], [L * ux - w * uy, L * uy + w * ux], [-w * uy, w * ux]]);
    const { an } = run([r]); const ws = Array.from(an.width).sort((p, q) => p - q), med = ws[ws.length >> 1];
    ok(Math.abs(med - 100) <= 10 && an.nz === 1, `${deg}° 100 nm line: width ${med.toFixed(1)} nm, ${an.nz} zone`);
  }
  const { an } = run([R(0, 0, 2000, 2000)]); ok(an.nz === 0, `2 µm pad: ${an.nz} critical spots (corners are not narrow)`);
  const jog = P([[0, 0], [20000, 0], [20000, 2500], [10005, 2500], [10005, 2505], [10000, 2505], [10000, 2500], [0, 2500]]);
  const J = run([jog]); ok(J.an.nz === 0 && J.an.slivers >= 1, `5 nm drawing jog ignored as a sliver (${J.an.nz} zones, ${J.an.slivers} slivers)`);
}
{ // merging same-dose neighbours and the serpentine figure order inside a pad
  const { F } = run([R(0, 0, 20000, 20000)]), grp = F.fragGroup, fld = new Int32Array(F.frags.n);
  const M = mergeFigures(F.frags, grp, fld, () => 1);
  ok(M.frags.n < F.frags.n / 10 && Math.abs(area(M.frags) - 4e8) < 1, `uniform dose pad: ${F.frags.n} PEC pieces → ${M.frags.n} figures, area kept`);
  const M2 = mergeFigures(F.frags, grp, fld, i => i % 2); ok(Math.abs(area(M2.frags) - 4e8) < 1, 'checkerboard keys: nothing lost');
  const adj = fragmentAdjacency(F.frags), dist = geoDistance(F.frags, adj, structureSeeds(F.frags, adj, 'end'));
  const fields = [{ x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 }], o = figureSequence(F.frags, fld, fields, [0], { figOrder: 'shapes', start: 'tl', dist });
  ok(o.jumpMax < 3000, `pad written as a serpentine: longest jump ${(o.jumpMax / 1000).toFixed(2)} µm (pieces ≤ 0.95 µm)`);
}
{ // export: bulk pass on layer + offset, shared seam at half dose
  const t = new Float64Array([0, 1000, 0, 1000, 0, 1000, 0, 1000, 1000, 2000, 1000, 2000]);
  const job = { frags: { n: 2, t, layer: Int32Array.of(1, 1), comp: Int32Array.of(0, 0) }, fragGroup: Int32Array.of(0, 1), groupClass: Uint16Array.of(1, 2), classDose: Float64Array.of(0, 1, 1.2), pass: Uint8Array.of(0, 1), share: Uint8Array.of(0, 1) };
  const els = readGDS(exportGDS(job, { mode: 'raith', bulkOffset: 100 }))[0].els;
  ok(els[0].layer === 1 && els[0].datatype === 1000 && els[1].layer === 101 && els[1].datatype === 600, `fine L${els[0].layer}/DT${els[0].datatype}, bulk shared L${els[1].layer}/DT${els[1].datatype} (half of 1.2)`);
}
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
{ // regression: a slanted edge crossing a vertical one, split exactly at the crossing, must not lose the sliver
  const P2 = a => Float64Array.from(a.flat()), area0 = 259774742.857;
  for (const oy of [0, 60000, 1e6]) {
    const H = healAndFracture([P2([[12400, oy - 400], [30000, oy - 4000], [30000, oy - 9000], [40000, oy - 9000], [40000, oy + 9000], [30000, oy + 9000], [30000, oy + 4000], [12400, oy + 400]]), P2([[6200, oy - 120], [13200, oy - 400], [13200, oy + 400], [6200, oy - 80]])], [1, 1]);
    ok(Math.abs(area(H.traps) - area0) < 1, `union of overlapping polygons at y offset ${oy}: ${area(H.traps).toFixed(1)} nm² (exact ${area0})`);
  }
  console.log(fail ? `${fail} FAILED` : 'ALL PASS (incl. crossing regression)');
}
{ // slivers: a 64-gon dot fractures into thin slabs; sharing doses and stacking leaves no figure thinner than the step
  const { absorbSlivers, chainOutline } = await import('../geom.js');
  const ring = Float64Array.from([...Array(64)].flatMap((_, k) => [1000 + 400 * Math.cos(2 * Math.PI * k / 64), 1000 + 400 * Math.sin(2 * Math.PI * k / 64)]));
  const H = healAndFracture([ring], [1]), F = fragmentForPEC(H.traps, H.nComp, { fragMax: 950, edgeW: 40, smallSize: 300, minFig: 10 });
  const thin = (fr, i) => { const o = i * 6, h = fr.t[o + 1] - fr.t[o]; return Math.min(h, h > 0 ? trapArea(fr.t, o) / h : 0) < 10; };
  let before = 0; for (let i = 0; i < F.frags.n; i++) if (thin(F.frags, i)) before++;
  const M0 = mergeFigures(F.frags, F.fragGroup, new Int32Array(F.frags.n), () => 1); // as in the pipeline: same-dose merge first (uniform dose here)
  const A = absorbSlivers(M0.frags, M0.fragGroup, M0.fragField, { key: () => 0, thinOf: () => 10, cls: () => 1 });
  let after = 0, aOut = 0; for (let i = 0; i < A.frags.n; i++) { if (A.chainOf[i] < 0 && thin(A.frags, i)) after++; aOut += trapArea(A.frags.t, i * 6); }
  let polyA = 0; for (const L of A.chains) { const P = chainOutline(A.frags.t, L); let s = 0; for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } polyA += s / 2; }
  let chainA = 0; for (const L of A.chains) for (const k of L) chainA += trapArea(A.frags.t, k * 6);
  ok(before > 0 && after === 0 && Math.abs(aOut - area(F.frags)) < 1e-3 && Math.abs(polyA - chainA) < 1e-3 * chainA, `dot: ${before} slivers → ${after} left, ${A.chains.length} stacked polygon(s) with the same area`);
  console.log(fail ? `${fail} FAILED` : 'ALL PASS (incl. slivers)');
}
