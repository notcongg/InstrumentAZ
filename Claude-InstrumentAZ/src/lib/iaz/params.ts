// Unified parameter registry + dependency graph + rule engine.
// Every engineering quantity in InstrumentAZ is a typed parameter (unit, bounds, domain) here.
// Derived parameters declare their deps; cross-domain relations are plain data (RELATIONS) so new
// relationships can be added without touching the rest of the application.
import { MATERIALS, STRING_NAMES, STRING_TARGET_HZ, STRING_PRESETS, TYPICAL_TENSION_N } from "./catalog";
import { fholeAreaMm2, offsetPolygon, polygonArea, violinOutline } from "./shape";

export type Domain = "geometry" | "material" | "strings" | "bow" | "acoustic" | "electronics" | "power" | "thermal" | "firmware" | "manufacturing" | "simulation" | "mass";
export type EdgeKind = "parametric" | "mechanical" | "electrical" | "material" | "acoustic" | "power" | "thermal" | "firmware" | "manufacturing" | "simulation";
export type Getter = (id: string) => number;

export interface ParamDef {
  id: string; label: string; domain: Domain; unit: string; def: number; min: number; max: number; step: number;
  options?: string[]; critical?: boolean; help?: string;
  derived?: { deps: string[]; compute: (g: Getter) => number; kind?: EdgeKind; note: string; approx?: boolean };
}

const PARAMS: ParamDef[] = [];
function P(id: string, label: string, domain: Domain, unit: string, def: number, min: number, max: number, step: number, x: Partial<ParamDef> = {}) {
  PARAMS.push({ id, label, domain, unit, def, min, max, step, ...x });
}
function D(id: string, label: string, domain: Domain, unit: string, deps: string[], compute: (g: Getter) => number, note: string, x: { kind?: EdgeKind; approx?: boolean; min?: number; max?: number } = {}) {
  PARAMS.push({ id, label, domain, unit, def: 0, min: x.min ?? -1e9, max: x.max ?? 1e9, step: 0, derived: { deps, compute, note, kind: x.kind, approx: x.approx } });
}
const MAT_OPTS = MATERIALS.map((m) => m.name);
const mat = (g: Getter, id: string) => MATERIALS[Math.max(0, Math.min(MATERIALS.length - 1, Math.round(g(id))))];

// ------------------------------------------------ geometry (inputs)
P("geom.bodyLength", "Body length", "geometry", "mm", 355, 300, 380, 0.5, { critical: true });
P("geom.upperBout", "Upper bout width", "geometry", "mm", 167, 140, 190, 0.5, { critical: true });
P("geom.lowerBout", "Lower bout width", "geometry", "mm", 206, 170, 230, 0.5, { critical: true });
P("geom.cBout", "C-bout (waist) width", "geometry", "mm", 111, 90, 130, 0.5, { critical: true });
P("geom.ribHeight", "Rib height", "geometry", "mm", 30, 25, 40, 0.1, { critical: true });
P("geom.ribThickness", "Rib thickness", "geometry", "mm", 1.2, 0.8, 2, 0.05);
P("geom.topThickness", "Top plate thickness (mean)", "geometry", "mm", 3, 1.5, 5, 0.05, { critical: true });
P("geom.backThickness", "Back plate thickness (mean)", "geometry", "mm", 4, 2, 7, 0.05);
P("geom.topArch", "Top arching height", "geometry", "mm", 15, 8, 22, 0.1);
P("geom.backArch", "Back arching height", "geometry", "mm", 15, 8, 22, 0.1);
P("geom.neckAngle", "Neck angle", "geometry", "°", 5.4, 3, 8, 0.05, { critical: true });
P("geom.fbLength", "Fingerboard length", "geometry", "mm", 270, 240, 300, 0.5);
P("geom.fbWidthNut", "Fingerboard width at nut", "geometry", "mm", 24, 20, 28, 0.1);
P("geom.fbWidthEnd", "Fingerboard width at end", "geometry", "mm", 42, 36, 46, 0.1);
P("geom.fbRadius", "Fingerboard curvature radius", "geometry", "mm", 42, 30, 60, 0.5);
P("geom.nutHeight", "Nut string height", "geometry", "mm", 1.2, 0.5, 2.5, 0.05);
P("geom.bridgeHeight", "Bridge height", "geometry", "mm", 33, 28, 38, 0.1, { critical: true });
P("geom.bridgeWidth", "Bridge foot span", "geometry", "mm", 41, 34, 46, 0.1);
P("geom.bridgeThickness", "Bridge mean thickness", "geometry", "mm", 4, 3, 6, 0.1);
P("geom.stopLength", "Stop length (neck joint → bridge)", "geometry", "mm", 195, 185, 205, 0.5, { critical: true });
P("geom.vibLength", "Effective vibrating length (nut → bridge)", "strings", "mm", 325, 300, 340, 0.1, { critical: true });
P("geom.stringSpacingBridge", "String spacing at bridge (G→E span)", "geometry", "mm", 34, 28, 40, 0.1);
P("geom.stringSpacingNut", "String spacing at nut (G→E span)", "geometry", "mm", 16, 12, 20, 0.1);
P("geom.actionE", "String action at fingerboard end (E)", "geometry", "mm", 3, 2, 5, 0.1);
P("geom.actionG", "String action at fingerboard end (G)", "geometry", "mm", 5.5, 3, 8, 0.1);
P("geom.afterlength", "Afterlength (bridge → tailpiece)", "geometry", "mm", 55, 40, 70, 0.5);
P("geom.tailpieceLength", "Tailpiece length", "geometry", "mm", 95, 80, 120, 0.5);
P("geom.tailpieceHeight", "String height at tailpiece saddle", "geometry", "mm", 9, 5, 15, 0.1);
P("geom.soundpostDia", "Soundpost diameter", "geometry", "mm", 6, 4, 8, 0.1);
P("geom.soundpostBehind", "Soundpost distance behind bridge foot", "geometry", "mm", 5, 0, 20, 0.5);
P("geom.soundpostX", "Soundpost lateral offset (treble side)", "geometry", "mm", 16, 5, 30, 0.5);
P("geom.bassbarLength", "Bass bar length", "geometry", "mm", 270, 200, 300, 1);
P("geom.bassbarHeight", "Bass bar max height", "geometry", "mm", 12, 8, 16, 0.1);
P("geom.bassbarWidth", "Bass bar width", "geometry", "mm", 5.5, 4, 8, 0.1);
P("geom.bassbarX", "Bass bar lateral offset (bass side)", "geometry", "mm", 17, 8, 30, 0.5);
P("geom.fholeLength", "F-hole length", "geometry", "mm", 74, 60, 90, 0.5);
P("geom.fholeSep", "F-hole separation at nicks", "geometry", "mm", 43, 36, 52, 0.5);
P("mat.top", "Top plate material", "material", "", 0, 0, MATERIALS.length - 1, 1, { options: MAT_OPTS });
P("mat.back", "Back plate / rib material", "material", "", 1, 0, MATERIALS.length - 1, 1, { options: MAT_OPTS });
P("mat.neck", "Neck material", "material", "", 1, 0, MATERIALS.length - 1, 1, { options: MAT_OPTS });
P("mat.fingerboard", "Fingerboard material", "material", "", 2, 0, MATERIALS.length - 1, 1, { options: MAT_OPTS });
P("mat.fittings", "Fittings material", "material", "", 2, 0, MATERIALS.length - 1, 1, { options: MAT_OPTS });

