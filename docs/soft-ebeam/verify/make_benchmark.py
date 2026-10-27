"""Standard PEC benchmark layout (layer 1, 1 nm dbu). Writes pecbench.gds + pecbench_sites.json (where to measure)."""
import struct, math, json, os, sys
OUT = os.path.dirname(os.path.abspath(__file__))
def rec(t, dt, data=b''): return struct.pack('>HBB', 4 + len(data), t, dt) + data
def i16(t, *v): return rec(t, 2, struct.pack('>' + 'h' * len(v), *v))
def s(t, x):
    b = x.encode()
    if len(b) % 2: b += b'\0'
    return rec(t, 6, b)
def real8(v):
    if v == 0: return b'\0' * 8
    e = 64; m = abs(v)
    while m >= 1: m /= 16; e += 1
    while m < 1 / 16: m *= 16; e -= 1
    out = bytes([(0x80 if v < 0 else 0) | e])
    for _ in range(7): m *= 256; d = int(m); out += bytes([d]); m -= d
    return out
def xy(pts): return rec(0x10, 3, b''.join(struct.pack('>ii', int(round(x)), int(round(y))) for x, y in pts))
def poly(pts): return rec(0x08, 0) + i16(0x0D, 1) + i16(0x0E, 0) + xy(pts + [pts[0]]) + rec(0x11, 0)
def box(x0, y0, x1, y1): return poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

els, sites = [], []
def site(name, x0, y0, x1, y1, kind): sites.append(dict(name=name, win=[x0, y0, x1, y1], kind=kind))
um = 1000
# A. isolated lines 50/100/200/500 nm, 20 µm long, 25 µm apart (well beyond 3β at 50 kV? no: β≈9.5 µm, so they see a little of each other)
for k, w in enumerate([50, 100, 200, 500]):
    x = k * 25 * um; els.append(box(x, 0, x + w, 20 * um))
    site(f'iso line {w} nm (middle)', x - 300, 9 * um, x + w + 300, 11 * um, 'line')
    site(f'iso line {w} nm (end)', x - 300, 20 * um - 600, x + w + 300, 20 * um + 300, 'end')
# B. 1:1 gratings 100 nm and 200 nm L/S, 20×20 µm
for k, (w, p) in enumerate([(100, 200), (200, 400)]):
    X = 120 * um + k * 40 * um
    for i in range(int(20 * um / p)): els.append(box(X + i * p, 0, X + i * p + w, 20 * um))
    site(f'grating {w}/{p} centre', X + 10 * um - 500, 9500, X + 10 * um + 500, 10500, 'dense')
    site(f'grating {w}/{p} edge line', X - 300, 9500, X + 700, 10500, 'dense')
    site(f'grating {w}/{p} corner', X - 300, 20 * um - 700, X + 700, 20 * um + 300, 'end')
# C. density towers: 100 nm lines at 25 % and 75 % density
for k, (w, p) in enumerate([(100, 400), (300, 400)]):
    X = 200 * um + k * 40 * um
    for i in range(int(20 * um / p)): els.append(box(X + i * p, 0, X + i * p + w, 20 * um))
    site(f'tower {int(100 * w / p)} % centre', X + 10 * um - 500, 9500, X + 10 * um + 500, 10500, 'dense')
# D. 100 nm line 200 nm away from a 30×30 µm pad  (the classic hard case)
Y = 40 * um
els.append(box(0, Y, 30 * um, Y + 30 * um)); els.append(box(30 * um + 200, Y, 30 * um + 300, Y + 30 * um))
site('line 200 nm from big pad', 30 * um - 400, Y + 14 * um, 30 * um + 700, Y + 16 * um, 'line')
site('big pad interior', 14 * um, Y + 14 * um, 16 * um, Y + 16 * um, 'interior')
site('big pad corner', -300, Y - 300, 700, Y + 700, 'corner')
# E. 100 nm gap between two 20×20 µm pads (gap must stay open)
X = 60 * um
els.append(box(X, Y, X + 20 * um, Y + 20 * um)); els.append(box(X + 20 * um + 100, Y, X + 40 * um + 100, Y + 20 * um))
site('100 nm gap between pads', X + 20 * um - 400, Y + 9 * um, X + 20 * um + 500, Y + 11 * um, 'gap')
# F. dot array: 100 nm squares on 300 nm pitch, 10×10 µm
X = 120 * um
for i in range(33):
    for j in range(33): els.append(box(X + i * 300, Y + j * 300, X + i * 300 + 100, Y + j * 300 + 100))
site('dot array centre', X + 4800 - 200, Y + 4800 - 200, X + 4800 + 400, Y + 4800 + 400, 'dots')
site('dot array corner', X - 300, Y - 300, X + 700, Y + 700, 'dots')
# G. ring (curved waveguide-like): outer R 10 µm, width 500 nm, 720-gon, one polygon with a hole via a cut line
X, Yc, R0, R1, N = 160 * um, Y + 15 * um, 10 * um, 10 * um - 500, 720
outer = [(X + R0 * math.cos(2 * math.pi * k / N), Yc + R0 * math.sin(2 * math.pi * k / N)) for k in range(N)]
inner = [(X + R1 * math.cos(2 * math.pi * k / N), Yc + R1 * math.sin(2 * math.pi * k / N)) for k in range(N)][::-1]
els.append(poly(outer + [outer[0]] + [inner[-1]] + inner))  # keyhole polygon
a = math.radians(37); cx, cy = X + (R0 - 250) * math.cos(a), Yc + (R0 - 250) * math.sin(a)
site('ring 500 nm (curved)', cx - 600, cy - 600, cx + 600, cy + 600, 'curve')
# H. 45° line, 100 nm wide (slanted edges)
X = 200 * um
d = 100 / math.sqrt(2)
els.append(poly([(X, Y), (X + d, Y - d), (X + 15 * um + d, Y + 15 * um - d), (X + 15 * um, Y + 15 * um)]))
site('45° line 100 nm', X + 7500 - 400, Y + 7500 - 400, X + 7500 + 400, Y + 7500 + 400, 'line')

ts = struct.pack('>12h', 2026, 10, 26, 0, 0, 0, 2026, 10, 26, 0, 0, 0)
out = i16(0x00, 600) + rec(0x01, 2, ts) + s(0x02, 'PECBENCH') + rec(0x03, 5, real8(1e-3) + real8(1e-9))
out += rec(0x05, 2, ts) + s(0x06, 'TOP') + b''.join(els) + rec(0x07, 0) + rec(0x04, 0)
open(os.path.join(OUT, 'pecbench.gds'), 'wb').write(out)
json.dump(sites, open(os.path.join(OUT, 'pecbench_sites.json'), 'w'), indent=1)
print(len(els), 'shapes,', len(sites), 'sites')
