ALTER TABLE products ADD COLUMN review_cadence TEXT NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN last_reviewed_at INTEGER;
