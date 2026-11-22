"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildNets, pinKey } from "@/lib/iaz/circuit";
import { checkFirmware, parseDefines } from "@/lib/iaz/firmware";
import { getElPart } from "@/lib/iaz/catalog";
import { commit, toast, useDoc, useVals } from "@/lib/iaz/store";
import { download, IssueList, Prov, Resizable, Section, Tabs, Unsupported } from "./ui";

const KW_CPP = "auto bool break case char class const constexpr continue default delete do double else enum extern false float for if include inline int long namespace new nullptr private public return short signed sizeof static struct switch this true typedef uint8_t uint16_t uint32_t unsigned using void volatile while define byte String".split(" ");
const KW_PY = "and as class def elif else except False for from if import in is None not or pass return True try while with lambda".split(" ");
const KW_RS = "as const else enum fn for if impl let loop match mod mut pub return self static struct true false use while u8 u16 u32 i32 f32 bool".split(" ");
const API = ["pinMode", "digitalWrite", "digitalRead", "analogRead", "analogWrite", "delay", "millis", "micros", "Serial.begin", "Serial.println", "Serial.printf", "Wire.begin", "Wire.beginTransmission", "Wire.write", "Wire.endTransmission", "ledcSetup", "ledcAttachPin", "ledcWrite", "attachInterrupt", "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP", "setup", "loop", "i2s_driver_install", "WiFi.begin", "SPI.begin", "esp_deep_sleep_start"];
const LIBS = [["Adafruit SSD1306", "adafruit/Adafruit SSD1306@^2.5.9", "OLED SSD1306"], ["Adafruit GFX", "adafruit/Adafruit GFX Library@^1.11.9", "Graphics"], ["Adafruit NeoPixel", "adafruit/Adafruit NeoPixel@^1.12.0", "WS2812 LEDs"], ["TFT_eSPI", "bodmer/TFT_eSPI@^2.5.43", "ST7789 / ILI9341"], ["ESP8266Audio", "earlephilhower/ESP8266Audio@^1.9.7", "I2S audio"], ["Adafruit ADS1X15", "adafruit/Adafruit ADS1X15@^2.5.0", "ADC"]];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlight(text: string, file: string): string {
  const kws = new Set(file.endsWith(".py") ? KW_PY : file.endsWith(".rs") ? KW_RS : KW_CPP);
  const py = file.endsWith(".py") || file.endsWith(".ini");
  const re = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;
  let out = "", last = 0, m: RegExpExecArray | null;
  const span = (c: string, t: string) => `<span style="color:${c}">${esc(t)}</span>`;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    const [t, c, st, n, w] = m;
    if (c) out += !py && c.startsWith("#") && /^#\s*(include|define|if|ifdef|ifndef|endif|pragma)/.test(c) ? span("#c792ea", t) : span("#6b7a90", t);
    else if (st) out += span("#9be564", t);
    else if (n) out += span("#f78c6c", t);
    else if (w) out += kws.has(w) ? span("#e8a33d", t) : /^[A-Z][A-Z0-9_]{2,}$/.test(w) ? span("#3dc2c0", t) : esc(t);
    last = m.index + t.length;
  }
  return out + esc(text.slice(last));
}

