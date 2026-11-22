# InstrumentAZ — architecture, status and risks

## What exists in this repository
A **web implementation (Next.js + PostgreSQL + three.js)** of the InstrumentAZ domain core. The sandbox it was built in is Linux/web only (no Windows SDK, MSVC, OCCT, Rust toolchain), so the native C++20/Rust/Direct3D 12 product could not be built here. The engine code in `src/lib/iaz/*` is plain TypeScript with no UI dependencies so it can be ported behind the C++/Rust boundary.

| Module | File | Notes |
| --- | --- | --- |
| Unified parameter registry, dependency graph, impact analysis, rules | `params.ts` | Typed parameters (unit, bounds, domain); derived parameters declare deps; cross-domain `RELATIONS` are data |
| Staleness / project document / `.iaz` | `doc.ts` | Fingerprints of dependency values; versioned, checksummed (SHA-256) container; migration + repair |
| String & violin physics | `params.ts` | Mersenne `f=(1/2L)√(T/μ)`, break-angle downforce, scaling-law body modes (**estimates**) |
| Audio engine | `audio.ts` | Procedural bowed tone → body modes / pickup / preamp / amp / DSP. No samples |
| Circuit engine | `circuit.ts` | Nets, ERC, MNA DC + transient (R,C,L,V,I,D,pot, ideal op-amp), SPICE netlist export |
| Geometry/CAD view | `geometry.ts`, `shape.ts` | Parametric meshes, fit/collision checks, wiring estimate (display meshes only) |
| Manufacturing | `exporters.ts` | STL/OBJ/GLB/DXF/SVG drawing/BOM/Gerber (pads+outline)/Excellon, readiness gate |
| Firmware link | `firmware.ts` | `#define` pins ⇄ schematic net labels |

Tests: `npx tsx tests/selfcheck.ts` (physics, solver vs closed-form, project format) and `npx tsx tests/render.tsx` (workspace render smoke test).

## Target native architecture (recommendation)
* **CAD core (C++20)**: OCCT. Primitives/booleans via `BRepPrimAPI`/`BRepAlgoAPI`; tessellation `BRepMesh_IncrementalMesh` → `Poly_Triangulation` per `TopoDS_Face` (face id ↔ GPU range table for picking/topology mapping); exchange via `STEPCAFControl`, `IGESControl`. OCCT has no parametric history → own feature tree replayed from the parameter graph; 2D constraint solver (planegcs/SolveSpace-like). Exact B-rep never leaves the kernel; the renderer only sees mesh batches.
* **Renderer (C++)**: own Direct3D 12 (OCCT ships no D3D12 viewer): per-shape vertex/index buffers, descriptor heaps, 2 frames in flight with fences, ID-buffer picking, PBR + shadow map + MSAA, line buffers for edges/grid/gizmos.
* **Application core (Rust stable)**: project model, command bus + undo/redo, serialization/validation, dependency graph, tasks (toolchain subprocesses, ngspice), resource management.
* **UI**: Dear ImGui docking + D3D12 backend (MIT, docking/multi-viewport, trivial viewport embedding). Runner-up WinUI 3 (better native a11y/IME, no docking, heavier packaging). Qt/QML explicitly excluded.
* **FFI contract**: versioned C ABI (`cbindgen` + hand-written headers). Opaque handles with explicit create/destroy (Rust owns project state, C++ owns kernel shapes, GPU resources owned by the renderer thread). Coarse-grained calls only: commands in (flat POD or JSON), mesh-batch handles out; never call per vertex/per frame across the boundary. No panic/exception crossing (`catch_unwind` / `try-catch` → error code + thread-local last-error string). Kernel and renderer run on their own threads, communicate via message queues.
* **SPICE**: embed ngspice shared library (C API). **Firmware**: drive PlatformIO / Arduino CLI / ESP-IDF / mpremote / cargo+espflash as subprocesses.

## Not implemented (do not assume)
OCCT B-rep, STEP/IGES/3MF import-export, boolean operations, parametric constraint solver, FEM/modal analysis, bow–string stick-slip time integration, AC small-signal analysis, BJT/MOSFET models, PCB trace router/vias/copper layers (Gerber is pads+outline+drill only), compilation/upload, G-code/toolpaths, unit switching, Direct3D 12 renderer, C++/Rust native shell.

## Key risks
1. OCCT integration cost & licence (LGPL dynamic linking), tessellation quality/performance on complex assemblies.
2. Acoustic results are scaling estimates; need measurement-based calibration before any claim of accuracy.
3. Parametric history on top of OCCT (topological naming problem).
4. Component data are typical values, not vendor-verified; real BOM needs datasheet verification.
