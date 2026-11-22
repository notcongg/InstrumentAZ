// Project document model (.iaz), versioning, validation, staleness fingerprints.
import { ElPart } from "./catalog";
import { DEFAULT_AUDIO, AudioOptions } from "./audio";
import { emptySchematic, pinKey, Schematic } from "./circuit";
import { halfWidthAt, violinOutline } from "./shape";
import { ARTIFACTS, DEFAULT_VALUES, INPUT_IDS, matchIds, PARAM_LIST, PARAM_MAP } from "./params";

export const FORMAT_VERSION = 2;
export type V3 = [number, number, number];
export interface PartInstance { id: string; lib: string; enabled: boolean; locked: boolean; variant: string; offset: V3 }
export interface Primitive { id: string; kind: "box" | "cylinder" | "sphere" | "cone"; name: string; size: V3; pos: V3; rot: V3; color: string; op: "add" | "subtract"; visible: boolean }
export interface Placed { id: string; lib: string; label: string; pos: V3; rotY: number; face: "top" | "side" }
export interface PcbPlacement { x: number; y: number; rot: number }
export interface Variant { id: string; name: string; created: string; values: Record<string, number> }
export interface SavedConfig { id: string; name: string; lib: string; variant: string; offset: V3 }
export interface ProjectDoc {
  format: "InstrumentAZ"; formatVersion: number; id: string; name: string; instrument: "violin"; created: string; modified: string;
  mode: "assembly" | "buildaz";
  values: Record<string, number>; targets: Record<string, number>; tolerances: Record<string, number>; measured: Record<string, number>;
  stringPresets: string[];
  parts: PartInstance[]; primitives: Primitive[]; placed: Placed[]; savedConfigs: SavedConfig[]; customParts: ElPart[];
  schematic: Schematic; pcb: { w: number; h: number; placements: Record<string, PcbPlacement> };
  code: Record<string, string>; firmware: { board: string; lang: "cpp" | "python" | "rust" };
  audio: AudioOptions; variants: Variant[]; artifacts: Record<string, { fp: string; at: string }>; notes: string;
}

const RIB_X70 = halfWidthAt(violinOutline({ bodyLength: DEFAULT_VALUES["geom.bodyLength"], upperBout: DEFAULT_VALUES["geom.upperBout"], lowerBout: DEFAULT_VALUES["geom.lowerBout"], cBout: DEFAULT_VALUES["geom.cBout"] }), 70);
const LIB_IDS = ["top", "back", "ribs", "neck", "fingerboard", "scroll", "pegs", "nut", "bridge", "tailpiece", "chinrest", "soundpost", "bassbar", "fholes", "strings", "tuners"];
export const newId = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_CODE: Record<string, string> = {
  "src/main.cpp": `// InstrumentAZ firmware (ESP32, Arduino framework). Pin names are linked to schematic net labels.
#include <Arduino.h>
#include <Wire.h>

#define OLED_SDA 21
#define OLED_SCL 22
#define LED_DIN 25
constexpr int LED_COUNT = 30;

void setup() {
  Serial.begin(115200);
  Wire.begin(OLED_SDA, OLED_SCL);
  pinMode(LED_DIN, OUTPUT);
  Serial.println("InstrumentAZ boot");
}

void loop() {
  digitalWrite(LED_DIN, millis() / 500 % 2);
  delay(10);
}
`,
  "platformio.ini": `[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
`,
};

function demoSchematic(): Schematic {
  const s = emptySchematic();
  const add = (id: string, lib: string, ref: string, x: number, y: number, value?: number) => s.parts.push({ id, lib, ref, x, y, value });
  add("u1", "esp32", "U1", 300, 60);
  add("u2", "oled091", "U2", 540, 60);
  add("u3", "strip", "U3", 540, 220);
  add("bt1", "lipo", "BT1", 40, 60);
  add("u4", "ldo", "U4", 170, 60);
  add("g1", "gnd", "GND", 120, 300);
  const w = (id: string, a: string, ap: number, b: string, bp: number) => s.wires.push({ id, a: { p: a, pin: ap }, b: { p: b, pin: bp } });
  w("w1", "bt1", 0, "u4", 0); w("w2", "u4", 2, "u1", 0); w("w3", "u4", 2, "u2", 0);
  w("w4", "bt1", 1, "g1", 0); w("w5", "u4", 1, "g1", 0); w("w6", "u1", 1, "g1", 0); w("w7", "u2", 1, "g1", 0); w("w8", "u3", 1, "g1", 0);
  w("w9", "u1", 4, "u2", 2); w("w10", "u1", 3, "u2", 3); w("w11", "u1", 5, "u3", 2);
  w("w12", "bt1", 0, "u3", 0);
  s.labels[pinKey("u1", 4)] = "OLED_SCL"; s.labels[pinKey("u1", 3)] = "OLED_SDA"; s.labels[pinKey("u1", 5)] = "LED_DIN";
  s.labels[pinKey("u4", 2)] = "3V3"; s.labels[pinKey("bt1", 0)] = "VBAT";
  return s;
}

