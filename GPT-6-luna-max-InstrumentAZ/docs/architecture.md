# InstrumentAZ — architecture decisions (research baseline)

**Status: research / preview foundation, not the Windows native application.** The repository currently provides a Next.js 16 + PostgreSQL/Drizzle workspace. The interactive SVG violin is explicitly a reference illustration; it is neither an OCCT B-rep nor a manufacturing drawing. This distinction must remain visible until a native engine replaces it.

## What works in this repository

- Versioned JSON project records in PostgreSQL (`instrument_projects`) through Drizzle; project UUIDs, `schemaVersion`, update timestamps, size checks, and a metadata-only recent-project query.
- `.iaz` v1 JSON envelope export/import, browser recovery snapshot, autosave, bounded undo/redo, BOM CSV, an 18-part violin reference assembly, and interactive project parameters.
- A tested ideal flexible-string relation using SI internally: `T = μ(2Lf)²`, where UI input `L` is mm and `μ` is g/m. Results are **calculated, not validated**. String break strength, body modes, stresses, bow response and sound are not modeled.
- A declared dependency/invalidation list; most downstream CAD, acoustic, manufacturing, PCB and firmware solvers remain planned.

The API caps each project JSON payload at 2 MB. Authentication and multi-user access control are not implemented. Do not expose this preview endpoint as a public project service.

## Native architecture target (Windows)

```text
WinUI 3 shell / dock layout / properties UI
  ├── native child HWND: Direct3D 12 viewport (C++20 + HLSL)
  └── Rust application services (project, commands, dependency graph, validation)
          │ versioned C ABI; opaque document handles; serialized commands
          ▼
C++20 CAD service → OCCT B-rep / exact topology → tessellation + topology IDs
          └──────────────────────────────→ revisioned display-mesh batches → D3D12
```

Keep the UI, Rust application services, C++ CAD kernel and D3D12 renderer as separate modules. The CAD B-rep/topology is the geometry source of truth; display meshes are disposable, tolerance-controlled caches. UI picks must map back to stable project component/face/edge/vertex identifiers, not transient triangle indices.

### OCCT to a custom Direct3D 12 renderer

1. Keep exact OCCT `TopoDS_Shape` geometry in the C++ CAD service; do not convert the authoritative project to triangles.
2. For display, run `BRepMesh_IncrementalMesh` with explicit linear/angular deflection. Traverse faces, obtain each `Poly_Triangulation` via `BRep_Tool::Triangulation`, and flatten transformed nodes, normals and triangle indices into an immutable, revision-tagged mesh batch.
3. Extract edge display data separately from topological edges/polygons. Preserve source component/face/edge keys alongside each batch for selection and highlight reconstruction; do not treat tessellation triangles as OCCT topological faces.
4. Upload changed batches to a C++ D3D12 renderer. It owns the device, swap chain, command queues/lists, descriptor heaps, barriers, GPU buffers and fence lifetimes. Rebuild buffers by model revision, not by an FFI call per vertex or per frame.
5. Run expensive tessellation as a background job against an immutable shape snapshot. Serialize document mutations through a document command queue; publish a completed mesh batch only if its source revision is still current.

OCCT provides a geometry kernel, tessellation algorithms and data-exchange translators; it does **not** provide a native Direct3D 12 viewport. Tessellation is approximate display/manufacturing mesh data, distinct from the exact B-rep. STEP/IGES translators cover neutral CAD geometry; they do not promise to reconstruct another CAD vendor's full parametric feature history. STEP can also contain tessellated entities, so import validation must report what representation was read.

### Rust / C++ boundary and ownership

- Rust owns serializable project envelopes, application commands/events, dependency edges, validation issues and background-job state.
- C++ owns OCCT shapes and D3D12/GPU resources. Rust receives stable IDs and copied/immutable flat buffers, not long-lived references into a mutable `TopoDS_Shape`.
- Prefer a small, versioned C ABI for the service boundary: opaque handles, fixed-width primitives/flat slices, explicit create/destroy and buffer-release functions, status codes plus owned error text. Never let C++ exceptions, Rust panics, `std::string`, or Rust `String` cross a plain C ABI.
- Define which side allocates and frees every buffer; make thread-affinity and document revision explicit. A single serialized document-mutation lane plus background immutable geometry jobs avoids renderer/kernel races.
- `cxx` is a credible alternative when Rust and C++ are built together: it checks a typed bridge and maps selected ownership-aware standard types. It is not an excuse to move large geometry through fine-grained cross-language calls. Choose C ABI or `cxx` at the boundary, document it, and keep one source of truth.

### UI framework decision