// ------------------------------------------------ strings
const SK = ["G", "D", "A", "E"];
SK.forEach((k, i) => {
  const preset = STRING_PRESETS.filter((p) => p.slot === i)[0];
  P(`str.${k}.diameter`, `${k} string diameter`, "strings", "mm", preset.diameter, 0.1, 1.3, 0.01);
  P(`str.${k}.mu`, `${k} linear density`, "strings", "g/m", preset.mu, 0.1, 8, 0.01, { critical: true });
  P(`str.${k}.target`, `${k} target pitch (${STRING_NAMES[i]})`, "strings", "Hz", STRING_TARGET_HZ[i], 100, 1200, 0.01);
  P(`str.${k}.tensionSet`, `${k} set tension`, "strings", "N", 55, 10, 150, 0.1);
  P(`str.${k}.mode`, `${k} mode`, "strings", "", 0, 0, 1, 1, { options: ["Tune to target pitch → solve tension", "Set tension → solve pitch"] });
  D(`str.${k}.tension`, `${k} tension`, "strings", "N", [`str.${k}.mu`, `str.${k}.target`, `str.${k}.tensionSet`, `str.${k}.mode`, "geom.vibLength"],
    (g) => (g(`str.${k}.mode`) < 0.5 ? (g(`str.${k}.mu`) * 1e-3) * Math.pow(2 * (g("geom.vibLength") / 1000) * g(`str.${k}.target`), 2) : g(`str.${k}.tensionSet`)),
    "T = μ·(2·L·f)²  (Mersenne); μ in kg/m, L in m", { kind: "parametric" });
  D(`str.${k}.freq`, `${k} fundamental`, "strings", "Hz", [`str.${k}.mu`, `str.${k}.tension`, "geom.vibLength"],
    (g) => (1 / (2 * (g("geom.vibLength") / 1000))) * Math.sqrt(g(`str.${k}.tension`) / (g(`str.${k}.mu`) * 1e-3)),
    "f = (1/2L)·√(T/μ)", { kind: "parametric" });
  D(`str.${k}.cents`, `${k} detune vs target`, "strings", "cents", [`str.${k}.freq`, `str.${k}.target`], (g) => 1200 * Math.log2(g(`str.${k}.freq`) / g(`str.${k}.target`)), "1200·log2(f/f_target)");
  D(`str.${k}.rhoEff`, `${k} effective density`, "strings", "g/cm³", [`str.${k}.mu`, `str.${k}.diameter`], (g) => g(`str.${k}.mu`) / (Math.PI * Math.pow(g(`str.${k}.diameter`), 2) / 4), "μ / (π d²/4) — plausibility check of diameter vs linear density");
});
const allT = SK.map((k) => `str.${k}.tension`);
D("geom.neckLength", "Neck length beyond body (derived)", "geometry", "mm", ["geom.stopLength", "geom.vibLength"], (g) => g("geom.vibLength") - g("geom.stopLength"), "nut-to-joint = vibrating length − stop length (bridge sits one stop length from the body/neck joint)", { kind: "mechanical" });
D("load.stringAngle", "String angle over bridge (nut side)", "strings", "°", ["geom.neckAngle", "geom.actionE", "geom.nutHeight", "geom.fbLength"],
  (g) => (Math.atan(Math.tan((g("geom.neckAngle") * Math.PI) / 180) + (g("geom.actionE") - g("geom.nutHeight")) / g("geom.fbLength")) * 180) / Math.PI, "atan(tan α + (action − nut)/fbLength)", { kind: "mechanical" });
D("load.afterAngle", "String angle (tailpiece side)", "strings", "°", ["geom.bridgeHeight", "geom.tailpieceHeight", "geom.afterlength"], (g) => (Math.atan((g("geom.bridgeHeight") - g("geom.tailpieceHeight")) / g("geom.afterlength")) * 180) / Math.PI, "atan((bridge h − saddle h)/afterlength)", { kind: "mechanical" });
D("load.breakAngle", "Break angle at bridge", "strings", "°", ["load.stringAngle", "load.afterAngle"], (g) => 180 - g("load.stringAngle") - g("load.afterAngle"), "180° − θ₁ − θ₂");
D("load.totalTension", "Total string tension", "strings", "N", allT, (g) => allT.reduce((s, id) => s + g(id), 0), "Σ T_i");
D("load.downforce", "Bridge downforce (estimate)", "strings", "N", [...allT, "load.stringAngle", "load.afterAngle"],
  (g) => allT.reduce((s, id) => s + g(id), 0) * (Math.sin((g("load.stringAngle") * Math.PI) / 180) + Math.sin((g("load.afterAngle") * Math.PI) / 180)),
  "Σ T_i (sin θ₁ + sin θ₂); planar model, ignores bridge notch geometry", { kind: "mechanical", approx: true });

