// Procedural audio engine. No samples, no soundfonts: everything is computed from the parameter model.
// ALL results are APPROXIMATE (heuristic bow model + scaling-law body modes) and not validated.
export interface Mode { name: string; f: number; amp: number; q: number }
type Vals = Record<string, number>;

const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export function noteName(freq: number): { name: string; cents: number } {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const r = Math.round(midi);
  return { name: NOTES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: (midi - r) * 100 };
}

export function bodyModes(v: Vals): Mode[] {
  const q = v["ac.Q"];
  return [
    { name: "A0 (air)", f: v["ac.A0"], amp: 1.0, q: q * 0.6 },
    { name: "CBR", f: v["ac.CBR"], amp: 0.45, q },
    { name: "B1−", f: v["ac.B1m"], amp: 0.9, q },
    { name: "B1+", f: v["ac.B1p"], amp: 1.0, q },
    { name: "Bridge hill", f: v["ac.bridgeHill"], amp: 0.8, q: 2.5 },
  ];
}

/** Complex body transfer function (force at bridge → radiated pressure, relative). */
export function bodyResponse(modes: Mode[], f: number): [number, number] {
  let re = 0.12, im = 0;
  for (const m of modes) {
    const x = f / m.f - m.f / f;
    const d = 1 + m.q * m.q * x * x;
    re += (m.amp * 0.35) / d;
    im += (-m.amp * 0.35 * m.q * x) / d;
  }
  // 1st-order high pass (weak radiation below A0)
  const w = f / 170, dd = 1 + w * w;
  const hr = (w * w) / dd, hi = w / dd;
  return [re * hr - im * hi, re * hi + im * hr];
}
export const bodyMagDb = (modes: Mode[], f: number) => { const [r, i] = bodyResponse(modes, f); return 20 * Math.log10(Math.hypot(r, i) + 1e-9); };

class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  static lowpass(fc: number, fs: number, q = 0.707) { return Biquad.make("lp", fc, fs, q); }
  static highpass(fc: number, fs: number, q = 0.707) { return Biquad.make("hp", fc, fs, q); }
  static make(t: "lp" | "hp", fc: number, fs: number, q: number) {
    const b = new Biquad();
    const w = (2 * Math.PI * Math.min(fc, fs * 0.45)) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    if (t === "lp") { b.b0 = (1 - c) / 2 / a0; b.b1 = (1 - c) / a0; b.b2 = b.b0; } else { b.b0 = (1 + c) / 2 / a0; b.b1 = -(1 + c) / a0; b.b2 = b.b0; }
    b.a1 = (-2 * c) / a0; b.a2 = (1 - al) / a0;
    return b;
  }
  p(x: number) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

export interface AudioOptions {
  duration: number; fs: number; chain: "acoustic" | "pickup"; dspLpf: number; delayMs: number; delayMix: number; speaker: boolean;
}
export const DEFAULT_AUDIO: AudioOptions = { duration: 1.6, fs: 44100, chain: "acoustic", dspLpf: 12000, delayMs: 180, delayMix: 0, speaker: true };

export interface AudioResult {
  samples: Float32Array; fs: number; f0: number; partials: { n: number; f: number; amp: number }[];
  stats: { peak: number; rms: number; preClipPct: number; ampClipPct: number; levelDb: number };
  notes: string[]; bowRegime: "surface sound" | "Helmholtz (clean)" | "raucous";
}

