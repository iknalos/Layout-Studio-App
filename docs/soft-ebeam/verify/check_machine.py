"""Machine model: what a beam-step tool writes from a list of figures, and the developed Bragg corrugation.

python -I check_machine.py figs.json sites.json mode B [thr=0.5] [alpha,beta,eta,blurFWHM (nm; default Si 100 kV HSQ + 15 nm beam)]
  sites.json: gratings [{layer, x, y0, rows}] (bragg_sites.json: the UW Bragg test file, rows 162 nm)
  figs.json : {"classDose": [...], "figs": [[y0,y1,xl0,xr0,xl1,xr1,cls,field,pass], ...]}  (trapezoids, nm)
  mode      : ideal  - exact area coverage (no beam step)
              snap   - shots at the centres of a global B x B grid that fall inside the figure (edges snap to the grid)
              round  - each figure on its own grid from its lower-left corner, round(size / B) rows and shots per row
              floor  - same, floor(size / B) (a tool that never writes outside the figure)
              fit    - round(size / B) rows/shots, step stretched to fit the figure exactly
Forward part of the PSF (core, 1 nm grid) from the shots; backscatter (mid 10 nm, long 200 nm) from figure areas.
Sites: the 26 Bragg gratings (vertical, 162 nm rows): per grating, mean developed half-width of wide and narrow rows.
"""
import sys, json, math, time
import numpy as np
from scipy.signal import fftconvolve

sys.stdout.reconfigure(encoding='utf-8')
figp, sitep, mode, B = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]); thr = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
pa, pb, pe, pblur = [float(v) for v in (sys.argv[6] if len(sys.argv) > 6 else '2.4,27870,0.718,15').split(',')]
J = json.load(open(figp)); cd = np.array(J['classDose']); F = np.array(J['figs'], dtype=np.float64)
y0, y1, xl0, xr0, xl1, xr1 = (F[:, k] for k in range(6)); D = cd[F[:, 6].astype(int)]
alpha = math.hypot(pa, pblur / (2 * math.sqrt(math.log(2)))); beta, eta = pb, pe  # forward α with the beam blur added in quadrature
f = lambda r: (np.exp(-(r / alpha) ** 2) / alpha ** 2 + eta * np.exp(-(r / beta) ** 2) / beta ** 2) / (math.pi * (1 + eta))
def taper(r, a, b): return np.where(r <= a, 1.0, np.where(r >= b, 0.0, 0.5 * (1 + np.cos(np.pi * (r - a) / (b - a)))))
SC = [(1.0, 200.0, (100.0, 200.0)), (10.0, 3000.0, (1500.0, 3000.0)), (200.0, 3.2 * beta, None)]
def kern(k):
    p, R, tp = SC[k]; n = int(math.ceil(R / p)); ns = 8 if k == 0 else 4
    c = ((np.arange(-n, n + 1)[:, None] * ns + (np.arange(ns) + 0.5)[None, :] - ns / 2) / ns * p).reshape(-1)
    X, Y = np.meshgrid(c, c); r = np.hypot(X, Y)
    w = (taper(r, *tp) if tp else 1.0) - (taper(r, *SC[k - 1][2]) if k else 0.0)
    return (f(r) * w).reshape(2 * n + 1, ns, 2 * n + 1, ns).mean(axis=(1, 3)) * p * p
K = [kern(k) for k in range(3)]; print(f'# kernel mass {sum(k.sum() for k in K):.4f}; {len(F)} figures; mode {mode}, B {B} nm', flush=True)

def splat(A, gx0, gy0, p, x, y, q):  # bilinear charge deposit at points (x, y), pixel centres at gx0 + (i + .5) p
    u = (x - gx0) / p - 0.5; v = (y - gy0) / p - 0.5; i = np.floor(u).astype(int); j = np.floor(v).astype(int); fu = u - i; fv = v - j
    for di, dj, w in ((0, 0, (1 - fu) * (1 - fv)), (1, 0, fu * (1 - fv)), (0, 1, (1 - fu) * fv), (1, 1, fu * fv)):
        ii, jj = i + di, j + dj; ok = (ii >= 0) & (ii < A.shape[1]) & (jj >= 0) & (jj < A.shape[0])
        np.add.at(A, (jj[ok], ii[ok]), (q * w)[ok])

