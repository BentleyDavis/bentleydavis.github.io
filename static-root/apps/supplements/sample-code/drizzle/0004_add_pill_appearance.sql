ALTER TABLE products ADD COLUMN pill_form TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN pill_color TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN pill_size TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN pill_markings TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN pill_photo_key TEXT;