export function defaultDoc(name = "My Violin"): ProjectDoc {
  const now = new Date().toISOString();
  return {
    format: "InstrumentAZ", formatVersion: FORMAT_VERSION, id: newId("proj"), name, instrument: "violin", created: now, modified: now, mode: "assembly",
    values: { ...DEFAULT_VALUES }, targets: {}, tolerances: {}, measured: {},
    stringPresets: ["g-syn", "d-syn", "a-syn", "e-steel"],
    parts: LIB_IDS.map((lib) => ({ id: `inst_${lib}`, lib, enabled: true, locked: false, variant: "std", offset: [0, 0, 0] })),
    primitives: [], placed: [
      { id: "pl_battery", lib: "lipo", label: "Battery", pos: [0, -11, 70], rotY: 0, face: "top" },
      { id: "pl_pcb", lib: "pcb", label: "Main PCB", pos: [0, -2.2, 70], rotY: 0, face: "top" },
      { id: "pl_oled", lib: "oled091", label: "OLED display", pos: [-(RIB_X70 + 1.75), 0, 70], rotY: 90, face: "side" },
    ],
    savedConfigs: [], customParts: [],
    schematic: demoSchematic(), pcb: { w: 45, h: 70, placements: {} },
    code: { ...DEFAULT_CODE }, firmware: { board: "esp32dev", lang: "cpp" },
    audio: { ...DEFAULT_AUDIO }, variants: [], artifacts: {}, notes: "",
  };
}

