"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACOUSTIC_ASSUMPTIONS, evaluate } from "@/lib/iaz/params";
import { AudioOptions, AudioResult, bodyMagDb, bodyModes, fftMagDb, noteName, renderTone, stringShape } from "@/lib/iaz/audio";
import { freshness, markComputed } from "@/lib/iaz/doc";
import { commit, go, markArtifacts, toast, useDoc, useVals } from "@/lib/iaz/store";
import { download, fmt, ParamRow, Prov, Resizable, Section, Unsupported } from "./ui";

function Chart({ series, w = 560, h = 210, xlog, xl, yl, marks, ymin, ymax }: { series: { pts: [number, number][]; color: string; label?: string }[]; w?: number; h?: number; xlog?: boolean; xl: string; yl: string; marks?: { x: number; label: string; color?: string }[]; ymin?: number; ymax?: number }) {
  const all = series.flatMap((s) => s.pts);
  const xs = all.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = ymin ?? Math.min(...all.map((p) => p[1])), y1 = ymax ?? Math.max(...all.map((p) => p[1]));
  const fx = (x: number) => (xlog ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / (x1 - x0 || 1));
  const X = (x: number) => 38 + fx(x) * (w - 48), Y = (y: number) => h - 24 - ((y - y0) / (y1 - y0 || 1)) * (h - 36);
  return (
    <svg width={w} height={h} style={{ background: "var(--bg)", borderRadius: 6, maxWidth: "100%" }} viewBox={`0 0 ${w} ${h}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={38} x2={w - 10} y1={Y(y0 + t * (y1 - y0))} y2={Y(y0 + t * (y1 - y0))} stroke="var(--grid)" /><text x={2} y={Y(y0 + t * (y1 - y0)) + 3} fontSize="9" fill="var(--muted)">{fmt(y0 + t * (y1 - y0), 0)}</text></g>)}
      {series.map((s, i) => <polyline key={i} fill="none" stroke={s.color} strokeWidth="1.8" points={s.pts.map((p) => `${X(p[0])},${Y(Math.max(y0, Math.min(y1, p[1])))}`).join(" ")} />)}
      {marks?.map((m, i) => <g key={i}><line x1={X(m.x)} x2={X(m.x)} y1={8} y2={h - 24} stroke={m.color ?? "var(--accent2)"} strokeDasharray="3 3" /><text x={X(m.x) + 2} y={14 + (i % 3) * 10} fontSize="9" fill={m.color ?? "var(--accent2)"}>{m.label}</text></g>)}
      <text x={w - 10} y={h - 6} fontSize="10" fill="var(--muted)" textAnchor="end">{xl}</text><text x={40} y={h - 6} fontSize="10" fill="var(--muted)">{yl}</text>
    </svg>
  );
}

function wav(samples: Float32Array, fs: number): Blob {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
  return new Blob([b], { type: "audio/wav" });
}

export function AudioWorkspace() {
  const doc = useDoc();
  const vals = useVals();
  const opt = doc.audio;
  const [key, setKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [A, setA] = useState<AudioResult | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const src = useRef<AudioBufferSourceNode | null>(null);
  const wf = useRef<HTMLCanvasElement>(null);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setKey((k) => k + 1), 250); return () => clearTimeout(timer.current); }, [doc.values, opt]);
  const res = useMemo(() => renderTone(vals, opt), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { markArtifacts(["art.audio"]); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = useMemo(() => fftMagDb(res.samples, 16384), [res]);
  const fr = spec.f(res.fs);
  const modes = bodyModes(vals);
  useEffect(() => {
    const c = wf.current; if (!c) return; const g = c.getContext("2d")!; g.fillStyle = "#0a0f16"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#e8a33d"; g.beginPath();
    const seg = Math.floor(res.fs * 0.03), st = Math.floor(res.samples.length / 2);
    for (let i = 0; i < seg; i++) { const x = (i / seg) * c.width, y = c.height / 2 - res.samples[st + i] * (c.height / 2 - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.strokeStyle = "#2a3444"; g.beginPath(); g.moveTo(0, c.height / 2); g.lineTo(c.width, c.height / 2); g.stroke();
  }, [res]);
  const set = (p: Partial<AudioOptions>) => commit("Audio setting", (d) => ({ ...d, audio: { ...d.audio, ...p } }), "audio");
  const play = (r: AudioResult) => {
    ctx.current ??= new AudioContext(); src.current?.stop();
    const buf = ctx.current.createBuffer(1, r.samples.length, r.fs); buf.copyToChannel(r.samples as Float32Array<ArrayBuffer>, 0);
    const s = ctx.current.createBufferSource(); s.buffer = buf; s.connect(ctx.current.destination); s.start(); src.current = s;
  };
  const nn = noteName(res.f0);
  const specPts: [number, number][] = []; fr.forEach((f, i) => { if (f > 60 && f < 8000 && i % 2 === 0) specPts.push([f, spec.db[i]]); });
  const dbMax = Math.max(...specPts.map((p) => p[1]));
  return (
    <div style={{ display: "flex", height: "100%", padding: 8 }}>
      <Resizable side="left" def={310} id="audio-left">
        <Section title="Playing"><ParamRow id="play.string" /><ParamRow id="play.semitones" /><ParamRow id="bow.speed" /><ParamRow id="bow.force" /><ParamRow id="bow.beta" /><ParamRow id="bow.dir" />
          <div className="muted" style={{ fontSize: 11 }}>Schelleng window (rough): {fmt(vals["play.minForce"], 2)}–{fmt(vals["play.maxForce"], 2)} N</div></Section>
        <Section title="Signal chain">
          <select className="input" value={opt.chain} onChange={(e) => set({ chain: e.target.value as "acoustic" | "pickup" })}><option value="acoustic">Acoustic radiation (body response)</option><option value="pickup">Pickup → preamp → amp → speaker</option></select>
          {opt.chain === "pickup" && <><ParamRow id="el.pickup.type" />{vals["el.pickup.type"] > 0.5 && <ParamRow id="el.pickup.dist" />}<ParamRow id="el.preamp.gain" /><ParamRow id="el.amp.power" /><label style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={opt.speaker} onChange={(e) => set({ speaker: e.target.checked })} />Small speaker high-pass (assumed 320 Hz)</label></>}
        </Section>
        <Section title="DSP (procedural)">
          <label className="muted">Low-pass cutoff {opt.dspLpf} Hz</label><input type="range" min={500} max={16000} step={100} value={opt.dspLpf} onChange={(e) => set({ dspLpf: Number(e.target.value) })} />
          <label className="muted">Delay {opt.delayMs} ms · mix {Math.round(opt.delayMix * 100)}%</label><input type="range" min={20} max={600} value={opt.delayMs} onChange={(e) => set({ delayMs: Number(e.target.value) })} /><input type="range" min={0} max={0.6} step={0.05} value={opt.delayMix} onChange={(e) => set({ delayMix: Number(e.target.value) })} />
          <ParamRow id="el.dsp.buffer" /><ParamRow id="el.dsp.fs" /><ParamRow id="el.dsp.latency" /><ParamRow id="el.dsp.load" />
        </Section>
      </Resizable>
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "0 8px" }}>
        <div className="panel" style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => play(res)}>▶ Play</button><button className="btn" onClick={() => src.current?.stop()}>■ Stop</button>
          <button className="btn" onClick={() => { setA(res); toast("Held as A"); }}>Hold as A</button><button className="btn" disabled={!A} onClick={() => A && play(A)}>▶ Play A</button>
          <button className="btn" onClick={() => download(`${doc.name}-${nn.name}.wav`, wav(res.samples, res.fs))}>Save WAV</button>
          <b className="mono">{fmt(res.f0, 2)} Hz · {nn.name} {nn.cents >= 0 ? "+" : ""}{nn.cents.toFixed(0)}¢</b><Prov kind="approx" />
          <span className="muted">Regime: <b style={{ color: res.bowRegime === "Helmholtz (clean)" ? "var(--ok)" : "var(--warn)" }}>{res.bowRegime}</b> · peak {fmt(res.stats.peak, 2)} · RMS {fmt(res.stats.levelDb, 1)} dBFS</span>
        </div>
        <div className="panel" style={{ padding: 10, marginTop: 8 }}>
          <div className="h-title">Waveform (30 ms) — generated procedurally, no samples used</div>
          <canvas ref={wf} width={900} height={140} style={{ width: "100%", borderRadius: 6 }} />
        </div>
        <div className="panel" style={{ padding: 10, marginTop: 8 }}>
          <div className="h-title">Spectrum (FFT of render, dB) with body-mode markers</div>
          <Chart series={[{ pts: specPts, color: "var(--accent)" }, { pts: Array.from({ length: 120 }, (_, i) => { const f = 100 * Math.pow(80, i / 119); return [f, dbMax - 10 + bodyMagDb(modes, f) - bodyMagDb(modes, modes[2].f)] as [number, number]; }), color: "var(--accent2)" }]} xlog w={900} h={240} xl="Hz (log)" yl="dB" ymin={dbMax - 90} ymax={dbMax + 5} marks={opt.chain === "acoustic" ? modes.map((m) => ({ x: m.f, label: m.name })) : []} />
          <div className="muted" style={{ fontSize: 11 }}>Orange: rendered spectrum. Cyan: body response curve (shape only, offset for display).</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div className="panel" style={{ padding: 10 }}><div className="h-title">Harmonics (relative amplitude)</div>
            <svg width="100%" height="110" viewBox="0 0 400 110">{res.partials.slice(0, 40).map((p, i) => <rect key={i} x={i * 10 + 2} y={100 - p.amp * 90} width="7" height={p.amp * 90} fill="var(--accent)" />)}</svg></div>
          <div className="panel" style={{ padding: 10 }}><div className="h-title">Notes & clipping</div>
            {res.notes.length ? res.notes.map((n, i) => <div key={i} className="sev-warning" style={{ fontSize: 12, margin: "3px 0" }}>• {n}</div>) : <div className="muted">No warnings.</div>}
            {opt.chain === "pickup" && <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Preamp clip {fmt(res.stats.preClipPct, 1)}% · amp clip {fmt(res.stats.ampClipPct, 1)}%</div>}</div>
        </div>
        <div className="muted" style={{ margin: "8px 2px", fontSize: 11 }}>Model: Helmholtz-motion harmonic series (1/n^tilt) shaped by bow force/position heuristics → body modes (scaling estimates) or pickup/preamp/amp (tanh saturation, assumed signal levels) → low-pass & feedback delay. It is a procedural approximation for design exploration, <b>not</b> a validated physical simulation of a violin. Bow–string stick-slip dynamics are not integrated in time.</div>
      </div>
    </div>
  );
}

export function SimulationWorkspace() {
  const doc = useDoc();
  const vals = useVals();
  const modes = bodyModes(vals);
  const ref = useMemo(() => evaluate({}), []);
  const refModes = bodyModes(ref);
  const stale = freshness(doc, vals, "art.acoustic"), staleS = freshness(doc, vals, "art.string");
  const cv = useRef<HTMLCanvasElement>(null);
  const [anim, setAnim] = useState(true);
  useEffect(() => {
    let raf = 0; const c = cv.current; if (!c) return; const g = c.getContext("2d")!; const t0 = performance.now();
    const draw = () => { const t = ((performance.now() - t0) / 1000) * (anim ? 1 : 0); const slow = vals["play.freq"] / 1; g.fillStyle = "#0a0f16"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#e8a33d"; g.lineWidth = 2;
      for (const [ph, a] of [[0, 1], [0.04, 0.35], [-0.04, 0.35]]) { g.globalAlpha = a; g.beginPath(); for (let i = 0; i <= 200; i++) { const x = i / 200, y = stringShape(x, t / (slow / 4) + ph, vals["play.freq"] / (slow / 4), vals["bow.beta"], 30); i ? g.lineTo(x * c.width, c.height / 2 - y * 55) : g.moveTo(x * c.width, c.height / 2 - y * 55); } g.stroke(); }
      g.globalAlpha = 1; g.strokeStyle = "#3dc2c0"; g.beginPath(); g.moveTo(vals["bow.beta"] * c.width, 10); g.lineTo(vals["bow.beta"] * c.width, c.height - 10); g.stroke(); g.fillStyle = "#3dc2c0"; g.fillText("bow", vals["bow.beta"] * c.width + 4, 20);
      raf = requestAnimationFrame(draw); };
    draw(); return () => cancelAnimationFrame(raf);
  }, [anim, vals]);
  const respPts = Array.from({ length: 160 }, (_, i) => { const f = 100 * Math.pow(60, i / 159); return [f, bodyMagDb(modes, f)] as [number, number]; });
  const refPts = Array.from({ length: 160 }, (_, i) => { const f = 100 * Math.pow(60, i / 159); return [f, bodyMagDb(refModes, f)] as [number, number]; });
  const SK = ["G", "D", "A", "E"];
  const betas = Array.from({ length: 40 }, (_, i) => 0.04 + i * 0.006);
  const L = vals["geom.vibLength"], mag = vals["el.pickup.dist"], f0 = vals["play.freq"];
  return (
    <div style={{ height: "100%", overflow: "auto", padding: 8 }}>
      <div className="panel" style={{ padding: 10, marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b>Simulation workspace</b><Prov kind="approx" /><span className="muted">Every result here is an estimate from scaling/closed-form models. No result is validated against physical measurements.</span>
        <span style={{ marginLeft: "auto" }}>Body response: <b className={stale === "fresh" ? "sev-info" : "sev-error"}>{stale === "fresh" ? "up to date" : stale === "stale" ? "OUT OF DATE — inputs changed" : "never reviewed"}</b> · String model: <b className={staleS === "fresh" ? "sev-info" : "sev-error"}>{staleS === "fresh" ? "up to date" : staleS === "stale" ? "OUT OF DATE" : "never reviewed"}</b></span>
        <button className="btn btn-primary" onClick={() => { commit("Recalculate simulations", (d) => markComputed(d, vals, ["art.acoustic", "art.string", "art.power"])); toast("Estimates recalculated and marked current"); }}>Recalculate / mark current</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 8 }}>
        <div className="panel" style={{ padding: 10 }}>
          <div className="h-title">Body response (frequency response) <Prov kind="approx" /></div>
          <Chart series={[{ pts: refPts, color: "var(--muted)" }, { pts: respPts, color: "var(--accent)" }]} xlog xl="Hz" yl="dB re. peak" marks={modes.map((m) => ({ x: m.f, label: m.name }))} ymin={-40} ymax={Math.max(...respPts.map((p) => p[1])) + 3} />
          <div className="muted" style={{ fontSize: 11 }}>Grey: default reference violin. Orange: current design.</div>
          <table className="t"><thead><tr><th>Mode</th><th>Current Hz</th><th>Reference Hz</th><th>Shift</th><th>Q</th></tr></thead><tbody>{modes.map((m, i) => <tr key={m.name}><td>{m.name}</td><td className="mono">{fmt(m.f, 1)}</td><td className="mono">{fmt(refModes[i].f, 1)}</td><td className="mono">{m.f - refModes[i].f >= 0 ? "+" : ""}{fmt(m.f - refModes[i].f, 1)}</td><td className="mono">{fmt(m.q, 0)}</td></tr>)}</tbody></table>
          <div className="h-title" style={{ marginTop: 8 }}>Assumptions & limits</div>{ACOUSTIC_ASSUMPTIONS.map((a, i) => <div key={i} className="muted" style={{ fontSize: 11 }}>• {a}</div>)}
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}><Unsupported title="Finite-element modal analysis, structural stress, wolf-note prediction, soundpost/bass-bar coupling">Not implemented. Soundpost and bass bar edits only mark the body-response estimate as out of date.</Unsupported></div>
        </div>
        <div className="panel" style={{ padding: 10 }}>
          <div className="h-title">String vibration <Prov kind="visual" /> <button className="btn" style={{ float: "right" }} onClick={() => setAnim(!anim)}>{anim ? "Pause" : "Animate"}</button></div>
          <canvas ref={cv} width={560} height={150} style={{ width: "100%", borderRadius: 6 }} />
          <div className="muted" style={{ fontSize: 11 }}>Helmholtz-motion shape (sum of harmonics, displayed ×{(vals["play.freq"] / 4).toFixed(0)} slower than real time). Visualisation only.</div>
          <div className="h-title" style={{ marginTop: 10 }}>Tuning <Prov kind="calc" /></div>
          {SK.map((k) => { const n = noteName(vals[`str.${k}.freq`]); return <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}><b style={{ width: 16 }}>{k}</b><span className="mono" style={{ width: 90 }}>{fmt(vals[`str.${k}.freq`], 2)} Hz</span><span style={{ width: 52 }}>{n.name}</span><div style={{ flex: 1, height: 8, background: "var(--bg)", position: "relative", borderRadius: 4 }}><div style={{ position: "absolute", left: "50%", top: 0, width: 2, height: 8, background: "var(--muted)" }} /><div style={{ position: "absolute", left: `${50 + Math.max(-50, Math.min(50, vals[`str.${k}.cents`] / 2))}%`, top: -2, width: 8, height: 12, background: Math.abs(vals[`str.${k}.cents`]) < 5 ? "var(--ok)" : "var(--warn)", borderRadius: 3 }} /></div><span className="mono" style={{ width: 70, textAlign: "right" }}>{vals[`str.${k}.cents`] >= 0 ? "+" : ""}{vals[`str.${k}.cents`].toFixed(1)}¢</span></div>; })}
          <div className="h-title" style={{ marginTop: 10 }}>Bow force window vs. bow position β <Prov kind="approx" /></div>
          <Chart series={[{ pts: betas.map((b) => [b, Math.max(0.005, 0.12 * vals["bow.speed"] / b * 0.35)] as [number, number]), color: "var(--accent2)" }, { pts: betas.map((b) => [b, 2.2 * vals["bow.speed"] / (b * b * (f0 / 440)) * 0.35] as [number, number]), color: "var(--danger)" }]} w={520} h={170} xl="β" yl="N (cyan F_min, red F_max)" ymin={0} ymax={4} marks={[{ x: vals["bow.beta"], label: `β ${vals["bow.beta"]}, F ${vals["bow.force"]} N`, color: "var(--accent)" }]} />
          <div className="muted" style={{ fontSize: 11 }}>Schelleng-type scaling with uncalibrated constants; use for relative trends only.</div>
        </div>
        <div className="panel" style={{ padding: 10 }}>
          <div className="h-title">Pickup response <Prov kind="calc" /></div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Magnetic string-sensing pickup at d = {mag} mm from the bridge: harmonic n weight |sin(nπd/L)|. Piezo bridge pickup has no comb filtering.</div>
          <svg width="100%" height="120" viewBox="0 0 420 120">{Array.from({ length: 40 }, (_, i) => { const n = i + 1, a = Math.abs(Math.sin((n * Math.PI * mag) / L)); return <rect key={n} x={n * 10} y={110 - a * 100} width="7" height={a * 100} fill={vals["el.pickup.type"] > 0.5 ? "var(--accent)" : "var(--muted)"} />; })}</svg>
          <div className="muted" style={{ fontSize: 11 }}>Pickup type currently: {vals["el.pickup.type"] > 0.5 ? "Magnetic (curve is active)" : "Piezo (curve shown for reference only)"}</div>
          <div className="h-title" style={{ marginTop: 10 }}>Power & thermal <Prov kind="approx" /></div>
          <table className="t"><tbody>{[["Average current", "el.power.total", "mA"], ["Average power", "el.power.mW", "mW"], ["Runtime", "el.power.runtime", "h"], ["Heat inside body", "el.thermal.dissip", "mW"], ["Temperature rise (assumed Rθ)", "el.thermal.rise", "°C"], ["DSP latency", "el.dsp.latency", "ms"]].map(([l, id, u]) => <tr key={id}><td>{l}</td><td className="mono">{fmt(vals[id], 2)} {u}</td></tr>)}</tbody></table>
        </div>
        <div className="panel" style={{ padding: 10 }}>
          <div className="h-title">Circuit simulation</div>
          <div className="muted">DC operating point and transient analysis of the schematic run in the Virtual Electronics Lab (MNA solver; SPICE netlist export for ngspice). AC small-signal analysis is not implemented.</div>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => go("lab")}>Open Virtual Electronics Lab</button>
          <div className="h-title" style={{ marginTop: 12 }}>Design variants</div><button className="btn" style={{ marginTop: 4 }} onClick={() => go("engineering")}>Open what-if / variants</button>
        </div>
      </div>
    </div>
  );
}
