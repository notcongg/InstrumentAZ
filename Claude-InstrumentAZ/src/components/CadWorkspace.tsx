"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { EL_LIBRARY, getElPart, MATERIALS, VIOLIN_LIB } from "@/lib/iaz/catalog";
import { newId, Placed, Primitive, V3 } from "@/lib/iaz/doc";
import { buildModel, checkFit, mechanicalCollisions, placedDims, wiringOf } from "@/lib/iaz/geometry";
import { PARAM_MAP } from "@/lib/iaz/params";
import { commit, getState, redo, set, undo, useDoc, useStore, useVals, toast } from "@/lib/iaz/store";
import { CtxItem, CtxMenu, IssueList, NumInput, ParamRow, Prov, Resizable, Section } from "./ui";
import type { Display, SelMode, Tool } from "./Viewport3D";

const Viewport3D = dynamic(() => import("./Viewport3D"), { ssr: false });
const KEY_PARAMS: Record<string, string[]> = {
  top: ["geom.topThickness", "geom.topArch", "geom.bodyLength", "geom.upperBout", "geom.lowerBout", "geom.cBout"], back: ["geom.backThickness", "geom.backArch", "geom.bodyLength"], ribs: ["geom.ribHeight", "geom.ribThickness"],
  neck: ["geom.neckAngle", "geom.neckLength"], fingerboard: ["geom.fbLength", "geom.fbWidthNut", "geom.fbWidthEnd", "geom.fbRadius"], nut: ["geom.nutHeight", "geom.stringSpacingNut"],
  bridge: ["geom.bridgeHeight", "geom.bridgeWidth", "geom.bridgeThickness", "geom.stopLength", "geom.stringSpacingBridge"], tailpiece: ["geom.afterlength", "geom.tailpieceLength", "geom.tailpieceHeight"],
  soundpost: ["geom.soundpostDia", "geom.soundpostBehind", "geom.soundpostX"], bassbar: ["geom.bassbarLength", "geom.bassbarHeight", "geom.bassbarWidth", "geom.bassbarX"], fholes: ["geom.fholeLength", "geom.fholeSep"],
  strings: ["geom.vibLength"], pegs: [], scroll: [], chinrest: [], tuners: [],
};
const V3Edit = ({ v, onChange, step = 0.5 }: { v: V3; onChange: (v: V3) => void; step?: number }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>{[0, 1, 2].map((i) => <NumInput key={i} value={v[i]} step={step} onChange={(n) => { const c = [...v] as V3; c[i] = n; onChange(c); }} />)}</div>
);

