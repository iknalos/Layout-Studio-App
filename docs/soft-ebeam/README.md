# Soft-EBeam

Electron-beam lithography data preparation inside Layout Studio: PSF, proximity effect correction (PEC),
fracturing, write fields, exposure simulation and dose-classed GDSII export. It runs entirely in the browser
(two Web Workers); nothing is uploaded and no server compute is needed.

Open it from the landing page (**⚡ Soft-EBeam**), from the editor toolbar (**⚡ E-Beam** sends the current
layout), or directly at `/?ebeam=1`.

## The flow

| Module | What it does |
|---|---|
| Import | Layout source (file or editor hand-off) and top cell. Runs automatically on load. |
| Extract | Layers to expose; optional region box. A shape limit (default 400 k) guards browser memory. |
| Bias | Optional mitred grow/shrink of every shape before healing. |
| Heal & Fracture | Union of overlapping shapes, cut into non-overlapping trapezoids (or staircase rectangles). |
| Analyze & plan | Reads the structure without any manual Extract/Map step: devices (shapes closer than 1 µm) and their **repeats** (solved once, reused), **critical spots** (features or gaps narrower than 150 nm, never cut by a field edge), and which parts need the **fine beam** (narrower than 3 µm, or within a 0.5 µm outline sleeve) and which can take a fast **bulk** pass. Then it scores every field size × placement × pass combination with one cost model and offers **three ways to write**, the first recommended, each with its reasons. |
| PSF | Literature preset, manual α/β/η(/γ/ν), an in-browser Monte Carlo run, or an imported `.lpsf`/text PSF. A beam + process blur (FWHM) is added in quadrature. |
| PEC | Fragments figures (edge strips + interior pieces, small shapes kept whole), solves doses, quantises to dose classes. |
| Fields & Order | By default the fields and passes come from the chosen write plan. Manual placements remain: **best of all at one field size** scores adaptive per device, fixed grid, fixed grid with optimised offset, follow geometry from one end and follow geometry centre first by critical spots cut, weighted stitches (places where a field edge cuts the pattern), stitched length, field count and stage travel, and keeps the best; stitches are straightened to one clean cut across the structure and marked in the viewer. Then splits figures at write-field boundaries and sets the writing order: start corner, field traversal (meander/raster rows or columns, spiral from the centre) and figure order inside a field (shape by shape, raster, meander, shortest path, centre-out, outside-in, by dose). Same-dose neighbours are merged back into whole trapezoids (PEC needs small pieces; the machine does not). Inside a shape, figures are written in bands of equal distance from its start, each band along its own axis, so pads become a serpentine and waveguides are written end to end. The **Write order** view colours figures first → last, draws figure-to-figure jumps and stage moves, shows the beam steps inside figures when zoomed in, and can play the exposure. With two passes the fine pass comes first. Export writes the GDS in this order. PEC is computed on the whole pattern first. |
| Simulate | Exposes the corrected pattern with the PSF and draws the developed edge (threshold model), optionally next to the uniform-dose result. A movable cross-section plots the energy profile and reports drawn vs developed widths with and without PEC. |
| Export | GDSII with the dose class in the datatype, one layer per class, or the Raith convention (datatype = round(1000 × dose factor)); a dose table; dwell and write-time estimates per pass. With two passes the bulk pass goes to layer + 100 (configurable) so the tool can give it its own current; the seam band between the passes is written in both at half dose (extra classes N+1…2N in the table). |

Card colours follow the usual flow convention: orange = needs input, red = not run, green = done, grey = off.
Changing a parameter invalidates that stage and everything downstream. Settings persist in the browser and can be
saved/loaded as a `.sebflow.json` file.

## How it works (short)

Full derivations and sources: [RESEARCH.md](RESEARCH.md).

