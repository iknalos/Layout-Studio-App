# Soft-EBeam — research notes: workflow, physics and maths

Background research for Soft-EBeam, the e-beam data-preparation module of Layout Studio. It covers how
commercial EBL data prep (GenISys BEAMER is the reference point) is used in practice, and the published
physics and maths needed to build an independent implementation.

**Clean-room note.** Soft-EBeam was written from published literature and public documentation only. No
vendor binaries were decompiled. Vendor material was consulted only for *what features exist and what they are
called*, never for code. Vendor-specific statements below are marked [vendor public docs]; anything inferred is
marked **(uncertain)**. Equations marked [derived] were worked out and numerically checked during this project.

---

## 1. How e-beam data prep is used (the BEAMER-style workflow)

### 1.1 Flow concept
- The job is a **directed flow of modules** on a canvas ("VisualFLOW"). Each module has a state colour: parameters
  missing → not yet run → results ready. "Run To" executes the flow up to a module. Flows save as text (`.ftxt`). [vendor public docs]
- Module port types: single-port (Import), dual-port (Extract, Heal, Bias, PEC, Export…), multi-port (Booleans,
  Merge/Split, Loop/Optimizer pairs).
- Flow variables `%name%`, loops over doses/layers/cells, IF/SELECT branches, a Python node.

### 1.2 The modules that matter for a standard EBL job
| Module | What it does | Key parameters |
|---|---|---|
| Import | read GDSII/OASIS/DXF/CIF… | layer/datatype set |
| Extract | choose layers, cells, a region | layer list, extent (auto/user) |
| Heal | merge overlaps into clean polygons | target layer; "overlap removal" mode; "heal per dose" after PEC |
| Bias | grow/shrink | bias (µm), corner extension, X-Y/X/Y mode |
| Boolean | AND/OR/XOR/MINUS/NOT | — |
| Fracture | machine-independent fracturing | resolution, beam step size (BSS), mode (conventional / large-rect-fine-trapezoid / curved), axis, angle |
| Fields | write-field placement & ordering | field size (default 1000 µm), meander/raster/spiral traversal, fixed/floating/follow-geometry placement, overlap, multipass |
| PEC | proximity effect correction | PSF (archive / ≤4 Gaussians / numerical), dose classes, isodose grid, min figure size, short-range on/off |
| E-Beam (sim) | convolve with PSF, contour at thresholds | exposure dose, α, β, η, beam size, pixel size, thresholds |
| Export | machine format | Raith, JEOL (.v30), EBPG (.gpf), Elionix, Crestec, Vistec, Advantest, MEBES… |

Typical facility flows (public SOPs):
- **UW (JEOL 6300):** Import → Extract → Heal (overlap removal) → PEC (long-range only on Si; fine above ~50 nm) → Export JEOL.
- **NBI Copenhagen (Elionix):** Import → Extract → Heal per layer → PEC (archive PSF, "OC" 100 for Si, 0 for III-V) → Transform → Export.
- **Vendor default:** Import → Heal → PEC → Heal-per-dose → Export.

### 1.3 PEC as exposed to users
- PSF sources: an archive of Monte Carlo PSFs for common stacks/kV; a Gaussian sum (α, β, η, plus γ₁/ν₁, γ₂/ν₂);
  or a numerical table. Vendor statement: the numerical PSF is used directly and split into short- and long-range parts.
- **Edge equalization** target: absorbed energy = 50 % of the large-area value at every edge (Pavkovich 1986).
  Consequence: **base dose 1.0 = "dose to size" ≈ 2 × the dose-to-clear of a large pad.**
- **Mix factor** between edge equalization (1, default) and uniform clearing (0). Lower values help low-contrast
  resists / heavy substrates where large pads clear last.
- **Dose classes:** "accuracy" mode (default 1 %, geometric ladder (1+a)ᵏ, up to 256 classes; 3 % is a
  common recommendation), fixed number (64), or a user dose table.
