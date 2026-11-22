// Parametric violin geometry (three.js meshes = VISUAL tessellation) + fit/collision checks + wiring.
// NOTE: exact B-rep (OCCT) is not available in this web build; meshes are display/export meshes only.
import * as THREE from "three";
import { ElPart, getElPart, MATERIALS, VIOLIN_LIB } from "./catalog";
import type { Placed, ProjectDoc } from "./doc";
import { buildNets, pinKey } from "./circuit";
import type { Issue } from "./params";
import { fholePolygon, halfWidthAt, offsetPolygon, pointInPolygon, violinOutline, V2 } from "./shape";

type Vals = Record<string, number>;
const COLORS: Record<string, string> = { spruce: "#d9b878", maple: "#c27c3a", ebony: "#1e1b19", rosewood: "#5a2d1f", boxwood: "#c9a45c", carbon: "#2b2f36", poplar: "#cdb98a" };
const matColor = (v: Vals, id: string) => COLORS[MATERIALS[Math.round(v[id])]?.id ?? "maple"] ?? "#c27c3a";
const mk = (color: string, metal = 0, rough = 0.55) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });

export interface Layout { yP: number; bridgeZ: number; zNut: number; alpha: number; theta: number; yNutBase: number; ribH: number; nutX: number[]; brX: number[]; tailZ: number; neckLen: number }
export function layoutOf(v: Vals): Layout {
  const ribH = v["geom.ribHeight"], yP = ribH / 2 + v["geom.topThickness"];
  const bridgeZ = v["geom.bodyLength"] - v["geom.stopLength"], zNut = bridgeZ + v["geom.vibLength"];
  const alpha = (v["geom.neckAngle"] * Math.PI) / 180;
  const theta = Math.atan(Math.tan(alpha) + (v["geom.actionE"] - v["geom.nutHeight"]) / v["geom.fbLength"]);
  const yNutBase = yP + v["geom.bridgeHeight"] - v["geom.vibLength"] * Math.tan(theta) - v["geom.nutHeight"];
  const sx = (span: number) => [-1.5, -0.5, 0.5, 1.5].map((k) => (k * span) / 3);
  return { yP, bridgeZ, zNut, alpha, theta, yNutBase, ribH, nutX: sx(v["geom.stringSpacingNut"]), brX: sx(v["geom.stringSpacingBridge"]), tailZ: bridgeZ - v["geom.afterlength"], neckLen: v["geom.neckLength"] };
}

const toShape = (pts: V2[], holes: V2[][] = []) => {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  holes.forEach((h) => s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z)))));
  return s;
};
/** Extrude a (x,z) shape downward (−y) from yTop by depth. */
function plate(shape: THREE.Shape, depth: number, yTop: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, yTop, 0);
  return g;
}
function taperedBox(w0: number, w1: number, thick: number, len: number, radius: number | null, topY = 0) {
  const g = new THREE.BoxGeometry(1, 1, 1, 10, 1, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) + 0.5; // 0 at nut, 1 at end
    const w = w0 + (w1 - w0) * t, x = p.getX(i) * w, top = p.getY(i) > 0;
    const arc = radius ? radius - Math.sqrt(Math.max(0, radius * radius - x * x)) : 0;
    p.setXYZ(i, x, top ? topY - arc : topY - thick, -t * len);
  }
  g.computeVertexNormals();
  return g;
}
function cylBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return m;
}

export interface BuiltModel { root: THREE.Group; groups: Record<string, THREE.Group>; layout: Layout; outline: V2[] }