// ------------------------------------------------ derived geometry / mass
const oParams = (g: Getter) => ({ bodyLength: g("geom.bodyLength"), upperBout: g("geom.upperBout"), lowerBout: g("geom.lowerBout"), cBout: g("geom.cBout") });
const OUT_DEPS = ["geom.bodyLength", "geom.upperBout", "geom.lowerBout", "geom.cBout"];
const outlineArea = (g: Getter) => Math.abs(polygonArea(violinOutline(oParams(g))));
D("geom.outlineArea", "Outline area", "geometry", "cm²", OUT_DEPS, (g) => outlineArea(g) / 100, "Shoelace area of parametric outline");
D("geom.cavityVolume", "Internal cavity volume (estimate)", "geometry", "L", [...OUT_DEPS, "geom.ribThickness", "geom.ribHeight", "geom.topArch", "geom.backArch"], (g) => {
  const inner = Math.abs(polygonArea(offsetPolygon(violinOutline(oParams(g)), g("geom.ribThickness"))));
  return (inner * (g("geom.ribHeight") + 0.5 * (g("geom.topArch") + g("geom.backArch")))) / 1e6;
}, "inner area × (rib height + ½ arching); paraboloid approximation", { approx: true });
D("geom.fholeArea", "F-hole open area (both)", "geometry", "cm²", ["geom.fholeLength", "geom.fholeSep"], (g) => (2 * fholeAreaMm2(g("geom.fholeLength"), g("geom.fholeSep"))) / 100, "Area of the simplified f-hole polygons");
const perim = (g: Getter) => { const p = violinOutline(oParams(g)); let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(a[0] - b[0], a[1] - b[1]); } return s; };
D("mass.top", "Top plate mass", "mass", "g", [...OUT_DEPS, "geom.topThickness", "mat.top", "geom.fholeArea"], (g) => (outlineArea(g) * 0.85 - g("geom.fholeArea") * 100) * g("geom.topThickness") * mat(g, "mat.top").density * 1e-6, "area·0.85(graduation factor)·t·ρ", { kind: "material", approx: true });
D("mass.back", "Back plate mass", "mass", "g", [...OUT_DEPS, "geom.backThickness", "mat.back"], (g) => outlineArea(g) * 0.85 * g("geom.backThickness") * mat(g, "mat.back").density * 1e-6, "area·0.85·t·ρ", { kind: "material", approx: true });
D("mass.ribs", "Ribs mass", "mass", "g", [...OUT_DEPS, "geom.ribHeight", "geom.ribThickness", "mat.back"], (g) => perim(g) * g("geom.ribHeight") * g("geom.ribThickness") * mat(g, "mat.back").density * 1e-6, "perimeter·h·t·ρ", { kind: "material", approx: true });
D("mass.strings", "Strings mass (vibrating+after)", "mass", "g", [...SK.map((k) => `str.${k}.mu`), "geom.vibLength", "geom.afterlength"], (g) => SK.reduce((s, k) => s + g(`str.${k}.mu`), 0) * ((g("geom.vibLength") + g("geom.afterlength") + 60) / 1000), "Σμ·length");
D("mass.neck", "Neck + fingerboard + scroll + fittings (rough)", "mass", "g", ["mat.neck", "mat.fingerboard", "mat.fittings", "geom.fbLength"], (g) => 55 * (mat(g, "mat.neck").density / 600) + 55 * (g("geom.fbLength") / 270) * (mat(g, "mat.fingerboard").density / 1100) + 90 * (mat(g, "mat.fittings").density / 1100), "Scaled reference masses (rough)", { kind: "material", approx: true });
D("mass.electronics", "Electronics mass (battery+PCB+allowance)", "mass", "g", ["el.battery.mass", "el.pcb.w", "el.pcb.l"], (g) => g("el.battery.mass") + (g("el.pcb.w") * g("el.pcb.l") * 1.6 * 1.9e-3 + 3) + 6, "battery + FR-4 PCB mass + parts/wiring allowance (6 g)", { kind: "mechanical", approx: true });
D("mass.total", "Total instrument mass (estimate)", "mass", "g", ["mass.top", "mass.back", "mass.ribs", "mass.strings", "mass.neck", "mass.electronics"], (g) => g("mass.top") + g("mass.back") + g("mass.ribs") + g("mass.strings") + g("mass.neck") + g("mass.electronics") + 25, "Σ masses + 25 g bass bar/post/glue allowance", { approx: true });

// ------------------------------------------------ acoustics (scaling models vs a reference violin)
const plateF = (g: Getter, t: string, m: string) => { const mm = mat(g, m); return (g(t) / Math.pow(g("geom.bodyLength"), 2)) * Math.sqrt(Math.sqrt(mm.eL * mm.eC) * 1e9 / mm.density); };
const PL = ["geom.bodyLength", "geom.topThickness", "geom.backThickness", "mat.top", "mat.back"];
const REFG: Getter = (id) => PARAMS.find((p) => p.id === id)!.def;
let REF_VOL = 0, REF_AF = 0, REF_TOP = 0, REF_BACK = 0, REF_BR = 0;
export const ACOUSTIC_ASSUMPTIONS = [
  "Mode frequencies scale from published typical violin values (A0≈275, CBR≈400, B1−≈470, B1+≈550 Hz, bridge hill≈2.8 kHz).",
  "A0 ∝ √(f-hole area / cavity volume); plate modes ∝ (h/L²)·√(E/ρ); bridge hill ∝ 1/√(bridge mass).",
  "Soundpost position, bass bar and arching shape are NOT modelled quantitatively: changing them marks results stale only.",
  "Results are scaling ESTIMATES. They are not FEM/modal-analysis results and are not validated against measurements.",
];
D("ac.A0", "Air resonance A0 (estimate)", "acoustic", "Hz", ["geom.fholeArea", "geom.cavityVolume"], (g) => 275 * Math.sqrt((g("geom.fholeArea") / REF_AF) / (g("geom.cavityVolume") / REF_VOL)), "275·√((Af/Af₀)/(V/V₀))", { kind: "acoustic", approx: true });
D("ac.CBR", "CBR / rib-back mode (estimate)", "acoustic", "Hz", [...PL, "geom.ribHeight"], (g) => 400 * (plateF(g, "geom.backThickness", "mat.back") / REF_BACK) * Math.pow(30 / g("geom.ribHeight"), 0.25), "400·(back factor ratio)·(30/ribH)^¼", { kind: "acoustic", approx: true });
D("ac.B1m", "B1− body mode (estimate)", "acoustic", "Hz", PL, (g) => 470 * Math.sqrt((plateF(g, "geom.topThickness", "mat.top") / REF_TOP) * (plateF(g, "geom.backThickness", "mat.back") / REF_BACK)), "470·√(top ratio · back ratio)", { kind: "acoustic", approx: true });
D("ac.B1p", "B1+ body mode (estimate)", "acoustic", "Hz", PL, (g) => 550 * Math.sqrt((plateF(g, "geom.topThickness", "mat.top") / REF_TOP) * (plateF(g, "geom.backThickness", "mat.back") / REF_BACK)), "550·√(top ratio · back ratio)", { kind: "acoustic", approx: true });
D("ac.bridgeHill", "Bridge hill (estimate)", "acoustic", "Hz", ["geom.bridgeHeight", "geom.bridgeWidth", "geom.bridgeThickness"], (g) => 2800 / Math.sqrt((g("geom.bridgeHeight") * g("geom.bridgeWidth") * g("geom.bridgeThickness")) / REF_BR), "2800/√(m_bridge/m₀)", { kind: "acoustic", approx: true });
D("ac.Q", "Mode quality factor (assumed)", "acoustic", "", ["mat.top", "mat.back"], (g) => 1 / ((mat(g, "mat.top").loss + mat(g, "mat.back").loss) / 2 + 0.02), "Q = 1/(η_material + 0.02 radiation/joint loss assumption)", { kind: "material", approx: true });

