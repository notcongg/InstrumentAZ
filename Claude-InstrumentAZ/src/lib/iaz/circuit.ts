// Schematic connectivity, ERC, and a compact Modified-Nodal-Analysis simulator.
// Scope (honest): DC operating point + transient for R, C, L, V (dc/sine/square/triangle), I, diode/LED (Shockley),
// ideal op-amp (no rails/bandwidth), potentiometer. All other parts are NOT simulated. AC analysis is NOT implemented.
// A SPICE netlist is exported so the circuit can be run in ngspice, which remains the recommended reference solver.
import { ElPart, getElPart, PinDef } from "./catalog";
import type { Issue } from "./params";

export interface SchPart { id: string; lib: string; ref: string; x: number; y: number; value?: number; props?: { wave?: "dc" | "sine" | "square" | "triangle"; amp?: number; freq?: number; offset?: number; duty?: number; pos?: number; tol?: number } }
export interface PinRef { p: string; pin: number }
export interface SchWire { id: string; a: PinRef; b: PinRef }
export interface Schematic { parts: SchPart[]; wires: SchWire[]; labels: Record<string, string> }
export const emptySchematic = (): Schematic => ({ parts: [], wires: [], labels: {} });
export const pinKey = (p: string, pin: number) => `${p}:${pin}`;

export interface SymbolPin { x: number; y: number; side: "l" | "r"; def: PinDef }
export interface Symbol { w: number; h: number; pins: SymbolPin[] }
export function symbolOf(part: ElPart): Symbol {
  const n = part.pins.length;
  if (n === 1) return { w: 40, h: 30, pins: [{ x: 0, y: 15, side: "l", def: part.pins[0] }] };
  if (n === 2) return { w: 60, h: 24, pins: [{ x: 0, y: 12, side: "l", def: part.pins[0] }, { x: 60, y: 12, side: "r", def: part.pins[1] }] };
  const left = Math.ceil(n / 2), right = n - left, rows = Math.max(left, right);
  const pins: SymbolPin[] = part.pins.map((def, i) => (i < left ? { x: 0, y: 24 + i * 16, side: "l" as const, def } : { x: 120, y: 24 + (i - left) * 16, side: "r" as const, def }));
  void right;
  return { w: 120, h: 24 + rows * 16 + 4, pins };
}