export function buildModel(doc: ProjectDoc, v: Vals): BuiltModel {
  const L = layoutOf(v);
  const root = new THREE.Group();
  const groups: Record<string, THREE.Group> = {};
  const outline = violinOutline({ bodyLength: v["geom.bodyLength"], upperBout: v["geom.upperBout"], lowerBout: v["geom.lowerBout"], cBout: v["geom.cBout"] });
  const inst = (lib: string) => doc.parts.find((p) => p.lib === lib);
  const fholesOn = inst("fholes")?.enabled !== false;
  const ribH = L.ribH, tTop = v["geom.topThickness"], tBack = v["geom.backThickness"], rt = v["geom.ribThickness"];
  const bridgeH = v["geom.bridgeHeight"], bridgeW = v["geom.bridgeWidth"];
  const fl = v["geom.fholeLength"], fs = v["geom.fholeSep"];
  const make = (lib: string, base: THREE.Vector3 = new THREE.Vector3(), rotX = 0) => {
    const g = new THREE.Group();
    g.name = lib; g.position.copy(base); g.rotation.x = rotX; g.userData = { instId: `inst_${lib}`, lib, base: base.clone() };
    groups[lib] = g;
    return g;
  };
  const add = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number]) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; if (pos) m.position.set(...pos); g.add(m); return m; };

  // body
  const holes = fholesOn ? [fholePolygon(fl, fs, L.bridgeZ, 1), fholePolygon(fl, fs, L.bridgeZ, -1)] : [];
  add(make("top"), plate(toShape(outline, holes), tTop, ribH / 2 + tTop), mk(matColor(v, "mat.top"), 0, 0.5));
  add(make("back"), plate(toShape(outline), tBack, -ribH / 2), mk(matColor(v, "mat.back"), 0, 0.5));
  add(make("ribs"), plate(toShape(outline, [offsetPolygon(outline, rt)]), ribH, ribH / 2), mk(matColor(v, "mat.back"), 0, 0.6));
  {
    const g = make("fholes");
    [1, -1].forEach((side) => {
      const poly = fholePolygon(fl, fs, L.bridgeZ, side as 1 | -1);
      const geo = new THREE.BufferGeometry().setFromPoints(poly.map(([x, z]) => new THREE.Vector3(x, L.yP + 0.15, z)).concat([new THREE.Vector3(poly[0][0], L.yP + 0.15, poly[0][1])]));
      g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#111" })));
    });
  }
  // neck group frame: origin at nut top centre, +z toward scroll
  const nutBase = new THREE.Vector3(0, L.yNutBase, L.zNut);
  const fbLen = v["geom.fbLength"], neckAlong = L.neckLen / Math.cos(L.alpha) + 14;
  add(make("fingerboard", nutBase, L.alpha), taperedBox(v["geom.fbWidthNut"], v["geom.fbWidthEnd"], 7, fbLen, v["geom.fbRadius"]), mk(matColor(v, "mat.fingerboard"), 0, 0.3));
  add(make("neck", nutBase, L.alpha), taperedBox(v["geom.fbWidthNut"] + 2, v["geom.fbWidthNut"] + 14, 17, neckAlong, null, -7), mk(matColor(v, "mat.neck"), 0, 0.5));
  {
    const g = groups["neck"], m = mk(matColor(v, "mat.neck"), 0, 0.5);
    add(g, new THREE.BoxGeometry(v["geom.fbWidthNut"] + 6, 22, 66), m, [0, -11, 33]);
    // wall slot visual
    add(g, new THREE.BoxGeometry(v["geom.fbWidthNut"] - 4, 14, 52), mk("#2a1a10"), [0, -4, 38]);
  }
  {
    const g = make("scroll", nutBase, L.alpha), pts: THREE.Vector3[] = [];
    for (let th = Math.PI; th <= 5 * Math.PI; th += 0.15) { const r = 22 * Math.exp(-0.18 * (th - Math.PI)); pts.push(new THREE.Vector3(0, -11 + r * Math.sin(th), 56 + r * Math.cos(th))); }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 6.5, 10), mk(matColor(v, "mat.neck"), 0, 0.5));
  }
  {
    const g = make("pegs", nutBase, L.alpha), m = mk(matColor(v, "mat.fittings"), 0, 0.35);
    [14, 28, 42, 56].forEach((z, i) => {
      const s = i % 2 === 0 ? 1 : -1, y = i < 2 ? -7 : -13;
      const shaft = add(g, new THREE.CylinderGeometry(3, 3.6, 30, 12), m, [s * 3, y, z]); shaft.rotation.z = Math.PI / 2;
      const head = add(g, new THREE.CylinderGeometry(7, 5, 7, 14), m, [s * 21, y, z]); head.rotation.z = Math.PI / 2;
    });
  }
  add(make("nut", nutBase, L.alpha), new THREE.BoxGeometry(v["geom.fbWidthNut"], 4, 3), mk(matColor(v, "mat.fittings"), 0, 0.3), [0, v["geom.nutHeight"] - 2, 1.5]);
  // bridge
  {
    const g = make("bridge", new THREE.Vector3(0, L.yP, L.bridgeZ)), w = bridgeW, h = bridgeH, sp = v["geom.stringSpacingBridge"];
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(-w / 2 + 6, 0); s.bezierCurveTo(-w / 2 + 7, 9, -8, 10, 0, 10); s.bezierCurveTo(8, 10, w / 2 - 7, 9, w / 2 - 6, 0);
    s.lineTo(w / 2, 0); s.lineTo(w / 2 - 1.5, h * 0.5); s.lineTo(w / 2 - 8, h * 0.88); s.lineTo(sp / 2 + 2, h); s.lineTo(-sp / 2 - 2, h); s.lineTo(-w / 2 + 8, h * 0.88); s.lineTo(-w / 2 + 1.5, h * 0.5); s.closePath();
    const hole = new THREE.Path(); hole.absarc(0, h * 0.55, 5, 0, Math.PI * 2, true); s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: v["geom.bridgeThickness"], bevelEnabled: false, curveSegments: 12 });
    geo.translate(0, 0, -v["geom.bridgeThickness"] / 2);
    add(g, geo, mk("#c9a46a", 0, 0.6));
  }
  // tailpiece + fine tuners
  {
    const g = make("tailpiece", new THREE.Vector3(0, L.yP + v["geom.tailpieceHeight"] - 5, L.tailZ)), len = v["geom.tailpieceLength"];
    const geo = taperedBox(38, 20, 8, len, null, 4); geo.rotateY(0);
    add(g, geo, mk(matColor(v, "mat.fittings"), 0, 0.3));
    const gt = make("tuners", new THREE.Vector3(0, L.yP + v["geom.tailpieceHeight"], L.tailZ - 6));
    const fm = mk("#b9bcc4", 0.8, 0.3);
    L.brX.forEach((x) => add(gt, new THREE.CylinderGeometry(3.2, 3.2, 5, 14), fm, [x * 0.9, 1, 0]));
    // tail gut
    const tg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 12, 6), mk("#444")); tg.rotation.x = Math.PI / 2; tg.position.set(0, -2.5, -len - 5); g.add(tg);
  }
  // chin rest
  {
    const vr = inst("chinrest")?.variant ?? "std";
    const off: [number, number, number] = vr === "centre" ? [40, 8, 0] : [0, 0, 0];
    const g = make("chinrest", new THREE.Vector3(-68 + off[0], L.yP + 12 + off[1], 60));
    const m = add(g, new THREE.SphereGeometry(1, 20, 14), mk(matColor(v, "mat.fittings"), 0, 0.4));
    m.scale.set(40, 11, 30);
  }
  // internal
  {
    const g = make("soundpost", new THREE.Vector3(v["geom.soundpostX"], 0, L.bridgeZ - v["geom.soundpostBehind"] - v["geom.soundpostDia"] / 2));
    add(g, new THREE.CylinderGeometry(v["geom.soundpostDia"] / 2, v["geom.soundpostDia"] / 2, ribH, 16), mk("#e6cf9a", 0, 0.7));
    const b = make("bassbar", new THREE.Vector3(-v["geom.bassbarX"], ribH / 2 - v["geom.bassbarHeight"] / 2, L.bridgeZ));
    add(b, new THREE.BoxGeometry(v["geom.bassbarWidth"], v["geom.bassbarHeight"], v["geom.bassbarLength"]), mk("#e0c68a", 0, 0.7));
  }
  // strings
  {
    const g = make("strings");
    const names = ["G", "D", "A", "E"], cols = ["#c8c8d2", "#d8d8e0", "#e0e0e8", "#d9b44a"];
    const tmp = new THREE.Object3D(); tmp.position.copy(nutBase); tmp.rotation.x = L.alpha; tmp.updateMatrixWorld(true);
    names.forEach((k, i) => {
      const r = Math.max(0.15, v[`str.${k}.diameter`] / 2);
      const m = mk(cols[i], 0.9, 0.3);
      const a = tmp.localToWorld(new THREE.Vector3(L.nutX[i], v["geom.nutHeight"], 0));
      const b = new THREE.Vector3(L.brX[i], L.yP + bridgeH, L.bridgeZ);
      const c = new THREE.Vector3(L.brX[i] * 0.55, L.yP + v["geom.tailpieceHeight"], L.tailZ);
      g.add(cylBetween(a, b, r, m)); g.add(cylBetween(b, c, r, m));
    });
  }
  // per-instance variants / offsets / visibility
  Object.entries(groups).forEach(([lib, g]) => {
    const pi = inst(lib);
    if (!pi) return;
    const var_ = VIOLIN_LIB.find((l) => l.id === lib)?.variants.find((x) => x.key === pi.variant);
    const vo = var_?.offset ?? [0, 0, 0];
    if (lib !== "chinrest") g.position.set(g.userData.base.x + pi.offset[0] + vo[0], g.userData.base.y + pi.offset[1] + vo[1], g.userData.base.z + pi.offset[2] + vo[2]);
    else g.position.add(new THREE.Vector3(...pi.offset));
    if (var_?.scale) g.scale.set(...var_.scale);
    g.visible = pi.enabled;
    g.userData.instId = pi.id;
  });
  // user primitives (Build A–Z)
  doc.primitives.forEach((p) => {
    const g = new THREE.Group(); g.userData = { instId: p.id, prim: true };
    const geo = p.kind === "box" ? new THREE.BoxGeometry(1, 1, 1) : p.kind === "sphere" ? new THREE.SphereGeometry(0.5, 24, 16) : p.kind === "cone" ? new THREE.ConeGeometry(0.5, 1, 24) : new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    const sub = p.op === "subtract";
    const mat = sub ? new THREE.MeshBasicMaterial({ color: "#ff3355", wireframe: true }) : mk(p.color, 0.1, 0.5);
    g.add(new THREE.Mesh(geo, mat));
    g.scale.set(...p.size); g.position.set(...p.pos); g.rotation.set(...p.rot.map((d) => (d * Math.PI) / 180) as [number, number, number]);
    g.visible = p.visible; g.name = p.name;
    groups[p.id] = g;
  });
  Object.values(groups).forEach((g) => root.add(g));
  // placed electronics
  doc.placed.forEach((pl) => {
    const b = placedBox(pl, v, doc.customParts);
    const lp = getElPart(pl.lib, doc.customParts);
    const col = pl.lib === "pcb" ? "#1f7a4a" : lp?.category === "Power" ? "#d97706" : lp?.category === "Display" ? "#2563eb" : lp?.category === "Lighting" ? "#c026d3" : lp?.category === "Audio" ? "#0ea5e9" : "#475569";
    const g = new THREE.Group(); g.userData = { instId: pl.id, placed: true }; g.name = pl.label;
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.2 }));
    g.add(m); g.position.copy(b.center);
    groups[pl.id] = g; root.add(g);
  });
  return { root, groups, layout: L, outline };
}

