// Export / manufacturing data generation. Mesh formats (STL/OBJ/GLB) are display/printing meshes, NOT exact B-rep.
// STEP/IGES need an exact CAD kernel (OCCT) and are reported as unsupported in this build.
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getElPart, MATERIALS, padsFor, STRING_PRESETS, VIOLIN_LIB } from "./catalog";
import { buildNets } from "./circuit";
import type { ProjectDoc } from "./doc";
import { freshness } from "./doc";
import { BuiltModel, wiringOf } from "./geometry";
import { ARTIFACTS, Issue, PARAM_LIST, PARAM_MAP } from "./params";
import { fholePolygon, offsetPolygon, violinOutline } from "./shape";
import { checkFirmware } from "./firmware";

type Vals = Record<string, number>;

export const FORMATS: { ext: string; name: string; kind: "exact" | "mesh" | "2d" | "data"; supported: boolean; note: string }[] = [
  { ext: ".step/.stp", name: "STEP (AP214/242)", kind: "exact", supported: false, note: "Exact B-rep. Requires OCCT kernel (desktop C++ build). Not available in this web build." },
  { ext: ".iges/.igs", name: "IGES", kind: "exact", supported: false, note: "Exact surfaces. Requires OCCT. Legacy; prefer STEP." },
  { ext: ".stl", name: "STL (ASCII)", kind: "mesh", supported: true, note: "Triangle mesh for 3D printing. No units, no colours, not editable CAD." },
  { ext: ".obj", name: "Wavefront OBJ", kind: "mesh", supported: true, note: "Mesh with per-part groups; for visualisation / DCC tools." },
  { ext: ".glb", name: "glTF binary (GLB)", kind: "mesh", supported: true, note: "PBR mesh for viewers/AR. Visual only." },
  { ext: ".3mf", name: "3MF", kind: "mesh", supported: false, note: "Planned: mesh + units + materials for printing (zip/XML writer not yet written)." },
  { ext: ".dxf", name: "DXF (2D R12)", kind: "2d", supported: true, note: "Body outline, f-holes, inner rib line for CNC / laser cutting (2D)." },
  { ext: ".svg", name: "SVG technical drawing", kind: "2d", supported: true, note: "Dimensioned views with tolerances." },
  { ext: ".csv", name: "BOM CSV", kind: "data", supported: true, note: "Bill of materials." },
  { ext: ".cir", name: "SPICE netlist", kind: "data", supported: true, note: "For ngspice/LTspice." },
  { ext: ".gtl/.gko/.drl", name: "Gerber RS-274X + Excellon", kind: "data", supported: true, note: "Pads + outline + drill ONLY. No copper traces (router not implemented) → not fabrication-ready." },
  { ext: ".iaz", name: "InstrumentAZ project", kind: "data", supported: true, note: "Versioned, checksummed project." },
];