def area_points(idx, step):  # figure areas as point charges on a sub-grid of `step`
    X, Y, Q = [], [], []
    for i in idx:
        h = y1[i] - y0[i]; ny = max(1, int(math.ceil(h / step))); ys = y0[i] + (np.arange(ny) + 0.5) * h / ny; t = (ys - y0[i]) / h if h > 0 else ys * 0
        xl = xl0[i] + (xl1[i] - xl0[i]) * t; xr = xr0[i] + (xr1[i] - xr0[i]) * t; w = xr - xl
        nx = max(1, int(math.ceil(w.max() / step)))
        s = (np.arange(nx) + 0.5) / nx; xx = xl[:, None] + w[:, None] * s[None, :]
        X.append(xx.ravel()); Y.append(np.repeat(ys, nx)); Q.append(np.repeat(D[i] * w * h / ny / nx, nx))
    return (np.concatenate(X), np.concatenate(Y), np.concatenate(Q)) if X else (np.zeros(0),) * 3

def shots(idx):  # the beam shots a tool places for these figures
    X, Y, Q = [], [], []
    for i in idx:
        h = y1[i] - y0[i]
        if mode == 'snap':
            j0 = math.ceil(y0[i] / B - 0.5); j1 = math.floor(y1[i] / B - 0.5)
            if j1 < j0: continue
            ys = (np.arange(j0, j1 + 1) + 0.5) * B; dy = np.full(len(ys), B)
        else:
            ny = int(round(h / B)) if mode in ('round', 'fit') else int(math.floor(h / B + 1e-9))
            if ny < 1: continue
            st = h / ny if mode == 'fit' else B; ys = y0[i] + (np.arange(ny) + 0.5) * st; dy = np.full(ny, st)
        t = np.clip((ys - y0[i]) / h, 0, 1) if h > 0 else ys * 0
        xl = xl0[i] + (xl1[i] - xl0[i]) * t; xr = xr0[i] + (xr1[i] - xr0[i]) * t
        for y, d, a, b in zip(ys, dy, xl, xr):
            if mode == 'snap':
                k0 = math.ceil(a / B - 0.5); k1 = math.floor(b / B - 0.5)
                if k1 < k0: continue
                xs = (np.arange(k0, k1 + 1) + 0.5) * B; dx = B
            else:
                nx = int(round((b - a) / B)) if mode in ('round', 'fit') else int(math.floor((b - a) / B + 1e-9))
                if nx < 1: continue
                dx = (b - a) / nx if mode == 'fit' else B; xs = a + (np.arange(nx) + 0.5) * dx
            X.append(xs); Y.append(np.full(len(xs), y)); Q.append(np.full(len(xs), D[i] * d * dx))
    return (np.concatenate(X), np.concatenate(Y), np.concatenate(Q)) if X else (np.zeros(0),) * 3

T0 = time.time()
bx0, by0, bx1, by1 = min(xl0.min(), xl1.min()), y0.min(), max(xr0.max(), xr1.max()), y1.max()
pL = SC[2][0]; nL = K[2].shape[0] // 2; mg = (nL + 2) * pL
gx0, gy0 = math.floor((bx0 - mg) / pL) * pL, math.floor((by0 - mg) / pL) * pL
NX, NY = int(math.ceil((bx1 + mg - gx0) / pL)), int(math.ceil((by1 + mg - gy0) / pL))
AL = np.zeros((NY, NX), dtype=np.float32); X, Y, Q = area_points(range(len(F)), 100.0); splat(AL, gx0, gy0, pL, X, Y, Q); del X, Y, Q
EL = fftconvolve(AL / np.float32(pL * pL), K[2].astype(np.float32), mode='same'); del AL
print(f'# long grid {NX}x{NY} ({time.time() - T0:.0f} s)', flush=True)
xc = 0.5 * (np.minimum(xl0, xl1) + np.maximum(xr0, xr1)); yc = 0.5 * (y0 + y1)