// ---------------------------------------------------------------- placed electronics: boxes, checks, wiring
export function placedDims(pl: Placed, v: Vals, custom: ElPart[]): [number, number, number] {
  if (pl.lib === "pcb") return [v["el.pcb.w"], v["el.pcb.l"], v["el.pcb.h"] + 1.6];
  if (pl.lib === "lipo" || pl.lib === "li18650") return [v["el.battery.w"], v["el.battery.l"], v["el.battery.h"]];
  if (pl.lib === "oled091" || pl.lib === "oled096") return [v["el.oled.w"], v["el.oled.h"], pl.lib === "oled091" ? 3.5 : 3.8];
  return getElPart(pl.lib, custom)?.dims ?? [10, 10, 5];
}
/** World-space oriented size (x, y, z) after face/rotY. */
export function placedBox(pl: Placed, v: Vals, custom: ElPart[]) {
  const [w, l, h] = placedDims(pl, v, custom);
  let sx = w, sy = h, sz = l;
  if (pl.face === "side") { sx = h; sy = l; sz = w; }
  if (Math.round(pl.rotY / 90) % 2 !== 0 && pl.face !== "side") { [sx, sz] = [sz, sx]; }
  if (Math.round(pl.rotY / 90) % 2 !== 0 && pl.face === "side") { [sx, sz] = [sx, sz]; }
  const size = new THREE.Vector3(sx, sy, sz), center = new THREE.Vector3(...pl.pos);
  return { size, center, box: new THREE.Box3().setFromCenterAndSize(center, size) };
}

