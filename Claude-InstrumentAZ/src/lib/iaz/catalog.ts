// Catalogs: materials, string presets, violin part library, electronics component library.
// All numeric data are TYPICAL / APPROXIMATE engineering values and must be verified against
// real datasheets / measurements before manufacturing. Nothing here claims vendor-certified data.

export interface Material {
  id: string; name: string; density: number; // kg/m3
  eL: number; eC: number; // GPa along / across grain
  loss: number; // internal friction (loss factor, dimensionless)
  note: string; process: string;
}
export const MATERIALS: Material[] = [
  { id: "spruce", name: "Spruce (tonewood)", density: 400, eL: 11, eC: 0.8, loss: 0.01, note: "Typical top plate wood", process: "Hand/CNC carving" },
  { id: "maple", name: "Maple (flamed)", density: 600, eL: 10, eC: 1.9, loss: 0.01, note: "Typical back/ribs/neck wood", process: "Hand/CNC carving, rib bending" },
  { id: "ebony", name: "Ebony", density: 1100, eL: 17, eC: 3, loss: 0.008, note: "Fingerboard, pegs, fittings", process: "Turning/CNC" },
  { id: "rosewood", name: "Rosewood", density: 850, eL: 14, eC: 2.5, loss: 0.009, note: "Fittings alternative", process: "Turning/CNC" },
  { id: "boxwood", name: "Boxwood", density: 900, eL: 14, eC: 2.5, loss: 0.01, note: "Fittings alternative", process: "Turning/CNC" },
  { id: "carbon", name: "Carbon-fibre composite", density: 1600, eL: 100, eC: 8, loss: 0.003, note: "Non-traditional, very stiff, low damping", process: "Layup / CNC" },
  { id: "poplar", name: "Poplar", density: 450, eL: 9, eC: 0.9, loss: 0.012, note: "Alternative back wood", process: "Hand/CNC carving" },
];

export const STRING_NAMES = ["G3", "D4", "A4", "E5"] as const;
export const STRING_TARGET_HZ = [196.0, 293.66, 440.0, 659.26];

export interface StringPreset { id: string; slot: number; name: string; material: string; construction: string; diameter: number; mu: number }
export const STRING_PRESETS: StringPreset[] = [
  { id: "g-syn", slot: 0, name: "Synthetic core, silver wound", material: "Synthetic + silver", construction: "Wound", diameter: 0.78, mu: 3.2 },
  { id: "g-gut", slot: 0, name: "Gut core, silver wound", material: "Gut + silver", construction: "Wound", diameter: 0.8, mu: 3.6 },
  { id: "g-steel", slot: 0, name: "Steel core, chrome wound", material: "Steel + chrome", construction: "Wound", diameter: 0.75, mu: 2.7 },
  { id: "d-syn", slot: 1, name: "Synthetic core, aluminium wound", material: "Synthetic + aluminium", construction: "Wound", diameter: 0.82, mu: 1.45 },
  { id: "d-gut", slot: 1, name: "Gut core, aluminium wound", material: "Gut + aluminium", construction: "Wound", diameter: 0.84, mu: 1.55 },
  { id: "d-steel", slot: 1, name: "Steel core, chrome wound", material: "Steel + chrome", construction: "Wound", diameter: 0.78, mu: 1.35 },
  { id: "a-syn", slot: 2, name: "Synthetic core, aluminium wound", material: "Synthetic + aluminium", construction: "Wound", diameter: 0.66, mu: 0.8 },
  { id: "a-gut", slot: 2, name: "Gut core, aluminium wound", material: "Gut + aluminium", construction: "Wound", diameter: 0.68, mu: 0.85 },
  { id: "a-steel", slot: 2, name: "Steel core, chrome wound", material: "Steel + chrome", construction: "Wound", diameter: 0.62, mu: 0.72 },
  { id: "e-steel", slot: 3, name: "Plain steel wire", material: "Steel", construction: "Plain", diameter: 0.26, mu: 0.4166 },
  { id: "e-gold", slot: 3, name: "Gold-plated steel wire", material: "Steel (plated)", construction: "Plain", diameter: 0.26, mu: 0.4166 },
  { id: "e-syn", slot: 3, name: "Synthetic core, tin wound", material: "Synthetic + tin", construction: "Wound", diameter: 0.5, mu: 0.43 },
];