export default function CadWorkspace() {
  const doc = useDoc();
  const vals = useVals();
  const sel = useStore((s) => s.selection);
  const past = useStore((s) => s.past);
  const [display, setDisplay] = useState<Display>("shaded");
  const [ortho, setOrtho] = useState(false);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(5);
  const [tool, setTool] = useState<Tool>("select");
  const [selMode, setSelMode] = useState<SelMode>("object");
  const [mk, setMk] = useState<"distance" | "angle" | "radius">("distance");
  const [msg, setMsg] = useState("");
  const [wires, setWires] = useState(true);
  const [view, setView] = useState({ name: "iso", n: 0 });
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const [tab, setTab] = useState<"props" | "history" | "checks">("props");
  const [addLib, setAddLib] = useState("lipo");
  const model = useMemo(() => buildModel(doc, vals), [doc.values, doc.parts, doc.primitives, doc.placed, doc.customParts]); // eslint-disable-line react-hooks/exhaustive-deps
  const wiring = useMemo(() => wiringOf(doc, vals), [doc.placed, doc.schematic, doc.pcb, doc.values]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = useMemo(() => [...checkFit(doc, vals), ...mechanicalCollisions(model, doc)], [doc, vals, model]);
  const setSel = (id: string | null) => set({ selection: id });
  const part = doc.parts.find((p) => p.id === sel), prim = doc.primitives.find((p) => p.id === sel), placed = doc.placed.find((p) => p.id === sel);
  const lib = part ? VIOLIN_LIB.find((l) => l.id === part.lib) : undefined;
  const upPart = (id: string, patch: Partial<typeof doc.parts[number]>, label: string) => commit(label, (d) => ({ ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const upPrim = (id: string, patch: Partial<Primitive>, label = "Edit primitive", key?: string) => commit(label, (d) => ({ ...d, primitives: d.primitives.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), key);
  const upPl = (id: string, patch: Partial<Placed>, label = "Move component", key?: string) => commit(label, (d) => ({ ...d, placed: d.placed.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), key);
  const addPrim = (kind: Primitive["kind"], op: Primitive["op"] = "add") => {
    const p: Primitive = { id: newId("prim"), kind, name: `${op === "add" ? "" : "Cut "}${kind} ${doc.primitives.length + 1}`, size: [30, 30, 30], pos: [0, 0, 100], rot: [0, 0, 0], color: "#7aa2f7", op, visible: true };
    commit(`Add ${kind}`, (d) => ({ ...d, primitives: [...d.primitives, p], mode: "buildaz" }));
    setSel(p.id);
  };
  const del = (id: string) => commit("Delete object", (d) => ({ ...d, primitives: d.primitives.filter((p) => p.id !== id), placed: d.placed.filter((p) => p.id !== id) }));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (getState().ws !== "cad" || (e.target as HTMLElement)?.matches("input,textarea,select") || e.ctrlKey || e.metaKey) return;
      const m: Record<string, () => void> = { q: () => setTool("select"), w: () => setTool("move"), e: () => setTool("rotate"), r: () => setTool("scale"), m: () => setTool("measure"), f: () => setView((v) => ({ name: "fit", n: v.n + 1 })), Delete: () => sel && del(sel) };
      m[e.key]?.();
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTransform = (id: string, pos: V3, rot: V3, scale: V3) => {
    const pi = doc.parts.find((p) => p.id === id);
    if (pi) {
      const g = model.groups[pi.lib], b = g.userData.base as { x: number; y: number; z: number };
      const vo = pi.lib === "chinrest" ? [0, 0, 0] : (VIOLIN_LIB.find((l) => l.id === pi.lib)?.variants.find((x) => x.key === pi.variant)?.offset ?? [0, 0, 0]);
      upPart(id, { offset: [pos[0] - b.x - vo[0], pos[1] - b.y - vo[1], pos[2] - b.z - vo[2]].map((x) => Math.round(x * 100) / 100) as V3 }, `Move ${pi.lib}`);
    } else if (doc.primitives.some((p) => p.id === id)) upPrim(id, { pos, rot, size: scale }, "Transform primitive");
    else if (doc.placed.some((p) => p.id === id)) upPl(id, { pos: pos.map((x) => Math.round(x * 100) / 100) as V3 });
  };
  const treeRow = (id: string, label: string, visible: boolean, onVis: () => void, extra?: React.ReactNode, items?: CtxItem[]) => (
    <div key={id} className="row-hover" onClick={() => setSel(id)} onContextMenu={(e) => { e.preventDefault(); setSel(id); setCtx({ x: e.clientX, y: e.clientY, items: items ?? [] }); }}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", cursor: "pointer", background: sel === id ? "color-mix(in srgb, var(--accent) 20%, transparent)" : undefined, opacity: visible ? 1 : 0.5 }}>
      <input type="checkbox" checked={visible} onClick={(e) => e.stopPropagation()} onChange={onVis} title="Visible / enabled" />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>{extra}
    </div>
  );
  const tb = (t: Tool, l: string, tip: string) => <button key={t} className={`btn ${tool === t ? "btn-active" : ""}`} title={tip} onClick={() => setTool(t)}>{l}</button>;

  return (
    <div style={{ display: "flex", height: "100%", gap: 0, padding: 8 }}>
      <Resizable side="left" def={250} id="cad-left">
        <div style={{ padding: 8, display: "flex", gap: 4 }}>
          <button className={`btn ${doc.mode === "assembly" ? "btn-active" : ""}`} style={{ flex: 1 }} onClick={() => commit("Mode: Component Assembly", (d) => ({ ...d, mode: "assembly" }))} title="Start from the violin parts library">Component Assembly</button>
          <button className={`btn ${doc.mode === "buildaz" ? "btn-active" : ""}`} style={{ flex: 1 }} onClick={() => commit("Mode: Build A–Z", (d) => ({ ...d, mode: "buildaz" }))} title="Free modelling; library parts remain optional">Build A–Z</button>
        </div>
        {doc.mode === "buildaz" && (
          <Section title="Build A–Z toolbox">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(["box", "cylinder", "sphere", "cone"] as const).map((k) => <button key={k} className="btn" onClick={() => addPrim(k)}>+ {k}</button>)}
              <button className="btn" onClick={() => addPrim("box", "subtract")} title="Cut tool (boolean not implemented — shown as ghost)">+ cut box</button>
            </div>
            <button className="btn" style={{ marginTop: 6, width: "100%" }} onClick={() => { commit("Empty workspace", (d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, enabled: false })), primitives: [], placed: [] })); toast("Workspace cleared (library parts disabled, not deleted)"); }}>Start with empty workspace</button>
            <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Mix freely: re-enable library parts below. Boolean cut/union: <Prov kind="unsup" /> needs OCCT.</div>
          </Section>
        )}
        <Section title="Object tree" grow>
          <div style={{ margin: "0 -10px" }}>
            <div className="muted" style={{ padding: "2px 8px" }}>Violin ({doc.parts.filter((p) => p.enabled).length}/{doc.parts.length})</div>
            {doc.parts.map((p) => { const l = VIOLIN_LIB.find((x) => x.id === p.lib)!; return treeRow(p.id, l.name + (p.variant !== "std" ? ` · ${l.variants.find((v) => v.key === p.variant)?.label}` : ""), p.enabled, () => upPart(p.id, { enabled: !p.enabled }, `${p.enabled ? "Disable" : "Enable"} ${l.name}`), p.locked ? <span title="locked">🔒</span> : null, [
              { label: p.locked ? "Unlock" : "Lock", run: () => upPart(p.id, { locked: !p.locked }, "Lock part") }, { label: "Reset offset", run: () => upPart(p.id, { offset: [0, 0, 0] }, "Reset offset") }, { label: "Isolate (hide others)", run: () => commit("Isolate", (d) => ({ ...d, parts: d.parts.map((q) => ({ ...q, enabled: q.id === p.id })) })) }, { label: "Show all", run: () => commit("Show all", (d) => ({ ...d, parts: d.parts.map((q) => ({ ...q, enabled: true })) })) }]); })}
            <div className="muted" style={{ padding: "6px 8px 2px" }}>Custom geometry ({doc.primitives.length})</div>
            {doc.primitives.map((p) => treeRow(p.id, `${p.name}${p.op === "subtract" ? " (cut)" : ""}`, p.visible, () => upPrim(p.id, { visible: !p.visible }), undefined, [{ label: "Duplicate", run: () => commit("Duplicate", (d) => ({ ...d, primitives: [...d.primitives, { ...p, id: newId("prim"), name: p.name + " copy", pos: [p.pos[0] + 10, p.pos[1], p.pos[2]] }] })) }, { label: "Delete", danger: true, run: () => del(p.id) }]))}
            <div className="muted" style={{ padding: "6px 8px 2px" }}>Electronics ({doc.placed.length})</div>
            {doc.placed.map((p) => treeRow(p.id, p.label, true, () => undefined, undefined, [{ label: "Delete", danger: true, run: () => del(p.id) }]))}
          </div>
        </Section>
      </Resizable>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, padding: "0 6px" }}>
        <div className="panel" style={{ display: "flex", gap: 4, padding: 6, flexWrap: "wrap", alignItems: "center" }}>
          {tb("select", "Select (Q)", "Select objects / faces / edges / vertices")}{tb("move", "Move (W)", "Translate gizmo")}{tb("rotate", "Rotate (E)", "Rotate gizmo — primitives only")}{tb("scale", "Scale (R)", "Scale gizmo — primitives only")}{tb("measure", "Measure (M)", "Distance / angle / radius")}
          <span className="muted">|</span>
          <select className="input" style={{ width: 90 }} value={selMode} onChange={(e) => setSelMode(e.target.value as SelMode)} title="Pick mode"><option value="object">Object</option><option value="face">Face</option><option value="edge">Edge</option><option value="vertex">Vertex</option></select>
          {tool === "measure" && <select className="input" style={{ width: 90 }} value={mk} onChange={(e) => setMk(e.target.value as typeof mk)}><option value="distance">Distance</option><option value="angle">Angle</option><option value="radius">Radius</option></select>}
          <span className="muted">|</span>
          <select className="input" style={{ width: 100 }} value={display} onChange={(e) => setDisplay(e.target.value as Display)} title="Display mode"><option value="shaded">Shaded</option><option value="solid">Solid (flat)</option><option value="wire">Wireframe</option><option value="xray">X-ray</option><option value="edges">Shaded + edges</option></select>
          <button className={`btn ${ortho ? "btn-active" : ""}`} onClick={() => setOrtho(!ortho)}>{ortho ? "Orthographic" : "Perspective"}</button>
          <button className={`btn ${grid ? "btn-active" : ""}`} onClick={() => setGrid(!grid)}>Grid</button>
          <select className="input" style={{ width: 82 }} value={snap} onChange={(e) => setSnap(Number(e.target.value))} title="Snap increment"><option value={0}>Snap off</option><option value={1}>1 mm</option><option value={5}>5 mm</option><option value={10}>10 mm</option></select>
          <button className={`btn ${wires ? "btn-active" : ""}`} onClick={() => setWires(!wires)} title="Cables derived from schematic nets">Wiring</button>
          {["top", "front", "side", "iso", "fit"].map((n) => <button key={n} className="btn" onClick={() => setView((v) => ({ name: n, n: v.n + 1 }))}>{n}</button>)}
          <span style={{ marginLeft: "auto" }}><Prov kind="visual" /></span>
        </div>
        <div className="panel" style={{ flex: 1, position: "relative", overflow: "hidden" }} onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, items: [{ label: "Fit view", run: () => setView((v) => ({ name: "fit", n: v.n + 1 })) }, { label: "Top view", run: () => setView((v) => ({ name: "top", n: v.n + 1 })) }, { label: "Deselect", run: () => setSel(null) }, { label: "Undo", run: undo }, { label: "Redo", run: redo }] }); }}>
          <Viewport3D model={model} wires={wiring.segs} showWires={wires} display={display} ortho={ortho} showGrid={grid} snap={snap} tool={tool} selMode={selMode} measureKind={mk} selected={sel} onSelect={setSel} onTransform={onTransform} onMeasure={setMsg} viewCmd={view} />
          <div style={{ position: "absolute", left: 10, bottom: 8, right: 10, pointerEvents: "none", fontSize: 11 }} className="mono">
            <span style={{ background: "var(--panel)", padding: "2px 6px", borderRadius: 4 }}>{msg || `Units mm • +X right, +Y up (top plate), +Z toward scroll • ${issues.filter((i) => i.severity === "error").length} errors, ${issues.filter((i) => i.severity === "warning").length} warnings`}</span>
          </div>
          <div style={{ position: "absolute", right: 10, top: 8, pointerEvents: "none", fontSize: 10, textAlign: "right" }} className="muted">WebGL preview renderer<br />Native build: Direct3D 12 + OCCT (not built here)</div>
        </div>
      </div>

      <Resizable side="right" def={320} id="cad-right">
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          {(["props", "checks", "history"] as const).map((t) => <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>{t === "props" ? "Properties" : t === "checks" ? `Checks (${issues.length})` : `History (${past.length})`}</button>)}
        </div>
        {tab === "history" && <Section title="Modeling history" right={<span><button className="btn" onClick={undo}>Undo</button> <button className="btn" onClick={redo}>Redo</button></span>}>
          {past.length === 0 ? <div className="muted">No operations yet.</div> : [...past].reverse().map((e, i) => <div key={i} className="mono" style={{ padding: "2px 0" }}>{past.length - i}. {e.label}</div>)}
        </Section>}
        {tab === "checks" && <Section title="Fit, collision and constraint checks"><IssueList issues={issues} />
          <div className="h-title" style={{ marginTop: 10 }}>Wiring (physical)</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Dashed = cable derived from schematic nets; green = PCB trace; unplaced parts have logical connectivity only.</div>
          <table className="t"><tbody>{wiring.segs.slice(0, 40).map((w, i) => <tr key={i}><td>{w.net}</td><td>{w.from}→{w.to}</td><td>{w.kind}</td><td className="mono">{w.lengthMm.toFixed(0)} mm</td></tr>)}</tbody></table>
          {wiring.unplaced.length > 0 && <div className="muted" style={{ marginTop: 4 }}>No 3-D position for: {wiring.unplaced.join(", ")}</div>}
        </Section>}
        {tab === "props" && (
          <div>
            {!sel && <Section title="Selection"><div className="muted">Click an object in the viewport or tree. Use the Library workspace to add electronics. Parameters edited here are the same as in Engineering.</div></Section>}
            {part && lib && <>
              <Section title={lib.name} right={<Prov kind="visual" />}>
                <div className="muted" style={{ marginBottom: 6 }}>{lib.desc}</div>
                {lib.matParam && <ParamRow id={lib.matParam} />}
                <label className="muted">Replace with variant (no rebuild)</label>
                <select className="input" value={part.variant} onChange={(e) => upPart(part.id, { variant: e.target.value }, `Replace ${lib.name}`)}>{lib.variants.map((v) => <option key={v.key} value={v.key}>{v.label}{v.massG ? ` · ${v.massG} g` : ""}</option>)}</select>
                <label className="muted" style={{ display: "block", marginTop: 6 }}>Offset from design position (mm)</label>
                <V3Edit v={part.offset} onChange={(o) => upPart(part.id, { offset: o }, `Offset ${lib.name}`)} />
                <label style={{ display: "flex", gap: 6, marginTop: 6 }}><input type="checkbox" checked={part.locked} onChange={() => upPart(part.id, { locked: !part.locked }, "Lock")} />Lock position</label>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <button className="btn" onClick={() => { commit("Save part config", (d) => ({ ...d, savedConfigs: [...d.savedConfigs, { id: newId("cfg"), name: `${lib.name} · ${lib.variants.find((v) => v.key === part.variant)?.label}`, lib: part.lib, variant: part.variant, offset: part.offset }] })); toast("Configuration saved"); }}>Save configuration</button>
                </div>
                {doc.savedConfigs.filter((c) => c.lib === part.lib).map((c) => <div key={c.id} className="row-hover" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>{c.name}</span><button className="btn" onClick={() => upPart(part.id, { variant: c.variant, offset: c.offset }, "Apply saved config")}>Apply</button></div>)}
              </Section>
              <Section title="Key parameters (shared with Engineering)">{KEY_PARAMS[part.lib]?.map((id) => <ParamRow key={id} id={id} />)}{!KEY_PARAMS[part.lib]?.length && <div className="muted">No parametric dimensions for this part yet.</div>}</Section>
              <Section title="Connections & assembly rules">
                {lib.joints.map((j) => <div key={j.id} style={{ padding: "2px 0" }}><span className="badge b-calc">{j.kind}</span> → <b>{j.to}</b> <span className="muted">{j.note}</span></div>)}
                {lib.rules.map((r, i) => <div key={i} className="muted" style={{ fontSize: 11 }}>• {r}</div>)}
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Specs: {lib.spec.join(" · ")}</div>
              </Section>
            </>}
            {prim && <Section title={prim.name} right={<Prov kind="visual" />}>
              <input className="input" value={prim.name} onChange={(e) => upPrim(prim.id, { name: e.target.value }, "Rename", `n${prim.id}`)} />
              <label className="muted">Size / scale (mm)</label><V3Edit v={prim.size} onChange={(s) => upPrim(prim.id, { size: s }, "Resize primitive", `s${prim.id}`)} />
              <label className="muted">Position (mm)</label><V3Edit v={prim.pos} onChange={(s) => upPrim(prim.id, { pos: s }, "Move primitive", `p${prim.id}`)} />
              <label className="muted">Rotation (°)</label><V3Edit v={prim.rot} step={1} onChange={(s) => upPrim(prim.id, { rot: s }, "Rotate primitive", `r${prim.id}`)} />
              <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}><input type="color" value={prim.color} onChange={(e) => upPrim(prim.id, { color: e.target.value })} /><select className="input" value={prim.op} onChange={(e) => upPrim(prim.id, { op: e.target.value as Primitive["op"] })}><option value="add">Add (union)</option><option value="subtract">Subtract (ghost)</option></select></div>
              {prim.op === "subtract" && <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>Boolean subtract is not implemented in this build; the cutter is displayed as a red ghost only.</div>}
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => upPrim(prim.id, { pos: prim.pos.map((x) => Math.round(x / 5) * 5) as V3 }, "Snap to grid")}>Snap to 5 mm</button>
                {doc.parts.filter((p) => p.enabled).slice(0, 0).map(() => null)}
                <button className="btn" onClick={() => upPrim(prim.id, { pos: [0, prim.pos[1], prim.pos[2]] }, "Centre on axis")}>Centre X=0</button>
                <button className="btn" onClick={() => upPrim(prim.id, { pos: [prim.pos[0], prim.pos[1], model.layout.bridgeZ] }, "Align to bridge Z")}>Align to bridge Z</button>
                <button className="btn" onClick={() => del(prim.id)} style={{ color: "var(--danger)" }}>Delete</button>
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Constraints implemented: grid snapping + axis/bridge alignment. General parametric constraint solver: not implemented.</div>
            </Section>}
            {placed && <Section title={placed.label} right={<Prov kind="calc" />}>
              {(() => { const e = getElPart(placed.lib, doc.customParts); const d = placedDims(placed, vals, doc.customParts); return <div className="muted" style={{ marginBottom: 6 }}>{e?.name ?? "Printed circuit board"} · {d.map((x) => x.toFixed(1)).join(" × ")} mm</div>; })()}
              <label className="muted">Centre position (mm)</label><V3Edit v={placed.pos} onChange={(s) => upPl(placed.id, { pos: s }, "Move component", `pl${placed.id}`)} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <select className="input" value={placed.rotY} onChange={(e) => upPl(placed.id, { rotY: Number(e.target.value) })}>{[0, 90, 180, 270].map((r) => <option key={r} value={r}>Rot {r}°</option>)}</select>
                <select className="input" value={placed.face} onChange={(e) => upPl(placed.id, { face: e.target.value as Placed["face"] })}><option value="top">Flat (face up)</option><option value="side">Side-mounted</option></select>
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Dimensions follow shared parameters (el.battery.*, el.pcb.*, el.oled.*). Changing them re-runs the fit checks automatically.</div>
              {(["pl_battery"].includes(placed.id)) && ["el.battery.w", "el.battery.l", "el.battery.h"].map((id) => <ParamRow key={id} id={id} />)}
              {placed.id === "pl_pcb" && ["el.pcb.w", "el.pcb.l", "el.pcb.h"].map((id) => <ParamRow key={id} id={id} />)}
              {placed.lib.startsWith("oled") && ["el.oled.w", "el.oled.h"].map((id) => <ParamRow key={id} id={id} />)}
              <button className="btn" style={{ marginTop: 8, color: "var(--danger)" }} onClick={() => del(placed.id)}>Remove from instrument</button>
            </Section>}
            <Section title="Place electronic component">
              <div style={{ display: "flex", gap: 4 }}>
                <select className="input" value={addLib} onChange={(e) => setAddLib(e.target.value)}>{[...EL_LIBRARY, ...doc.customParts].filter((p) => p.fp !== "none").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <button className="btn" onClick={() => { const e = getElPart(addLib, doc.customParts)!; const pl: Placed = { id: newId("pl"), lib: addLib, label: e.name.split(" (")[0], pos: [0, 0, 70], rotY: 0, face: "top" }; commit(`Place ${e.name}`, (d) => ({ ...d, placed: [...d.placed, pl] })); setSel(pl.id); }}>Place</button>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Placed parts get collision / bay / maintainability checks and appear in wiring. Materials in use: {MATERIALS.length} (see Engineering).</div>
            </Section>
            <span style={{ display: "none" }}>{PARAM_MAP["geom.bodyLength"].label}</span>
          </div>
        )}
      </Resizable>
      {ctx && <CtxMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
void useRef;