// ---------------------------------------------------------------- nets
export interface NetInfo { netOf: Map<string, string>; nets: Map<string, string[]>; groundNets: Set<string> }
export function buildNets(sch: Schematic, custom: ElPart[] = []): NetInfo {
  const parent = new Map<string, string>();
  const find = (a: string): string => { if (!parent.has(a)) parent.set(a, a); let r = a; while (parent.get(r) !== r) r = parent.get(r)!; let c = a; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const byId = new Map(sch.parts.map((p) => [p.id, p]));
  sch.parts.forEach((p) => { const lp = getElPart(p.lib, custom); lp?.pins.forEach((_, i) => find(pinKey(p.id, i))); });
  sch.wires.forEach((w) => { if (byId.has(w.a.p) && byId.has(w.b.p)) union(pinKey(w.a.p, w.a.pin), pinKey(w.b.p, w.b.pin)); });
  const byName = new Map<string, string>();
  for (const [k, name] of Object.entries(sch.labels)) { if (!name) continue; const key = name.toUpperCase() === "GND" ? "GND" : name; if (byName.has(key)) union(byName.get(key)!, k); else byName.set(key, k); find(k); if (key === "GND") union(k, "__GND__"); }
  sch.parts.forEach((p) => { if (getElPart(p.lib, custom)?.sim === "GND") { union(pinKey(p.id, 0), "__GND__"); } });
  const groups = new Map<string, string[]>();
  for (const k of Array.from(parent.keys())) { const r = find(k); if (!groups.has(r)) groups.set(r, []); if (!k.startsWith("__")) groups.get(r)!.push(k); }
  const netOf = new Map<string, string>(), nets = new Map<string, string[]>(), groundNets = new Set<string>();
  const gRoot = parent.has("__GND__") ? find("__GND__") : "";
  let idx = 1;
  const names = new Map<string, string>();
  for (const [name, key] of byName) names.set(find(key), name);
  for (const [root, pins] of groups) {
    if (pins.length === 0) continue;
    const name = root === gRoot ? "0" : names.get(root) ?? `N${idx++}`;
    if (name === "0" || name.toUpperCase() === "GND") groundNets.add(name);
    const nm = name.toUpperCase() === "GND" ? "0" : name;
    if (nm === "0") groundNets.add("0");
    pins.forEach((k) => netOf.set(k, nm));
    nets.set(nm, [...(nets.get(nm) ?? []), ...pins]);
  }
  return { netOf, nets, groundNets };
}

// ---------------------------------------------------------------- ERC
export function runERC(sch: Schematic, custom: ElPart[] = []): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue["severity"], message: string, explain?: string) => issues.push({ id: `erc.${issues.length}`, severity, domain: "electronics", message, params: [], explain });
  const { netOf, nets } = buildNets(sch, custom);
  if (sch.parts.length === 0) { add("info", "Schematic is empty"); return issues; }
  const hasGnd = nets.has("0");
  const needsSim = sch.parts.some((p) => getElPart(p.lib, custom)?.sim !== "NONE");
  if (!hasGnd && needsSim) add("error", "No ground reference: add a Ground symbol", "A circuit simulation needs a node 0 reference.");
  for (const p of sch.parts) {
    const lp = getElPart(p.lib, custom);
    if (!lp) { add("error", `${p.ref}: unknown library part '${p.lib}'`); continue; }
    lp.pins.forEach((pin, i) => {
      const net = netOf.get(pinKey(p.id, i));
      const conns = net ? (nets.get(net)?.length ?? 0) : 0;
      if (pin.type === "nc" || pin.type === "io") return;
      if (conns <= 1 && lp.sim !== "GND") {
        const sev: Issue["severity"] = pin.type === "passive" && lp.pins.length <= 2 || pin.type === "power" || pin.type === "ground" ? "error" : "warning";
        add(sev, `${p.ref}.${pin.name}: pin not connected`, "Unconnected pins can leave a net floating or an IC unpowered.");
      }
      if (pin.type === "input" && conns === 1) add("warning", `${p.ref}.${pin.name}: input pin is floating`);
    });
    if (lp.sim === "R" && (p.value ?? lp.value ?? 0) <= 0) add("error", `${p.ref}: resistance must be > 0`);
    if (lp.sim !== "NONE" && lp.sim !== "GND" && lp.sim !== "V" && lp.sim !== "D" && lp.sim !== "OPAMP" && (p.value ?? lp.value ?? 0) <= 0 && lp.sim !== "I") add("error", `${p.ref}: value must be > 0`);
  }
  for (const [net, pins] of nets) {
    const types = pins.map((k) => { const [pid, pn] = k.split(":"); const part = sch.parts.find((p) => p.id === pid); return { ref: part?.ref ?? pid, pin: getElPart(part?.lib ?? "", custom)?.pins[Number(pn)] }; });
    const outs = types.filter((t) => t.pin?.type === "output");
    if (outs.length > 1) add("error", `Net ${net}: multiple outputs driven together (${outs.map((o) => `${o.ref}.${o.pin?.name}`).join(", ")})`, "Two push-pull outputs on one net can short each other.");
    if (types.some((t) => t.pin?.type === "power") && types.some((t) => t.pin?.type === "ground") && net !== "0") add("error", `Net ${net}: power pin and ground pin on the same net (short circuit)`);
    if (types.some((t) => t.pin?.type === "source") && types.some((t) => t.pin?.type === "ground") && net !== "0") add("error", `Net ${net}: supply output shorted to a ground pin`);
    if (net !== "0" && types.some((t) => t.pin?.type === "ground")) add("warning", `Net ${net}: ground pin not on the GND net`, "Connect it to a Ground symbol or label the net GND.");
    if (types.some((t) => t.pin?.type === "power") && !types.some((t) => t.pin?.type === "source" || t.pin?.type === "output")) add("warning", `Net ${net}: power input has no driver (no supply output, regulator or battery)`);
  }
  const volts = sch.parts.filter((p) => getElPart(p.lib, custom)?.sim === "V");
  const seen = new Map<string, string>();
  for (const v of volts) { const a = netOf.get(pinKey(v.id, 0)), b = netOf.get(pinKey(v.id, 1)); if (!a || !b) continue; if (a === b) add("error", `${v.ref}: source terminals shorted together`); const key = [a, b].sort().join("|"); if (seen.has(key)) add("error", `${v.ref} and ${seen.get(key)}: voltage sources in parallel`, "Ideal voltage sources in parallel make the matrix singular."); else seen.set(key, v.ref); }
  const unsimulated = sch.parts.filter((p) => getElPart(p.lib, custom)?.sim === "NONE");
  if (unsimulated.length) add("info", `Not simulated (no model): ${unsimulated.map((p) => p.ref).join(", ")}`, "These parts are kept for connectivity/PCB/BOM only.");
  return issues;
}

