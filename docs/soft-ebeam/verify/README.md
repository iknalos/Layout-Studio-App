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
