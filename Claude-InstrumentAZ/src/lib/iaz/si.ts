// SI-prefix helpers for component values.
const P: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
export function parseSI(s: string): number | null {
  const m = s.trim().replace(/[ΩFHVAΩohms]+$/i, "").match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*([pnuµmkKMG]?)$/);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? P[m[2]] : 1);
}
export function formatSI(v: number, unit = ""): string {
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v), tbl: [number, string][] = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const [f, p] = tbl.find(([x]) => a >= x * 0.9999) ?? tbl[tbl.length - 1];
  return `${Number((v / f).toPrecision(4))} ${p}${unit}`;
}
