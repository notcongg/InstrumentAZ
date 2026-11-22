export const PROJECT_FORMAT_VERSION = "1.0.0";

export type DesignMode = "assembly" | "build";
export type ParameterKey =
  | "bodyLengthMm"
  | "bodyWidthMm"
  | "ribHeightMm"
  | "topPlateThicknessMm"
  | "backPlateThicknessMm"
  | "neckAngleDeg"
  | "bridgeHeightMm"
  | "stringSpacingMm"
  | "effectiveVibratingLengthMm";

export type EngineeringParameters = Record<ParameterKey, number>;

export interface ViolinString {
  id: string;
  name: string;
  note: string;
  frequencyHz: number;
  linearDensityGPerM: number;
  material: string;
  construction: string;
}

export interface ComponentPart {
  id: string;
  name: string;
  category: string;
  material: string;
  connections: string[];
  quantity: number;
  dimensions: Record<string, number | string>;
}

export interface ProjectData {
  schemaVersion: string;
  projectType: "instrumentaz-project";
  instrument: "violin";
  designMode: DesignMode;
  unitSystem: "metric";
  parameters: EngineeringParameters;
  strings: ViolinString[];
  parts: ComponentPart[];
  staleAnalyses: string[];
}

export const PARAMETER_META: Record<ParameterKey, { label: string; unit: string; min: number; max: number; step: number }> = {
  bodyLengthMm: { label: "Body length", unit: "mm", min: 300, max: 410, step: 0.5 },
  bodyWidthMm: { label: "Body width", unit: "mm", min: 150, max: 255, step: 0.5 },
  ribHeightMm: { label: "Rib height", unit: "mm", min: 20, max: 45, step: 0.1 },
  topPlateThicknessMm: { label: "Top plate", unit: "mm", min: 1.4, max: 5, step: 0.1 },
  backPlateThicknessMm: { label: "Back plate", unit: "mm", min: 2, max: 7, step: 0.1 },
  neckAngleDeg: { label: "Neck angle", unit: "°", min: 0, max: 12, step: 0.1 },
  bridgeHeightMm: { label: "Bridge height", unit: "mm", min: 25, max: 42, step: 0.1 },
  stringSpacingMm: { label: "String spacing", unit: "mm", min: 4, max: 6, step: 0.1 },
  effectiveVibratingLengthMm: { label: "Vibrating length", unit: "mm", min: 300, max: 360, step: 0.5 },
};

export const DEFAULT_PARAMETERS: EngineeringParameters = {
  bodyLengthMm: 356,
  bodyWidthMm: 208,
  ribHeightMm: 30,
  topPlateThicknessMm: 2.7,
  backPlateThicknessMm: 4.2,
  neckAngleDeg: 5.2,
  bridgeHeightMm: 32,
  stringSpacingMm: 5.4,
  effectiveVibratingLengthMm: 328,
};

export const DEFAULT_STRINGS: ViolinString[] = [
  { id: "string-g", name: "G", note: "G3", frequencyHz: 196, linearDensityGPerM: 5.4, material: "Silver-wound synthetic core", construction: "Wound" },
  { id: "string-d", name: "D", note: "D4", frequencyHz: 293.665, linearDensityGPerM: 3.4, material: "Aluminium-wound synthetic core", construction: "Wound" },
  { id: "string-a", name: "A", note: "A4", frequencyHz: 440, linearDensityGPerM: 1.55, material: "Aluminium-wound synthetic core", construction: "Wound" },
  { id: "string-e", name: "E", note: "E5", frequencyHz: 659.255, linearDensityGPerM: 0.72, material: "Carbon steel", construction: "Plain" },
];