/** Typical tension window per string (N) - approximate guideline for sanity warnings only. */
export const TYPICAL_TENSION_N: [number, number][] = [[35, 62], [35, 62], [45, 72], [60, 92]];

// ---------------------------------------------------------------- Violin part library
export interface Joint { id: string; to: string; kind: "glue" | "friction" | "tension" | "pin" | "clamp" | "free"; note: string }
export interface PartVariant { key: string; label: string; scale?: [number, number, number]; offset?: [number, number, number]; massG?: number }
export interface LibPart {
  id: string; name: string; category: "body" | "neck" | "hardware" | "internal" | "string";
  desc: string; matParam?: string; massG: number; spec: string[]; joints: Joint[]; rules: string[]; variants: PartVariant[];
}
const std: PartVariant[] = [{ key: "std", label: "Standard" }];
export const VIOLIN_LIB: LibPart[] = [
  { id: "top", name: "Top plate", category: "body", desc: "Spruce belly with f-holes; thickness/arching set the plate modes.", matParam: "mat.top", massG: 70, spec: ["thickness: geom.topThickness", "arching: geom.topArch", "f-holes cut as 2D boolean in the plate shape"], joints: [{ id: "j1", to: "ribs", kind: "glue", note: "Perimeter glue joint" }, { id: "j2", to: "bassbar", kind: "glue", note: "Underside" }, { id: "j3", to: "bridge", kind: "friction", note: "Held by string downforce" }], rules: ["Thickness < 2.2 mm with high downforce is flagged"], variants: std },
  { id: "back", name: "Back plate", category: "body", desc: "Maple back plate.", matParam: "mat.back", massG: 85, spec: ["thickness: geom.backThickness", "arching: geom.backArch"], joints: [{ id: "j1", to: "ribs", kind: "glue", note: "Perimeter glue joint" }, { id: "j2", to: "soundpost", kind: "friction", note: "Post contact" }], rules: [], variants: std },
  { id: "ribs", name: "Ribs", category: "body", desc: "Bent maple sides; define the cavity height.", matParam: "mat.back", massG: 30, spec: ["height: geom.ribHeight", "thickness: geom.ribThickness"], joints: [{ id: "j1", to: "top", kind: "glue", note: "" }, { id: "j2", to: "back", kind: "glue", note: "" }, { id: "j3", to: "neck", kind: "glue", note: "Neck block" }], rules: ["Rib height must exceed electronics bay depth if bay is inside"], variants: std },
  { id: "neck", name: "Neck", category: "neck", desc: "Neck with pegbox; length is derived from stop length + vibrating length.", matParam: "mat.neck", massG: 60, spec: ["angle: geom.neckAngle", "length: derived"], joints: [{ id: "j1", to: "ribs", kind: "glue", note: "Neck mortise" }, { id: "j2", to: "fingerboard", kind: "glue", note: "" }], rules: ["Neck length is derived; cannot be set directly"], variants: std },
  { id: "fingerboard", name: "Fingerboard", category: "neck", desc: "Ebony fingerboard with radius curvature.", matParam: "mat.fingerboard", massG: 55, spec: ["length: geom.fbLength", "radius: geom.fbRadius", "width nut/end"], joints: [{ id: "j1", to: "neck", kind: "glue", note: "" }, { id: "j2", to: "nut", kind: "glue", note: "" }], rules: [], variants: [{ key: "std", label: "Ebony standard" }, { key: "long", label: "Long (+10 mm)", scale: [1, 1, 1.04], massG: 58 }] },
  { id: "scroll", name: "Scroll", category: "neck", desc: "Decorative scroll terminating the pegbox.", matParam: "mat.neck", massG: 20, spec: ["spiral tube (visual simplification)"], joints: [{ id: "j1", to: "neck", kind: "glue", note: "Integral" }], rules: [], variants: std },
  { id: "pegs", name: "Tuning pegs (x4)", category: "hardware", desc: "Friction pegs.", matParam: "mat.fittings", massG: 36, spec: ["friction fit in pegbox"], joints: [{ id: "j1", to: "neck", kind: "friction", note: "Peg holes" }], rules: [], variants: [{ key: "std", label: "Friction pegs" }, { key: "geared", label: "Geared pegs", massG: 50 }] },
  { id: "nut", name: "Nut", category: "hardware", desc: "String spacing and height at the nut.", matParam: "mat.fittings", massG: 2, spec: ["height: geom.nutHeight", "spacing: geom.stringSpacingNut"], joints: [{ id: "j1", to: "fingerboard", kind: "glue", note: "" }], rules: [], variants: std },
  { id: "bridge", name: "Bridge", category: "hardware", desc: "Transfers string vibration to top plate.", massG: 2, spec: ["height: geom.bridgeHeight", "width: geom.bridgeWidth", "position: geom.stopLength"], joints: [{ id: "j1", to: "top", kind: "friction", note: "Feet on top plate" }], rules: ["Position sets stop length and vibrating length consistency"], variants: [{ key: "std", label: "Maple standard" }, { key: "adj", label: "Adjustable (ebony + maple)", massG: 4 }] },
  { id: "tailpiece", name: "Tailpiece", category: "hardware", desc: "Anchors strings; afterlength set by position.", matParam: "mat.fittings", massG: 18, spec: ["afterlength: geom.afterlength", "length: geom.tailpieceLength"], joints: [{ id: "j1", to: "ribs", kind: "tension", note: "Tailgut to end button" }], rules: [], variants: [{ key: "std", label: "Ebony 4 fine tuners" }, { key: "box", label: "Boxwood", massG: 16 }, { key: "carbon", label: "Carbon composite", massG: 10 }] },
  { id: "chinrest", name: "Chin rest", category: "hardware", desc: "Player comfort; clamps on ribs.", matParam: "mat.fittings", massG: 35, spec: ["offset adjustable"], joints: [{ id: "j1", to: "ribs", kind: "clamp", note: "Clamp over the rib edge" }], rules: [], variants: [{ key: "std", label: "Side-mount" }, { key: "centre", label: "Centre-mount", offset: [45, 0, 0] }, { key: "flesch", label: "Flesch (large)", scale: [1.15, 1.2, 1.1], massG: 42 }] },
  { id: "soundpost", name: "Soundpost", category: "internal", desc: "Spruce dowel coupling top and back plates.", massG: 2, spec: ["diameter: geom.soundpostDia", "offset behind bridge: geom.soundpostBehind"], joints: [{ id: "j1", to: "top", kind: "friction", note: "" }, { id: "j2", to: "back", kind: "friction", note: "" }], rules: ["Length equals internal cavity height (rib height)"], variants: std },
  { id: "bassbar", name: "Bass bar", category: "internal", desc: "Spruce bar beneath the bass foot of the bridge.", massG: 8, spec: ["length: geom.bassbarLength", "height: geom.bassbarHeight"], joints: [{ id: "j1", to: "top", kind: "glue", note: "" }], rules: [], variants: std },
  { id: "fholes", name: "F-holes", category: "body", desc: "Sound openings (cut into top plate).", massG: 0, spec: ["length: geom.fholeLength", "separation: geom.fholeSep"], joints: [{ id: "j1", to: "top", kind: "free", note: "Feature of top plate" }], rules: ["Separation must exceed the bridge foot span"], variants: std },
  { id: "strings", name: "Strings (x4)", category: "string", desc: "G-D-A-E; see String Engineering.", massG: 3, spec: ["tension, linear density, pitch derived in Engineering"], joints: [{ id: "j1", to: "nut", kind: "tension", note: "" }, { id: "j2", to: "bridge", kind: "tension", note: "" }, { id: "j3", to: "tailpiece", kind: "tension", note: "" }], rules: [], variants: std },
  { id: "tuners", name: "Fine tuners (x4)", category: "hardware", desc: "Screw-type fine tuners on the tailpiece.", massG: 8, spec: ["on tailpiece"], joints: [{ id: "j1", to: "tailpiece", kind: "pin", note: "" }], rules: [], variants: std },
];

