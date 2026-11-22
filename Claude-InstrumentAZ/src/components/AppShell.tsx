"use client";
import { Component, ComponentType, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { iconSvg, splashSvg } from "@/lib/iaz/brand";
import { ARTIFACTS, checkRules } from "@/lib/iaz/params";
import { freshness, migrateDoc, serializeIaz } from "@/lib/iaz/doc";
import { commit, getState, go, redo, set, toast, undo, useDoc, useStore, useVals, Workspace } from "@/lib/iaz/store";
import { download } from "./ui";
import CadWorkspace from "./CadWorkspace";
import EngineeringWorkspace from "./EngineeringWorkspace";
import ElectronicsWorkspace from "./ElectronicsWorkspace";
import LabWorkspace from "./LabWorkspace";
import CodingWorkspace from "./CodingWorkspace";
import { AudioWorkspace, SimulationWorkspace } from "./AudioSimWorkspaces";
import ManufacturingWorkspace from "./ManufacturingWorkspace";
import LibraryWorkspace from "./LibraryWorkspace";
import { About, Settings, Welcome } from "./MiscWorkspaces";

const NAV: [Workspace, string, string][] = [
  ["welcome", "Welcome", "⌂"], ["cad", "CAD / Assembly / Build A–Z", "◫"], ["library", "Component Library", "▤"], ["engineering", "Engineering & Properties", "⚙"], ["electronics", "Electronics Studio", "⏚"],
  ["lab", "Virtual Electronics Lab", "∿"], ["coding", "Coding Studio", "‹›"], ["audio", "Audio", "♪"], ["simulation", "Simulation", "≈"], ["manufacturing", "Manufacturing", "⛭"],
];
const WS: Record<Workspace, ComponentType> = { welcome: Welcome, cad: CadWorkspace, library: LibraryWorkspace, engineering: EngineeringWorkspace, electronics: ElectronicsWorkspace, lab: LabWorkspace, coding: CodingWorkspace, audio: AudioWorkspace, simulation: SimulationWorkspace, manufacturing: ManufacturingWorkspace, settings: Settings, about: About };

class Boundary extends Component<{ children: ReactNode; ws: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(p: { ws: string }) { if (p.ws !== this.props.ws && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) return <div style={{ padding: 30 }}><div className="panel" style={{ padding: 20, maxWidth: 600, borderColor: "var(--danger)" }}><h2 className="sev-error" style={{ fontWeight: 700, fontSize: 18 }}>This workspace crashed</h2><p className="muted" style={{ margin: "8px 0" }}>{this.state.err.message}</p><p>Your project is safe: an autosaved recovery copy is kept in this browser.</p><button className="btn btn-primary" onClick={() => this.setState({ err: null })}>Retry</button> <button className="btn" onClick={() => go("welcome")}>Go to Welcome</button></div></div>;
    return this.props.children;
  }
}

export default function AppShell() {
  const ws = useStore((s) => s.ws), theme = useStore((s) => s.theme), toastMsg = useStore((s) => s.toast), palette = useStore((s) => s.palette);
  const dirty = useStore((s) => s.dirty), past = useStore((s) => s.past.length), fut = useStore((s) => s.future.length), saveStatus = useStore((s) => s.saveStatus);
  const doc = useDoc();
  const vals = useVals();
  const [splash, setSplash] = useState(true);
  const [q, setQ] = useState("");
  const timers = useRef<{ a?: ReturnType<typeof setTimeout>; s?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => { const t = localStorage.getItem("iaz.theme"); if (t === "light" || t === "dark") set({ theme: t }); const id = setTimeout(() => setSplash(false), 1300); return () => clearTimeout(id); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("iaz.theme", theme); }, [theme]);
  useEffect(() => { if (toastMsg) { const id = setTimeout(() => set({ toast: null }), 3500); return () => clearTimeout(id); } }, [toastMsg]);

  const saveServer = async (manual = false) => {
    const d = getState().doc;
    try {
      const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, name: d.name, formatVersion: d.formatVersion, doc: d }) });
      if (!r.ok) throw new Error(String(r.status));
      set({ dirty: false, lastSaved: new Date().toISOString(), saveStatus: `Saved to server ${new Date().toLocaleTimeString()}` });
      if (manual) toast("Project saved to the server database");
    } catch { set({ saveStatus: "Server save failed (offline?) — recovery copy kept locally" }); if (manual) toast("Server save failed"); }
  };
  useEffect(() => {
    if (!dirty) return;
    clearTimeout(timers.current.a); clearTimeout(timers.current.s);
    timers.current.a = setTimeout(() => { if (localStorage.getItem("iaz.autosave") !== "off") { try { localStorage.setItem("iaz.recovery", JSON.stringify({ doc: getState().doc, at: new Date().toISOString() })); set({ saveStatus: `Autosaved locally ${new Date().toLocaleTimeString()}` }); } catch { set({ saveStatus: "Autosave failed (storage full?)" }); } } }, 1500);
    timers.current.s = setTimeout(() => { if (getState().syncServer) saveServer(); }, 5000);
    return () => { clearTimeout(timers.current.a); clearTimeout(timers.current.s); };
  }, [doc, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const cmds = useMemo(() => [
    ...NAV.map(([id, l]) => ({ id: "go-" + id, label: `Go to ${l}`, run: () => go(id) })),
    { id: "go-settings", label: "Open Settings", run: () => go("settings") }, { id: "go-about", label: "Open About / Brand / Architecture", run: () => go("about") },
    { id: "new", label: "New project…", run: () => { set({ ws: "welcome", wizard: true, palette: false }); } },
    { id: "undo", label: "Undo", run: undo }, { id: "redo", label: "Redo", run: redo },
    { id: "save", label: "Save project to server", run: () => saveServer(true) },
    { id: "export", label: "Export .iaz project file", run: async () => download(`${getState().doc.name.replace(/\s+/g, "_")}.iaz`, await serializeIaz(getState().doc), "application/json") },
    { id: "theme", label: "Toggle light/dark theme", run: () => set({ theme: getState().theme === "dark" ? "light" : "dark" }) },
    { id: "assembly", label: "Mode: Component Assembly", run: () => commit("Mode: Component Assembly", (d) => ({ ...d, mode: "assembly" })) },
    { id: "buildaz", label: "Mode: Build A–Z", run: () => commit("Mode: Build A–Z", (d) => ({ ...d, mode: "buildaz" })) },
    { id: "rebuild", label: "Repair/migrate current project document", run: () => { const r = migrateDoc(getState().doc as unknown as Record<string, unknown>); commit("Repair project", () => r.doc); toast(r.notes[0] ?? "Project is valid"); } },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.("input,textarea,select");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); set({ palette: !getState().palette }); setQ(""); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveServer(true); }
      else if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) { e.preventDefault(); go(NAV[Number(e.key) - 1][0]); }
      else if (e.key === "Escape" && getState().palette) set({ palette: false });
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const issues = useMemo(() => checkRules((id) => vals[id]), [vals]);
  const stale = useMemo(() => ARTIFACTS.filter((a) => freshness(doc, vals, a.id) === "stale").length, [doc, vals]);
  const W = WS[ws];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 10px", background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
        <div dangerouslySetInnerHTML={{ __html: iconSvg(1, theme === "dark" ? "dark" : "light", 26) }} />
        <b style={{ letterSpacing: -0.3 }}>Instrument<span style={{ color: "var(--accent)" }}>AZ</span></b>
        <input className="input" style={{ width: 200 }} value={doc.name} onChange={(e) => commit("Rename project", (d) => ({ ...d, name: e.target.value }), "name")} title="Project name" />
        <span className="badge b-visual" title="Project format (.iaz)">.iaz v{doc.formatVersion}</span>
        <button className="btn" onClick={undo} disabled={!past} title="Undo (Ctrl+Z)">↶ Undo</button><button className="btn" onClick={redo} disabled={!fut} title="Redo (Ctrl+Y)">↷ Redo</button>
        <button className="btn" onClick={() => saveServer(true)} title="Save (Ctrl+S)">💾 Save</button>
        <button className="btn" onClick={async () => download(`${doc.name.replace(/\s+/g, "_")}.iaz`, await serializeIaz(doc), "application/json")} title="Download .iaz">⭳ .iaz</button>
        <button className="btn" style={{ marginLeft: "auto", minWidth: 190, justifyContent: "space-between" }} onClick={() => { set({ palette: true }); setQ(""); }} title="Command palette"><span className="muted">Search commands…</span><kbd>Ctrl K</kbd></button>
        <button className="btn" onClick={() => set({ theme: theme === "dark" ? "light" : "dark" })} title="Toggle theme">{theme === "dark" ? "☾" : "☀"}</button>
        <button className="btn" onClick={() => go("settings")} title="Settings">⚙︎ Settings</button>
        <button className="btn" onClick={() => go("about")} title="About, brand & architecture">ⓘ</button>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav style={{ width: 48, background: "var(--panel)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 6 }}>
          {NAV.map(([id, label, ic], i) => <button key={id} onClick={() => go(id)} title={`${label} (Ctrl+${i + 1})`} aria-label={label} style={{ width: 40, height: 40, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 18, background: ws === id ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "transparent", color: ws === id ? "var(--accent)" : "var(--muted)", borderLeft: ws === id ? "3px solid var(--accent)" : "3px solid transparent" }}>{ic}</button>)}
        </nav>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}><Boundary ws={ws}><W /></Boundary></main>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "3px 12px", background: "var(--panel)", borderTop: "1px solid var(--border)", fontSize: 11 }} className="muted">
        <span>{NAV.find((n) => n[0] === ws)?.[1] ?? ws}</span>
        <span className={issues.some((i) => i.severity === "error") ? "sev-error" : issues.length ? "sev-warning" : "sev-info"} style={{ cursor: "pointer" }} onClick={() => go("engineering")} title="Design rule results">● {issues.filter((i) => i.severity === "error").length} errors · {issues.filter((i) => i.severity === "warning").length} warnings</span>
        <span className={stale ? "sev-warning" : ""} style={{ cursor: "pointer" }} onClick={() => go("engineering")}>{stale ? `⚠ ${stale} result(s) out of date` : "results current"}</span>
        <span>{dirty ? "● unsaved changes" : "saved"}</span><span>{saveStatus}</span>
        <span style={{ marginLeft: "auto" }}>history {past}/{past + fut} · mm · WebGL preview</span>
      </div>
      {toastMsg && <div className="panel" style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", padding: "8px 16px", zIndex: 90, boxShadow: "0 6px 24px #0007" }}>{toastMsg}</div>}
      {palette && (
        <div style={{ position: "fixed", inset: 0, zIndex: 85, background: "#0007", display: "flex", justifyContent: "center", paddingTop: 90 }} onClick={() => set({ palette: false })}>
          <div className="panel" style={{ width: 520, height: "fit-content", padding: 8 }} onClick={(e) => e.stopPropagation()}>
            <input autoFocus className="input" placeholder="Type a command…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { shown[0].run(); set({ palette: false }); } if (e.key === "Escape") set({ palette: false }); }} />
            <div style={{ marginTop: 6 }}>{shown.map((c, i) => <div key={c.id} className="row-hover" style={{ padding: "6px 10px", cursor: "pointer", background: i === 0 ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined }} onClick={() => { c.run(); set({ palette: false }); }}>{c.label}</div>)}{!shown.length && <div className="muted" style={{ padding: 8 }}>No matching command</div>}</div>
          </div>
        </div>
      )}
      {splash && <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#0C1016", display: "grid", placeItems: "center", animation: "none" }} onClick={() => setSplash(false)} dangerouslySetInnerHTML={{ __html: splashSvg(1).replace('width="640" height="360"', 'width="min(92vw,720px)"') }} />}
    </div>
  );
}
