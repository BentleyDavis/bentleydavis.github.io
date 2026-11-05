CREATE TABLE product_times (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  time_label TEXT NOT NULL,
  conditional INTEGER NOT NULL DEFAULT 0,
  condition_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
