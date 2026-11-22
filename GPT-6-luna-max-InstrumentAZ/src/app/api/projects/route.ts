import { desc } from "drizzle-orm";
import { db } from "@/db";
import { instrumentProjects } from "@/db/schema";

export const dynamic = "force-dynamic";
const MAX_PROJECT_BYTES = 2_000_000;

type ProjectPayload = {
  name?: unknown;
  formatVersion?: unknown;
  data?: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const projects = await db
      .select({
        id: instrumentProjects.id,
        name: instrumentProjects.name,
        formatVersion: instrumentProjects.formatVersion,
        createdAt: instrumentProjects.createdAt,
        updatedAt: instrumentProjects.updatedAt,
      })
      .from(instrumentProjects)
      .orderBy(desc(instrumentProjects.updatedAt))
      .limit(12);

    return Response.json({ projects });
  } catch (error) {
    console.error("Could not load InstrumentAZ projects", error);
    return Response.json({ error: "Project storage is unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_PROJECT_BYTES) {
      return Response.json({ error: "Project exceeds the 2 MB preview storage limit." }, { status: 413 });
    }

    const body = JSON.parse(rawBody) as ProjectPayload;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name || !isJsonObject(body.data)) {
      return Response.json({ error: "A project name and JSON object are required." }, { status: 400 });
    }

    const [project] = await db
      .insert(instrumentProjects)
      .values({
        name,
        formatVersion: typeof body.formatVersion === "string" ? body.formatVersion.slice(0, 24) : "1.0.0",
        data: body.data,
      })
      .returning();

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Could not create InstrumentAZ project", error);
    return Response.json({ error: "Could not create project. Check the submitted project data." }, { status: 400 });
  }
}
