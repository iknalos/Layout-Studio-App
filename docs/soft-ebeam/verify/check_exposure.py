"""Independent exposure check of an exported Soft-EBeam GDS (Raith datatype = 1000 x dose factor).

Shares no code with Soft-EBeam: own GDS reader, own rasteriser (supersampled point coverage), FFT convolution
on three grids (core 1 nm / mid 10 nm / long 100 nm, the PSF split by smooth radial tapers so the parts sum
exactly to the PSF), true PSF (analytic double Gaussian, or the raw radial table of a .lpsf file).
Measures edge placement error (EPE) along every design edge inside each site window.

python -I check.py design.gds exported.gds sites.json psf_spec [thr=0.5] [label]
psf_spec: 'gauss:alpha,beta,eta,blurFWHM'  or  path/to/file.lpsf
"""
import sys, json, struct, math, zlib, re, time
import numpy as np
from scipy import fft as sfft
from scipy.signal import fftconvolve
from scipy.ndimage import map_coordinates

def pip(pts, X, Y):  # even-odd crossing number, vectorised over the sample points
    inside = np.zeros(X.shape, bool); n = len(pts)
    for k in range(n):
        x1, y1 = pts[k]; x2, y2 = pts[(k + 1) % n]
        if y1 == y2: continue
        c = (y1 > Y) != (y2 > Y)
        inside ^= c & (X < x1 + (Y - y1) * (x2 - x1) / (y2 - y1))
    return inside
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely.geometry.polygon import orient

# ── GDS (boundaries only, flat + one level of SREF at 0,0) ──
def read_gds(path):
    b = open(path, 'rb').read(); o = 0; cells = {}; cur = None; el = None; dbu = 1e-9
    def real8(x):
        sg = -1 if x[0] & 0x80 else 1; e = (x[0] & 0x7f) - 64; m = int.from_bytes(x[1:8], 'big') / 2 ** 56
        return sg * m * 16 ** e
    while o + 4 <= len(b):
        L, t = struct.unpack('>HB', b[o:o + 3]); d = b[o + 4:o + L]; o += L
        if L < 4: break
        if t == 0x03: dbu = real8(d[8:16])
        elif t == 0x06: cur = d.rstrip(b'\0').decode(); cells[cur] = {'b': [], 's': []}
        elif t == 0x08: el = {'k': 'b', 'L': 0, 'D': 0}
        elif t == 0x0A: el = {'k': 's'}
        elif t == 0x0D and el is not None: el['L'] = struct.unpack('>h', d[:2])[0]
        elif t == 0x0E and el is not None: el['D'] = struct.unpack('>h', d[:2])[0]
        elif t == 0x12 and el is not None: el['n'] = d.rstrip(b'\0').decode()
        elif t == 0x10 and el is not None: el['xy'] = np.frombuffer(d, '>i4').astype(np.float64).reshape(-1, 2)
        elif t == 0x11 and el is not None:
            if el['k'] == 'b': cells[cur]['b'].append((el['xy'][:-1] * dbu * 1e9, el['L'], el['D']))
            else: cells[cur]['s'].append(el['n'])
            el = None
    refd = {n for c in cells.values() for n in c['s']}; tops = [n for n in cells if n not in refd]
    out = []
    for tname in tops:
        out += cells[tname]['b']
        for n in cells[tname]['s']: out += cells[n]['b']
    return out