export function checkFit(doc: ProjectDoc, v: Vals): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue["severity"], message: string, explain?: string, params: string[] = []) => issues.push({ id: `fit.${issues.length}`, severity, domain: "electronics", message, params, explain });
  const L = layoutOf(v), ribH = L.ribH;
  const outline = violinOutline({ bodyLength: v["geom.bodyLength"], upperBout: v["geom.upperBout"], lowerBout: v["geom.lowerBout"], cBout: v["geom.cBout"] });
  const inner = offsetPolygon(outline, v["geom.ribThickness"] + 0.5);
  const sp = new THREE.Box3(new THREE.Vector3(v["geom.soundpostX"] - 3, -ribH / 2, L.bridgeZ - v["geom.soundpostBehind"] - v["geom.soundpostDia"]), new THREE.Vector3(v["geom.soundpostX"] + 3, ribH / 2, L.bridgeZ - v["geom.soundpostBehind"]));
  const bb = new THREE.Box3(new THREE.Vector3(-v["geom.bassbarX"] - 3, ribH / 2 - v["geom.bassbarHeight"], L.bridgeZ - v["geom.bassbarLength"] / 2), new THREE.Vector3(-v["geom.bassbarX"] + 3, ribH / 2, L.bridgeZ + v["geom.bassbarLength"] / 2));
  const bay = new THREE.Box3(new THREE.Vector3(-v["el.bay.w"] / 2, -ribH / 2, 70 - v["el.bay.l"] / 2), new THREE.Vector3(v["el.bay.w"] / 2, -ribH / 2 + v["el.bay.d"], 70 + v["el.bay.l"] / 2));
  const boxes = doc.placed.map((pl) => ({ pl, ...placedBox(pl, v, doc.customParts), part: getElPart(pl.lib, doc.customParts) }));
  for (const b of boxes) {
    const internal = b.pl.lib === "pcb" || (b.part?.mount ?? "internal") === "internal";
    const corners: V2[] = [[b.box.min.x, b.box.min.z], [b.box.max.x, b.box.min.z], [b.box.max.x, b.box.max.z], [b.box.min.x, b.box.max.z]];
    if (internal && b.pl.face !== "side") {
      if (!corners.every((c) => pointInPolygon(c, inner))) add("error", `${b.pl.label}: extends outside the internal cavity outline`, "Body outline changed or the part was moved. Reposition inside the cavity.");
      if (b.box.min.y < -ribH / 2 - 0.01 || b.box.max.y > ribH / 2 + 0.01) add("error", `${b.pl.label}: ${(b.box.max.y - b.box.min.y).toFixed(1)} mm tall does not fit between the plates (internal height ${ribH.toFixed(1)} mm)`);
      if (!bay.containsBox(b.box)) add("warning", `${b.pl.label}: outside the service bay — cannot be removed/maintained through the bay hatch`, "Move it into the electronics bay or enlarge the bay (el.bay.*).", ["el.bay.w", "el.bay.l", "el.bay.d"]);
      if (b.box.intersectsBox(sp) || b.box.intersectsBox(bb)) add("error", `${b.pl.label}: collides with the soundpost or bass bar`);
    } else if (b.pl.face === "side") {
      const rx = halfWidthAt(outline, b.pl.pos[2]);
      const gap = Math.abs(Math.abs(b.pl.pos[0]) - b.size.x / 2 - rx);
      if (gap > 1.5) add("warning", `${b.pl.label}: not seated on the rib — gap ${gap.toFixed(1)} mm to the rib surface at z=${b.pl.pos[2]}`, "Body width changed, or the part moved. Re-seat the module on the rib.");
      if (b.size.y > ribH - 6 + 0.01) add("warning", `${b.pl.label}: ${b.size.y.toFixed(1)} mm tall exceeds rib height ${ribH} mm minus 6 mm margin`, "Use a smaller display, mount elsewhere, or increase the rib height.", ["el.oled.h", "geom.ribHeight"]);
    } else if (!corners.every((c) => pointInPolygon(c, outline))) add("warning", `${b.pl.label}: surface-mounted part lies outside the body outline`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i].box.intersectsBox(boxes[j].box)) { const o = boxes[i].box.clone().intersect(boxes[j].box).getSize(new THREE.Vector3()); if (Math.min(o.x, o.y, o.z) > 0.05) add("error", `Collision: ${boxes[i].pl.label} ↔ ${boxes[j].pl.label} (overlap ${Math.min(o.x, o.y, o.z).toFixed(1)} mm)`); }
  return issues;
}

