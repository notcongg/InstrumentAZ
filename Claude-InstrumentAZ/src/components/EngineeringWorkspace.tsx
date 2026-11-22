"use client";
import { useMemo, useState } from "react";
import { STRING_NAMES, STRING_PRESETS, TYPICAL_TENSION_N } from "@/lib/iaz/catalog";
import { freshness, markComputed, newId } from "@/lib/iaz/doc";
import { noteName } from "@/lib/iaz/audio";
import { ARTIFACTS, checkRules, dependenciesOf, dependentsOf, Domain, evaluate, GRAPH_NODES, impactOf, INPUT_IDS, Issue, PARAM_LIST, PARAM_MAP, RELATIONS } from "@/lib/iaz/params";
import { commit, go, setValue, setValues, toast, useDoc, useVals, Workspace } from "@/lib/iaz/store";
import { fmt, IssueList, NumInput, ParamRow, Prov, Section, Tabs } from "./ui";

const METRICS = ["load.totalTension", "load.downforce", "load.breakAngle", "ac.A0", "ac.B1m", "ac.B1p", "ac.bridgeHill", "mass.total", "geom.cavityVolume", "geom.neckLength", "el.power.total", "el.power.runtime", "el.thermal.rise", "el.dsp.latency", "play.freq"];
const DOMAIN_WS: Record<string, Workspace> = { geometry: "cad", material: "cad", mass: "cad", strings: "engineering", bow: "audio", acoustic: "simulation", electronics: "electronics", power: "electronics", thermal: "electronics", firmware: "coding", manufacturing: "manufacturing", simulation: "simulation" };
const sevOrder = { error: 0, warning: 1, info: 2 };

function Plot({ pts, xl, yl, mark }: { pts: [number, number][]; xl: string; yl: string; mark?: [number, number] }) {
  const w = 260, h = 120, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x: number) => 30 + ((x - x0) / (x1 - x0 || 1)) * (w - 36), Y = (y: number) => h - 20 - ((y - y0) / (y1 - y0 || 1)) * (h - 30);
  return (
    <svg width={w} height={h} style={{ background: "var(--bg)", borderRadius: 4 }}>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")} />
      {mark && <circle cx={X(mark[0])} cy={Y(mark[1])} r="4" fill="var(--accent2)" />}
      <text x="30" y={h - 4} fontSize="9" fill="var(--muted)">{xl} {fmt(x0, 1)}–{fmt(x1, 1)}</text><text x="2" y="10" fontSize="9" fill="var(--muted)">{yl} {fmt(y0, 1)}–{fmt(y1, 1)}</text>
    </svg>
  );
}

