// Walk Tracker schema.
//
// walks: one row per finished or ended-early walk (the durable history).
// active_workout: singleton row (id = 1) holding the in-progress workout
//   state as JSON, so the timer can recover its place after the app is
//   closed and reopened.
// settings: singleton row (id = 1) holding editable settings as JSON
//   (heart-rate goals, fast length, cue toggles).

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const walks = sqliteTable("walks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }).notNull(),
  roundsCompleted: integer("rounds_completed").notNull(),
  roundsPlanned: integer("rounds_planned").notNull(),
  totalSeconds: integer("total_seconds").notNull(),
  fastTargetHr: integer("fast_target_hr").notNull(),
  recoveryDropHr: integer("recovery_drop_hr").notNull(),
  fastMinutes: integer("fast_minutes").notNull(),
  // JSON array, one slot per planned round: peak HR in bpm or null.
  peaksJson: text("peaks_json").notNull().default("[]"),
  // JSON array of heart-rate samples from a connected BLE strap:
  // [{ "t": epochMs, "bpm": number }], oldest first.
  hrSamplesJson: text("hr_samples_json").notNull().default("[]"),
  endedEarly: integer("ended_early").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const activeWorkout = sqliteTable("active_workout", {
  id: integer("id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  settingsJson: text("settings_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
