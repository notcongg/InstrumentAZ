"use client";
// WebGL (three.js) viewport: orbit/pan/zoom, perspective/orthographic, display modes, picking of
// object/face/edge/vertex, transform gizmo, grid snapping and measurement tools.
// Renderer backend here is WebGL; the product specification asks for Direct3D 12 on the native Windows build.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { BuiltModel, WireSeg } from "@/lib/iaz/geometry";

export type Display = "shaded" | "solid" | "wire" | "xray" | "edges";
export type Tool = "select" | "move" | "rotate" | "scale" | "measure";
export type SelMode = "object" | "face" | "edge" | "vertex";
export interface VPProps {
  model: BuiltModel; wires: WireSeg[]; showWires: boolean; display: Display; ortho: boolean; showGrid: boolean; snap: number;
  tool: Tool; selMode: SelMode; measureKind: "distance" | "angle" | "radius"; selected: string | null;
  onSelect: (id: string | null) => void; onTransform: (id: string, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) => void;
  onMeasure: (msg: string) => void; viewCmd: { name: string; n: number };
}

interface S {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; persp: THREE.PerspectiveCamera; ortho: THREE.OrthographicCamera; cam: THREE.Camera;
  controls: OrbitControls; tc: TransformControls; grid: THREE.GridHelper; overlay: THREE.Group; wireGroup: THREE.Group; modelRoot: THREE.Group | null;
  invalidate: () => void; measure: THREE.Vector3[]; dragging: boolean; fitted: boolean;
}