- Fracturing for PEC happens on an **isodose grid** (multiple of BSS; ≈α with short-range correction, ≈1 % of β
  without), with a **minimum figure size** floor.
- Short-range correction is recommended when features are below ~2–3× the effective blur.
- Typical effective blur (FWHM): ~15 nm (100 kV, 1 nA, thin PMMA), ~30 nm (100 kV, 20 nA, thick PMMA), ~50 nm (50 kV, 50 nA).

### 1.4 Monte Carlo PSF tool (TRACER-style)
- Inputs: substrate + intermediate layers + resist (flagged), beam energy, beam FWHM, number of electrons (≥1–2 M recommended).
- Outputs: r–z energy map; 1-D PSF at resist top/centre/bottom or depth-averaged; fit to 2–4 Gaussians; file export.
- Experimental calibration: grating base-dose test (1:1 lines, area ≥ 4β×4β), density towers (0/25/50/75/100 %),
  isofocal method (focused vs defocused), single-dot exposures, the doughnut test (Stevens 1986).

### 1.5 How doses reach the machine
- **Raith GDS dialect:** dose factor carried in the GDS DATATYPE, `DATATYPE = round(1000 × DF)` (open-source Raith_GDSII toolbox, MPL-2.0). Verify on your tool.
- **JEOL:** per-shape "shot rank" 0–255 in `.v30`, plus a `MODULAT` table in the JDF. Format is proprietary.
- **EBPG GPF, Elionix CON/CEL, Vistec, NuFlare, Heidelberg:** proprietary (specs shipped only to licensed users).
- Generic route used by many tools: GDS with dose class in layer or datatype + a dose table.

### 1.6 Write-time and fields rules of thumb
- t ≈ D·A/I + overhead; 1 cm² at 200 µC/cm² and 1 nA ≈ 56 h.
- Spot ≈ 1.4–1.6 × BSS; smallest feature ≥ 4–5 BSS; BSS ≈ CD/4…CD/10.
- Compute PEC on the whole layout **before** splitting into fields (backscatter crosses field boundaries).

---

## 2. PSF models

**Convention used throughout Soft-EBeam:** normalised Gaussian g_a(r) = exp(−r²/a²)/(π a²) with a = 1/e radius
(σ = a/√2, FWHM = 2√ln2·a ≈ 1.665 a). It is exactly separable: g_a(x,y) = g1_a(x)·g1_a(y), g1_a(x) = exp(−x²/a²)/(√π a).

- **Double Gaussian** (Chang 1975): f(r) = [g_α + η g_β]/(1+η), ∫f·2πr dr = 1.
  α forward-scatter range, β backscatter range, η = backscattered/forward energy in the resist.
- **Triple Gaussian** (Wind 1989, Aya 1996): f = [g_α + η g_β + ν g_γ]/(1+η+ν) (mid-range term).
- **Power-law + Gaussian** (Hougs et al. 2025, arXiv:2506.21236): the double Gaussian can be wrong by up to 10⁴ at
  intermediate radii.
- Cumulative (enclosed energy) of a Gaussian sum: F(R) = Σ wₖ(1 − e^{−R²/sₖ²}) / Σ wₖ.
- Fourier transform (k in cycles/length): F(k) = [e^{−π²α²k²} + η e^{−π²β²k²}]/(1+η).
- Blurs add in quadrature: α_eff² = α_fwd² + α_beam² + α_process².
- Forward broadening estimate: d_f[nm] = 0.9·(R_t[nm]/V[kV])^1.5 (Rai-Choudhury).
- **η (PSF) is not the SEM backscatter coefficient** (Si: η_PSF ≈ 0.7 vs η_BS ≈ 0.16–0.18).

### 2.1 Why Soft-EBeam uses a multi-Gaussian representation
Monte Carlo PSFs for thin resist at 50–100 kV are not double-Gaussian. Fitting the 36 TRACER PSFs shipped with
a BEAMER install (used locally as test references only) showed:
- ~30 % of the energy within ~2 nm, ~20 % in a **power-law mid-range (3 nm–1 µm, from fast secondary electrons)**,
  ~50 % in the backscatter halo, whose edge is *sharper* than a Gaussian (log-concave in r²).
