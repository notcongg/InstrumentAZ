// Engine self-checks (run: npx tsx tests/selfcheck.ts). Verifies physics & solver against closed-form values.
import { evaluate, checkRules, impactOf, DEFAULT_VALUES } from "../src/lib/iaz/params";
import { exampleCircuit, simulate, runERC, measureResistance, measureDiode } from "../src/lib/iaz/circuit";
import { renderTone, DEFAULT_AUDIO } from "../src/lib/iaz/audio";
import { defaultDoc, parseIaz, serializeIaz, fingerprint, migrateDoc } from "../src/lib/iaz/doc";
import { checkFirmware } from "../src/lib/iaz/firmware";
import { buildModel, checkFit, wiringOf } from "../src/lib/iaz/geometry";
import { toSTL, toDXF, bomOf, drawingSvg, gerberOf, manufacturingChecks } from "../src/lib/iaz/exporters";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
const near = (a: number, b: number, tol: number, m: string) => ok(Math.abs(a - b) <= tol, `${m}: ${a.toFixed(4)} ≈ ${b} (±${tol})`);

const v = evaluate(DEFAULT_VALUES);
near(v["str.A.freq"], 440, 0.01, "A string pitch from tension");
near(v["str.E.tension"], 76.5, 1.5, "E string tension");
near(v["load.totalTension"] / 9.80665, 25, 4, "total tension kgf");
near(v["ac.A0"], 275, 0.5, "A0 reference");
near(v["geom.neckLength"], 130, 0.01, "neck length = vib − stop");
const v2 = evaluate({ ...DEFAULT_VALUES, "str.A.mode": 1, "str.A.tensionSet": 70 });
near(v2["str.A.freq"], 440 * Math.sqrt(70 / v["str.A.tension"]), 0.01, "tension mode solves pitch");
ok(checkRules((id) => v2[id]).some((i) => i.id === "str.A.detune"), "detune warning raised");
const bad = evaluate({ ...DEFAULT_VALUES, "str.E.diameter": 0.1, "str.E.mu": 3 });
ok(checkRules((id) => bad[id]).some((i) => i.id === "str.E.rho"), "contradictory diameter/mu flagged");
const imp = impactOf(["geom.soundpostBehind"]);
ok(imp.some((i) => i.id === "art.acoustic"), "soundpost → acoustic impact");
ok(impactOf(["geom.bridgeHeight"]).some((i) => i.id === "load.downforce"), "bridge → downforce impact");
ok(impactOf(["el.oled.h"]).some((i) => i.id === "art.fit"), "OLED size → fit impact");

// circuit
const rc = simulate(exampleCircuit("rc"), [], { tran: { tstop: 0.01, dt: 1e-5 } });
ok(rc.ok, "RC sim ok " + (rc.error ?? ""));
const out = rc.v["OUT"], inn = rc.v["IN"];
const peak = (a: number[]) => Math.max(...a.slice(Math.floor(a.length / 2)));
const gain = peak(out) / peak(inn), fc = 1 / (2 * Math.PI * 1000 * 1e-7), expect = 1 / Math.sqrt(1 + (1000 / fc) ** 2);
near(gain, expect, 0.02, "RC low-pass gain at 1 kHz");
const led = simulate(exampleCircuit("led"), []);
const iled = led.opI[Object.keys(led.opI).find((k) => led.opI[k] > 0 && k !== "p1")!] ?? 0;
ok(led.ok && led.op["LED_A"] > 1.5 && led.op["LED_A"] < 2.4, `LED forward voltage ${led.op["LED_A"]?.toFixed(3)} V`);
near(Math.abs(Object.values(led.opI).find((x) => Math.abs(x) > 1e-3 && Math.abs(x) < 0.02) ?? 0), (5 - led.op["LED_A"]) / 330, 1e-4, "LED current = (Vs−Vf)/R");
void iled;
const pre = simulate(exampleCircuit("preamp"), [], { tran: { tstop: 0.01, dt: 1e-5 } });
near(peak(pre.v["OUT"]) / peak(pre.v["IN"]), 11, 0.1, "non-inverting op-amp gain 1+Rf/Rg");
const rc0 = exampleCircuit("rc");
const rmeas = measureResistance(rc0, [], "IN", "0");
ok(rmeas.ohms != null && Math.abs(rmeas.ohms - 0) < 1e3, "ohmmeter with sources zeroed");
const lr = measureResistance(rc0, [], "OUT", "0");
ok(lr.ohms != null, "ohmmeter OUT-GND returns value (R1 path through zeroed source: " + lr.ohms + ")");
const dtest = measureDiode(exampleCircuit("led"), [], "LED_A", "0");
near(dtest.v ?? 0, 0.33, 0.01, "in-circuit diode test sees the parallel 330 Ω (1 mA × 330 Ω), like a real meter");
const iso = exampleCircuit("led"); iso.wires = iso.wires.filter((w) => w.a.p !== iso.parts[0].id && w.b.p !== iso.parts[0].id);
const dIso = measureDiode(iso, [], "LED_A", "0");
ok(dIso.v != null && dIso.v > 1.5 && dIso.v < 2.3, "diode test of isolated LED " + dIso.v);
ok(runERC(exampleCircuit("rc")).filter((i) => i.severity === "error").length === 0, "ERC clean on RC");
const broken = exampleCircuit("rc"); broken.wires.pop();
ok(runERC(broken).some((i) => i.severity !== "info"), "ERC detects missing wire");

