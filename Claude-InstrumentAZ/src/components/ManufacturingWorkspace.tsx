"use client";
import { useMemo, useState } from "react";
import { ARTIFACTS, checkRules } from "@/lib/iaz/params";
import { freshness, markComputed, serializeIaz } from "@/lib/iaz/doc";
import { assemblyInstructions, bomCsv, bomOf, drawingSvg, FORMATS, gerberOf, manufacturingChecks, toDXF, toGLB, toOBJ, toSTL } from "@/lib/iaz/exporters";
import { buildModel, checkFit } from "@/lib/iaz/geometry";
import { toSpiceNetlist, runERC } from "@/lib/iaz/circuit";
import { commit, toast, useDoc, useVals } from "@/lib/iaz/store";
import { download, fmt, IssueList, Prov, Section, Tabs, Unsupported } from "./ui";

export default function ManufacturingWorkspace() {
  const doc = useDoc();
  const v = useVals();
  const [tab, setTab] = useState<"ready" | "drawing" | "export" | "bom" | "asm" | "import">("ready");
  const design = useMemo(() => [...checkRules((id) => v[id]), ...runERC(doc.schematic, doc.customParts).filter((i) => i.severity === "error")], [v, doc.schematic, doc.customParts]);
  const fit = useMemo(() => checkFit(doc, v), [doc, v]);
  const mfg = useMemo(() => manufacturingChecks(doc, v, design, fit), [doc, v, design, fit]);
  const bom = useMemo(() => bomOf(doc, v), [doc, v]);
  const svg = useMemo(() => drawingSvg(doc, v), [doc, v]);
  const errors = mfg.filter((i) => i.severity === "error").length, warns = mfg.filter((i) => i.severity === "warning").length;
  const name = doc.name.replace(/\s+/g, "_");
  const model = () => buildModel(doc, v);
  const run = async (label: string, fn: () => void | Promise<void>) => { try { await fn(); toast(`${label} exported`); } catch (e) { toast(`${label} failed: ${(e as Error).message}`); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 8 }}>
      <Tabs tabs={[["ready", `Readiness (${errors}E/${warns}W)`], ["drawing", "Technical drawing"], ["export", "Exports"], ["bom", "BOM & materials"], ["asm", "Assembly instructions"], ["import", "Import"]]} value={tab} onChange={setTab} />
      <div style={{ flex: 1, overflow: "auto", paddingTop: 8 }}>
        {tab === "ready" && <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 8 }}>
          <div className="panel" style={{ padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ padding: "6px 14px", borderRadius: 6, fontWeight: 700, background: errors ? "color-mix(in srgb, var(--danger) 25%, transparent)" : "color-mix(in srgb, var(--ok) 25%, transparent)", color: errors ? "var(--danger)" : "var(--ok)" }}>{errors ? "NOT READY FOR MANUFACTURING" : warns ? "READY WITH WARNINGS — review required" : "NO BLOCKING ISSUES FOUND"}</div>
              <span className="muted">A good-looking model is not a manufacturable one. These checks cover only what is implemented; a human release review is still required.</span>
            </div>
            <IssueList issues={mfg} />
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="h-title">Generated documents</div>
            {ARTIFACTS.filter((a) => ["art.drawing", "art.bom", "art.pcb", "art.fit", "art.firmware", "art.power"].includes(a.id)).map((a) => { const f = freshness(doc, v, a.id); return <div key={a.id} className="panel2" style={{ padding: 6, margin: "4px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{a.label}<div className={f === "fresh" ? "sev-info" : "sev-error"} style={{ fontSize: 11 }}>{f === "fresh" ? "reviewed, up to date" : f === "stale" ? "OUT OF DATE" : "not reviewed"}</div></span><button className="btn" disabled={f === "fresh"} onClick={() => commit("Review " + a.label, (d) => markComputed(d, v, [a.id]))}>Mark reviewed</button></div>; })}
            <div className="h-title" style={{ marginTop: 10 }}>Mass (estimate) <Prov kind="approx" /></div>
            <div className="mono">{fmt(v["mass.total"], 0)} g total</div>
          </div>
        </div>}
        {tab === "drawing" && <div className="panel" style={{ padding: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}><button className="btn btn-primary" onClick={() => download(`${name}-drawing.svg`, svg, "image/svg+xml")}>Download SVG</button><button className="btn" onClick={() => { const w = window.open("", "_blank"); w?.document.write(`<html><body style="margin:0">${svg}</body></html>`); w?.document.close(); w?.print(); }}>Print / PDF</button><Prov kind="calc" /><span className="muted">Views: top, centre section. Isometric, detail and multi-sheet drawings are not implemented. Dimensions use nominal values + tolerances you set.</span></div>
          <div style={{ overflow: "auto", background: "#fff", borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>}
        {tab === "export" && <div className="panel" style={{ padding: 10 }}>
          <div className="muted" style={{ marginBottom: 8 }}><b>Exact CAD</b> (STEP/IGES) keeps true surfaces and can be edited in other CAD; <b>mesh</b> formats (STL/OBJ/GLB/3MF) are triangle approximations for printing or visualisation only.</div>
          <table className="t"><thead><tr><th>Format</th><th>Type</th><th>Status</th><th>Notes</th><th /></tr></thead><tbody>{FORMATS.map((f) => {
            const act: Record<string, () => void> = {
              ".stl": () => run("STL", () => download(`${name}.stl`, toSTL(model(), name))), ".obj": () => run("OBJ", () => download(`${name}.obj`, toOBJ(model()))), ".glb": () => run("GLB", async () => download(`${name}.glb`, await toGLB(model()), "model/gltf-binary")),
              ".dxf": () => run("DXF", () => download(`${name}.dxf`, toDXF(v))), ".svg": () => run("SVG", () => download(`${name}-drawing.svg`, svg, "image/svg+xml")), ".csv": () => run("BOM", () => download(`${name}-bom.csv`, bomCsv(bom), "text/csv")),
              ".cir": () => run("SPICE", () => download(`${name}.cir`, toSpiceNetlist(doc.schematic, doc.customParts, { tstop: 0.005, dt: 1e-5 }))),
              ".gtl/.gko/.drl": () => run("Gerber", () => { const g = gerberOf(doc); download(`${name}.GTL`, g.copper); download(`${name}.GKO`, g.outline); download(`${name}.DRL`, g.drill); }),
              ".iaz": () => run("Project", async () => download(`${name}.iaz`, await serializeIaz(doc), "application/json")),
            };
            return <tr key={f.ext}><td><b>{f.name}</b> <span className="muted">{f.ext}</span></td><td><span className={`badge ${f.kind === "exact" ? "b-calc" : "b-visual"}`}>{f.kind}</span></td><td>{f.supported ? <span className="sev-info">available</span> : <Prov kind="unsup" />}</td><td className="muted" style={{ fontSize: 11 }}>{f.note}</td><td>{f.supported && act[f.ext] && <button className="btn" onClick={act[f.ext]}>Export</button>}</td></tr>;
          })}</tbody></table>
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Mesh exports are in millimetres, Y-up (top plate normal), Z along the body axis. CNC / laser: use the DXF (OUTLINE, RIB_INNER, FHOLE layers); toolpath (G-code) generation is not implemented.</div>
        </div>}
        {tab === "bom" && <div className="panel" style={{ padding: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}><button className="btn btn-primary" onClick={() => download(`${name}-bom.csv`, bomCsv(bom), "text/csv")}>Download CSV</button><span className="muted">{bom.length} lines · total ≈ {fmt(bom.reduce((s, r) => s + r.massG, 0), 0)} g <Prov kind="approx" /></span></div>
          <table className="t"><thead><tr><th>Item</th><th>Qty</th><th>Description</th><th>Material</th><th>Spec</th><th>g</th><th>Source</th><th>P/N</th></tr></thead><tbody>{bom.map((r, i) => <tr key={i}><td>{r.item}</td><td>{r.qty}</td><td className="muted" style={{ fontSize: 11 }}>{r.desc}</td><td>{r.material}</td><td className="muted" style={{ fontSize: 11 }}>{r.spec}</td><td className="mono">{fmt(r.massG, 1)}</td><td className="muted" style={{ fontSize: 11 }}>{r.source}</td><td style={{ color: r.pn ? undefined : "var(--warn)" }}>{r.pn || "missing"}</td></tr>)}</tbody></table>
        </div>}
        {tab === "asm" && <div className="panel" style={{ padding: 10 }}><button className="btn btn-primary" onClick={() => download(`${name}-assembly.txt`, assemblyInstructions(doc, v))}>Download</button><pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12 }}>{assemblyInstructions(doc, v)}</pre></div>}
        {tab === "import" && <div className="panel" style={{ padding: 10, display: "grid", gap: 8, maxWidth: 760 }}>
          <Section title="Import status">
            <table className="t"><tbody>
              <tr><td>.iaz project</td><td className="sev-info">available (Welcome → Open project)</td></tr>
              <tr><td>STEP / IGES</td><td><Prov kind="unsup" /> requires OCCT kernel</td></tr>
              <tr><td>STL / OBJ / 3MF / glTF</td><td><Prov kind="unsup" /> mesh import not yet implemented</td></tr>
              <tr><td>DXF</td><td><Prov kind="unsup" /> import not yet implemented (export works)</td></tr>
              <tr><td>Gerber / KiCad</td><td><Prov kind="unsup" /> not implemented</td></tr>
            </tbody></table>
          </Section>
          <Unsupported title="Round-trip editing with external CAD">Until the OCCT-based desktop kernel exists, edit externally by exporting meshes/DXF and re-creating parametric features here.</Unsupported>
        </div>}
      </div>
    </div>
  );
}