- A 2-Gaussian fit has log-RMS errors of ~2 (factor e² ≈ 7); a 3-Gaussian fit ~1.
- Soft-EBeam therefore represents any numerical PSF as **Σ wₖ g_{sₖ} with 30 log-spaced sₖ**, weights from
  non-negative least squares on two row blocks: relative density error (shape across decades) + absolute
  enclosed-energy error (where the energy is). Wide terms (s ≥ 300 nm) may take negative weights so the halo edge
  can be sharper than any positive Gaussian mix. Result on all 36 PSFs: **max enclosed-energy error ≤ 0.75 %**,
  negative mass ≤ 0.5 % (far tail). Every term stays separable → fast convolutions.

### 2.2 Typical parameters (1/e convention)
**Si substrate**

| kV | α | β (µm) | η | Conditions | Source |
|---|---|---|---|---|---|
| 10 | 0.39 µm | 0.60 | 0.74 | 0.5 µm resist | Owen, JVST B 8, 1889 (1990) |
| 10 | – | 0.81 | 0.53 | MC, 180 nm CSAR | Hougs 2025 |
| 20 | 0.12 µm | 2.0 | 0.74 | 0.5 µm resist | Owen 1990 |
| 20 | – | 2.2 | 0.79 (MC) | PMMA | Svintsov 2022 |
| 25 | – | 3.1 | 0.70 | PMMA, exp. | Svintsov 2022 |
| 30 | – | 4.0 | 0.69 (MC) | PMMA | Svintsov 2022 |
| 50 | 24 nm | 9.5 | 0.74 | 0.5 µm resist | Owen 1990 |
| 50 | – | 8.27 | 0.72 | MC, CSAR | Hougs 2025 |
| 100 | 7 nm | 31.2 | 0.74 | 0.5 µm resist | Owen 1990 |
| 100 | 11.8 nm | 33.3 | 0.61 | MC, 495 nm ZEP520A | Georgia Tech lecture |
| 100 | 2.4–48 nm | 27.9–29.7 | 0.72 | 50 nm–1 µm HSQ | Mao 2025 |
| 150 | – | 59 (exp) / 57.2 (MC) | 0.67 / 0.72 | CSAR | Hougs 2025 |

**Other substrates**

| Substrate | kV | β (µm) | η | Source |
|---|---|---|---|---|
| GaAs | 20 / 25 / 30 / 35 | 1.2 / 1.5 / 2.0 / 2.3 | ≈1.1–1.4 | Svintsov 2022 |
| GaAs | 100 | 13.0 | 1.09 | Georgia Tech (ZEP) |
| InP | 150 | 23 | 1.16 | Hougs 2025 |
| SiO₂ | 100 | 31.8 | 0.52 | Georgia Tech |
| Al₂O₃ | 25 / 100 | 2.0 / 13.3 | 0.8 / 0.74 | Svintsov / Georgia Tech |
| Ge | 25 / 100 | 1.4 / 13.0 | 1.1 / 1.06 | Svintsov / Georgia Tech |
| LiNbO₃ | 100 | 14.8 | 0.92 | Georgia Tech |
| Au (bulk) | 100 | 2.32 | 1.16 | Georgia Tech |

Scaling: β ∝ E^1.7 for Si (Jackel 1984); β/R_KO ≈ 0.35–0.48 for 20–150 kV (Si, SiO₂, GaAs) [derived], with
Kanaya–Okayama R_KO[µm] = 0.0276·A·E^1.67/(Z^0.889·ρ). At 100 kV: β ≈ 7.65×10⁻³/ρ − 1.36 µm (ρ in g/cm³; Czaplewski 2013).
α is the least reliable parameter — calibrate α_eff from CD-vs-dose data.

---