export default function EngineeringWorkspace() {
  const doc = useDoc();
  const vals = useVals();
  const [tab, setTab] = useState<"params" | "strings" | "deps" | "variants" | "checks">("params");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  const [q, setQ] = useState("");
  const [dom, setDom] = useState<Domain | "all">("all");
  const [focus, setFocus] = useState("geom.bridgeHeight");
  const issuesNow = useMemo(() => checkRules((id) => vals[id]), [vals]);
  const preview = useMemo(() => (Object.keys(draft).length ? evaluate({ ...doc.values, ...draft }) : vals), [draft, doc.values, vals]);
  const issuesPreview = useMemo(() => checkRules((id) => preview[id]), [preview]);
  const impact = useMemo(() => impactOf(Object.keys(draft)), [draft]);
  const newIssues = issuesPreview.filter((i) => !issuesNow.some((o) => o.id === i.id && o.message === i.message));
  const resolved = issuesNow.filter((i) => !issuesPreview.some((o) => o.id === i.id && o.message === i.message));
  const edit = (id: string, v: number) => { if (live) setValue(id, v); else setDraft((d) => (v === doc.values[id] ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)) : { ...d, [id]: v })); };
  const apply = () => { setValues(draft, `Apply ${Object.keys(draft).length} parameter change(s)`); setDraft({}); toast("Changes applied — see Dependencies for stale results"); };
  const groups = useMemo(() => { const m = new Map<string, typeof PARAM_LIST>(); PARAM_LIST.filter((p) => !p.derived && (dom === "all" || p.domain === dom) && (p.label + p.id).toLowerCase().includes(q.toLowerCase())).forEach((p) => { const g = p.id.split(".")[0]; m.set(g, [...(m.get(g) ?? []), p]); }); return m; }, [q, dom]);
  const stale = ARTIFACTS.map((a) => ({ a, f: freshness(doc, vals, a.id) }));
  const nodeLabel = (id: string) => GRAPH_NODES.find((n) => n.id === id)?.label ?? id;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 8, gap: 6 }}>
      <Tabs tabs={[["params", "Parameters & what-if"], ["strings", "String engineering"], ["deps", "Dependency graph"], ["variants", "Variants"], ["checks", `Validation (${issuesNow.length})`]]} value={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "params" && (
          <div style={{ display: "flex", gap: 8, height: "100%" }}>
            <div className="panel" style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, padding: 8, position: "sticky", top: 0, background: "var(--panel)", zIndex: 2, alignItems: "center" }}>
                <input className="input" placeholder="Search parameters…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
                <select className="input" style={{ width: 130 }} value={dom} onChange={(e) => setDom(e.target.value as Domain | "all")}><option value="all">All domains</option>{Array.from(new Set(PARAM_LIST.map((p) => p.domain))).map((d) => <option key={d}>{d}</option>)}</select>
                <label style={{ display: "flex", gap: 4, alignItems: "center" }} title="Apply edits immediately instead of staging them for impact preview"><input type="checkbox" checked={live} onChange={(e) => { setLive(e.target.checked); setDraft({}); }} />Apply immediately</label>
              </div>
              {Array.from(groups.entries()).map(([g, ps]) => (
                <details key={g} open={!!q || g === "geom"}>
                  <summary style={{ cursor: "pointer", padding: "6px 10px" }} className="h-title">{g} ({ps.length})</summary>
                  <table className="t"><thead><tr><th>Parameter</th><th style={{ width: 110 }}>Value (draft)</th><th>Unit</th><th>Range</th><th title="Manufacturing tolerance ±">Tol ±</th><th title="Design target">Target</th><th title="Physical measurement entered by user">Measured</th><th title="Dependents">→</th></tr></thead>
                    <tbody>{ps.map((p) => {
                      const cur = doc.values[p.id], d = draft[p.id];
                      const v = d ?? cur, meas = doc.measured[p.id], tg = doc.targets[p.id];
                      return (
                        <tr key={p.id} className="row-hover" style={{ background: d !== undefined ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined }}>
                          <td title={p.id}>{p.label}{p.critical && <span className="badge b-approx" style={{ marginLeft: 4 }} title="Critical dimension: needs tolerance before manufacturing">crit</span>}{d !== undefined && <div className="muted mono" style={{ fontSize: 10 }}>{cur} → {d}</div>}</td>
                          <td>{p.options ? <select className="input" value={Math.round(v)} onChange={(e) => edit(p.id, Number(e.target.value))}>{p.options.map((o, i) => <option key={o} value={i}>{o}</option>)}</select> : <NumInput value={v} min={p.min} max={p.max} step={p.step} onChange={(n) => edit(p.id, n)} />}</td>
                          <td className="muted">{p.unit}</td><td className="muted mono" style={{ fontSize: 10 }}>{p.options ? "" : `${p.min}…${p.max}`}</td>
                          <td style={{ width: 62 }}><NumInput value={doc.tolerances[p.id] ?? 0} onChange={(n) => commit("Set tolerance", (dd) => { const t = { ...dd.tolerances }; if (n > 0) t[p.id] = n; else delete t[p.id]; return { ...dd, tolerances: t }; }, `tol:${p.id}`)} /></td>
                          <td style={{ width: 62 }}>{!p.options && <NumInput value={tg ?? cur} onChange={(n) => commit("Set target", (dd) => ({ ...dd, targets: { ...dd.targets, [p.id]: n } }), `tg:${p.id}`)} />}</td>
                          <td style={{ width: 66 }}>{!p.options && <><NumInput value={meas ?? 0} onChange={(n) => commit("Record measurement", (dd) => { const m = { ...dd.measured }; if (n !== 0) m[p.id] = n; else delete m[p.id]; return { ...dd, measured: m }; }, `me:${p.id}`)} />{meas != null && <div style={{ fontSize: 10 }} className={Math.abs(meas - (tg ?? cur)) > (doc.tolerances[p.id] ?? Infinity) ? "sev-error" : "sev-info"}>{Math.abs(meas - (tg ?? cur)) > (doc.tolerances[p.id] ?? Infinity) ? "out of tol." : "meas."} <Prov kind="meas" /></div>}</>}</td>
                          <td><button className="btn" style={{ padding: "1px 6px" }} onClick={() => { setFocus(p.id); setTab("deps"); }}>{dependentsOf(p.id).length}</button></td>
                        </tr>
                      );
                    })}</tbody></table>
                </details>
              ))}
            </div>
            <div className="panel" style={{ width: 360, flex: "none", overflow: "auto" }}>
              <Section title="Change preview" right={<span><button className="btn btn-primary" disabled={!Object.keys(draft).length} onClick={apply}>Apply</button> <button className="btn" disabled={!Object.keys(draft).length} onClick={() => setDraft({})}>Discard</button></span>}>
                {!Object.keys(draft).length ? <div className="muted">Edit parameters to stage a change set. Nothing is modified until you apply. Unrelated design decisions are never changed automatically.</div> : <>
                  <div className="h-title">Key results: current → proposed <Prov kind="approx" /></div>
                  <table className="t"><tbody>{METRICS.map((id) => { const a = vals[id], b = preview[id]; const ch = Math.abs(b - a) > 1e-6 * (Math.abs(a) + 1); return <tr key={id} style={{ opacity: ch ? 1 : 0.45 }}><td>{PARAM_MAP[id].label}</td><td className="mono">{fmt(a)}</td><td className="mono" style={{ color: ch ? "var(--accent)" : undefined }}>{fmt(b)} {PARAM_MAP[id].unit}</td></tr>; })}</tbody></table>
                  {newIssues.length > 0 && <><div className="h-title" style={{ marginTop: 8 }}>New problems introduced</div><IssueList issues={newIssues} /></>}
                  {resolved.length > 0 && <><div className="h-title" style={{ marginTop: 8 }}>Problems resolved</div><IssueList issues={resolved.map((i) => ({ ...i, severity: "info" as const }))} /></>}
                  <div className="h-title" style={{ marginTop: 8 }}>Affected ({impact.length})</div>
                  <div style={{ maxHeight: 260, overflow: "auto" }}>{impact.map((i) => <div key={i.id} className="panel2" style={{ padding: "4px 6px", margin: "3px 0" }}><b>{i.label}</b> <span className="badge b-visual">{i.type === "artifact" ? "needs recompute" : "recalculated"}</span><div className="muted" style={{ fontSize: 10 }}>{i.chain.map(nodeLabel).join(" → ")}</div><div style={{ fontSize: 11 }}>{i.notes[i.notes.length - 1]}</div></div>)}</div>
                </>}
              </Section>
            </div>
          </div>
        )}

        {tab === "strings" && <StringsTab />}

        {tab === "deps" && (
          <div style={{ display: "flex", gap: 8, height: "100%" }}>
            <div className="panel" style={{ width: 320, flex: "none", overflow: "auto" }}>
              <Section title="Result freshness (stale detection)">
                {stale.map(({ a, f }) => <div key={a.id} className="panel2" style={{ padding: "5px 8px", margin: "3px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><b>{a.label}</b><span className={f === "fresh" ? "sev-info" : f === "stale" ? "sev-error" : "sev-warning"}>{f === "fresh" ? "UP TO DATE" : f === "stale" ? "OUT OF DATE" : "never computed"}</span></div>
                  <div className="muted" style={{ fontSize: 11 }}>{a.note}</div>
                  <button className="btn" style={{ marginTop: 3 }} disabled={f === "fresh"} onClick={() => { commit(`Mark ${a.label} reviewed`, (d) => markComputed(d, vals, [a.id])); }}>Mark as reviewed/regenerated</button>
                </div>)}
              </Section>
            </div>
            <div className="panel" style={{ flex: 1, overflow: "auto" }}>
              <Section title="Explore the dependency graph" right={<span className="muted">{GRAPH_NODES.length} nodes · {RELATIONS.length} declared relations</span>}>
                <select className="input" value={focus} onChange={(e) => setFocus(e.target.value)}>{GRAPH_NODES.map((n) => <option key={n.id} value={n.id}>{n.type === "artifact" ? "◆ " : ""}{n.label} ({n.id})</option>)}</select>
                <div className="h-title" style={{ margin: "10px 0 4px" }}>Depends on</div>
                {dependenciesOf(focus).length === 0 ? <div className="muted">Independent input.</div> : dependenciesOf(focus).slice(0, 40).map((e, i) => <div key={i} style={{ padding: "2px 0" }}><span className="badge b-calc">{e.kind}</span> {nodeLabel(e.from)} <span className="muted">— {e.note}</span></div>)}
                <div className="h-title" style={{ margin: "10px 0 4px" }}>Influences (transitive impact)</div>
                {impactOf([focus]).map((i) => <div key={i.id} className="panel2 row-hover" style={{ padding: "4px 8px", margin: "3px 0", marginLeft: (i.depth - 1) * 14 }}>
                  <b>{i.label}</b> <span className="badge b-visual">{i.kinds[i.kinds.length - 1]}</span> <button className="btn" style={{ padding: "0 6px", float: "right" }} onClick={() => go(DOMAIN_WS[i.domain] ?? "engineering")}>Go to {DOMAIN_WS[i.domain] ?? "engineering"}</button>
                  <div className="muted" style={{ fontSize: 11 }}>{i.chain.map(nodeLabel).join(" → ")}</div><div style={{ fontSize: 11 }}>{i.notes[i.notes.length - 1]}</div>
                </div>)}
                <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>Add new relationships by appending to <code>RELATIONS</code> in <code>lib/iaz/params.ts</code> — no other code changes required.</div>
              </Section>
            </div>
          </div>
        )}

        {tab === "variants" && <VariantsTab />}
        {tab === "checks" && <div className="panel" style={{ padding: 10 }}><IssueList issues={issuesNow} onJump={(i) => { if (i.params[0]) { setFocus(i.params[0]); setTab("deps"); } }} /></div>}
      </div>
    </div>
  );
}