// ------------------------------------------------ bow / playing
P("play.string", "Played string", "bow", "", 2, 0, 3, 1, { options: ["G", "D", "A", "E"] });
P("play.semitones", "Fingering (semitones above open)", "bow", "st", 0, 0, 19, 1, { help: "Playing range up to ~19 semitones in first positions" });
P("bow.speed", "Bow speed", "bow", "m/s", 0.3, 0.02, 1, 0.01);
P("bow.force", "Bow force (pressure)", "bow", "N", 0.8, 0.05, 3, 0.05);
P("bow.beta", "Bow-bridge distance (β = fraction of string)", "bow", "", 0.12, 0.03, 0.3, 0.005);
P("bow.dir", "Bow direction", "bow", "", 0, 0, 1, 1, { options: ["Down-bow", "Up-bow"] });
D("play.freq", "Played frequency", "bow", "Hz", [...SK.map((k) => `str.${k}.freq`), "play.string", "play.semitones"], (g) => g(`str.${SK[Math.round(g("play.string"))]}.freq`) * Math.pow(2, g("play.semitones") / 12), "f_open·2^(n/12)  (equal temperament, ideal stopping)");
D("play.fingerPos", "Finger distance from nut", "bow", "mm", ["play.semitones", "geom.vibLength"], (g) => g("geom.vibLength") * (1 - Math.pow(2, -g("play.semitones") / 12)), "L·(1 − 2^(−n/12))");
D("play.maxForce", "Schelleng max bow force (rough)", "bow", "N", ["bow.speed", "bow.beta", "play.string", "play.freq"], (g) => Math.max(0.01, 2.2 * g("bow.speed") / (g("bow.beta") * g("bow.beta") * (g("play.freq") / 440)) * 0.35), "Schelleng-type F_max ∝ v/β² (constants are uncalibrated)", { approx: true });
D("play.minForce", "Schelleng min bow force (rough)", "bow", "N", ["bow.speed", "bow.beta", "play.freq"], (g) => Math.max(0.005, 0.12 * g("bow.speed") / g("bow.beta") * 0.35), "Schelleng-type F_min ∝ v/β (constants are uncalibrated)", { approx: true });

// ------------------------------------------------ electronics / power / thermal
P("el.battery.cap", "Battery capacity", "power", "mAh", 2000, 100, 10000, 10);
P("el.battery.v", "Battery nominal voltage", "power", "V", 3.7, 3, 4.2, 0.1);
P("el.battery.w", "Battery width", "electronics", "mm", 40, 5, 80, 0.5);
P("el.battery.l", "Battery length", "electronics", "mm", 60, 5, 100, 0.5);
P("el.battery.h", "Battery thickness", "electronics", "mm", 8, 2, 25, 0.1);
P("el.battery.mass", "Battery mass", "power", "g", 38, 2, 100, 0.5);
P("el.mcu.i", "Microcontroller avg current", "power", "mA", 80, 1, 300, 1);
P("el.oled.w", "OLED module width", "electronics", "mm", 38, 10, 90, 0.1);
P("el.oled.h", "OLED module height", "electronics", "mm", 12, 8, 60, 0.1);
P("el.oled.i", "OLED current", "power", "mA", 12, 0, 100, 1);
P("el.led.count", "Addressable LED count", "electronics", "", 12, 0, 300, 1);
P("el.led.iEach", "LED avg current each", "power", "mA", 10, 1, 60, 1);
P("el.preamp.i", "Preamp current", "power", "mA", 3, 0, 20, 0.1);
P("el.preamp.gain", "Preamp gain", "electronics", "dB", 20, 0, 60, 0.5);
P("el.dsp.load", "DSP load", "electronics", "%", 40, 0, 100, 1);
P("el.dsp.buffer", "DSP block size", "electronics", "samples", 64, 16, 2048, 16);
P("el.dsp.fs", "DSP sample rate", "electronics", "Hz", 48000, 8000, 192000, 1000);
P("el.amp.power", "Amplifier rated power", "electronics", "W", 0.5, 0.05, 5, 0.05);
P("el.amp.duty", "Amplifier avg duty (output/rated)", "power", "%", 20, 1, 100, 1);
P("el.amp.eff", "Amplifier efficiency", "power", "%", 80, 30, 95, 1);
P("el.pcb.w", "PCB width", "electronics", "mm", 45, 10, 80, 0.5);
P("el.pcb.l", "PCB length", "electronics", "mm", 70, 10, 120, 0.5);
P("el.pcb.h", "PCB component stack height", "electronics", "mm", 8, 2, 20, 0.5);
P("el.bay.w", "Electronics bay width", "electronics", "mm", 60, 20, 120, 0.5);
P("el.bay.l", "Electronics bay length", "electronics", "mm", 90, 20, 140, 0.5);
P("el.bay.d", "Electronics bay depth", "electronics", "mm", 22, 8, 40, 0.5);
P("el.pickup.type", "Pickup type", "electronics", "", 0, 0, 1, 1, { options: ["Piezo (bridge contact)", "Magnetic (string-sensing)"] });
P("el.pickup.dist", "Magnetic pickup distance from bridge", "electronics", "mm", 28, 5, 150, 0.5);
P("el.thermal.rth", "Enclosure thermal resistance (assumed)", "thermal", "K/W", 20, 5, 200, 1);
D("el.dsp.latency", "DSP round-trip latency", "electronics", "ms", ["el.dsp.buffer", "el.dsp.fs"], (g) => (2 * g("el.dsp.buffer") * 1000) / g("el.dsp.fs") + 0.5, "2·block/fs + 0.5 ms converter/filter allowance (assumed)", { kind: "power", approx: true });
D("el.dsp.i", "DSP/codec current", "power", "mA", ["el.dsp.load", "el.mcu.i"], (g) => 10 + 0.6 * g("el.dsp.load"), "10 mA + 0.6 mA per % load (assumption)", { kind: "power", approx: true });
D("el.amp.i", "Amplifier avg supply current", "power", "mA", ["el.amp.power", "el.amp.duty", "el.amp.eff", "el.battery.v"], (g) => ((g("el.amp.power") / (g("el.amp.eff") / 100)) / g("el.battery.v")) * 1000 * (g("el.amp.duty") / 100), "P/(η·V)·duty", { kind: "power" });
D("el.led.i", "LED total current", "power", "mA", ["el.led.count", "el.led.iEach"], (g) => g("el.led.count") * g("el.led.iEach"), "N·I_each", { kind: "power" });
const PDEPS = ["el.mcu.i", "el.oled.i", "el.led.i", "el.preamp.i", "el.dsp.i", "el.amp.i"];
D("el.power.total", "Total average current", "power", "mA", PDEPS, (g) => PDEPS.reduce((s, id) => s + g(id), 0), "Σ subsystem currents", { kind: "power" });
D("el.power.mW", "Total average power", "power", "mW", ["el.power.total", "el.battery.v"], (g) => g("el.power.total") * g("el.battery.v"), "V·I", { kind: "power" });
D("el.power.runtime", "Estimated runtime", "power", "h", ["el.battery.cap", "el.power.total"], (g) => (g("el.battery.cap") * 0.8) / Math.max(1e-6, g("el.power.total")), "80 % usable capacity / average current", { kind: "power", approx: true });
D("el.thermal.dissip", "Heat dissipated inside body", "thermal", "mW", ["el.power.mW", "el.amp.power", "el.amp.duty", "el.led.i", "el.battery.v"], (g) => Math.max(0, g("el.power.mW") - g("el.amp.power") * 1000 * (g("el.amp.duty") / 100) - 0.6 * g("el.led.i") * g("el.battery.v")), "input power − average output power − 60 % of LED power (assumed emitted as light outside the body)", { kind: "thermal", approx: true });
D("el.thermal.rise", "Steady-state temperature rise", "thermal", "°C", ["el.thermal.dissip", "el.thermal.rth"], (g) => (g("el.thermal.dissip") / 1000) * g("el.thermal.rth"), "ΔT = P·Rθ with assumed enclosure Rθ", { kind: "thermal", approx: true });
D("el.bay.reqDepth", "Bay depth required", "electronics", "mm", ["el.pcb.h", "el.battery.h"], (g) => g("el.pcb.h") + 1.6 + g("el.battery.h") + 1, "PCB stack + board + battery + 1 mm", { kind: "mechanical" });
D("el.bay.margin", "Bay depth margin", "electronics", "mm", ["el.bay.d", "el.bay.reqDepth"], (g) => g("el.bay.d") - g("el.bay.reqDepth"), "bay depth − required", { kind: "mechanical" });