# ── PSF as a radial function f(r), ∫ f 2πr dr = 1 ──
def make_psf(spec):
    if spec.startswith('gauss:'):
        a, b, eta, fw = map(float, spec[6:].split(','))
        bl = fw / (2 * math.sqrt(math.log(2))); sa, sb = math.hypot(a, bl), math.hypot(b, bl)
        def f(r): return (np.exp(-(r / sa) ** 2) / (math.pi * sa * sa) + eta * np.exp(-(r / sb) ** 2) / (math.pi * sb * sb)) / (1 + eta)
        return f, 5 * sb, f'double Gaussian α={a} β={b} η={eta} blur={fw}'
    x = zlib.decompress(open(spec, 'rb').read()).decode('utf8', 'replace')
    sec = re.search(r'<m_PSFDataOriginal[\s\S]*?</m_PSFDataOriginal>', x).group(0)
    pts = [(float(p), float(q)) for p, q in re.findall(r'<m_x>([^<]+)</m_x>\s*<m_y>([^<]+)</m_y>', sec)]
    r = np.array([p for p, q in pts if p > 0 and q > 0]); fv = np.array([q for p, q in pts if p > 0 and q > 0])
    f0 = next((q for p, q in pts if p == 0 and q > 0), None); r0 = r[0]
    I = (f0 or 0) * math.pi * r0 * r0 + np.sum(0.5 * (fv[1:] * r[1:] + fv[:-1] * r[:-1]) * 2 * math.pi * np.diff(r))
    lr, lf = np.log(r), np.log(fv / I)
    def f(q):
        q = np.asarray(q, float); out = np.exp(np.interp(np.log(np.maximum(q, 1e-9)), lr, lf, right=-np.inf))
        if f0: out = np.where(q < r0, f0 / I, out)
        return out
    return f, r[-1], f'table {spec.split(chr(92))[-1]} ({len(r)} pts, r ≤ {r[-1]:.0f} nm)'

def taper(r, a, b):  # 1 below a, 0 above b, raised cosine between
    return np.where(r <= a, 1.0, np.where(r >= b, 0.0, 0.5 * (1 + np.cos(np.pi * (r - a) / (b - a)))))

SC = [  # (name, pitch nm, kernel radius nm, taper lo..hi of the part handed to the next scale, raster supersampling)
    ('core', 1.0, 200.0, (100.0, 200.0), 4),
    ('mid', 10.0, 3000.0, (1500.0, 3000.0), 10),
    ('long', 100.0, None, None, 20),
]
def kernels(f, rmax):
    K = []; prev = None
    for k, (name, p, R, tp, ss) in enumerate(SC):
        R = R or rmax * 1.02; n = int(math.ceil(R / p)); ns = 6 if p > 1 else 4
        c = (np.arange(-n, n + 1)[:, None] * ns + (np.arange(ns) + 0.5)[None, :] - ns / 2) / ns * p  # subsample coords
        cx = c.reshape(-1); X, Y = np.meshgrid(cx, cx, indexing='xy'); r = np.hypot(X, Y)
        w_here = taper(r, *tp) if tp else np.ones_like(r)
        w_prev = taper(r, *SC[k - 1][3]) if k else np.zeros_like(r)
        val = f(r) * (w_here - w_prev)                      # this scale's share
        val = val.reshape(2 * n + 1, ns, 2 * n + 1, ns).mean(axis=(1, 3)) * p * p  # pixel-integrated mass
        if k == 0:  # refine the very core (sharp MC cores live inside a few nm)
            m = 6; cc = (np.arange(-m, m + 1)[:, None] * 64 + (np.arange(64) + 0.5)[None, :] - 32) / 64 * p
            cx2 = cc.reshape(-1); X2, Y2 = np.meshgrid(cx2, cx2); r2 = np.hypot(X2, Y2)
            v2 = (f(r2) * taper(r2, *tp)).reshape(2 * m + 1, 64, 2 * m + 1, 64).mean(axis=(1, 3)) * p * p
            val[n - m:n + m + 1, n - m:n + m + 1] = v2
        K.append(val)
    tot = sum(k.sum() for k in K)
    return K, tot