const PART_LIBRARY: ComponentPart[] = [
  { id: "body", name: "Body assembly", category: "Structure", material: "Spruce / flamed maple", connections: [], quantity: 1, dimensions: { length: 356, width: 208, ribHeight: 30 } },
  { id: "top-plate", name: "Top plate", category: "Plate", material: "European spruce", connections: ["body", "bass-bar", "soundpost"], quantity: 1, dimensions: { thickness: 2.7 } },
  { id: "back-plate", name: "Back plate", category: "Plate", material: "Flamed maple", connections: ["body", "soundpost"], quantity: 1, dimensions: { thickness: 4.2 } },
  { id: "ribs", name: "Ribs & linings", category: "Structure", material: "Flamed maple / spruce", connections: ["body", "top-plate", "back-plate"], quantity: 1, dimensions: { height: 30, thickness: 1.2 } },
  { id: "neck", name: "Neck", category: "Neck & scroll", material: "Flamed maple", connections: ["body", "fingerboard", "scroll"], quantity: 1, dimensions: { angle: 5.2 } },
  { id: "fingerboard", name: "Fingerboard", category: "Neck & scroll", material: "Ebony", connections: ["neck", "nut"], quantity: 1, dimensions: { length: 270, radius: 42 } },
  { id: "scroll", name: "Scroll", category: "Neck & scroll", material: "Flamed maple", connections: ["neck", "pegs"], quantity: 1, dimensions: { turns: 1.5 } },
  { id: "pegs", name: "Tuning pegs", category: "Hardware", material: "Boxwood", connections: ["scroll", "strings"], quantity: 4, dimensions: { diameter: 8 } },
  { id: "nut", name: "Nut", category: "Hardware", material: "Ebony", connections: ["fingerboard", "strings"], quantity: 1, dimensions: { height: 5 } },
  { id: "bridge", name: "Bridge", category: "Setup", material: "European maple", connections: ["body", "strings"], quantity: 1, dimensions: { height: 32, spacing: 33 } },
  { id: "tailpiece", name: "Tailpiece", category: "Hardware", material: "Ebony", connections: ["body", "strings", "fine-tuners"], quantity: 1, dimensions: { length: 115 } },
  { id: "chin-rest", name: "Chin rest", category: "Hardware", material: "Boxwood", connections: ["body"], quantity: 1, dimensions: { length: 115 } },
  { id: "soundpost", name: "Soundpost", category: "Internal", material: "European spruce", connections: ["top-plate", "back-plate"], quantity: 1, dimensions: { diameter: 6, length: 55 } },
  { id: "bass-bar", name: "Bass bar", category: "Internal", material: "European spruce", connections: ["top-plate"], quantity: 1, dimensions: { length: 270, height: 5 } },
  { id: "f-holes", name: "F-holes", category: "Top plate", material: "Cut in top plate", connections: ["top-plate"], quantity: 2, dimensions: { length: 76 } },
  { id: "strings", name: "Strings", category: "Strings & setup", material: "Mixed — see string model", connections: ["pegs", "nut", "bridge", "tailpiece"], quantity: 4, dimensions: { vibratingLength: 328 } },
  { id: "fine-tuners", name: "Fine tuners", category: "Hardware", material: "Steel / alloy", connections: ["tailpiece", "strings"], quantity: 4, dimensions: { type: "individual" } },
  { id: "endpin", name: "End button", category: "Hardware", material: "Boxwood", connections: ["body", "tailpiece"], quantity: 1, dimensions: { diameter: 8 } },
];

export const COMPONENT_LIBRARY = PART_LIBRARY;

export function createDefaultProjectData(designMode: DesignMode = "assembly"): ProjectData {
  return {
    schemaVersion: PROJECT_FORMAT_VERSION,
    projectType: "instrumentaz-project",
    instrument: "violin",
    designMode,
    unitSystem: "metric",
    parameters: { ...DEFAULT_PARAMETERS },
    strings: DEFAULT_STRINGS.map((string) => ({ ...string })),
    parts: (designMode === "assembly" ? PART_LIBRARY : []).map((part) => ({ ...part, connections: [...part.connections], dimensions: { ...part.dimensions } })),
    staleAnalyses: [],
  };
}

/** Ideal flexible-string model: T = μ(2Lf)^2. μ is entered in g/m, L in mm. */
export function calculateStringTension(lengthMm: number, frequencyHz: number, linearDensityGPerM: number): number | null {
  if (![lengthMm, frequencyHz, linearDensityGPerM].every(Number.isFinite) || lengthMm <= 0 || frequencyHz <= 0 || linearDensityGPerM <= 0) {
    return null;
  }
  const lengthM = lengthMm / 1000;
  const densityKgPerM = linearDensityGPerM / 1000;
  return densityKgPerM * (2 * lengthM * frequencyHz) ** 2;
}

