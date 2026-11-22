"use client";

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Activity,
  AudioLines,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Box,
  Boxes,
  Cable,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDot,
  CircleHelp,
  CircuitBoard,
  ClipboardCheck,
  Clock3,
  Code2,
  Command,
  Cpu,
  DraftingCompass,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  FileUp,
  GitBranch,
  Hammer,
  Headphones,
  Info,
  Layers,
  Lightbulb,
  Menu,
  Music2,
  PackageCheck,
  PanelLeft,
  Plus,
  Radio,
  Redo2,
  Ruler,
  Save,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Waves,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ViolinViewport } from "@/components/violin-viewport";
import {
  calculateStringFrequency,
  calculateStringTension,
  COMPONENT_LIBRARY,
  createBomCsv,
  createDefaultProjectData,
  DEPENDENCY_GRAPH,
  PARAMETER_DEPENDENCIES,
  PARAMETER_META,
  PROJECT_FORMAT_VERSION,
  validateProject,
} from "@/lib/instrument-model";
import type {
  ComponentPart,
  DesignMode,
  EngineeringParameters,
  ParameterKey,
  ProjectData,
  ViolinString,
} from "@/lib/instrument-model";

const WORKSPACES: { id: WorkspaceId; label: string; icon: LucideIcon; state: "ready" | "planned"; milestone: string }[] = [
  { id: "design", label: "Violin design", icon: Box, state: "ready", milestone: "MVP" },
  { id: "strings", label: "String engineering", icon: Waves, state: "ready", milestone: "MVP" },
  { id: "dependencies", label: "Dependency graph", icon: GitBranch, state: "ready", milestone: "Foundation" },
  { id: "electronics", label: "Electronics studio", icon: CircuitBoard, state: "planned", milestone: "Milestone 4" },
  { id: "lab", label: "Virtual electronics lab", icon: Activity, state: "planned", milestone: "Milestone 6" },
  { id: "firmware", label: "Coding studio", icon: Code2, state: "planned", milestone: "Milestone 5" },
  { id: "audio", label: "Audio & acoustics", icon: AudioLines, state: "planned", milestone: "Milestone 7" },
  { id: "manufacturing", label: "Manufacturing & BOM", icon: ClipboardCheck, state: "ready", milestone: "BOM preview" },
];

type WorkspaceId = "design" | "strings" | "dependencies" | "electronics" | "lab" | "firmware" | "audio" | "manufacturing";
type EditorState = { data: ProjectData; past: ProjectData[]; future: ProjectData[] };
type EditorAction =
  | { type: "replace"; data: ProjectData }
  | { type: "commit"; update: (current: ProjectData) => ProjectData }
  | { type: "undo" }
  | { type: "redo" };
type ProjectRecord = {
  id: string;
  name: string;
  formatVersion: string;
  data?: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
};
type ModalKind = "new-project" | "component-library" | "projects" | "command" | "about" | null;
type AnalysisTab = "parameters" | "strings" | "impact" | "bom";

const MATERIAL_OPTIONS = [
  "European spruce",
  "Flamed maple",
  "European spruce / flamed maple",
  "Ebony",
  "Boxwood",
  "European maple",
  "Steel / alloy",
  "Mixed — see string model",
  "Custom / not specified",
];

const PARAMETER_MAP: Partial<Record<string, ParameterKey[]>> = {
  body: ["bodyLengthMm", "bodyWidthMm"],
  "top-plate": ["topPlateThicknessMm"],
  "back-plate": ["backPlateThicknessMm"],
  ribs: ["ribHeightMm"],
  neck: ["neckAngleDeg"],
  bridge: ["bridgeHeightMm", "stringSpacingMm"],
  strings: ["effectiveVibratingLengthMm"],
  "fingerboard": ["stringSpacingMm"],
};

function createEditorState(data: ProjectData): EditorState {
  return { data, past: [], future: [] };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "replace") return createEditorState(action.data);
  if (action.type === "commit") {
    const next = action.update(state.data);
    if (next === state.data) return state;
    return {
      data: next,
      past: [...state.past, structuredClone(state.data)].slice(-40),
      future: [],
    };
  }
  if (action.type === "undo") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      data: previous,
      past: state.past.slice(0, -1),
      future: [structuredClone(state.data), ...state.future].slice(0, 40),
    };
  }
  if (state.future.length === 0) return state;
  return {
    data: state.future[0],
    past: [...state.past, structuredClone(state.data)].slice(-40),
    future: state.future.slice(1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProjectData(value: unknown): ProjectData {
  if (!isRecord(value) || value.instrument !== "violin" || value.projectType !== "instrumentaz-project") {
    throw new Error("This is not a supported InstrumentAZ violin project. The source data was not changed.");
  }
  const schemaVersion = typeof value.schemaVersion === "string" ? value.schemaVersion : "";
  if (!/^\\d+\\.\\d+\\.\\d+$/.test(schemaVersion)) {
    throw new Error("Project schema version is missing or invalid. The source data was not changed.");
  }
  const formatMajor = Number(PROJECT_FORMAT_VERSION.split(".")[0]);
  if (Number(schemaVersion.split(".")[0]) > formatMajor) {
    throw new Error(`Project schema v${schemaVersion} is newer than this preview supports. Export was not attempted.`);
  }

  const mode: DesignMode = value.designMode === "build" ? "build" : "assembly";
  const modeDefaults = createDefaultProjectData(mode);
  const rawParameters = isRecord(value.parameters) ? value.parameters : {};
  const parameters = { ...modeDefaults.parameters, ...rawParameters } as EngineeringParameters;
  for (const key of Object.keys(PARAMETER_META) as ParameterKey[]) {
    const candidate = rawParameters[key];
    parameters[key] = typeof candidate === "number" && Number.isFinite(candidate) ? candidate : modeDefaults.parameters[key];
  }

  const strings: ViolinString[] = Array.isArray(value.strings)
    ? value.strings.filter(isRecord).flatMap((item, index) => {
        if (typeof item.id !== "string" || typeof item.name !== "string") return [];
        const defaultItem = modeDefaults.strings[index] ?? modeDefaults.strings[0];
        return [{
          ...item,
          id: item.id,
          name: item.name,
          note: typeof item.note === "string" ? item.note : defaultItem.note,
          frequencyHz: typeof item.frequencyHz === "number" && Number.isFinite(item.frequencyHz) ? item.frequencyHz : defaultItem.frequencyHz,
          linearDensityGPerM: typeof item.linearDensityGPerM === "number" && Number.isFinite(item.linearDensityGPerM) ? item.linearDensityGPerM : defaultItem.linearDensityGPerM,
          material: typeof item.material === "string" ? item.material : defaultItem.material,
          construction: typeof item.construction === "string" ? item.construction : defaultItem.construction,
        } as ViolinString];
      })
    : modeDefaults.strings;

  const parts: ComponentPart[] = Array.isArray(value.parts)
    ? value.parts.filter(isRecord).flatMap((item) => {
        if (typeof item.id !== "string" || typeof item.name !== "string") return [];
        const libraryPart = COMPONENT_LIBRARY.find((part) => part.id === item.id);
        const connections = Array.isArray(item.connections)
          ? item.connections.filter((entry): entry is string => typeof entry === "string")
          : libraryPart?.connections ?? [];
        const dimensions = isRecord(item.dimensions)
          ? Object.fromEntries(Object.entries(item.dimensions).filter(([, entry]) => typeof entry === "number" || typeof entry === "string")) as Record<string, number | string>
          : libraryPart?.dimensions ?? {};
        return [{
          ...item,
          id: item.id,
          name: item.name,
          category: typeof item.category === "string" ? item.category : libraryPart?.category ?? "Custom",
          material: typeof item.material === "string" ? item.material : libraryPart?.material ?? "Custom / not specified",
          connections,
          quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(1, Math.round(item.quantity)) : 1,
          dimensions,
        } as ComponentPart];
      })
    : modeDefaults.parts;

  return {
    ...value,
    schemaVersion,
    projectType: "instrumentaz-project",
    instrument: "violin",
    designMode: mode,
    unitSystem: "metric",
    parameters,
    strings,
    parts,
    staleAnalyses: Array.isArray(value.staleAnalyses) ? value.staleAnalyses.filter((entry): entry is string => typeof entry === "string") : [],
  } as ProjectData;
}

const LOCAL_RECOVERY_KEY = "instrumentaz.project.recovery.v1";

function projectEnvelope(name: string, data: ProjectData) {
  return {
    format: "InstrumentAZ",
    formatVersion: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name, instrument: "violin", data },
  };
}

function readIazProject(value: unknown, fallbackName: string): { name: string; data: ProjectData } {
  if (!isRecord(value)) throw new Error("The file does not contain a project object.");
  if (value.format !== undefined && value.format !== "InstrumentAZ") throw new Error("Unsupported file format. Only InstrumentAZ .iaz projects can be imported in this build.");
  if (typeof value.formatVersion === "string") {
    if (!/^\\d+\\.\\d+\\.\\d+$/.test(value.formatVersion)) throw new Error("The .iaz format version is invalid.");
    const supportedMajor = Number(PROJECT_FORMAT_VERSION.split(".")[0]);
    if (Number(value.formatVersion.split(".")[0]) > supportedMajor) throw new Error(`.iaz v${value.formatVersion} is newer than this preview supports.`);
  }
  const project = isRecord(value.project) ? value.project : value;
  const data = normalizeProjectData(project.data ?? value.data ?? project);
  return { name: typeof project.name === "string" && project.name.trim() ? project.name.trim().slice(0, 120) : fallbackName, data };
}

function readLocalRecovery(): { name: string; data: ProjectData } | null {
  try {
    const serialized = window.localStorage.getItem(LOCAL_RECOVERY_KEY);
    return serialized ? readIazProject(JSON.parse(serialized) as unknown, "Recovered violin study") : null;
  } catch (error) {
    console.warn("InstrumentAZ local recovery could not be read", error);
    return null;
  }
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "instrumentaz-project";
}

function formatDate(value: string | Date | undefined) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 20) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return date.toLocaleDateString();
}

function InstrumentMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`instrument-brand-mark ${small ? "instrument-brand-mark-small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 42 42" fill="none">
        <path d="M21 4.5 36 35H7L21 4.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M17.2 27.5 24.8 12.3M12.7 27.2h16.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        <circle cx="21" cy="30.4" r="2.2" fill="currentColor" />
      </svg>
    </div>
  );
}

function DraftNumberInput({
  value,
  min,
  max,
  step,
  onCommit,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.value = String(value);
  }, [value]);

  function commitDraft() {
    const input = inputRef.current;
    if (!input) return;
    const numeric = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(numeric)) {
      input.value = String(value);
      return;
    }
    const next = Math.min(max, Math.max(min, numeric));
    input.value = String(next);
    if (next !== value) onCommit(next);
  }

  return <input ref={inputRef} type="number" defaultValue={value} min={min} max={max} step={step} onBlur={commitDraft} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={ariaLabel} />;
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  compact = false,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  const rangeValue = Math.min(max, Math.max(min, value));
  return (
    <label className={`number-field ${compact ? "number-field-compact" : ""}`}>
      <span className="number-field-label">{label}</span>
      <span className="number-input-wrap">
        <DraftNumberInput value={value} min={min} max={max} step={step} onCommit={onChange} ariaLabel={`${label} (${unit})`} />
        <small>{unit}</small>
      </span>
      <input className="parameter-range" type="range" min={min} max={max} step={step} value={rangeValue} onChange={(event) => onChange(Number(event.target.value))} aria-label={`${label} adjustment`} />
    </label>
  );
}

function StringTable({ data, onStringChange }: { data: ProjectData; onStringChange: (id: string, field: "frequencyHz" | "linearDensityGPerM", value: number) => void }) {
  const length = data.parameters.effectiveVibratingLengthMm;
  return (
    <div className="string-table-wrap">
      <table className="string-table">
        <thead>
          <tr><th>STRING</th><th>TARGET PITCH</th><th>LINEAR DENSITY</th><th>CALCULATED TENSION</th><th>MODEL</th></tr>
        </thead>
        <tbody>
          {data.strings.map((string, index) => {
            const tension = calculateStringTension(length, string.frequencyHz, string.linearDensityGPerM);
            return (
              <tr key={string.id}>
                <td><span className={`string-swatch string-swatch-${index}`} /><strong>{string.name}</strong><small className="string-note">{string.note}</small></td>
                <td><span className="table-input"><DraftNumberInput value={string.frequencyHz} min={20} max={1600} step={0.01} onCommit={(value) => onStringChange(string.id, "frequencyHz", value)} ariaLabel={`${string.name} target frequency in hertz`} /><span>Hz</span></span></td>
                <td><span className="table-input"><DraftNumberInput value={string.linearDensityGPerM} min={0.01} max={50} step={0.01} onCommit={(value) => onStringChange(string.id, "linearDensityGPerM", value)} ariaLabel={`${string.name} linear density in grams per meter`} /><span>g/m</span></span></td>
                <td><strong className="tension-value">{tension === null ? "—" : tension.toFixed(1)} <small>N</small></strong></td>
                <td><span className="model-status"><span /> Ideal string</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="model-assumption"><CircleAlert size={14} /><span>Calculated with the ideal flexible-string equation. Bending stiffness, winding details, temperature and measured breaking strength are not modeled.</span><span className="result-badge">Calculated · unvalidated</span></div>
    </div>
  );
}

function AnalysisPanel({
  data,
  activeTab,
  setActiveTab,
  onStringChange,
  onSelectPart,
  activeParameter,
  onExportBom,
}: {
  data: ProjectData;
  activeTab: AnalysisTab;
  setActiveTab: (tab: AnalysisTab) => void;
  onStringChange: (id: string, field: "frequencyHz" | "linearDensityGPerM", value: number) => void;
  onSelectPart: (partId: string) => void;
  activeParameter: ParameterKey;
  onExportBom: () => void;
}) {
  const totalTension = data.strings.reduce((sum, string) => sum + (calculateStringTension(data.parameters.effectiveVibratingLengthMm, string.frequencyHz, string.linearDensityGPerM) ?? 0), 0);
  const warnings = validateProject(data);
  return (
    <section className="analysis-panel">
      <div className="analysis-tabs-row">
        <div className="analysis-tabs" role="tablist" aria-label="Engineering panels">
          <button role="tab" aria-selected={activeTab === "parameters"} className={activeTab === "parameters" ? "analysis-tab is-active" : "analysis-tab"} onClick={() => setActiveTab("parameters")}><SlidersHorizontal size={14} /> Parameters</button>
          <button role="tab" aria-selected={activeTab === "strings"} className={activeTab === "strings" ? "analysis-tab is-active" : "analysis-tab"} onClick={() => setActiveTab("strings")}><Waves size={14} /> String model <span className="tab-live-dot" /></button>
          <button role="tab" aria-selected={activeTab === "impact"} className={activeTab === "impact" ? "analysis-tab is-active" : "analysis-tab"} onClick={() => setActiveTab("impact")}><GitBranch size={14} /> Impact analysis {data.staleAnalyses.length > 0 && <span className="tab-count">{data.staleAnalyses.length}</span>}</button>
          <button role="tab" aria-selected={activeTab === "bom"} className={activeTab === "bom" ? "analysis-tab is-active" : "analysis-tab"} onClick={() => setActiveTab("bom")}><ClipboardCheck size={14} /> BOM & checks {warnings.length > 0 && <span className="tab-count tab-count-warn">{warnings.length}</span>}</button>
        </div>
        <span className="analysis-unit">SI · mm · N · Hz</span>
      </div>
      {activeTab === "parameters" && (
        <div className="parameter-summary-grid">
          <button className="summary-card" onClick={() => onSelectPart("body")}><span className="summary-card-icon"><Box size={15} /></span><span><small>BODY LENGTH</small><strong>{data.parameters.bodyLengthMm.toFixed(1)} <i>mm</i></strong></span><span className="summary-card-arrow"><ArrowRight size={14} /></span></button>
          <button className="summary-card" onClick={() => onSelectPart("bridge")}><span className="summary-card-icon"><Ruler size={15} /></span><span><small>BRIDGE HEIGHT</small><strong>{data.parameters.bridgeHeightMm.toFixed(1)} <i>mm</i></strong></span><span className="summary-card-arrow"><ArrowRight size={14} /></span></button>
          <button className="summary-card" onClick={() => onSelectPart("strings")}><span className="summary-card-icon"><Waves size={15} /></span><span><small>TOTAL STRING LOAD</small><strong>{totalTension.toFixed(1)} <i>N</i></strong></span><span className="computed-tag">Calculated</span></button>
          <button className="summary-card" onClick={() => setActiveTab("impact")}><span className="summary-card-icon"><GitBranch size={15} /></span><span><small>DEPENDENT ANALYSES</small><strong>{data.staleAnalyses.length || 0} <i>need review</i></strong></span><span className={data.staleAnalyses.length ? "impact-indicator is-stale" : "impact-indicator"}><span /></span></button>
        </div>
      )}
      {activeTab === "strings" && <StringTable data={data} onStringChange={onStringChange} />}
      {activeTab === "impact" && <ImpactPanel data={data} activeParameter={activeParameter} />}
      {activeTab === "bom" && <BomPanel data={data} onExportBom={onExportBom} compact />}
    </section>
  );
}

function ImpactPanel({ data, activeParameter }: { data: ProjectData; activeParameter: ParameterKey }) {
  const dependencies = PARAMETER_DEPENDENCIES[activeParameter];
  return (
    <div className="impact-panel">
      <div className="impact-trigger"><span className="impact-trigger-kicker">CHANGE PROPAGATION</span><strong>{PARAMETER_META[activeParameter].label}</strong><span>{data.parameters[activeParameter]} {PARAMETER_META[activeParameter].unit}</span></div>
      <div className="impact-arrow-line"><span /><i /><i /><i /><span /></div>
      <div className="impact-targets">
        {dependencies.slice(0, 4).map((dependency, index) => {
          const planned = dependency.toLowerCase().includes("not implemented");
          return <div className={`impact-target ${planned ? "impact-target-planned" : ""}`} key={dependency}><span className="impact-index">0{index + 1}</span><span><strong>{dependency.replace(" · not implemented", "")}</strong><small>{planned ? "Model not implemented" : index === 0 ? "Derived / current parameter" : "Impact identified · review required"}</small></span><span className={`impact-state ${planned ? "" : "impact-state-stale"}`}>{planned ? "Planned" : "Review"}</span></div>;
        })}
      </div>
      <div className="impact-footnote"><Info size={13} /> Parameter changes are saved; downstream CAD, acoustics and drawing recomputation is not implemented yet.</div>
    </div>
  );
}

function BomPanel({ data, onExportBom, compact = false }: { data: ProjectData; onExportBom: () => void; compact?: boolean }) {
  const warnings = validateProject(data);
  const materialCount = new Set(data.parts.map((part) => part.material)).size;
  return (
    <div className={`bom-panel ${compact ? "bom-panel-compact" : ""}`}>
      <div className="bom-quick-stats"><div><strong>{data.parts.reduce((sum, part) => sum + part.quantity, 0)}</strong><span>Total items</span></div><div><strong>{data.parts.length}</strong><span>Part definitions</span></div><div><strong>{materialCount}</strong><span>Material callouts</span></div><div className={warnings.length ? "stat-needs-review" : ""}><strong>{warnings.length}</strong><span>Data checks</span></div></div>
      {data.parts.length === 0 ? <div className="empty-bom-state">Add parts from the component library to create a BOM.</div> : (
        <div className="bom-mini-list">
          {data.parts.slice(0, compact ? 4 : 18).map((part) => <div className="bom-mini-row" key={part.id}><span className="bom-item-dot" /><span className="bom-item-name">{part.name}</span><span className="bom-item-material">{part.material}</span><strong>× {part.quantity}</strong></div>)}
          {compact && data.parts.length > 4 && <span className="bom-more">+ {data.parts.length - 4} more assembly items</span>}
        </div>
      )}
      <div className="manufacturing-readiness"><div className="readiness-title"><ShieldAlert size={15} /><strong>Manufacturing readiness</strong><span className="readiness-label">NOT READY</span></div><p>BOM CSV can be exported. Production tolerances, validated CAD solids, supplier-grade material specs and technical drawings are not present.</p><button className="quiet-action" onClick={onExportBom}><Download size={14} /> Export BOM CSV</button></div>
    </div>
  );
}

function StringEngineeringWorkspace({
  data,
  onStringChange,
  onParameterChange,
}: {
  data: ProjectData;
  onStringChange: (id: string, field: "frequencyHz" | "linearDensityGPerM", value: number) => void;
  onParameterChange: (key: ParameterKey, value: number) => void;
}) {
  const totalTension = data.strings.reduce((sum, string) => sum + (calculateStringTension(data.parameters.effectiveVibratingLengthMm, string.frequencyHz, string.linearDensityGPerM) ?? 0), 0);
  return (
    <div className="domain-workspace string-workspace">
      <div className="domain-heading"><div><span className="eyebrow-label">VIOLIN ENGINEERING / STRING MODEL</span><h2>String mechanics</h2><p>Parametric tuning and static tension calculation · ideal flexible-string model.</p></div><div className="domain-heading-status"><span className="status-green-dot" /> Calculated locally</div></div>
      <div className="string-overview-grid">
        <div className="string-total-card"><span className="overline">ESTIMATED STATIC AXIAL LOAD</span><strong>{totalTension.toFixed(1)} <i>N</i></strong><span>Sum of four ideal-string tensions at target pitch</span><div className="load-bar"><i style={{ width: `${Math.min(100, totalTension / 6)}%` }} /></div><small>Not a structural safety rating · no bridge or plate stress analysis</small></div>
        <div className="string-length-card"><div className="field-inline-heading"><span className="overline">EFFECTIVE VIBRATING LENGTH</span><span className="computed-tag">Shared parameter</span></div><NumberField label="Nut-to-bridge vibrating length" unit="mm" value={data.parameters.effectiveVibratingLengthMm} min={PARAMETER_META.effectiveVibratingLengthMm.min} max={PARAMETER_META.effectiveVibratingLengthMm.max} step={PARAMETER_META.effectiveVibratingLengthMm.step} onChange={(value) => onParameterChange("effectiveVibratingLengthMm", value)} compact /><div className="string-length-foot"><span>Common to all modeled strings</span><span>mm</span></div></div>
      </div>
      <div className="string-table-card"><div className="table-section-heading"><div><strong>Tuning & line density</strong><span>Edit target frequency or linear mass density to recalculate tension.</span></div><span className="table-units">f₀ = ½L · √(T/μ)</span></div><StringTable data={data} onStringChange={onStringChange} /></div>
      <div className="string-assumption-card"><div className="assumption-icon"><CircleAlert size={17} /></div><div><strong>Model assumptions & missing data</strong><p>The equation uses target fundamental frequency, vibrating length and user-supplied linear density. It omits string stiffness, winding layer geometry, bridge compliance, friction, temperature and playing forces. No string manufacturer break-strength limits are included, so compatibility and safety are not certified.</p><div className="assumption-tags"><span>Calculated · not validated</span><span>Actual tuning: not measured</span><span>Break strength: not supplied</span></div></div></div>
    </div>
  );
}

function DependencyWorkspace({ data }: { data: ProjectData }) {
  const parameterNodes = [
    { id: "body", label: "Violin geometry", detail: `${data.parameters.bodyLengthMm.toFixed(1)} mm body · ${data.parameters.bodyWidthMm.toFixed(1)} mm width`, state: "implemented" },
    { id: "strings", label: "String parameters", detail: `${data.strings.length} strings · ${data.parameters.effectiveVibratingLengthMm.toFixed(1)} mm vibrating length`, state: "implemented" },
  ];
  return (
    <div className="domain-workspace dependency-workspace">
      <div className="domain-heading"><div><span className="eyebrow-label">UNIFIED PROJECT MODEL / DEPENDENCY GRAPH</span><h2>Design impact graph</h2><p>Trace the current parameter relationships; pending domain solvers are labeled.</p></div><span className="graph-version-pill"><GitBranch size={14} /> Schema {data.schemaVersion}</span></div>
      <div className="graph-legend"><span><i className="graph-dot graph-dot-live" /> Implemented calculations / model data</span><span><i className="graph-dot graph-dot-planned" /> Planned · no solver connected</span></div>
      <div className="dependency-flow">
        <div className="graph-column"><span className="graph-column-kicker">INPUTS</span>{parameterNodes.map((node) => <div className="graph-node graph-node-source" key={node.id}><span className="graph-node-icon"><Ruler size={16} /></span><div><strong>{node.label}</strong><small>{node.detail}</small></div><span className="node-status node-status-live">Active</span></div>)}</div>
        <div className="graph-connectors" aria-hidden="true"><svg viewBox="0 0 120 330" preserveAspectRatio="none"><defs><marker id="graph-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6" fill="none" stroke="#77a9aa" strokeWidth="1.2" /></marker></defs><path d="M0 70 C48 70 48 62 120 62M0 70 C48 70 48 152 120 152M0 235 C48 235 48 62 120 62M0 235 C48 235 48 152 120 152M0 235 C48 235 48 242 120 242" markerEnd="url(#graph-arrow)" /></svg></div>
        <div className="graph-column"><span className="graph-column-kicker">DEPENDENT SYSTEMS</span>{DEPENDENCY_GRAPH.map((node) => <div className={`graph-node ${node.status === "implemented" ? "graph-node-live" : "graph-node-planned"}`} key={node.id}><span className="graph-node-icon">{node.status === "implemented" ? <Activity size={16} /> : <CircleHelp size={16} />}</span><div><strong>{node.label}</strong><small>{node.layer}</small></div><span className={`node-status ${node.status === "implemented" ? "node-status-live" : "node-status-planned"}`}>{node.status === "implemented" ? "Active" : "Planned"}</span></div>)}</div>
      </div>
      <div className="graph-change-log"><div className="graph-change-heading"><span className="overline">INVALIDATION TRACKER</span><span>{data.staleAnalyses.length ? `${data.staleAnalyses.length} parameter change${data.staleAnalyses.length === 1 ? "" : "s"} in current revision` : "No pending recompute requests"}</span></div>{data.staleAnalyses.length ? data.staleAnalyses.map((item) => <span className="invalidated-chip" key={item}><Clock3 size={12} /> {item}</span>) : <p>Edit a geometry or string parameter to see its declared downstream impacts. Planned solvers remain inactive.</p>}</div>
    </div>
  );
}

function RoadmapWorkspace({ workspace }: { workspace: WorkspaceId }) {
  const details: Record<string, { phase: string; title: string; intro: string; bullets: string[]; risk: string }> = {
    electronics: { phase: "Milestone 4", title: "Electronics Studio", intro: "Schematic and PCB editors are not connected in this preview. No ERC/DRC results are fabricated.", bullets: ["Unified symbols, pin/net model and component metadata", "Schematic connectivity plus explicit ERC", "PCB footprints, clearances and Gerber / drill export", "CAD-mounted packages with enclosure fit checks"], risk: "No schematic solver, PCB router, symbol library, or Gerber writer is currently installed." },
    lab: { phase: "Milestone 6", title: "Virtual Electronics Lab", intro: "No virtual instruments are attached because there is no circuit simulator behind them.", bullets: ["SPICE-compatible solver adapter before any virtual measurement tools", "DMM and scope bind to selected simulated nodes", "Signal generator / supply provide actual simulator stimuli", "Simulation and physical hardware readings shown separately"], risk: "Virtual probes and readings are intentionally unavailable until a simulator produces them." },
    firmware: { phase: "Milestone 5", title: "Coding Studio", intro: "Firmware source and a build/upload toolchain are not connected to this engineering preview.", bullets: ["C / C++ / Rust / MicroPython project files", "PlatformIO, Arduino CLI or ESP-IDF adapter", "Pin mappings sourced from a checked schematic", "Build logs and serial monitor only when a tool / device is attached"], risk: "No compiler, board profile, serial endpoint, or physical device is being claimed." },
    audio: { phase: "Milestone 7", title: "Procedural audio & acoustics", intro: "Procedural audio and instrument acoustic solvers are not yet implemented; this panel does not play a sample-backed sound.", bullets: ["String model calibrated against measured references", "Procedural bowed-string / plucked excitation model", "Body, bridge and pickup response with stated assumptions", "Frequency response shown as calculated, estimated or measured"], risk: "The current ideal-string tension equation is not a timbre, resonance or audio simulation." },
  };
  const info = details[workspace] ?? details.electronics;
  const workspaceMeta = WORKSPACES.find((item) => item.id === workspace);
  const Icon = workspaceMeta?.icon ?? CircuitBoard;
  return (
    <div className="roadmap-workspace">
      <div className="roadmap-hero"><div className="roadmap-icon"><Icon size={21} /></div><span className="eyebrow-label">ENGINEERING ROADMAP · {info.phase.toUpperCase()}</span><h2>{info.title}</h2><p>{info.intro}</p><span className="implementation-badge"><span /> Not implemented in this build</span></div>
      <div className="roadmap-body"><div className="roadmap-planned"><span className="overline">PLANNED SCOPE</span>{info.bullets.map((item, index) => <div className="roadmap-item" key={item}><span>0{index + 1}</span><p>{item}</p></div>)}</div><div className="roadmap-risk"><CircleAlert size={16} /><div><strong>Capability boundary</strong><p>{info.risk}</p></div></div></div>
      <div className="architecture-note"><span className="overline">NATIVE TARGET — NOT CONNECTED</span><div className="architecture-chips"><span>C++20 / OCCT B-rep</span><span>Rust application services</span><span>Windows / Direct3D 12 + HLSL</span><span>Versioned .iaz project</span></div><p>OCCT’s own tessellator can provide display meshes; a separate D3D12 backend still needs topology-aware mesh extraction and GPU resource management. This browser preview has no native renderer, C++/Rust FFI or geometry kernel.</p><div className="research-links"><a href="https://dev.opencascade.org/doc/occt-7.8.0/overview/html/occt_user_guides__mesh.html" target="_blank" rel="noreferrer">OCCT meshing guide <ExternalLink size={12} /></a><a href="https://learn.microsoft.com/en-us/windows/win32/direct3d12/executing-and-synchronizing-command-lists" target="_blank" rel="noreferrer">D3D12 command queues <ExternalLink size={12} /></a><a href="https://cxx.rs/" target="_blank" rel="noreferrer">CXX FFI guide <ExternalLink size={12} /></a></div></div>
    </div>
  );
}

function AppModal({
  kind,
  onClose,
  onCreate,
  onChooseComponent,
  onChooseProject,
  onCommand,
  onNewProject,
  onExport,
  projectName,
  projectList,
  data,
  componentFilter,
  setComponentFilter,
  commandSearch,
  setCommandSearch,
  createName,
  setCreateName,
  createMode,
  setCreateMode,
  isCreating,
}: {
  kind: ModalKind;
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onChooseComponent: (part: ComponentPart) => void;
  onChooseProject: (project: ProjectRecord) => void;
  onCommand: (command: string) => void;
  onNewProject: () => void;
  onExport: (kind: "iaz" | "bom") => void;
  projectName: string;
  projectList: ProjectRecord[];
  data: ProjectData;
  componentFilter: string;
  setComponentFilter: (value: string) => void;
  commandSearch: string;
  setCommandSearch: (value: string) => void;
  createName: string;
  setCreateName: (value: string) => void;
  createMode: DesignMode;
  setCreateMode: (value: DesignMode) => void;
  isCreating: boolean;
}) {
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  if (!kind) return null;
  const missingLibraryParts = COMPONENT_LIBRARY.filter((part) => !data.parts.some((current) => current.id === part.id));
  const filteredParts = missingLibraryParts.filter((part) => `${part.name} ${part.category} ${part.material}`.toLowerCase().includes(componentFilter.toLowerCase()));
  const commands = [
    { label: "Open violin design", key: "design", icon: Box },
    { label: "Open string engineering", key: "strings", icon: Waves },
    { label: "Open dependency graph", key: "dependencies", icon: GitBranch },
    { label: "Open manufacturing BOM", key: "manufacturing", icon: ClipboardCheck },
    { label: "Switch to Component Assembly", key: "mode-assembly", icon: Layers },
    { label: "Switch to Build A–Z", key: "mode-build", icon: DraftingCompass },
    { label: "Select violin body", key: "select-body", icon: Box },
    { label: "Export project as .iaz", key: "export-iaz", icon: Download },
    { label: "Export BOM as CSV", key: "export-bom", icon: FileText },
  ].filter((item) => item.label.toLowerCase().includes(commandSearch.toLowerCase()));

  return (
    <div className={`modal-backdrop ${kind === "command" ? "command-backdrop" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`app-modal ${kind === "command" ? "command-modal" : ""}`} role="dialog" aria-modal="true" aria-label={kind === "new-project" ? "Create a project" : kind === "component-library" ? "Component library" : kind === "projects" ? "Recent projects" : kind === "command" ? "Command palette" : "About InstrumentAZ"}>
        {kind === "new-project" && <>
          <div className="modal-header"><div><span className="eyebrow-label">NEW DESIGN / VIOLIN</span><h2>Start a project</h2><p>Choose how you want to begin. Both modes share the same project model.</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
          <form onSubmit={onCreate} className="new-project-form">
            <label className="form-label">PROJECT NAME<input autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} maxLength={120} required placeholder="e.g. Workshop prototype 01" /></label>
            <div className="form-label mode-picker-label">STARTING WORKSPACE</div>
            <div className="project-mode-picker">
              <button type="button" className={`project-mode-card ${createMode === "assembly" ? "project-mode-selected" : ""}`} onClick={() => setCreateMode("assembly")}><span className="mode-card-icon"><Layers size={18} /></span><strong>Component Assembly</strong><span>Begin with 18 reference violin parts, materials and connection records.</span><small>REFERENCE PARTS INCLUDED</small></button>
              <button type="button" className={`project-mode-card ${createMode === "build" ? "project-mode-selected" : ""}`} onClick={() => setCreateMode("build")}><span className="mode-card-icon"><DraftingCompass size={18} /></span><strong>Build A–Z</strong><span>Start with a blank assembly and shared violin engineering parameters.</span><small>EMPTY ASSEMBLY</small></button>
            </div>
            <div className="modal-action-row"><span><CheckCircle2 size={14} /> Saved to your project library</span><button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? "Creating…" : "Create project"}<ArrowRight size={15} /></button></div>
          </form>
        </>}
        {kind === "component-library" && <>
          <div className="modal-header"><div><span className="eyebrow-label">VIOLIN / REFERENCE LIBRARY</span><h2>Component library</h2><p>Insert a defined reference component. Connection requirements are checked.</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
          <label className="library-search"><Search size={15} /><input autoFocus value={componentFilter} onChange={(event) => setComponentFilter(event.target.value)} placeholder="Filter parts, materials, categories…" /></label>
          <div className="library-list">{filteredParts.length === 0 ? <div className="library-empty">All reference parts are in this assembly, or no component matches this search.</div> : filteredParts.map((part) => {
            const missingConnections = part.connections.filter((connection) => !data.parts.some((current) => current.id === connection));
            return <button className="library-item" key={part.id} onClick={() => onChooseComponent(part)}><span className="library-part-icon"><Box size={17} /></span><span className="library-item-copy"><strong>{part.name}</strong><small>{part.category} · {part.material}</small><em>{missingConnections.length ? `Requires: ${missingConnections.join(", ")}` : "Connections available"}</em></span><span className="library-quantity">×{part.quantity}</span><Plus size={15} /></button>;
          })}</div>
          <div className="library-footnote"><Info size={13} /> Reference specifications are starting values, not manufacturer-certified production geometry.</div>
        </>}
        {kind === "projects" && <>
          <div className="modal-header"><div><span className="eyebrow-label">PROJECT LIBRARY / POSTGRESQL</span><h2>Recent projects</h2><p>Versioned .iaz project data saved to this workspace.</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
          <div className="project-list">{projectList.length === 0 ? <div className="library-empty">No server-saved projects yet. This project may be running in local-only mode.</div> : projectList.map((project) => (
            <button className="project-list-item" key={project.id} onClick={() => onChooseProject(project)}><span className="project-list-icon"><Music2 size={17} /></span><span><strong>{project.name}</strong><small>Violin · .iaz {project.formatVersion} · Updated {formatDate(project.updatedAt)}</small></span>{project.name === projectName ? <span className="current-project-tag">OPEN</span> : <ArrowRight size={15} />}</button>
          ))}</div>
          <div className="modal-action-row"><span><DatabaseBadge /> Versioned project JSON</span><button className="primary-button" onClick={onNewProject}><Plus size={15} /> New project</button></div>
        </>}
        {kind === "command" && <>
          <label className="command-search"><Command size={17} /><input autoFocus value={commandSearch} onChange={(event) => { setCommandSearch(event.target.value); setActiveCommandIndex(0); }} onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveCommandIndex((current) => Math.min(Math.max(0, commands.length - 1), current + 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveCommandIndex((current) => Math.max(0, current - 1)); }
            if (event.key === "Enter" && commands[activeCommandIndex]) { event.preventDefault(); onCommand(commands[activeCommandIndex].key); }
          }} placeholder="Type a command or workspace…" /><kbd>ESC</kbd></label>
          <div className="command-list">{commands.map((item, index) => { const Icon = item.icon; return <button key={item.key} className={`command-item ${activeCommandIndex === index ? "command-item-active" : ""}`} onMouseEnter={() => setActiveCommandIndex(index)} onClick={() => onCommand(item.key)}><span><Icon size={16} /></span>{item.label}<ArrowRight size={14} /></button>; })}{commands.length === 0 && <div className="library-empty">No matching command.</div>}</div>
          <div className="command-footer"><span>Navigate engineering workspaces</span><span><kbd>↑</kbd><kbd>↓</kbd> select <kbd>↵</kbd> run</span></div>
        </>}
        {kind === "about" && <>
          <div className="modal-header"><div className="about-brand"><InstrumentMark /><div><span className="eyebrow-label">ENGINEERING STUDIO / PREVIEW</span><h2>InstrumentAZ</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
          <p className="about-intro">Connect imagination, engineering and real-world creation. This build focuses on versioned violin project storage, an editable reference assembly and transparent ideal-string calculations.</p>
          <div className="about-status-grid"><div><BadgeCheck size={16} /><span><strong>Working now</strong><small>PostgreSQL project save · undo/redo · BOM CSV · ideal-string tension calculator</small></span></div><div><ShieldAlert size={16} /><span><strong>Not connected yet</strong><small>OCCT, C++20, Rust, Direct3D 12, electronics, SPICE and audio engines</small></span></div></div>
          <div className="about-concepts"><span className="overline">BRAND STUDY / 3 MARK DIRECTIONS</span><div><span><InstrumentMark small /> <b>01 / String A</b><small>String + structural arch</small></span><span><span className="concept-mark concept-mark-two">IA</span><b>02 / Workshop monogram</b><small>Tooling + initials</small></span><span><span className="concept-mark concept-mark-three"><Waves size={17} /></span><b>03 / Resonance lines</b><small>Signal + soundboard</small></span></div></div>
          <div className="about-links"><a href="https://dev.opencascade.org/doc/overview/html/" target="_blank" rel="noreferrer">OCCT documentation <ExternalLink size={12} /></a><a href="https://learn.microsoft.com/en-us/windows/win32/direct3d12/direct3d-12-graphics" target="_blank" rel="noreferrer">Direct3D 12 <ExternalLink size={12} /></a><a href="https://cxx.rs/" target="_blank" rel="noreferrer">CXX Rust/C++ FFI <ExternalLink size={12} /></a></div>
          <div className="modal-action-row"><span>InstrumentAZ · violin-first · project format {PROJECT_FORMAT_VERSION}</span><button className="primary-button" onClick={onClose}>Back to design</button></div>
        </>}
      </section>
    </div>
  );
}