- **PSF representation.** Every PSF is a sum of normalised Gaussians g_s(r) = e^{−r²/s²}/(πs²). Classic α/β/η is
  two terms; numerical PSFs (Monte Carlo or imported) are fitted with 30 log-spaced terms by non-negative least
  squares on density + enclosed energy (wide terms may be negative so the halo edge can be sharp).
- **PEC.** Each fragment (or each small shape) has one dose and one control point: the midpoint of its longest
  outline side, or its centroid if it is interior. Targets follow the edge-equalization / uniform-clearing mix
  m: edges (½ + ηP)/(1 + η(1+m)P), interiors (1 + ηP)/(1 + η(1+m)P), with P the backscatter-weighted density.
  Doses are iterated multiplicatively, d ← d·(T/E). Short-range terms are integrated exactly over trapezoids with
  erf; long-range terms run on per-term grids (pitch s/4) with separable convolution.
- **Dose classes.** Geometric ladder (1+a)ᵏ anchored at 1.0 (default a = 1 %, ≤ 256 classes) or a fixed number.
- **Monte Carlo.** Single scattering: screened-Rutherford elastic scattering, relativistic Bethe stopping power
  (ICRU 37) with the Joy–Luo low-energy form, Møller fast secondaries (hybrid model), range rejection.
  Energy deposited in the resist is tallied in log-radial bins.
- **Fracturing.** Slab sweep with positive winding (union), crossing detection, collinear re-merge, union-find for
  connected shapes.
- **Structure analysis.** Local width = shortest chord through a figure in four directions (0°, 90°, ±45°; diagonals
  only on shapes with slanted edges). Where only a diagonal is short (convex corners), the thickness is 2 × the largest
  outline distance within 150 nm. Gaps: exact trapezoid-to-trapezoid distance between different shapes. Critical
  marks accumulate on a 250 nm grid; touching marks form one zone; zones of tiny narrow area are drawing slivers and
  are ignored. Devices are shapes whose boxes come within 1 µm; repeats are found by a geometry hash at 1 pm.
- **Write plans.** score = 100 × critical spots cut + Σ stitch weights + 0.2 × cut length [mm] + w × hours, with
  stitch weight min(1, (1 µm / feature width)²) (a field offset Δ costs ∝ (Δ/w)²) and w = ¼ / 1 / 4 for quality /
  balanced / speed. Per device type the model picks the cheapest decomposition (whole in one floating field, a grid
  with a zone-avoiding offset, or follow geometry), solved on one copy. Time = shots × max(dwell, minimum dwell) per
  pass + field overhead + current change. A field size is infeasible when its address grid (size / 2^DAC bits) is
  coarser than the fine beam step. The three offered ways are the best plan, the best with the other pass strategy
  and the best at another field size; BEAMER-style fixed grid is shown for comparison.
- **Passes.** Fine pass = narrow parts + the outline sleeve; PEC pieces are cut exactly at the sleeve line
  (perpendicular to slanted sides). A figure is bulk only if all of it lies a sleeve inside the outline. The seam band
  is written in both passes at half dose, so an offset between the passes gives half dose, never an unexposed slit.
  Dose is additive, so the pass order does not change the energy; the fine pass goes first.

## Validation

Run the engine tests with Node 22+: `node src/softebeam/test/<name>.test.mjs` for `geom`, `psf`, `pec`,
`export`, `analyze`, `mc` (the `mc` test takes an electron count, e.g. `40000`). The independent exposure checker
(Python, numpy/scipy/shapely) is in [verify/](verify/).

