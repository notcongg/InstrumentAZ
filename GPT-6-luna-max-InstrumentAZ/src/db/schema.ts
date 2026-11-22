import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Versioned project envelope keeps new engineering domains forward-compatible. */
export const instrumentProjects = pgTable("instrument_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  formatVersion: text("format_version").notNull().default("1.0.0"),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