function StringsTab() {
  const doc = useDoc();
  const v = useVals();
  const SK = ["G", "D", "A", "E"];
  const issues = checkRules((id) => v[id]).filter((i) => i.domain === "strings");
  const [sel, setSel] = useState(2);
  const k = SK[sel];
  const L = v["geom.vibLength"], mu = v[`str.${k}.mu`] * 1e-3, T = v[`str.${k}.tension`];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div className="panel" style={{ flex: 1, padding: 10 }}>
        <div className="h-title">Open-string configuration <Prov kind="calc" /></div>
        <div className="muted" style={{ margin: "4px 0 8px" }}>f = (1/2L)·√(T/μ) &nbsp;|&nbsp; T = μ·(2Lf)². L = effective vibrating length (shared: {fmt(L, 1)} mm).</div>
        <ParamRow id="geom.vibLength" />
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr><th>String</th><th>Preset (construction)</th><th>Ø mm</th><th>μ g/m</th><th>Mode</th><th>Target Hz</th><th>Set T (N)</th><th>Tension N</th><th>Pitch</th><th>ρ_eff</th></tr></thead>
          <tbody>{SK.map((s, i) => { const f = v[`str.${s}.freq`], nn = noteName(f), [lo, hi] = TYPICAL_TENSION_N[i]; const t = v[`str.${s}.tension`]; const mode = Math.round(v[`str.${s}.mode`]); return (
            <tr key={s} className="row-hover" style={{ background: sel === i ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined }} onClick={() => setSel(i)}>
              <td><b>{s}</b> <span className="muted">{STRING_NAMES[i]}</span></td>
              <td><select className="input" value={doc.stringPresets[i]} onChange={(e) => { const p = STRING_PRESETS.find((x) => x.id === e.target.value)!; commit(`String ${s}: ${p.name}`, (d) => ({ ...d, stringPresets: d.stringPresets.map((x, j) => (j === i ? p.id : x)), values: { ...d.values, [`str.${s}.diameter`]: p.diameter, [`str.${s}.mu`]: p.mu } })); }}>{STRING_PRESETS.filter((p) => p.slot === i).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
              <td style={{ width: 70 }}><NumInput value={v[`str.${s}.diameter`]} step={0.01} onChange={(n) => setValue(`str.${s}.diameter`, n)} /></td>
              <td style={{ width: 70 }}><NumInput value={v[`str.${s}.mu`]} step={0.01} onChange={(n) => setValue(`str.${s}.mu`, n)} /></td>
              <td><select className="input" value={mode} onChange={(e) => setValue(`str.${s}.mode`, Number(e.target.value))}><option value={0}>Solve T</option><option value={1}>Solve f</option></select></td>
              <td style={{ width: 80 }}><NumInput value={v[`str.${s}.target`]} disabled={mode === 1} onChange={(n) => setValue(`str.${s}.target`, n)} /></td>
              <td style={{ width: 70 }}><NumInput value={mode === 1 ? v[`str.${s}.tensionSet`] : t} disabled={mode === 0} onChange={(n) => setValue(`str.${s}.tensionSet`, n)} /></td>
              <td className="mono" style={{ color: t < lo || t > hi ? "var(--warn)" : undefined }}>{fmt(t, 1)}</td>
              <td className="mono">{fmt(f, 2)} Hz<div className="muted">{nn.name} {nn.cents >= 0 ? "+" : ""}{nn.cents.toFixed(0)}¢</div></td>
              <td className="mono">{fmt(v[`str.${s}.rhoEff`], 2)}</td>
            </tr>); })}</tbody>
        </table>
        <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
          <div><div className="muted">Total tension</div><b className="mono">{fmt(v["load.totalTension"], 1)} N ({fmt(v["load.totalTension"] / 9.80665, 1)} kgf)</b></div>
          <div><div className="muted">Bridge downforce <Prov kind="approx" /></div><b className="mono">{fmt(v["load.downforce"], 1)} N ({fmt(v["load.downforce"] / 9.80665, 1)} kgf)</b></div>
          <div><div className="muted">Break angle</div><b className="mono">{fmt(v["load.breakAngle"], 1)}°</b></div>
          <div><div className="muted">String angle nut side / tailpiece side</div><b className="mono">{fmt(v["load.stringAngle"], 1)}° / {fmt(v["load.afterAngle"], 1)}°</b></div>
        </div>
        <div className="h-title" style={{ marginTop: 14 }}>Geometry affecting strings</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{["geom.afterlength", "geom.bridgeHeight", "geom.tailpieceHeight", "geom.stringSpacingBridge", "geom.stringSpacingNut", "geom.actionE", "geom.actionG", "geom.nutHeight", "geom.neckAngle"].map((id) => <ParamRow key={id} id={id} slider={false} />)}</div>
        <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>Peg configuration: 4 friction pegs, string windings at the pegbox (not modelled mechanically). Fine tuners: 4 on the tailpiece (CAD library). Attachment points: nut slot → bridge notch → tailpiece hole. Catalog μ/Ø are typical values, NOT manufacturer data — weigh and measure real strings.</div>
      </div>
      <div className="panel" style={{ width: 330, flex: "none", padding: 10 }}>
        <div className="h-title">{k} string: pitch relationships <Prov kind="calc" /></div>
        <div className="muted" style={{ margin: "6px 0 2px" }}>Pitch vs tension (L, μ fixed)</div>
        <Plot xl="N" yl="Hz" pts={Array.from({ length: 30 }, (_, i) => { const t = 10 + i * 4; return [t, Math.sqrt(t / mu) / (2 * L / 1000)] as [number, number]; })} mark={[T, v[`str.${k}.freq`]]} />
        <div className="muted" style={{ margin: "8px 0 2px" }}>Pitch vs vibrating length (T, μ fixed)</div>
        <Plot xl="mm" yl="Hz" pts={Array.from({ length: 30 }, (_, i) => { const l = 280 + i * 2.5; return [l, Math.sqrt(T / mu) / (2 * l / 1000)] as [number, number]; })} mark={[L, v[`str.${k}.freq`]]} />
        <div className="muted" style={{ margin: "8px 0 2px" }}>Pitch vs linear density (T, L fixed)</div>
        <Plot xl="g/m" yl="Hz" pts={Array.from({ length: 30 }, (_, i) => { const m = 0.3 + i * 0.12; return [m, Math.sqrt(T / (m * 1e-3)) / (2 * L / 1000)] as [number, number]; })} mark={[v[`str.${k}.mu`], v[`str.${k}.freq`]]} />
        <div className="h-title" style={{ margin: "12px 0 4px" }}>Warnings</div>
        <IssueList issues={issues} />
      </div>
    </div>
  );
}