function lint(code: string, file: string) {
  const out: { line: number; sev: "error" | "warning"; msg: string }[] = [];
  if (!/\.(c|cpp|h|ino|rs)$/.test(file)) return out;
  const stack: [string, number][] = [], pair: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  code.split("\n").forEach((raw, i) => {
    const ln = raw.replace(/\/\/.*$/, "").replace(/"(?:\\.|[^"\\])*"/g, '""');
    if ((raw.match(/"/g) ?? []).length % 2 === 1 && !raw.includes("//")) out.push({ line: i + 1, sev: "error", msg: "Unterminated string literal" });
    for (const ch of ln) { if ("([{".includes(ch)) stack.push([ch, i + 1]); else if (")]}".includes(ch)) { const t = stack.pop(); if (!t || t[0] !== pair[ch]) out.push({ line: i + 1, sev: "error", msg: `Unmatched '${ch}'` }); } }
    if (/^\s*(int|float|bool|char|uint\d+_t|const\s+\w+)\s+\w+\s*=\s*[^;{]*$/.test(ln) && !ln.trim().endsWith(",") && !ln.includes("(")) out.push({ line: i + 1, sev: "warning", msg: "Statement may be missing ';'" });
    if (/\bdelay\(\s*\d{5,}\s*\)/.test(ln)) out.push({ line: i + 1, sev: "warning", msg: "Very long blocking delay()" });
    if (/\bgets\(|\bstrcpy\(/.test(ln)) out.push({ line: i + 1, sev: "warning", msg: "Unsafe C function" });
  });
  stack.forEach(([c, l]) => out.push({ line: l, sev: "error", msg: `Unclosed '${c}'` }));
  if (file.endsWith(".cpp") && !/void\s+setup\s*\(/.test(code) && !/int\s+main\s*\(/.test(code)) out.push({ line: 1, sev: "warning", msg: "No setup()/main() entry point" });
  return out;
}

export default function CodingWorkspace() {
  const doc = useDoc();
  const vals = useVals();
  const files = Object.keys(doc.code);
  const [cur, setCur] = useState(files[0] ?? "src/main.cpp");
  const file = doc.code[cur] !== undefined ? cur : files[0];
  const text = doc.code[file] ?? "";
  const [tab, setTab] = useState<"problems" | "pins" | "libs" | "serial" | "build">("problems");
  const [find, setFind] = useState(""), [repl, setRepl] = useState(""), [cs, setCs] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null), pre = useRef<HTMLPreElement>(null);
  const [word, setWord] = useState("");
  const fw = useMemo(() => checkFirmware(doc, vals), [doc, vals]);
  const problems = useMemo(() => lint(text, file), [text, file]);
  const setText = (t: string, key = true) => commit("Edit " + file, (d) => ({ ...d, code: { ...d.code, [file]: t } }), key ? `code:${file}` : undefined);
  const ids = useMemo(() => Array.from(new Set((text.match(/\b[A-Za-z_]\w{2,}\b/g) ?? []))), [text]);
  const sugg = word.length >= 2 ? [...API, ...ids, ...KW_CPP].filter((x, i, a) => a.indexOf(x) === i && x.toLowerCase().startsWith(word.toLowerCase()) && x !== word).slice(0, 8) : [];
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget, s = t.selectionStart, en = t.selectionEnd;
    if (e.key === "Tab") { e.preventDefault(); setText(text.slice(0, s) + "  " + text.slice(en)); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); }
    else if (e.key === "Enter") { e.preventDefault(); const ls = text.lastIndexOf("\n", s - 1) + 1, indent = (text.slice(ls, s).match(/^\s*/) ?? [""])[0], extra = /[{(\[]\s*$/.test(text.slice(ls, s)) ? "  " : ""; const ins = "\n" + indent + extra; setText(text.slice(0, s) + ins + text.slice(en)); requestAnimationFrame(() => t.setSelectionRange(s + ins.length, s + ins.length)); }
    else if (e.key === "}" ) { const ls = text.lastIndexOf("\n", s - 1) + 1; if (/^\s{2,}$/.test(text.slice(ls, s))) { e.preventDefault(); const ni = text.slice(ls, s).slice(2); setText(text.slice(0, ls) + ni + "}" + text.slice(en)); requestAnimationFrame(() => t.setSelectionRange(ls + ni.length + 1, ls + ni.length + 1)); } }
  };
  const track = () => { const t = ta.current!; const m = text.slice(0, t.selectionStart).match(/[A-Za-z_][\w.]*$/); setWord(m ? m[0] : ""); };
  const accept = (w: string) => { const t = ta.current!, s = t.selectionStart; setText(text.slice(0, s - word.length) + w + text.slice(s)); setWord(""); requestAnimationFrame(() => { t.focus(); t.setSelectionRange(s - word.length + w.length, s - word.length + w.length); }); };
  const re = useMemo(() => { try { return find ? new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), cs ? "g" : "gi") : null; } catch { return null; } }, [find, cs]);
  const matches = re ? (text.match(re) ?? []).length : 0;
  const findNext = () => { const t = ta.current; if (!t || !re) return; re.lastIndex = t.selectionEnd; const m = re.exec(text) ?? (() => { re.lastIndex = 0; return re.exec(text); })(); if (m) { t.focus(); t.setSelectionRange(m.index, m.index + m[0].length); } };
  const newFile = () => { const n = prompt("New file path (e.g. src/display.cpp, main.py, src/main.rs)"); if (!n) return; if (doc.code[n] !== undefined) return toast("File exists"); commit("New file " + n, (d) => ({ ...d, code: { ...d.code, [n]: n.endsWith(".py") ? "# MicroPython\nfrom machine import Pin, I2C\n\n" : n.endsWith(".rs") ? "// esp-hal / embedded Rust (build with cargo + espflash)\nfn main() {}\n" : "" } })); setCur(n); };
  const insertPins = () => {
    const { nets } = buildNets(doc.schematic, doc.customParts);
    const mcu = doc.schematic.parts.find((p) => ["esp32", "esp32dev", "pico"].includes(p.lib)); if (!mcu) return toast("No MCU in schematic");
    const lp = getElPart(mcu.lib, doc.customParts)!; const lines: string[] = [];
    lp.pins.forEach((pin, i) => { const n = nets.size && doc.schematic.labels[pinKey(mcu.id, i)]; const g = pin.name.match(/^GP(?:IO)?(\d+)$/); if (n && g) lines.push(`#define ${n.toUpperCase().replace(/\W/g, "_")} ${g[1]}`); });
    if (!lines.length) return toast("Label MCU pins in the schematic first (net labels)");
    setText(`// --- pins generated from schematic (${new Date().toISOString().slice(0, 10)}) ---\n${lines.join("\n")}\n\n` + text, false); toast(`Inserted ${lines.length} pin definitions`);
  };
  // serial monitor (Web Serial)
  const [log, setLog] = useState<string[]>([]);
  const [baud, setBaud] = useState(115200), [conn, setConn] = useState<string>("");
  const [filter, setFilter] = useState("");
  const portRef = useRef<{ port: unknown; writer?: WritableStreamDefaultWriter<string> } | null>(null);
  const serialOk = typeof navigator !== "undefined" && "serial" in navigator;
  const connect = async () => {
    try {
      const nav = navigator as unknown as { serial: { requestPort: () => Promise<{ open: (o: { baudRate: number }) => Promise<void>; readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }> } };
      const port = await nav.serial.requestPort(); await port.open({ baudRate: baud });
      setConn(`connected @${baud}`);
      const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable as unknown as WritableStream<Uint8Array>);
      const enc = new TextEncoderStream(); enc.readable.pipeTo(port.writable); portRef.current = { port, writer: enc.writable.getWriter() };
      const rd = dec.readable.getReader(); let buf = "";
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += value; const parts = buf.split("\n"); buf = parts.pop() ?? ""; if (parts.length) setLog((l) => [...l, ...parts.map((p) => `${new Date().toLocaleTimeString()}  ${p.replace(/\r$/, "")}`)].slice(-2000)); }
    } catch (e) { setConn(`error: ${(e as Error).message}`); }
  };
  useEffect(() => { if (pre.current && ta.current) { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; } });
  const ini = doc.code["platformio.ini"] ?? "";
  const toggleLib = (dep: string) => commit("Library " + dep, (d) => { const cur = d.code["platformio.ini"] ?? ""; const has = cur.includes(dep); let next = cur; if (has) next = cur.replace(new RegExp(`\\n?\\s*${dep.replace(/[.*+?^${}()|[\]\\@/ ]/g, (m) => "\\" + m)}`), ""); else if (/lib_deps\s*=/.test(cur)) next = cur.replace(/lib_deps\s*=/, `lib_deps =\n  ${dep}`); else next = cur.trimEnd() + `\nlib_deps =\n  ${dep}\n`; return { ...d, code: { ...d.code, "platformio.ini": next } }; });

  return (
    <div style={{ display: "flex", height: "100%", padding: 8 }}>
      <Resizable side="left" def={210} id="code-left">
        <Section title="Project files" right={<button className="btn" onClick={newFile}>+ file</button>}>
          {files.map((f) => <div key={f} className="row-hover" style={{ padding: "3px 6px", cursor: "pointer", background: f === file ? "color-mix(in srgb, var(--accent) 18%, transparent)" : undefined, display: "flex", justifyContent: "space-between" }} onClick={() => setCur(f)}>{f}{files.length > 1 && <span className="muted" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${f}?`)) commit("Delete file", (d) => { const c = { ...d.code }; delete c[f]; return { ...d, code: c }; }); }}>×</span>}</div>)}
        </Section>
        <Section title="Board configuration">
          <select className="input" value={doc.firmware.board} onChange={(e) => commit("Board", (d) => ({ ...d, firmware: { ...d.firmware, board: e.target.value }, code: { ...d.code, "platformio.ini": (d.code["platformio.ini"] ?? "").replace(/board\s*=\s*\S+/, `board = ${e.target.value}`) } }))}>{["esp32dev", "esp32-s3-devkitc-1", "pico", "esp32doit-devkit-v1"].map((b) => <option key={b}>{b}</option>)}</select>
          <label className="muted" style={{ display: "block", marginTop: 6 }}>Primary language</label>
          <select className="input" value={doc.firmware.lang} onChange={(e) => commit("Language", (d) => ({ ...d, firmware: { ...d.firmware, lang: e.target.value as "cpp" } }))}><option value="cpp">C / C++ (Arduino / ESP-IDF)</option><option value="python">Python (MicroPython)</option><option value="rust">Rust (esp-hal)</option></select>
        </Section>
        <Section title="Hardware link"><button className="btn" onClick={insertPins}>Insert pin #defines from schematic</button></Section>
      </Resizable>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", margin: "0 6px" }}>
        <div className="panel" style={{ padding: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <b>{file}</b>
          <input className="input" style={{ width: 130 }} placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findNext()} />
          <input className="input" style={{ width: 130 }} placeholder="Replace" value={repl} onChange={(e) => setRepl(e.target.value)} />
          <label><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Aa</label>
          <button className="btn" onClick={findNext}>Next ({matches})</button>
          <button className="btn" disabled={!re} onClick={() => re && setText(text.replace(re, repl), false)}>Replace all</button>
          <span style={{ marginLeft: "auto" }}>{sugg.map((s) => <button key={s} className="btn" style={{ marginLeft: 3, padding: "1px 6px" }} onClick={() => accept(s)}>{s}</button>)}</span>
        </div>
        <div className="panel" style={{ flex: 1, position: "relative", marginTop: 6, overflow: "hidden", display: "flex" }}>
          <div className="mono" style={{ padding: "8px 6px", textAlign: "right", color: "var(--muted)", fontSize: 12.5, lineHeight: "19px", background: "var(--panel2)", userSelect: "none", overflow: "hidden", minWidth: 36 }}>{text.split("\n").map((_, i) => <div key={i} style={{ color: problems.some((p) => p.line === i + 1) ? "var(--danger)" : undefined }}>{i + 1}</div>)}</div>
          <div style={{ position: "relative", flex: 1 }}>
            <pre ref={pre} className="mono" aria-hidden style={{ position: "absolute", inset: 0, margin: 0, padding: 8, fontSize: 12.5, lineHeight: "19px", overflow: "hidden", whiteSpace: "pre", pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: highlight(text, file) + "\n" }} />
            <textarea ref={ta} className="mono" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onKeyUp={track} onClick={track} onScroll={(e) => { if (pre.current) { pre.current.scrollTop = e.currentTarget.scrollTop; pre.current.scrollLeft = e.currentTarget.scrollLeft; } }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", color: "transparent", caretColor: "var(--text)", border: "none", outline: "none", resize: "none", padding: 8, fontSize: 12.5, lineHeight: "19px", whiteSpace: "pre", overflow: "auto" }} />
          </div>
        </div>
      </div>
      <Resizable side="right" def={380} id="code-right" min={260} max={720}>
        <Tabs tabs={[["problems", `Problems (${problems.length + fw.issues.length})`], ["pins", "Pin map"], ["libs", "Libraries"], ["serial", "Serial / log"], ["build", "Build"]]} value={tab} onChange={setTab} />
        {tab === "problems" && <Section title="Static checks (not a compiler)">
          {problems.map((p, i) => <div key={i} className="panel2 row-hover" style={{ padding: "4px 8px", margin: "3px 0" }}><span className={`sev-${p.sev}`}>{p.sev.toUpperCase()}</span> {file}:{p.line} — {p.msg}</div>)}
          <IssueList issues={fw.issues} />
          {!problems.length && !fw.issues.length && <div className="muted">No issues found by the implemented static checks. Compiler errors require a real toolchain.</div>}
        </Section>}
        {tab === "pins" && <Section title={`Firmware ↔ schematic (${fw.mcu ?? "no MCU"})`} right={<Prov kind="calc" />}>
          <table className="t"><thead><tr><th>Name</th><th>Code</th><th>Schematic pin</th><th /></tr></thead><tbody>{fw.links.map((l) => <tr key={l.name}><td>{l.name}</td><td className="mono">{l.codeValue ?? "—"}</td><td className="mono">{l.mcuPins.join(", ") || "—"}</td><td className={l.status === "ok" ? "sev-info" : "sev-error"}>{l.status}</td></tr>)}</tbody></table>
          <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Defined constants: {parseDefines(doc.code).length}. A mismatch between a GPIO number in code and the pin wired in the schematic is an error.</div>
        </Section>}
        {tab === "libs" && <Section title="Library manager (platformio.ini lib_deps)">{LIBS.map(([n, dep, d]) => <label key={n} style={{ display: "flex", gap: 6, padding: "3px 0" }}><input type="checkbox" checked={ini.includes(dep)} onChange={() => toggleLib(dep)} /><span><b>{n}</b> <span className="muted">{d}</span></span></label>)}<div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Edits platformio.ini only; libraries download when PlatformIO builds on your machine.</div></Section>}
        {tab === "serial" && <Section title="Serial monitor (Web Serial) & log viewer">
          {!serialOk ? <Unsupported title="Web Serial not available in this browser">Use Chrome/Edge over HTTPS or localhost with a device attached. Logs below stay empty until a real device connects — no fake data is generated.</Unsupported> : <div style={{ display: "flex", gap: 4 }}><select className="input" style={{ width: 100 }} value={baud} onChange={(e) => setBaud(Number(e.target.value))}>{[9600, 57600, 115200, 230400, 460800, 921600].map((b) => <option key={b}>{b}</option>)}</select><button className="btn btn-primary" onClick={connect}>Connect…</button><span className="muted">{conn}</span></div>}
          <div style={{ display: "flex", gap: 4, margin: "6px 0" }}><input className="input" placeholder="filter" value={filter} onChange={(e) => setFilter(e.target.value)} /><button className="btn" onClick={() => setLog([])}>Clear</button><button className="btn" onClick={() => download("serial.log", log.join("\n"))}>Save</button></div>
          <pre className="mono" style={{ background: "var(--bg)", padding: 6, height: 260, overflow: "auto", fontSize: 11 }}>{log.filter((l) => l.includes(filter)).join("\n") || "— no data —"}</pre>
          <input className="input" placeholder="Send line + Enter" disabled={!portRef.current} onKeyDown={(e) => { if (e.key === "Enter") { portRef.current?.writer?.write(e.currentTarget.value + "\n"); e.currentTarget.value = ""; } }} />
        </Section>}
        {tab === "build" && <Section title="Build & upload">
          <Unsupported title="Compile / upload are not available in the browser">No compiler or flashing tool can run in this web build. The desktop shell will invoke PlatformIO / Arduino CLI / ESP-IDF / MicroPython tools (mpremote) / cargo + espflash installed on your machine and stream their output into Problems and Log. We do not write our own compilers.</Unsupported>
          <div className="h-title" style={{ marginTop: 10 }}>Use today</div>
          <pre className="mono" style={{ background: "var(--bg)", padding: 6, fontSize: 11 }}>{`# after "Download project files" into a folder\npio run -e ${doc.firmware.board}\npio run -e ${doc.firmware.board} -t upload\npio device monitor -b 115200`}</pre>
          <button className="btn btn-primary" onClick={() => files.forEach((f) => download(f.replace(/\//g, "_"), doc.code[f]))}>Download project files</button>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Python → MicroPython; Rust → esp-hal. Language support depends on the board toolchain.</div>
        </Section>}
      </Resizable>
    </div>
  );
}