export default function Viewport3D(p: VPProps) {
  const host = useRef<HTMLDivElement>(null);
  const S = useRef<S | null>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const css = getComputedStyle(document.documentElement);
    scene.background = new THREE.Color(css.getPropertyValue("--bg").trim() || "#0c1016");
    const persp = new THREE.PerspectiveCamera(35, 1, 1, 6000);
    persp.position.set(520, 380, -320);
    const ortho = new THREE.OrthographicCamera(-300, 300, 300, -300, -6000, 6000);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.target.set(0, 0, 220);
    controls.enableDamping = false;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.9);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(300, 700, -200); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -400, right: 400, top: 500, bottom: -300, near: 1, far: 2000 });
    const fill = new THREE.DirectionalLight(0x88aaff, 0.6); fill.position.set(-400, 200, 400);
    scene.add(hemi, sun, fill);
    const grid = new THREE.GridHelper(1200, 60, 0x556070, 0x2a3444);
    grid.position.y = -40;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(120));
    const tc = new TransformControls(persp, renderer.domElement);
    const helper = tc.getHelper();
    helper.visible = false;
    scene.add(helper);
    const overlay = new THREE.Group(), wireGroup = new THREE.Group();
    scene.add(overlay, wireGroup);
    let raf = 0, need = true;
    const invalidate = () => { need = true; };
    const s: S = { renderer, scene, persp, ortho, cam: persp, controls, tc, grid, overlay, wireGroup, modelRoot: null, invalidate, measure: [], dragging: false, fitted: false };
    S.current = s;
    const loop = () => { raf = requestAnimationFrame(loop); if (need) { need = false; renderer.render(scene, s.cam); } };
    loop();
    controls.addEventListener("change", invalidate);
    tc.addEventListener("change", invalidate);
    tc.addEventListener("dragging-changed", (e) => {
      s.dragging = !!(e as unknown as { value: boolean }).value;
      controls.enabled = !s.dragging;
      if (!s.dragging && tc.object) {
        const o = tc.object, id = o.userData.instId as string;
        if (id) props.current.onTransform(id, [o.position.x, o.position.y, o.position.z], [(o.rotation.x * 180) / Math.PI, (o.rotation.y * 180) / Math.PI, (o.rotation.z * 180) / Math.PI], [o.scale.x, o.scale.y, o.scale.z]);
      }
    });
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      persp.aspect = w / h; persp.updateProjectionMatrix();
      const k = h / w, half = (ortho.userData.half as number) || 300;
      ortho.left = -half; ortho.right = half; ortho.top = half * k; ortho.bottom = -half * k; ortho.updateProjectionMatrix();
      invalidate();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // picking
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down: [number, number] | null = null;
    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || s.dragging) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if (moved > 4 || e.button !== 0) return;
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, s.cam);
      const pr = props.current;
      const hits = s.modelRoot ? ray.intersectObject(s.modelRoot, true).filter((h) => { let o: THREE.Object3D | null = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return (h.object as THREE.Mesh).isMesh && !(h.object as THREE.Mesh).userData.edge; }) : [];
      const hit = hits[0];
      if (pr.tool === "measure") {
        if (!hit) return;
        s.measure.push(hit.point.clone());
        const need2 = pr.measureKind === "distance" ? 2 : 3;
        drawMeasure(s);
        if (s.measure.length >= need2) {
          const [a, b, c] = s.measure;
          let msg = "";
          if (pr.measureKind === "distance") msg = `Distance: ${a.distanceTo(b).toFixed(3)} mm  (Δx ${(b.x - a.x).toFixed(2)}, Δy ${(b.y - a.y).toFixed(2)}, Δz ${(b.z - a.z).toFixed(2)})`;
          else if (pr.measureKind === "angle") { const u = a.clone().sub(b).normalize(), w = c.clone().sub(b).normalize(); msg = `Angle at point 2: ${((Math.acos(Math.max(-1, Math.min(1, u.dot(w)))) * 180) / Math.PI).toFixed(2)}°`; }
          else { const ab = b.distanceTo(c), bc = a.distanceTo(c), ca = a.distanceTo(b), area = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2; msg = area < 1e-6 ? "Points are collinear: no circle" : `Radius of circle through 3 points: ${((ab * bc * ca) / (4 * area)).toFixed(3)} mm`; }
          pr.onMeasure(msg + "  [calculated from display mesh, not exact B-rep]");
          s.measure = [];
          setTimeout(() => { clearGroup(s.overlay); s.invalidate(); }, 2500);
        } else pr.onMeasure(`Pick ${need2 - s.measure.length} more point(s)…`);
        return;
      }
      if (!hit) { pr.onSelect(null); clearGroup(s.overlay); s.invalidate(); return; }
      let o: THREE.Object3D | null = hit.object, id: string | null = null;
      while (o) { if (o.userData.instId) { id = o.userData.instId; break; } o = o.parent; }
      pr.onSelect(id);
      clearGroup(s.overlay);
      if (pr.selMode !== "object" && hit.face) {
        const m = hit.object as THREE.Mesh, pos = m.geometry.attributes.position;
        const vs = [hit.face.a, hit.face.b, hit.face.c].map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
        const col = 0xe8a33d;
        if (pr.selMode === "face") {
          const g = new THREE.BufferGeometry().setFromPoints(vs);
          s.overlay.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.7 })));
          const area = new THREE.Vector3().subVectors(vs[1], vs[0]).cross(new THREE.Vector3().subVectors(vs[2], vs[0])).length() / 2;
          pr.onMeasure(`Face (triangle of display mesh): area ${area.toFixed(2)} mm², normal ${hit.face.normal.toArray().map((x) => x.toFixed(2)).join(", ")}`);
        } else if (pr.selMode === "vertex") {
          const v = vs.reduce((b, c) => (c.distanceTo(hit.point) < b.distanceTo(hit.point) ? c : b));
          const sp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
          sp.position.copy(v); s.overlay.add(sp);
          pr.onMeasure(`Vertex: (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}) mm`);
        } else {
          let best: [THREE.Vector3, THREE.Vector3] = [vs[0], vs[1]], bd = Infinity;
          for (const [a, b] of [[vs[0], vs[1]], [vs[1], vs[2]], [vs[2], vs[0]]] as [THREE.Vector3, THREE.Vector3][]) { const l = new THREE.Line3(a, b), cp = new THREE.Vector3(); l.closestPointToPoint(hit.point, true, cp); const d = cp.distanceTo(hit.point); if (d < bd) { bd = d; best = [a, b]; } }
          s.overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(best), new THREE.LineBasicMaterial({ color: col, depthTest: false })));
          pr.onMeasure(`Edge length: ${best[0].distanceTo(best[1]).toFixed(3)} mm (display-mesh edge)`);
        }
      }
      s.invalidate();
    };
    dom.addEventListener("pointerdown", onDown); dom.addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); dom.removeEventListener("pointerdown", onDown); dom.removeEventListener("pointerup", onUp);
      controls.dispose(); tc.dispose(); renderer.dispose(); el.removeChild(dom); S.current = null;
    };
  }, []);

  // model swap
  useEffect(() => {
    const s = S.current; if (!s) return;
    if (s.modelRoot) { s.scene.remove(s.modelRoot); s.modelRoot.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); } }); }
    s.modelRoot = p.model.root;
    s.scene.add(p.model.root);
    if (!s.fitted) { fit(s, "iso"); s.fitted = true; }
    applyDisplay(s, p.display);
    highlight(s, p.selected, p.model);
    attach(s, p);
    s.invalidate();
  }, [p.model]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const s = S.current; if (!s) return; applyDisplay(s, p.display); s.invalidate(); }, [p.display, p.model]);
  useEffect(() => { const s = S.current; if (!s) return; s.grid.visible = p.showGrid; s.invalidate(); }, [p.showGrid]);
  useEffect(() => {
    const s = S.current; if (!s) return;
    const el = host.current!;
    const target = s.controls.target.clone();
    const from = s.cam as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const next = p.ortho ? s.ortho : s.persp;
    if (next !== from) {
      next.position.copy(from.position); next.quaternion.copy(from.quaternion);
      const dist = from.position.distanceTo(target);
      if (p.ortho) { s.ortho.userData.half = Math.tan((s.persp.fov * Math.PI) / 360) * dist; const k = el.clientHeight / el.clientWidth, h = s.ortho.userData.half as number; s.ortho.left = -h; s.ortho.right = h; s.ortho.top = h * k; s.ortho.bottom = -h * k; s.ortho.zoom = 1; s.ortho.updateProjectionMatrix(); }
      s.cam = next; s.controls.object = next; s.tc.camera = next; s.controls.update();
    }
    s.invalidate();
  }, [p.ortho]);
  useEffect(() => { const s = S.current; if (s) { highlight(s, p.selected, p.model); attach(s, p); s.invalidate(); } }, [p.selected, p.tool, p.snap, p.model]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const s = S.current; if (s) { s.measure = []; clearGroup(s.overlay); s.invalidate(); } }, [p.tool, p.measureKind, p.selMode]);
  useEffect(() => {
    const s = S.current; if (!s) return;
    clearGroup(s.wireGroup);
    if (p.showWires) p.wires.forEach((w) => { s.wireGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([w.a, w.b]), w.kind === "cable" ? new THREE.LineDashedMaterial({ color: w.net === "0" ? 0xffffff : 0xff5577, dashSize: 4, gapSize: 2 }) : new THREE.LineBasicMaterial({ color: 0x33ff99 }))); });
    s.wireGroup.children.forEach((c) => (c as THREE.Line).computeLineDistances());
    s.invalidate();
  }, [p.wires, p.showWires]);
  useEffect(() => { const s = S.current; if (s && p.viewCmd.n) { fit(s, p.viewCmd.name); s.invalidate(); } }, [p.viewCmd]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}

