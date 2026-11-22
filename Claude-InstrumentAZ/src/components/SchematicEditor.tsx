"use client";
import { useMemo, useRef, useState } from "react";
import { EL_CATEGORIES, EL_LIBRARY, getElPart } from "@/lib/iaz/catalog";
import { buildNets, exampleCircuit, pinKey, runERC, symbolOf, toSpiceNetlist, PinRef, SchPart } from "@/lib/iaz/circuit";
import { defaultDoc, newId } from "@/lib/iaz/doc";
import { formatSI, parseSI } from "@/lib/iaz/si";
import { commit, toast, useDoc } from "@/lib/iaz/store";
import { download, IssueList, NumInput, Prov, Resizable, Section } from "./ui";

const NETCOL = ["#e8a33d", "#3dc2c0", "#f0524f", "#a78bfa", "#3fb27f", "#60a5fa", "#f472b6", "#facc15"];

export default function SchematicEditor() {
  const doc = useDoc();
  const sch = doc.schematic;
  const [sel, setSel] = useState<string | null>(null);
  const [pending, setPending] = useState<PinRef | null>(null);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [view, setView] = useState({ x: -20, y: -20, k: 1 });
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  const [mouse, setMouse] = useState<[number, number]>([0, 0]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const nets = useMemo(() => buildNets(sch, doc.customParts), [sch, doc.customParts]);
  const erc = useMemo(() => runERC(sch, doc.customParts), [sch, doc.customParts]);
  const part = sch.parts.find((p) => p.id === sel);
  const lp = part ? getElPart(part.lib, doc.customParts) : undefined;
  const lib = [...EL_LIBRARY, ...doc.customParts].filter((p) => (cat === "All" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const setSch = (label: string, fn: (s: typeof sch) => typeof sch, key?: string) => commit(label, (d) => ({ ...d, schematic: fn(d.schematic) }), key);
  const toWorld = (cx: number, cy: number): [number, number] => { const r = svg.current!.getBoundingClientRect(); return [(cx - r.left) / view.k + view.x, (cy - r.top) / view.k + view.y]; };
  const pinPos = (p: SchPart, i: number): [number, number] => { const e = getElPart(p.lib, doc.customParts)!; const s = symbolOf(e).pins[i]; return [p.x + s.x, p.y + s.y]; };
  const nextRef = (lib: string) => { const e = getElPart(lib, doc.customParts)!; const pre = { res: "R", cap: "C", capel: "C", ind: "L", diode: "D", led: "D", lipo: "BT", li18650: "BT", psu: "V", siggen: "G", gnd: "GND", pot: "RV", trim: "RV", sw: "SW", btn: "SW" }[lib] ?? (e.category === "Passive" ? "X" : "U"); return pre === "GND" ? "GND" : `${pre}${sch.parts.filter((p) => p.ref.startsWith(pre) && p.ref !== "GND").length + 1}`; };
  const addPart = (libId: string) => { const e = getElPart(libId, doc.customParts)!; const [wx, wy] = [view.x + 120 + (sch.parts.length % 5) * 30, view.y + 80 + (sch.parts.length % 7) * 20]; const p: SchPart = { id: newId("p"), lib: libId, ref: nextRef(libId), x: Math.round(wx / 10) * 10, y: Math.round(wy / 10) * 10, value: e.value, props: e.id === "siggen" ? { wave: "sine", amp: 0.5, freq: 440, offset: 0 } : undefined }; setSch(`Add ${e.name}`, (s) => ({ ...s, parts: [...s.parts, p] })); setSel(p.id); };
  const del = () => { if (!sel) return; setSch("Delete part", (s) => ({ ...s, parts: s.parts.filter((p) => p.id !== sel), wires: s.wires.filter((w) => w.a.p !== sel && w.b.p !== sel), labels: Object.fromEntries(Object.entries(s.labels).filter(([k]) => !k.startsWith(sel + ":"))) })); setSel(null); };
  const clickPin = (p: SchPart, i: number) => {
    const ref = { p: p.id, pin: i };
    if (!pending) return setPending(ref);
    if (pending.p === ref.p && pending.pin === ref.pin) return setPending(null);
    if (sch.wires.some((w) => (w.a.p === pending.p && w.a.pin === pending.pin && w.b.p === ref.p && w.b.pin === ref.pin) || (w.b.p === pending.p && w.b.pin === pending.pin && w.a.p === ref.p && w.a.pin === ref.pin))) { setPending(null); return; }
    setSch("Add wire", (s) => ({ ...s, wires: [...s.wires, { id: newId("w"), a: pending, b: ref }] })); setPending(null);
  };
  const onWheel = (e: React.WheelEvent) => { const k = Math.max(0.4, Math.min(2.5, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); const [wx, wy] = toWorld(e.clientX, e.clientY); const r = svg.current!.getBoundingClientRect(); setView({ k, x: wx - (e.clientX - r.left) / k, y: wy - (e.clientY - r.top) / k }); };
  const netNames = Array.from(nets.nets.keys());
  const colOf = (n?: string) => (n === "0" ? "#8a97aa" : NETCOL[Math.max(0, netNames.indexOf(n ?? "")) % NETCOL.length]);

  return (
    <div style={{ display: "flex", height: "100%", gap: 0 }}>
      <Resizable side="left" def={230} id="sch-left">
        <Section title="Component library" right={<span className="muted">{lib.length}</span>}>
          <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ marginTop: 4 }} value={cat} onChange={(e) => setCat(e.target.value)}><option>All</option>{[...EL_CATEGORIES, ...(doc.customParts.length ? ["Custom"] : [])].map((c) => <option key={c}>{c}</option>)}</select>
        </Section>
        <div style={{ overflow: "auto", flex: 1 }}>
          {lib.map((p) => <div key={p.id} className="row-hover" style={{ padding: "4px 10px", cursor: "pointer" }} onClick={() => addPart(p.id)} title={`${p.category} · ${p.pins.length} pins · ${p.sim === "NONE" ? "no sim model" : "simulated as " + p.sim}`}>{p.name}<span className="muted" style={{ fontSize: 10 }}> {p.sim !== "NONE" ? "●" : ""}</span></div>)}
        </div>
        <div style={{ padding: 8, borderTop: "1px solid var(--border)", display: "grid", gap: 4 }}>
          <div className="h-title">Examples (replace schematic)</div>
          {([["rc", "RC low-pass 1 kHz"], ["led", "LED + resistor"], ["preamp", "Op-amp preamp ×11"]] as const).map(([k, l]) => <button key={k} className="btn" onClick={() => { setSch(`Load example: ${l}`, () => exampleCircuit(k)); setSel(null); }}>{l}</button>)}
          <button className="btn" onClick={() => setSch("Load demo electronics", () => defaultDoc().schematic)}>Violin electronics demo</button>
          <button className="btn" onClick={() => setSch("Clear schematic", () => ({ parts: [], wires: [], labels: {} }))}>Clear</button>
        </div>
      </Resizable>
      <div style={{ flex: 1, minWidth: 0, position: "relative", margin: "0 6px" }} className="panel">
        <div style={{ position: "absolute", left: 8, top: 6, zIndex: 2, display: "flex", gap: 6, alignItems: "center" }}>
          <span className="badge b-visual">{pending ? "Click second pin to finish wire (Esc cancels)" : "Click a pin to start a wire • drag parts • Delete removes"}</span>
          <button className="btn" onClick={() => setView({ x: -20, y: -20, k: 1 })}>Reset view</button>
          <button className="btn" onClick={() => { download(`${doc.name}.cir`, toSpiceNetlist(sch, doc.customParts, { tstop: 0.005, dt: 1e-5 })); }}>Export SPICE</button>
        </div>
        <svg ref={svg} tabIndex={0} style={{ width: "100%", height: "100%", outline: "none", cursor: pan.current ? "grabbing" : "default" }}
          onKeyDown={(e) => { if (e.key === "Escape") setPending(null); if (e.key === "Delete" || e.key === "Backspace") { if (sel) del(); } }}
          onWheel={onWheel}
          onPointerDown={(e) => { if ((e.target as Element).tagName === "svg" || (e.target as Element).id === "bg") { setSel(null); pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.target as Element).setPointerCapture?.(e.pointerId); } svg.current?.focus(); }}
          onPointerMove={(e) => {
            setMouse(toWorld(e.clientX, e.clientY));
            if (pan.current) setView((v) => ({ ...v, x: pan.current!.vx - (e.clientX - pan.current!.x) / v.k, y: pan.current!.vy - (e.clientY - pan.current!.y) / v.k }));
            else if (drag.current) { const [wx, wy] = toWorld(e.clientX, e.clientY); const id = drag.current.id, nx = Math.round((wx - drag.current.dx) / 10) * 10, ny = Math.round((wy - drag.current.dy) / 10) * 10; const cur = sch.parts.find((p) => p.id === id); if (cur && (cur.x !== nx || cur.y !== ny)) setSch("Move part", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === id ? { ...p, x: nx, y: ny } : p)) }), `mv:${id}`); }
          }}
          onPointerUp={() => { pan.current = null; drag.current = null; }}>
          <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="var(--grid)" /></pattern></defs>
          <g transform={`scale(${view.k}) translate(${-view.x} ${-view.y})`}>
            <rect id="bg" x={view.x - 2000} y={view.y - 2000} width="6000" height="6000" fill="url(#g)" />
            {sch.wires.map((w) => {
              const a = sch.parts.find((p) => p.id === w.a.p), b = sch.parts.find((p) => p.id === w.b.p);
              if (!a || !b) return null;
              const [x1, y1] = pinPos(a, w.a.pin), [x2, y2] = pinPos(b, w.b.pin), mx = (x1 + x2) / 2;
              const net = nets.netOf.get(pinKey(a.id, w.a.pin));
              return <polyline key={w.id} points={`${x1},${y1} ${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={colOf(net)} strokeWidth={hoverNet === net ? 3.5 : 2} opacity={hoverNet && hoverNet !== net ? 0.3 : 1} style={{ cursor: "pointer" }} onPointerEnter={() => setHoverNet(net ?? null)} onPointerLeave={() => setHoverNet(null)} onDoubleClick={() => setSch("Delete wire", (s) => ({ ...s, wires: s.wires.filter((x) => x.id !== w.id) }))}><title>{`Net ${net} — double-click to delete`}</title></polyline>;
            })}
            {sch.parts.map((p) => {
              const e = getElPart(p.lib, doc.customParts);
              if (!e) return null;
              const s = symbolOf(e), two = e.pins.length === 2, isG = e.sim === "GND";
              return (
                <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
                  <g onPointerDown={(ev) => { ev.stopPropagation(); setSel(p.id); const [wx, wy] = toWorld(ev.clientX, ev.clientY); drag.current = { id: p.id, dx: wx - p.x, dy: wy - p.y }; svg.current?.focus(); }} style={{ cursor: "move" }}>
                    {isG ? <path d={`M0 15 H15 M15 5 V25 M21 9 V21 M27 13 V17`} stroke="var(--text)" strokeWidth="2" fill="none" /> :
                      <rect width={s.w} height={s.h} rx="4" fill="var(--panel2)" stroke={sel === p.id ? "var(--accent)" : "var(--muted)"} strokeWidth={sel === p.id ? 2.5 : 1.3} />}
                    {!isG && <text x={s.w / 2} y={two ? s.h / 2 + 4 : 14} fontSize="10" textAnchor="middle" fill="var(--text)" fontWeight="600" style={{ pointerEvents: "none" }}>{p.ref}{two && p.value != null && e.unit ? ` ${formatSI(p.value, e.unit)}` : ""}</text>}
                    {!isG && !two && <text x={s.w / 2} y={s.h + 12} fontSize="9" textAnchor="middle" fill="var(--muted)" style={{ pointerEvents: "none" }}>{e.name.split(" (")[0].slice(0, 26)}{p.value != null && e.unit ? ` ${formatSI(p.value, e.unit)}` : ""}</text>}
                  </g>
                  {s.pins.map((pin, i) => {
                    const net = nets.netOf.get(pinKey(p.id, i)), cnt = net ? nets.nets.get(net)?.length ?? 0 : 0;
                    const lab = sch.labels[pinKey(p.id, i)];
                    return (
                      <g key={i} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => clickPin(p, i)} style={{ cursor: "crosshair" }} onPointerEnter={() => setHoverNet(net ?? null)} onPointerLeave={() => setHoverNet(null)}>
                        <circle cx={pin.x} cy={pin.y} r="5" fill={pending?.p === p.id && pending.pin === i ? "var(--accent)" : cnt > 1 ? "var(--ok)" : pin.def.type === "nc" ? "var(--muted)" : "var(--danger)"} opacity={0.9}><title>{`${e.pins[i].name} (${pin.def.type}) net: ${net ?? "-"}`}</title></circle>
                        {!two && !isG && <text x={pin.side === "l" ? pin.x + 8 : pin.x - 8} y={pin.y + 3} fontSize="9" textAnchor={pin.side === "l" ? "start" : "end"} fill="var(--text)" style={{ pointerEvents: "none" }}>{pin.def.name}</text>}
                        {lab && <text x={pin.side === "l" ? pin.x - 8 : pin.x + 8} y={pin.y - 6} fontSize="9" textAnchor={pin.side === "l" ? "end" : "start"} fill="var(--accent2)" fontWeight="700" style={{ pointerEvents: "none" }}>{lab}</text>}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {pending && (() => { const a = sch.parts.find((p) => p.id === pending.p); if (!a) return null; const [x, y] = pinPos(a, pending.pin); return <line x1={x} y1={y} x2={mouse[0]} y2={mouse[1]} stroke="var(--accent)" strokeDasharray="4 3" />; })()}
          </g>
        </svg>
      </div>
      <Resizable side="right" def={310} id="sch-right">
        <Section title="Selected part">
          {!part || !lp ? <div className="muted">Select a part. Pins: green = connected, red = unconnected. Net names (labels) merge nets with equal names; label “GND” = ground.</div> : <>
            <div style={{ display: "flex", gap: 4 }}><input className="input" style={{ width: 70 }} value={part.ref} onChange={(e) => setSch("Rename", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === part.id ? { ...p, ref: e.target.value } : p)) }), `ref:${part.id}`)} /><div style={{ flex: 1 }}><b>{lp.name}</b></div></div>
            <div className="muted" style={{ fontSize: 11, margin: "4px 0" }}>{lp.category} · footprint {lp.fp} · {lp.sim === "NONE" ? <span className="sev-warning">no simulation model</span> : <>simulated as {lp.sim} <Prov kind="approx" /></>}</div>
            {lp.unit && lp.sim !== "GND" && <div><label className="muted">{lp.sim === "V" ? "DC value" : "Value"} ({lp.unit})</label><input className="input" defaultValue={formatSI(part.value ?? lp.value ?? 0, "").trim()} key={part.id + (part.value ?? 0)} onBlur={(e) => { const v = parseSI(e.target.value); if (v != null) setSch("Set value", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === part.id ? { ...p, value: v } : p)) })); else toast("Invalid value (use e.g. 4.7k, 100n)"); }} /></div>}
            {lp.sim === "V" && lp.id !== "psu" && lp.id !== "lipo" && lp.id !== "li18650" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
              <div style={{ gridColumn: "1/3" }}><label className="muted">Waveform</label><select className="input" value={part.props?.wave ?? "dc"} onChange={(e) => setSch("Waveform", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === part.id ? { ...p, props: { ...p.props, wave: e.target.value as "dc" } } : p)) }))}><option value="dc">DC</option><option value="sine">Sine</option><option value="square">Square</option><option value="triangle">Triangle</option></select></div>
              {([["amp", "Amplitude (V peak)"], ["freq", "Frequency (Hz)"], ["offset", "Offset (V)"], ["duty", "Duty (0–1)"]] as const).map(([k, l]) => <div key={k}><label className="muted" style={{ fontSize: 10 }}>{l}</label><NumInput value={part.props?.[k] ?? (k === "duty" ? 0.5 : k === "freq" ? 440 : 0)} onChange={(n) => setSch("Source param", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === part.id ? { ...p, props: { ...p.props, [k]: n } } : p)) }), `sp:${k}${part.id}`)} /></div>)}
            </div>}
            {(lp.sim === "POT") && <div><label className="muted">Wiper position 0–1</label><NumInput value={part.props?.pos ?? 0.5} min={0} max={1} step={0.01} onChange={(n) => setSch("Wiper", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === part.id ? { ...p, props: { ...p.props, pos: n } } : p)) }), `pos:${part.id}`)} /></div>}
            {["R", "C", "L", "POT"].includes(lp.sim) && <div><label className="muted">Tolerance ± %</label><NumInput value={part.props?.tol ?? 0} min={0} max={50} onChange={(n) => setSch("Tolerance", (s) => ({ ...s, parts: s.parts.map((p) => (p.id === part.id ? { ...p, props: { ...p.props, tol: n } } : p)) }), `tl:${part.id}`)} /></div>}
            <div className="h-title" style={{ marginTop: 8 }}>Pins & net labels</div>
            {lp.pins.map((pin, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 4, alignItems: "center", margin: "2px 0" }}><span title={pin.type}>{pin.name} <span className="muted" style={{ fontSize: 9 }}>{pin.type}</span></span><input className="input" placeholder={nets.netOf.get(pinKey(part.id, i)) ?? "net label"} value={sch.labels[pinKey(part.id, i)] ?? ""} onChange={(e) => setSch("Net label", (s) => ({ ...s, labels: { ...s.labels, [pinKey(part.id, i)]: e.target.value } }), `lb:${part.id}${i}`)} /></div>)}
            <button className="btn" style={{ marginTop: 8, color: "var(--danger)" }} onClick={del}>Delete part</button>
          </>}
        </Section>
        <Section title={`Electrical Rules Check (${erc.filter((i) => i.severity !== "info").length})`}><IssueList issues={erc} /></Section>
        <Section title={`Nets (${nets.nets.size})`}>
          <div style={{ maxHeight: 160, overflow: "auto" }}>{Array.from(nets.nets.entries()).map(([n, pins]) => <div key={n} className="row-hover" onPointerEnter={() => setHoverNet(n)} onPointerLeave={() => setHoverNet(null)}><span style={{ color: colOf(n) }}>■</span> <b>{n === "0" ? "GND (0)" : n}</b> <span className="muted">{pins.length} pins</span></div>)}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Logical connectivity only. Physical wires (CAD) and PCB traces are derived separately.</div>
        </Section>
      </Resizable>
    </div>
  );
}
