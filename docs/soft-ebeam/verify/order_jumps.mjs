// Beam moves in a writing order: node order_jumps.mjs <out>_figs.json (from run_flow.mjs)
// A move is a pair of consecutive figures in one field that do not touch; its length is the nearest-point distance.
import { readFileSync } from 'node:fs';
import { trapGap } from '../../../src/softebeam/geom.js';
const job = JSON.parse(readFileSync(process.argv[2], 'utf8')), F = job.figs, n = F.length, t = new Float64Array(n * 6);
F.forEach((f, k) => { for (let j = 0; j < 6; j++) t[k * 6 + j] = f[j]; });
const g = []; for (let k = 1; k < n; k++) if (F[k][7] === F[k - 1][7]) { const d = trapGap(t, k - 1, k); if (d > 1) g.push(d); }
const over = L => g.filter(d => d > L).length;
console.log(`${n} figures: ${g.length} moves between figures that do not touch, ${(g.reduce((a, b) => a + b, 0) / 1e6).toFixed(2)} mm in all; longer than 1 µm ${over(1e3)}, 10 µm ${over(1e4)}, 100 µm ${over(1e5)}`);
