DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE walks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  rounds_completed INTEGER NOT NULL,
  rounds_planned INTEGER NOT NULL,
  total_seconds INTEGER NOT NULL,
  fast_target_hr INTEGER NOT NULL,
  recovery_drop_hr INTEGER NOT NULL,
  fast_minutes INTEGER NOT NULL,
  peaks_json TEXT NOT NULL DEFAULT '[]',
  ended_early INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE active_workout (
  id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