export interface WireSeg { net: string; a: THREE.Vector3; b: THREE.Vector3; kind: "cable" | "pcb-trace"; lengthMm: number; from: string; to: string }
/** Physical wiring estimate derived from schematic nets and 3-D placement (straight-line × 1.3 + 20 mm slack). */
export function wiringOf(doc: ProjectDoc, v: Vals): { segs: WireSeg[]; unplaced: string[] } {
  const { nets } = buildNets(doc.schematic, doc.customParts);
  const segs: WireSeg[] = [], unplaced = new Set<string>();
  const placedFor = (libId: string) => doc.placed.find((p) => p.lib === libId);
  for (const [net, pins] of nets) {
    if (net === "0" && pins.length > 8) { /* ground net still routed as star */ }
    const holders: { sp: string; pl?: Placed; ref: string }[] = [];
    pins.forEach((k) => { const pid = k.split(":")[0]; if (holders.some((h) => h.sp === pid)) return; const sp = doc.schematic.parts.find((p) => p.id === pid); if (!sp) return; const pl = placedFor(sp.lib); if (!pl) unplaced.add(sp.ref); holders.push({ sp: pid, pl, ref: sp.ref }); });
    const placed = holders.filter((h) => h.pl);
    for (let i = 1; i < placed.length; i++) {
      const a = placedBox(placed[0].pl!, v, doc.customParts).center, b = placedBox(placed[i].pl!, v, doc.customParts).center;
      if (placed[0].pl!.id === placed[i].pl!.id) continue;
      const onPcb = doc.pcb.placements[placed[0].sp] && doc.pcb.placements[placed[i].sp];
      segs.push({ net, a, b, kind: onPcb ? "pcb-trace" : "cable", lengthMm: a.distanceTo(b) * 1.3 + 20, from: placed[0].ref, to: placed[i].ref });
    }
  }
  return { segs, unplaced: Array.from(unplaced) };
}
void pinKey;

