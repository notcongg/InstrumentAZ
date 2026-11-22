import { db } from "@/db";
import { projects } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt, formatVersion: projects.formatVersion })
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .limit(100);
  return Response.json({ projects: rows });
}

export async function POST(req: Request) {
  let body: { id?: string; name?: string; doc?: unknown; formatVersion?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || typeof body.id !== "string" || !body.doc || typeof body.doc !== "object") {
    return Response.json({ error: "id and doc are required" }, { status: 400 });
  }
  const name = (body.name || "Untitled").slice(0, 200);
  const now = new Date();
  await db
    .insert(projects)
    .values({ id: body.id, name, doc: body.doc, formatVersion: body.formatVersion ?? 1, updatedAt: now })
    .onConflictDoUpdate({
      target: projects.id,
      set: { name, doc: body.doc, formatVersion: body.formatVersion ?? 1, updatedAt: now },
    });
  return Response.json({ ok: true, id: body.id, updatedAt: now.toISOString() });
}
