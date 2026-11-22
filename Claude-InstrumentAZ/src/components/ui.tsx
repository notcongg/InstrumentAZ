"use client";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PARAM_MAP } from "@/lib/iaz/params";
import type { Issue } from "@/lib/iaz/params";
import { setValue, useDoc, useVals } from "@/lib/iaz/store";

export type ProvKind = "visual" | "calc" | "approx" | "valid" | "meas" | "unsup";
const PROV: Record<ProvKind, [string, string, string]> = {
  visual: ["VISUAL", "b-visual", "Visual representation only — not an engineering result."],
  calc: ["CALCULATED", "b-calc", "Calculated engineering result from a closed-form relation and the stated inputs."],
  approx: ["APPROX. ESTIMATE", "b-approx", "Approximate model/simulation. Assumptions apply. NOT validated against measurements."],
  valid: ["VALIDATED", "b-valid", "Validated against physical measurements. (No result in this build has this status.)"],
  meas: ["MEASURED", "b-meas", "Actual measurement entered by the user from a physical instrument."],
  unsup: ["NOT SUPPORTED", "b-unsup", "This model is not implemented in the current build."],
};
export function Prov({ kind }: { kind: ProvKind }) {
  const [t, c, tip] = PROV[kind];
  return <span className={`badge ${c}`} title={tip}>{t}</span>;
}

export const fmt = (n: number, d = 2) => (Number.isFinite(n) ? (Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(d)) : "—");
export function download(name: string, data: BlobPart, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function IssueList({ issues, onJump }: { issues: Issue[]; onJump?: (i: Issue) => void }) {
  if (!issues.length) return <div className="muted" style={{ padding: 8 }}>No issues found by the implemented checks.</div>;
  const order = { error: 0, warning: 1, info: 2 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {[...issues].sort((a, b) => order[a.severity] - order[b.severity]).map((i, k) => (
        <div key={i.id + k} className="panel2 row-hover" style={{ padding: "5px 8px", cursor: onJump ? "pointer" : "default" }} onClick={() => onJump?.(i)}>
          <span className={`sev-${i.severity} mono`} style={{ fontSize: 10, marginRight: 6 }}>{i.severity.toUpperCase()}</span>
          <span>{i.message}</span>
          {i.explain && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{i.explain}</div>}
        </div>
      ))}
    </div>
  );
}

export function Section({ title, right, children, grow }: { title: string; right?: ReactNode; children: ReactNode; grow?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: grow ? 1 : "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px 4px" }}>
        <span className="h-title">{title}</span>{right}
      </div>
      <div style={{ padding: "0 10px 10px", minHeight: 0, overflow: grow ? "auto" : undefined, flex: grow ? 1 : "none" }}>{children}</div>
    </div>
  );
}

/** Resizable side panel with a drag handle. */
export function Resizable({ side, def, min = 180, max = 520, children, id }: { side: "left" | "right"; def: number; min?: number; max?: number; children: ReactNode; id: string }) {
  const [w, setW] = useState(def);
  const [drag, setDrag] = useState(false);
  useEffect(() => { const s = Number(localStorage.getItem(`iaz.w.${id}`)); if (s >= min && s <= max) setW(s); }, [id, min, max]);
  const start = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = w;
    setDrag(true);
    const mv = (ev: PointerEvent) => setW(Math.max(min, Math.min(max, w0 + (side === "left" ? ev.clientX - x0 : x0 - ev.clientX))));
    const up = () => { setDrag(false); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); setW((cur) => { localStorage.setItem(`iaz.w.${id}`, String(cur)); return cur; }); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }, [w, min, max, side, id]);
  const handle = <div className={`splitter ${drag ? "drag" : ""}`} onPointerDown={start} />;
  return (
    <>
      {side === "right" && handle}
      <div className="panel" style={{ width: w, flex: "none", overflow: "auto", display: "flex", flexDirection: "column" }}>{children}</div>
      {side === "left" && handle}
    </>
  );
}

export function NumInput({ value, onChange, min, max, step, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const [txt, setTxt] = useState(String(value));
  const focus = useRef(false);
  useEffect(() => { if (!focus.current) setTxt(String(Number(value.toFixed(5)))); }, [value]);
  return (
    <input className="input mono" disabled={disabled} value={txt} inputMode="decimal"
      onFocus={() => (focus.current = true)}
      onBlur={() => { focus.current = false; setTxt(String(Number(value.toFixed(5)))); }}
      onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) { const c = min !== undefined && max !== undefined ? Math.min(max, Math.max(min, n)) : n; onChange(step ? Math.round(c / step) * step : c); } }} />
  );
}

/** Editable (input) or read-only (derived) parameter with unit, bounds and explanation. */
export function ParamRow({ id, slider = true }: { id: string; slider?: boolean }) {
  const p = PARAM_MAP[id];
  const vals = useVals();
  const doc = useDoc();
  if (!p) return null;
  const v = vals[id];
  if (p.derived) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0" }} title={p.derived.note}>
        <span className="muted">{p.label}</span>
        <span className="mono">{fmt(v, 3)} {p.unit} <Prov kind={p.derived.approx ? "approx" : "calc"} /></span>
      </div>
    );
  }
  const tol = doc.tolerances[id];
  return (
    <div style={{ padding: "3px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <label title={p.help ?? p.label}>{p.label}</label>
        <span className="muted">{p.unit}{tol != null ? ` ±${tol}` : ""}</span>
      </div>
      {p.options ? (
        <select className="input" value={Math.round(v)} onChange={(e) => setValue(id, Number(e.target.value))}>{p.options.map((o, i) => <option key={o} value={i}>{o}</option>)}</select>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {slider && <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => setValue(id, Number(e.target.value))} />}
          <div style={{ width: 84, flex: "none" }}><NumInput value={v} min={p.min} max={p.max} step={p.step} onChange={(n) => setValue(id, n)} /></div>
        </div>
      )}
    </div>
  );
}

export interface CtxItem { label: string; run: () => void; danger?: boolean }
export function CtxMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  useEffect(() => { const c = () => onClose(); window.addEventListener("click", c); window.addEventListener("contextmenu", c); return () => { window.removeEventListener("click", c); window.removeEventListener("contextmenu", c); }; }, [onClose]);
  return (
    <div className="panel" style={{ position: "fixed", left: x, top: y, zIndex: 60, minWidth: 170, padding: 4, boxShadow: "0 8px 30px #0008" }}>
      {items.map((it) => <div key={it.label} className="row-hover" style={{ padding: "5px 10px", cursor: "pointer", color: it.danger ? "var(--danger)" : undefined }} onClick={it.run}>{it.label}</div>)}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flex: "none", overflowX: "auto" }}>{tabs.map(([k, l]) => <button key={k} className={`tab ${value === k ? "tab-active" : ""}`} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Unsupported({ title, children }: { title: string; children: ReactNode }) {
  return <div className="panel2" style={{ padding: 10, borderColor: "var(--danger)" }}><Prov kind="unsup" /> <b style={{ marginLeft: 6 }}>{title}</b><div className="muted" style={{ marginTop: 4 }}>{children}</div></div>;
}