| Check | Result |
|---|---|
| Union / fracture area vs raster, keyholes, touching shapes | exact; 20 k circles → 640 k trapezoids in 0.7 s (Node) |
| Multi-Gaussian fit of 36 reference Monte Carlo PSFs (local BEAMER install, not redistributed) | max enclosed-energy error ≤ 0.75 % |
| Stopping power vs NIST ESTAR, 5–100 keV (PMMA, Si, Au, GaAs) | within 0.1–1.3 % |
| Backscatter coefficient at 20 keV | Si 0.168, Cu 0.324, Au 0.536 (literature 0.16–0.19 / 0.29–0.34 / 0.48–0.52) |
| Monte Carlo PSF vs reference TRACER PSF (PMMA 100 nm / Si, 50 kV) | enclosed energy within 1.5 % from 5 nm outward; β 6.45 vs 6.65 µm |
| PEC on a 100 nm isolated line + 1:1 grating + 20 µm pad (β = 10 µm, η = 0.7) | simulated CD 99.6–100.3 nm after PEC (81–86 nm at uniform dose); pad edge within 0.3 nm |
| Dose classes, 1 % ladder | residual energy error ≈ 1 % |
| Field placement on a 30 mm-long spiral line (training file, 500 µm fields) | 35 stitches with follow geometry vs 71 (fixed grid) / 68 (optimised grid); stitched length 144 vs 219 µm; whole flow 4.6 s in the browser |
| PEC on 221 k figures from 1023-vertex curved shapes | converges to 0.97 % max energy error |
| End-to-end browser run (open → flow → Monte Carlo → simulate → export → editor hand-off) | no console errors |
| **Independent exposure check** of the exported GDS: separate Python code (own GDS reader and rasteriser, three-scale FFT, exact PSF), edge placement error along every design edge. Benchmark: isolated lines 50–500 nm, gratings, density towers, a line beside a 30 µm pad, a 100 nm gap between pads, a dot array, a ring and a 45° line, Si 50 kV | **with PEC every straight edge within 0.75 nm**; without PEC lines are 19–20 nm narrow per edge and the 50 nm line and the dots do not print. Sharp corners round by 28–31 nm (dose-only PEC cannot fix corners) |
| Two passes, bulk pass misplaced by 30 / 47 / 113 nm | edges within 0.8 / 1.1 / 9.6 nm; seam band energy ≥ 0.61 / 0.57 / 0.49 (threshold 0.5); the 100 nm gap stays open. Without the shared seam a 47 nm offset left an unexposed line (0.35) |
| Structure analysis (Node) | Y-branch array 0.3 s (100 devices, 1 type, 100 junction zones: 40 nm tips, 80 nm gaps); spiral 1.3 s (0 zones, 9 drawing slivers ignored); 400 k rods 8 s; 4 M-figure katakana text 65 s |
| Write plans on the Y-branch training array (100 devices of 515 × 336 µm) | recommended: 1000 µm fields, every device whole, fine + bulk, 0 stitches, ≈ 22 min; one pass 2.5 h; BEAMER-style fixed grid 25 stitches |
| Pad writing order | longest figure-to-figure jump inside a 20 µm pad 1.9 µm (was 24 µm) |
| Union of overlapping polygons whose edges cross exactly at another edge's x | exact at every offset (regression test; a float tie in the sweep used to drop a sliver) |

## Limitations

- Machine formats (EBPG `.gpf`, JEOL `.v30`, Elionix `.con`, …) are proprietary; export is GDSII + dose table
  (+ the Raith datatype convention, which should be checked once on the tool with a dose test).
- Hierarchy is flattened before PEC (no hierarchical PEC), hence the shape limit; use Extract → region for very
  large array layouts.
- Not yet implemented: multipass, field overlap at stitches, shape-based PEC (corner serifs or bias correction;
  corners round by about 1.2 α_eff), 3D-PEC, development-rate resist models, a separate PSF for the bulk beam.
- The export has not yet been run on a physical tool. The GDS holds standard BOUNDARY polygons plus a dose table;
  the machine fills each figure with its own beam steps.
- Elastic scattering uses screened Rutherford; tabulated Mott cross-sections would be more accurate for heavy
  layers (Au, Cr, GaAs) below ~30 kV.

## Clean-room statement

Soft-EBeam was written from published physics and public documentation. No vendor software was decompiled. The
`.lpsf` reader exists for interoperability with PSF files you already have; the reference PSFs used in the tests
are read from a local installation and are not part of this repository.
