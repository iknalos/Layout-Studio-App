# Independent exposure check

`check_exposure.py` re-simulates a GDS exported by Soft-EBeam and measures where the resist edge lands. It shares no
code with Soft-EBeam: its own GDS reader, its own rasteriser (supersampled point coverage), FFT convolution on three
grids (1 nm core, 10 nm mid range, 100 nm long range; the PSF is split by smooth radial tapers so the parts add up
exactly), and the true PSF (an analytic double Gaussian, or the raw radial table of a `.lpsf` file).

```
python make_benchmark.py                       # writes pecbench.gds + pecbench_sites.json
# open pecbench.gds in Soft-EBeam, run the flow, export with Format = Raith (datatype = 1000 × dose)
python check_exposure.py pecbench.gds softebeam.gds pecbench_sites.json "gauss:24,9500,0.74,15" 0.5 "label"
python check_exposure.py pecbench.gds softebeam.gds seam_sites.json "gauss:24,9500,0.74,15" 0.5 "bulk off" 101,-40,25
```

Arguments: design GDS, exported GDS, measurement sites, PSF (`gauss:alpha,beta,eta,blurFWHM` in nm, or a `.lpsf`
path), development threshold, a label, and optionally `layer,dx,dy` to misplace one layer (for example the bulk pass
on layer 101) and test how robust the two-pass seam is.

For every site it prints the edge placement error along all design edges inside the window (mean, spread, worst),
the worst corner pull-back, edge points that did not print or bridged, the minimum energy inside pads (must stay
above the threshold) and the maximum energy in gaps (must stay below it). Needs numpy, scipy and shapely.

## Machine model: what a beam-step tool writes

`check_machine.py` asks a different question: the tool does not write polygons, it fills each figure with shots at
its beam step. It turns every exported figure into shots under one of five fill rules and simulates those (forward
PSF from the shots on a 1 nm grid, backscatter from the figure areas), then measures the developed corrugation of
Bragg gratings.

| Rule | What the tool does |
|---|---|
| `ideal` | exact area coverage (no beam step) |
| `snap` | shots at the centres of one global B × B grid that fall inside the figure |
| `round` | each figure on its own grid from its lower-left corner, round(size / B) rows and shots per row |
| `floor` | the same with floor(size / B) |
| `fit` | round(size / B) rows and shots, the step stretched to fit the figure |

```
# the test file: SiEPIC_EBeam_PDK/docs/process/ShotPitch/Bragg_Shot_Pitch_Fracturing.gds (UW, JEOL JBX-6300FS)
node run_flow.mjs Bragg_Shot_Pitch_Fracturing.gds top=lukasc_top layers=1,31 preset=si100hsq bss=6 current=8 out=bragg
python -I check_machine.py bragg_figs.json bragg_sites.json round 6
```

`run_flow.mjs` drives the Soft-EBeam worker headless with the app's defaults and writes the GDS, the dose table and
`<out>_figs.json` (every written figure in writing order; `figOrder=meander` for rows instead of the default by-geometry
order). `node order_jumps.mjs <out>_figs.json` counts the beam moves between figures that do not touch, by length.
`bragg_sites.json` lists the 26 gratings of the test file
(the 13 with ΔW = 38…50 nm in 1 nm steps are measured, on layer 1 and layer 31).