// ---------------------------------------------------------------- Simulation (MNA)
type ElK = "R" | "C" | "L" | "V" | "I" | "D" | "OPAMP";
interface El { id: string; part: string; k: ElK; a: number; b: number; c: number; d: number; val: number; br: number; is: number; nvt: number; wave: SchPart["props"] | undefined; vprev: number; iprev: number; vd: number }
export interface SimOptions { tran?: { tstop: number; dt: number }; tolRandom?: boolean; zeroSources?: boolean; inject?: { a: string; b: string; i: number } }
export interface SimResult {
  ok: boolean; error?: string; nets: string[];
  op: Record<string, number>; opI: Record<string, number>; opP: Record<string, number>;
  t: number[]; v: Record<string, number[]>; i: Record<string, number[]>; warnings: string[]; notSimulated: string[]; elapsedMs: number;
}
const VT = 0.025852;
export function sourceValue(w: SchPart["props"] | undefined, dc: number, t: number): number {
  const wave = w?.wave ?? "dc";
  if (wave === "dc") return dc;
  const amp = w?.amp ?? 1, f = w?.freq ?? 1000, off = w?.offset ?? 0, ph = (((t * f) % 1) + 1) % 1;
  if (wave === "sine") return off + amp * Math.sin(2 * Math.PI * f * t);
  if (wave === "square") return off + (ph < (w?.duty ?? 0.5) ? amp : -amp);
  return off + amp * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-15) return null;
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f === 0) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}

