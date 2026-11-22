"use client";
import { useEffect, useState } from "react";
import { EL_CATEGORIES, EL_LIBRARY, ElPart, getElPart, MATERIALS, PinType, SimKind, VIOLIN_LIB } from "@/lib/iaz/catalog";
import { newId, Placed } from "@/lib/iaz/doc";
import { SchPart } from "@/lib/iaz/circuit";
import { commit, go, set, toast, useDoc, useVals } from "@/lib/iaz/store";
import { Prov, Section, Tabs } from "./ui";

interface Module { id: string; name: string; parts: SchPart[]; wires: { id: string; a: { p: string; pin: number }; b: { p: string; pin: number } }[]; labels: Record<string, string> }

export default function LibraryWorkspace() {
  const doc = useDoc();
  const v = useVals();
  const [tab, setTab] = useState<"violin" | "elec" | "mats" | "modules">("elec");
  const [q, setQ] = useState(""), [cat, setCat] = useState("All");
  const [selV, setSelV] = useState("bridge"), [selE, setSelE] = useState("esp32");
  const [mods, setMods] = useState<Module[]>([]);
  const [form, setForm] = useState({ name: "My sensor", category: "Custom", w: 10, l: 10, h: 3, pins: "VCC:power,GND:ground,SIG:output", vmin: 3, vmax: 3.6, i: 5, sim: "NONE" as SimKind, fp: "generic", mass: 1 });
  useEffect(() => { try { setMods(JSON.parse(localStorage.getItem("iaz.modules") ?? "[]")); } catch { setMods([]); } }, []);
  const all = [...EL_LIBRARY, ...doc.customParts];
  const list = all.filter((p) => (cat === "All" || p.category === cat) && (p.name + p.category + (p.iface ?? "")).toLowerCase().includes(q.toLowerCase()));
  const e = getElPart(selE, doc.customParts);
  const vp = VIOLIN_LIB.find((x) => x.id === selV)!;
  const compat = (part: ElPart, volts: number, label: string) => !part.v ? `${label}: no supply spec in catalog → unknown` : volts < part.v[0] || volts > part.v[1] ? `${label} ${volts} V: OUTSIDE catalog range ${part.v[0]}–${part.v[1]} V` : `${label} ${volts} V: inside catalog range ${part.v[0]}–${part.v[1]} V (verify datasheet; not a compatibility guarantee)`;
  const saveModule = () => { const name = prompt("Module name", "Preamp stage"); if (!name) return; const m: Module = { id: newId("mod"), name, ...JSON.parse(JSON.stringify(doc.schematic)) }; const n = [...mods, m]; setMods(n); localStorage.setItem("iaz.modules", JSON.stringify(n)); toast("Module saved (browser storage, reusable across projects)"); };
  const insertModule = (m: Module) => commit(`Insert module ${m.name}`, (d) => { const map = new Map<string, string>(); const parts = m.parts.map((p) => { const id = newId("p"); map.set(p.id, id); return { ...p, id, ref: p.ref + "'", x: p.x + 40, y: p.y + 300 }; }); return { ...d, schematic: { parts: [...d.schematic.parts, ...parts], wires: [...d.schematic.wires, ...m.wires.map((w) => ({ id: newId("w"), a: { p: map.get(w.a.p)!, pin: w.a.pin }, b: { p: map.get(w.b.p)!, pin: w.b.pin } }))], labels: { ...d.schematic.labels, ...Object.fromEntries(Object.entries(m.labels).map(([k, val]) => { const [pid, pn] = k.split(":"); return [`${map.get(pid)}:${pn}`, val]; })) } } }; });
  const addCustom = () => {
    const pins = form.pins.split(",").map((s) => { const [name, t] = s.trim().split(":"); const type = (["passive", "input", "output", "io", "power", "ground", "source", "nc"].includes(t) ? t : "passive") as PinType; return { name: name || "P", type }; });
    const part: ElPart = { id: newId("cust"), name: form.name, category: form.category, dims: [form.w, form.l, form.h], pins, v: form.vmax > 0 ? [form.vmin, form.vmax] : undefined, iTyp: form.i, fp: form.fp, massG: form.mass, mount: "internal", sim: form.sim, custom: true, note: "User-defined component (unverified)" };
    commit("Add custom component", (d) => ({ ...d, customParts: [...d.customParts, part] })); setSelE(part.id); toast("Custom component created");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 8 }}>
      <Tabs tabs={[["elec", `Electronics (${all.length})`], ["violin", `Violin parts (${VIOLIN_LIB.length})`], ["mats", "Materials"], ["modules", "Modules & custom"]]} value={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 8, paddingTop: 8 }}>
        {tab === "elec" && <>
          <div className="panel" style={{ width: 340, flex: "none", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 8, display: "flex", gap: 4 }}><input className="input" placeholder="Search name, interface…" value={q} onChange={(x) => setQ(x.target.value)} /><select className="input" style={{ width: 120 }} value={cat} onChange={(x) => setCat(x.target.value)}><option>All</option>{[...EL_CATEGORIES, "Custom"].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div style={{ overflow: "auto", flex: 1 }}>{list.map((p) => <div key={p.id} className="row-hover" onClick={() => setSelE(p.id)} style={{ padding: "4px 10px", cursor: "pointer", background: selE === p.id ? "color-mix(in srgb, var(--accent) 18%, transparent)" : undefined }}>{p.name}<div className="muted" style={{ fontSize: 10 }}>{p.category}{p.iface ? ` · ${p.iface}` : ""}</div></div>)}</div>
          </div>
          <div className="panel" style={{ flex: 1, padding: 12, overflow: "auto" }}>
            {e && <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ fontSize: 17, fontWeight: 700 }}>{e.name}</h2><Prov kind="calc" /><span className="badge b-approx" title="Catalog values are typical values, not vendor-certified">typical values</span></div>
              <div className="muted">{e.category}{e.mfr ? ` · ${e.mfr}` : ""} · datasheet: <i>none attached</i></div>
              {e.note && <div style={{ margin: "6px 0" }} className="sev-warning">{e.note}</div>}
              <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
                <button className="btn btn-primary" onClick={() => go("electronics")}>Open Schematic Editor</button>
                {e.fp !== "none" && <button className="btn" onClick={() => { const pl: Placed = { id: newId("pl"), lib: e.id, label: e.name.split(" (")[0], pos: [0, 0, 70], rotY: 0, face: "top" }; commit(`Place ${e.name}`, (d) => ({ ...d, placed: [...d.placed, pl] })); set({ selection: pl.id }); go("cad"); }}>Place in 3-D model</button>}
              </div>
              <table className="t" style={{ maxWidth: 560 }}><tbody>
                {([["Dimensions W×L×H", `${e.dims.join(" × ")} mm`], ["Mass", `${e.massG} g`], ["Supply voltage", e.v ? `${e.v[0]} – ${e.v[1]} V` : "—"], ["Typical current", e.iTyp != null ? `${e.iTyp} mA` : "—"], ["Max current", e.iMax != null ? `${e.iMax} mA` : "—"], ["Typical power @3.3 V", e.iTyp != null ? `${(e.iTyp * 3.3).toFixed(1)} mW` : "—"], ["Interface", e.iface ?? "—"], ["Footprint", e.fp], ["Thermal Rθ (assumed)", e.thermalRth ? `${e.thermalRth} K/W` : "—"], ["Mount", e.mount === "internal" ? "inside cavity" : "surface / panel"], ["Simulation model", e.sim === "NONE" ? "none (connectivity/BOM only)" : e.sim]] as [string, string][]).map(([k, val]) => <tr key={k}><td className="muted">{k}</td><td>{val}</td></tr>)}
              </tbody></table>
              <div className="h-title" style={{ margin: "12px 0 4px" }}>Compatibility with this project (screening only)</div>
              <div style={{ fontSize: 12 }}>{compat(e, 3.3, "3.3 V rail")}<br />{compat(e, v["el.battery.v"], "Battery")}</div>
              <div className="h-title" style={{ margin: "12px 0 4px" }}>Pinout</div>
              <table className="t" style={{ maxWidth: 360 }}><thead><tr><th>#</th><th>Name</th><th>Type</th></tr></thead><tbody>{e.pins.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p.name}</td><td className="muted">{p.type}</td></tr>)}</tbody></table>
              {e.custom && <button className="btn" style={{ marginTop: 8, color: "var(--danger)" }} onClick={() => commit("Delete custom part", (d) => ({ ...d, customParts: d.customParts.filter((c) => c.id !== e.id) }))}>Delete custom component</button>}
            </>}
          </div>
        </>}
        {tab === "violin" && <>
          <div className="panel" style={{ width: 280, flex: "none", overflow: "auto" }}>{VIOLIN_LIB.map((p) => <div key={p.id} className="row-hover" onClick={() => setSelV(p.id)} style={{ padding: "5px 10px", cursor: "pointer", background: selV === p.id ? "color-mix(in srgb, var(--accent) 18%, transparent)" : undefined }}>{p.name}<div className="muted" style={{ fontSize: 10 }}>{p.category}</div></div>)}</div>
          <div className="panel" style={{ flex: 1, padding: 12, overflow: "auto" }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>{vp.name}</h2><div className="muted">{vp.desc}</div>
            <div className="h-title" style={{ margin: "10px 0 4px" }}>Specification</div>{vp.spec.map((s, i) => <div key={i}>• {s}</div>)}
            <div className="muted" style={{ marginTop: 6 }}>Reference mass {vp.massG} g · material {vp.matParam ? MATERIALS[Math.round(v[vp.matParam])].name : "per variant"}</div>
            <div className="h-title" style={{ margin: "10px 0 4px" }}>Connection points / joints</div>{vp.joints.map((j) => <div key={j.id}><span className="badge b-calc">{j.kind}</span> → {j.to} <span className="muted">{j.note}</span></div>)}
            <div className="h-title" style={{ margin: "10px 0 4px" }}>Assembly rules</div>{vp.rules.length ? vp.rules.map((r, i) => <div key={i}>• {r}</div>) : <div className="muted">Standard joint rules apply (see joints).</div>}
            <div className="h-title" style={{ margin: "10px 0 4px" }}>Variants (replace without rebuilding)</div>{vp.variants.map((x) => <div key={x.key}>{x.label}{x.massG ? ` · ${x.massG} g` : ""}</div>)}
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => { set({ selection: `inst_${vp.id}` }); go("cad"); }}>Select in CAD</button>
          </div>
        </>}
        {tab === "mats" && <div className="panel" style={{ flex: 1, padding: 12, overflow: "auto" }}>
          <table className="t"><thead><tr><th>Material</th><th>ρ kg/m³</th><th>E∥ GPa</th><th>E⊥ GPa</th><th>Loss η</th><th>Process</th><th>Note</th></tr></thead><tbody>{MATERIALS.map((m) => <tr key={m.id}><td>{m.name}</td><td className="mono">{m.density}</td><td className="mono">{m.eL}</td><td className="mono">{m.eC}</td><td className="mono">{m.loss}</td><td>{m.process}</td><td className="muted">{m.note}</td></tr>)}</tbody></table>
          <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>Typical literature values; wood varies strongly between specimens. Measure density and stiffness of the actual billet before relying on acoustic estimates.</div>
        </div>}
        {tab === "modules" && <div style={{ display: "flex", gap: 8, flex: 1 }}>
          <div className="panel" style={{ flex: 1, padding: 12, overflow: "auto" }}>
            <Section title="Reusable electronic modules (saved from the current schematic)" right={<button className="btn btn-primary" onClick={saveModule}>Save current schematic as module</button>}>
              {mods.length === 0 && <div className="muted">No modules saved yet.</div>}
              {mods.map((m) => <div key={m.id} className="panel2" style={{ padding: 8, margin: "4px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span><b>{m.name}</b> <span className="muted">{m.parts.length} parts, {m.wires.length} wires</span></span><span><button className="btn" onClick={() => insertModule(m)}>Insert</button> <button className="btn" onClick={() => { const n = mods.filter((x) => x.id !== m.id); setMods(n); localStorage.setItem("iaz.modules", JSON.stringify(n)); }}>Delete</button></span></div>)}
            </Section>
          </div>
          <div className="panel" style={{ width: 380, flex: "none", padding: 12, overflow: "auto" }}>
            <div className="h-title">Create custom component</div>
            {([["name", "Name"], ["category", "Category"], ["fp", "Footprint name"]] as const).map(([k, l]) => <div key={k}><label className="muted">{l}</label><input className="input" value={form[k]} onChange={(x) => setForm({ ...form, [k]: x.target.value })} /></div>)}
            <label className="muted">Pins (name:type, comma separated) — types: passive,input,output,io,power,ground,source,nc</label><textarea className="input" rows={2} value={form.pins} onChange={(x) => setForm({ ...form, pins: x.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>{(["w", "l", "h", "vmin", "vmax", "i", "mass"] as const).map((k) => <div key={k}><label className="muted">{k}</label><input className="input" type="number" value={form[k]} onChange={(x) => setForm({ ...form, [k]: Number(x.target.value) })} /></div>)}</div>
            <label className="muted">Simulation model</label><select className="input" value={form.sim} onChange={(x) => setForm({ ...form, sim: x.target.value as SimKind })}>{["NONE", "R", "C", "L", "D", "V"].map((s) => <option key={s}>{s}</option>)}</select>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={addCustom}>Create</button>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Dimensions in mm, voltage in V, current in mA. Custom parts are marked unverified. Use the Electronics library tab to inspect it.</div>
          </div>
        </div>}
      </div>
    </div>
  );
}
