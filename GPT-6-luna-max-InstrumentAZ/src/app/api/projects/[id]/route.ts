import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instrumentProjects } from "@/db/schema";

export const dynamic = "force-dynamic";
const MAX_PROJECT_BYTES = 2_000_000;

type ProjectPayload = {
  name?: unknown;
  formatVersion?: unknown;
  data?: unknown;
};

type RouteContext = { params: Promise<{ id: string }> };

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid project ID." }, { status: 400 });
  }

  try {
    const [project] = await db.select().from(instrumentProjects).where(eq(instrumentProjects.id, id)).limit(1);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    return Response.json({ project });
  } catch (error) {
    console.error("Could not load InstrumentAZ project", error);
    return Response.json({ error: "Project storage is unavailable." }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid project ID." }, { status: 400 });
  }

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
      .update(instrumentProjects)
      .set({
        name,
        formatVersion: typeof body.formatVersion === "string" ? body.formatVersion.slice(0, 24) : "1.0.0",
        data: body.data,
        updatedAt: new Date(),
      })
      .where(eq(instrumentProjects.id, id))
      .returning();

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    return Response.json({ project });
  } catch (error) {
    console.error("Could not save InstrumentAZ project", error);
    return Response.json({ error: "Could not save project. Check the submitted project data." }, { status: 400 });
  }
}
