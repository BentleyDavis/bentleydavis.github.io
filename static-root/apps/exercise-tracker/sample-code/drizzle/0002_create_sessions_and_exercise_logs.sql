CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  day_type TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  duration_min INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE exercise_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  weight_label TEXT NOT NULL,
  reps INTEGER NOT NULL,
  to_failure INTEGER NOT NULL DEFAULT 1,
  target_label TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL DEFAULT '',
  next_weight_label TEXT NOT NULL DEFAULT '',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