export function simulate(sch: Schematic, custom: ElPart[] = [], opt: SimOptions = {}): SimResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const res: SimResult = { ok: false, nets: [], op: {}, opI: {}, opP: {}, t: [], v: {}, i: {}, warnings: [], notSimulated: [], elapsedMs: 0 };
  const { netOf, nets } = buildNets(sch, custom);
  if (!nets.has("0")) { res.error = "No ground node (add a Ground symbol)"; return res; }
  const netNames = ["0", ...Array.from(nets.keys()).filter((n) => n !== "0")];
  const nIdx = new Map(netNames.map((n, i) => [n, i]));
  const node = (p: SchPart, pin: number) => nIdx.get(netOf.get(pinKey(p.id, pin)) ?? "0") ?? 0;
  const els: El[] = [];
  let br = 0;
  const mk = (partial: Partial<El> & { id: string; part: string; k: ElK }): El => ({ a: 0, b: 0, c: 0, d: 0, val: 0, br: -1, is: 0, nvt: 0, wave: undefined, vprev: 0, iprev: 0, vd: 0, ...partial });
  const tol = (p: SchPart, v: number) => (opt.tolRandom && p.props?.tol ? v * (1 + ((Math.random() * 2 - 1) * (p.props.tol)) / 100) : v);
  for (const p of sch.parts) {
    const lp = getElPart(p.lib, custom);
    if (!lp) continue;
    const val = p.value ?? lp.value ?? 0;
    switch (lp.sim) {
      case "R": els.push(mk({ id: p.id, part: p.id, k: "R", a: node(p, 0), b: node(p, 1), val: Math.max(1e-3, tol(p, val)) })); break;
      case "C": els.push(mk({ id: p.id, part: p.id, k: "C", a: node(p, 0), b: node(p, 1), val: tol(p, val) })); break;
      case "L": els.push(mk({ id: p.id, part: p.id, k: "L", a: node(p, 0), b: node(p, 1), val: tol(p, val), br: br++ })); break;
      case "V": els.push(mk({ id: p.id, part: p.id, k: "V", a: node(p, 0), b: node(p, 1), val, br: br++, wave: lp.id === "siggen" ? { wave: "sine", amp: 0.5, freq: 440, offset: 0, ...p.props } : p.props })); break;
      case "D": { const led = lp.id === "led"; els.push(mk({ id: p.id, part: p.id, k: "D", a: node(p, 0), b: node(p, 1), is: led ? 1.1e-18 : 2.5e-9, nvt: (led ? 2 : 1.75) * VT })); break; }
      case "POT": { const pos = Math.min(0.999, Math.max(0.001, p.props?.pos ?? 0.5)); els.push(mk({ id: p.id + "#1", part: p.id, k: "R", a: node(p, 0), b: node(p, 1), val: Math.max(1e-3, tol(p, val) * pos) }), mk({ id: p.id + "#2", part: p.id, k: "R", a: node(p, 1), b: node(p, 2), val: Math.max(1e-3, tol(p, val) * (1 - pos)) })); break; }
      case "OPAMP": els.push(mk({ id: p.id, part: p.id, k: "OPAMP", a: node(p, 0), b: node(p, 1), c: node(p, 2), br: br++ })); res.warnings.push(`${p.ref}: ideal op-amp model (no rail clipping / bandwidth / offset).`); break;
      case "NONE": res.notSimulated.push(p.ref); break;
      default: break;
    }
  }
  if (opt.inject) {
    const a = nIdx.get(opt.inject.a), b = nIdx.get(opt.inject.b);
    if (a === undefined || b === undefined) { res.error = "Unknown probe net"; return res; }
    els.push(mk({ id: "__inj", part: "__inj", k: "I", a: b, b: a, val: opt.inject.i })); // current flows b -> a through source => into a
  }
  const nN = netNames.length - 1, M = nN + br;
  const hasNL = els.some((e) => e.k === "D");
  let limited = false;
  const row = (n: number) => n - 1;
  const assemble = (x: number[], tran: boolean, t: number, dt: number) => {
    const A = Array.from({ length: M }, () => new Array<number>(M).fill(0)), b = new Array<number>(M).fill(0);
    for (let n = 0; n < nN; n++) A[n][n] += 1e-12;
    const G = (a: number, c: number, g: number) => { if (a) A[row(a)][row(a)] += g; if (c) A[row(c)][row(c)] += g; if (a && c) { A[row(a)][row(c)] -= g; A[row(c)][row(a)] -= g; } };
    const I = (a: number, c: number, i: number) => { if (a) b[row(a)] -= i; if (c) b[row(c)] += i; };
    for (const e of els) {
      if (e.k === "R") G(e.a, e.b, 1 / e.val);
      else if (e.k === "C") { if (tran) { const g = e.val / dt; G(e.a, e.b, g); I(e.a, e.b, -g * e.vprev); } }
      else if (e.k === "I") I(e.a, e.b, opt.zeroSources && e.id !== "__inj" ? 0 : e.val);
      else if (e.k === "V" || e.k === "L") {
        const k = nN + e.br;
        if (e.a) { A[row(e.a)][k] += 1; A[k][row(e.a)] += 1; }
        if (e.b) { A[row(e.b)][k] -= 1; A[k][row(e.b)] -= 1; }
        if (e.k === "V") b[k] = opt.zeroSources ? 0 : sourceValue(e.wave, e.val, t);
        else if (tran) { A[k][k] -= e.val / dt; b[k] = -(e.val / dt) * e.iprev; }
      } else if (e.k === "OPAMP") {
        const k = nN + e.br;
        if (e.c) A[row(e.c)][k] -= 1;
        if (e.a) A[k][row(e.a)] += 1;
        if (e.b) A[k][row(e.b)] -= 1;
      } else if (e.k === "D") {
        const va = e.a ? x[row(e.a)] : 0, vb = e.b ? x[row(e.b)] : 0;
        const vcrit = e.nvt * Math.log(e.nvt / (Math.SQRT2 * e.is));
        let vn = va - vb;
        if (vn > vcrit && Math.abs(vn - e.vd) > 2 * e.nvt) { if (e.vd > 0) { const arg = 1 + (vn - e.vd) / e.nvt; vn = arg > 0 ? e.vd + e.nvt * Math.log(arg) : vcrit; } else vn = e.nvt * Math.log(vn / e.nvt); }
        if (Math.abs(vn - (va - vb)) > 1e-9) limited = true;
        e.vd = vn;
        const ex = Math.exp(Math.min(vn / e.nvt, 80)), id = e.is * (ex - 1), g = (e.is / e.nvt) * ex + 1e-12;
        G(e.a, e.b, g); I(e.a, e.b, id - g * vn);
      }
    }
    return { A, b };
  };
  const newton = (x0: number[], tran: boolean, t: number, dt: number): number[] | null => {
    let x = x0.slice();
    for (let it = 0; it < (hasNL ? 150 : 1); it++) {
      limited = false;
      const { A, b } = assemble(x, tran, t, dt);
      const xn = solve(A, b);
      if (!xn) return null;
      let dmax = 0;
      for (let i = 0; i < M; i++) dmax = Math.max(dmax, Math.abs(xn[i] - x[i]) - 1e-6 * Math.abs(xn[i]));
      x = xn;
      if (!hasNL || (dmax < 1e-7 && !limited)) return x;
    }
    res.warnings.push("Newton iteration did not fully converge (nonlinear devices).");
    return x;
  };
  const record = (x: number[], tran: boolean, dt: number) => {
    const volt = (n: number) => (n ? x[row(n)] : 0);
    const cur: Record<string, number> = {};
    for (const e of els) {
      let i = 0;
      if (e.k === "R") i = (volt(e.a) - volt(e.b)) / e.val;
      else if (e.k === "C") i = tran ? (e.val / dt) * (volt(e.a) - volt(e.b) - e.vprev) : 0;
      else if (e.k === "L" || e.k === "V") i = x[nN + e.br];
      else if (e.k === "OPAMP") i = x[nN + e.br];
      else if (e.k === "D") i = e.is * (Math.exp(Math.min((volt(e.a) - volt(e.b)) / e.nvt, 80)) - 1);
      else if (e.k === "I") i = e.val;
      cur[e.id] = i;
    }
    return { volt, cur };
  };
  const x0 = newton(new Array(M).fill(0), false, 0, 0);
  if (!x0) { res.error = "Singular matrix: check for voltage-source loops, shorted sources or floating sections"; return res; }
  const rec0 = record(x0, false, 0);
  netNames.forEach((n, i) => { res.op[n] = rec0.volt(i); });
  for (const e of els) {
    if (e.id === "__inj") continue;
    res.opI[e.id] = rec0.cur[e.id];
    const vab = rec0.volt(e.a) - rec0.volt(e.b);
    res.opP[e.id] = e.k === "OPAMP" ? 0 : vab * rec0.cur[e.id];
  }
  res.nets = netNames;
  res.ok = true;
  if (opt.tran) {
    const { tstop, dt } = opt.tran;
    const steps = Math.min(20000, Math.max(2, Math.round(tstop / dt)));
    netNames.forEach((n) => (res.v[n] = []));
    els.forEach((e) => { if (e.id !== "__inj") res.i[e.id] = []; });
    for (const e of els) { if (e.k === "C") e.vprev = rec0.volt(e.a) - rec0.volt(e.b); if (e.k === "L") e.iprev = x0[nN + e.br]; }
    let x = x0;
    for (let s = 0; s <= steps; s++) {
      const t = s * dt;
      if (s > 0) {
        const xn = newton(x, true, t, dt);
        if (!xn) { res.error = "Transient: singular matrix"; res.ok = false; break; }
        x = xn;
      }
      const r = record(x, s > 0, dt);
      res.t.push(t);
      netNames.forEach((n, i) => res.v[n].push(r.volt(i)));
      els.forEach((e) => { if (e.id !== "__inj") res.i[e.id].push(r.cur[e.id]); });
      for (const e of els) { if (e.k === "C") e.vprev = r.volt(e.a) - r.volt(e.b); if (e.k === "L") e.iprev = x[nN + e.br]; }
    }
  }
  res.elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return res;
}

