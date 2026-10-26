/* eslint-disable no-restricted-globals */
import { runMC } from './mc.js';
self.onmessage = e => {
  const { id, cfg } = e.data;
  try {
    let last = 0;
    const res = runMC(cfg, p => { const now = Date.now(); if (now - last > 200) { last = now; self.postMessage({ id, progress: p }); } });
    self.postMessage({ id, ok: true, result: res }, [res.tally.buffer, res.edges.buffer]);
  } catch (err) { self.postMessage({ id, ok: false, error: (err && err.message) || String(err) }); }
};