// ---------------------------------------------------------------- Electronics library
export type PinType = "passive" | "input" | "output" | "io" | "power" | "ground" | "source" | "nc";
export interface PinDef { name: string; type: PinType }
export type SimKind = "R" | "C" | "L" | "V" | "I" | "D" | "POT" | "OPAMP" | "GND" | "NONE";
export interface ElPart {
  id: string; name: string; category: string; dims: [number, number, number]; // w,l,h mm
  v?: [number, number]; iTyp?: number; iMax?: number; // supply V range, mA
  iface?: string; fp: string; massG: number; mount: "internal" | "surface"; pins: PinDef[];
  sim: SimKind; value?: number; unit?: string; mfr?: string; thermalRth?: number; note?: string; custom?: boolean;
}
const T: Record<string, PinType> = { p: "passive", i: "input", o: "output", b: "io", w: "power", g: "ground", s: "source", n: "nc" };
const pins = (s: string): PinDef[] => s.split(",").map((x) => { const [name, t] = x.split(":"); return { name, type: T[t || "p"] }; });
function E(id: string, name: string, category: string, dims: [number, number, number], pinStr: string, o: Partial<ElPart> = {}): ElPart {
  return { id, name, category, dims, pins: pins(pinStr), fp: o.fp ?? "generic", massG: 1, mount: "internal", sim: "NONE", ...o };
}
export const EL_LIBRARY: ElPart[] = [
  // passive
  E("res", "Resistor", "Passive", [3.2, 1.6, 0.6], "1:p,2:p", { sim: "R", value: 10000, unit: "Ω", fp: "0603", massG: 0.01 }),
  E("cap", "Capacitor", "Passive", [3.2, 1.6, 0.8], "1:p,2:p", { sim: "C", value: 1e-7, unit: "F", fp: "0603", massG: 0.02 }),
  E("capel", "Electrolytic capacitor", "Passive", [6.3, 6.3, 7.7], "+:p,-:p", { sim: "C", value: 1e-5, unit: "F", fp: "EL6.3", massG: 0.4 }),
  E("ind", "Inductor", "Passive", [4, 4, 2], "1:p,2:p", { sim: "L", value: 1e-4, unit: "H", fp: "L4040", massG: 0.3 }),
  E("pot", "Potentiometer (volume/tone)", "Passive", [9, 11, 6], "1:p,W:p,2:p", { sim: "POT", value: 100000, unit: "Ω", fp: "POT9", massG: 3, mount: "surface" }),
  E("trim", "Trimmer potentiometer", "Passive", [4.8, 4.8, 2.5], "1:p,W:p,2:p", { sim: "POT", value: 10000, unit: "Ω", fp: "TRIM", massG: 0.3 }),
  E("sw", "Switch SPST", "Passive", [7, 3.5, 3], "1:p,2:p", { fp: "SW", massG: 0.5, mount: "surface", note: "Not simulated (ideal open)" }),
  E("conn4", "Connector 4-pin 2.54 mm", "Passive", [10.2, 2.5, 8.5], "1:p,2:p,3:p,4:p", { fp: "HDR1x4", massG: 0.8 }),
  // semiconductors
  E("diode", "Diode 1N4148-class", "Semiconductor", [3.5, 1.7, 1.6], "A:p,K:p", { sim: "D", fp: "SOD-123", massG: 0.05, note: "Shockley model Is=2.5nA n=1.75 (generic)" }),
  E("led", "LED (generic red)", "Semiconductor", [3, 3, 2], "A:p,K:p", { sim: "D", fp: "LED5", massG: 0.1, mount: "surface", iTyp: 10, iMax: 20, note: "Vf ~1.9 V typ." }),
  E("rgb", "RGB LED common-cathode", "Semiconductor", [5, 5, 7], "R:p,G:p,B:p,K:p", { fp: "LED5RGB", massG: 0.3, mount: "surface", iTyp: 30 }),
  E("npn", "NPN transistor (2N3904-class)", "Semiconductor", [3, 2.5, 1.1], "B:i,C:p,E:p", { fp: "SOT-23", massG: 0.05, note: "Not simulated (no BJT model yet)" }),
  E("nmos", "N-MOSFET (2N7002-class)", "Semiconductor", [3, 2.5, 1.1], "G:i,D:p,S:p", { fp: "SOT-23", massG: 0.05, note: "Not simulated (no MOSFET model yet)" }),
  E("opamp", "Operational amplifier (ideal model)", "Semiconductor", [4.9, 3.9, 1.5], "IN+:i,IN-:i,OUT:o,V+:w,V-:g", { sim: "OPAMP", v: [2.7, 5.5], iTyp: 0.5, fp: "SOIC-8", massG: 0.1, note: "Simulated as ideal nullor: no rail clipping, no bandwidth limit" }),
  E("ldo", "LDO regulator 3.3 V", "Semiconductor", [6.5, 3.5, 1.6], "IN:w,GND:g,OUT:s", { v: [3.5, 12], iTyp: 0.1, iMax: 800, fp: "SOT-223", massG: 0.1, thermalRth: 60, note: "Typical 800 mA class; dropout ~1 V" }),
  E("esd", "ESD / protection diode array", "Semiconductor", [2.9, 1.3, 1], "1:p,2:p,GND:g", { fp: "SOT-23", massG: 0.02 }),
  // display
  E("oled091", "OLED 0.91\" 128x32 I2C (SSD1306)", "Display", [38, 12, 3.5], "VCC:w,GND:g,SCL:i,SDA:b", { v: [3, 5], iTyp: 12, iMax: 20, iface: "I2C", fp: "MOD4", massG: 3, mount: "surface", mfr: "Solomon Systech (controller)" }),
  E("oled096", "OLED 0.96\" 128x64 I2C (SSD1306)", "Display", [27.3, 27.8, 3.8], "VCC:w,GND:g,SCL:i,SDA:b", { v: [3, 5], iTyp: 20, iMax: 30, iface: "I2C", fp: "MOD4", massG: 4, mount: "surface", mfr: "Solomon Systech (controller)" }),
  E("tft114", "TFT 1.14\" 135x240 SPI (ST7789)", "Display", [30, 18, 3], "VCC:w,GND:g,SCL:i,SDA:i,RES:i,DC:i,CS:i,BLK:i", { v: [3, 3.6], iTyp: 25, iMax: 40, iface: "SPI", fp: "MOD8", massG: 3, mount: "surface" }),
  E("tft28", "TFT 2.8\" 240x320 SPI + touch (ILI9341/XPT2046)", "Display", [86, 50, 4], "VCC:w,GND:g,CS:i,RST:i,DC:i,MOSI:i,SCK:i,LED:i,MISO:o,T_CS:i,T_IRQ:o", { v: [3.3, 5], iTyp: 90, iMax: 150, iface: "SPI", fp: "MOD11", massG: 40, mount: "surface" }),
  // LED & lighting
  E("ws2812", "Addressable LED WS2812B-class", "Lighting", [5, 5, 1.6], "VDD:w,DOUT:o,GND:g,DIN:i", { v: [3.5, 5.3], iTyp: 15, iMax: 60, iface: "1-wire", fp: "5050", massG: 0.1, mount: "surface" }),
  E("strip", "Flexible LED strip 60 LED/m (addressable)", "Lighting", [10, 100, 2], "5V:w,GND:g,DIN:i,DOUT:o", { v: [4.5, 5.5], iTyp: 900, iMax: 3600, iface: "1-wire", fp: "STRIP", massG: 6, mount: "surface", note: "Current per 100 mm segment: typ. ~15 mA/LED average" }),
  E("matrix", "LED matrix 8x8 + MAX7219-class driver", "Lighting", [32, 32, 8], "VCC:w,GND:g,DIN:i,CS:i,CLK:i,DOUT:o", { v: [4, 5.5], iTyp: 80, iMax: 330, iface: "SPI", fp: "MOD5", massG: 12, mount: "surface" }),
  E("ledrv", "LED driver 16-ch PWM I2C (PCA9685-class)", "Lighting", [6.5, 6.5, 1.2], "VDD:w,VSS:g,SCL:i,SDA:b,OE:i", { v: [2.3, 5.5], iTyp: 10, iface: "I2C", fp: "TSSOP28", massG: 0.1 }),
  // control
  E("esp32", "ESP32-WROOM-32 module", "Control", [18, 25.5, 3.1], "3V3:w,GND:g,EN:i,GPIO21:b,GPIO22:b,GPIO25:b,GPIO26:b,GPIO27:b,GPIO32:b,GPIO33:b,GPIO34:i,GPIO35:i,GPIO18:b,GPIO19:b,GPIO23:b,GPIO5:b", { v: [3, 3.6], iTyp: 80, iMax: 240, iface: "Wi-Fi/BT, I2C, SPI, I2S, ADC", fp: "ESP32", massG: 3, mfr: "Espressif", thermalRth: 40, note: "Module only; supply decoupling per datasheet required" }),
  E("esp32dev", "ESP32 DevKit board", "Control", [28, 51, 12], "3V3:w,GND:g,5V:w,GPIO21:b,GPIO22:b,GPIO25:b,GPIO26:b,GPIO32:b,GPIO33:b,GPIO34:i,GPIO18:b,GPIO19:b,GPIO23:b", { v: [4.5, 5.5], iTyp: 90, iMax: 260, iface: "Wi-Fi/BT, I2C, SPI, I2S, ADC", fp: "DEVKIT", massG: 10, mfr: "Espressif (module) / various boards" }),
  E("pico", "RP2040 board (Pico-class)", "Control", [21, 51, 4], "3V3:w,GND:g,VSYS:w,GP0:b,GP1:b,GP2:b,GP3:b,GP4:b,GP5:b,GP26:i", { v: [1.8, 5.5], iTyp: 25, iMax: 100, iface: "I2C, SPI, UART, PIO, ADC", fp: "PICO", massG: 3, mfr: "Raspberry Pi" }),
  E("adc", "ADC 16-bit I2C (ADS1115-class)", "Control", [3, 3, 1], "VDD:w,GND:g,SCL:i,SDA:b,A0:i,A1:i", { v: [2, 5.5], iTyp: 0.15, iface: "I2C", fp: "MSOP10", massG: 0.05 }),
  E("dac", "DAC 12-bit I2C (MCP4725-class)", "Control", [3, 3, 1], "VDD:w,GND:g,SCL:i,SDA:b,OUT:o", { v: [2.7, 5.5], iTyp: 0.2, iface: "I2C", fp: "SOT-23-6", massG: 0.05 }),
  E("imu", "IMU 6-axis (MPU-6050-class)", "Control", [4, 4, 0.9], "VDD:w,GND:g,SCL:i,SDA:b,INT:o", { v: [2.4, 3.6], iTyp: 3.9, iface: "I2C", fp: "QFN24", massG: 0.05 }),
  E("enc", "Rotary encoder EC11-class", "Control", [12, 13, 14], "A:o,B:o,C:p,SW1:p,SW2:p", { fp: "EC11", massG: 4, mount: "surface" }),
  E("btn", "Tactile button", "Control", [6, 6, 4.3], "1:p,2:p", { fp: "TACT6", massG: 0.3, mount: "surface" }),
  // audio
  E("pickup_pz", "Piezo pickup (bridge, contact)", "Audio", [20, 6, 1], "SIG:o,GND:g", { fp: "WIRE2", massG: 1, mount: "surface", note: "Very high source impedance; needs high-Z (≥1 MΩ) preamp. Not simulated." }),
  E("pickup_mg", "Magnetic pickup (string-sensing)", "Audio", [60, 12, 15], "HOT:o,COLD:g", { fp: "WIRE2", massG: 40, mount: "surface", note: "Requires ferromagnetic strings. Steel-core strings only." }),
  E("preamp", "Piezo preamp module (JFET/op-amp class)", "Audio", [25, 15, 5], "VCC:w,GND:g,IN:i,OUT:o", { v: [3, 9], iTyp: 3, fp: "MOD4", massG: 2 }),
  E("amp", "Class-D amplifier 2.5 W mono (PAM8302-class)", "Audio", [4.9, 3.9, 1.5], "VDD:w,GND:g,IN+:i,IN-:i,OUT+:o,OUT-:o", { v: [2, 5.5], iTyp: 4, iMax: 700, fp: "SOIC-8", massG: 0.1, thermalRth: 90 }),
  E("jack35", "Audio jack 3.5 mm TRS", "Audio", [6, 12, 5], "T:p,R:p,S:g", { fp: "JACK35", massG: 1.5, mount: "surface" }),
  E("jack63", "Audio jack 6.35 mm mono", "Audio", [12, 20, 12], "T:p,S:g", { fp: "JACK63", massG: 15, mount: "surface" }),
  E("spk", "Speaker 8 Ω 0.5 W 28 mm", "Audio", [28, 28, 4], "+:p,-:p", { fp: "SPK28", massG: 3, mount: "surface" }),
  E("codec", "Audio codec I2S (SGTL5000-class)", "Audio", [5, 5, 0.9], "VDDA:w,VSS:g,SCL:i,SDA:b,I2S_BCLK:i,I2S_LRCLK:i,I2S_DIN:i,I2S_DOUT:o,LINEOUT:o,LINEIN:i", { v: [1.8, 3.6], iTyp: 15, iface: "I2C + I2S", fp: "QFN32", massG: 0.1 }),
  E("filter", "Audio filter module (active, op-amp)", "Audio", [20, 15, 5], "VCC:w,GND:g,IN:i,OUT:o", { v: [3, 9], iTyp: 2, fp: "MOD4", massG: 2 }),
  // power
  E("lipo", "LiPo battery 3.7 V 1000 mAh", "Power", [34, 50, 6], "+:s,-:g", { sim: "V", value: 3.7, unit: "V", v: [3.0, 4.2], fp: "BATT", massG: 22, note: "Capacity 1000 mAh nominal" }),
  E("li18650", "Li-ion 18650 3.7 V 2500 mAh + holder", "Power", [20, 77, 20], "+:s,-:g", { sim: "V", value: 3.7, unit: "V", v: [3.0, 4.2], fp: "BATT", massG: 50 }),
  E("charger", "Li-ion charger module (TP4056-class)", "Power", [17, 26, 4], "IN+:w,IN-:g,BAT+:s,BAT-:g", { v: [4.5, 5.5], iTyp: 1, iMax: 1000, fp: "MOD4", massG: 2, thermalRth: 50 }),
  E("pmic", "Battery protection IC (DW01-class)", "Power", [2.9, 1.6, 1], "VCC:w,GND:g,OD:o,OC:o", { fp: "SOT-23-6", massG: 0.02 }),
  E("psu", "Bench power supply (virtual DC)", "Source", [0, 0, 0], "+:s,-:g", { sim: "V", value: 5, unit: "V", fp: "none", massG: 0, mount: "surface" }),
  E("siggen", "Signal generator (virtual)", "Source", [0, 0, 0], "OUT:s,GND:g", { sim: "V", value: 0.5, unit: "V", fp: "none", massG: 0, mount: "surface" }),
  E("gnd", "Ground symbol", "Source", [0, 0, 0], "GND:g", { sim: "GND", fp: "none", massG: 0 }),
];