function VariantsTab() {
  const doc = useDoc();
  const vals = useVals();
  const [name, setName] = useState("Variant A");
  const [a, setA] = useState<string>("current");
  const [b, setB] = useState<string>("");
  const valsFor = (id: string) => (id === "current" ? vals : evaluate({ ...doc.values, ...(doc.variants.find((v) => v.id === id)?.values ?? {}) }));
  const va = valsFor(a), vb = b ? valsFor(b) : null;
  const diffIds = INPUT_IDS.filter((id) => vb && Math.abs(vb[id] - va[id]) > 1e-9);
  const issuesOf = (v: Record<string, number>) => checkRules((id) => v[id]).filter((i) => i.severity !== "info").length;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div className="panel" style={{ width: 320, flex: "none", padding: 10 }}>
        <div className="h-title">Design variants (snapshots)</div>
        <div style={{ display: "flex", gap: 4, margin: "6px 0" }}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" onClick={() => { commit("Save variant", (d) => ({ ...d, variants: [...d.variants, { id: newId("var"), name, created: new Date().toISOString(), values: { ...d.values } }] })); toast(`Saved “${name}”`); }}>Save current</button></div>
        {doc.variants.length === 0 && <div className="muted">No variants yet. Save the current design, change parameters, then compare.</div>}
        {doc.variants.map((v) => <div key={v.id} className="panel2" style={{ padding: 6, margin: "4px 0" }}><b>{v.name}</b><div className="muted" style={{ fontSize: 10 }}>{v.created.slice(0, 16).replace("T", " ")}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}><button className="btn" onClick={() => { commit(`Restore ${v.name}`, (d) => ({ ...d, values: { ...v.values } })); toast("Variant restored (undo available)"); }}>Restore</button><button className="btn" onClick={() => setB(v.id)}>Compare</button><button className="btn" style={{ color: "var(--danger)" }} onClick={() => commit("Delete variant", (d) => ({ ...d, variants: d.variants.filter((x) => x.id !== v.id) }))}>Delete</button></div></div>)}
      </div>
      <div className="panel" style={{ flex: 1, padding: 10, overflow: "auto" }}>
        <div className="h-title">What-if comparison <Prov kind="approx" /></div>
        <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
          <select className="input" value={a} onChange={(e) => setA(e.target.value)}><option value="current">Current design</option>{doc.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <span>vs</span>
          <select className="input" value={b} onChange={(e) => setB(e.target.value)}><option value="">— choose —</option><option value="current">Current design</option>{doc.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        </div>
        {vb && <>
          <table className="t"><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Δ</th></tr></thead><tbody>
            {METRICS.map((id) => { const d = vb[id] - va[id]; return <tr key={id}><td>{PARAM_MAP[id].label} <span className="muted">{PARAM_MAP[id].unit}</span></td><td className="mono">{fmt(va[id])}</td><td className="mono">{fmt(vb[id])}</td><td className="mono" style={{ color: Math.abs(d) > 1e-6 ? "var(--accent)" : "var(--muted)" }}>{d >= 0 ? "+" : ""}{fmt(d)}</td></tr>; })}
            <tr><td>Open design issues (errors+warnings)</td><td className="mono">{issuesOf(va)}</td><td className="mono">{issuesOf(vb)}</td><td /></tr>
          </tbody></table>
          <div className="h-title" style={{ marginTop: 10 }}>Changed input parameters ({diffIds.length})</div>
          {diffIds.map((id) => <div key={id} className="mono" style={{ fontSize: 11 }}>{PARAM_MAP[id].label}: {fmt(va[id], 3)} → {fmt(vb[id], 3)} {PARAM_MAP[id].unit}</div>)}
        </>}
        <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>All numbers are calculated or estimated from the parametric model (see assumptions in Simulation). Restore never touches the schematic, code or CAD placement — only parameter values.</div>
      </div>
    </div>
  );
}

void sevOrder; void (null as unknown as Issue);