## 3. Proximity effect correction maths

### 3.1 Energy model and targeting
- E(x) = ∫ f(x − x′) p(x′) d(x′) dA′ in dose-equivalent units: a large pad at dose D receives E = D inside, ≈ D/2 at its edge.
- Edge energy of a wide feature at slowly varying dose [derived]: E_edge = d·[½ + η·P]/(1+η), P = g_β ⊛ p ∈ [0,1].
- Pavkovich limiting cases (uniform dose): isolated narrow line ½(1−BE), 50 % lines/spaces ½, narrow gap ½(1+BE), BE = η/(1+η).

### 3.2 Closed-form density correction
D_f = (1+η)/(1+2ηP) (edge equalization). Limits: P=0 → 1+η (isolated), P=½ → 1, P=1 → (1+η)/(1+2η).
With a mix factor m ∈ [0,1]: D_f = 1/(1 + BE((1+m)P − 1)); m = 1 edge equalization, m = 0 uniform clearing (D_f = (1+η)/(1+ηP)).
Iso/large-area dose ratio = 1 + 2η.

### 3.3 Iterative self-consistent solution (what Soft-EBeam does)
- Fragment the pattern; each fragment (or each small shape) is a dose variable with a **control point**: the
  midpoint of its longest outline side (target 0.5) or its centroid if it has no outline side (interior target, 1.0 = uniform clearing).
- Iterate d_{k+1} = d_k·(E_target/E_k)^ω (multiplicative form). The additive update
  d = 2(1+η)E_th − 2η g_β⊛(p·d) **diverges when 2η > 1** [derived]; the ratio form is its resummation.
- Parikh (1979) matrix form: Σⱼ Iᵢⱼ Dⱼ = E_T; weighted Jacobi converges with ω≈0.8 when diagonal dominance holds (Xu 2023).
- Stop when the max relative energy error < ½ of the dose-class step.

### 3.4 Fast evaluation
- Gaussian over a rectangle [x₁,x₂]×[y₁,y₂]: (D/4)[erf((x₂−x)/a) − erf((x₁−x)/a)][erf((y₂−y)/a) − erf((y₁−y)/a)].
- Trapezoid: sum of horizontal erf strips (height ≤ 0.4a). Exact polygons: Owen's T function (Owen 1956).
- Long range: separable 1-D convolutions on a grid (pitch β/4…β/10), bilinear interpolation to control points;
  or FFT with the analytic F(k) and zero-padding ≥ 3β (weight beyond 3β: 0.012 %).
- erf: Abramowitz–Stegun 7.1.26 (|ε| ≤ 1.5×10⁻⁷).

### 3.5 Dose classes and CD sensitivity
- Geometric classes D_base·(1+a)ᵏ; nearest class in log space; worst-case error ±a/2.
- ΔCD ≈ √π·α_eff·(1 + 2ηP)·(Δd/d) at a 50 % edge [derived]; dense areas are more dose-sensitive.

### 3.6 Resist models
- Threshold: develops where E ≥ E_th (E_th = dose-to-clear of a large pad).
- Contrast curve (positive): t/t₀ = γ log₁₀(D₁/E) between D₀ and D₁, γ = 1/log₁₀(D₁/D₀).
- Development rate (Greeneich 1974/75; Mack 1987 for photoresists) — needs fitted constants.

---

## 4. Monte Carlo electron transport

### 4.1 Elastic: Joy screened Rutherford (single scattering)
- σ = 5.21×10⁻²¹ (Z²/E²)·4π/[α(1+α)]·[(E+511)/(E+1024)]² cm² (E in keV); α = 3.4×10⁻³ Z^0.67/E.
  The 4π and the relativistic factor belong together (low-E limit πe⁴Z²/(4E²α(1+α))).
