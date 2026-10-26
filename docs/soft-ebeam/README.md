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
| PSF | Literature preset, manual α/β/η(/γ/ν), an in-browser Monte Carlo run, or an imported `.lpsf`/text PSF. A beam + process blur (FWHM) is added in quadrature. |
| PEC | Fragments figures (edge strips + interior pieces, small shapes kept whole), solves doses, quantises to dose classes. |
| Fields & Order | **Automatic field placement** scores four strategies — fixed grid, fixed grid with optimised offset, follow geometry from one end, follow geometry centre first — by stitches (places where a field edge cuts the pattern), stitched length, field count and stage travel, and keeps the best; stitches are straightened to one clean cut across the structure and marked in the viewer. Then splits figures at write-field boundaries and sets the writing order: start corner, field traversal (meander/raster rows or columns, spiral from the centre) and figure order inside a field (shape by shape, raster, meander, shortest path, centre-out, outside-in, by dose). The **Write order** view colours figures first → last, draws the beam path and stage moves, and can play the exposure. Export writes the GDS in this order. PEC is computed on the whole pattern first. |
| Simulate | Exposes the corrected pattern with the PSF and draws the developed edge (threshold model), optionally next to the uniform-dose result. A movable cross-section plots the energy profile and reports drawn vs developed widths with and without PEC. |
| Export | GDSII with the dose class in the datatype, one layer per class, or the Raith convention (datatype = round(1000 × dose factor)); a dose table; dwell and beam-on time estimates. |

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

## Validation

Run the engine tests with Node 22+: `node src/softebeam/test/<name>.test.mjs` for `geom`, `psf`, `pec`,
`export`, `mc` (the `mc` test takes an electron count, e.g. `40000`).

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

## Limitations

- Machine formats (EBPG `.gpf`, JEOL `.v30`, Elionix `.con`, …) are proprietary; export is GDSII + dose table
  (+ the Raith datatype convention, which should be checked once on the tool with a dose test).
- Hierarchy is flattened before PEC (no hierarchical PEC), hence the shape limit; use Extract → region for very
  large array layouts.
- Not yet implemented: multipass, field overlap/stitching strategies, bulk/sleeve splitting, shape-based PEC (bias
  correction), 3D-PEC, development-rate resist models.
- Elastic scattering uses screened Rutherford; tabulated Mott cross-sections would be more accurate for heavy
  layers (Au, Cr, GaAs) below ~30 kV.

## Clean-room statement

Soft-EBeam was written from published physics and public documentation. No vendor software was decompiled. The
`.lpsf` reader exists for interoperability with PSF files you already have; the reference PSFs used in the tests
are read from a local installation and are not part of this repository.
