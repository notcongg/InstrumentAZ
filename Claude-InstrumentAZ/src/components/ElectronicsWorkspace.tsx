"use client";
import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getElPart, padsFor } from "@/lib/iaz/catalog";
import { buildNets, pinKey } from "@/lib/iaz/circuit";
import { bomCsv, bomOf, gerberOf, pcbItems, runDRC } from "@/lib/iaz/exporters";
import { commit, setValue, useDoc, useVals } from "@/lib/iaz/store";
import { download, IssueList, ParamRow, Prov, Resizable, Section, Tabs, Unsupported } from "./ui";

const SchematicEditor = dynamic(() => import("./SchematicEditor"), { ssr: false });
const S = 7;

function PcbEditor() {
  const doc = useDoc();
  const vals = useVals();
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const items = useMemo(() => pcbItems(doc), [doc]);
  const drc = useMemo(() => runDRC(doc), [doc]);
  const W = doc.values["el.pcb.w"], H = doc.values["el.pcb.l"];
  const nets = useMemo(() => buildNets(doc.schematic, doc.customParts), [doc.schematic, doc.customParts]);
  const gb = useMemo(() => gerberOf(doc), [doc]);
  const padWorld = (it: (typeof items)[number]) => { const e = getElPart(it.lib, doc.customParts)!; const r = (it.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return padsFor(e).map((p) => ({ ...p, wx: it.x + p.x * c - p.y * s, wy: it.y + p.x * s + p.y * c })); };
  const rats: [number, number, number, number, string][] = [];
  for (const [net, pins] of nets.nets) {
    const pts = pins.flatMap((k) => { const [pid, pn] = k.split(":"); const it = items.find((i) => i.id === pid); if (!it) return []; const pd = padWorld(it).find((p) => p.pin === Number(pn)); return pd ? [[pd.wx, pd.wy] as [number, number]] : []; });
    for (let i = 1; i < pts.length; i++) rats.push([pts[0][0], pts[0][1], pts[i][0], pts[i][1], net]);
  }
  const save = (id: string, x: number, y: number, rot: number, key?: string) => commit("Move footprint", (d) => { const pl = { ...d.pcb.placements }; items.forEach((i) => { if (!pl[i.id]) pl[i.id] = { x: i.x, y: i.y, rot: i.rot }; }); pl[id] = { x, y, rot }; return { ...d, pcb: { ...d.pcb, placements: pl } }; }, key);
  const it = items.find((i) => i.id === sel);
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div className="panel" style={{ flex: 1, margin: "0 6px 0 0", overflow: "auto", position: "relative" }}>
        <div style={{ padding: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge b-visual">Drag footprints • ratsnest = unrouted connections (routing not implemented)</span>
          <button className="btn" onClick={() => commit("Auto-place", (d) => ({ ...d, pcb: { ...d.pcb, placements: {} } }))}>Auto-place</button>
          <button className="btn" disabled={!it} onClick={() => it && save(it.id, it.x, it.y, (it.rot + 90) % 360)}>Rotate 90°</button>
        </div>
        <svg ref={svg} width={W * S + 60} height={H * S + 60} style={{ margin: 10 }}
          onPointerMove={(e) => { if (!drag.current) return; const r = svg.current!.getBoundingClientRect(); const x = Math.round(((e.clientX - r.left - 30) / S - drag.current.dx) * 2) / 2, y = Math.round(((e.clientY - r.top - 30) / S - drag.current.dy) * 2) / 2; const cur = items.find((i) => i.id === drag.current!.id)!; if (cur.x !== x || cur.y !== y) save(cur.id, x, y, cur.rot, `pcb:${cur.id}`); }}
          onPointerUp={() => (drag.current = null)}>
          <g transform="translate(30 30)">
            <rect width={W * S} height={H * S} fill="#0f3d2a" stroke="#d9b44a" strokeWidth="2" rx="2" />
            {rats.map((r, i) => <line key={i} x1={r[0] * S} y1={r[1] * S} x2={r[2] * S} y2={r[3] * S} stroke="#facc15" strokeWidth="0.7" opacity="0.7"><title>{r[4]}</title></line>)}
            {items.map((i) => (
              <g key={i.id} onPointerDown={(e) => { e.stopPropagation(); setSel(i.id); const r = svg.current!.getBoundingClientRect(); drag.current = { id: i.id, dx: (e.clientX - r.left - 30) / S - i.x, dy: (e.clientY - r.top - 30) / S - i.y }; }} style={{ cursor: "move" }}>
                <rect x={(i.x - i.w / 2) * S} y={(i.y - i.h / 2) * S} width={i.w * S} height={i.h * S} fill={sel === i.id ? "#ffffff25" : "#ffffff10"} stroke={sel === i.id ? "#e8a33d" : "#ddd"} strokeWidth="1" />
                <text x={i.x * S} y={i.y * S} fontSize="9" fill="#fff" textAnchor="middle" style={{ pointerEvents: "none" }}>{i.ref}</text>
                {padWorld(i).map((p, k) => <rect key={k} x={(p.wx - p.w / 2) * S} y={(p.wy - p.h / 2) * S} width={p.w * S} height={p.h * S} fill="#d9b44a" rx={p.drill ? p.w * S / 2 : 0} />)}
              </g>
            ))}
          </g>
        </svg>
      </div>
      <Resizable side="right" def={320} id="pcb-right">
        <Section title="Board (shared parameters)" right={<Prov kind="calc" />}>
          <ParamRow id="el.pcb.w" /><ParamRow id="el.pcb.l" /><ParamRow id="el.pcb.h" />
          <div className="muted" style={{ fontSize: 11 }}>Changing the board size re-checks the electronics bay in CAD. 2 layers assumed, FR-4 1.6 mm.</div>
        </Section>
        <Section title={`Design Rules Check (${drc.length})`}><IssueList issues={drc} /><div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Rules implemented: board edge, courtyard overlap (0.2 mm). Not implemented: trace width/clearance (no traces), annular ring, silkscreen.</div></Section>
        <Section title="Manufacturing output">
          <div className="muted" style={{ marginBottom: 6 }}>{gb.padCount} pads, {gb.holes} drilled holes</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => download(`${doc.name}.GTL`, gb.copper)}>Gerber top copper (pads)</button>
            <button className="btn" onClick={() => download(`${doc.name}.GKO`, gb.outline)}>Gerber outline</button>
            <button className="btn" onClick={() => download(`${doc.name}.DRL`, gb.drill)}>Excellon drill</button>
            <button className="btn" onClick={() => download(`${doc.name}-bom.csv`, bomCsv(bomOf(doc, vals)), "text/csv")}>BOM CSV</button>
          </div>
          <div style={{ marginTop: 8 }}><Unsupported title="Trace routing, vias, copper pours, solder-mask & silkscreen layers">Gerber files contain pad flashes, board outline and drill hits only. They are NOT ready for PCB fabrication until routing exists. Route in an external EDA tool or wait for the router milestone.</Unsupported></div>
        </Section>
      </Resizable>
    </div>
  );
}

export default function ElectronicsWorkspace() {
  const [tab, setTab] = useState<"sch" | "pcb">("sch");
  void setValue;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 8 }}>
      <Tabs tabs={[["sch", "Schematic Editor"], ["pcb", "PCB Editor"]]} value={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, paddingTop: 6 }}>{tab === "sch" ? <SchematicEditor /> : <PcbEditor />}</div>
    </div>
  );
}
void pinKey;