def raster(figs, x0, y0, nx, ny, p, ss):
    A = np.zeros((ny, nx)); q = p / ss
    for pts, d, bb in figs:
        if bb[2] < x0 or bb[0] > x0 + nx * p or bb[3] < y0 or bb[1] > y0 + ny * p: continue
        i0 = max(0, int(math.floor((bb[0] - x0) / p))); i1 = min(nx, int(math.ceil((bb[2] - x0) / p)))
        j0 = max(0, int(math.floor((bb[1] - y0) / p))); j1 = min(ny, int(math.ceil((bb[3] - y0) / p)))
        if i1 <= i0 or j1 <= j0: continue
        sx = x0 + i0 * p + (np.arange((i1 - i0) * ss) + 0.5) * q
        for js in range(j0, j1, 64):  # strips of 64 pixel rows keep memory small for big figures
            je = min(j1, js + 64); sy = y0 + js * p + (np.arange((je - js) * ss) + 0.5) * q
            SX, SY = np.meshgrid(sx, sy); M = pip(pts, SX, SY)
            if M.any(): A[js:je, i0:i1] += d * M.reshape(je - js, ss, i1 - i0, ss).mean(axis=(1, 3))
    return A

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    design_p, exp_p, sites_p, psf_spec = sys.argv[1:5]; thr = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
    label = sys.argv[6] if len(sys.argv) > 6 else exp_p
    shift = [float(v) for v in sys.argv[7].split(',')] if len(sys.argv) > 7 else None  # 'layer,dx,dy': misplace one pass
    sites = json.load(open(sites_p)); T0 = time.time()
    f, rmax, psf_desc = make_psf(psf_spec); K, ktot = kernels(f, rmax)
    figs = []
    nshift = 0
    for xy, L, D in read_gds(exp_p):
        if shift and L == int(shift[0]): xy = xy + np.array([shift[1], shift[2]]); nshift += 1
        figs.append((xy, D / 1000.0, (xy[:, 0].min(), xy[:, 1].min(), xy[:, 0].max(), xy[:, 1].max())))
    if shift: print(f'# layer {int(shift[0])} ({nshift} figures) shifted by ({shift[1]}, {shift[2]}) nm')
    des = unary_union([Polygon(xy).buffer(0) for xy, L, D in read_gds(design_p)])
    polys = [orient(g, 1) for g in (des.geoms if hasattr(des, 'geoms') else [des])]
    X0 = min(b[0] for _, _, b in figs); Y0 = min(b[1] for _, _, b in figs); X1 = max(b[2] for _, _, b in figs); Y1 = max(b[3] for _, _, b in figs)
    # long grid over everything + margin
    pL = SC[2][1]; nL = K[2].shape[0] // 2; mg = (nL + 2) * pL
    gx0, gy0 = math.floor((X0 - mg) / pL) * pL, math.floor((Y0 - mg) / pL) * pL
    NX, NY = int(math.ceil((X1 + mg - gx0) / pL)), int(math.ceil((Y1 + mg - gy0) / pL))
    with sfft.set_workers(-1):
        AL = raster(figs, gx0, gy0, NX, NY, pL, SC[2][4]); EL = fftconvolve(AL, K[2], mode='same')
    print(f'# {label}\n# PSF: {psf_desc}; kernel mass {ktot:.5f}; {len(figs)} figures; long grid {NX}x{NY} ({time.time() - T0:.0f} s)')
    res = []
    for s in sites:
        wx0, wy0, wx1, wy1 = s['win']
        # mid grid
        pM = SC[1][1]; nM = K[1].shape[0] // 2; mx0 = math.floor((wx0 - (nM + 2) * pM) / pM) * pM; my0 = math.floor((wy0 - (nM + 2) * pM) / pM) * pM
        mnx = int(math.ceil((wx1 + (nM + 2) * pM - mx0) / pM)); mny = int(math.ceil((wy1 + (nM + 2) * pM - my0) / pM))
        pC = SC[0][1]; nC = K[0].shape[0] // 2; cx0 = math.floor(wx0 - (nC + 2) * pC); cy0 = math.floor(wy0 - (nC + 2) * pC)
        cnx = int(math.ceil(wx1 + (nC + 2) * pC - cx0)); cny = int(math.ceil(wy1 + (nC + 2) * pC - cy0))
        with sfft.set_workers(-1):
            EM = fftconvolve(raster(figs, mx0, my0, mnx, mny, pM, SC[1][4]), K[1], mode='same')
            EC = fftconvolve(raster(figs, cx0, cy0, cnx, cny, pC, SC[0][4]), K[0], mode='same')
        # sample everything on the core grid (pixel centres)
        gxs = cx0 + (np.arange(cnx) + 0.5) * pC; gys = cy0 + (np.arange(cny) + 0.5) * pC
        GX, GY = np.meshgrid(gxs, gys)
        E = EC + map_coordinates(EM, [(GY - my0) / pM - 0.5, (GX - mx0) / pM - 0.5], order=1) + map_coordinates(EL, [(GY - gy0) / pL - 0.5, (GX - gx0) / pL - 0.5], order=1)
        Ev = lambda x, y: map_coordinates(E, [(np.asarray(y) - cy0) / pC - 0.5, (np.asarray(x) - cx0) / pC - 0.5], order=1)
        # design edges inside the window, sampled every 2 nm, corners flagged
        epe, cor, miss, bridge = [], [], 0, 0
        box = Polygon([(wx0, wy0), (wx1, wy0), (wx1, wy1), (wx0, wy1)])
        for P in polys:
            if not P.intersects(box): continue
            for ring in [P.exterior] + list(P.interiors):
                c = np.array(ring.coords); nv = len(c) - 1
                d_in = c[1:] - c[:-1]; ang = np.zeros(nv)
                for k in range(nv):
                    a1, a2 = d_in[k - 1], d_in[k]
                    ang[k] = abs(math.degrees(math.atan2(a1[0] * a2[1] - a1[1] * a2[0], a1 @ a2)))
                sharp = c[:-1][ang > 30]
                for k in range(nv):
                    p0, p1 = c[k], c[k + 1]; Ls = np.hypot(*(p1 - p0))
                    if Ls < 1e-9: continue
                    t = (p1 - p0) / Ls; nrm = np.array([t[1], -t[0]])  # outward for CCW exterior / CW holes
                    for u in np.arange(1.0, Ls, 2.0):
                        q = p0 + t * u
                        if not (wx0 + 60 <= q[0] <= wx1 - 60 and wy0 + 60 <= q[1] <= wy1 - 60): continue
                        sv = np.arange(-120, 120.01, 0.25); vals = Ev(q[0] + sv * nrm[0], q[1] + sv * nrm[1]) - thr
                        sgn = np.signbit(vals); idx = np.nonzero(sgn[1:] != sgn[:-1])[0]
                        corner = len(sharp) and np.min(np.hypot(*(sharp - q).T)) < 80
                        if not len(idx):
                            if vals[480] < 0: miss += 1
                            else: bridge += 1
                            continue
                        zs = sv[idx] + vals[idx] / (vals[idx] - vals[idx + 1]) * 0.25
                        z = zs[np.argmin(np.abs(zs))]
                        (cor if corner else epe).append(z)
        # area checks: interior must clear, gaps must stay open
        extra = ''
        if s['kind'] == 'interior': extra = f"interior E min {E[nC:-nC, nC:-nC].min():.3f} (needs ≥ {thr})"
        if s['kind'] == 'gap':
            gx = 0.5 * (wx0 + wx1) + 50 - 400 + 0; ys = np.linspace(wy0 + 100, wy1 - 100, 50)
            gc = Ev(np.full_like(ys, (wx0 + 400) + 50), ys); extra = f"gap-centre E max {gc.max():.3f} (must stay < {thr})"
        e = np.array(epe); c = np.array(cor)
        r = dict(site=s['name'], n=len(e), mean=float(e.mean()) if len(e) else None, sd=float(e.std()) if len(e) else None,
                 maxabs=float(np.abs(e).max()) if len(e) else None, corner_min=float(c.min()) if len(c) else None, miss=miss, bridge=bridge, extra=extra)
        res.append(r)
        fm = lambda v: '   -  ' if v is None else f'{v:+6.2f}'
        print(f"{s['name']:<28} EPE mean {fm(r['mean'])}  sd {('%5.2f' % r['sd']) if r['sd'] is not None else '  -  '}  max|.| {('%6.2f' % r['maxabs']) if r['maxabs'] is not None else '   -  '} nm"
              f"  (n={r['n']:4d})  corner worst {fm(r['corner_min'])}  missing {miss} bridged {bridge}  {extra}", flush=True)
    json.dump(res, open(exp_p.replace('.gds', '_check.json'), 'w'), indent=1)
    print(f'# {time.time() - T0:.0f} s')

main()