const meshes = (model: BuiltModel) => { const out: THREE.Mesh[] = []; model.root.updateMatrixWorld(true); model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && isVisible(o)) out.push(o as THREE.Mesh); }); return out; };
function isVisible(o: THREE.Object3D): boolean { let p: THREE.Object3D | null = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; }
function tris(m: THREE.Mesh): THREE.Vector3[][] {
  const g = m.geometry, pos = g.attributes.position, idx = g.index, out: THREE.Vector3[][] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) out.push([0, 1, 2].map((k) => v(idx ? idx.getX(i + k) : i + k)));
  return out;
}
export function toSTL(model: BuiltModel, name: string): string {
  const L = [`solid ${name.replace(/\s/g, "_")}`];
  for (const m of meshes(model)) for (const [a, b, c] of tris(m)) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    L.push(`facet normal ${n.x.toExponential(5)} ${n.y.toExponential(5)} ${n.z.toExponential(5)}`, " outer loop", ...[a, b, c].map((p) => `  vertex ${p.x.toExponential(5)} ${p.y.toExponential(5)} ${p.z.toExponential(5)}`), " endloop", "endfacet");
  }
  L.push(`endsolid ${name.replace(/\s/g, "_")}`);
  return L.join("\n");
}
export function toOBJ(model: BuiltModel): string {
  const L = ["# InstrumentAZ OBJ export (mm). Visual mesh, not exact CAD."];
  let off = 1;
  for (const m of meshes(model)) {
    L.push(`o ${m.parent?.name || m.name || "mesh"}`);
    const t = tris(m);
    t.forEach((tri) => tri.forEach((p) => L.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`)));
    for (let i = 0; i < t.length; i++) L.push(`f ${off + i * 3} ${off + i * 3 + 1} ${off + i * 3 + 2}`);
    off += t.length * 3;
  }
  return L.join("\n");
}
export function toGLB(model: BuiltModel): Promise<ArrayBuffer> {
  return new Promise((res, rej) => new GLTFExporter().parse(model.root, (r) => res(r as ArrayBuffer), rej, { binary: true }));
}

// ---------------------------------------------------------------- DXF (R12 polylines)
export function toDXF(v: Vals): string {
  const outline = violinOutline({ bodyLength: v["geom.bodyLength"], upperBout: v["geom.upperBout"], lowerBout: v["geom.lowerBout"], cBout: v["geom.cBout"] });
  const zb = v["geom.bodyLength"] - v["geom.stopLength"];
  const layers: [string, [number, number][]][] = [
    ["OUTLINE", outline], ["RIB_INNER", offsetPolygon(outline, v["geom.ribThickness"])],
    ["FHOLE_R", fholePolygon(v["geom.fholeLength"], v["geom.fholeSep"], zb, 1)], ["FHOLE_L", fholePolygon(v["geom.fholeLength"], v["geom.fholeSep"], zb, -1)],
  ];
  const L = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  for (const [layer, pts] of layers) {
    L.push("0", "POLYLINE", "8", layer, "66", "1", "70", "1");
    pts.forEach(([x, z]) => L.push("0", "VERTEX", "8", layer, "10", x.toFixed(4), "20", z.toFixed(4), "30", "0"));
    L.push("0", "SEQEND", "8", layer);
  }
  L.push("0", "CIRCLE", "8", "SOUNDPOST", "10", v["geom.soundpostX"].toFixed(3), "20", (zb - v["geom.soundpostBehind"] - v["geom.soundpostDia"] / 2).toFixed(3), "30", "0", "40", (v["geom.soundpostDia"] / 2).toFixed(3));
  L.push("0", "ENDSEC", "0", "EOF");
  return L.join("\n");
}

// ---------------------------------------------------------------- BOM
export interface BomRow { item: string; qty: number; desc: string; material: string; spec: string; massG: number; source: string; pn: string }
export function bomOf(doc: ProjectDoc, v: Vals): BomRow[] {
  const rows: BomRow[] = [];
  const mname = (id?: string) => (id ? MATERIALS[Math.round(v[id])]?.name ?? "?" : "per variant");
  const massOf: Record<string, number> = { top: v["mass.top"], back: v["mass.back"], ribs: v["mass.ribs"] };
  for (const p of doc.parts) {
    if (!p.enabled) continue;
    const lib = VIOLIN_LIB.find((l) => l.id === p.lib);
    if (!lib || lib.id === "fholes") continue;
    const variant = lib.variants.find((x) => x.key === p.variant);
    rows.push({ item: lib.name, qty: lib.name.includes("x4") ? 4 : 1, desc: `${lib.desc} [${variant?.label ?? p.variant}]`, material: lib.id === "strings" ? "see strings" : mname(lib.matParam), spec: lib.spec.join("; "), massG: massOf[lib.id] ?? variant?.massG ?? lib.massG, source: "fabricate / purchase", pn: "" });
  }
  ["G", "D", "A", "E"].forEach((k, i) => { const pr = STRING_PRESETS.find((x) => x.id === doc.stringPresets[i]); rows.push({ item: `String ${k}`, qty: 1, desc: pr?.name ?? "custom", material: pr?.material ?? "?", spec: `d=${v[`str.${k}.diameter`]} mm, μ=${v[`str.${k}.mu`]} g/m, T=${v[`str.${k}.tension`].toFixed(1)} N`, massG: v[`str.${k}.mu`] * 0.4, source: "purchase", pn: "" }); });
  const count = new Map<string, number>();
  doc.schematic.parts.forEach((p) => count.set(p.lib, (count.get(p.lib) ?? 0) + 1));
  for (const [lib, n] of count) { const e = getElPart(lib, doc.customParts); if (!e || e.sim === "GND" || e.fp === "none") continue; rows.push({ item: e.name, qty: n, desc: `${e.category}; footprint ${e.fp}; ${e.v ? `${e.v[0]}–${e.v[1]} V` : "no supply spec"}${e.iface ? `; ${e.iface}` : ""}`, material: "electronic", spec: `${e.dims.join("×")} mm${e.mfr ? `; ${e.mfr}` : ""}`, massG: e.massG * n, source: "purchase (unspecified supplier)", pn: "" }); }
  rows.push({ item: "PCB (FR-4, 1.6 mm)", qty: 1, desc: `Main board ${doc.values["el.pcb.w"]}×${doc.values["el.pcb.l"]} mm`, material: "FR-4", spec: "2-layer (pads only in current export)", massG: doc.values["el.pcb.w"] * doc.values["el.pcb.l"] * 1.6 * 1.9e-3, source: "PCB fab (Gerber)", pn: "" });
  const w = wiringOf(doc, v);
  const cable = w.segs.filter((s) => s.kind === "cable").reduce((s, x) => s + x.lengthMm, 0);
  if (cable > 0) rows.push({ item: "Hook-up wire 28 AWG", qty: 1, desc: `Estimated total ${cable.toFixed(0)} mm (straight-line ×1.3 + 20 mm slack per link)`, material: "copper/PVC", spec: `${w.segs.filter((s) => s.kind === "cable").length} links`, massG: cable * 0.0008, source: "purchase", pn: "" });
  doc.primitives.filter((p) => p.op === "add").forEach((p) => rows.push({ item: p.name, qty: 1, desc: `Custom ${p.kind}`, material: "unspecified", spec: p.size.map((x) => x.toFixed(1)).join("×") + " mm", massG: 0, source: "fabricate", pn: "" }));
  return rows;
}
export function bomCsv(rows: BomRow[]): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  return ["Item,Qty,Description,Material,Spec,Mass_g,Source,PartNumber", ...rows.map((r) => [r.item, r.qty, r.desc, r.material, r.spec, r.massG.toFixed(2), r.source, r.pn].map(q).join(","))].join("\n");
}

// ---------------------------------------------------------------- technical drawing (SVG)
export function drawingSvg(doc: ProjectDoc, v: Vals): string {
  const s = 1.45, W = 1100, H = 760;
  const outline = violinOutline({ bodyLength: v["geom.bodyLength"], upperBout: v["geom.upperBout"], lowerBout: v["geom.lowerBout"], cBout: v["geom.cBout"] });
  const cx = 230, base = 640;
  const X = (x: number) => cx + x * s, Z = (z: number) => base - z * s;
  const tol = (id: string) => (doc.tolerances[id] != null ? ` ±${doc.tolerances[id]}` : "");
  const tolWarn = (id: string) => (PARAM_MAP[id]?.critical && doc.tolerances[id] == null ? ` <tspan fill="#c00">[tol?]</tspan>` : "");
  const out: string[] = [];
  const text = (x: number, y: number, t: string, anchor = "middle") => out.push(`<text x="${x}" y="${y}" font-size="11" text-anchor="${anchor}" font-family="Arial">${t}</text>`);
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vert = false) => { out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#06c" stroke-width="1" marker-start="url(#a)" marker-end="url(#a)"/>`); vert ? out.push(`<text transform="translate(${x1 + 12} ${(y1 + y2) / 2}) rotate(-90)" font-size="11" text-anchor="middle" font-family="Arial" fill="#06c">${label}</text>`) : out.push(`<text x="${(x1 + x2) / 2}" y="${y1 - 4}" font-size="11" text-anchor="middle" font-family="Arial" fill="#06c">${label}</text>`); };
  out.push(`<defs><marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,3 M3,0 L3,6" stroke="#06c"/></marker></defs>`);
  out.push(`<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="#000" stroke-width="2"/>`);
  out.push(`<polygon points="${outline.map(([x, z]) => `${X(x).toFixed(1)},${Z(z).toFixed(1)}`).join(" ")}" fill="#f7f1e3" stroke="#000" stroke-width="1.4"/>`);
  out.push(`<polygon points="${offsetPolygon(outline, v["geom.ribThickness"]).map(([x, z]) => `${X(x).toFixed(1)},${Z(z).toFixed(1)}`).join(" ")}" fill="none" stroke="#777" stroke-dasharray="4 3"/>`);
  const zb = v["geom.bodyLength"] - v["geom.stopLength"];
  [1, -1].forEach((sd) => out.push(`<polygon points="${fholePolygon(v["geom.fholeLength"], v["geom.fholeSep"], zb, sd as 1 | -1).map(([x, z]) => `${X(x).toFixed(1)},${Z(z).toFixed(1)}`).join(" ")}" fill="#fff" stroke="#000"/>`));
  out.push(`<line x1="${X(-v["geom.bridgeWidth"] / 2)}" y1="${Z(zb)}" x2="${X(v["geom.bridgeWidth"] / 2)}" y2="${Z(zb)}" stroke="#a60" stroke-width="4"/>`);
  out.push(`<line x1="${cx}" y1="${Z(-15)}" x2="${cx}" y2="${Z(v["geom.bodyLength"] + 15)}" stroke="#999" stroke-dasharray="10 3 2 3"/>`);
  dim(X(-v["geom.lowerBout"] / 2), Z(0.2 * v["geom.bodyLength"]) + 0, X(v["geom.lowerBout"] / 2), Z(0.2 * v["geom.bodyLength"]), `Ø lower bout ${v["geom.lowerBout"]}${tol("geom.lowerBout")}`);
  dim(X(-v["geom.cBout"] / 2), Z(0.5 * v["geom.bodyLength"]), X(v["geom.cBout"] / 2), Z(0.5 * v["geom.bodyLength"]), `C-bout ${v["geom.cBout"]}${tol("geom.cBout")}`);
  dim(X(-v["geom.upperBout"] / 2), Z(0.77 * v["geom.bodyLength"]), X(v["geom.upperBout"] / 2), Z(0.77 * v["geom.bodyLength"]), `upper bout ${v["geom.upperBout"]}${tol("geom.upperBout")}`);
  dim(X(125), Z(0), X(125), Z(v["geom.bodyLength"]), `body length ${v["geom.bodyLength"]}${tol("geom.bodyLength")}`, true);
  dim(X(-125), Z(0), X(-125), Z(zb), `stop ref: bridge at ${zb.toFixed(1)} from tail`, true);
  text(cx, 60, `<tspan font-size="14" font-weight="bold">TOP VIEW — scale 1:${(1 / s).toFixed(2)} mm→px (not to print scale)</tspan>`);
  // side section
  const ox = 520, oy = 420, zs = 1.45;
  const ZZ = (z: number) => ox + z * zs, YY = (y: number) => oy - y * zs;
  const L = v["geom.bodyLength"], rh = v["geom.ribHeight"], tt = v["geom.topThickness"], tb = v["geom.backThickness"];
  out.push(`<rect x="${ZZ(0)}" y="${YY(rh / 2 + tt)}" width="${L * zs}" height="${tt * zs}" fill="#d9b878" stroke="#000"/>`);
  out.push(`<rect x="${ZZ(0)}" y="${YY(-rh / 2)}" width="${L * zs}" height="${tb * zs}" fill="#c27c3a" stroke="#000"/>`);
  out.push(`<line x1="${ZZ(0)}" y1="${YY(rh / 2)}" x2="${ZZ(0)}" y2="${YY(-rh / 2)}" stroke="#000" stroke-width="2"/><line x1="${ZZ(L)}" y1="${YY(rh / 2)}" x2="${ZZ(L)}" y2="${YY(-rh / 2)}" stroke="#000" stroke-width="2"/>`);
  const yP = rh / 2 + tt;
  out.push(`<line x1="${ZZ(zb)}" y1="${YY(yP)}" x2="${ZZ(zb)}" y2="${YY(yP + v["geom.bridgeHeight"])}" stroke="#a60" stroke-width="5"/>`);
  const zNut = zb + v["geom.vibLength"], yNut = yP + v["geom.bridgeHeight"] - v["geom.vibLength"] * Math.tan(Math.atan(Math.tan((v["geom.neckAngle"] * Math.PI) / 180) + (v["geom.actionE"] - v["geom.nutHeight"]) / v["geom.fbLength"]));
  out.push(`<line x1="${ZZ(zb)}" y1="${YY(yP + v["geom.bridgeHeight"])}" x2="${ZZ(zNut)}" y2="${YY(yNut + v["geom.nutHeight"])}" stroke="#444"/>`);
  out.push(`<line x1="${ZZ(zb)}" y1="${YY(yP + v["geom.bridgeHeight"])}" x2="${ZZ(zb - v["geom.afterlength"])}" y2="${YY(yP + v["geom.tailpieceHeight"])}" stroke="#444"/>`);
  dim(ZZ(L) + 18, YY(rh / 2), ZZ(L) + 18, YY(-rh / 2), `rib h ${rh}${tol("geom.ribHeight")}`, true);
  dim(ZZ(zb) - 25, YY(yP), ZZ(zb) - 25, YY(yP + v["geom.bridgeHeight"]), `bridge h ${v["geom.bridgeHeight"]}${tol("geom.bridgeHeight")}`, true);
  dim(ZZ(zb), YY(-30), ZZ(zNut), YY(-30), `vibrating length ${v["geom.vibLength"]}${tol("geom.vibLength")}`);
  text(ZZ(L / 2), YY(rh / 2 + tt) - 12, `top plate t=${tt}${tol("geom.topThickness")}`);
  text(ZZ(L / 2), YY(-rh / 2 - tb) + 20, `back plate t=${tb}${tol("geom.backThickness")}`);
  text(ZZ(zNut / 1.7), YY(yNut + 40), `neck angle ${v["geom.neckAngle"]}°${tol("geom.neckAngle")}  action E ${v["geom.actionE"]} / G ${v["geom.actionG"]} mm`);
  text(ZZ(0), 60, `<tspan font-size="14" font-weight="bold">SECTION A-A (centre-line)</tspan>`, "start");
  // title block
  const crit = PARAM_LIST.filter((p) => p.critical && doc.tolerances[p.id] == null);
  out.push(`<rect x="560" y="610" width="520" height="130" fill="none" stroke="#000"/>`);
  text(572, 630, `<tspan font-weight="bold">InstrumentAZ — ${doc.name}</tspan>`, "start");
  text(572, 648, `Units: mm, angles in degrees. Material top: ${MATERIALS[Math.round(v["mat.top"])].name}; back/ribs: ${MATERIALS[Math.round(v["mat.back"])].name}`, "start");
  text(572, 664, `Generated ${new Date().toISOString().slice(0, 10)} • Revision from project: ${doc.modified.slice(0, 16)}`, "start");
  out.push(`<text x="572" y="684" font-size="11" font-family="Arial" fill="${crit.length ? "#c00" : "#080"}">${crit.length ? `WARNING: ${crit.length} critical dimensions have no tolerance defined — not released for manufacturing` : "All critical dimensions have tolerances"}</text>`);
  text(572, 702, `General tolerance where not stated: undefined (set per-parameter in Engineering workspace)`, "start");
  text(572, 720, `Dimensions are nominal design values; not verified by measurement.${doc.measured && Object.keys(doc.measured).length ? "" : " No measurements recorded."}`, "start");
  void tolWarn;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff">${out.join("")}</svg>`;
}

// ---------------------------------------------------------------- PCB: auto placement, DRC, Gerber
export interface PcbItem { id: string; ref: string; lib: string; x: number; y: number; rot: number; w: number; h: number }
export function pcbItems(doc: ProjectDoc): PcbItem[] {
  let cursor = 4, row = 4, rowH = 0;
  return doc.schematic.parts.flatMap((p) => {
    const e = getElPart(p.lib, doc.customParts);
    if (!e || e.sim === "GND" || e.fp === "none") return [];
    const pl = doc.pcb.placements[p.id];
    const r = pl?.rot ?? 0, swap = r % 180 !== 0;
    const w = swap ? e.dims[1] : e.dims[0], h = swap ? e.dims[0] : e.dims[1];
    if (pl) return [{ id: p.id, ref: p.ref, lib: p.lib, x: pl.x, y: pl.y, rot: r, w, h }];
    if (cursor + w > doc.values["el.pcb.w"] - 2) { cursor = 4; row += rowH + 3; rowH = 0; }
    const it = { id: p.id, ref: p.ref, lib: p.lib, x: cursor + w / 2, y: row + h / 2, rot: 0, w, h };
    cursor += w + 3; rowH = Math.max(rowH, h);
    return [it];
  });
}
export function runDRC(doc: ProjectDoc, minClear = 0.2): Issue[] {
  const items = pcbItems(doc), iss: Issue[] = [];
  const add = (severity: Issue["severity"], message: string) => iss.push({ id: `drc.${iss.length}`, severity, domain: "electronics", message, params: [] });
  for (const a of items) if (a.x - a.w / 2 < 0 || a.y - a.h / 2 < 0 || a.x + a.w / 2 > doc.values["el.pcb.w"] || a.y + a.h / 2 > doc.values["el.pcb.l"]) add("error", `${a.ref}: footprint outside the ${doc.values["el.pcb.w"]}×${doc.values["el.pcb.l"]} mm board`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j]; const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2), oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2); if (ox > -minClear && oy > -minClear) add("error", `${a.ref} ↔ ${b.ref}: courtyard overlap / clearance < ${minClear} mm`); }
  const { nets } = buildNets(doc.schematic, doc.customParts);
  const multi = Array.from(nets.entries()).filter(([, p]) => p.length > 1).length;
  if (multi) add("warning", `${multi} nets are unrouted (ratsnest only): copper trace routing is not implemented in this build`);
  if (doc.values["el.pcb.w"] > 80 || doc.values["el.pcb.l"] > 120) add("info", "Board larger than the usual violin bay");
  return iss;
}
const f6 = (x: number) => Math.round(x * 1e6).toString();
export function gerberOf(doc: ProjectDoc) {
  const items = pcbItems(doc);
  const ap = new Map<string, number>();
  let next = 10;
  const apertures: string[] = [], flashes: string[] = [], drills: [number, number, number][] = [];
  for (const it of items) {
    const e = getElPart(it.lib, doc.customParts)!;
    const pads = padsFor(e);
    const rad = (it.rot * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    for (const p of pads) {
      const key = p.drill > 0 ? `C,${p.w.toFixed(3)}` : `R,${p.w.toFixed(3)}X${p.h.toFixed(3)}`;
      if (!ap.has(key)) { ap.set(key, next); apertures.push(`%ADD${next}${key}*%`); next++; }
      const x = it.x + p.x * c - p.y * s, y = it.y + p.x * s + p.y * c;
      flashes.push(`D${ap.get(key)}*`, `X${f6(x)}Y${f6(y)}D03*`);
      if (p.drill > 0) drills.push([x, y, p.drill]);
    }
  }
  const head = ["G04 InstrumentAZ Gerber (RS-274X). PADS ONLY - no routed copper*", "%FSLAX46Y46*%", "%MOMM*%", "G01*"];
  const copper = [...head, ...apertures, ...flashes, "M02*"].join("\n");
  const outline = [...head, "%ADD10C,0.100*%", "D10*", `X0Y0D02*`, `X${f6(doc.values["el.pcb.w"])}Y0D01*`, `X${f6(doc.values["el.pcb.w"])}Y${f6(doc.values["el.pcb.l"])}D01*`, `X0Y${f6(doc.values["el.pcb.l"])}D01*`, `X0Y0D01*`, "M02*"].join("\n");
  const tools = Array.from(new Set(drills.map((d) => d[2].toFixed(2))));
  const drill = ["M48", "; InstrumentAZ Excellon", "METRIC,TZ", ...tools.map((t, i) => `T${i + 1}C${t}`), "%", ...tools.flatMap((t, i) => [`T${i + 1}`, ...drills.filter((d) => d[2].toFixed(2) === t).map((d) => `X${d[0].toFixed(3)}Y${d[1].toFixed(3)}`)]), "M30"].join("\n");
  return { copper, outline, drill, padCount: flashes.length / 2, holes: drills.length };
}

// ---------------------------------------------------------------- assembly instructions + validation
export function assemblyInstructions(doc: ProjectDoc, v: Vals): string {
  const steps = [
    `Prepare materials: top ${MATERIALS[Math.round(v["mat.top"])].name}, back/ribs ${MATERIALS[Math.round(v["mat.back"])].name}, neck ${MATERIALS[Math.round(v["mat.neck"])].name}.`,
    `Bend ribs: height ${v["geom.ribHeight"]} mm, thickness ${v["geom.ribThickness"]} mm; use the DXF outline (RIB_INNER layer) as the mould.`,
    `Carve/graduate the back to mean ${v["geom.backThickness"]} mm (arch ${v["geom.backArch"]} mm) and the top to ${v["geom.topThickness"]} mm (arch ${v["geom.topArch"]} mm). Cut f-holes (${v["geom.fholeLength"]} mm long, separation ${v["geom.fholeSep"]} mm).`,
    `Glue bass bar (${v["geom.bassbarLength"]}×${v["geom.bassbarWidth"]}×${v["geom.bassbarHeight"]} mm) ${v["geom.bassbarX"]} mm on the bass side of centre, under the bridge position.`,
    `Electronics bay: reserve ${v["el.bay.w"]}×${v["el.bay.l"]}×${v["el.bay.d"]} mm in the lower bout (centre z=70 mm) and plan a service hatch BEFORE closing the box.`,
    `Mount internal electronics (battery, PCB) and run cables per the wiring list; verify no contact with soundpost/bass bar.`,
    `Close the body: glue ribs to back, then top. Set neck at ${v["geom.neckAngle"]}°; derived neck projection ${v["geom.neckLength"].toFixed(1)} mm.`,
    `Fingerboard ${v["geom.fbLength"]} mm, radius ${v["geom.fbRadius"]} mm; nut height ${v["geom.nutHeight"]} mm.`,
    `Fit bridge ${v["geom.bridgeHeight"]} mm high at stop length ${v["geom.stopLength"]} mm; afterlength ${v["geom.afterlength"]} mm.`,
    `Fit soundpost Ø${v["geom.soundpostDia"]} mm, ${v["geom.soundpostBehind"]} mm behind the bridge foot, ${v["geom.soundpostX"]} mm treble side.`,
    `Install strings and tune: ${["G", "D", "A", "E"].map((k) => `${k} ${v[`str.${k}.freq`].toFixed(1)} Hz @ ${v[`str.${k}.tension`].toFixed(1)} N`).join("; ")}. Raise tension gradually; check top plate response.`,
    `Flash firmware, verify pin map, then run power-on test with current-limited supply (expected ≈ ${v["el.power.total"].toFixed(0)} mA average).`,
  ];
  return `ASSEMBLY INSTRUCTIONS — ${doc.name}\n(Generated from design parameters. A human luthier must review: no structural analysis is implemented.)\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`;
}

export function manufacturingChecks(doc: ProjectDoc, v: Vals, designIssues: Issue[], fitIssues: Issue[]): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Issue["severity"], message: string, explain?: string, params: string[] = []) => out.push({ id: `mfg.${out.length}`, severity, domain: "manufacturing", message, params, explain });
  const crit = PARAM_LIST.filter((p) => p.critical);
  const noTol = crit.filter((p) => doc.tolerances[p.id] == null);
  if (noTol.length) add("error", `${noTol.length} critical dimensions have no tolerance: ${noTol.slice(0, 6).map((p) => p.label).join(", ")}${noTol.length > 6 ? "…" : ""}`, "Set tolerances in Engineering → Properties before releasing drawings.", noTol.map((p) => p.id));
  const noMeas = crit.filter((p) => doc.measured[p.id] == null);
  if (noMeas.length === crit.length) add("info", "No physical measurements recorded: all values are design (calculated) values, not measured.");
  const errs = designIssues.filter((i) => i.severity === "error");
  if (errs.length) add("error", `${errs.length} unresolved design error(s): ${errs[0].message}`);
  const bom = bomOf(doc, v), noPn = bom.filter((r) => !r.pn && r.material === "electronic");
  if (noPn.length) add("warning", `${noPn.length} electronic BOM lines have no manufacturer part number / supplier`, "Catalog data is typical only; select real parts and verify datasheets.");
  const custom = doc.customParts.filter((p) => p.massG <= 0 || p.dims.some((d) => d <= 0));
  if (custom.length) add("warning", `Custom components missing mass or dimensions: ${custom.map((c) => c.name).join(", ")}`);
  ARTIFACTS.filter((a) => ["art.drawing", "art.bom", "art.pcb", "art.fit", "art.firmware"].includes(a.id)).forEach((a) => { const f = freshness(doc, v, a.id); if (f !== "fresh") add("warning", `${a.label}: ${f === "never" ? "never generated/reviewed" : "OUT OF DATE (inputs changed)"}`, "Regenerate/review it in the Manufacturing workspace and mark as reviewed."); });
  fitIssues.filter((i) => i.severity === "error").forEach((i) => add("error", i.message));
  const drc = runDRC(doc);
  drc.filter((i) => i.severity === "error").forEach((i) => add("error", `DRC: ${i.message}`));
  if (drc.some((i) => i.message.includes("unrouted"))) add("error", "PCB not fabrication-ready: copper routing missing (pads/outline/drill only)");
  const fw = checkFirmware(doc, v);
  fw.issues.filter((i) => i.severity !== "info").forEach((i) => add(i.severity, `Firmware: ${i.message}`));
  add("info", "Soundpost/bass-bar/arching influence on acoustics and structure are not modelled; mechanical release needs luthier review.");
  add("info", "STEP/IGES not exportable in this build (needs OCCT). Mesh exports are not exact CAD.");
  return out;
}
