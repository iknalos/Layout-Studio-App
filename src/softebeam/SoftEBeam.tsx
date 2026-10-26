// @ts-nocheck
// Soft-EBeam: e-beam data preparation (PSF → PEC → fracture → fields → export) inside Layout Studio.
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { psfFromParams, psfEval, psfEnclosed, fitMultiGauss, fitPSF, cleanRadial, parseLpsfXml, parseTextPSF, inflateZlib, PSF_PRESETS } from './psf.js';
import { MATERIALS, mergeMC, mcToRadial } from './mc.js';

const C = { bg: '#eef0f3', panel: '#fff', line: '#dde1e7', ink: '#1d2433', mute: '#6b7385', accent: '#1f3a8a', beam: '#c2410c', ok: '#2f8f46', warn: '#d97706', bad: '#c0392b', soft: '#f6f7f9' };
const STATUS = { unset: ['#e8912d', 'needs input'], ready: ['#c0392b', 'not run'], running: ['#2563eb', 'running'], done: ['#2f8f46', 'done'], off: ['#a3a9b5', 'off'], error: ['#7f1d1d', 'error'] };
const RESISTS = Object.keys(MATERIALS).filter(k => MATERIALS[k].resist), SUBSTRATES = Object.keys(MATERIALS).filter(k => !MATERIALS[k].resist);
const LCOL = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#ca8a04', '#475569'];

const fmtLen = nm => !isFinite(nm) ? '–' : Math.abs(nm) >= 1e6 ? `${(nm / 1e6).toPrecision(4)} mm` : Math.abs(nm) >= 1000 ? `${(nm / 1000).toPrecision(4)} µm` : `${(+nm).toPrecision(3)} nm`;
const fmtN = n => n == null ? '–' : n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)} k` : String(n);
const pct = v => v == null ? '–' : `${(v * 100).toFixed(2)} %`;
const fmtTime = s => !isFinite(s) ? '–' : s < 60 ? `${s.toFixed(1)} s` : s < 3600 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(2)} h`;
const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)));
function turbo(t) { // polynomial approximation of the Turbo colormap
  t = Math.min(1, Math.max(0, t));
  return [clamp255(34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))))),
    clamp255(23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))))),
    clamp255(27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66)))))];
}
const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
const download = (data, name, type = 'application/octet-stream') => { const u = URL.createObjectURL(new Blob([data], { type })); Object.assign(document.createElement('a'), { href: u, download: name }).click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
const LS_KEY = 'softebeam:flow:v1', LS_PSF = 'softebeam:psf:v1';
const psfGet = () => { try { return JSON.parse(localStorage.getItem(LS_PSF) || 'null'); } catch { return null; } };
const psfSet = v => { try { v ? localStorage.setItem(LS_PSF, JSON.stringify(v)) : localStorage.removeItem(LS_PSF); } catch { } };
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } };
const lsSet = v => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { } };

// ── worker plumbing ───────────────────────────────────────
function useEngine() {
  const ref = useRef(null), pend = useRef(new Map()), seq = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./engine.worker.js', import.meta.url)); ref.current = w;
    w.onmessage = e => { const { id, progress, ok, result, error } = e.data, p = pend.current.get(id); if (!p) return; if (progress !== undefined) { p.onProgress && p.onProgress(progress); return; } pend.current.delete(id); ok ? p.resolve(result) : p.reject(new Error(error)); };
    w.onerror = ev => { for (const p of pend.current.values()) p.reject(new Error(ev.message || 'worker error')); pend.current.clear(); };
    return () => w.terminate();
  }, []);
  return useCallback((cmd, args, onProgress) => new Promise((resolve, reject) => { const id = ++seq.current; pend.current.set(id, { resolve, reject, onProgress }); ref.current.postMessage({ id, cmd, args }); }), []);
}
function startMonteCarlo(cfg, total, onProgress) {
  const k = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)), per = Math.ceil(total / k), prog = new Array(k).fill(0), ws = [];
  const promise = Promise.all([...Array(k)].map((_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL('./mc.worker.js', import.meta.url)); ws.push(w);
    w.onmessage = e => { const d = e.data; if (d.progress !== undefined) { prog[i] = d.progress; onProgress(prog.reduce((a, b) => a + b, 0) / k); return; } w.terminate(); d.ok ? res(d.result) : rej(new Error(d.error)); };
    w.onerror = ev => { w.terminate(); rej(new Error(ev.message || 'Monte Carlo worker failed')); };
    w.postMessage({ id: 1, cfg: { ...cfg, n: per, seed: (cfg.seed || 1) * 1000 + i + 1 } });
  }))).then(mergeMC);
  return { promise, cancel: () => ws.forEach(w => w.terminate()), threads: k };
}