// ---------------------------------------------------------------- hashing / staleness
export function hash(s: string): string {
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
const allIds = PARAM_LIST.map((p) => p.id);
const artIds: Record<string, string[]> = Object.fromEntries(ARTIFACTS.map((a) => [a.id, Array.from(new Set(a.deps.flatMap((d) => matchIds(d, allIds))))]));
export function fingerprint(doc: ProjectDoc, vals: Record<string, number>, artifactId: string): string {
  const a = ARTIFACTS.find((x) => x.id === artifactId);
  if (!a) return "";
  const parts: string[] = artIds[artifactId].map((id) => `${id}=${Number(vals[id]).toFixed(5)}`);
  (a.docDeps ?? []).forEach((k) => parts.push(`${k}:${JSON.stringify((doc as unknown as Record<string, unknown>)[k])}`));
  return hash(parts.join("|"));
}
export type Freshness = "never" | "fresh" | "stale";
export function freshness(doc: ProjectDoc, vals: Record<string, number>, artifactId: string): Freshness {
  const rec = doc.artifacts[artifactId];
  if (!rec) return "never";
  return rec.fp === fingerprint(doc, vals, artifactId) ? "fresh" : "stale";
}
export function markComputed(doc: ProjectDoc, vals: Record<string, number>, ids: string[]): ProjectDoc {
  const artifacts = { ...doc.artifacts };
  ids.forEach((id) => (artifacts[id] = { fp: fingerprint(doc, vals, id), at: new Date().toISOString() }));
  return { ...doc, artifacts };
}

// ---------------------------------------------------------------- .iaz serialization
export interface IazFile { format: "InstrumentAZ-iaz"; formatVersion: number; app: string; checksum: string; payload: ProjectDoc }
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function serializeIaz(doc: ProjectDoc): Promise<string> {
  const payload = { ...doc, formatVersion: FORMAT_VERSION, modified: new Date().toISOString() };
  const file: IazFile = { format: "InstrumentAZ-iaz", formatVersion: FORMAT_VERSION, app: "InstrumentAZ web 0.1", checksum: await sha256(JSON.stringify(payload)), payload };
  return JSON.stringify(file, null, 1);
}
export interface ParseResult { ok: boolean; doc?: ProjectDoc; errors: string[]; warnings: string[]; recoverable?: ProjectDoc }
export async function parseIaz(text: string): Promise<ParseResult> {
  const errors: string[] = [], warnings: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, errors: [`File is not valid JSON/.iaz: ${(e as Error).message}`], warnings }; }
  const f = raw as Partial<IazFile>;
  if (!f || f.format !== "InstrumentAZ-iaz" || typeof f.payload !== "object" || !f.payload) return { ok: false, errors: ["Not an InstrumentAZ .iaz project (format marker missing)."], warnings };
  if (typeof f.formatVersion !== "number") errors.push("Missing formatVersion.");
  else if (f.formatVersion > FORMAT_VERSION) return { ok: false, errors: [`Project format v${f.formatVersion} is newer than this application (v${FORMAT_VERSION}). Update InstrumentAZ.`], warnings };
  const { doc, notes } = migrateDoc(f.payload as unknown as Record<string, unknown>);
  warnings.push(...notes);
  const sum = await sha256(JSON.stringify(f.payload));
  if (sum !== f.checksum) {
    return { ok: false, errors: ["Checksum mismatch: the file was modified or damaged. You may attempt recovery (data is validated and repaired where possible)."], warnings, recoverable: doc };
  }
  return { ok: errors.length === 0, doc, errors, warnings };
}
/** Fill missing fields, clamp parameter values, drop unknown ones. Never throws on older/partial documents. */
export function migrateDoc(raw: Record<string, unknown>): { doc: ProjectDoc; notes: string[] } {
  const base = defaultDoc();
  const notes: string[] = [];
  const doc: ProjectDoc = { ...base, ...(raw as Partial<ProjectDoc>) } as ProjectDoc;
  const ver = typeof raw.formatVersion === "number" ? raw.formatVersion : 0;
  if (ver < FORMAT_VERSION) notes.push(`Migrated project from format v${ver} to v${FORMAT_VERSION}.`);
  doc.formatVersion = FORMAT_VERSION;
  const values: Record<string, number> = { ...DEFAULT_VALUES };
  const inV = (raw.values ?? {}) as Record<string, unknown>;
  for (const id of INPUT_IDS) {
    const v = inV[id];
    if (typeof v === "number" && isFinite(v)) { const p = PARAM_MAP[id]; const c = Math.min(p.max, Math.max(p.min, v)); if (c !== v) notes.push(`Parameter ${id}=${v} out of bounds, clamped to ${c}.`); values[id] = c; }
  }
  Object.keys(inV).forEach((k) => { if (!(k in PARAM_MAP)) notes.push(`Unknown parameter '${k}' ignored (kept for forward compatibility is not supported).`); });
  doc.values = values;
  (["targets", "tolerances", "measured", "artifacts", "code", "pcb", "audio", "firmware"] as const).forEach((k) => { if (typeof (doc as unknown as Record<string, unknown>)[k] !== "object" || (doc as unknown as Record<string, unknown>)[k] === null) { (doc as unknown as Record<string, unknown>)[k] = (base as unknown as Record<string, unknown>)[k]; notes.push(`Field '${k}' repaired.`); } });
  (["parts", "primitives", "placed", "savedConfigs", "customParts", "variants", "stringPresets"] as const).forEach((k) => { if (!Array.isArray((doc as unknown as Record<string, unknown>)[k])) { (doc as unknown as Record<string, unknown>)[k] = (base as unknown as Record<string, unknown>)[k]; notes.push(`List '${k}' repaired.`); } });
  const sc = doc.schematic as Partial<Schematic> | undefined;
  doc.schematic = sc && Array.isArray(sc.parts) && Array.isArray(sc.wires) ? { parts: sc.parts, wires: sc.wires, labels: sc.labels ?? {} } : base.schematic;
  doc.audio = { ...DEFAULT_AUDIO, ...doc.audio };
  doc.format = "InstrumentAZ";
  return { doc, notes };
}