// ---------------------------------------------------------------- measurements (simulated only)
/** Thevenin resistance seen between two nets with all sources zeroed (autoranging ohmmeter test current). */
export function measureResistance(sch: Schematic, custom: ElPart[], a: string, b: string): { ohms: number | null; v: number; itest: number } {
  for (const i of [1e-3, 1e-4, 1e-5, 1e-6]) {
    const r = simulate(sch, custom, { zeroSources: true, inject: { a, b, i } });
    if (!r.ok) return { ohms: null, v: 0, itest: i };
    const v = (r.op[a] ?? 0) - (r.op[b] ?? 0);
    if (Math.abs(v) < 2) return { ohms: Math.abs(v / i), v, itest: i };
  }
  return { ohms: null, v: 0, itest: 1e-6 };
}
/** Forward voltage drop with 1 mA test current (diode test mode). */
export function measureDiode(sch: Schematic, custom: ElPart[], a: string, b: string): { v: number | null } {
  const r = simulate(sch, custom, { zeroSources: true, inject: { a, b, i: 1e-3 } });
  if (!r.ok) return { v: null };
  const v = (r.op[a] ?? 0) - (r.op[b] ?? 0);
  return { v: Math.abs(v) > 3 ? null : v };
}
export const rms = (x: number[]) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));
export const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);