// ── small UI atoms ────────────────────────────────────────
const inp = { padding: '3px 6px', border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontFamily: 'inherit', background: '#fff', color: C.ink };
function Num({ label, value, onChange, unit, step = 'any', min, max, w = 78, hint }) {
  return <label title={hint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '5px 0', fontSize: 12 }}>
    <span style={{ color: C.mute }}>{label}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="number" value={value} step={step} min={min} max={max} onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} style={{ ...inp, width: w, textAlign: 'right' }} />{unit && <span style={{ color: C.mute, minWidth: 28, fontSize: 11 }}>{unit}</span>}</span>
  </label>;
}
function Sel({ label, value, onChange, options, w = 170 }) {
  return <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '5px 0', fontSize: 12 }}>
    <span style={{ color: C.mute }}>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, width: w }}>{options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}</select>
  </label>;
}
const Chk = ({ label, checked, onChange, hint }) => <label title={hint} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0', fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />{label}</label>;
const Sec = ({ title, children }) => <div style={{ borderTop: `1px solid ${C.line}`, padding: '8px 0 4px', marginTop: 6 }}><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, marginBottom: 4 }}>{title}</div>{children}</div>;
const Btn = ({ children, onClick, primary, disabled, title, small }) => <button title={title} disabled={disabled} onClick={onClick} style={{ padding: small ? '3px 8px' : '6px 12px', fontSize: small ? 11 : 12, borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer', border: `1px solid ${primary ? C.accent : C.line}`, background: disabled ? '#eef0f3' : primary ? C.accent : '#fff', color: disabled ? '#9aa1ad' : primary ? '#fff' : C.ink, fontWeight: primary ? 600 : 400, whiteSpace: 'nowrap' }}>{children}</button>;
const KV = ({ k, v, tone }) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '3px 0' }}><span style={{ color: C.mute }}>{k}</span><span style={{ color: tone || C.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>;
const Note = ({ children, tone }) => <div style={{ fontSize: 11.5, lineHeight: 1.45, color: tone || C.mute, background: tone ? '#fff7ed' : C.soft, border: `1px solid ${tone ? '#fed7aa' : C.line}`, borderRadius: 5, padding: '6px 8px', margin: '6px 0' }}>{children}</div>;

// ── plots ─────────────────────────────────────────────────
function usePlot(draw, deps, w = 300, h = 180) {
  const ref = useRef(null);
  useEffect(() => { const cv = ref.current; if (!cv) return; const dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); draw(ctx, w, h); }, deps);
  return <canvas ref={ref} style={{ width: w, height: h, display: 'block', border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff' }} />;
}
function logAxes(ctx, w, h, X, Y) {
  const L = 38, B = 22, T = 8, R = 8, px = v => L + (Math.log10(v) - X[0]) / (X[1] - X[0]) * (w - L - R), py = v => T + (Y[1] - Math.log10(v)) / (Y[1] - Y[0]) * (h - T - B);
  ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = C.mute; ctx.font = '9.5px system-ui'; ctx.lineWidth = 1;
  for (let e = Math.ceil(X[0]); e <= X[1]; e++) { const x = px(10 ** e); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke(); ctx.fillText(e >= 3 ? `${10 ** (e - 3)}µm` : `${10 ** e}nm`, x - 10, h - 8); }
  for (let e = Math.ceil(Y[0]); e <= Y[1]; e += Math.max(1, Math.round((Y[1] - Y[0]) / 5))) { const y = py(10 ** e); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.fillText(`1e${e}`, 4, y + 3); }
  return { px, py };
}
function PsfPlot({ psf, data, g2 }) {
  return usePlot((ctx, w, h) => {
    if (!psf) { ctx.fillStyle = C.mute; ctx.fillText('no PSF', 10, 20); return; }
    const sMax = Math.max(...psf.terms.map(t => t.s)), X = [0, Math.log10(sMax * 3)];
    let ymax = -Infinity, ymin = Infinity; for (let r = 1; r < sMax * 3; r *= 1.2) { const v = psfEval(psf, r); if (v > 0) { ymax = Math.max(ymax, Math.log10(v)); ymin = Math.min(ymin, Math.log10(v)); } }
    const Y = [Math.max(ymin, ymax - 14), ymax + 0.3]; const { px, py } = logAxes(ctx, w, h, X, Y);
    if (data) { ctx.fillStyle = 'rgba(194,65,12,.55)'; for (let i = 0; i < data.r.length; i++) { const v = data.f[i] / (data.norm || 1); if (v > 0 && data.r[i] >= 1) { const y = py(v); if (y > 4 && y < h - 20) ctx.fillRect(px(data.r[i]) - 1, y - 1, 2.5, 2.5); } } }
    const curve = (fn, col, dash) => { ctx.strokeStyle = col; ctx.setLineDash(dash || []); ctx.lineWidth = 1.6; ctx.beginPath(); let st = false; for (let r = 1; r < sMax * 3; r *= 1.04) { const v = fn(r); if (!(v > 0)) { st = false; continue; } const y = py(v); if (y > h - 22) { st = false; continue; } st ? ctx.lineTo(px(r), y) : ctx.moveTo(px(r), y); st = true; } ctx.stroke(); ctx.setLineDash([]); };
    if (g2) curve(r => psfEval(g2, r), '#9aa1ad', [4, 3]);
    curve(r => psfEval(psf, r), C.accent);
  }, [psf, data, g2], 300, 190);
}
function LinePlot({ ys, label, logY }) {
  return usePlot((ctx, w, h) => {
    if (!ys || !ys.length) return; const L = 34, B = 16, T = 8, R = 6, vs = ys.map(v => logY ? Math.log10(Math.max(v, 1e-6)) : v), mn = Math.min(...vs, logY ? -3 : 0), mx = Math.max(...vs);
    ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = C.mute; ctx.font = '9.5px system-ui';
    for (let k = 0; k <= 3; k++) { const v = mn + (mx - mn) * k / 3, y = T + (1 - k / 3) * (h - T - B); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.fillText(logY ? `${(10 ** v * 100).toPrecision(2)}%` : v.toFixed(2), 2, y + 3); }
    ctx.strokeStyle = C.beam; ctx.lineWidth = 1.6; ctx.beginPath();
    vs.forEach((v, i) => { const x = L + i / Math.max(1, vs.length - 1) * (w - L - R), y = T + (1 - (v - mn) / ((mx - mn) || 1)) * (h - T - B); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    ctx.fillStyle = C.mute; ctx.fillText(label, L + 4, h - 4);
  }, [ys, label, logY], 300, 110);
}
function DoseHist({ classDose, areas, lo, hi }) {
  return usePlot((ctx, w, h) => {
    if (!classDose) return; const n = classDose.length - 1, mx = Math.max(...areas.slice(1), 1), bw = (w - 10) / n;
    for (let c = 1; c <= n; c++) { const t = (Math.log(classDose[c]) - Math.log(lo)) / ((Math.log(hi) - Math.log(lo)) || 1), bh = (areas[c] / mx) * (h - 26); ctx.fillStyle = rgb(turbo(t)); ctx.fillRect(5 + (c - 1) * bw, h - 16 - bh, Math.max(1, bw - 1), bh); }
    ctx.fillStyle = C.mute; ctx.font = '9.5px system-ui'; ctx.fillText(classDose[1].toFixed(3), 4, h - 4); const s = classDose[n].toFixed(3); ctx.fillText(s, w - 6 - ctx.measureText(s).width, h - 4); ctx.fillText('area per dose class', w / 2 - 44, 10);
  }, [classDose, areas], 300, 100);
}

// ── layout viewer ─────────────────────────────────────────
function Viewer({ layers, view, overlays, bbox, fitKey, simBox, setSimBox, onView }) {
  const wrap = useRef(null), cv = useRef(null), [size, setSize] = useState({ w: 600, h: 400 }), [tr, setTr] = useState({ x: 300, y: 200, s: 1 }), drag = useRef(null), [hover, setHover] = useState(null);
  useEffect(() => { const el = wrap.current; const ob = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) })); ob.observe(el); return () => ob.disconnect(); }, []);
  const fit = useCallback(() => { if (!bbox) return; const W = bbox.x1 - bbox.x0 || 1, H = bbox.y1 - bbox.y0 || 1, s = Math.min(size.w / W, size.h / H) * 0.88; setTr({ s, x: size.w / 2 - (bbox.x0 + W / 2) * s, y: size.h / 2 + (bbox.y0 + H / 2) * s }); }, [bbox, size]);
  useEffect(() => { fit(); }, [fitKey, size.w > 0 && size.h > 0]);
  useEffect(() => { onView && onView({ x0: -tr.x / tr.s, x1: (size.w - tr.x) / tr.s, y0: (tr.y - size.h) / tr.s, y1: tr.y / tr.s }); }, [tr, size]);
  const { rings, traps, pec, fields, sim } = layers;
  // per-class index lists for batched fills
  const classIdx = useMemo(() => {
    const src = view === 'fields' && fields ? fields : pec; if (!src || !pec) return null;
    const n = pec.classDose.length - 1, L = Array.from({ length: n + 1 }, () => []), grp = src.fragGroup;
    for (let i = 0; i < src.frags.n; i++) L[pec.cls[grp[i]]].push(i);
    const lo = pec.classDose[1], hi = pec.classDose[n];
    return { L, col: Array.from(pec.classDose, d => rgb(turbo((Math.log(d) - Math.log(lo)) / ((Math.log(hi) - Math.log(lo)) || 1)))), src };
  }, [pec, fields, view]);
  const simImg = useMemo(() => {
    if (!sim) return null; const { nx, ny, E } = sim, c = document.createElement('canvas'); c.width = nx; c.height = ny;
    const ctx = c.getContext('2d'), im = ctx.createImageData(nx, ny); let mx = 0; for (const v of E) mx = Math.max(mx, v);
    const top = Math.max(1.2, mx);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = E[j * nx + i], [r, g, b] = turbo(v / top), o = ((ny - 1 - j) * nx + i) * 4; im.data[o] = r; im.data[o + 1] = g; im.data[o + 2] = b; im.data[o + 3] = 255; }
    ctx.putImageData(im, 0, 0); return { c, top };
  }, [sim]);
  // hover index
  const hoverIdx = useMemo(() => {
    const src = pec && (view === 'dose' || view === 'fields' || view === 'sim') ? (view === 'fields' && fields ? fields : pec) : null; if (!src || !bbox) return null;
    const cs = Math.max((bbox.x1 - bbox.x0), (bbox.y1 - bbox.y0)) / 200 || 1, map = new Map(), t = src.frags.t;
    for (let i = 0; i < src.frags.n; i++) { const o = i * 6; const gx0 = Math.floor(Math.min(t[o + 2], t[o + 4]) / cs), gx1 = Math.floor(Math.max(t[o + 3], t[o + 5]) / cs), gy0 = Math.floor(t[o] / cs), gy1 = Math.floor(t[o + 1] / cs); if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 400) continue; for (let x = gx0; x <= gx1; x++) for (let y = gy0; y <= gy1; y++) { const k = x + ',' + y; let a = map.get(k); if (!a) map.set(k, a = []); a.push(i); } }
    return { cs, map, src };
  }, [pec, fields, view, bbox]);

  useEffect(() => {
    const c = cv.current; if (!c) return; const dpr = window.devicePixelRatio || 1; c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fbfbfc'; ctx.fillRect(0, 0, size.w, size.h);
    const { s } = tr, X = x => tr.x + x * s, Y = y => tr.y - y * s;
    const vx0 = -tr.x / s, vx1 = (size.w - tr.x) / s, vy0 = (tr.y - size.h) / s, vy1 = tr.y / s;
    const trapPath = (t, o) => { ctx.moveTo(X(t[o + 2]), Y(t[o])); ctx.lineTo(X(t[o + 3]), Y(t[o])); ctx.lineTo(X(t[o + 5]), Y(t[o + 1])); ctx.lineTo(X(t[o + 4]), Y(t[o + 1])); ctx.closePath(); };
    const visible = (t, o) => !(t[o + 1] < vy0 || t[o] > vy1 || Math.max(t[o + 3], t[o + 5]) < vx0 || Math.min(t[o + 2], t[o + 4]) > vx1);
    const drawTraps = (src, fill, stroke, lw = 1) => { if (!src) return; const t = src.t; ctx.beginPath(); for (let i = 0; i < src.n; i++) { const o = i * 6; if (visible(t, o)) trapPath(t, o); } if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
    if (view === 'layout' && rings) {
      const byL = new Map(); for (let i = 0; i < rings.layer.length; i++) { const l = rings.layer[i]; let a = byL.get(l); if (!a) byL.set(l, a = []); a.push(i); }
      let li = 0; for (const [, idx] of byL) { const col = LCOL[li++ % LCOL.length]; ctx.beginPath(); for (const i of idx) { const a = rings.off[i], b = rings.off[i + 1]; ctx.moveTo(X(rings.xy[a]), Y(rings.xy[a + 1])); for (let k = a + 2; k < b; k += 2) ctx.lineTo(X(rings.xy[k]), Y(rings.xy[k + 1])); ctx.closePath(); } ctx.fillStyle = col + '30'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (view === 'fractured' && traps) drawTraps(traps, 'rgba(37,99,235,.14)', '#2563eb', 0.8);
    if ((view === 'dose' || view === 'fields') && classIdx) {
      const t = classIdx.src.frags.t;
      classIdx.L.forEach((idx, c) => { if (!idx.length) return; ctx.beginPath(); for (const i of idx) { const o = i * 6; if (visible(t, o)) trapPath(t, o); } ctx.fillStyle = classIdx.col[c]; ctx.fill(); });
      if (overlays.outlines) drawTraps(classIdx.src.frags, null, 'rgba(0,0,0,.35)', 0.6);
      if (overlays.ctrl && view === 'dose' && pec.ctrl) { const n = pec.ctrl.length / 2; for (let g = 0; g < n; g++) { const x = X(pec.ctrl[2 * g]), y = Y(pec.ctrl[2 * g + 1]); if (x < -4 || x > size.w + 4 || y < -4 || y > size.h + 4) continue; ctx.fillStyle = pec.kind[g] ? '#111' : '#fff'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } }
    }
    if (view === 'fields' && fields) {
      ctx.strokeStyle = 'rgba(194,65,12,.85)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 3]);
      for (const f of fields.fields) ctx.strokeRect(X(f.x0), Y(f.y1), (f.x1 - f.x0) * s, (f.y1 - f.y0) * s);
      ctx.setLineDash([]);
      const used = new Set(fields.fragField); const ord = fields.order.filter(f => used.has(f));
      if (overlays.order) { ctx.strokeStyle = 'rgba(194,65,12,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ord.forEach((f, k) => { const F = fields.fields[f], x = X((F.x0 + F.x1) / 2), y = Y((F.y0 + F.y1) / 2); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
      ctx.fillStyle = C.beam; ctx.font = 'bold 11px system-ui'; ord.forEach((f, k) => { const F = fields.fields[f]; if ((F.x1 - F.x0) * s > 26) ctx.fillText(String(k + 1), X(F.x0) + 4, Y(F.y1) + 13); });
    }
    if (view === 'sim' && sim && simImg) {
      ctx.imageSmoothingEnabled = true; ctx.drawImage(simImg.c, X(sim.x0), Y(sim.y0 + sim.ny * sim.pitch), sim.nx * sim.pitch * s, sim.ny * sim.pitch * s);
      drawTraps(traps || (pec && pec.frags), null, 'rgba(255,255,255,.7)', 0.8);
      const seg = (a, col, dash) => { if (!a) return; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash || []); ctx.beginPath(); for (let i = 0; i < a.length; i += 4) { ctx.moveTo(X(a[i]), Y(a[i + 1])); ctx.lineTo(X(a[i + 2]), Y(a[i + 3])); } ctx.stroke(); ctx.setLineDash([]); };
      seg(sim.segU, '#ff4d4d', [5, 4]); seg(sim.seg, '#00e676');
    }
    if (simBox) { ctx.strokeStyle = C.beam; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(X(simBox.x0), Y(simBox.y1), (simBox.x1 - simBox.x0) * s, (simBox.y1 - simBox.y0) * s); ctx.setLineDash([]); }
    // scale bar
    const target = 120 / s, p10 = 10 ** Math.floor(Math.log10(target)), nice = [1, 2, 5, 10].map(k => k * p10).filter(v => v <= target).pop() || p10;
    ctx.fillStyle = C.ink; ctx.fillRect(14, size.h - 18, nice * s, 3); ctx.font = '11px system-ui'; ctx.fillText(fmtLen(nice), 14, size.h - 23);
  }, [size, tr, view, rings, traps, pec, fields, sim, simImg, classIdx, overlays, simBox]);

  const toNm = e => { const r = cv.current.getBoundingClientRect(); return [(e.clientX - r.left - tr.x) / tr.s, (tr.y - (e.clientY - r.top)) / tr.s]; };
  const onDown = e => { const [x, y] = toNm(e); drag.current = { sx: e.clientX, sy: e.clientY, tx: tr.x, ty: tr.y, box: e.shiftKey ? [x, y] : null }; };
  const onMove = e => {
    const d = drag.current, [x, y] = toNm(e);
    if (d && d.box) { setSimBox({ x0: Math.min(d.box[0], x), x1: Math.max(d.box[0], x), y0: Math.min(d.box[1], y), y1: Math.max(d.box[1], y) }); return; }
    if (d) { setTr(t => ({ ...t, x: d.tx + e.clientX - d.sx, y: d.ty + e.clientY - d.sy })); return; }
    let info = { x, y };
    if (hoverIdx) { const a = hoverIdx.map.get(Math.floor(x / hoverIdx.cs) + ',' + Math.floor(y / hoverIdx.cs)); if (a) { const t = hoverIdx.src.frags.t; for (const i of a) { const o = i * 6; if (y < t[o] || y > t[o + 1]) continue; const f = (y - t[o]) / ((t[o + 1] - t[o]) || 1); if (x >= t[o + 2] + (t[o + 4] - t[o + 2]) * f && x <= t[o + 3] + (t[o + 5] - t[o + 3]) * f) { const g = hoverIdx.src.fragGroup[i], c = pec.cls[g]; info = { ...info, dose: pec.dose[g], cls: c, cd: pec.classDose[c], field: hoverIdx.src.fragField ? hoverIdx.src.fragField[i] : null }; break; } } } }
    if (view === 'sim' && sim) { const i = Math.floor((x - sim.x0) / sim.pitch), j = Math.floor((y - sim.y0) / sim.pitch); if (i >= 0 && j >= 0 && i < sim.nx && j < sim.ny) info.E = sim.E[j * sim.nx + i]; }
    setHover(info);
  };
  const onWheel = e => { const r = cv.current.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY < 0 ? 1.25 : 0.8; setTr(t => ({ s: t.s * k, x: mx - (mx - t.x) * k, y: my - (my - t.y) * k })); };
  useEffect(() => { const c = cv.current; const h = e => e.preventDefault(); c.addEventListener('wheel', h, { passive: false }); return () => c.removeEventListener('wheel', h); }, []);
  return <div ref={wrap} style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
    <canvas ref={cv} style={{ width: size.w, height: size.h, display: 'block', cursor: drag.current ? 'grabbing' : 'crosshair' }} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; setHover(null); }} onWheel={onWheel} onDoubleClick={fit} />
    <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, color: C.ink, background: 'rgba(255,255,255,.9)', border: `1px solid ${C.line}`, borderRadius: 5, padding: '4px 8px', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
      {hover ? <>x {fmtLen(hover.x)} · y {fmtLen(hover.y)}{hover.cls != null && <> · class {hover.cls} · dose ×{hover.cd.toFixed(3)} <span style={{ color: C.mute }}>(exact ×{hover.dose.toFixed(3)})</span></>}{hover.field != null && <> · field {hover.field}</>}{hover.E != null && <> · E {hover.E.toFixed(3)}</>}</> : 'drag to pan · wheel to zoom · double-click to fit · shift-drag = simulation box'}
    </div>
    {(view === 'dose' || view === 'fields') && pec && <div style={{ position: 'absolute', left: 10, bottom: 34, background: 'rgba(255,255,255,.92)', border: `1px solid ${C.line}`, borderRadius: 5, padding: '5px 8px', fontSize: 11 }}>
      <div style={{ color: C.mute, marginBottom: 3 }}>relative dose</div>
      <div style={{ width: 160, height: 10, background: `linear-gradient(90deg, ${[0, .25, .5, .75, 1].map(t => rgb(turbo(t))).join(',')})`, borderRadius: 2 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>×{pec.classDose[1].toFixed(2)}</span><span>×{pec.classDose[pec.classDose.length - 1].toFixed(2)}</span></div>
    </div>}
    {view === 'sim' && sim && <div style={{ position: 'absolute', left: 10, bottom: 34, background: 'rgba(255,255,255,.92)', border: `1px solid ${C.line}`, borderRadius: 5, padding: '5px 8px', fontSize: 11 }}>
      <div style={{ color: C.mute, marginBottom: 3 }}>absorbed energy (large pad = 1)</div>
      <div style={{ width: 160, height: 10, background: `linear-gradient(90deg, ${[0, .25, .5, .75, 1].map(t => rgb(turbo(t))).join(',')})`, borderRadius: 2 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>0</span><span>{(simImg ? simImg.top : 1.2).toFixed(2)}</span></div>
      <div style={{ marginTop: 3 }}><span style={{ color: '#00a152', fontWeight: 700 }}>━</span> developed edge (PEC) {sim.segU && <><span style={{ color: '#ff4d4d', fontWeight: 700, marginLeft: 6 }}>┅</span> uniform dose</>}</div>
    </div>}
  </div>;
}

// ── flow definition ───────────────────────────────────────
const MODULES = [
  { id: 'import', icon: '📥', name: 'Import', what: 'Choose the layout source and the top cell.' },
  { id: 'extract', icon: '🧩', name: 'Extract', what: 'Pick the layers to expose and, optionally, a region.' },
  { id: 'bias', icon: '↔', name: 'Bias', what: 'Grow or shrink every shape (CD compensation). Applied before healing.' },
  { id: 'fracture', icon: '◩', name: 'Heal & Fracture', what: 'Merge overlapping shapes (union) and cut them into non-overlapping trapezoids.' },
  { id: 'psf', icon: '⊙', name: 'PSF', what: 'Point-spread function: how energy spreads around the beam. From literature presets, your own α/β/η, a Monte Carlo run, or an imported file.', side: true },
  { id: 'pec', icon: '⚖', name: 'PEC', what: 'Proximity effect correction: split figures near edges and assign each piece a dose so that every edge receives the same energy.' },
  { id: 'fields', icon: '▦', name: 'Fields', what: 'Split figures at write-field boundaries and order the fields (meander).' },
  { id: 'sim', icon: '◍', name: 'Simulate', what: 'Expose the corrected pattern with the PSF and show the developed edge (threshold model).', side: true },
  { id: 'export', icon: '📤', name: 'Export', what: 'Write GDSII with dose classes, a dose table, and estimate dwell and write time.' },
];
const STAGES = ['import', 'fracture', 'pec', 'fields'];
const stageOf = id => ({ import: 'import', extract: 'import', bias: 'import', fracture: 'fracture', psf: 'pec', pec: 'pec', fields: 'fields', sim: 'pec', export: 'pec' })[id];

const DEFAULTS = {
  top: '', layers: null, region: 'all', win: { x0: 0, y0: 0, x1: 10000, y1: 10000 }, maxPolys: 400000,
  biasOn: false, bias: 0,
  fracMode: 'trap', rectStep: 10,
  psfMode: 'preset', presetId: 'si100', manual: { alpha: 10, beta: 31200, eta: 0.74, gamma: 0, nu: 0 }, blur: 15,
  mc: { resist: 'PMMA', resistT: 200, inter: [], substrate: 'Si', kV: 100, electrons: 100000, beamFWHM: 2 },
  fragAuto: true, fragMax: 1000, edgeW: 60, smallSize: 400,
  pecOn: true, mix: 1, tol: 0.01, maxIter: 60, classMode: 'accuracy', acc: 0.01, nClasses: 64, maxClasses: 256,
  fieldsOn: true, fieldUm: 100, origin: 'bbox',
  simPitch: 0, simThr: 0.5, simCompare: true,
  expMode: 'datatype', layerKeep: true, layerOut: 1, layerBase: 100, cellPerField: false, baseDose: 300, current: 1, bss: 10, minDwell: 20, fileName: 'softebeam',
};

export default function SoftEBeam({ initialLib, initialName, onBack, parsers }) {
  const call = useEngine();
  const saved = useMemo(() => lsGet(), []);
  const [P, setP] = useState(() => ({ ...DEFAULTS, ...(saved || {}), mc: { ...DEFAULTS.mc, ...((saved && saved.mc) || {}) }, manual: { ...DEFAULTS.manual, ...((saved && saved.manual) || {}) }, top: '', layers: null }));
  const [sel, setSel] = useState('import');
  const [meta, setMeta] = useState(null); // {tops, layers, cells, name}
  const [srcName, setSrcName] = useState('');
  const [res, setRes] = useState({});
  const doneRef = useRef({}); const [done, setDoneS] = useState({});
  const setDone = d => { doneRef.current = d; setDoneS(d); };
  const [running, setRunning] = useState(null);
  const [prog, setProg] = useState(null);
  const [status, setStatus] = useState('Open a GDS/OASIS file or send a layout from the editor.');
  const [err, setErr] = useState({});
  const [view, setView] = useState('layout');
  const [overlays, setOverlays] = useState({ outlines: false, ctrl: false, order: true });
  const [simBox, setSimBox] = useState(null);
  const [viewWin, setViewWin] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [psfData, setPsfData] = useState(psfGet); // {r,f,f0,r0,label,fit,g2,info} — persisted
  useEffect(() => { psfSet(psfData); }, [psfData]);
  const mcRef = useRef(null);
  const fileRef = useRef(null), psfFileRef = useRef(null), flowFileRef = useRef(null);
  const up = (k, v) => setP(p => ({ ...p, [k]: v }));
  useEffect(() => { const { top, layers, ...rest } = P; lsSet(rest); }, [P]);

  // invalidate downstream stages when parameters change
  const invalidate = useCallback(from => {
    const i = STAGES.indexOf(from); if (i < 0) return; const d = { ...doneRef.current }; STAGES.slice(i).forEach(s => { d[s] = false; }); setDone(d);
    setRes(r => { const n = { ...r }; if (i <= 1) delete n.fracture; if (i <= 2) { delete n.pec; delete n.sim; } if (i <= 3) delete n.fields; if (i === 0) delete n.import; return n; });
  }, []);
  const set = (stage, k, v) => { up(k, v); invalidate(stage); };

  // ── active PSF ─────────────────────────────────────────
  const blurA = P.blur > 0 ? P.blur / (2 * Math.sqrt(Math.LN2)) : 0;
  const psfActive = useMemo(() => {
    const addBlur = psf => psf && ({ terms: psf.terms.map(t => ({ s: Math.sqrt(t.s * t.s + blurA * blurA), w: t.w })) });
    if (P.psfMode === 'preset') { const p = PSF_PRESETS.find(x => x.id === P.presetId) || PSF_PRESETS[0]; return addBlur(psfFromParams(p)); }
    if (P.psfMode === 'manual') { const m = P.manual; if (!(m.alpha > 0 && m.beta > 0 && m.eta >= 0)) return null; return addBlur(psfFromParams(m)); }
    return psfData && psfData.fit ? addBlur(psfData.fit.psf) : null;
  }, [P.psfMode, P.presetId, P.manual, blurA, psfData]);
  const g2Active = useMemo(() => { try { if (!psfActive) return null; if (P.psfMode === 'mc' || P.psfMode === 'file') return psfData && psfData.g2 ? psfFromParams({ ...psfData.g2, beamFWHM: P.blur }) : null; return null; } catch { return null; } }, [psfActive, psfData, P.psfMode, P.blur]);
  const psfSummary = useMemo(() => {
    if (!psfActive) return null; const sMax = Math.max(...psfActive.terms.map(t => t.s)); let Wb = 0, W = 0; for (const t of psfActive.terms) { W += t.w; if (t.s >= 0.1 * sMax) Wb += t.w; }
    const r50 = (() => { let lo = 0.1, hi = sMax * 5; for (let k = 0; k < 60; k++) { const m = Math.sqrt(lo * hi); psfEnclosed(psfActive, m) < 0.5 ? (lo = m) : (hi = m); } return hi; })();
    // effective forward blur: radius holding 1 − 1/e of the forward (non-backscatter) energy — equals α for one Gaussian
    const fwd = { terms: psfActive.terms.filter(t => t.s < 0.1 * sMax) }; let aEff = 0;
    if (fwd.terms.length) { let lo = 0.01, hi = 0.1 * sMax; for (let k = 0; k < 60; k++) { const m = Math.sqrt(lo * hi); psfEnclosed(fwd, m) < 1 - 1 / Math.E ? (lo = m) : (hi = m); } aEff = hi; }
    return { eta: Wb / Math.max(1e-12, W - Wb), beta: sMax, r50, aEff, nTerms: psfActive.terms.length };
  }, [psfActive]);
  useEffect(() => { invalidate('pec'); }, [psfActive]);

  // automatic fragmentation sizes from the PSF (edge strip ≈ 3·α_eff, interior ≈ β/10)
  const frag = useMemo(() => {
    if (!P.fragAuto || !psfSummary) return { fragMax: P.fragMax, edgeW: P.edgeW, smallSize: P.smallSize };
    const edgeW = Math.round(Math.min(250, Math.max(20, 3 * psfSummary.aEff))), fragMax = Math.round(Math.min(5000, Math.max(4 * edgeW, psfSummary.beta / 10)));
    return { fragMax, edgeW, smallSize: Math.max(300, 4 * edgeW) };
  }, [P.fragAuto, P.fragMax, P.edgeW, P.smallSize, psfSummary]);

  // ── loading a layout ───────────────────────────────────
  const [autoImport, setAutoImport] = useState(0);
  const loadLib = useCallback(async (lib, name) => {
    setRunning('load'); setStatus(`Loading ${name}…`); setRes({}); setDone({}); setErr({}); setSimBox(null);
    try {
      const m = await call('load', { lib }); setMeta(m); setSrcName(name);
      setP(p => ({ ...p, top: m.tops[0] || '', layers: null }));
      setStatus(`${name}: ${m.cells} cells, ${m.layers.length} layers. Press ▶ Run flow.`); setView('layout');
      setAutoImport(k => k + 1);
    } catch (e) { setStatus('⚠ ' + e.message); }
    setRunning(null);
  }, [call]);
  useEffect(() => { if (autoImport && meta) runTo('import').then(ok => ok && setStatus(s => `${s} Press ▶ Run flow for PEC.`)); }, [autoImport]);
  useEffect(() => { if (initialLib) loadLib(initialLib, initialName || initialLib.name || 'editor layout'); }, [initialLib]);
  const openFile = async f => {
    if (!f) return; setStatus(`Reading ${f.name}…`);
    try {
      const buf = await f.arrayBuffer(), isOas = /\.oas(is)?$/i.test(f.name);
      const lib = isOas ? parsers.parseOASIS(buf) : await parsers.parseGDSAsync(buf, () => { }, { current: false });
      await loadLib(lib, f.name);
    } catch (e) { setStatus('⚠ ' + e.message); }
  };

  // ── stage runners ──────────────────────────────────────
  const runStage = async st => {
    setErr(e => ({ ...e, [st]: null })); setRunning(st);
    const t0 = performance.now();
    try {
      if (st === 'import') {
        const r = await call('import', { top: P.top, layers: P.layers, window: P.region === 'custom' ? P.win : null, maxPolys: P.maxPolys, bias: P.biasOn ? +P.bias || 0 : 0 });
        setRes({ import: r }); if (r.bbox) setFitKey(k => k + 1); setView('layout');
        setStatus(`Imported ${fmtN(r.nRings)} shapes${r.truncated ? ` (stopped at ${fmtN(P.maxPolys)} — select a region or fewer layers)` : ''}.`);
      } else if (st === 'fracture') {
        const r = await call('fracture', { mode: P.fracMode, rectStep: P.rectStep });
        setRes(x => ({ import: x.import, fracture: r })); setView('fractured'); setStatus(`${fmtN(r.n)} trapezoids in ${fmtN(r.nComp)} connected shapes.`);
      } else if (st === 'pec') {
        if (!psfActive) throw new Error('define a PSF first');
        const r = await call('pec', { frag, psf: psfActive, pec: { enabled: P.pecOn, mix: P.mix, tol: P.tol, maxIter: P.maxIter }, classes: { mode: P.classMode, acc: P.acc, n: P.nClasses, max: P.maxClasses } },
          m => setProg(m.stage === 'iterate' ? { label: `PEC iteration ${m.iter + 1} · max error ${(m.maxErr * 100).toFixed(2)} %`, p: null } : { label: 'PEC: short-range matrix', p: m.p }));
        setRes(x => ({ import: x.import, fracture: x.fracture, pec: r })); setView('dose');
        setStatus(r.corrected ? `PEC: ${fmtN(r.nFrags)} figures, ${fmtN(r.nGroups)} dose groups, ${r.nClasses} classes; converged to ${pct(r.maxErr)} in ${r.iters} iterations.` : `Dose 1.0 assigned to ${fmtN(r.nFrags)} figures (PEC off).`);
      } else if (st === 'fields') {
        if (!P.fieldsOn) { setRes(x => { const n = { ...x }; delete n.fields; return n; }); }
        else { const r = await call('fields', { size: P.fieldUm * 1000, originMode: P.origin }); setRes(x => ({ ...x, fields: r })); setView('fields'); setStatus(`${r.NX}×${r.NY} fields of ${P.fieldUm} µm, ${fmtN(r.n)} figures after field splitting.`); }
      }
      setDone({ ...doneRef.current, [st]: true });
      setStatus(s => `${s}  (${((performance.now() - t0) / 1000).toFixed(2)} s)`);
    } catch (e) { setErr(x => ({ ...x, [st]: e.message })); setStatus(`⚠ ${MODULES.find(m => stageOf(m.id) === st)?.name || st}: ${e.message}`); throw e; }
    finally { setRunning(null); setProg(null); }
  };
  const runTo = async id => {
    if (!meta) { setStatus('Open a layout first.'); return; }
    const target = stageOf(id), k = STAGES.indexOf(target);
    try { for (const st of STAGES.slice(0, k + 1)) if (!doneRef.current[st]) await runStage(st); } catch { return false; }
    return true;
  };
  const runAll = () => runTo('fields');

  const runSim = async () => {
    if (!(await runTo('pec'))) return;
    const pr = res.import && res.import.bbox; let win = simBox;
    if (!win && viewWin && pr) win = { x0: Math.max(pr.x0, viewWin.x0), x1: Math.min(pr.x1, viewWin.x1), y0: Math.max(pr.y0, viewWin.y0), y1: Math.min(pr.y1, viewWin.y1) };
    if (!win || win.x1 <= win.x0 || win.y1 <= win.y0) { setStatus('⚠ Zoom to an area or shift-drag a box first.'); return; }
    const pitch = P.simPitch > 0 ? P.simPitch : Math.max(0.5, Math.min((psfSummary ? psfSummary.aEff : 10) / 2, Math.sqrt((win.x1 - win.x0) * (win.y1 - win.y0) / 6e5)));
    setRunning('sim'); setStatus('Simulating exposure…');
    try {
      const r = await call('sim', { win, pitch, thr: P.simThr, psf: psfActive, uniform: false });
      if (P.simCompare && P.pecOn) { const u = await call('sim', { win, pitch, thr: P.simThr, psf: psfActive, uniform: true }); r.segU = u.seg; }
      setRes(x => ({ ...x, sim: r })); setView('sim'); setStatus(`Simulated ${r.nx}×${r.ny} px at ${fmtLen(r.pitch)} pitch.`);
    } catch (e) { setStatus('⚠ Simulation: ' + e.message); }
    setRunning(null);
  };
  const doExport = async () => {
    if (!(await runTo(P.fieldsOn ? 'fields' : 'pec'))) return;
    setRunning('export');
    try {
      const r = await call('export', { opts: { mode: P.expMode, layerOut: P.layerKeep ? null : +P.layerOut, layerBase: +P.layerBase, cellPerField: P.fieldsOn && P.cellPerField, useFields: P.fieldsOn, dbuNm: 1, libName: 'SOFTEBEAM', top: (P.top || 'TOP').slice(0, 32) }, baseDose: +P.baseDose || null });
      download(r.bytes, `${P.fileName || 'softebeam'}.gds`); download(r.table, `${P.fileName || 'softebeam'}_dose_table.txt`, 'text/plain');
      setStatus(`Exported ${P.fileName}.gds (${(r.bytes.length / 1024).toFixed(0)} kB) and the dose table.`);
    } catch (e) { setStatus('⚠ Export: ' + e.message); }
    setRunning(null);
  };

  // ── Monte Carlo + PSF import ───────────────────────────
  const runMC = () => {
    const m = P.mc, layers = [{ mat: m.resist, t: +m.resistT }, ...m.inter.filter(l => l.t > 0).map(l => ({ mat: l.mat, t: +l.t })), { mat: m.substrate, t: Infinity }];
    const sig = (+m.beamFWHM || 0.1) / (2 * Math.sqrt(2 * Math.LN2));
    const t0 = performance.now(); const job = startMonteCarlo({ layers, resist: 0, E0: +m.kV, beamSigma: sig, seed: 7, Ec: 1, Ecut: 0.5 }, +m.electrons, p => setProg({ label: `Monte Carlo · ${job.threads} threads`, p }));
    mcRef.current = job; setRunning('mc'); setStatus(`Monte Carlo: ${fmtN(+m.electrons)} electrons on ${job.threads} threads…`);
    job.promise.then(res => {
      const rad = mcToRadial(res), fit = fitMultiGauss(rad); let g2 = null; try { g2 = fitPSF(rad.r, rad.f); } catch { }
      const label = `MC · ${layers.map(l => `${l.mat}${isFinite(l.t) ? ' ' + l.t + ' nm' : ''}`).join(' / ')} · ${m.kV} kV`;
      setPsfData({ ...rad, label, fit, g2, norm: fit.norm, info: `${fmtN(res.n)} e⁻ · backscatter coefficient ${res.nBack / res.n > 0 ? (res.nBack / res.n).toFixed(3) : '–'} · ${((performance.now() - t0) / 1000).toFixed(1)} s` });
      up('psfMode', 'mc'); setStatus(`Monte Carlo done: β≈${g2 ? fmtLen(g2.beta) : '–'}, η≈${g2 ? g2.eta.toFixed(2) : '–'} (2-Gaussian view); multi-Gaussian PSF in use.`);
    }).catch(e => setStatus('⚠ Monte Carlo: ' + e.message)).finally(() => { setRunning(null); setProg(null); mcRef.current = null; });
  };
  const loadPsfFile = async f => {
    if (!f) return;
    try {
      const buf = await f.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
      let d, label = f.name;
      if (head[0] === 0x78) { const x = parseLpsfXml(await inflateZlib(buf)); d = x; label = `${f.name} · ${x.energy_kV || '?'} kV · ${x.stack.map(s => `${s.material} ${s.thickness_nm}`).join(' / ')}`; }
      else if (/^\s*</.test(new TextDecoder().decode(buf.slice(0, 64)))) { d = parseLpsfXml(new TextDecoder().decode(buf)); }
      else d = parseTextPSF(new TextDecoder().decode(buf), P.psfUnit || 'nm');
      const c = cleanRadial(d); if (c.r.length < 8) throw new Error('could not find radius/value columns');
      const fit = fitMultiGauss(c); let g2 = null; try { g2 = fitPSF(c.r, c.f); } catch { }
      setPsfData({ ...c, label, fit, g2, norm: fit.norm, info: `${c.r.length} samples · max enclosed-energy error ${pct(fit.maxCumErr)}` }); up('psfMode', 'file');
      setStatus(`PSF loaded from ${f.name}.`);
    } catch (e) { setStatus('⚠ PSF file: ' + e.message); }
  };

  // ── flow save / load ───────────────────────────────────
  const saveFlow = () => { const { layers, ...rest } = P; download(JSON.stringify({ softebeam: 1, params: rest, layers }, null, 1), `${P.fileName || 'flow'}.sebflow.json`, 'application/json'); };
  const loadFlow = async f => { try { const j = JSON.parse(await f.text()); if (!j.params) throw new Error('not a Soft-EBeam flow'); setP(p => ({ ...p, ...j.params, layers: j.layers ?? p.layers })); invalidate('import'); setStatus(`Flow loaded from ${f.name}.`); } catch (e) { setStatus('⚠ ' + e.message); } };

  // ── card status ────────────────────────────────────────
  const cardStatus = id => {
    if (running && (stageOf(id) === running || (id === 'psf' && running === 'mc') || id === running)) return 'running';
    const st = stageOf(id); if (err[st] && !['psf', 'sim', 'export'].includes(id)) return 'error';
    switch (id) {
      case 'import': case 'extract': return !meta ? 'unset' : done.import ? 'done' : 'ready';
      case 'bias': return !P.biasOn ? 'off' : done.import ? 'done' : 'ready';
      case 'fracture': return !meta ? 'unset' : done.fracture ? 'done' : 'ready';
      case 'psf': return psfActive ? 'done' : 'unset';
      case 'pec': return !psfActive ? 'unset' : done.pec ? 'done' : 'ready';
      case 'fields': return !P.fieldsOn ? 'off' : done.fields ? 'done' : 'ready';
      case 'sim': return res.sim ? 'done' : 'ready';
      default: return meta ? 'ready' : 'unset';
    }
  };
  const summary = id => {
    const r = res;
    switch (id) {
      case 'import': return meta ? `${srcName} · top ${P.top}` : 'no layout';
      case 'extract': return meta ? `${P.layers ? `L${P.layers.join(',L')}` : 'all layers'} · ${P.region === 'all' ? 'full extent' : 'region'}${r.import ? ` · ${fmtN(r.import.nRings)} shapes` : ''}` : '';
      case 'bias': return P.biasOn ? `${P.bias > 0 ? '+' : ''}${P.bias} nm` : 'off';
      case 'fracture': return r.fracture ? `${fmtN(r.fracture.n)} trapezoids` : P.fracMode === 'rect' ? 'rectangles' : 'trapezoids';
      case 'psf': return psfSummary ? `${P.psfMode === 'preset' ? (PSF_PRESETS.find(x => x.id === P.presetId) || {}).label : P.psfMode === 'manual' ? 'manual α/β/η' : (psfData && psfData.label) || ''}` : 'not defined';
      case 'pec': return r.pec ? (r.pec.corrected ? `${r.pec.nClasses} classes · ×${r.pec.classDose[1].toFixed(2)}–×${r.pec.classDose[r.pec.nClasses].toFixed(2)}` : 'uniform dose') : P.pecOn ? `edge eq. ${Math.round(P.mix * 100)}% · ${P.classMode === 'accuracy' ? `${(P.acc * 100).toFixed(1)}% steps` : `${P.nClasses} classes`}` : 'off (dose 1.0)';
      case 'fields': return P.fieldsOn ? (r.fields ? `${r.fields.NX}×${r.fields.NY} × ${P.fieldUm} µm` : `${P.fieldUm} µm fields`) : 'off';
      case 'sim': return r.sim ? `${r.sim.nx}×${r.sim.ny} px` : 'threshold model';
      case 'export': return { datatype: 'GDS · datatype = class', layer: 'GDS · layer per class', raith: 'GDS · Raith (DT = 1000·DF)' }[P.expMode];
      default: return '';
    }
  };

  // ── inspector panels ───────────────────────────────────
  const pecR = res.pec;
  const writeEst = useMemo(() => {
    if (!pecR) return null; let Q = 0, A = 0, tmin = Infinity, tmax = 0;
    for (let c = 1; c < pecR.classDose.length; c++) { const a = pecR.areas[c] * 1e-14, d = pecR.classDose[c] * P.baseDose; Q += a * d; A += a; if (pecR.areas[c] > 0) { const dw = 0.01 * d * P.bss * P.bss / P.current; tmin = Math.min(tmin, dw); tmax = Math.max(tmax, dw); } }
    return { A, Q, t: Q * 1e-6 / (P.current * 1e-9), tmin, tmax };
  }, [pecR, P.baseDose, P.bss, P.current]);
  const layerList = meta ? meta.layers : [];
  const panel = () => {
    switch (sel) {
      case 'import': return <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}><Btn onClick={() => fileRef.current.click()}>📂 Open GDS / OASIS</Btn>{onBack && <Btn onClick={onBack} title="Back to the editor; press ⚡ E-Beam there to send the current layout here">⬡ From editor…</Btn>}</div>
        {meta ? <>
          <KV k="Source" v={srcName} /><KV k="Cells" v={meta.cells} /><KV k="Layers" v={meta.layers.join(', ') || '–'} />
          <Sel label="Top cell" value={P.top} onChange={v => set('import', 'top', v)} options={meta.tops} />
        </> : <Note>Open a layout here, or press <b>⚡ E-Beam</b> in the Layout Studio editor to bring the current layout over.</Note>}
      </>;
      case 'extract': return <>
        {meta && <Sec title="Layers to expose">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{layerList.map(l => { const on = !P.layers || P.layers.includes(l); return <button key={l} onClick={() => { const cur = P.layers || [...layerList]; const nx = on ? cur.filter(x => x !== l) : [...cur, l].sort((a, b) => a - b); set('import', 'layers', nx.length === layerList.length ? null : nx); }} style={{ ...inp, cursor: 'pointer', background: on ? '#e0e7ff' : '#fff', borderColor: on ? '#818cf8' : C.line }}>L{l}</button>; })}</div>
        </Sec>}
        <Sec title="Region">
          <Sel label="Extent" value={P.region} onChange={v => set('import', 'region', v)} options={[['all', 'Whole top cell'], ['custom', 'Custom box (nm)']]} />
          {P.region === 'custom' && <>{['x0', 'y0', 'x1', 'y1'].map(k => <Num key={k} label={k} unit="nm" value={P.win[k]} onChange={v => set('import', 'win', { ...P.win, [k]: v })} />)}
            <Btn small onClick={() => { if (viewWin) set('import', 'win', { x0: Math.round(viewWin.x0), y0: Math.round(viewWin.y0), x1: Math.round(viewWin.x1), y1: Math.round(viewWin.y1) }); }}>Use current view</Btn></>}
          <Num label="Shape limit" value={P.maxPolys} onChange={v => set('import', 'maxPolys', v)} step={10000} w={90} hint="Browser memory guard for huge array layouts" />
        </Sec>
      </>;
      case 'bias': return <>
        <Chk label="Apply bias" checked={P.biasOn} onChange={v => set('import', 'biasOn', v)} />
        {P.biasOn && <Num label="Bias per edge" unit="nm" value={P.bias} onChange={v => set('import', 'bias', v)} hint="Positive grows, negative shrinks (mitred corners)" />}
        <Note>Negative bias on shapes that touch other shapes can open gaps: apply it to stand-alone shapes, or merge first in the editor.</Note>
      </>;
      case 'fracture': return <>
        <Sel label="Figures" value={P.fracMode} onChange={v => set('fracture', 'fracMode', v)} options={[['trap', 'Trapezoids (any angle)'], ['rect', 'Rectangles only (staircase)']]} />
        {P.fracMode === 'rect' && <Num label="Staircase step" unit="nm" value={P.rectStep} onChange={v => set('fracture', 'rectStep', v)} />}
        {res.fracture && <Sec title="Result"><KV k="Trapezoids" v={fmtN(res.fracture.n)} /><KV k="Connected shapes" v={fmtN(res.fracture.nComp)} /><KV k="Exposed area" v={`${(res.fracture.area / 1e6).toFixed(2)} µm²`} /></Sec>}
        <Note>Overlaps are merged with a positive-winding union, then each shape is cut along horizontal lines at its vertices; collinear neighbours are re-merged.</Note>
      </>;
      case 'psf': return <>
        <Sel label="Source" value={P.psfMode} onChange={v => up('psfMode', v)} options={[['preset', 'Literature preset'], ['manual', 'α / β / η (manual)'], ['mc', 'Monte Carlo (this PC)'], ['file', 'Import file (.lpsf / text)']]} />
        {P.psfMode === 'preset' && <><Sel label="Preset" value={P.presetId} onChange={v => up('presetId', v)} options={PSF_PRESETS.map(p => [p.id, p.label])} w={190} />
          {(() => { const p = PSF_PRESETS.find(x => x.id === P.presetId); return p && <><KV k="α / β / η" v={`${fmtLen(p.alpha)} / ${fmtLen(p.beta)} / ${p.eta}`} /><KV k="Source" v={p.src} /></>; })()}</>}
        {P.psfMode === 'manual' && <>
          <Num label="α forward" unit="nm" value={P.manual.alpha} onChange={v => up('manual', { ...P.manual, alpha: v })} />
          <Num label="β backscatter" unit="nm" value={P.manual.beta} onChange={v => up('manual', { ...P.manual, beta: v })} />
          <Num label="η" value={P.manual.eta} onChange={v => up('manual', { ...P.manual, eta: v })} />
          <Num label="γ mid-range" unit="nm" value={P.manual.gamma} onChange={v => up('manual', { ...P.manual, gamma: v })} hint="Optional third Gaussian (0 = off)" />
          <Num label="ν" value={P.manual.nu} onChange={v => up('manual', { ...P.manual, nu: v })} />
        </>}
        {P.psfMode === 'mc' && <Sec title="Monte Carlo stack">
          <Sel label="Resist" value={P.mc.resist} onChange={v => up('mc', { ...P.mc, resist: v })} options={RESISTS} w={120} />
          <Num label="Resist thickness" unit="nm" value={P.mc.resistT} onChange={v => up('mc', { ...P.mc, resistT: v })} />
          {P.mc.inter.map((l, i) => <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', margin: '4px 0' }}>
            <select value={l.mat} onChange={e => { const a = [...P.mc.inter]; a[i] = { ...l, mat: e.target.value }; up('mc', { ...P.mc, inter: a }); }} style={{ ...inp, flex: 1 }}>{SUBSTRATES.map(m => <option key={m}>{m}</option>)}</select>
            <input type="number" value={l.t} onChange={e => { const a = [...P.mc.inter]; a[i] = { ...l, t: +e.target.value }; up('mc', { ...P.mc, inter: a }); }} style={{ ...inp, width: 70 }} /><span style={{ fontSize: 11, color: C.mute }}>nm</span>
            <button onClick={() => up('mc', { ...P.mc, inter: P.mc.inter.filter((_, k) => k !== i) })} style={{ ...inp, cursor: 'pointer' }}>✕</button></div>)}
          <Btn small onClick={() => up('mc', { ...P.mc, inter: [...P.mc.inter, { mat: 'Cr', t: 10 }] })}>+ layer (e.g. conductive film)</Btn>
          <Sel label="Substrate" value={P.mc.substrate} onChange={v => up('mc', { ...P.mc, substrate: v })} options={SUBSTRATES} w={120} />
          <Num label="Beam energy" unit="kV" value={P.mc.kV} onChange={v => up('mc', { ...P.mc, kV: v })} />
          <Num label="Electrons" value={P.mc.electrons} step={10000} onChange={v => up('mc', { ...P.mc, electrons: v })} w={90} />
          <Num label="Beam FWHM" unit="nm" value={P.mc.beamFWHM} onChange={v => up('mc', { ...P.mc, beamFWHM: v })} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{running === 'mc' ? <Btn onClick={() => { mcRef.current && mcRef.current.cancel(); setRunning(null); setProg(null); setStatus('Monte Carlo cancelled.'); }}>⏹ Cancel</Btn> : <Btn primary onClick={runMC} disabled={!!running}>▶ Run Monte Carlo</Btn>}</div>
          <Note>Single-scattering model: screened-Rutherford elastic scattering, relativistic Bethe energy loss, Møller fast secondaries. ~10⁵ electrons give β and η to ~1 %; use 10⁶ for a clean mid-range.</Note>
        </Sec>}
        {P.psfMode === 'file' && <Sec title="PSF file">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Btn onClick={() => psfFileRef.current.click()}>📄 Load PSF…</Btn><Sel label="" value={P.psfUnit || 'nm'} onChange={v => up('psfUnit', v)} options={[['nm', 'radius in nm'], ['um', 'radius in µm']]} w={110} /></div>
          <Note>Accepts TRACER/BEAMER <b>.lpsf</b> archives and two-column text (radius, energy density).</Note>
        </Sec>}
        {(P.psfMode === 'mc' || P.psfMode === 'file') && psfData && <><KV k="Loaded" v={<span style={{ maxWidth: 190, display: 'inline-block', textAlign: 'right' }}>{psfData.label}</span>} /><KV k="" v={psfData.info} /></>}
        <Sec title="Effective blur">
          <Num label="Beam + process blur" unit="nm" value={P.blur} onChange={v => up('blur', v)} hint="FWHM added in quadrature to every PSF term (beam size, resist blur)" />
        </Sec>
        {psfActive && <Sec title="PSF in use">
          <PsfPlot psf={psfActive} data={(P.psfMode === 'mc' || P.psfMode === 'file') ? psfData : null} g2={g2Active} />
          <div style={{ fontSize: 10.5, color: C.mute, margin: '3px 0' }}>PSF density (1/nm²) vs radius · <span style={{ color: C.accent }}>━</span> model used for PEC {psfData && (P.psfMode === 'mc' || P.psfMode === 'file') && <><span style={{ color: C.beam, marginLeft: 6 }}>●</span> data <span style={{ marginLeft: 6 }}>┅</span> 2-Gaussian fit</>}</div>
          {psfSummary && <><KV k="Effective α (forward)" v={fmtLen(psfSummary.aEff)} /><KV k="β (widest term)" v={fmtLen(psfSummary.beta)} /><KV k="η backscatter/forward" v={psfSummary.eta.toFixed(3)} /><KV k="50 % energy radius" v={fmtLen(psfSummary.r50)} /><KV k="Gaussian terms" v={psfSummary.nTerms} /></>}
          {psfData && psfData.g2 && (P.psfMode === 'mc' || P.psfMode === 'file') && <KV k="2-Gaussian view" v={`α ${fmtLen(psfData.g2.alpha)} · β ${fmtLen(psfData.g2.beta)} · η ${psfData.g2.eta.toFixed(2)}`} />}
        </Sec>}
      </>;
      case 'pec': return <>
        <Chk label="Proximity effect correction" checked={P.pecOn} onChange={v => set('pec', 'pecOn', v)} />
        {P.pecOn && <>
          <Sec title="Correction">
            <label style={{ fontSize: 12, color: C.mute, display: 'block', margin: '4px 0' }}>Edge equalization ↔ uniform clearing: <b style={{ color: C.ink }}>{Math.round(P.mix * 100)} %</b></label>
            <input type="range" min={0} max={1} step={0.05} value={P.mix} onChange={e => set('pec', 'mix', +e.target.value)} style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.mute }}><span>0 % uniform clearing</span><span>100 % edges at 50 %</span></div>
            <Num label="Tolerance" value={P.tol} step={0.001} onChange={v => set('pec', 'tol', v)} hint="Max relative energy error at control points" />
            <Num label="Max iterations" value={P.maxIter} onChange={v => set('pec', 'maxIter', v)} />
          </Sec>
          <Sec title="Dose classes">
            <Sel label="Mode" value={P.classMode} onChange={v => set('pec', 'classMode', v)} options={[['accuracy', 'Accuracy (geometric steps)'], ['fixed', 'Fixed number (linear)'], ['fixedlog', 'Fixed number (log)']]} />
            {P.classMode === 'accuracy' ? <><Num label="Step" value={P.acc} step={0.005} onChange={v => set('pec', 'acc', v)} hint="0.01 = classes 1 % apart" /><Num label="Max classes" value={P.maxClasses} onChange={v => set('pec', 'maxClasses', v)} /></> : <Num label="Classes" value={P.nClasses} onChange={v => set('pec', 'nClasses', v)} />}
          </Sec>
        </>}
        <Sec title="PEC fracturing">
          <Chk label="Automatic from PSF" checked={P.fragAuto} onChange={v => set('pec', 'fragAuto', v)} />
          {P.fragAuto ? <><KV k="Edge strip" v={fmtLen(frag.edgeW)} /><KV k="Interior pieces ≤" v={fmtLen(frag.fragMax)} /><KV k="Keep shapes whole ≤" v={fmtLen(frag.smallSize)} /></> : <>
            <Num label="Edge strip" unit="nm" value={P.edgeW} onChange={v => set('pec', 'edgeW', v)} /><Num label="Interior pieces ≤" unit="nm" value={P.fragMax} onChange={v => set('pec', 'fragMax', v)} /><Num label="Keep shapes whole ≤" unit="nm" value={P.smallSize} onChange={v => set('pec', 'smallSize', v)} /></>}
        </Sec>
        {pecR && <Sec title="Result">
          <KV k="Figures / dose groups" v={`${fmtN(pecR.nFrags)} / ${fmtN(pecR.nGroups)}`} />
          {pecR.corrected && <><KV k="Iterations" v={pecR.iters} /><KV k="Max energy error" v={pct(pecR.maxErr)} tone={pecR.maxErr > P.tol ? C.warn : C.ok} /><KV k="…after dose classes" v={`${pct(pecR.qMaxErr)} max · ${pct(pecR.qRmsErr)} rms`} /><KV k="η used for targets" v={pecR.eta != null ? pecR.eta.toFixed(3) : '–'} /></>}
          <KV k="Dose classes" v={`${pecR.nClasses}${pecR.accuracy ? ` (${(pecR.accuracy * 100).toFixed(1)} % steps)` : ''}`} />
          <KV k="Dose range" v={`×${pecR.classDose[1].toFixed(3)} … ×${pecR.classDose[pecR.nClasses].toFixed(3)}`} />
          <DoseHist classDose={pecR.classDose} areas={pecR.areas} lo={pecR.classDose[1]} hi={pecR.classDose[pecR.nClasses]} />
          {pecR.history && pecR.history.length > 1 && <div style={{ marginTop: 6 }}><LinePlot ys={pecR.history} label="max energy error per iteration" logY /></div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}><Chk label="figure outlines" checked={overlays.outlines} onChange={v => setOverlays(o => ({ ...o, outlines: v }))} /><Chk label="control points" checked={overlays.ctrl} onChange={v => setOverlays(o => ({ ...o, ctrl: v }))} /></div>
        </Sec>}
      </>;
      case 'fields': return <>
        <Chk label="Split into write fields" checked={P.fieldsOn} onChange={v => set('fields', 'fieldsOn', v)} />
        {P.fieldsOn && <><Num label="Field size" unit="µm" value={P.fieldUm} onChange={v => set('fields', 'fieldUm', v)} />
          <Sel label="Placement" value={P.origin} onChange={v => set('fields', 'origin', v)} options={[['bbox', 'Start at pattern corner'], ['center', 'Centred on pattern'], ['origin', 'Grid through (0,0)']]} />
          <Chk label="show writing order" checked={overlays.order} onChange={v => setOverlays(o => ({ ...o, order: v }))} />
          {res.fields && <><KV k="Fields" v={`${res.fields.NX} × ${res.fields.NY} (${new Set(res.fields.fragField).size} used)`} /><KV k="Figures after splitting" v={fmtN(res.fields.n)} /></>}</>}
        <Note>PEC runs on the whole pattern before field splitting, so backscatter from neighbouring fields is included.</Note>
      </>;
      case 'sim': return <>
        <Num label="Pixel" unit="nm" value={P.simPitch} onChange={v => up('simPitch', v)} hint="0 = automatic (α/2, capped by window size)" />
        <Num label="Threshold" value={P.simThr} step={0.05} onChange={v => up('simThr', v)} hint="0.5 = edge of a large pad at base dose" />
        <Chk label="Also show uniform dose (no PEC)" checked={P.simCompare} onChange={v => up('simCompare', v)} />
        <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}><Btn primary onClick={runSim} disabled={!!running}>▶ Simulate {simBox ? 'box' : 'view'}</Btn>{simBox && <Btn onClick={() => setSimBox(null)}>Clear box</Btn>}</div>
        <Note>Zoom the viewer to the area of interest (or shift-drag a box) and run. The green line is where the resist develops with the PEC doses; the red dashed line is the same pattern written at uniform dose.</Note>
      </>;
      case 'export': return <>
        <Sel label="Format" value={P.expMode} onChange={v => up('expMode', v)} options={[['datatype', 'GDSII · datatype = dose class'], ['layer', 'GDSII · one layer per class'], ['raith', 'GDSII · Raith (DT = 1000 × dose)']]} w={200} />
        {P.expMode === 'layer' ? <Num label="First class layer" value={P.layerBase} onChange={v => up('layerBase', v)} /> : <><Chk label="Keep source layer numbers" checked={P.layerKeep} onChange={v => up('layerKeep', v)} />{!P.layerKeep && <Num label="Output layer" value={P.layerOut} onChange={v => up('layerOut', v)} />}</>}
        {P.fieldsOn && <Chk label="One cell per write field" checked={P.cellPerField} onChange={v => up('cellPerField', v)} />}
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, margin: '5px 0' }}><span style={{ color: C.mute }}>File name</span><input value={P.fileName} onChange={e => up('fileName', e.target.value.replace(/[^\w.-]/g, '_'))} style={{ ...inp, width: 150 }} /></label>
        <Sec title="Dose & write time">
          <Num label="Base dose" unit="µC/cm²" value={P.baseDose} onChange={v => up('baseDose', v)} hint="Dose for factor 1.0 (≈ 2 × dose-to-clear with edge equalization)" />
          <Num label="Beam current" unit="nA" value={P.current} onChange={v => up('current', v)} />
          <Num label="Beam step size" unit="nm" value={P.bss} onChange={v => up('bss', v)} />
          <Num label="Min. dwell" unit="ns" value={P.minDwell} onChange={v => up('minDwell', v)} hint="1/max clock: 20 ns = 50 MHz" />
          {writeEst ? <><KV k="Exposed area" v={`${(writeEst.A * 1e8).toFixed(1)} µm²`} /><KV k="Dwell per step" v={`${writeEst.tmin.toFixed(1)} – ${writeEst.tmax.toFixed(1)} ns`} tone={writeEst.tmin < P.minDwell ? C.bad : C.ok} />
            <KV k="Beam-on time" v={fmtTime(writeEst.t)} />{writeEst.tmin < P.minDwell && <Note tone={C.bad}>Shortest dwell is below the machine limit: lower the current or enlarge the step (minimum step ≈ {Math.sqrt(P.current / (pecR.classDose[1] * P.baseDose * 0.01) * P.minDwell).toFixed(1)} nm).</Note>}</> : <Note>Run PEC to see dwell times.</Note>}
        </Sec>
        <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}><Btn primary onClick={doExport} disabled={!meta || !!running}>⬇ Export GDS + dose table</Btn></div>
        <Note>Dose classes go in the GDS datatype (or layer). Import the GDS in your tool and map datatype → dose with the table. The Raith option writes datatype = round(1000 × dose factor), the convention of the open-source Raith_GDSII toolbox; check it against your tool once with a dose test.</Note>
      </>;
      default: return null;
    }
  };

  useEffect(() => { // fall back to the newest stage that still has data
    const has = { layout: !!res.import, fractured: !!res.fracture, dose: !!res.pec, fields: !!res.fields, sim: !!res.sim };
    if (!has[view]) { const f = ['fields', 'dose', 'fractured', 'layout'].find(v => has[v]); if (f) setView(f); }
  }, [res, view]);
  const mod = MODULES.find(m => m.id === sel);
  const viewTabs = [['layout', 'Layout', !!res.import], ['fractured', 'Fractured', !!res.fracture], ['dose', 'Dose', !!res.pec], ['fields', 'Fields', !!res.fields], ['sim', 'Simulation', !!res.sim]];
  return <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: C.bg, color: C.ink, fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', fontSize: 12.5 }}>
    {/* top bar */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fff', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#1f3a8a,#c2410c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>⚡</div>
        <div><div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>Soft-EBeam</div><div style={{ fontSize: 10.5, color: C.mute }}>e-beam data prep · PEC</div></div>
      </div>
      {onBack && <Btn small onClick={onBack}>⬡ Layout Studio</Btn>}
      <Btn small onClick={() => fileRef.current.click()} disabled={!!running}>📂 Open</Btn>
      <Btn small primary onClick={runAll} disabled={!meta || !!running}>▶ Run flow</Btn>
      <Btn small onClick={saveFlow}>💾 Save flow</Btn>
      <Btn small onClick={() => flowFileRef.current.click()}>Load flow</Btn>
      <div style={{ flex: 1 }} />
      {prog && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{prog.p != null && <div style={{ width: 120, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.round(prog.p * 100)}%`, height: '100%', background: C.beam }} /></div>}<span style={{ fontSize: 11, color: C.beam }}>{prog.label}</span></div>}
      <span style={{ fontSize: 11.5, color: status.startsWith('⚠') ? C.bad : C.mute, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={status}>{running && !prog ? '⟳ ' : ''}{status}</span>
      <input ref={fileRef} type="file" accept=".gds,.gds2,.gdsii,.oas,.oasis" style={{ display: 'none' }} onChange={e => { openFile(e.target.files[0]); e.target.value = ''; }} />
      <input ref={psfFileRef} type="file" style={{ display: 'none' }} onChange={e => { loadPsfFile(e.target.files[0]); e.target.value = ''; }} />
      <input ref={flowFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { e.target.files[0] && loadFlow(e.target.files[0]); e.target.value = ''; }} />
    </div>
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* flow */}
      <div style={{ width: 236, background: '#fff', borderRight: `1px solid ${C.line}`, overflowY: 'auto', padding: '10px 10px 20px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: C.mute, textTransform: 'uppercase', margin: '0 0 6px 2px' }}>Flow</div>
        {MODULES.map((m, i) => { const st = cardStatus(m.id), [col, lab] = STATUS[st], selected = sel === m.id; return <div key={m.id}>
          {i > 0 && <div style={{ height: 10, marginLeft: m.side ? 30 : 18, borderLeft: `2px ${m.side ? 'dashed' : 'solid'} #cbd2dc` }} />}
          <div onClick={() => setSel(m.id)} style={{ marginLeft: m.side ? 12 : 0, border: `1px solid ${selected ? C.accent : C.line}`, boxShadow: selected ? '0 0 0 2px rgba(31,58,138,.12)' : 'none', borderRadius: 7, padding: '7px 8px', cursor: 'pointer', background: selected ? '#f5f7ff' : '#fff', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <div style={{ width: 22, textAlign: 'center', fontSize: 14 }}>{m.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><b style={{ fontSize: 12.5 }}>{m.name}</b><span title={lab} style={{ width: 8, height: 8, borderRadius: 4, background: col, display: 'inline-block', animation: st === 'running' ? 'sebpulse 1s infinite' : 'none' }} /></div>
              <div style={{ fontSize: 10.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary(m.id)}</div>
            </div>
            {['import', 'extract', 'bias', 'fracture', 'pec', 'fields'].includes(m.id) && <button title="Run to here" disabled={!meta || !!running} onClick={e => { e.stopPropagation(); runTo(m.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.accent, fontSize: 12, padding: 0 }}>▶</button>}
          </div></div>; })}
        <div style={{ marginTop: 14, fontSize: 10.5, color: C.mute, lineHeight: 1.5 }}>{Object.entries(STATUS).filter(([k]) => k !== 'error').map(([k, [c, l]]) => <span key={k} style={{ marginRight: 8, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: c, marginRight: 3 }} />{l}</span>)}</div>
      </div>
      {/* viewer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: '#fff', borderBottom: `1px solid ${C.line}`, alignItems: 'center' }}>
          {viewTabs.map(([id, l, ok]) => <button key={id} disabled={!ok} onClick={() => setView(id)} style={{ ...inp, cursor: ok ? 'pointer' : 'default', background: view === id ? C.accent : '#fff', color: view === id ? '#fff' : ok ? C.ink : '#b8bec8', borderColor: view === id ? C.accent : C.line }}>{l}</button>)}
          <div style={{ flex: 1 }} />
          <Btn small onClick={() => setFitKey(k => k + 1)}>⌖ Fit</Btn>
        </div>
        {meta ? <Viewer layers={{ rings: res.import, traps: res.fracture && res.fracture.traps, pec: res.pec, fields: res.fields, sim: res.sim }} view={view} overlays={overlays} bbox={res.import && res.import.bbox} fitKey={fitKey} simBox={simBox} setSimBox={setSimBox} onView={setViewWin} />
          : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: C.mute }}>
            <div style={{ fontSize: 40 }}>⚡</div><div style={{ fontSize: 15, color: C.ink, fontWeight: 600 }}>Soft-EBeam</div>
            <div style={{ maxWidth: 440, textAlign: 'center', lineHeight: 1.5 }}>Proximity effect correction, fracturing and write-field preparation for electron-beam lithography — running entirely in your browser. Nothing is uploaded.</div>
            <div style={{ display: 'flex', gap: 8 }}><Btn primary onClick={() => fileRef.current.click()}>📂 Open GDS / OASIS</Btn>{onBack && <Btn onClick={onBack}>⬡ Send from the editor</Btn>}</div>
          </div>}
      </div>
      {/* inspector */}
      <div style={{ width: 340, background: '#fff', borderLeft: `1px solid ${C.line}`, overflowY: 'auto', padding: '12px 14px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{mod.icon}</span><b style={{ fontSize: 15 }}>{mod.name}</b></div>
        <div style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, margin: '4px 0 8px' }}>{mod.what}</div>
        {err[stageOf(sel)] && <Note tone={C.bad}>{err[stageOf(sel)]}</Note>}
        {panel()}
        {['import', 'extract', 'bias', 'fracture', 'pec', 'fields'].includes(sel) && <div style={{ marginTop: 10 }}><Btn primary onClick={() => runTo(sel)} disabled={!meta || !!running}>▶ Run to {mod.name}</Btn></div>}
      </div>
    </div>
    <style>{'@keyframes sebpulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
  </div>;
}