/** Render one sustained bowed note through the selected signal chain. */
export function renderTone(v: Vals, opt: AudioOptions): AudioResult {
  const fs = opt.fs, N = Math.floor(opt.duration * fs);
  const f0 = v["play.freq"], L = v["geom.vibLength"], beta = v["bow.beta"];
  const nMax = Math.max(1, Math.min(60, Math.floor((fs * 0.45) / f0)));
  const force = v["bow.force"], fmin = v["play.minForce"], fmax = v["play.maxForce"];
  const regime: AudioResult["bowRegime"] = force < fmin ? "surface sound" : force > fmax ? "raucous" : "Helmholtz (clean)";
  const notes: string[] = [];
  if (regime !== "Helmholtz (clean)") notes.push(`Bow force ${force.toFixed(2)} N is outside the estimated Schelleng window ${fmin.toFixed(2)}–${fmax.toFixed(2)} N → ${regime}.`);
  const tilt = 1 + 0.5 * (1 - Math.min(1, force / Math.max(fmax, 1e-6)));
  const modes = bodyModes(v);
  const pickupMag = opt.chain === "pickup" && v["el.pickup.type"] > 0.5;
  const dist = v["el.pickup.dist"];
  const partials: { n: number; f: number; amp: number; ph: number }[] = [];
  for (let n = 1; n <= nMax; n++) {
    const f = n * f0;
    let a = Math.pow(n, -tilt);
    if (opt.chain === "acoustic") { const [r, i] = bodyResponse(modes, f); a *= Math.hypot(r, i); partials.push({ n, f, amp: a, ph: Math.atan2(i, r) }); }
    else {
      if (pickupMag) a *= Math.abs(Math.sin((n * Math.PI * dist) / L)); // string-sensing pickup comb filter
      else { const w = f / 60; a *= w / Math.sqrt(1 + w * w); } // piezo into 1 MΩ: ~60 Hz high-pass (assumed 2.6 nF)
      partials.push({ n, f, amp: a, ph: 0 });
    }
  }
  const level = Math.min(2, (v["bow.speed"] / Math.max(beta, 0.02)) / (0.3 / 0.12));
  const noiseAmp = regime === "surface sound" ? 0.25 * (1 - force / Math.max(fmin, 1e-6)) : regime === "raucous" ? 0.2 * Math.min(1, (force - fmax) / fmax) : 0.01;
  const out = new Float32Array(N);
  const sign = v["bow.dir"] > 0.5 ? -1 : 1;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  const rawBuf = new Float64Array(N);
  const att = 0.06 * fs, rel = 0.15 * fs;
  const w0 = (2 * Math.PI) / fs;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = 0; k < partials.length; k++) { const p = partials[k]; s += p.amp * Math.sin(w0 * p.f * i + p.ph * (opt.chain === "acoustic" ? 1 : 0)); }
    const env = Math.min(1, i / att) * Math.min(1, (N - i) / rel);
    rawBuf[i] = sign * (s + noiseAmp * rnd() * 6) * env;
  }
  // normalise raw string/body signal to a physical-ish level
  let mx = 1e-9;
  for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(rawBuf[i]));
  let preClip = 0, ampClip = 0;
  const lpf = Biquad.lowpass(opt.dspLpf, fs);
  const spk1 = Biquad.highpass(320, fs, 0.9);
  const delaySamples = Math.max(1, Math.floor((opt.delayMs / 1000) * fs));
  const dbuf = new Float64Array(delaySamples);
  let di = 0;
  const gainLin = Math.pow(10, v["el.preamp.gain"] / 20);
  const vrail = v["el.battery.v"] / 2;
  const vOutMax = Math.min(Math.sqrt(2 * v["el.amp.power"] * 8), v["el.battery.v"]);
  for (let i = 0; i < N; i++) {
    let x = (rawBuf[i] / mx) * level;
    if (opt.chain === "pickup") {
      const vin = x * (pickupMag ? 0.05 : 0.08); // assumed open-circuit pickup level: 50-80 mV peak
      let vp = vin * gainLin;
      if (Math.abs(vp) > vrail * 0.95) preClip++;
      vp = vrail * 0.95 * Math.tanh(vp / (vrail * 0.95));
      x = lpf.p(vp);
      const wet = dbuf[di];
      dbuf[di] = x + wet * 0.4;
      di = (di + 1) % delaySamples;
      x = x * (1 - opt.delayMix) + wet * opt.delayMix;
      let va = x * 3; // fixed amplifier voltage gain assumed 3 V/V
      if (opt.speaker) va = spk1.p(va);
      if (Math.abs(va) > vOutMax * 0.97) ampClip++;
      x = (vOutMax * Math.tanh(va / vOutMax)) / vOutMax;
    } else {
      x = lpf.p(x);
      const wet = dbuf[di];
      dbuf[di] = x + wet * 0.4;
      di = (di + 1) % delaySamples;
      x = x * (1 - opt.delayMix) + wet * opt.delayMix;
    }
    out[i] = x;
  }
  let peak = 1e-9, sq = 0;
  for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(out[i])); sq += out[i] * out[i]; }
  const scale = peak > 0.9 ? 0.9 / peak : 1;
  if (scale !== 1) for (let i = 0; i < N; i++) out[i] *= scale;
  const preClipPct = (100 * preClip) / N, ampClipPct = (100 * ampClip) / N;
  if (preClipPct > 1) notes.push(`Preamp clips ${preClipPct.toFixed(1)}% of samples at ${v["el.preamp.gain"]} dB gain (rail ±${vrail.toFixed(2)} V).`);
  if (ampClipPct > 1) notes.push(`Amplifier clips ${ampClipPct.toFixed(1)}% of samples (rated ${v["el.amp.power"]} W into 8 Ω).`);
  if (pickupMag) notes.push(`Magnetic pickup at ${dist} mm from the bridge nulls harmonics where n·d/L is an integer.`);
  if (opt.chain === "pickup" && !pickupMag) notes.push("Piezo pickup senses bridge force; body radiation is NOT included in the pickup signal in this model.");
  const maxP = Math.max(...partials.map((p) => p.amp), 1e-9);
  return { samples: out, fs, f0, partials: partials.map((p) => ({ n: p.n, f: p.f, amp: p.amp / maxP })), stats: { peak: peak * scale, rms: Math.sqrt(sq / N) * scale, preClipPct, ampClipPct, levelDb: 20 * Math.log10(Math.sqrt(sq / N) * scale + 1e-9) }, notes, bowRegime: regime };
}

export function fftMagDb(samples: Float32Array, N = 8192): { f: (fs: number) => number[]; db: number[] } {
  const start = Math.max(0, Math.floor(samples.length / 2 - N / 2));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (samples[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + xr; im[i + k] = ui + xi; re[i + k + len / 2] = ur - xr; im[i + k + len / 2] = ui - xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const half = N / 2, db: number[] = [];
  for (let i = 0; i < half; i++) db.push(20 * Math.log10(Math.hypot(re[i], im[i]) / N + 1e-9));
  return { f: (fs: number) => Array.from({ length: half }, (_, i) => (i * fs) / N), db };
}

/** Helmholtz-motion string shape for visualisation (VISUAL representation, not a simulation). */
export function stringShape(x: number, t: number, f0: number, beta: number, nTerms = 40): number {
  let y = 0;
  for (let n = 1; n <= nTerms; n++) y += (Math.sin(n * Math.PI * beta) / (n * n)) * Math.sin(n * Math.PI * x) * Math.cos(2 * Math.PI * n * f0 * t);
  return y / (Math.sin(Math.PI * beta) + 0.15);
}
