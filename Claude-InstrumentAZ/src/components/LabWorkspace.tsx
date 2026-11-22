"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getElPart } from "@/lib/iaz/catalog";
import { checkSupplyLimits, mean, measureDiode, measureResistance, rms, runERC, simulate, SimResult } from "@/lib/iaz/circuit";
import { formatSI } from "@/lib/iaz/si";
import { commit, go, useDoc } from "@/lib/iaz/store";
import { IssueList, NumInput, Prov, Section } from "./ui";

const sel = (id: string, v: string, set: (s: string) => void, opts: string[]) => <select key={id} className="input" value={v} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o === "0" ? "GND (0)" : o}</option>)}</select>;
const Card = ({ title, children, w }: { title: string; children: React.ReactNode; w?: string }) => <div className="panel" style={{ padding: 10, gridColumn: w }}><div className="h-title" style={{ marginBottom: 6 }}>{title} <Prov kind="approx" /></div>{children}</div>;

export default function LabWorkspace() {
  const doc = useDoc();
  const sch = doc.schematic;
  const [tdiv, setTdiv] = useState(0.001);
  const [preroll, setPreroll] = useState(0.002);
  const [vdiv, setVdiv] = useState([0.5, 0.5]);
  const [trig, setTrig] = useState(0);
  const [tolRand, setTolRand] = useState(false);
  const [seed, setSeed] = useState(0);
  const total = preroll + 2 * tdiv * 10, dt = total / 3200;
  const res: SimResult = useMemo(() => simulate(sch, doc.customParts, { tran: { tstop: total, dt }, tolRandom: tolRand }), [sch, doc.customParts, total, dt, tolRand, seed]);
  const erc = useMemo(() => runERC(sch, doc.customParts).filter((i) => i.severity !== "info"), [sch, doc.customParts]);
  const nets = res.nets.length ? res.nets : ["0"];
  const [ch1, setCh1] = useState("OUT"), [ch2, setCh2] = useState("IN");
  const [red, setRed] = useState("OUT"), [blk, setBlk] = useState("0");
  const [mode, setMode] = useState<"DCV" | "ACV" | "DCA" | "ACA" | "OHM" | "CONT" | "DIODE" | "CAP">("DCV");
  const [probePart, setProbePart] = useState("");
  const [lcrPart, setLcrPart] = useState("");
  const [rng, setRng] = useState(5);
  const scope = useRef<HTMLCanvasElement>(null), logic = useRef<HTMLCanvasElement>(null);
  const [lg, setLg] = useState<string[]>(["IN", "OUT", "0", "0"]);
  const supplyIssues = useMemo(() => (res.ok ? checkSupplyLimits(sch, doc.customParts, res.op) : []), [res, sch, doc.customParts]);
  const ensure = (n: string, fallback: string) => (nets.includes(n) ? n : nets.includes(fallback) ? fallback : nets[nets.length > 1 ? 1 : 0]);
  const c1 = ensure(ch1, "OUT"), c2 = ensure(ch2, "IN"), rd = ensure(red, "OUT"), bk = nets.includes(blk) ? blk : "0";
  const simParts = sch.parts.filter((p) => getElPart(p.lib, doc.customParts)?.sim !== "NONE" && getElPart(p.lib, doc.customParts)?.sim !== "GND");
  const iPart = simParts.some((p) => p.id === probePart) ? probePart : simParts[0]?.id ?? "";
  const lcrCands = sch.parts.filter((p) => ["R", "C", "L", "POT"].includes(getElPart(p.lib, doc.customParts)?.sim ?? ""));
  const lcr = lcrCands.find((p) => p.id === lcrPart) ?? lcrCands[0];
  const sources = sch.parts.filter((p) => getElPart(p.lib, doc.customParts)?.sim === "V");
  const tIdx = (t: number) => Math.min(res.t.length - 1, Math.max(0, Math.round(t / dt)));
  const i0 = tIdx(preroll);

  // trigger-aligned window
  const trigIdx = useMemo(() => { const v = res.v[c1]; if (!v) return i0; const n = tIdx(tdiv * 10); for (let i = i0 + 1; i < Math.min(v.length - 1, i0 + n); i++) if (v[i - 1] < trig && v[i] >= trig) return i; return i0; }, [res, c1, trig, i0, tdiv]); // eslint-disable-line react-hooks/exhaustive-deps
  const nWin = tIdx(tdiv * 10);
  const win = (net: string) => (res.v[net] ?? []).slice(trigIdx, trigIdx + nWin + 1);
  const measure = (net: string) => {
    const w = win(net); if (w.length < 3) return null;
    const m = mean(w), vpp = Math.max(...w) - Math.min(...w), cr: number[] = [];
    for (let i = 1; i < w.length; i++) if (w[i - 1] < m && w[i] >= m) cr.push(i - 1 + (m - w[i - 1]) / (w[i] - w[i - 1]));
    const f = cr.length >= 2 ? (cr.length - 1) / ((cr[cr.length - 1] - cr[0]) * dt) : null;
    return { vpp, vrms: rms(w), vac: rms(w.map((x) => x - m)), mean: m, max: Math.max(...w), min: Math.min(...w), f };
  };

  useEffect(() => {
    const c = scope.current; if (!c) return; const g = c.getContext("2d")!; const W = c.width, H = c.height;
    g.fillStyle = "#06120c"; g.fillRect(0, 0, W, H); g.strokeStyle = "#1d3a2a"; g.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo((i * W) / 10, 0); g.lineTo((i * W) / 10, H); g.stroke(); }
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, (i * H) / 8); g.lineTo(W, (i * H) / 8); g.stroke(); }
    [[c1, "#ffd23f", 0], [c2, "#3dc2c0", 1]].forEach(([net, col, k]) => { const w = win(net as string); if (w.length < 2) return; g.strokeStyle = col as string; g.lineWidth = 2; g.beginPath(); w.forEach((v, i) => { const x = (i / (w.length - 1)) * W, y = H / 2 - (v / vdiv[k as number]) * (H / 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); });
    g.strokeStyle = "#ff6b6b55"; g.beginPath(); g.moveTo(0, H / 2 - (trig / vdiv[0]) * (H / 8)); g.lineTo(W, H / 2 - (trig / vdiv[0]) * (H / 8)); g.stroke();
  });
  useEffect(() => {
    const c = logic.current; if (!c) return; const g = c.getContext("2d")!; g.fillStyle = "#06120c"; g.fillRect(0, 0, c.width, c.height);
    lg.forEach((n, ch) => { const w = win(n); if (w.length < 2) return; g.strokeStyle = ["#ffd23f", "#3dc2c0", "#ff6b9d", "#9be564"][ch]; g.lineWidth = 2; g.beginPath(); w.forEach((v, i) => { const x = (i / (w.length - 1)) * c.width, y = ch * 36 + (v > 1.65 ? 8 : 28); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); });
  });

  // DMM
  const dmm = (() => {
    if (!res.ok) return { text: "ERR", unit: "", note: res.error ?? "" };
    const vr = res.v[rd] ?? [], vb = res.v[bk] ?? [], d = vr.map((x, i) => x - vb[i]);
    if (mode === "DCV") return { text: formatSI(mean(d.slice(i0)), "V"), unit: "", note: `mean of simulated transient between ${rd} and ${bk}` };
    if (mode === "ACV") return { text: formatSI(rms(d.slice(i0).map((x) => x - mean(d.slice(i0)))), "V rms"), unit: "", note: "True-RMS, AC-coupled (simulated)" };
    if (mode === "DCA" || mode === "ACA") {
      const ids = Object.keys(res.i).filter((k) => k === iPart || k.startsWith(iPart + "#")); const w = (res.i[ids[0]] ?? []).slice(i0);
      if (!w.length) return { text: "—", unit: "", note: "Select a simulated component" };
      return { text: mode === "DCA" ? formatSI(mean(w), "A") : formatSI(rms(w.map((x) => x - mean(w))), "A rms"), unit: "", note: `through ${sch.parts.find((p) => p.id === iPart)?.ref}, pin1→pin2 (series insertion model)` };
    }
    if (mode === "OHM" || mode === "CONT") { const r = measureResistance(sch, doc.customParts, rd, bk); return mode === "OHM" ? { text: r.ohms == null ? "OL" : formatSI(r.ohms, "Ω"), unit: "", note: `sources zeroed, test current ${formatSI(r.itest, "A")}` } : { text: r.ohms != null && r.ohms < 50 ? `BEEP ${formatSI(r.ohms, "Ω")}` : "OPEN", unit: "", note: "continuity threshold 50 Ω (simulated)" }; }
    if (mode === "DIODE") { const r = measureDiode(sch, doc.customParts, rd, bk); return { text: r.v == null ? "OL" : formatSI(r.v, "V"), unit: "", note: "1 mA test current, sources zeroed" }; }
    return { text: "n/a", unit: "", note: "Capacitance on circuit nodes is not implemented; use the LCR meter for a component's model value." };
  })();
  const dcv = res.ok ? mean(((res.v[rd] ?? []).map((x, i) => x - (res.v[bk]?.[i] ?? 0))).slice(i0)) : 0;
  const mc = useMemo(() => { if (!res.ok) return null; const out: number[] = []; for (let k = 0; k < 40; k++) { const r = simulate(sch, doc.customParts, { tolRandom: true }); if (r.ok) out.push((r.op[rd] ?? 0) - (r.op[bk] ?? 0)); } if (!out.length) return null; const m = mean(out); return { min: Math.min(...out), max: Math.max(...out), mean: m, sd: Math.sqrt(mean(out.map((x) => (x - m) ** 2))) }; }, [sch, doc.customParts, rd, bk, res.ok]);
  const m1 = measure(c1), m2 = measure(c2);
  const upPart = (id: string, patch: Record<string, unknown>, value?: number) => commit("Instrument setting", (d) => ({ ...d, schematic: { ...d.schematic, parts: d.schematic.parts.map((p) => (p.id === id ? { ...p, ...(value != null ? { value } : {}), props: { ...p.props, ...patch } } : p)) } }), `lab:${id}${Object.keys(patch)[0] ?? "v"}`);
  const needle = Math.max(-1, Math.min(1.1, dcv / rng)) * 70 - 35;
  const pTot = res.ok ? Object.entries(res.opP).reduce((s, [k, p]) => s + (k.includes("#") || sch.parts.find((x) => x.id === k && getElPart(x.lib, doc.customParts)?.sim === "V") ? 0 : p), 0) : 0;
  const pSup = res.ok ? -Object.entries(res.opP).filter(([k]) => sch.parts.find((x) => x.id === k && getElPart(x.lib, doc.customParts)?.sim === "V")).reduce((s, [, p]) => s + p, 0) : 0;

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 8 }}>
      <div className="panel" style={{ padding: 8, marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b>Virtual Electronics Lab</b> <Prov kind="approx" />
        <span className="muted">All readings come from the MNA simulation of the current schematic ({sch.parts.length} parts, {nets.length} nets). No hardware instrument is connected: hardware measurement is <b>not supported</b> in this build.</span>
        <span style={{ marginLeft: "auto" }}>{res.ok ? <span className="sev-info">Simulation OK · {res.elapsedMs.toFixed(0)} ms</span> : <span className="sev-error">{res.error}</span>}</span>
        <button className="btn" onClick={() => go("electronics")}>Edit schematic</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 8 }}>
        <Card title="Oscilloscope" w="span 2">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <canvas ref={scope} width={640} height={320} style={{ borderRadius: 6, maxWidth: "100%", border: "1px solid #1d3a2a" }} />
            <div style={{ minWidth: 220, flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div style={{ color: "#ffd23f" }}>CH1 {sel("c1", c1, setCh1, nets)}<NumInput value={vdiv[0]} onChange={(n) => n > 0 && setVdiv([n, vdiv[1]])} /><span className="muted" style={{ fontSize: 10 }}>V/div</span></div>
                <div style={{ color: "#3dc2c0" }}>CH2 {sel("c2", c2, setCh2, nets)}<NumInput value={vdiv[1]} onChange={(n) => n > 0 && setVdiv([vdiv[0], n])} /><span className="muted" style={{ fontSize: 10 }}>V/div</span></div>
                <div><label className="muted">Time/div (s)</label><select className="input" value={tdiv} onChange={(e) => setTdiv(Number(e.target.value))}>{[1e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2].map((t) => <option key={t} value={t}>{formatSI(t, "s")}</option>)}</select></div>
                <div><label className="muted">Trigger level CH1 (V, rising)</label><NumInput value={trig} onChange={setTrig} /></div>
                <div><label className="muted">Pre-roll (s)</label><NumInput value={preroll * 1000} onChange={(n) => setPreroll(Math.max(0, n) / 1000)} /><span className="muted" style={{ fontSize: 10 }}>ms (settling)</span></div>
              </div>
              <table className="t mono" style={{ marginTop: 8 }}><thead><tr><th /><th style={{ color: "#ffd23f" }}>CH1</th><th style={{ color: "#3dc2c0" }}>CH2</th></tr></thead><tbody>
                {([["Vpp", "vpp", "V"], ["Vrms", "vrms", "V"], ["Vmean", "mean", "V"], ["Vmax", "max", "V"], ["Vmin", "min", "V"], ["Freq", "f", "Hz"]] as const).map(([l, k, u]) => <tr key={l}><td>{l}</td><td>{m1 && m1[k] != null ? formatSI(m1[k] as number, u) : "—"}</td><td>{m2 && m2[k] != null ? formatSI(m2[k] as number, u) : "—"}</td></tr>)}
                {m1 && m2 && m1.f && m2.f && <tr><td>Gain CH1/CH2</td><td colSpan={2}>{(m1.vpp / (m2.vpp || 1)).toFixed(3)} ({(20 * Math.log10(m1.vpp / (m2.vpp || 1))).toFixed(2)} dB)</td></tr>}
              </tbody></table>
              {dt > 0 && sources.some((s) => (s.props?.freq ?? 0) * dt > 0.1) && <div className="sev-warning" style={{ fontSize: 11, marginTop: 4 }}>Warning: time step {formatSI(dt, "s")} gives &lt;10 samples per period of a source — waveform is under-sampled (aliasing).</div>}
            </div>
          </div>
        </Card>

        <Card title="Signal generator & bench power supply">
          {sources.length === 0 && <div className="muted">Add “Signal generator” or “Bench power supply” parts in the schematic.</div>}
          {sources.map((s) => { const e = getElPart(s.lib, doc.customParts)!, isGen = e.id === "siggen", i = res.opI[s.id]; return (
            <div key={s.id} className="panel2" style={{ padding: 8, margin: "4px 0" }}>
              <b>{s.ref}</b> <span className="muted">{e.name}</span>
              {isGen ? <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginTop: 4 }}>
                <select className="input" value={s.props?.wave ?? "sine"} onChange={(ev) => upPart(s.id, { wave: ev.target.value })}><option value="sine">Sine</option><option value="square">Square</option><option value="triangle">Triangle</option><option value="dc">DC</option></select>
                <div><NumInput value={s.props?.freq ?? 440} onChange={(n) => upPart(s.id, { freq: Math.max(0.1, n) })} /><span className="muted" style={{ fontSize: 10 }}>Hz</span></div>
                <div><NumInput value={s.props?.amp ?? 0.5} onChange={(n) => upPart(s.id, { amp: n })} /><span className="muted" style={{ fontSize: 10 }}>V peak</span></div>
                <div><NumInput value={s.props?.offset ?? 0} onChange={(n) => upPart(s.id, { offset: n })} /><span className="muted" style={{ fontSize: 10 }}>offset V</span></div>
              </div> : <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}><div style={{ width: 90 }}><NumInput value={s.value ?? e.value ?? 0} onChange={(n) => upPart(s.id, {}, n)} /></div><span>V</span>
                <span className="mono" style={{ marginLeft: "auto" }}>{res.ok && i != null ? `${formatSI(-i, "A")} supplied · ${formatSI(-(res.opP[s.id] ?? 0), "W")}` : "—"}</span></div>}
            </div>); })}
        </Card>

        <Card title="Digital multimeter">
          <div style={{ background: "#9fb58a", color: "#1a2410", borderRadius: 6, padding: "10px 14px", fontFamily: "ui-monospace, Consolas", fontSize: 30, textAlign: "right", minHeight: 48 }}>{dmm.text}</div>
          <div className="muted" style={{ fontSize: 11, margin: "3px 0 6px" }}>{dmm.note}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="DCV">V DC</option><option value="ACV">V AC</option><option value="DCA">A DC</option><option value="ACA">A AC</option><option value="OHM">Ω</option><option value="CONT">Continuity</option><option value="DIODE">Diode test</option><option value="CAP">Capacitance</option></select>
            {mode.endsWith("A") && !["CAP"].includes(mode) && mode !== "ACV" && mode !== "DCV" ? sel("ip", iPart, setProbePart, simParts.map((p) => p.id)) : <>{sel("r", rd, setRed, nets)}{sel("b", bk, setBlk, nets)}</>}
            {mode.endsWith("A") && <div className="muted" style={{ fontSize: 10, gridColumn: "span 2" }}>{simParts.map((p) => p.ref).join(", ")}</div>}
          </div>
          {mode === "DCV" && mc && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Tolerance analysis (40 Monte-Carlo DC runs, part tolerances): {formatSI(mc.min, "V")} … {formatSI(mc.max, "V")} (σ {formatSI(mc.sd, "V")})</div>}
        </Card>

        <Card title="Analog-style multimeter">
          <svg viewBox="0 0 200 110" style={{ width: "100%", maxWidth: 320, background: "#e9e2c9", borderRadius: 6 }}>
            {Array.from({ length: 11 }, (_, i) => { const a = ((i / 10) * 70 - 35) * (Math.PI / 180) * 1, x1 = 100 + Math.sin(a) * 80, y1 = 100 - Math.cos(a) * 80, x2 = 100 + Math.sin(a) * 70, y2 = 100 - Math.cos(a) * 70; return <g key={i}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth="1.5" /><text x={100 + Math.sin(a) * 60} y={100 - Math.cos(a) * 60} fontSize="8" textAnchor="middle" fill="#222">{((i / 10) * rng).toFixed(rng < 3 ? 1 : 0)}</text></g>; })}
            <line x1="100" y1="100" x2={100 + Math.sin((needle * Math.PI) / 180) * 78} y2={100 - Math.cos((needle * Math.PI) / 180) * 78} stroke="#b00" strokeWidth="2" />
            <circle cx="100" cy="100" r="5" fill="#222" /><text x="100" y="20" fontSize="9" textAnchor="middle" fill="#222">DC V (range {rng} V)</text>
          </svg>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>{[1, 2.5, 5, 10, 50].map((r) => <button key={r} className={`btn ${rng === r ? "btn-active" : ""}`} onClick={() => setRng(r)}>{r} V</button>)}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Uses the DMM probe nets ({rd} vs {bk}). Needle pegs when over range, like a real analog meter.</div>
        </Card>

        <Card title="Logic analyzer (threshold 1.65 V)">
          <canvas ref={logic} width={520} height={150} style={{ borderRadius: 6, border: "1px solid #1d3a2a", maxWidth: "100%" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginTop: 4 }}>{lg.map((n, i) => <div key={i}>{sel("l" + i, nets.includes(n) ? n : "0", (s) => setLg(lg.map((x, j) => (j === i ? s : x))), nets)}</div>)}</div>
        </Card>

        <Card title="LCR meter (component model value)">
          {lcr ? <>{sel("lcr", lcr.id, setLcrPart, lcrCands.map((p) => p.id))}
            {(() => { const e = getElPart(lcr.lib, doc.customParts)!, v = lcr.value ?? e.value ?? 0, tl = lcr.props?.tol ?? 0; return <div className="mono" style={{ fontSize: 22, marginTop: 6 }}>{lcr.ref}: {formatSI(v, e.unit ?? "")}<div className="muted" style={{ fontSize: 12 }}>tolerance ±{tl}% → {formatSI(v * (1 - tl / 100), e.unit ?? "")} … {formatSI(v * (1 + tl / 100), e.unit ?? "")} · ESR/Q not modelled</div></div>; })()}</> : <div className="muted">No R/C/L parts in the schematic.</div>}
          <label style={{ display: "flex", gap: 6, marginTop: 8 }}><input type="checkbox" checked={tolRand} onChange={(e) => setTolRand(e.target.checked)} />Randomise tolerances in simulation</label>
          {tolRand && <button className="btn" onClick={() => setSeed(seed + 1)}>Re-draw random parts</button>}
        </Card>

        <Card title="Voltage / current probes & power" w="span 2">
          {res.ok ? <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}><div className="h-title">Nets (transient window)</div><table className="t mono"><thead><tr><th>Net</th><th>DC op</th><th>mean</th><th>Vrms</th><th>min</th><th>max</th></tr></thead><tbody>{nets.map((n) => { const w = (res.v[n] ?? []).slice(i0); return <tr key={n}><td>{n === "0" ? "GND" : n}</td><td>{formatSI(res.op[n], "V")}</td><td>{formatSI(mean(w), "V")}</td><td>{formatSI(rms(w), "V")}</td><td>{formatSI(Math.min(...w), "V")}</td><td>{formatSI(Math.max(...w), "V")}</td></tr>; })}</tbody></table></div>
            <div style={{ flex: 1, minWidth: 280 }}><div className="h-title">Components</div><table className="t mono"><thead><tr><th>Ref</th><th>I (op)</th><th>I rms</th><th>P (op)</th></tr></thead><tbody>{Object.keys(res.opI).map((k) => { const p = sch.parts.find((x) => x.id === k.split("#")[0]); const w = (res.i[k] ?? []).slice(i0); return <tr key={k}><td>{p?.ref}{k.includes("#") ? k.slice(k.indexOf("#")) : ""}</td><td>{formatSI(res.opI[k], "A")}</td><td>{formatSI(rms(w), "A")}</td><td>{formatSI(res.opP[k] ?? 0, "W")}</td></tr>; })}</tbody></table>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>Power balance (DC op): sources deliver {formatSI(pSup, "W")}, passive/active parts absorb {formatSI(pTot, "W")}.</div></div>
          </div> : <div className="sev-error">{res.error}</div>}
        </Card>

        <Card title="Checks, warnings and unsupported items" w="span 2">
          <IssueList issues={[...erc, ...supplyIssues]} />
          {res.warnings.map((w, i) => <div key={i} className="sev-warning" style={{ fontSize: 11 }}>• {w}</div>)}
          {res.notSimulated.length > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Not simulated (no model): {res.notSimulated.join(", ")} — they do not affect the results above.</div>}
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Not implemented: AC (frequency-sweep) analysis, BJT/MOSFET models, real op-amp limits, DMM capacitance mode on nodes. Export the SPICE netlist from the schematic to cross-check in ngspice.</div>
        </Card>
      </div>
    </div>
  );
}