function DatabaseBadge() {
  return <span className="database-badge"><span /> PostgreSQL + Drizzle</span>;
}

export function InstrumentAZApp() {
  const [editor, dispatch] = useReducer(editorReducer, createDefaultProjectData(), createEditorState);
  const { data } = editor;
  const [workspace, setWorkspace] = useState<WorkspaceId>("design");
  const [selectedPartId, setSelectedPartId] = useState("body");
  const [activeParameter, setActiveParameter] = useState<ParameterKey>("bodyLengthMm");
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("parameters");
  const [modal, setModal] = useState<ModalKind>(null);
  const [projectList, setProjectList] = useState<ProjectRecord[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Violin study 04");
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "local" | "error">("loading");
  const [savedAt, setSavedAt] = useState<string | Date>();
  const [loadingProject, setLoadingProject] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [topMenu, setTopMenu] = useState<"file" | "edit" | "view" | null>(null);
  const [createName, setCreateName] = useState("Violin study 01");
  const [createMode, setCreateMode] = useState<DesignMode>("assembly");
  const [isCreating, setIsCreating] = useState(false);
  const [componentFilter, setComponentFilter] = useState("");
  const [commandSearch, setCommandSearch] = useState("");
  const [toast, setToast] = useState("");
  const [showBrowser, setShowBrowser] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const importInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3400);
  }

  useEffect(() => {
    let cancelled = false;
    async function openRecentProject() {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (!response.ok) throw new Error("Project API is unavailable.");
        const result = await response.json() as { projects?: ProjectRecord[] };
        const projects = Array.isArray(result.projects) ? result.projects : [];
        if (cancelled) return;
        setProjectList(projects);
        const recent = projects[0];
        if (recent) {
          const detailResponse = await fetch(`/api/projects/${recent.id}`, { cache: "no-store" });
          const detailResult = await detailResponse.json() as { project?: ProjectRecord; error?: string };
          if (!detailResponse.ok || !detailResult.project) throw new Error(detailResult.error ?? "Could not load the most recent project.");
          const activeProject = detailResult.project;
          const hydratedData = normalizeProjectData(activeProject.data);
          setProjectId(activeProject.id);
          setProjectName(activeProject.name);
          setSavedAt(activeProject.updatedAt);
          dispatch({ type: "replace", data: hydratedData });
          setSelectedPartId(hydratedData.parts[0]?.id ?? "body");
          setActiveParameter("bodyLengthMm");
          setSaveState("saved");
        } else {
          const recovery = readLocalRecovery();
          const starter = recovery?.data ?? createDefaultProjectData("assembly");
          const starterName = recovery?.name ?? "Violin study 04";
          const response = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: starterName, formatVersion: PROJECT_FORMAT_VERSION, data: starter }),
          });
          if (!response.ok) throw new Error("Could not initialize the project library.");
          const result = await response.json() as { project: ProjectRecord };
          if (cancelled) return;
          setProjectId(result.project.id);
          setProjectName(result.project.name);
          setProjectList([result.project]);
          setSavedAt(result.project.updatedAt);
          dispatch({ type: "replace", data: starter });
          setSelectedPartId(starter.parts[0]?.id ?? "body");
          setSaveState("saved");
          if (recovery) showToast("Recovered the latest local project and saved it to PostgreSQL.");
        }
        setLocalOnly(false);
      } catch (error) {
        if (cancelled) return;
        const recovery = readLocalRecovery();
        const fallback = recovery?.data ?? createDefaultProjectData("assembly");
        setProjectId(null);
        setProjectName(recovery?.name ?? "Violin study 04");
        setLocalOnly(true);
        setSaveState("local");
        dispatch({ type: "replace", data: fallback });
        setSelectedPartId(fallback.parts[0]?.id ?? "body");
        const detail = error instanceof Error ? error.message : "Project storage is unavailable.";
        showToast(recovery ? "Recovered the latest local .iaz draft. PostgreSQL is unavailable; this session will autosave in this browser." : `Project opened in local recovery mode: ${detail}`);
      } finally {
        if (!cancelled) {
          setLoadingProject(false);
          setHydrated(true);
        }
      }
    }
    void openRecentProject();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated || loadingProject || localOnly || !projectId) return;
    const sequence = ++saveSequence.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setSaveState("saving");
      void fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, formatVersion: PROJECT_FORMAT_VERSION, data }),
        signal: controller.signal,
      }).then(async (response) => {
        const result = await response.json() as { project?: ProjectRecord; error?: string };
        if (!response.ok || !result.project) throw new Error(result.error ?? "Save failed.");
        if (sequence !== saveSequence.current) return;
        setSavedAt(result.project.updatedAt);
        setProjectList((current) => [result.project as ProjectRecord, ...current.filter((project) => project.id !== projectId)].slice(0, 12));
        setSaveState("saved");
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("InstrumentAZ autosave failed", error);
        if (sequence === saveSequence.current) {
          setSaveState("error");
          showToast("Autosave failed. Export the .iaz project before leaving this page.");
        }
      });
    }, 750);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [data, projectId, projectName, hydrated, loadingProject, localOnly]);

  useEffect(() => {
    if (!hydrated || loadingProject) return;
    try {
      window.localStorage.setItem(LOCAL_RECOVERY_KEY, JSON.stringify(projectEnvelope(projectName, data)));
    } catch (error) {
      console.warn("InstrumentAZ recovery snapshot could not be written", error);
    }
  }, [data, projectName, hydrated, loadingProject]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setCommandSearch("");
        setModal("command");
      } else if ((event.metaKey || event.ctrlKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: "undo" });
      } else if ((event.metaKey || event.ctrlKey) && (key === "y" || (key === "z" && event.shiftKey))) {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (key === "escape") {
        setModal(null);
        setTopMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectedPart = data.parts.find((part) => part.id === selectedPartId);
  const selectedKeys = selectedPart ? PARAMETER_MAP[selectedPart.id] ?? [] : [];
  const projectWarnings = useMemo(() => validateProject(data), [data]);
  const currentWorkspace = WORKSPACES.find((item) => item.id === workspace) ?? WORKSPACES[0];
  const groupedParts = useMemo(() => {
    const groups = new Map<string, ComponentPart[]>();
    for (const part of data.parts) groups.set(part.category, [...(groups.get(part.category) ?? []), part]);
    return Array.from(groups.entries());
  }, [data.parts]);

  function commit(update: (current: ProjectData) => ProjectData) {
    dispatch({ type: "commit", update });
  }

  function updateParameter(key: ParameterKey, value: number) {
    const meta = PARAMETER_META[key];
    const safeValue = Math.min(meta.max, Math.max(meta.min, value));
    setActiveParameter(key);
    commit((current) => {
      if (current.parameters[key] === safeValue) return current;
      const impacts = PARAMETER_DEPENDENCIES[key].map((dependency) => `${meta.label} → ${dependency}`);
      return {
        ...current,
        parameters: { ...current.parameters, [key]: safeValue },
        staleAnalyses: Array.from(new Set([...current.staleAnalyses, ...impacts])),
      };
    });
  }

  function updateString(id: string, field: "frequencyHz" | "linearDensityGPerM", value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    const safeValue = field === "frequencyHz" ? Math.min(1600, Math.max(20, value)) : Math.min(50, Math.max(0.01, value));
    const label = field === "frequencyHz" ? "Target frequency" : "Linear density";
    commit((current) => ({
      ...current,
      strings: current.strings.map((string) => string.id === id ? { ...string, [field]: safeValue } : string),
      staleAnalyses: Array.from(new Set([...current.staleAnalyses, `${label} → string tension · recalculated`])),
    }));
  }

  function updatePartMaterial(material: string) {
    commit((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPartId ? { ...part, material } : part) }));
  }

  function handleModeChange(mode: DesignMode) {
    if (data.designMode === mode) return;
    commit((current) => ({ ...current, designMode: mode }));
    showToast(mode === "assembly" ? "Component Assembly mode active · existing components retained." : "Build A–Z mode active · existing components retained. Start a blank Build A–Z project from File → New project.");
  }

  function handleExportProject() {
    const envelope = projectEnvelope(projectName, data);
    downloadText(`${safeFileName(projectName)}.iaz`, JSON.stringify(envelope, null, 2), "application/vnd.instrumentaz.project+json");
    const warnings = validateProject(data).length;
    showToast(`Exported ${safeFileName(projectName)}.iaz (${warnings} model warning${warnings === 1 ? "" : "s"}). Project data only · not STEP/IGES or production geometry.`);
    setTopMenu(null);
  }

  function handleExportBom() {
    downloadText(`${safeFileName(projectName)}-bom.csv`, createBomCsv(data), "text/csv;charset=utf-8");
    showToast("BOM CSV exported · review the manufacturing readiness warnings before production.");
    setTopMenu(null);
  }

  async function createProject(nameValue: string, mode: DesignMode, incomingData?: ProjectData) {
    const name = nameValue.trim() || "Untitled violin study";
    const nextData = incomingData ?? createDefaultProjectData(mode);
    setIsCreating(true);
    let newId: string | null = null;
    let remoteProject: ProjectRecord | null = null;
    if (!localOnly) {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, formatVersion: PROJECT_FORMAT_VERSION, data: nextData }),
        });
        const result = await response.json() as { project?: ProjectRecord; error?: string };
        if (!response.ok || !result.project) throw new Error(result.error ?? "Project creation failed.");
        remoteProject = result.project;
        newId = result.project.id;
      } catch {
        setLocalOnly(true);
        showToast("Server storage is unavailable. This project is local-only; export its .iaz file to keep a copy.");
      }
    }
    setProjectId(newId);
    setProjectName(name);
    setSavedAt(remoteProject?.updatedAt);
    setSaveState(newId ? "saved" : "local");
    if (remoteProject) setProjectList((current) => [remoteProject as ProjectRecord, ...current.filter((project) => project.id !== remoteProject?.id)].slice(0, 12));
    dispatch({ type: "replace", data: nextData });
    setSelectedPartId(nextData.parts[0]?.id ?? "body");
    setActiveParameter("bodyLengthMm");
    setWorkspace("design");
    setModal(null);
    setTopMenu(null);
    setIsCreating(false);
    showToast(mode === "build" ? "Blank Build A–Z project created. Add reference components from the library." : "Component Assembly project created with violin reference components.");
  }

  function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCreating) void createProject(createName, createMode);
  }

  async function handleChooseProject(project: ProjectRecord) {
    setLoadingProject(true);
    setHydrated(false);
    setModal(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
      const result = await response.json() as { project?: ProjectRecord; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error ?? "Project could not be opened.");
      const opened = normalizeProjectData(result.project.data);
      setProjectId(result.project.id);
      setProjectName(result.project.name);
      setSavedAt(result.project.updatedAt);
      dispatch({ type: "replace", data: opened });
      setSelectedPartId(opened.parts[0]?.id ?? "body");
      setActiveParameter("bodyLengthMm");
      setSaveState("saved");
      setLocalOnly(false);
      setWorkspace("design");
    } catch {
      showToast("Could not open that project. Check the project library connection.");
    } finally {
      setLoadingProject(false);
      setHydrated(true);
    }
  }

  function handleChooseComponent(part: ComponentPart) {
    const missing = part.connections.filter((connection) => !data.parts.some((current) => current.id === connection));
    if (missing.length > 0) {
      showToast(`Add required components first: ${missing.join(", ")}.`);
      return;
    }
    commit((current) => ({
      ...current,
      parts: [...current.parts, { ...part, connections: [...part.connections], dimensions: { ...part.dimensions } }],
    }));
    setSelectedPartId(part.id);
    setModal(null);
    setComponentFilter("");
    showToast(`${part.name} added to the shared project model.`);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = readIazProject(parsed, file.name.replace(/\.iaz$/i, "Imported violin study"));
      await createProject(imported.name, imported.data.designMode, imported.data);
      showToast(`Imported ${file.name}. Review project warnings before export or manufacture.`);
    } catch (error) {
      showToast(error instanceof Error ? `Import failed: ${error.message}` : "Import failed: unsupported .iaz data.");
    }
  }

  async function saveNow() {
    if (localOnly || !projectId) {
      setSaveState("local");
      showToast("No PostgreSQL project connection. Export the .iaz file to save a portable copy.");
      return;
    }
    setSaveState("saving");
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, formatVersion: PROJECT_FORMAT_VERSION, data }),
      });
      const result = await response.json() as { project?: ProjectRecord; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error ?? "Save failed.");
      setSavedAt(result.project.updatedAt);
      setSaveState("saved");
      showToast("Project saved to PostgreSQL.");
    } catch {
      setSaveState("error");
      showToast("Manual save failed. Export .iaz as a recovery copy.");
    }
  }

  function handleCommand(command: string) {
    setModal(null);
    setCommandSearch("");
    if (command === "design" || command === "strings" || command === "dependencies" || command === "manufacturing") setWorkspace(command);
    if (command === "mode-assembly") handleModeChange("assembly");
    if (command === "mode-build") handleModeChange("build");
    if (command === "select-body") setSelectedPartId("body");
    if (command === "export-iaz") handleExportProject();
    if (command === "export-bom") handleExportBom();
  }

  const renderStringTools = () => <StringEngineeringWorkspace data={data} onStringChange={updateString} onParameterChange={updateParameter} />;
  const openLibrary = () => { setComponentFilter(""); setModal("component-library"); };
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? `Saved ${formatDate(savedAt)}` : saveState === "local" ? "Local session" : saveState === "error" ? "Save error" : "Loading…";

  return (
    <main className={`instrument-app ${isDark ? "theme-dark" : "theme-light"}`}>
      <header className="app-topbar">
        <div className="topbar-brand-area"><InstrumentMark /><div className="brand-wordmark"><span>Instrument<span className="brand-accent">AZ</span></span><small>ENGINEERING STUDIO</small></div><span className="topbar-divider" /><button className="project-switcher" onClick={() => setModal("projects")} aria-label="Open recent projects"><span className="project-switcher-icon"><Music2 size={15} /></span><span><strong>{projectName}</strong><small>VIOLIN / {data.designMode === "assembly" ? "COMPONENT ASSEMBLY" : "BUILD A–Z"}</small></span><ChevronDown size={14} /></button></div>
        <div className="topbar-menus">
          <div className="menu-anchor"><button className={`top-menu-button ${topMenu === "file" ? "top-menu-active" : ""}`} onClick={() => setTopMenu(topMenu === "file" ? null : "file")}>File</button>{topMenu === "file" && <div className="top-menu-popover"><button onClick={() => { setCreateName("Violin study 01"); setCreateMode("assembly"); setModal("new-project"); setTopMenu(null); }}><FilePlus2 size={15} /> New project</button><button onClick={() => { setModal("projects"); setTopMenu(null); }}><FolderOpenIcon /> Open recent project</button><button onClick={() => { importInput.current?.click(); setTopMenu(null); }}><FileUp size={15} /> Import .iaz file</button><i /><button onClick={handleExportProject}><Download size={15} /> Export project as .iaz</button><button onClick={handleExportBom}><FileText size={15} /> Export BOM as CSV</button></div>}</div>
          <div className="menu-anchor"><button className={`top-menu-button ${topMenu === "edit" ? "top-menu-active" : ""}`} onClick={() => setTopMenu(topMenu === "edit" ? null : "edit")}>Edit</button>{topMenu === "edit" && <div className="top-menu-popover"><button disabled={editor.past.length === 0} onClick={() => { dispatch({ type: "undo" }); setTopMenu(null); }}><UndoIcon /> Undo <kbd>⌘Z</kbd></button><button disabled={editor.future.length === 0} onClick={() => { dispatch({ type: "redo" }); setTopMenu(null); }}><Redo2 size={15} /> Redo <kbd>⌘⇧Z</kbd></button></div>}</div>
          <button className="top-menu-button top-menu-simple" onClick={() => { setShowBrowser((value) => !value); setTopMenu(null); }}>View</button>
          <button className="top-menu-button top-menu-simple" onClick={() => { setCommandSearch(""); setModal("command"); }}>Tools</button>
          <button className="top-menu-button top-menu-simple" onClick={() => setModal("about")}>Help</button>
        </div>
        <div className="topbar-actions"><button className="command-launcher" onClick={() => { setCommandSearch(""); setModal("command"); }}><Search size={14} /><span>Search commands…</span><kbd>⌘ K</kbd></button><button className="topbar-icon-action theme-toggle" onClick={() => setIsDark((value) => !value)} aria-label={`Switch to ${isDark ? "light" : "dark"} theme`} title={`Switch to ${isDark ? "light" : "dark"} theme`}><Lightbulb size={16} /></button><button className="topbar-icon-action" onClick={saveNow} aria-label="Save project" title="Save project"><Save size={15} /></button><span className={`save-indicator save-${saveState}`}><i />{saveLabel}</span><div className="user-avatar" aria-label="InstrumentAZ preview user">AZ</div></div>
      </header>

      <div className={`workspace-layout ${showBrowser ? "browser-visible" : "browser-hidden"} ${showInspector ? "inspector-visible" : "inspector-hidden"}`}>
        <nav className="tool-rail" aria-label="Engineering workspaces">
          <div className="rail-items">{WORKSPACES.map((item) => { const Icon = item.icon; return <button key={item.id} className={`rail-button ${workspace === item.id ? "rail-button-active" : ""} ${item.state === "planned" ? "rail-button-planned" : ""}`} onClick={() => setWorkspace(item.id)} aria-label={item.label} title={`${item.label}${item.state === "planned" ? ` · ${item.milestone}` : ""}`}><Icon size={18} strokeWidth={1.7} />{workspace === item.id && <i className="rail-active-indicator" />}{item.state === "planned" && <span className="rail-planned-dot" />}</button>; })}</div>
          <div className="rail-bottom"><button className="rail-button" onClick={() => setModal("about")} aria-label="About and documentation" title="About InstrumentAZ"><CircleHelp size={17} /></button><button className="rail-button" onClick={() => showToast("Workspace preferences are not persisted in this preview.")} aria-label="Settings" title="Settings"><Settings size={17} /></button><span className="rail-avatar">A</span></div>
        </nav>

        {showBrowser && <aside className="project-browser">
          <div className="panel-title-row"><div><span className="panel-kicker">PROJECT BROWSER</span><div className="panel-title">Assembly tree <span>{data.parts.length}</span></div></div><button className="icon-button panel-title-menu" onClick={() => setModal("projects")} aria-label="Open project library" title="Recent projects"><Menu size={16} /></button></div>
          <button className="tree-root-row" onClick={() => setSelectedPartId(data.parts[0]?.id ?? "body")}><span className="tree-root-icon"><Music2 size={14} /></span><span><strong>{projectName}</strong><small>Violin · {data.designMode === "assembly" ? "Component assembly" : "Build A–Z"}</small></span><ChevronDown size={13} /></button>
          <div className="tree-toolbar"><span>COMPONENTS <small>{data.parts.length.toString().padStart(2, "0")}</small></span><button className="small-add-button" onClick={openLibrary} aria-label="Add component" title="Add a reference component"><Plus size={15} /></button></div>
          <div className="tree-scroll-area">{data.parts.length === 0 ? <div className="empty-tree"><DraftingCompass size={19} /><strong>Blank design workspace</strong><span>Add reference components as needed. The geometry kernel is not connected.</span><button className="text-action" onClick={openLibrary}><Plus size={14} /> Browse component library</button></div> : groupedParts.map(([group, parts]) => <div className="tree-group" key={group}><div className="tree-group-heading"><ChevronDown size={12} /><span>{group}</span><small>{parts.length}</small></div>{parts.map((part) => <button key={part.id} className={`tree-part ${selectedPartId === part.id ? "tree-part-active" : ""}`} onClick={() => setSelectedPartId(part.id)}><span className="tree-part-icon">{part.category === "Hardware" ? <CircleDot size={13} /> : part.category === "Internal" ? <Activity size={13} /> : part.id === "strings" ? <Waves size={13} /> : <Box size={13} />}</span><span className="tree-part-name">{part.name}</span><span className="tree-part-quantity">{part.quantity > 1 ? `×${part.quantity}` : ""}</span>{selectedPartId === part.id && <i />}</button>)}</div>)}</div>
          <div className="browser-footer"><button onClick={openLibrary}><Boxes size={15} /><span>Reference library</span><Plus size={14} /></button><div className="browser-storage"><span className="database-status-dot" /> {localOnly ? "Local-only project" : "Project data · PostgreSQL"}</div></div>
        </aside>}

        <section className="studio-area">
          <div className="studio-heading"><div className="studio-heading-copy"><div className="breadcrumb"><span>INSTRUMENTAZ</span><ChevronRight size={11} /><span>VIOLIN</span><ChevronRight size={11} /><span className="breadcrumb-current">{currentWorkspace.label.toUpperCase()}</span></div><h1>{workspace === "design" ? "Instrument design" : workspace === "strings" ? "String engineering" : workspace === "dependencies" ? "Dependency graph" : currentWorkspace.label}</h1><div className="studio-subtitle">{workspace === "design" ? <><span className="status-green-dot" /> Shared violin project <span className="subtitle-separator">/</span> {data.designMode === "assembly" ? "Reference component assembly" : "Build A–Z workspace"}</> : <>{currentWorkspace.state === "ready" ? <><span className="status-green-dot" /> Calculated project data</> : <><span className="status-amber-dot" /> Planned capability · {currentWorkspace.milestone}</>}</>}</div></div>
            {workspace === "design" && <div className="studio-heading-actions"><div className="mode-segment" role="group" aria-label="Design mode"><button className={data.designMode === "assembly" ? "mode-segment-active" : ""} onClick={() => handleModeChange("assembly")}><Layers size={14} /> Component Assembly</button><button className={data.designMode === "build" ? "mode-segment-active" : ""} onClick={() => handleModeChange("build")}><DraftingCompass size={14} /> Build A–Z</button></div><span className="mode-info-wrap" title="Both design modes share the same parametric project data."><CircleHelp size={14} /></span></div>}
          </div>

          <div className="studio-content">
            {workspace === "design" && <div className="design-content">
              {data.parts.length === 0 ? <div className="blank-build-canvas"><div className="blank-canvas-grid" /><div className="blank-build-card"><span className="blank-icon"><DraftingCompass size={24} /></span><span className="eyebrow-label">BUILD A–Z / EMPTY ASSEMBLY</span><h2>Start with an idea.</h2><p>This project has no components yet. Add a violin reference part to the shared model, or switch to Component Assembly for a complete starter set.</p><div className="blank-actions"><button className="primary-button" onClick={openLibrary}><Plus size={15} /> Browse component library</button><button className="secondary-button" onClick={() => handleModeChange("assembly")}><Layers size={15} /> Start with assembly</button></div><span className="blank-kernel-note"><CircleAlert size={13} /> Sketch and native CAD modeling tools are not connected in this preview.</span></div><div className="blank-axis">X <i /> Y <i /> mm</div></div> : <ViolinViewport selectedPartId={selectedPartId} onSelectPart={setSelectedPartId} bodyLengthMm={data.parameters.bodyLengthMm} bodyWidthMm={data.parameters.bodyWidthMm} />}
              <AnalysisPanel data={data} activeTab={analysisTab} setActiveTab={setAnalysisTab} onStringChange={updateString} onSelectPart={setSelectedPartId} activeParameter={activeParameter} onExportBom={handleExportBom} />
            </div>}
            {workspace === "strings" && renderStringTools()}
            {workspace === "dependencies" && <DependencyWorkspace data={data} />}
            {workspace === "manufacturing" && <div className="domain-workspace bom-workspace"><div className="domain-heading"><div><span className="eyebrow-label">MANUFACTURING / MATERIALS & PARTS</span><h2>Bill of materials</h2><p>Part list from the shared project model · descriptive material callouts only.</p></div><button className="secondary-button" onClick={handleExportBom}><Download size={15} /> Export BOM CSV</button></div><div className="bom-full-card"><BomPanel data={data} onExportBom={handleExportBom} /><div className="bom-validation"><div className="validation-heading"><span className="overline">PROJECT VALIDATION</span><span className={projectWarnings.length ? "validation-count validation-count-warn" : "validation-count"}>{projectWarnings.length} data warning{projectWarnings.length === 1 ? "" : "s"}</span></div>{projectWarnings.length ? projectWarnings.map((warning) => <div className="validation-item" key={warning}><CircleAlert size={14} />{warning}</div>) : <div className="validation-item validation-ok"><CheckCircle2 size={14} />No project-structure warnings. Manufacturing requirements are still incomplete.</div>}<div className="manufacturing-gaps"><strong>Required before production</strong><span><i /> Tolerances & datum scheme</span><span><i /> Validated CAD solid / drawing package</span><span><i /> Approved material grade & supplier</span><span><i /> Assembly / quality control instructions</span></div></div></div></div>}
            {(workspace === "electronics" || workspace === "lab" || workspace === "firmware" || workspace === "audio") && <RoadmapWorkspace workspace={workspace} />}
          </div>

          <footer className="studio-statusbar"><span className="statusbar-left"><span className="status-green-dot" /> {workspace === "design" ? `${data.parts.length} component definitions` : currentWorkspace.state === "ready" ? "Project model synchronized" : "Capability not implemented"}<span className="statusbar-divider" /> {data.designMode === "assembly" ? "Component Assembly" : "Build A–Z"}</span><span className="statusbar-right"><span><CircleDot size={12} /> {loadingProject ? "Opening project…" : saveLabel}</span><span className="statusbar-divider" /><button onClick={() => setModal("about")}>Preview build <span className="build-chip">0.1.0</span></button></span></footer>
        </section>

        {showInspector && <aside className="inspector-panel">
          <div className="inspector-heading"><div><span className="panel-kicker">ENGINEERING</span><h2>Properties</h2></div><div className="inspector-heading-actions"><button className="icon-button" onClick={() => setShowInspector(false)} title="Hide properties panel" aria-label="Hide properties panel"><PanelLeft size={15} /></button><button className="icon-button" onClick={() => setModal("about")} title="Engineering notes" aria-label="Engineering notes"><CircleHelp size={15} /></button></div></div>
          {selectedPart ? <>
            <div className="selected-component-card"><span className="selected-component-icon">{selectedPart.id === "strings" ? <Waves size={18} /> : <Box size={19} />}</span><div><span className="overline">{selectedPart.category.toUpperCase()}</span><strong>{selectedPart.name}</strong><small><span className="parametric-dot" /> Reference component · {selectedPart.id}</small></div><button className="component-more-button" onClick={() => setModal("component-library")} aria-label="Open component library"><Plus size={15} /></button></div>
            <div className="inspector-section"><div className="inspector-section-heading"><span>DIMENSIONS & PARAMETERS</span><span className="unit-pill">mm · deg</span></div>
              {selectedKeys.length ? selectedKeys.map((key) => <NumberField key={key} label={PARAMETER_META[key].label} unit={PARAMETER_META[key].unit} min={PARAMETER_META[key].min} max={PARAMETER_META[key].max} step={PARAMETER_META[key].step} value={data.parameters[key]} onChange={(value) => updateParameter(key, value)} />) : <div className="no-param-note"><Info size={14} /> No parametric dimensions for this component in the preview model.</div>}
              <label className="number-field quantity-field"><span className="number-field-label">Instance quantity</span><span className="quantity-control"><button onClick={() => commit((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPart.id ? { ...part, quantity: Math.max(1, part.quantity - 1) } : part) }))} aria-label="Decrease quantity">−</button><strong>{selectedPart.quantity}</strong><button onClick={() => commit((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPart.id ? { ...part, quantity: part.quantity + 1 } : part) }))} aria-label="Increase quantity">+</button><small>ea</small></span></label>
            </div>
            <div className="inspector-section material-section"><div className="inspector-section-heading"><span>MATERIAL CALLOUT</span><span className="spec-unverified">UNVERIFIED</span></div><label className="material-select-label"><span>Material / specification</span><select value={MATERIAL_OPTIONS.includes(selectedPart.material) ? selectedPart.material : selectedPart.material} onChange={(event) => updatePartMaterial(event.target.value)}><option value={selectedPart.material}>{selectedPart.material}</option>{MATERIAL_OPTIONS.filter((material) => material !== selectedPart.material).map((material) => <option key={material} value={material}>{material}</option>)}</select></label><span className="material-note"><CircleAlert size={12} /> Descriptive only · no supplier certification</span></div>
            <div className="inspector-section connection-section"><div className="inspector-section-heading"><span>ASSEMBLY CONNECTIONS</span><span className="connection-count">{selectedPart.connections.length}</span></div>{selectedPart.connections.length === 0 ? <div className="no-connections">No connection references</div> : <div className="connection-list">{selectedPart.connections.map((id) => { const connected = data.parts.find((part) => part.id === id); return <button key={id} className={`connection-chip ${connected ? "" : "connection-missing"}`} onClick={() => { if (connected) setSelectedPartId(id); }}><span /><span>{connected?.name ?? id}</span>{connected ? <ChevronRight size={12} /> : <CircleAlert size={12} />}</button>; })}</div>}</div>
            {data.staleAnalyses.length > 0 && <button className="inspector-stale-card" onClick={() => { setWorkspace("dependencies"); }}><Clock3 size={14} /><span><strong>Impacts need review</strong><small>{data.staleAnalyses.length} downstream relationships tracked</small></span><ChevronRight size={14} /></button>}
            <div className="inspector-engineering-note"><span className="overline">RESULT CONFIDENCE</span><div className="confidence-row"><span>Geometry preview</span><strong>Visual only</strong></div><div className="confidence-row"><span>String tension</span><strong className="confidence-calculated">Calculated</strong></div><div className="confidence-row"><span>Acoustics / strength</span><strong className="confidence-planned">Not implemented</strong></div></div>
          </> : <div className="inspector-empty"><Box size={23} /><strong>No component selected</strong><span>Add a reference component or select a row in the assembly tree.</span><button className="secondary-button" onClick={openLibrary}><Plus size={14} /> Component library</button></div>}
          <div className="inspector-bottom"><span><span className="database-status-dot" /> {localOnly ? "Local-only data" : "Autosave enabled"}</span><button onClick={saveNow}><Save size={13} /> Save now</button></div>
        </aside>}
      </div>

      {!showInspector && <button className="show-panel-button" onClick={() => setShowInspector(true)}><PanelLeft size={15} /> Properties</button>}
      <input ref={importInput} className="hidden-file-input" type="file" accept=".iaz,application/json" onChange={(event) => void handleImportFile(event)} />
      <AppModal kind={modal} onClose={() => setModal(null)} onCreate={handleCreateProject} onChooseComponent={handleChooseComponent} onChooseProject={(project) => void handleChooseProject(project)} onCommand={handleCommand} onNewProject={() => { setModal("new-project"); setCreateName("Violin study 01"); setCreateMode("assembly"); }} onExport={(kind) => kind === "iaz" ? handleExportProject() : handleExportBom()} projectName={projectName} projectList={projectList} data={data} componentFilter={componentFilter} setComponentFilter={setComponentFilter} commandSearch={commandSearch} setCommandSearch={setCommandSearch} createName={createName} setCreateName={setCreateName} createMode={createMode} setCreateMode={setCreateMode} isCreating={isCreating} />
      {toast && <div className="toast-message" role="status"><Check size={15} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </main>
  );
}

function FolderOpenIcon() {
  return <span className="menu-icon-glyph"><BookOpen size={15} /></span>;
}

function UndoIcon() {
  return <span className="menu-icon-glyph"><Redo2 size={15} className="flip-horizontal" /></span>;
}