/** Operating-limit check against catalog supply ranges using a DC solution. */
export function checkSupplyLimits(sch: Schematic, custom: ElPart[], op: Record<string, number>): Issue[] {
  const { netOf } = buildNets(sch, custom);
  const issues: Issue[] = [];
  const simNets = new Set<string>();
  for (const q of sch.parts) { const lq = getElPart(q.lib, custom); if (lq && lq.sim !== "NONE" && lq.sim !== "GND") lq.pins.forEach((_, i) => { const n = netOf.get(pinKey(q.id, i)); if (n) simNets.add(n); }); }
  for (const p of sch.parts) {
    const lp = getElPart(p.lib, custom);
    if (!lp || !lp.v || lp.sim !== "NONE" && lp.sim !== "OPAMP") continue;
    const pw = lp.pins.findIndex((x) => x.type === "power"), gn = lp.pins.findIndex((x) => x.type === "ground");
    if (pw < 0) continue;
    if (!simNets.has(netOf.get(pinKey(p.id, pw)) ?? "")) continue;
    const vp = op[netOf.get(pinKey(p.id, pw)) ?? "0"] ?? 0, vg = gn >= 0 ? op[netOf.get(pinKey(p.id, gn)) ?? "0"] ?? 0 : 0;
    const vs = vp - vg;
    if (vs < lp.v[0] - 0.05 || vs > lp.v[1] + 0.05) issues.push({ id: `lim.${p.id}`, severity: "error", domain: "electronics", message: `${p.ref} (${lp.name}): supply ${vs.toFixed(2)} V outside the catalog range ${lp.v[0]}–${lp.v[1]} V`, params: [], explain: "Catalog range is typical; verify with datasheet." });
  }
  return issues;
}

export function toSpiceNetlist(sch: Schematic, custom: ElPart[] = [], tran?: { tstop: number; dt: number }): string {
  const { netOf } = buildNets(sch, custom);
  const n = (p: SchPart, i: number) => netOf.get(pinKey(p.id, i)) ?? "0";
  const L: string[] = ["* InstrumentAZ export - generated netlist (not executed in this build; run with ngspice)", ".model DGEN D(IS=2.5n N=1.75)", ".model DLED D(IS=1.1e-18 N=2)"];
  for (const p of sch.parts) {
    const lp = getElPart(p.lib, custom);
    if (!lp) continue;
    const val = p.value ?? lp.value ?? 0, r = p.ref.replace(/\s/g, "");
    switch (lp.sim) {
      case "R": L.push(`R_${r} ${n(p, 0)} ${n(p, 1)} ${val}`); break;
      case "C": L.push(`C_${r} ${n(p, 0)} ${n(p, 1)} ${val}`); break;
      case "L": L.push(`L_${r} ${n(p, 0)} ${n(p, 1)} ${val}`); break;
      case "POT": { const pos = p.props?.pos ?? 0.5; L.push(`R_${r}a ${n(p, 0)} ${n(p, 1)} ${(val * pos).toFixed(3)}`, `R_${r}b ${n(p, 1)} ${n(p, 2)} ${(val * (1 - pos)).toFixed(3)}`); break; }
      case "D": L.push(`D_${r} ${n(p, 0)} ${n(p, 1)} ${lp.id === "led" ? "DLED" : "DGEN"}`); break;
      case "V": { const w = p.props?.wave ?? (lp.id === "siggen" ? "sine" : "dc"); const amp = p.props?.amp ?? (lp.id === "siggen" ? 0.5 : 1), f = p.props?.freq ?? (lp.id === "siggen" ? 440 : 1000), off = p.props?.offset ?? 0; L.push(w === "dc" ? `V_${r} ${n(p, 0)} ${n(p, 1)} DC ${val}` : w === "sine" ? `V_${r} ${n(p, 0)} ${n(p, 1)} SIN(${off} ${amp} ${f})` : w === "square" ? `V_${r} ${n(p, 0)} ${n(p, 1)} PULSE(${off - amp} ${off + amp} 0 1n 1n ${(p.props?.duty ?? 0.5) / f} ${1 / f})` : `V_${r} ${n(p, 0)} ${n(p, 1)} PULSE(${off - amp} ${off + amp} 0 ${0.5 / f} ${0.5 / f} 1n ${1 / f})`); break; }
      case "OPAMP": L.push(`E_${r} ${n(p, 2)} 0 ${n(p, 0)} ${n(p, 1)} 1e6`); break;
      case "NONE": L.push(`* ${r} (${lp.name}) has no SPICE model in InstrumentAZ`); break;
      default: break;
    }
  }
  L.push(".op"); if (tran) L.push(`.tran ${tran.dt} ${tran.tstop}`); L.push(".end");
  return L.join("\n");
}

