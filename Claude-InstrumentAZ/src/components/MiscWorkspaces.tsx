"use client";
import { useEffect, useState } from "react";
import { PALETTE, TYPOGRAPHY, Concept, Theme, buildIco, horizontalSvg, iconSvg, primarySvg, splashSvg, svgToPng } from "@/lib/iaz/brand";
import { exampleCircuit } from "@/lib/iaz/circuit";
import { defaultDoc, migrateDoc, parseIaz, ProjectDoc } from "@/lib/iaz/doc";
import { commit, go, loadDoc, set, toast, useStore } from "@/lib/iaz/store";
import { download, Prov, Section } from "./ui";

const SIZES: Record<string, Record<string, number>> = {
  "4/4 (full size)": {},
  "7/8": { "geom.bodyLength": 346, "geom.upperBout": 160, "geom.lowerBout": 198, "geom.cBout": 107, "geom.vibLength": 315, "geom.stopLength": 189, "geom.ribHeight": 29.5 },
  "3/4": { "geom.bodyLength": 335, "geom.upperBout": 153, "geom.lowerBout": 190, "geom.cBout": 100, "geom.vibLength": 295, "geom.stopLength": 177, "geom.ribHeight": 29, "geom.fbLength": 250, "geom.bridgeWidth": 38 },
};

