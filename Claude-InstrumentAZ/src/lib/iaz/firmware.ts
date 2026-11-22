// Firmware ↔ schematic pin linking (static analysis; no compiler is run in the browser).
import { buildNets, pinKey } from "./circuit";
import type { ProjectDoc } from "./doc";
import { getElPart } from "./catalog";
import type { Issue } from "./params";

export interface PinLink { name: string; codeValue: number | null; file: string; line: number; net?: string; mcuPins: string[]; status: "ok" | "mismatch" | "no-net" | "no-code" }
const MCU = ["esp32", "esp32dev", "pico"];

export function parseDefines(code: Record<string, string>): { name: string; value: number; file: string; line: number }[] {
  const out: { name: string; value: number; file: string; line: number }[] = [];
  const pats = [/^\s*#define\s+([A-Za-z_]\w*)\s+(\d+)\b/, /^\s*(?:constexpr|const)\s+(?:u?int\d*_t|int|uint8_t|gpio_num_t|auto|byte)\s+([A-Za-z_]\w*)\s*=\s*(\d+)\s*;/, /^\s*(?:pub\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*:\s*[ui]\d+\s*=\s*(\d+)\s*;/, /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*(?:#.*)?$/];
  for (const [file, text] of Object.entries(code)) {
    if (!/\.(c|cpp|h|hpp|ino|py|rs)$/.test(file)) continue;
    text.split("\n").forEach((ln, i) => { for (const p of pats) { const m = ln.match(p); if (m) { out.push({ name: m[1], value: Number(m[2]), file, line: i + 1 }); break; } } });
  }
  return out;
}

export function checkFirmware(doc: ProjectDoc, v: Record<string, number>): { links: PinLink[]; issues: Issue[]; mcu: string | null } {
  const issues: Issue[] = [];
  const add = (severity: Issue["severity"], message: string, explain?: string) => issues.push({ id: `fw.${issues.length}`, severity, domain: "firmware", message, params: [], explain });
  const defs = parseDefines(doc.code);
  const { netOf } = buildNets(doc.schematic, doc.customParts);
  const mcuPart = doc.schematic.parts.find((p) => MCU.includes(p.lib));
  if (!mcuPart) { add("warning", "No microcontroller in the schematic: pin names in code cannot be verified"); return { links: [], issues, mcu: null }; }
  const mcuLib = getElPart(mcuPart.lib, doc.customParts)!;
  const links: PinLink[] = [];
  // net labels -> MCU pins on that net
  const labelNames = new Set(Object.values(doc.schematic.labels));
  const mcuPinsByNet = new Map<string, string[]>();
  mcuLib.pins.forEach((pin, i) => { const n = netOf.get(pinKey(mcuPart.id, i)); if (n) mcuPinsByNet.set(n, [...(mcuPinsByNet.get(n) ?? []), pin.name]); });
  const gpioNum = (n: string) => { const m = n.match(/^GP(?:IO)?(\d+)$/); return m ? Number(m[1]) : null; };
  for (const name of labelNames) {
    if (["GND", "3V3", "VBAT", "5V", "VCC"].includes(name)) continue;
    const pins = mcuPinsByNet.get(name) ?? [];
    if (!pins.length) continue;
    const d = defs.find((x) => x.name === name);
    if (!d) { links.push({ name, codeValue: null, file: "", line: 0, net: name, mcuPins: pins, status: "no-code" }); add("info", `Net ${name} (MCU pin ${pins.join(",")}) has no matching constant in the firmware`); continue; }
    const ok = pins.some((p) => gpioNum(p) === d.value);
    links.push({ name, codeValue: d.value, file: d.file, line: d.line, net: name, mcuPins: pins, status: ok ? "ok" : "mismatch" });
    if (!ok) add("error", `${name}: firmware uses GPIO ${d.value} (${d.file}:${d.line}) but the schematic wires it to ${pins.join(", ")}`, "Change the define or move the wire in the schematic/PCB so they agree.");
  }
  for (const d of defs) {
    if (links.some((l) => l.name === d.name)) continue;
    if (/(PIN|SDA|SCL|DIN|MOSI|MISO|SCK|_CS$|^CS|LED|BTN|BUTTON|TX$|RX$)/.test(d.name) && d.name !== "LED_COUNT" && !/COUNT/.test(d.name)) {
      links.push({ name: d.name, codeValue: d.value, file: d.file, line: d.line, mcuPins: [], status: "no-net" });
      add("warning", `${d.name}=${d.value} (${d.file}:${d.line}) is not connected to any labelled net on the MCU in the schematic`);
    }
  }
  const lc = defs.find((d) => d.name === "LED_COUNT");
  if (lc && lc.value !== v["el.led.count"]) add("warning", `LED_COUNT=${lc.value} in firmware but hardware parameter el.led.count=${v["el.led.count"]}`, "Update the firmware constant or the LED count parameter (power budget uses the parameter).");
  return { links, issues, mcu: mcuLib.name };
}
