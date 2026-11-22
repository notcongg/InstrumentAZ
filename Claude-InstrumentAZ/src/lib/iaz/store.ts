"use client";
// Application state: single project document + undo/redo history + UI state.
import { useSyncExternalStore } from "react";
import { defaultDoc, markComputed, ProjectDoc } from "./doc";
import { evaluate } from "./params";

export type Workspace = "welcome" | "cad" | "library" | "engineering" | "electronics" | "lab" | "coding" | "audio" | "simulation" | "manufacturing" | "settings" | "about";
interface Entry { doc: ProjectDoc; label: string; key?: string; t: number }
export interface AppState {
  doc: ProjectDoc; past: Entry[]; future: Entry[]; ws: Workspace; theme: "dark" | "light"; selection: string | null;
  dirty: boolean; lastSaved: string | null; toast: string | null; palette: boolean; wizard: boolean; syncServer: boolean; saveStatus: string;
}
let state: AppState = { doc: defaultDoc(), past: [], future: [], ws: "welcome", theme: "dark", selection: null, dirty: false, lastSaved: null, toast: null, palette: false, wizard: false, syncServer: true, saveStatus: "" };
const initial = state;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getState = () => state;
export const set = (p: Partial<AppState>) => { state = { ...state, ...p }; emit(); };
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => sel(state), () => sel(initial));
}

const cache = new WeakMap<object, Record<string, number>>();
export function valsOf(doc: ProjectDoc): Record<string, number> {
  let v = cache.get(doc.values);
  if (!v) { v = evaluate(doc.values); cache.set(doc.values, v); }
  return v;
}
export const useDoc = () => useStore((s) => s.doc);
export const useVals = () => valsOf(useStore((s) => s.doc));

export function commit(label: string, fn: (d: ProjectDoc) => ProjectDoc, key?: string) {
  const prev = state.doc, next = fn(prev);
  if (next === prev) return;
  const now = Date.now(), last = state.past[state.past.length - 1];
  const coalesce = key && last && last.key === key && now - last.t < 1500;
  const past = coalesce ? state.past : [...state.past, { doc: prev, label, key, t: now }].slice(-200);
  if (coalesce) past[past.length - 1] = { ...last, t: now };
  state = { ...state, doc: { ...next, modified: new Date().toISOString() }, past, future: [], dirty: true };
  emit();
}
export function undo() {
  const last = state.past[state.past.length - 1];
  if (!last) return;
  state = { ...state, doc: last.doc, past: state.past.slice(0, -1), future: [{ doc: state.doc, label: last.label, t: Date.now() }, ...state.future], dirty: true, toast: `Undo: ${last.label}` };
  emit();
}
export function redo() {
  const nx = state.future[0];
  if (!nx) return;
  state = { ...state, doc: nx.doc, future: state.future.slice(1), past: [...state.past, { doc: state.doc, label: nx.label, t: Date.now() }], dirty: true, toast: `Redo: ${nx.label}` };
  emit();
}
export function loadDoc(doc: ProjectDoc, ws: Workspace = "cad") {
  state = { ...state, doc, past: [], future: [], dirty: false, ws, selection: null, toast: `Opened “${doc.name}”` };
  emit();
}
export const setValue = (id: string, v: number, label?: string) => commit(label ?? `Set ${id}`, (d) => (d.values[id] === v ? d : { ...d, values: { ...d.values, [id]: v } }), `val:${id}`);
export const setValues = (vals: Record<string, number>, label: string) => commit(label, (d) => ({ ...d, values: { ...d.values, ...vals } }));
export const toast = (m: string) => { set({ toast: m }); setTimeout(() => { if (state.toast === m) set({ toast: null }); }, 3500); };
export const go = (ws: Workspace) => set({ ws, palette: false });

/** Record that artifacts were (re)computed for the current inputs — no undo entry, not a design edit. */
export function markArtifacts(ids: string[]) {
  state = { ...state, doc: markComputed(state.doc, valsOf(state.doc), ids) };
  emit();
}