function clearGroup(g: THREE.Group) { while (g.children.length) { const c = g.children[0]; g.remove(c); const m = c as THREE.Mesh; m.geometry?.dispose(); } }
function drawMeasure(s: S) {
  clearGroup(s.overlay);
  s.measure.forEach((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3dc2c0, depthTest: false })); m.position.copy(p); s.overlay.add(m); });
  if (s.measure.length > 1) s.overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(s.measure), new THREE.LineBasicMaterial({ color: 0x3dc2c0, depthTest: false })));
  s.invalidate();
}
function fit(s: S, name: string) {
  if (!s.modelRoot) return;
  const box = new THREE.Box3().setFromObject(s.modelRoot), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 1.1 + 100;
  const dirs: Record<string, [number, number, number]> = { top: [0, 1, 0.0001], front: [0, 0.0001, -1], side: [1, 0.0001, 0], iso: [0.8, 0.6, -0.5], fit: [0.8, 0.6, -0.5] };
  const d = new THREE.Vector3(...(dirs[name] ?? dirs.iso)).normalize();
  s.cam.up.set(0, 1, 0);
  if (name === "top") s.cam.up.set(0, 0, 1);
  s.controls.target.copy(c);
  s.cam.position.copy(c).addScaledVector(d, r * 1.3);
  if ((s.cam as THREE.OrthographicCamera).isOrthographicCamera) { const oc = s.cam as THREE.OrthographicCamera; oc.zoom = 1; oc.userData.half = r * 0.55; const k = (oc.top - oc.bottom) / (oc.right - oc.left) || 0.6; oc.left = -r * 0.55; oc.right = r * 0.55; oc.top = r * 0.55 * k; oc.bottom = -r * 0.55 * k; oc.updateProjectionMatrix(); }
  s.cam.lookAt(c);
  s.controls.update();
}
function applyDisplay(s: S, mode: Display) {
  s.modelRoot?.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.edge) return;
    const mat = m.material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
    if (mat.type === "MeshBasicMaterial") return;
    mat.wireframe = mode === "wire";
    mat.transparent = mode === "xray"; mat.opacity = mode === "xray" ? 0.3 : 1; mat.depthWrite = mode !== "xray";
    mat.flatShading = mode === "solid"; mat.roughness = mode === "solid" ? 1 : mat.roughness; mat.needsUpdate = true;
    const old = m.children.find((c) => c.userData.edge);
    if (old) m.remove(old);
    if (mode === "edges") { const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), new THREE.LineBasicMaterial({ color: 0x000000 })); l.userData.edge = true; m.add(l); }
  });
}
function highlight(s: S, id: string | null, model: BuiltModel) {
  Object.values(model.groups).forEach((g) => g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshStandardMaterial).emissive) { const mt = m.material as THREE.MeshStandardMaterial; mt.emissive.set(0x000000); } }));
  if (!id) return;
  const g = Object.values(model.groups).find((x) => x.userData.instId === id);
  g?.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshStandardMaterial).emissive) (m.material as THREE.MeshStandardMaterial).emissive.set(0x7a4a00); });
}
function attach(s: S, p: VPProps) {
  const helper = s.tc.getHelper();
  const g = p.selected ? Object.values(p.model.groups).find((x) => x.userData.instId === p.selected) : undefined;
  const mode = p.tool === "move" ? "translate" : p.tool === "rotate" ? "rotate" : p.tool === "scale" ? "scale" : null;
  if (g && mode && g.visible) {
    s.tc.attach(g); s.tc.setMode(mode); s.tc.setTranslationSnap(p.snap > 0 ? p.snap : null); s.tc.setRotationSnap(p.snap > 0 ? (15 * Math.PI) / 180 : null); s.tc.setScaleSnap(p.snap > 0 ? 0.05 : null);
    helper.visible = true; s.tc.camera = s.cam;
  } else { s.tc.detach(); helper.visible = false; }
}