REF_VOL = (() => { const g = REFG; const inner = Math.abs(polygonArea(offsetPolygon(violinOutline(oParams(g)), g("geom.ribThickness")))); return (inner * (g("geom.ribHeight") + 0.5 * (g("geom.topArch") + g("geom.backArch")))) / 1e6; })();
REF_AF = (2 * fholeAreaMm2(REFG("geom.fholeLength"), REFG("geom.fholeSep"))) / 100;
REF_TOP = plateF(REFG, "geom.topThickness", "mat.top");
REF_BACK = plateF(REFG, "geom.backThickness", "mat.back");
REF_BR = REFG("geom.bridgeHeight") * REFG("geom.bridgeWidth") * REFG("geom.bridgeThickness");

export const PARAM_LIST: ParamDef[] = PARAMS;
export const PARAM_MAP: Record<string, ParamDef> = Object.fromEntries(PARAMS.map((p) => [p.id, p]));
export const INPUT_IDS = PARAMS.filter((p) => !p.derived).map((p) => p.id);
export const DEFAULT_VALUES: Record<string, number> = Object.fromEntries(PARAMS.filter((p) => !p.derived).map((p) => [p.id, p.def]));

/** Evaluate all derived parameters from input values (memoised topological evaluation). */
export function evaluate(inputs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const g = (id: string): number => {
    if (id in out) return out[id];
    const p = PARAM_MAP[id];
    if (!p) throw new Error("Unknown parameter " + id);
    const v = p.derived ? p.derived.compute(g) : id in inputs ? inputs[id] : p.def;
    out[id] = v;
    return v;
  };
  PARAMS.forEach((p) => g(p.id));
  return out;
}

// ------------------------------------------------ artifacts (things that go stale)
export interface ArtifactDef { id: string; label: string; domain: Domain; deps: string[]; docDeps?: string[]; note: string }
export const ARTIFACTS: ArtifactDef[] = [
  { id: "art.cad", label: "CAD mesh / assembly", domain: "geometry", deps: ["geom.*", "mat.*"], docDeps: ["parts", "primitives"], note: "Visual tessellation of the parametric model" },
  { id: "art.drawing", label: "Technical drawing", domain: "manufacturing", deps: ["geom.*", "str.*.diameter"], docDeps: ["tolerances"], note: "Views, dimensions, tolerances" },
  { id: "art.bom", label: "Bill of materials", domain: "manufacturing", deps: ["geom.*", "mat.*", "el.battery.*", "el.pcb.*"], docDeps: ["placed", "schematic", "customParts"], note: "Parts and materials list" },
  { id: "art.acoustic", label: "Body-response estimate", domain: "simulation", deps: ["ac.*", "geom.soundpost*", "geom.bassbar*", "geom.topArch", "geom.backArch", "mat.*"], note: "Scaling-model body modes" },
  { id: "art.string", label: "String vibration / tuning", domain: "simulation", deps: ["str.*", "geom.vibLength", "bow.*", "play.*"], note: "Pitch, tension, bow-string excitation" },
  { id: "art.audio", label: "Audio render", domain: "simulation", deps: ["ac.*", "str.*", "play.*", "bow.*", "el.pickup.*", "el.preamp.gain", "el.amp.*", "el.dsp.*"], docDeps: ["audio"], note: "Procedural audio signal chain" },
  { id: "art.circuit", label: "Circuit simulation", domain: "simulation", deps: [], docDeps: ["schematic"], note: "Netlist-level DC/transient solution" },
  { id: "art.power", label: "Power & thermal budget", domain: "power", deps: ["el.*"], note: "Average current, runtime, temperature rise" },
  { id: "art.pcb", label: "PCB layout / Gerber", domain: "manufacturing", deps: ["el.pcb.*"], docDeps: ["schematic", "pcb"], note: "Board, footprints, copper, drill" },
  { id: "art.firmware", label: "Firmware pin map", domain: "firmware", deps: [], docDeps: ["schematic", "code"], note: "GPIO names in code vs schematic nets" },
  { id: "art.fit", label: "Electronics fit check", domain: "electronics", deps: ["geom.*", "el.*"], docDeps: ["placed"], note: "Bay / collision / mounting checks" },
];