// audio
const a = renderTone(v, { ...DEFAULT_AUDIO, duration: 0.5 });
ok(a.samples.length > 20000 && a.stats.peak > 0.1 && a.stats.peak <= 0.91, "audio renders, peak " + a.stats.peak.toFixed(2));
const hot = renderTone(evaluate({ ...DEFAULT_VALUES, "el.preamp.gain": 60 }), { ...DEFAULT_AUDIO, duration: 0.5, chain: "pickup" });
ok(hot.stats.preClipPct > 5, "preamp clipping at 60 dB: " + hot.stats.preClipPct.toFixed(1) + "%");

// project
const doc = defaultDoc();
const fw = checkFirmware(doc, v);
ok(fw.links.every((l) => l.status === "ok") && fw.links.length === 3, "firmware pins match schematic: " + fw.links.map((l) => l.name + ":" + l.status).join(","));
const doc2 = { ...doc, code: { ...doc.code, "src/main.cpp": doc.code["src/main.cpp"].replace("OLED_SCL 22", "OLED_SCL 23") } };
ok(checkFirmware(doc2, v).issues.some((i) => i.severity === "error"), "firmware pin mismatch detected");
const fp1 = fingerprint(doc, v, "art.drawing");
const v3 = evaluate({ ...DEFAULT_VALUES, "geom.bodyLength": 350 });
ok(fp1 !== fingerprint(doc, v3, "art.drawing"), "drawing fingerprint changes with body length");
ok(fp1 === fingerprint(doc, evaluate({ ...DEFAULT_VALUES, "el.led.count": 99 }), "art.drawing"), "drawing unaffected by LED count");
(async () => {
  const text = await serializeIaz(doc);
  const p = await parseIaz(text);
  ok(p.ok && p.doc?.name === doc.name, "iaz round trip");
  const tampered = text.replace('"My Violin"', '"Evil"');
  const pt = await parseIaz(tampered);
  ok(!pt.ok && !!pt.recoverable, "tampered iaz detected, recoverable");
  ok(!(await parseIaz("{not json")).ok, "garbage rejected");
  const newer = JSON.parse(text); newer.formatVersion = 99;
  ok(!(await parseIaz(JSON.stringify(newer))).ok, "newer format rejected");
  const mig = migrateDoc({ name: "old", values: { "geom.bodyLength": 9999 } });
  ok(mig.doc.values["geom.bodyLength"] === 380 && mig.notes.length > 0, "migration clamps out-of-bounds value");
  // geometry / exports
  const m = buildModel(doc, v);
  const stl = toSTL(m, "x");
  ok(stl.split("facet normal").length > 1000, "STL has facets: " + (stl.split("facet normal").length - 1));
  ok(toDXF(v).includes("FHOLE_R"), "DXF contains f-holes");
  ok(bomOf(doc, v).length > 20, "BOM rows " + bomOf(doc, v).length);
  ok(drawingSvg(doc, v).includes("critical dimensions"), "drawing warns about missing tolerances");
  const fit = checkFit(doc, v);
  console.log("fit issues (default):", fit.map((i) => i.message));
  const big = { ...doc, values: { ...doc.values, "el.pcb.w": 75, "el.pcb.l": 110 } };
  ok(checkFit(big, evaluate(big.values)).some((i) => i.message.includes("service bay")), "oversize PCB flagged in CAD fit check");
ok(checkRules((id) => evaluate(big.values)[id]).some((i) => i.id === "el.bay.area" && i.severity === "error"), "oversize PCB flagged by parameter rule");
  const oled = { ...doc, values: { ...doc.values, "el.oled.h": 27.8 } };
  ok(checkFit(oled, evaluate(oled.values)).some((i) => i.message.includes("OLED") || i.message.includes("OLED display")), "OLED 0.96in does not fit rib");
  console.log("wiring segs:", wiringOf(doc, v).segs.length);
  const g = gerberOf(doc);
  ok(g.copper.includes("%MOMM*%") && g.padCount > 5, "gerber pads " + g.padCount);
  const mc = manufacturingChecks(doc, v, [], fit);
  ok(mc.some((i) => i.severity === "error" && i.message.includes("tolerance")), "manufacturing blocks on missing tolerances");
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
})();