- cosθ = 1 − 2αR/(1+α−R), φ = 2πR′; λ = A/(N_A ρ σ); compounds: 1/λ = N_A ρ Σ wᵢσᵢ/Aᵢ; element chosen ∝ wᵢσᵢ/Aᵢ.
- Mean free paths (check values): Si 24 nm @ 20 keV, 57 nm @ 50 keV, 105 nm @ 100 keV; PMMA 60/142/261 nm.
- Screened Rutherford is fine for H, C, N, O, Si (≤ 15 % vs Mott); for Au, Cr, Ga, As, In layers below ~30 keV use Mott
  (Browning 1994 fit, valid 0.1–30 keV; NIST SRD 64 / ELSEPA tables).

### 4.2 Energy loss
- Joy–Luo (1989): dE/ds = −78500 (ρ/E) Σ wᵢZᵢ/Aᵢ · ln[1.166(E + kJᵢ)/Jᵢ] keV/cm, k ≈ 0.731 + 0.0688 log₁₀Z.
  **It is 11 % low at 50 keV and 21 % low at 100 keV vs NIST ESTAR** (non-relativistic).
- **Relativistic Bethe (ICRU 37 / ESTAR):** S/ρ = 0.153537 (Z/A)/β² · [ln(τ²(τ+2)/(2(I/mc²)²)) + F⁻(τ) − δ] MeV·cm²/g,
  τ = E/mc², β² = τ(τ+2)/(τ+1)², F⁻ = 1 − β² + [τ²/8 − (2τ+1)ln2]/(τ+1)². Matches ESTAR within 0.2 %.
  Hybrid used here: I′ = I/(1 + kI/E) to keep Joy–Luo's low-energy behaviour.
- I-values (eV, ICRU 37): H 19.2, C 78, N 82, O 95, Al 166, Si 173, P 173, Cl 174, Ti 233, Cr 257, Ga 334, As 347, In 488, Au 790.
  Compounds (ESTAR): PMMA 74.0, SiO₂ 139.2, Al₂O₃ 145.2, GaAs 384.9.

### 4.3 Fast secondary electrons (Møller, hybrid model — Murata, Kyser & Ting 1981)
- dσ/dε = (2πr_e²mc²/(β²E))·[1/ε² + 1/(1−ε)² + (τ/(τ+1))² − ((2τ+1)/(τ+1)²)/(ε(1−ε))], ε = W/E ∈ [ε_c, ½].
- σ_M(ε_c) = (2πr_e²mc²/(β²E))·[1/ε_c − 1/(1−ε_c) + (τ/(τ+1))²(½ − ε_c) − ((2τ+1)/(τ+1)²) ln((1−ε_c)/ε_c)], per electron; n_e = N_A ρ Σ wᵢZᵢ/Aᵢ.
- Sampling: ε = ε_c/(1 − R(1−2ε_c)), accept with g(ε)/g(½).
- Angles: secondary sin²θ_s = 2(1−ε)/(2+τε); primary sin²θ_p = 2ε/(2+τ−τε); φ_s = φ_p + π.
- The primary then loses only the **restricted** stopping power (energy carried by knock-ons above W_c is not double-counted).
- In thin resist at 50–100 kV the elastic mean free path exceeds the resist thickness, so the 1–100 nm part of the
  PSF is set by beam size + fast secondaries (Kyser 1982: "the fundamental resolution limit").