export interface Relation { from: string; to: string; kind: EdgeKind; note: string }
/** Extensible cross-domain relations. To add a relationship: append one object here. */
export const RELATIONS: Relation[] = [
  { from: "geom.bodyLength", to: "geom.cavityVolume", kind: "mechanical", note: "Body outline changes inner volume" },
  { from: "geom.bodyLength", to: "art.fit", kind: "mechanical", note: "Electronics bay & positions inside the cavity must be re-checked" },
  { from: "geom.bodyLength", to: "art.drawing", kind: "manufacturing", note: "Drawings dimensions are out of date" },
  { from: "geom.lowerBout", to: "art.fit", kind: "mechanical", note: "Lower bout width limits bay and electronics placement" },
  { from: "geom.ribHeight", to: "art.fit", kind: "mechanical", note: "Internal depth limits electronics height and OLED mounting on ribs" },
  { from: "mat.back", to: "art.drawing", kind: "manufacturing", note: "Material callouts in drawings" },
  { from: "mat.top", to: "art.acoustic", kind: "material", note: "Stiffness and damping change plate response" },
  { from: "mat.*", to: "art.bom", kind: "material", note: "Material list changes" },
  { from: "mat.*", to: "art.cad", kind: "material", note: "Display appearance" },
  { from: "geom.bridgeHeight", to: "load.downforce", kind: "mechanical", note: "Bridge height changes string angles and downforce" },
  { from: "geom.bridgeHeight", to: "art.string", kind: "acoustic", note: "Action / intonation of the strings changes" },
  { from: "geom.stopLength", to: "geom.vibLength", kind: "mechanical", note: "Bridge position relocates the nut-to-bridge distance — user must confirm the vibrating length" },
  { from: "geom.soundpostBehind", to: "art.acoustic", kind: "acoustic", note: "Soundpost position changes vibration transfer between plates (no quantitative model yet)" },
  { from: "geom.soundpostX", to: "art.acoustic", kind: "acoustic", note: "Soundpost lateral position (no quantitative model yet)" },
  { from: "geom.soundpostDia", to: "art.acoustic", kind: "acoustic", note: "Soundpost stiffness (no quantitative model yet)" },
  { from: "geom.bassbar*", to: "art.acoustic", kind: "acoustic", note: "Bass bar stiffens top plate (no quantitative model yet)" },
  { from: "geom.topArch", to: "art.acoustic", kind: "acoustic", note: "Arching shapes the plate stiffness (no quantitative model yet)" },
  { from: "geom.fholeLength", to: "art.drawing", kind: "manufacturing", note: "F-hole template dimensions" },
  { from: "ac.*", to: "art.audio", kind: "acoustic", note: "Body response filter bank used in audio render" },
  { from: "str.*.freq", to: "art.audio", kind: "acoustic", note: "Pitch of played string" },
  { from: "load.downforce", to: "art.acoustic", kind: "mechanical", note: "Bridge loading influences top plate behaviour" },
  { from: "load.downforce", to: "art.drawing", kind: "manufacturing", note: "Structural note" },
  { from: "el.pickup.*", to: "art.audio", kind: "electrical", note: "Pickup type/position shapes the electrical signal" },
  { from: "el.pickup.dist", to: "art.fit", kind: "mechanical", note: "Pickup mounting position" },
  { from: "el.preamp.gain", to: "art.audio", kind: "electrical", note: "Gain / clipping" },
  { from: "el.amp.power", to: "art.audio", kind: "electrical", note: "Output stage headroom" },
  { from: "el.dsp.*", to: "art.audio", kind: "electrical", note: "DSP latency and processing" },
  { from: "el.oled.*", to: "art.fit", kind: "mechanical", note: "Display size may not fit rib/cavity" },
  { from: "el.oled.*", to: "art.pcb", kind: "electrical", note: "Display connector/footprint on PCB" },
  { from: "el.oled.*", to: "el.power.total", kind: "power", note: "Display current" },
  { from: "el.battery.*", to: "art.fit", kind: "mechanical", note: "Battery dimensions need bay space" },
  { from: "el.battery.*", to: "art.bom", kind: "manufacturing", note: "Battery part changes" },
  { from: "el.pcb.*", to: "art.fit", kind: "mechanical", note: "PCB dimensions need bay space" },
  { from: "el.bay.*", to: "art.drawing", kind: "manufacturing", note: "Bay cutout / hatch drawing" },
  { from: "el.led.count", to: "art.firmware", kind: "firmware", note: "LED count constant in firmware" },
  { from: "el.led.count", to: "art.pcb", kind: "electrical", note: "Wiring/connector for LED strip" },
  { from: "el.power.*", to: "art.power", kind: "power", note: "Power budget artifact" },
  { from: "el.thermal.*", to: "art.power", kind: "thermal", note: "Thermal estimate" },
  { from: "el.pcb.*", to: "art.pcb", kind: "manufacturing", note: "Board size changes outline & Gerber" },
];

