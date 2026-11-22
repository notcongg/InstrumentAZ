import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Server-side persistence of .iaz project documents (JSON payload + schema version).
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  formatVersion: integer("format_version").notNull().default(1),
  doc: jsonb("doc").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