export function Wizard({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("My Violin");
  const [mode, setMode] = useState<"assembly" | "buildaz">("assembly");
  const [size, setSize] = useState("4/4 (full size)");
  const [elec, setElec] = useState<"none" | "minimal" | "full">("full");
  const create = () => {
    const d = defaultDoc(name || "Untitled");
    d.mode = mode; d.values = { ...d.values, ...SIZES[size] };
    if (elec === "none") { d.placed = []; d.schematic = { parts: [], wires: [], labels: {} }; }
    if (elec === "minimal") { d.placed = d.placed.filter((p) => p.lib !== "oled091"); d.schematic = exampleCircuit("preamp"); }
    if (mode === "buildaz") { d.parts = d.parts.map((p) => ({ ...p, enabled: false })); d.placed = []; }
    loadDoc(d, "cad"); onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 80, display: "grid", placeItems: "center" }} onClick={onClose}>
      <div className="panel" style={{ width: 520, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>New project</h2>
        <label className="muted">Project name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="muted" style={{ display: "block", marginTop: 10 }}>Instrument</label><select className="input" disabled><option>Violin (first milestone — other instruments come later)</option></select>
        <label className="muted" style={{ display: "block", marginTop: 10 }}>Violin size (approximate common dimensions; verify)</label>
        <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>{Object.keys(SIZES).map((s) => <option key={s}>{s}</option>)}</select>
        <label className="muted" style={{ display: "block", marginTop: 10 }}>Design method</label>
        <div style={{ display: "flex", gap: 8 }}>{([["assembly", "Component Assembly", "Start from the violin parts library"], ["buildaz", "Build A–Z", "Empty workspace, build freely, mix with library later"]] as const).map(([k, l, d]) => <div key={k} className={`panel2 ${mode === k ? "btn-active" : ""}`} style={{ flex: 1, padding: 10, cursor: "pointer", borderColor: mode === k ? "var(--accent)" : undefined }} onClick={() => setMode(k)}><b>{l}</b><div className="muted" style={{ fontSize: 11 }}>{d}</div></div>)}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Both modes share the same CAD platform; you can switch anytime.</div>
        <label className="muted" style={{ display: "block", marginTop: 10 }}>Electronics starter</label>
        <select className="input" value={elec} onChange={(e) => setElec(e.target.value as typeof elec)}><option value="none">None</option><option value="minimal">Minimal: pickup signal → op-amp preamp</option><option value="full">Full demo: ESP32 + OLED + LED strip + LiPo</option></select>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={create}>Create project</button></div>
      </div>
    </div>
  );
}

export function Welcome() {
  const wizard = useStore((s) => s.wizard);
  const [rec, setRec] = useState<{ doc: ProjectDoc; at: string } | null>(null);
  const [server, setServer] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [err, setErr] = useState<{ errors: string[]; recoverable?: ProjectDoc } | null>(null);
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem("iaz.recovery") ?? "null"); if (r?.doc) setRec(r); } catch { /* ignore corrupted recovery */ } fetch("/api/projects").then((r) => r.json()).then((j) => setServer(j.projects ?? [])).catch(() => setServer([])); }, []);
  const open = async (f: File) => {
    const res = await parseIaz(await f.text());
    if (res.ok && res.doc) { loadDoc(res.doc); if (res.warnings.length) toast(res.warnings[0]); setErr(null); } else setErr({ errors: res.errors, recoverable: res.recoverable });
  };
  const openServer = async (id: string) => { const j = await (await fetch(`/api/projects/${id}`)).json(); if (j.project) loadDoc(migrateDoc(j.project.doc).doc); };
  return (
    <div style={{ height: "100%", overflow: "auto", padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
          <div dangerouslySetInnerHTML={{ __html: iconSvg(1, "dark", 88) }} />
          <div><h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Instrument<span style={{ color: "var(--accent)" }}>AZ</span></h1><div className="muted">Connect imagination, engineering and real-world creation. First milestone: the violin.</div></div>
        </div>
        {err && <div className="panel" style={{ padding: 14, borderColor: "var(--danger)", marginBottom: 14 }}><b className="sev-error">Could not open project</b>{err.errors.map((e, i) => <div key={i} style={{ margin: "4px 0" }}>{e}</div>)}{err.recoverable && <button className="btn" onClick={() => { loadDoc(err.recoverable!); setErr(null); toast("Opened in recovery mode — verify all values"); }}>Attempt recovery (validated & repaired copy)</button>} <button className="btn" onClick={() => setErr(null)}>Dismiss</button></div>}
        {rec && <div className="panel" style={{ padding: 14, borderColor: "var(--accent)", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span><b>Autosave found:</b> “{rec.doc.name}” saved {new Date(rec.at).toLocaleString()}</span><span><button className="btn btn-primary" onClick={() => loadDoc(migrateDoc(rec.doc as unknown as Record<string, unknown>).doc)}>Recover</button> <button className="btn" onClick={() => { localStorage.removeItem("iaz.recovery"); setRec(null); }}>Discard</button></span></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          <button className="panel" style={{ padding: 16, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={() => set({ wizard: true })}><b>＋ New project</b><div className="muted">Wizard: size, method, electronics</div></button>
          <label className="panel" style={{ padding: 16, cursor: "pointer" }}><b>📂 Open .iaz</b><div className="muted">Validated, versioned, checksummed</div><input type="file" accept=".iaz,application/json" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} /></label>
          <button className="panel" style={{ padding: 16, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={() => go("cad")}><b>▶ Continue current</b><div className="muted">Go to the CAD workspace</div></button>
          <button className="panel" style={{ padding: 16, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={() => go("engineering")}><b>⚙ Engineering</b><div className="muted">Strings, parameters, dependencies</div></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <div className="panel" style={{ padding: 14 }}>
            <div className="h-title">Projects on server (PostgreSQL)</div>
            {server.length === 0 ? <div className="muted" style={{ marginTop: 6 }}>No saved projects yet. Use Ctrl+S to save the current one.</div> : server.map((p) => <div key={p.id} className="row-hover" style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span>{p.name} <span className="muted" style={{ fontSize: 11 }}>{new Date(p.updatedAt).toLocaleString()}</span></span><span><button className="btn" onClick={() => openServer(p.id)}>Open</button> <button className="btn" onClick={async () => { await fetch(`/api/projects/${p.id}`, { method: "DELETE" }); setServer(server.filter((x) => x.id !== p.id)); }}>✕</button></span></div>)}
          </div>
          <div className="panel" style={{ padding: 14 }}>
            <div className="h-title">What works in this build — honest status</div>
            <table className="t" style={{ marginTop: 4 }}><tbody>{([["Parametric violin CAD (mesh), assembly, primitives, gizmos, measure", "ok"], ["String physics, tension, tuning, downforce", "ok"], ["Dependency graph, impact preview, stale detection, variants", "ok"], ["Schematic, ERC, DC/transient solver, virtual lab", "ok"], ["PCB placement, DRC, pads-only Gerber", "partial"], ["Procedural audio, body modes (scaling estimates)", "partial"], ["Coding studio: editor, pin links, serial; no compile", "partial"], ["OCCT B-rep, STEP/IGES, booleans, D3D12, C++/Rust core", "none"]] as [string, string][]).map(([t, s]) => <tr key={t}><td>{t}</td><td><span className={`badge ${s === "ok" ? "b-valid" : s === "partial" ? "b-approx" : "b-unsup"}`}>{s === "ok" ? "working" : s === "partial" ? "partial" : "not built"}</span></td></tr>)}</tbody></table>
          </div>
        </div>
      </div>
      {wizard && <Wizard onClose={() => set({ wizard: false })} />}
    </div>
  );
}

export function Settings() {
  const theme = useStore((s) => s.theme), sync = useStore((s) => s.syncServer);
  const [auto, setAuto] = useState(true);
  useEffect(() => setAuto(localStorage.getItem("iaz.autosave") !== "off"), []);
  const keys: [string, string][] = [["Ctrl+K", "Command palette"], ["Ctrl+Z / Ctrl+Y", "Undo / Redo"], ["Ctrl+S", "Save (server + .iaz download)"], ["Ctrl+1…9", "Switch workspace"], ["Q W E R M F", "CAD: select, move, rotate, scale, measure, fit"], ["Delete", "CAD: delete selected primitive"], ["Esc", "Cancel wire in schematic"], ["Right-click", "Context menus (tree, viewport)"]];
  return (
    <div style={{ padding: 20, overflow: "auto", height: "100%" }}><div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Settings</h2>
      <Section title="Appearance"><button className={`btn ${theme === "dark" ? "btn-active" : ""}`} onClick={() => set({ theme: "dark" })}>Dark</button> <button className={`btn ${theme === "light" ? "btn-active" : ""}`} onClick={() => set({ theme: "light" })}>Light</button><div className="muted" style={{ marginTop: 6 }}>High-DPI: renderer pixel ratio {typeof window !== "undefined" ? window.devicePixelRatio : 1} (capped at 2). Panels are resizable (drag the splitters; widths persist).</div></Section>
      <Section title="Autosave & recovery"><label style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem("iaz.autosave", e.target.checked ? "on" : "off"); }} />Autosave a recovery copy in this browser (every ~1.5 s after a change)</label><label style={{ display: "flex", gap: 6, marginTop: 4 }}><input type="checkbox" checked={sync} onChange={(e) => set({ syncServer: e.target.checked })} />Sync saved project to the server database (PostgreSQL) after changes</label><button className="btn" style={{ marginTop: 6 }} onClick={() => { localStorage.removeItem("iaz.recovery"); toast("Recovery data cleared"); }}>Clear recovery data</button></Section>
      <Section title="Units">Length: millimetres; angles: degrees; SI units elsewhere. Unit switching (inch, etc.) is <Prov kind="unsup" /> in this build; all parameters display their unit explicitly.</Section>
      <Section title="Workspace layout"><button className="btn" onClick={() => { Object.keys(localStorage).filter((k) => k.startsWith("iaz.w.")).forEach((k) => localStorage.removeItem(k)); toast("Panel sizes reset — reload to apply"); }}>Reset panel sizes</button></Section>
      <Section title="Keyboard shortcuts"><table className="t"><tbody>{keys.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody></table></Section>
      <Section title="Graphics"><div className="muted">This web build renders with WebGL (three.js). The product specification requires Direct3D 12 on native Windows; that renderer is not part of this build.</div></Section>
    </div></div>
  );
}

const STATUS: [string, string, string][] = [
  ["0 Research & design", "done", "Architecture, OCCT/D3D12/FFI/UI research in this About page"],
  ["1 Foundation (C++/Rust/D3D12/OCCT)", "not built", "Sandbox is Linux/web: no MSVC, Windows SDK, OCCT or Rust toolchain. Web prototype built instead"],
  ["2 CAD MVP", "partial", "Viewport, primitives, selection modes, gizmo, measure, assembly, Build A–Z. No OCCT, booleans, constraint solver"],
  ["3 Violin design", "working", "Library, materials, strings, tension/pitch, params, SVG drawing, DXF/STL/OBJ/GLB. No STEP/IGES"],
  ["4 Electronics MVP", "working", "Library, schematic, ERC, modules, 3-D placement, wiring estimate"],
  ["5 PCB & Coding", "partial", "Placement/DRC/pads-only Gerber; editor, pin map, Web Serial. No router, no compiler"],
  ["6 Virtual lab", "working", "DMM, scope, generator, PSU, logic, LCR on an MNA simulation. No AC analysis"],
  ["7 Audio & physics", "partial", "Procedural bowed-string chain; scaling-law body modes. No FEM/stick-slip"],
  ["8 Deep integration", "working", "Parameter registry, dependency graph, impact, staleness, variants"],
  ["9 Manufacturing", "partial", "Readiness gate, BOM, drawing, instructions. No toolpaths/3MF"],
];

export function About() {
  const [concept, setConcept] = useState<Concept>(1);
  const [theme, setTheme] = useState<Theme>("dark");
  const bg = theme === "dark" ? "#0C1016" : theme === "light" ? "#ffffff" : "#e5e5e5";
  const save = async (kind: string) => {
    if (kind === "ico") download(`instrumentaz-concept${concept}-${theme}.ico`, await buildIco(concept, theme), "image/x-icon");
    else { const svg = kind === "icon" ? iconSvg(concept, theme, 512) : kind === "primary" ? primarySvg(concept, theme) : kind === "horizontal" ? horizontalSvg(concept, theme) : splashSvg(concept); download(`instrumentaz-${kind}-c${concept}-${theme}.svg`, svg, "image/svg+xml"); }
  };
  const png = async (kind: "icon" | "horizontal" | "primary") => { const [w, h] = kind === "icon" ? [512, 512] : kind === "horizontal" ? [1260, 300] : [960, 780]; const svg = kind === "icon" ? iconSvg(concept, theme, 512) : kind === "primary" ? primarySvg(concept, theme) : horizontalSvg(concept, theme); download(`instrumentaz-${kind}-c${concept}-${theme}.png`, await svgToPng(svg, w, h), "image/png"); };
  return (
    <div style={{ padding: 20, overflow: "auto", height: "100%" }}><div style={{ maxWidth: 1100 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>About InstrumentAZ <span className="muted" style={{ fontSize: 13 }}>web engineering prototype 0.1</span></h2>
      <div className="panel" style={{ padding: 14, margin: "10px 0", borderColor: "var(--warn)" }}><b className="sev-warning">Scope notice.</b> The specification targets a native Windows desktop app (C++20 + Rust, OCCT, Direct3D 12, non-Qt UI). This build was produced in a Linux web sandbox with no Windows SDK, OCCT or Rust/MSVC toolchains, so it is a working <b>web implementation of the domain core</b> (project model, physics, electronics, simulation, manufacturing logic) plus the architecture below. The pure-TypeScript engine modules in <code>src/lib/iaz</code> are written to be ported behind the C++/Rust boundary.</div>
      <Section title="Milestone status"><table className="t"><tbody>{STATUS.map(([m, s, d]) => <tr key={m}><td style={{ width: 230 }}><b>{m}</b></td><td style={{ width: 90 }}><span className={`badge ${s === "working" || s === "done" ? "b-valid" : s === "partial" ? "b-approx" : "b-unsup"}`}>{s}</span></td><td className="muted">{d}</td></tr>)}</tbody></table></Section>
      <Section title="Architecture decisions (research-based recommendations — not verified by building)">
        <table className="t"><tbody>{([
          ["CAD kernel", "Open CASCADE (OCCT) in C++: BRepPrimAPI/BRepAlgoAPI for primitives & booleans, BRepMesh_IncrementalMesh → Poly_Triangulation per TopoDS_Face for display, STEPCAFControl/IGESControl for exchange. LGPL-2.1 + exception: dynamic linking. Limits: no native parametric history/constraint solver → own feature tree (re-evaluate from parameters) + planegcs/SolveSpace-style 2D solver."],
          ["Renderer", "Own D3D12 renderer (OCCT has no D3D12 viewer): exact B-rep stays in the kernel; face tessellation → vertex/index buffers keyed by TopoDS_Face id for picking/topology mapping, edges as separate line buffers, GPU buffers rebuilt only for changed shapes, PBR + shadow map + MSAA, ID-buffer picking."],
          ["UI toolkit", "Recommended: Dear ImGui (docking branch) with the D3D12 backend — MIT, docking/multi-viewport built in, trivial embedding of the D3D12 viewport, C++ native, easy C ABI bridge; weaker accessibility/IME than WinUI 3. WinUI 3 is the runner-up (best native look, SwapChainPanel works) but lacks docking and has heavier C++/Rust packaging. WPF/wxWidgets rejected (D3D12 interop friction / dated look)."],
          ["C++/Rust boundary", "Rust owns project model, command bus, undo/redo, serialisation (.iaz), validation, tasks; C++ owns OCCT, tessellation, D3D12. Boundary: versioned C ABI (cbindgen + hand-written C headers), opaque handles with explicit create/destroy, coarse-grained calls (commands in, mesh-batch handles out), error codes + last-error string, no panics/exceptions across the boundary (catch_unwind / try-catch), data exchange via flat POD buffers & JSON for rare commands."],
          ["SPICE", "Embed ngspice as a shared library through its C API (BSD) in the Rust process; the MNA solver here is a reference/prototype for DC+transient only."],
          ["Toolchains", "Drive PlatformIO CLI / Arduino CLI / ESP-IDF / mpremote / cargo+espflash as subprocesses from Rust tasks; parse their diagnostics. No custom compilers."],
          ["Project format", ".iaz = versioned container with checksum (JSON here; target: zip with manifest + JSON + binary blobs), forward-compatible migrations, STEP/mesh/Gerber exchange so users are never locked in."],
        ] as [string, string][]).map(([k, d]) => <tr key={k}><td style={{ width: 150 }}><b>{k}</b></td><td className="muted">{d}</td></tr>)}</tbody></table>
      </Section>
      <Section title="Brand">
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {([1, 2, 3] as Concept[]).map((c) => <button key={c} className={`btn ${concept === c ? "btn-active" : ""}`} onClick={() => setConcept(c)}>Concept {c}: {["Resonance wave", "AZ monogram", "Circuit scroll"][c - 1]}</button>)}
          <span style={{ width: 20 }} />{(["dark", "light", "mono"] as Theme[]).map((t) => <button key={t} className={`btn ${theme === t ? "btn-active" : ""}`} onClick={() => setTheme(t)}>{t}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 8 }}>
          <div style={{ background: bg, borderRadius: 8, padding: 14, textAlign: "center" }} dangerouslySetInnerHTML={{ __html: primarySvg(concept, theme) }} />
          <div style={{ background: bg, borderRadius: 8, padding: 14, display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: horizontalSvg(concept, theme) }} />
          <div style={{ background: bg, borderRadius: 8, padding: 14, display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: iconSvg(concept, theme, 120) }} />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "8px 0" }}>
          {["icon", "primary", "horizontal", "splash"].map((k) => <button key={k} className="btn" onClick={() => save(k)}>SVG {k}</button>)}
          {(["icon", "primary", "horizontal"] as const).map((k) => <button key={k} className="btn" onClick={() => png(k)}>PNG {k}</button>)}
          <button className="btn btn-primary" onClick={() => save("ico")}>Windows .ico (16–256 px)</button>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>Concept 1 (Resonance wave) is used in the app. SVG is the source of truth; PNG exports are rendered in your browser; the ICO packs PNG-compressed 16/32/48/64/128/256 px images.</div>
        <div style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: splashSvg(concept).replace('width="640" height="360"', 'width="100%" style="max-width:480px;border-radius:8px"') }} />
        <div className="h-title" style={{ margin: "12px 0 6px" }}>Colour palette</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 6 }}>{PALETTE.map((c) => <div key={c.hex} className="panel2" style={{ padding: 6 }}><div style={{ height: 34, background: c.hex, borderRadius: 4 }} /><b>{c.name}</b> <span className="mono muted">{c.hex}</span><div className="muted" style={{ fontSize: 11 }}>{c.use}</div></div>)}</div>
        <div className="h-title" style={{ margin: "12px 0 6px" }}>Typography</div>{TYPOGRAPHY.map((t) => <div key={t.role}><b>{t.role}</b> — {t.font}. <span className="muted">{t.note}</span></div>)}
        <div className="h-title" style={{ margin: "12px 0 6px" }}>Brand guidelines</div>
        <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Clear space around the logo ≥ ½ the icon width; minimum icon size 16 px (use the simplified ICO frames).</li>
          <li>Amber = action/active; cyan = electronics/data; red/amber/green are reserved for status — never decorative.</li>
          <li>Result provenance badges (VISUAL, CALCULATED, APPROX. ESTIMATE, VALIDATED, MEASURED, NOT SUPPORTED) are part of the identity and must accompany every engineering number.</li>
          <li>Use the mono variant on single-colour manufacturing documents; dark variant on dark UI; light variant on paper.</li>
          <li>Voice: precise, honest about limits, never promises compatibility or physical accuracy that is not verified.</li>
        </ul>
      </Section>
    </div></div>
  );
}
void commit;
