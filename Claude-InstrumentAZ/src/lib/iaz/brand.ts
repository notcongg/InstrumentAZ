// InstrumentAZ brand: logo concepts (SVG source), exports (SVG / PNG / ICO), palette, typography.
export type Theme = "dark" | "light" | "mono";
export type Concept = 1 | 2 | 3;

export const PALETTE = [
  { name: "Resin Amber", hex: "#E8A33D", use: "Primary accent, active tools" },
  { name: "Brass Dark", hex: "#B86F0A", use: "Accent on light backgrounds" },
  { name: "Signal Cyan", hex: "#3DC2C0", use: "Electronics / data / info" },
  { name: "Workshop Ink", hex: "#0C1016", use: "Dark background" },
  { name: "Panel Slate", hex: "#141A23", use: "Dark panels" },
  { name: "Paper", hex: "#EEF1F5", use: "Light background" },
  { name: "Alert Red", hex: "#F0524F", use: "Errors, unsupported" },
  { name: "Caution", hex: "#E3A72F", use: "Warnings, approximate results" },
  { name: "Verified Green", hex: "#3FB27F", use: "Validated / OK" },
];
export const TYPOGRAPHY = [
  { role: "UI & headings", font: "Inter / Segoe UI (system fallback)", note: "Weights 400/600/700; 13 px base, scales on high-DPI." },
  { role: "Numbers, code, units", font: "Cascadia Code / Consolas / ui-monospace", note: "Tabular figures for parameters and measurements." },
  { role: "Wordmark", font: "Inter 700, tracking −0.5 %, 'AZ' in accent colour", note: "Never stretch; minimum 96 px wide." },
];

function colors(t: Theme) {
  return t === "dark" ? { bg: "#0C1016", a: "#E8A33D", b: "#3DC2C0", ink: "#E6EDF3" } : t === "light" ? { bg: "#FFFFFF", a: "#B86F0A", b: "#0F8F8D", ink: "#18202C" } : { bg: "none", a: "#000000", b: "#000000", ink: "#000000" };
}
const BODY = "M50 36 C62 36 72 38 72 49 C72 57 62 59 62 64 C62 68 77 70 77 80 C77 90 64 95 50 95 C36 95 23 90 23 80 C23 70 38 68 38 64 C38 59 28 57 28 49 C28 38 38 36 50 36 Z";

/** Icon only (viewBox 100×100). */
export function iconSvg(concept: Concept, t: Theme, size = 100, rounded = true): string {
  const c = colors(t);
  const bg = c.bg === "none" ? "" : `<rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="${c.bg}"/>`;
  let g = "";
  if (concept === 1) {
    // Resonance: violin silhouette with a sine wave
    g = `<path d="${BODY}" fill="none" stroke="${c.a}" stroke-width="4"/><rect x="47" y="13" width="6" height="23" rx="2" fill="${c.a}"/><circle cx="50" cy="11" r="6" fill="none" stroke="${c.a}" stroke-width="4"/>` +
      `<path d="M27 66 C34 52 40 52 46 66 S58 80 64 66 S72 56 75 64" fill="none" stroke="${c.b}" stroke-width="4" stroke-linecap="round"/>`;
  } else if (concept === 2) {
    // AZ monogram built from strokes, f-hole accents
    g = `<path d="M16 82 L36 20 L56 82 M24 60 H48" fill="none" stroke="${c.a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M60 24 H86 L60 80 H88" fill="none" stroke="${c.b}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M46 20 q-5 8 0 16 M50 20 q5 8 0 16" fill="none" stroke="${c.a}" stroke-width="0"/>`;
  } else {
    // Circuit scroll: scroll spiral drawn as a PCB trace with a pad and via
    let d = "M50 92 V60";
    d += " C50 40 74 36 74 22 C74 8 52 8 52 22 C52 31 64 32 64 24";
    g = `<path d="${d}" fill="none" stroke="${c.a}" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M50 92 H30 L22 84 V58 M50 78 H72 L80 70 V54" fill="none" stroke="${c.b}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="50" cy="92" r="4.5" fill="${c.a}"/><circle cx="22" cy="54" r="5" fill="none" stroke="${c.b}" stroke-width="3.5"/><circle cx="80" cy="50" r="5" fill="none" stroke="${c.b}" stroke-width="3.5"/>` +
      `<circle cx="64" cy="24" r="3" fill="${c.b}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${bg}${g}</svg>`;
}
/** Primary logo: icon above wordmark. */
export function primarySvg(concept: Concept, t: Theme): string {
  const c = colors(t);
  const inner = iconSvg(concept, t, 160, true).replace(/<svg[^>]*>|<\/svg>/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 260" width="320" height="260">${c.bg === "none" ? "" : `<rect width="320" height="260" fill="${c.bg}" opacity="0"/>`}<g transform="translate(80 0) scale(1.6)">${inner}</g><text x="160" y="232" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="700" font-size="42" letter-spacing="-0.5" fill="${c.ink}">Instrument<tspan fill="${c.a}">AZ</tspan></text></svg>`;
}
/** Horizontal logo. */
export function horizontalSvg(concept: Concept, t: Theme): string {
  const c = colors(t);
  const inner = iconSvg(concept, t, 100, true).replace(/<svg[^>]*>|<\/svg>/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" width="420" height="100"><g>${inner}</g><text x="118" y="64" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="700" font-size="46" letter-spacing="-0.5" fill="${c.ink}">Instrument<tspan fill="${c.a}">AZ</tspan></text></svg>`;
}
export function splashSvg(concept: Concept = 1): string {
  const inner = iconSvg(concept, "dark", 100, true).replace(/<svg[^>]*>|<\/svg>/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0C1016"/><stop offset="1" stop-color="#1A2230"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>` +
    Array.from({ length: 16 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="360" stroke="#243044" stroke-width="0.5"/>`).join("") +
    `<g transform="translate(220 60) scale(2)">${inner}</g><text x="320" y="290" text-anchor="middle" font-family="Inter, Segoe UI, Arial" font-weight="700" font-size="40" fill="#E6EDF3">Instrument<tspan fill="#E8A33D">AZ</tspan></text><text x="320" y="318" text-anchor="middle" font-family="Inter, Segoe UI, Arial" font-size="13" fill="#8A97AA">Connect imagination, engineering and real-world creation</text></svg>`;
}

export function svgToPng(svg: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d")!; x.drawImage(img, 0, 0, w, h); c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"); };
    img.onerror = () => reject(new Error("SVG render failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
/** Build a Windows .ico (PNG-compressed entries, Vista+). */
export async function buildIco(concept: Concept, theme: Theme, sizes = [16, 32, 48, 64, 128, 256]): Promise<Blob> {
  const pngs = await Promise.all(sizes.map(async (s) => new Uint8Array(await (await svgToPng(iconSvg(concept, theme, s), s, s)).arrayBuffer())));
  const head = new Uint8Array(6 + 16 * sizes.length);
  const dv = new DataView(head.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, sizes.length, true);
  let off = head.length;
  sizes.forEach((s, i) => { const o = 6 + i * 16; head[o] = s >= 256 ? 0 : s; head[o + 1] = s >= 256 ? 0 : s; head[o + 2] = 0; head[o + 3] = 0; dv.setUint16(o + 4, 1, true); dv.setUint16(o + 6, 32, true); dv.setUint32(o + 8, pngs[i].length, true); dv.setUint32(o + 12, off, true); off += pngs[i].length; });
  return new Blob([head, ...pngs], { type: "image/x-icon" });
}