export const EL_CATEGORIES = Array.from(new Set(EL_LIBRARY.map((p) => p.category)));
export function getElPart(id: string, custom: ElPart[] = []): ElPart | undefined {
  return EL_LIBRARY.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
}

// Footprint pads (simplified generic generator used for PCB view + Gerber).
export interface Pad { pin: number; x: number; y: number; w: number; h: number; drill: number }
export function padsFor(p: ElPart): Pad[] {
  const n = p.pins.length;
  if (p.sim === "GND" || p.fp === "none") return [];
  const [w, l] = p.dims;
  const smd = ["0603", "SOD-123", "SOT-23", "SOT-223", "SOIC-8", "SOT-23-6", "MSOP10", "TSSOP28", "QFN24", "QFN32", "5050", "L4040"].includes(p.fp);
  const padW = smd ? 0.9 : 1.6, padH = smd ? 0.9 : 1.6, drill = smd ? 0 : 0.9;
  const pads: Pad[] = [];
  if (n <= 3 && w >= l * 0.9 && n === 2) {
    const pitch = Math.max(w, 2.0);
    for (let i = 0; i < n; i++) pads.push({ pin: i, x: (i - 0.5) * pitch, y: 0, w: padW, h: padH, drill });
    return pads;
  }
  const half = Math.ceil(n / 2);
  const pitch = Math.max(1.27, Math.min(2.54, l / Math.max(half, 1)));
  const xs = Math.max(w / 2, 1.5);
  for (let i = 0; i < n; i++) {
    const left = i < half;
    const k = left ? i : i - half;
    pads.push({ pin: i, x: left ? -xs : xs, y: (k - (half - 1) / 2) * pitch, w: padW, h: padH, drill });
  }
  return pads;
}