// ---------------------------------------------------------------- collisions between mechanical parts
const ALLOWED: Record<string, string[]> = {
  top: ["back", "ribs", "bridge", "bassbar", "soundpost", "fholes", "tailpiece", "chinrest", "neck", "fingerboard", "strings"], back: ["ribs", "soundpost", "top"], ribs: ["neck", "chinrest", "tailpiece", "top", "back", "bassbar", "soundpost"],
  neck: ["fingerboard", "scroll", "pegs", "nut", "ribs", "top", "strings", "back", "bassbar", "soundpost", "bridge"], fingerboard: ["nut", "neck", "strings", "top", "scroll", "ribs", "bassbar", "soundpost", "back", "bridge", "tailpiece"], scroll: ["neck", "pegs"], pegs: ["neck", "scroll", "strings"], nut: ["strings", "fingerboard", "neck"],
  bridge: ["strings", "top"], tailpiece: ["strings", "tuners", "ribs", "top", "chinrest"], tuners: ["tailpiece", "strings"], strings: ["*"], chinrest: ["ribs", "top"], soundpost: ["top", "back", "ribs"], bassbar: ["top"], fholes: ["*"],
};
export function mechanicalCollisions(model: BuiltModel, doc: ProjectDoc): Issue[] {
  const out: Issue[] = [];
  const libs = Object.keys(model.groups).filter((k) => ALLOWED[k] && model.groups[k].visible);
  const boxes = libs.map((k) => { model.groups[k].updateMatrixWorld(true); return new THREE.Box3().setFromObject(model.groups[k]); });
  for (let i = 0; i < libs.length; i++) for (let j = i + 1; j < libs.length; j++) {
    const a = libs[i], b = libs[j];
    if (ALLOWED[a].includes("*") || ALLOWED[b].includes("*") || ALLOWED[a].includes(b) || ALLOWED[b].includes(a)) continue;
    if (boxes[i].intersectsBox(boxes[j])) out.push({ id: `col.${a}.${b}`, severity: "warning", domain: "geometry", message: `Bounding boxes of ${a} and ${b} overlap (AABB test; may be a false positive for curved parts)`, params: [] });
  }
  // glue-joint contact constraints
  const L = model.layout, g = model.groups;
  const bridgeBottom = g["bridge"] ? g["bridge"].position.y : L.yP;
  if (g["bridge"]?.visible && Math.abs(bridgeBottom - L.yP) > 0.3) out.push({ id: "con.bridge", severity: "error", domain: "geometry", message: `Constraint violated: bridge feet are ${(bridgeBottom - L.yP).toFixed(2)} mm from the top plate (must touch)`, params: ["geom.bridgeHeight"] });
  if (g["soundpost"]?.visible && g["soundpost"].position.y !== 0) out.push({ id: "con.post", severity: "error", domain: "geometry", message: "Constraint violated: soundpost no longer spans the plates", params: [] });
  void doc;
  return out;
}