// ---------------------------------------------------------------- example circuits
let uid = 0;
const nid = (p: string) => `${p}${++uid}`;
export function exampleCircuit(name: "rc" | "led" | "preamp"): Schematic {
  const s = emptySchematic();
  const add = (lib: string, ref: string, x: number, y: number, value?: number, props?: SchPart["props"]) => { const id = nid("p"); s.parts.push({ id, lib, ref, x, y, value, props }); return id; };
  const w = (a: string, ap: number, b: string, bp: number) => s.wires.push({ id: nid("w"), a: { p: a, pin: ap }, b: { p: b, pin: bp } });
  if (name === "rc") {
    const g = add("siggen", "G1", 40, 120, undefined, { wave: "sine", amp: 1, freq: 1000, offset: 0, tol: 0 });
    const r = add("res", "R1", 180, 80, 1000, { tol: 5 }), c = add("cap", "C1", 320, 120, 1e-7, { tol: 10 });
    const gd = add("gnd", "GND", 200, 260), gd2 = add("gnd", "GND", 340, 260);
    w(g, 0, r, 0); w(r, 1, c, 0); w(g, 1, gd, 0); w(c, 1, gd2, 0);
    s.labels[pinKey(r, 1)] = "OUT"; s.labels[pinKey(g, 0)] = "IN";
  } else if (name === "led") {
    const v = add("psu", "V1", 40, 100, 5), r = add("res", "R1", 180, 80, 330, { tol: 5 }), d = add("led", "D1", 320, 100);
    const g1 = add("gnd", "GND", 40, 240), g2 = add("gnd", "GND", 340, 240);
    w(v, 0, r, 0); w(r, 1, d, 0); w(v, 1, g1, 0); w(d, 1, g2, 0);
    s.labels[pinKey(r, 1)] = "LED_A";
  } else {
    const g = add("siggen", "PK1", 20, 80, undefined, { wave: "sine", amp: 0.05, freq: 440, offset: 0 });
    const op = add("opamp", "U1", 200, 60), rf = add("res", "Rf", 260, 230, 10000, { tol: 1 }), rg = add("res", "Rg", 120, 260, 1000, { tol: 1 });
    const v = add("psu", "V1", 20, 280, 3.3), g1 = add("gnd", "GND", 20, 400), g2 = add("gnd", "GND", 140, 400), g3 = add("gnd", "GND", 340, 140);
    w(g, 0, op, 0); w(g, 1, g1, 0); w(op, 2, rf, 1); w(rf, 0, op, 1); w(rg, 0, op, 1); w(rg, 1, g2, 0);
    w(v, 0, op, 3); w(v, 1, g3, 0); w(op, 4, g3, 0);
    s.labels[pinKey(op, 2)] = "OUT"; s.labels[pinKey(g, 0)] = "IN";
  }
  return s;
}
