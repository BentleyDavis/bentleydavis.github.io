import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  dayType: text("day_type", { enum: ["HIT A", "HIT B", "Walk", "Other"] }).notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  durationMin: integer("duration_min"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const exerciseLogs = sqliteTable("exercise_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  weightLabel: text("weight_label").notNull(),
  reps: integer("reps").notNull(),
  toFailure: integer("to_failure").notNull().default(1), // 1 = yes
  targetLabel: text("target_label").notNull().default(""),
  verdict: text("verdict").notNull().default(""),
  nextWeightLabel: text("next_weight_label").notNull().default(""),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Keep legacy entries table type for migration compatibility (dropped in migration 2 data-wise, but keep export if needed)
export const entries = sqliteTable("entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