// ------------------------------------------------ graph
export interface GraphNode { id: string; label: string; domain: Domain; type: "param" | "artifact" }
export interface GraphEdge { from: string; to: string; kind: EdgeKind; note: string }
const wild = (pat: string, ids: string[]): string[] => {
  if (!pat.includes("*")) return ids.includes(pat) ? [pat] : [];
  const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  return ids.filter((i) => re.test(i));
};
export const GRAPH_NODES: GraphNode[] = [
  ...PARAMS.map((p) => ({ id: p.id, label: p.label, domain: p.domain, type: "param" as const })),
  ...ARTIFACTS.map((a) => ({ id: a.id, label: a.label, domain: a.domain, type: "artifact" as const })),
];
const ALL_IDS = GRAPH_NODES.map((n) => n.id);
export const GRAPH_EDGES: GraphEdge[] = (() => {
  const e: GraphEdge[] = [];
  PARAMS.forEach((p) => p.derived?.deps.forEach((d) => e.push({ from: d, to: p.id, kind: p.derived!.kind ?? "parametric", note: p.derived!.note })));
  RELATIONS.forEach((r) => wild(r.from, ALL_IDS).forEach((f) => wild(r.to, ALL_IDS).forEach((t) => f !== t && e.push({ from: f, to: t, kind: r.kind, note: r.note }))));
  ARTIFACTS.forEach((a) => a.deps.forEach((d) => wild(d, ALL_IDS).forEach((f) => e.push({ from: f, to: a.id, kind: "simulation", note: a.note }))));
  return e;
})();
const ADJ: Record<string, GraphEdge[]> = {};
GRAPH_EDGES.forEach((e) => (ADJ[e.from] ||= []).push(e));

export interface Impact { id: string; label: string; type: "param" | "artifact"; domain: Domain; depth: number; chain: string[]; notes: string[]; kinds: EdgeKind[] }
/** Breadth-first impact analysis: what is affected by a change in these parameters, and why. */
export function impactOf(changed: string[], maxDepth = 6): Impact[] {
  const seen = new Set<string>(changed);
  const out: Impact[] = [];
  let frontier = changed.map((c) => ({ id: c, chain: [c], notes: [] as string[], kinds: [] as EdgeKind[] }));
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const e of ADJ[f.id] ?? []) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        const node = GRAPH_NODES.find((n) => n.id === e.to);
        if (!node) continue;
        const item = { id: e.to, chain: [...f.chain, e.to], notes: [...f.notes, e.note], kinds: [...f.kinds, e.kind] };
        next.push(item);
        out.push({ id: node.id, label: node.label, type: node.type, domain: node.domain, depth, chain: item.chain, notes: item.notes, kinds: item.kinds });
      }
    }
    frontier = next;
  }
  return out;
}
export const dependentsOf = (id: string) => (ADJ[id] ?? []).map((e) => ({ id: e.to, kind: e.kind, note: e.note }));
export const dependenciesOf = (id: string) => GRAPH_EDGES.filter((e) => e.to === id);
export { wild as matchIds };

