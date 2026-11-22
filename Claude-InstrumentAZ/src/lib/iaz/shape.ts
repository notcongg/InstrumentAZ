// Pure 2D geometry helpers (no three.js) shared by the parameter engine and the CAD view.
export type V2 = [number, number];

export interface OutlineParams {
  bodyLength: number;
  upperBout: number;
  lowerBout: number;
  cBout: number;
}

/** Closed Catmull-Rom spline through control points. */
export function catmullClosed(pts: V2[], samples = 10): V2[] {
  const n = pts.length;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Violin outline in (x, z) mm. z=0 at the tail, z=bodyLength at the neck block. */
export function violinOutline(p: OutlineParams): V2[] {
  const L = p.bodyLength, lb = p.lowerBout / 2, ub = p.upperBout / 2, cb = p.cBout / 2;
  const right: V2[] = [
    [lb * 0.5, 0.03 * L],
    [lb * 0.84, 0.1 * L],
    [lb, 0.2 * L],
    [lb * 0.94, 0.32 * L],
    [cb + 0.25 * (lb - cb), 0.42 * L],
    [cb, 0.5 * L],
    [cb + 0.3 * (ub - cb), 0.58 * L],
    [ub * 0.97, 0.68 * L],
    [ub, 0.77 * L],
    [ub * 0.82, 0.88 * L],
    [ub * 0.5, 0.96 * L],
  ];
  const ctrl: V2[] = [[0, 0], ...right, [0, L], ...right.slice().reverse().map(([x, z]) => [-x, z] as V2)];
  return catmullClosed(ctrl, 8);
}

export function polygonArea(pts: V2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Offset polygon inward by d (mm). Works for simple convex-ish outlines. */
export function offsetPolygon(pts: V2[], d: number): V2[] {
  const sign = polygonArea(pts) > 0 ? 1 : -1; // CCW => inward normal is left of edge
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [p[0] + (-ty / len) * d * sign, p[1] + (tx / len) * d * sign] as V2;
  });
}

export function pointInPolygon(pt: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Simplified f-hole polygon (right-hand side, mirror for left). Centre of f-hole at (0, zc). */
export function fholePolygon(lengthMm: number, sepMm: number, zc: number, side: 1 | -1): V2[] {
  const N = 28;
  const left: V2[] = [], rightSide: V2[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N; // 0 = lower eye, 1 = upper eye
    const z = zc + (s - 0.5) * lengthMm;
    const x = sepMm / 2 + 8 * (1 - s) + 2.5 * Math.sin(2 * Math.PI * s);
    const w = 1.1 + 2.3 * (Math.exp(-Math.pow(s / 0.08, 2)) + Math.exp(-Math.pow((1 - s) / 0.08, 2)) * 0.8);
    left.push([side * (x - w), z]);
    rightSide.push([side * (x + w), z]);
  }
  return [...left, ...rightSide.reverse()];
}

export function fholeAreaMm2(lengthMm: number, sepMm: number): number {
  return Math.abs(polygonArea(fholePolygon(lengthMm, sepMm, 0, 1)));
}

/** Max |x| of the outline at height z (linear interpolation along edges). */
export function halfWidthAt(poly: V2[], z: number): number {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    if ((z1 - z) * (z2 - z) <= 0 && z1 !== z2) {
      const t = (z - z1) / (z2 - z1);
      best = Math.max(best, Math.abs(x1 + t * (x2 - x1)));
    }
  }
  return best;
}
