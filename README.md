[gds_readme.md](https://github.com/user-attachments/files/26799054/gds_readme.md)
# ⬡ GDS Studio

A fast, browser-based GDS-II layout viewer and AI-powered editor. Built as an alternative to KLayout and CleWin for quick viewing, measuring, and modifying photonic/semiconductor mask layouts — with no installation required.

---

## Overview

GDS Studio runs entirely in the browser. It parses, renders, and exports GDS-II binary files client-side, with no data uploaded to any server. An integrated Claude AI assistant allows natural-language shape creation and layout modification directly on the loaded file.

---

## Features

### Viewing
- Drag-and-drop or open `.gds` / `.gds2` files
- Smooth pan and zoom (mouse wheel, trackpad pinch)
- Automatic fit-to-view on load with **⌖ Re-center**
- White canvas with dynamic scale bar (auto-switches nm / μm / mm)
- Cell hierarchy browser — click any cell to isolate and view it
- Layer panel with per-layer colour picker and visibility toggle

### Performance
- **Async chunked parser** — file reads in background, UI stays responsive, cancel anytime with ⏹ Stop
- **3-level LOD renderer**:
  - Zoomed out → filled rectangle showing array footprint
  - Medium zoom → dot per instance
  - Zoomed in → full polygon geometry
- **Analytical viewport culling** — for axis-aligned arrays, visible row/column range is computed mathematically instead of iterating every instance
- **Bounding box cache** — cell extents computed once per session and reused across all render frames

### Measurement
- **Measure mode** — click any circle to read its diameter and layer; click a second to get the centre-to-centre pitch
- Measurement line drawn on canvas with label
- Works correctly on deeply nested AREF hierarchies

### AI Layout Assistant
- Natural-language shape creation: *"create a circle 5 μm radius on layer 0"*
- Layout analysis: *"what is the diameter and pitch of the circles in Sub_50nm?"*
- **In-place cell modification**: *"change the hexagonal arrays in Sub_50nm_3.2um to square pattern"* — AI reads the current AREF vectors, computes new orthogonal row vectors, and overwrites the cell live in the viewer
- 20-second timeout with cancel button

### Export
- Export modified layout as a valid GDS-II binary file (`.gds`) ready for KLayout, CleWin, or fabrication

---

## Supported GDS Elements

| Element | Parsing | Rendering | Export |
|---------|---------|-----------|--------|
| BOUNDARY (polygon) | ✅ | ✅ | ✅ |
| PATH | ✅ | ✅ | ✅ |
| SREF (cell reference) | ✅ | ✅ | ✅ |
| AREF (array reference) | ✅ | ✅ | ✅ |
| TEXT | ✅ | ✅ | ✅ |

---

## How to Use

### Opening a File
- Drag and drop a `.gds` file onto the canvas, **or**
- Click **📂 Open** in the toolbar

### Navigation
| Action | Input |
|--------|-------|
| Pan | Click and drag |
| Zoom | Scroll wheel or trackpad pinch |
| Fit view | **⌖ Re-center** button |
| Zoom in/out | **＋** / **－** buttons |

### Measuring
1. Click **◎ Measure** to enter measure mode
2. Click a circle → diameter and layer appear in the bottom panel
3. Click a second circle → pitch is calculated and drawn on canvas
4. Click **✕** to clear selection

### AI Assistant
Type in the chat panel or click a quick prompt. Examples:

```
Create a circle radius 5 μm on layer 0
Add a 20×10 μm rectangle on layer 1
What is the pitch between circles in Sub_70nm?
Change the array in Sub_50nm_3.2um to square pattern
```

To reliably convert hex arrays to square, use this prompt format:
```
For cell Sub_XXnm_3.2um: replace the 2 hex AREFs with 1 square AREF.
Keep sname, nc, nr unchanged. Keep col_vec_per_step exactly as-is.
Set row_vec_per_step = (0, col_pitch) where col_pitch = magnitude of col_vec_per_step.
```

### Exporting
Click **⬇ Export** to download the current state (including any AI modifications) as `output.gds`.

---

## Architecture

```
Browser
├── GDS Parser        — pure JS binary parser, chunked async (no main thread blocking)
├── GDS Writer        — binary GDS-II encoder for export
├── Bounding Box      — recursive cell extent calculator with per-session cache
├── Renderer          — HTML5 Canvas 2D with 3-level LOD and analytical culling
├── Hit Test          — analytical AREF instance lookup for measure mode
└── AI Interface      — Claude API integration with JSON operation schema
```

---

## Limitations

- **No GPU acceleration** — renderer uses HTML5 Canvas 2D (CPU). Very large files (>10M polygons) may render slowly at full zoom.
- **No OASIS support** — only GDS-II binary format is supported.
- **No rotation/reflection** for AREF — magnification and position are supported; rotated arrays may not render correctly.
- **AI modifications are single-session** — changes are held in memory. Always export before closing.

---

## Roadmap

- [ ] WebGL/GPU renderer for billion-polygon files
- [ ] OASIS file format support
- [ ] Undo/redo stack
- [ ] Ruler and annotation tools
- [ ] DRC (design rule check) — min spacing, min width
- [ ] Multi-file comparison view
- [ ] Python desktop app (gdstk + PyQt) for offline use

---

## Privacy

All file parsing and rendering happens locally in your browser. GDS files are never uploaded to any server. The AI assistant sends only a compact text summary of the library structure (cell names, element counts, pitches) to the Claude API — raw polygon data is never transmitted.

---

## Built With

- React 18
- HTML5 Canvas 2D
- Claude API (Anthropic) — `claude-sonnet-4-20250514`
- Pure JavaScript GDS-II parser and writer (no external GDS libraries)

---

## License

MIT — free to use, modify, and distribute.
