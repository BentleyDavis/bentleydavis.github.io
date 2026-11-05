DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'supplement',
  serving_desc TEXT NOT NULL DEFAULT '',
  servings_per_day REAL NOT NULL DEFAULT 1,
  timing TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'on',
  why_taking TEXT NOT NULL DEFAULT '',
  effect_wanted TEXT NOT NULL DEFAULT '',
  effects_watch TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  in_stock INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE product_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount_per_serving REAL,
  unit TEXT NOT NULL DEFAULT 'mg',
  elemental_amount REAL,
  elemental_unit TEXT,
  elemental_label TEXT
);
--> statement-breakpoint
CREATE TABLE product_fillers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE ingredient_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_name TEXT NOT NULL,
  ceiling_amount REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'mg',
  source_note TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE filler_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL
);