| Candidate | Fit for this product | Decision / risk |
|---|---|---|
| **WinUI 3 + Windows App SDK** | Native Windows product, modern Fluent UI, C++/XAML support and Win32 HWND interop. A separate child HWND can own the required D3D12 swap chain. | **Recommended shell for the Windows-first release.** Docking/workspace persistence is not supplied as a complete CAD-style system: implement a focused, tested dock layout or choose a supported docking control after a prototype. Verify high-DPI, focus, accessibility and HWND input behavior on a real Windows GPU.
| **WPF** | Mature .NET UI and established desktop patterns. | `D3DImage` documents an `IDirect3DSurface9` back buffer, not a D3D12 surface. Hosting a separate native child HWND remains possible but adds interop/airspace complexity. Not the first choice for a D3D12-first viewport.
| **wxWidgets + wxAUI** | C++-native, cross-platform, docking/floating panes and a permissive wxWindows license exception. | Credible portability alternative with direct HWND access, but requires more work to match a highly refined Fluent engineering UI. Reassess if Windows-only UX changes.
| **Dear ImGui (docking branch)** | Small native tooling UI; official DX12 renderer backend and docking/multi-viewport support; MIT license. | Excellent renderer/debugger panels and early engine tools; not recommended as the primary user-facing CAD product UI without substantial work on accessibility, typography, navigation and polished controls.

This is a reasoned starting choice, not a claim that WinUI 3 has turnkey CAD docking or a built-in D3D12 viewport. A thin WinUI shell plus a native child HWND is the path to prototype before building a large dock system.

### OCCT, platform and license considerations

- Current OCCT 8.0.1 documentation states C++17 as the minimum and supports setting CMake's C++ standard to C++20 or newer. The native project can therefore target C++20 while keeping compatibility with the kernel.
- OCCT's public release is LGPL 2.1 with the Open CASCADE exception. Distribution still carries license notices/source-availability and linking obligations; review the exact release license and distribution model with counsel before packaging a proprietary Windows installer.
- OCCT's standard viewer path is not the application's D3D12 renderer. The renderer pipeline above is a custom integration and must be tested against selected OCCT versions and topology cases.

## `.iaz` project evolution

The current `.iaz` is a readable JSON envelope, not a ZIP container or proprietary CAD file. Keep a root format version and domain schema versions. A future portable archive can package a validated manifest, assembly/project JSON, native `.brep` geometry, schematic/PCB source, firmware, material records, simulations and manufacturing documents as separate files. Use safe archive paths, checksums, migration steps, and a recovery copy before rewriting an older project. Keep neutral STEP/IGES/mesh exports available so project storage never becomes a vendor lock-in.

Every engineering property should evolve toward `{ value, unit, nominal, tolerance, source, confidence }` and declared validation bounds. The current compact numeric keys are an MVP convenience; they do not yet provide a complete units/dimensions system or manufacturing datum/tolerance model.

## Milestone truth table

| Area | Current state |
|---|---|
| Project foundation | Working browser UI, PostgreSQL/Drizzle JSONB, `.iaz` JSON import/export, local recovery and tests |
| Violin reference assembly | Component metadata, connection names, material callouts and dimension controls; vector reference view only |
| String physics | Tested ideal-string tension/frequency equations using entered density and target pitch; unvalidated model |
| Dependency graph | Declared links and stale-result flags; only listed calculations execute |
| CAD/OCCT/STEP/IGES/STL/OBJ | Not implemented; no solids, imported files, kernel validation or production export |
| C++20 / Rust / FFI / Direct3D 12 / HLSL | Target architecture documented; not in this repository build |
| Schematic/PCB/ESP firmware/SPICE/audio/acoustics | Not implemented; workspaces explain the missing solver/toolchain instead of inventing results |
| Manufacturing drawings / tolerances / CNC | Not implemented. BOM is an editable parts-list CSV only, not a production package |
| Packaging | Browser preview only; no Windows `.exe`, `.ico` packaging, PNG logo export or installed splash screen |

The current sandbox is Linux x86-64. It has `g++`, but no `rustc`/Cargo, CMake, OCCT installation or Windows SDK/D3D12 toolchain. Native implementation needs a Windows CI/development host and approved dependency/licensing build setup; this is a genuine blocker, not a preview feature.

## Primary references

- [OCCT 8.0.1 build/system requirements](https://dev.opencascade.org/doc/overview/html/build_upgrade__building_occt.html)
- [OCCT mesh / BRepMesh guide](https://dev.opencascade.org/doc/overview/html/occt_user_guides__mesh.html)
- [OCCT STEP translator](https://dev.opencascade.org/doc/overview/html/occt_user_guides__step.html) · [IGES translator](https://dev.opencascade.org/doc/overview/html/occt_user_guides__iges.html)
- [OCCT public license](https://dev.opencascade.org/resources/download/occt-public-license)
- [Microsoft WinUI 3](https://learn.microsoft.com/en-us/windows/apps/winui/winui3/) · [WinUI 3 / Win32 HWND interop](https://learn.microsoft.com/en-us/windows/apps/winui/winui3/desktop-winui3-app-with-basic-interop)
- [Direct3D 12 command list execution and synchronization](https://learn.microsoft.com/en-us/windows/win32/direct3d12/executing-and-synchronizing-command-lists)
- [WPF D3DImage](https://learn.microsoft.com/en-us/dotnet/api/system.windows.interop.d3dimage) · [wxAUI manager](https://docs.wxwidgets.org/latest/classwx_aui_manager.html)
- [Dear ImGui docking / DX12 backend](https://github.com/ocornut/imgui/tree/docking) · [Rustonomicon FFI](https://doc.rust-lang.org/nomicon/ffi.html) · [CXX bridge guide](https://cxx.rs/)