SITES = [g for g in json.load(open(sitep)) if g['rows'] == 569]  # the 13 ΔW 38..50 nm gratings (no sidewall shift), both layers
res = []
for G in SITES:
    gx = G['x']; ymid = G['y0'] + 162 * (G['rows'] // 2)
    wx0, wx1, wy0, wy1 = gx - 600, gx + 600, ymid - 1620, ymid + 1620  # 10 periods
    # mid grid (backscatter near part) from areas
    pM = SC[1][0]; nM = K[1].shape[0] // 2; m = (nM + 2) * pM
    mx0, my0 = math.floor((wx0 - m) / pM) * pM, math.floor((wy0 - m) / pM) * pM; mnx, mny = int(math.ceil((wx1 + m - mx0) / pM)), int(math.ceil((wy1 + m - my0) / pM))
    near = np.nonzero((xc > mx0 - 3000) & (xc < mx0 + mnx * pM + 3000) & (yc > my0 - 3000) & (yc < my0 + mny * pM + 3000))[0]
    AM = np.zeros((mny, mnx)); X, Y, Q = area_points(near, 5.0); splat(AM, mx0, my0, pM, X, Y, Q); EM = fftconvolve(AM / (pM * pM), K[1], mode='same')
    # core grid from the shots
    pC = 1.0; nC = K[0].shape[0] // 2; c = nC + 2
    cx0, cy0 = math.floor(wx0 - c), math.floor(wy0 - c); cnx, cny = int(math.ceil(wx1 + c - cx0)), int(math.ceil(wy1 + c - cy0))
    fx0, fx1 = np.minimum(xl0, xl1)[near], np.maximum(xr0, xr1)[near]
    close = near[(fx1 > cx0) & (fx0 < cx0 + cnx) & (y1[near] > cy0) & (y0[near] < cy0 + cny)]  # figures overlapping the core window
    AC = np.zeros((cny, cnx)); X, Y, Q = (area_points(close, 0.5) if mode == 'ideal' else shots(close)); splat(AC, cx0, cy0, pC, X, Y, Q)
    EC = fftconvolve(AC, K[0], mode='same')
    from scipy.ndimage import map_coordinates as mc
    # sample rows: every 162 nm row centre inside the window, find the left/right threshold crossings
    rows = G['y0'] + 81 + 162 * np.arange(G['rows'])
    hw = []
    ysamp = []
    for y in rows:
        if not (wy0 + 250 < y < wy1 - 250): continue
        xs = np.arange(gx - 450, gx + 450, 0.25); ysv = np.full_like(xs, y)
        E = (mc(EC, [ysv - cy0 - 0.5, xs - cx0 - 0.5], order=1) + mc(EM, [(ysv - my0) / pM - 0.5, (xs - mx0) / pM - 0.5], order=1)
             + mc(EL, [(ysv - gy0) / pL - 0.5, (xs - gx0) / pL - 0.5], order=1)) - thr
        s = np.signbit(E); k = np.nonzero(s[1:] != s[:-1])[0]
        if len(k) < 2: continue
        z = xs[k] + E[k] / (E[k] - E[k + 1]) * 0.25
        hw.append((z[0], z[-1])); ysamp.append(y)
    hw = np.array(hw)
    # design: the figures' own outer x-extent per row (left / right edge of the grating at that row)
    dl, dr = [], []
    for y in ysamp:
        r = close[(y0[close] < y) & (y1[close] > y) & (np.abs(xc[close] - gx) < 600)]
        dl.append(min(min(xl0[i], xl1[i]) for i in r)); dr.append(max(max(xr0[i], xr1[i]) for i in r))
    dl, dr = np.array(dl), np.array(dr)
    wide = (dr - dl) > np.median(dr - dl)
    def dw(e): return float(e[wide].mean() - e[~wide].mean())
    L_w, R_w = -hw[:, 0], hw[:, 1]; Ld, Rd = -dl, dr
    r = dict(layer=G['layer'], x=gx, y=round(ymid), n=len(ysamp), dW_left=dw(L_w), dW_right=dw(R_w), dW_left_design=dw(Ld), dW_right_design=dw(Rd),
             epe_wide=float(np.mean(np.r_[(L_w - Ld)[wide], (R_w - Rd)[wide]])), epe_narrow=float(np.mean(np.r_[(L_w - Ld)[~wide], (R_w - Rd)[~wide]])),
             sd=float(np.std(np.r_[L_w - Ld, R_w - Rd])))
    res.append(r)
    print(f"L{G['layer']:<2} x {gx:>9}: corrugation left {r['dW_left']:6.2f} (design {r['dW_left_design']:5.1f})  right {r['dW_right']:6.2f} (design {r['dW_right_design']:5.1f})  "
          f"EPE wide {r['epe_wide']:+5.2f} narrow {r['epe_narrow']:+5.2f}  sd {r['sd']:.2f} nm  (n={r['n']})", flush=True)
json.dump(res, open(figp.replace('.json', f'_{mode}{int(B)}.json'), 'w'), indent=1)
print(f'# {time.time() - T0:.0f} s')