// ------------------------------------------------ validation rules
export type Severity = "error" | "warning" | "info";
export interface Issue { id: string; severity: Severity; domain: Domain | "electronics" | "firmware"; message: string; params: string[]; explain?: string }
export interface Rule { id: string; domain: Issue["domain"]; params: string[]; check: (g: Getter) => { severity: Severity; message: string; explain?: string } | null }
const rule = (id: string, domain: Issue["domain"], params: string[], check: Rule["check"]): Rule => ({ id, domain, params, check });
export const RULES: Rule[] = [
  rule("outline.order", "geometry", ["geom.upperBout", "geom.cBout", "geom.lowerBout"], (g) => (g("geom.cBout") >= Math.min(g("geom.upperBout"), g("geom.lowerBout")) ? { severity: "error", message: "C-bout must be narrower than both bouts", explain: "A violin waist narrower than the bouts is needed for bow clearance." } : g("geom.upperBout") >= g("geom.lowerBout") ? { severity: "warning", message: "Upper bout is wider than the lower bout (unusual)" } : null)),
  rule("neck.length", "geometry", ["geom.stopLength", "geom.vibLength"], (g) => { const n = g("geom.neckLength"); return n < 110 || n > 150 ? { severity: "warning", message: `Derived neck length ${n.toFixed(1)} mm is outside the usual 110–150 mm`, explain: "neck = vibrating length − stop length. Adjust one of them." } : null; }),
  rule("stop.vib", "geometry", ["geom.stopLength", "geom.vibLength"], (g) => { const ratio = g("geom.stopLength") / g("geom.vibLength"); return Math.abs(ratio - 0.6) > 0.025 ? { severity: "info", message: `Stop/vibrating length ratio ${ratio.toFixed(3)} (classic ≈ 0.600)`, explain: "Non-classic ratios shift the feel and the fingering positions." } : null; }),
  rule("rib.thin", "geometry", ["geom.ribThickness", "geom.ribHeight"], (g) => (g("geom.ribThickness") < 1 && g("geom.ribHeight") > 32 ? { severity: "warning", message: "Thin tall ribs may buckle (no structural analysis implemented)" } : null)),
  rule("top.thin", "geometry", ["geom.topThickness", "load.downforce"], (g) => (g("geom.topThickness") < 2.2 && g("load.downforce") > 90 ? { severity: "warning", message: `Top plate ${g("geom.topThickness").toFixed(2)} mm with ${g("load.downforce").toFixed(0)} N downforce risks collapse`, explain: "Rule-of-thumb check only; no FEM structural analysis exists in this build." } : null)),
  rule("bridge.height", "geometry", ["geom.bridgeHeight"], (g) => (g("geom.bridgeHeight") < 31 || g("geom.bridgeHeight") > 36 ? { severity: "warning", message: "Bridge height outside the typical 31–36 mm" } : null)),
  rule("break.angle", "strings", ["load.breakAngle"], (g) => (g("load.breakAngle") < 140 ? { severity: "warning", message: `Break angle ${g("load.breakAngle").toFixed(1)}° is very sharp (typical 150–160°)` } : g("load.breakAngle") > 165 ? { severity: "warning", message: `Break angle ${g("load.breakAngle").toFixed(1)}° is shallow; weak bridge coupling and buzzing risk` } : null)),
  rule("fhole.sep", "geometry", ["geom.fholeSep", "geom.bridgeWidth"], (g) => (g("geom.fholeSep") < g("geom.bridgeWidth") + 1 ? { severity: "error", message: "Bridge feet do not fit between the f-holes", explain: "F-hole separation at nicks must exceed the bridge foot span by ≥ 1 mm." } : null)),
  rule("bridge.spacing", "geometry", ["geom.stringSpacingBridge", "geom.bridgeWidth"], (g) => (g("geom.stringSpacingBridge") > g("geom.bridgeWidth") - 6 ? { severity: "warning", message: "String spacing at bridge nearly exceeds bridge width" } : null)),
  rule("sp.bridge", "geometry", ["geom.soundpostBehind", "geom.soundpostDia"], (g) => (g("geom.soundpostBehind") < g("geom.soundpostDia") / 2 ? { severity: "info", message: "Soundpost almost touches bridge foot position" } : null)),
  rule("bassbar.len", "geometry", ["geom.bassbarLength", "geom.bodyLength"], (g) => (g("geom.bassbarLength") > g("geom.bodyLength") - 55 ? { severity: "error", message: "Bass bar longer than the available inner top-plate length" } : null)),
  rule("fb.width", "geometry", ["geom.fbWidthNut", "geom.fbWidthEnd", "geom.stringSpacingNut"], (g) => (g("geom.fbWidthNut") < g("geom.stringSpacingNut") + 5 ? { severity: "error", message: "Nut too narrow for string spacing" } : g("geom.fbWidthEnd") < g("geom.fbWidthNut") ? { severity: "error", message: "Fingerboard end narrower than nut" } : null)),
  rule("action", "geometry", ["geom.actionE", "geom.actionG"], (g) => (g("geom.actionG") < g("geom.actionE") ? { severity: "warning", message: "G action lower than E action; unusual and prone to buzzing" } : g("geom.actionE") < 2.4 ? { severity: "warning", message: "Very low E action may buzz" } : null)),
  ...SK.flatMap((k, i) => [
    rule(`str.${k}.range`, "strings", [`str.${k}.tension`], (g) => { const t = g(`str.${k}.tension`), [lo, hi] = TYPICAL_TENSION_N[i]; return t < lo ? { severity: "warning", message: `${k} tension ${t.toFixed(1)} N below typical ${lo}–${hi} N (floppy, weak tone)` } : t > hi ? { severity: "warning", message: `${k} tension ${t.toFixed(1)} N above typical ${lo}–${hi} N; risk of string break or top plate overload` } : null; }),
    rule(`str.${k}.rho`, "strings", [`str.${k}.mu`, `str.${k}.diameter`], (g) => { const r = g(`str.${k}.rhoEff`); return r < 0.8 || r > 12 ? { severity: "error", message: `${k}: diameter ${g(`str.${k}.diameter`)} mm and linear density ${g(`str.${k}.mu`)} g/m are contradictory (effective density ${r.toFixed(2)} g/cm³)`, explain: "Effective density μ/(πd²/4) must lie within 0.8–12 g/cm³ for real strings (gut ≈1.3, steel ≈7.8, tungsten-wound up to ≈12)." } : null; }),
    rule(`str.${k}.detune`, "strings", [`str.${k}.cents`], (g) => (Math.abs(g(`str.${k}.cents`)) > 5 ? { severity: "warning", message: `${k} is ${g(`str.${k}.cents`).toFixed(0)} cents off its target pitch`, explain: "Tension mode: pitch follows from tension. Switch to 'Tune to target' to solve tension." } : null)),
  ]),
  rule("pitch.order", "strings", SK.map((k) => `str.${k}.freq`), (g) => (SK.some((k, i) => i > 0 && g(`str.${k}.freq`) <= g(`str.${SK[i - 1]}.freq`)) ? { severity: "error", message: "String pitches are not ascending G<D<A<E" } : null)),
  rule("el.oled.rib", "electronics", ["el.oled.h", "geom.ribHeight"], (g) => (g("el.oled.h") > g("geom.ribHeight") - 6 ? { severity: "warning", message: `OLED ${g("el.oled.w")}×${g("el.oled.h")} mm module does not fit on the rib (rib height ${g("geom.ribHeight")} mm, 3 mm margin each side)`, explain: "Options: mount on the back plate/top surface, reduce display size, or increase rib height." } : null)),
  rule("el.bay.depth", "electronics", ["el.bay.margin"], (g) => (g("el.bay.margin") < 0 ? { severity: "error", message: `Electronics stack needs ${g("el.bay.reqDepth").toFixed(1)} mm, bay depth is ${g("el.bay.d")} mm`, explain: "Reduce PCB stack/battery height or deepen the bay." } : g("el.bay.margin") < 1 ? { severity: "warning", message: "Bay depth margin below 1 mm" } : null)),
  rule("el.bay.depth.rib", "electronics", ["el.bay.d", "geom.ribHeight"], (g) => (g("el.bay.d") > g("geom.ribHeight") - 2 ? { severity: "error", message: "Bay depth reaches the plates (rib height − 2 mm exceeded)" } : null)),
  rule("el.bay.area", "electronics", ["el.bay.w", "el.bay.l", "el.pcb.w", "el.pcb.l", "el.battery.w", "el.battery.l"], (g) => (g("el.bay.w") < Math.max(g("el.pcb.w"), g("el.battery.w")) + 2 || g("el.bay.l") < Math.max(g("el.pcb.l"), g("el.battery.l")) + 2 ? { severity: "error", message: "PCB or battery footprint does not fit in the bay (needs 1 mm clearance per side)" } : null)),
  rule("el.runtime", "power", ["el.power.runtime"], (g) => (g("el.power.runtime") < 4 ? { severity: "warning", message: `Estimated runtime ${g("el.power.runtime").toFixed(1)} h is short`, explain: "Reduce LED count/brightness, DSP load, or enlarge battery (check bay)." } : null)),
  rule("el.thermal", "thermal", ["el.thermal.rise"], (g) => (g("el.thermal.rise") > 15 ? { severity: "warning", message: `Estimated heat rise ${g("el.thermal.rise").toFixed(1)} °C inside the body; wood and glue joints dislike heat` } : null)),
  rule("el.dsp.lat", "electronics", ["el.dsp.latency"], (g) => (g("el.dsp.latency") > 10 ? { severity: "warning", message: `DSP latency ${g("el.dsp.latency").toFixed(1)} ms is noticeable to players (>10 ms)` } : null)),
  rule("el.pickup.mag", "electronics", ["el.pickup.type", "str.E.diameter"], (g) => (g("el.pickup.type") > 0.5 ? { severity: "info", message: "Magnetic pickup requires ferromagnetic (steel-core) strings; gut/synthetic cores will not be sensed" } : null)),
  rule("el.amp.volt", "power", ["el.amp.power", "el.battery.v"], (g) => ((g("el.amp.power") / 0.8) / g("el.battery.v") > 0.6 ? { severity: "warning", message: "Amplifier peak current exceeds ~600 mA; check battery C-rating and traces" } : null)),
];
export function checkRules(g: Getter): Issue[] {
  const out: Issue[] = [];
  for (const r of RULES) {
    const res = r.check(g);
    if (res) out.push({ id: r.id, domain: r.domain, params: r.params, ...res });
  }
  return out;
}
