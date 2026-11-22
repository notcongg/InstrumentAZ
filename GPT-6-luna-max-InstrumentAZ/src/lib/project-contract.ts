import { PROJECT_FORMAT_VERSION } from "@/lib/instrument-model";

export const MAX_PROJECT_BYTES = 2_000_000;

type ProjectPayload = {
  name: string;
  formatVersion: string;
  data: Record<string, unknown>;
};

export type ProjectPayloadResult =
  | { ok: true; value: ProjectPayload }
  | { ok: false; status: 400 | 413; error: string };

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportedVersion(value: unknown): value is string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return false;
  return Number(value.split(".")[0]) <= Number(PROJECT_FORMAT_VERSION.split(".")[0]);
}

export async function readProjectPayload(request: Request): Promise<ProjectPayloadResult> {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_PROJECT_BYTES) {
    return { ok: false, status: 413, error: "Project exceeds the 2 MB preview storage limit." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON." };
  }

  if (!isJsonObject(parsed)) {
    return { ok: false, status: 400, error: "Project payload must be a JSON object." };
  }
  const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 120) : "";
  const formatVersion = parsed.formatVersion ?? PROJECT_FORMAT_VERSION;
  const data = parsed.data;
  if (!name) return { ok: false, status: 400, error: "A project name is required." };
  if (!supportedVersion(formatVersion)) {
    return { ok: false, status: 400, error: "Project format version is invalid or newer than this preview supports." };
  }
  if (!isJsonObject(data) || data.projectType !== "instrumentaz-project" || data.instrument !== "violin") {
    return { ok: false, status: 400, error: "A supported InstrumentAZ violin project data object is required." };
  }
  if (!supportedVersion(data.schemaVersion)) {
    return { ok: false, status: 400, error: "Project schema version is invalid or newer than this preview supports." };
  }

  return { ok: true, value: { name, formatVersion, data } };
}