### 4.4 Transport loop
Sample s = −λ_tot ln R → if s exceeds the distance to the layer boundary, move to the boundary, apply energy loss,
change material and resample (memoryless) → otherwise move, lose energy, choose elastic vs Møller and the element,
rotate the direction. Stop below E_min, depositing the rest locally. Backscatter = leaving the top surface.
Range rejection (stop substrate electrons that can't reach the resist) is an unbiased speed-up.

### 4.5 Tally and fit
Radial log bins (r₀≈0.5 nm, 10–40 per decade, to 2–3 R_KO), energy deposited inside the resist depth window,
PSF_k = ΔE_k/(E_tot·π(r_k² − r_{k−1}²)). ≥10⁵ electrons for β/η to ~1 %; 10⁶+ for the mid-range tail.

### 4.6 Validation data
- Backscatter coefficient η_BS (measured, ±10–20 %): Si 0.16–0.19 @ 20 keV, Cu 0.29–0.34, Au 0.48–0.52.
  Reuter: η = −0.0254 + 0.016Z − 1.86e-4 Z² + 8.3e-7 Z³.
- Kanaya–Okayama range: Si 4.74 / 21.9 / 69.7 µm at 20 / 50 / 100 keV; GaAs 2.57 / 11.9 / 37.7 µm.

### 4.7 Materials
| Material | Composition | ρ (g/cm³) | Note |
|---|---|---|---|
| PMMA | C₅H₈O₂ | 1.19 | I = 74 eV |
| ZEP520A / CSAR 62 | C₁₃H₁₅ClO₂ (α-chloroacrylate : α-methylstyrene 1:1) | ~1.05–1.2 (uncertain) | |
| HSQ | HSiO₁.₅ | ~1.4 spun (uncertain; up to 2.2 converted) | |
| ma-N 2400 | ≈C₈H₈O | ~1.2 (assumed) | |
| SU-8 | ≈C₈₇H₁₁₈O₁₆ | ~1.2 | |
| Si / SiO₂ / Si₃N₄ | | 2.33 / 2.2 / 3.0–3.18 | |
| GaAs / InP / Al₂O₃ | | 5.32 / 4.81 / 3.98 | |
| Cr / Au / Ti / Al | | 7.18 / 19.32 / 4.51 / 2.70 | |

---

## 5. Fracturing, fields and writing

- **Slab trapezoidation:** sort vertex y's; in each slab intersect spanning edges; sort by x at the slab midpoint;
  pair by winding rule; merge vertically adjacent trapezoids with collinear sides. Minimum trapezoid partition with
  holes is NP-complete (3-approximation exists, Asano 1986).
- **Manhattan → rectangles:** minimum count n/2 + h − g − 1 via bipartite matching of good diagonals (Eppstein 2010).
- **Slivers** (width < ε, e.g. 5 nm): minimise together with shot count (Kahng 2006; Yu 2013).
- **PEC-aware fracturing:** edge strips (≈2–4·α_eff) + coarser interior pieces (≈β/5), cuts on the isodose grid.
- **Dwell:** t[ns] = 0.01·D[µC/cm²]·s[nm]²/I[nA]; minimum step s_min = √(I/(D·f_max)).
  Line dwell t[ns] = 0.1·LD[pC/cm]·s[nm]/I[nA]; dot dwell t[µs] = Q[fC]/I[nA].
- **Step ripple** ≈ 2·exp(−2π²σ²/s²) per axis: s ≤ spot FWHM is enough.
- **Fields:** address unit = field/2^bits (20-bit DAC ≈ 1 nm over 1 mm). Meander field order; stitching ~10–15 nm.

### 5.2 Write plans: what the maths says about splitting a pattern
- **Order does not change the dose.** Absorbed energy is a linear superposition, E = Σ_pieces PSF ⊛ (dose × piece),
  so the final energy is the same in any writing order; PEC is computed once on the whole pattern.
- **What matters is where pieces meet.** Two pieces written in different fields (or passes) are offset by Δ with
  σ_Δ² = 2σ_field² + (v_drift · Δt)². On a feature of width w the damage scales as (Δ/w)²: for a single-mode waveguide
  the coupling loss is 4.34 (Δ/w₀)² dB (≈ 0.02 dB per stitch at σ = 20 nm, w₀ = 0.4 µm); through an 88 µm pad it is
  negligible; across 40 nm tips with 80 nm gaps it destroys the junction. Hence: critical spots inside one field and
  near its centre (deflection distortion grows towards the field edge), cuts through the widest parts, pieces that
  meet written back to back.
- **Splitting by feature size saves time.** t = Q / I per pass. For the Y-branch array (0.13 mm² fine, 2.9 mm² bulk at
  300 µC/cm²): one pass at 1 nA ≈ 2.5 h; fine at 1 nA + bulk at 20 nA + a 5 min current change ≈ 22 min.
- **The seam between passes.** A misplacement Δ between the passes opens a slit of width Δ; the forward-scatter energy
  lost at its centre is ≈ erf(Δ / 2α). In a pad edge-equalised to E ≈ 0.7 with η = 0.74, a 47 nm slit drops the
  energy to ≈ 0.40, below the 0.5 threshold (an unexposed line). Writing the seam band in both passes at half dose
  loses only half of that, E ≈ 0.60. Measured with the independent checker: 0.57 at 47 nm, 0.49 at 113 nm.

### 5.3 The beam step and figure sizes
- **What the tool does.** A vector-scan tool places a figure on its machine grid (1 nm at UW) but fills it with shots at
  the beam step B (6 nm at UW). A figure h tall holds h/B rows; when that is not an integer the tool rounds (or
  truncates) the last row, so the edge where the figure ends moves by up to B/2, and a seam between two figures gets a
  gap or a double row of up to B/2 each. The figure sizes, not only the vertex grid, must be whole steps: "the size of
  each shape is still a multiple of the beam step size … the outer edges are now placed to the 1 nm machine grid"
  (Bojko et al., *Beam Step Size Fracturing for Bragg Grating Waveguides*, GenISys BEAMeeting, EIPBN 2014).
- **Three ways out.** (a) Snap every vertex to the B grid (UW standard fracturing): seams close, but every edge moves
  by up to B/2 and sizes come in B increments. (b) Whole-step figures with the remainder as an overlap of < B buried in
  the middle (beam step size correction): edges stay on the 1 nm grid, the overlap adds < B × dose inside the shape.
  (c) Lower current and B (1 nA, 2 nm at UW): exact, but 8× slower. Soft-EBeam does (b), and makes PEC edge strips
  whole steps so the overlap is never next to an edge.
- **Machine model check** (`verify/check_machine.py`): shots per figure under four fill rules (global grid snap,
  per-figure round, per-figure floor, step stretched to fit), forward PSF from the shots, backscatter from areas; the
  developed corrugation of the 13 Bragg gratings (ΔW 38–50 nm in 1 nm steps) of the UW test file, Si 100 kV HSQ PSF.

---

## 6. Key references
- Chang, JVST 12, 1271 (1975) · Parikh, J. Appl. Phys. 50, 4371 (1979); IBM J. Res. Dev. 24, 438 (1980)
- Owen & Rissman (GHOST), J. Appl. Phys. 54, 3573 (1983) · Pavkovich, JVST B 4, 159 (1986)
- Eisenmann, Waas & Hartmann (PROXECCO), JVST B 11, 2741 (1993) · Lee & Cook (PYRAMID), IEEE TSM 11, 108 (1998)
- Owen, JVST B 8, 1889 (1990) · Murai et al., JVST B 10, 3072 (1992) · Xu et al., AIP Advances 13, 055306 (2023)
- Svintsov et al., Materials 15, 3888 (2022) · Hougs et al., arXiv:2506.21236 (2025) · Mao et al., Discover Nano 20:84 (2025)
- Joy, *Monte Carlo Modeling for Electron Microscopy and Microanalysis* (1995) · Joy & Luo, Scanning 11, 176 (1989)
- Murata, Kyser & Ting, J. Appl. Phys. 52, 4396 (1981) · Browning et al., J. Appl. Phys. 76, 2016 (1994)
- Kanaya & Okayama, J. Phys. D 5, 43 (1972) · ICRU Report 37 (1984) / NIST ESTAR
- NIST NeXLCore.jl, NIST EPQ/DTSA-II, NIST SRD 64 (open implementations / data)
- Raith_GDSII toolbox (MPL-2.0) — Raith GDS dose convention
- GenISys public webinars/app notes and university SOPs (UW, NBI, EPFL, Penn, Cornell) — workflow and parameter names only