export function calculateStringFrequency(lengthMm: number, tensionN: number, linearDensityGPerM: number): number | null {
  if (![lengthMm, tensionN, linearDensityGPerM].every(Number.isFinite) || lengthMm <= 0 || tensionN <= 0 || linearDensityGPerM <= 0) {
    return null;
  }
  const lengthM = lengthMm / 1000;
  const densityKgPerM = linearDensityGPerM / 1000;
  return (1 / (2 * lengthM)) * Math.sqrt(tensionN / densityKgPerM);
}

export const DEPENDENCY_GRAPH: { id: string; label: string; layer: string; status: "implemented" | "planned" }[] = [
  { id: "body-envelope", label: "Body envelope", layer: "CAD parameters", status: "implemented" },
  { id: "assembly-clearance", label: "Assembly clearances", layer: "Mechanical", status: "planned" },
  { id: "string-tension", label: "String tension", layer: "Calculated · ideal-string model", status: "implemented" },
  { id: "plate-modes", label: "Plate mode analysis", layer: "Acoustics", status: "planned" },
  { id: "technical-drawing", label: "Technical drawing", layer: "Manufacturing", status: "planned" },
  { id: "power-budget", label: "Electronics power budget", layer: "Electronics", status: "planned" },
  { id: "firmware-mapping", label: "Firmware pin mapping", layer: "Firmware", status: "planned" },
];

export const PARAMETER_DEPENDENCIES: Record<ParameterKey, string[]> = {
  bodyLengthMm: ["Body envelope · parametric preview", "Assembly clearance · not implemented", "Technical drawing · not implemented", "Plate mode analysis · not implemented"],
  bodyWidthMm: ["Body envelope · parametric preview", "Assembly clearance · not implemented", "Technical drawing · not implemented", "Plate mode analysis · not implemented"],
  ribHeightMm: ["Body cavity envelope · parametric preview", "Internal component fit · not implemented", "Technical drawing · not implemented"],
  topPlateThicknessMm: ["Top plate mass · not implemented", "Assembly clearances · not implemented", "Plate modes · not implemented", "Technical drawings · not implemented"],
  backPlateThicknessMm: ["Back plate mass · not implemented", "Assembly clearances · not implemented", "Plate modes · not implemented", "Technical drawings · not implemented"],
  neckAngleDeg: ["Neck joint geometry · not implemented", "Bridge / action setup · not implemented", "Technical drawing · not implemented"],
  bridgeHeightMm: ["String action · not implemented", "Bow clearance · not implemented", "Technical drawing · not implemented"],
  stringSpacingMm: ["Bridge spacing · preview parameter", "Fingerboard edge clearance · not implemented"],
  effectiveVibratingLengthMm: ["String tension · calculated from target pitch", "Nut / bridge reference · not implemented", "Intonation setup · not implemented"],
};

export function validateProject(data: ProjectData): string[] {
  const warnings: string[] = [];
  const partIds = new Set<string>();
  for (const part of data.parts) {
    if (partIds.has(part.id)) warnings.push(`Duplicate component ID: ${part.id}.`);
    partIds.add(part.id);
    if (part.quantity < 1) warnings.push(`${part.name}: quantity must be at least 1.`);
  }
  for (const part of data.parts) {
    for (const connection of part.connections) {
      if (!partIds.has(connection)) warnings.push(`${part.name}: connection “${connection}” has no matching component.`);
    }
  }
  for (const [key, meta] of Object.entries(PARAMETER_META) as [ParameterKey, (typeof PARAMETER_META)[ParameterKey]][]) {
    const value = data.parameters[key];
    if (!Number.isFinite(value) || value < meta.min || value > meta.max) {
      warnings.push(`${meta.label} is outside its declared ${meta.min}–${meta.max} ${meta.unit} design range.`);
    }
  }
  for (const string of data.strings) {
    if (calculateStringTension(data.parameters.effectiveVibratingLengthMm, string.frequencyHz, string.linearDensityGPerM) === null) {
      warnings.push(`${string.name} string: frequency and linear density must be positive values.`);
    }
  }
  return warnings;
}

export function createBomCsv(data: ProjectData): string {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ["Item ID", "Component", "Category", "Material specification", "Quantity", "Connections"],
    ...data.parts.map((part) => [part.id, part.name, part.category, part.material, part.quantity, part.connections.join("; ")]),
  ];
  return rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
