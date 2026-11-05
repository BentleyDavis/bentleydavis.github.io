import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  type: text("type", { enum: ["supplement", "medication"] }).notNull().default("supplement"),
  servingDesc: text("serving_desc").notNull().default(""),
  servingsPerDay: real("servings_per_day").notNull().default(1),
  timing: text("timing").notNull().default(""),
  status: text("status", { enum: ["on", "off", "paused"] }).notNull().default("on"),
  whyTaking: text("why_taking").notNull().default(""),
  effectWanted: text("effect_wanted").notNull().default(""),
  effectsWatch: text("effects_watch").notNull().default(""),
  notes: text("notes").notNull().default(""),
  pillForm: text("pill_form").notNull().default(""),
  pillColor: text("pill_color").notNull().default(""),
  pillSize: text("pill_size").notNull().default(""),
  pillMarkings: text("pill_markings").notNull().default(""),
  pillPhotoKey: text("pill_photo_key"),
  infoUrl: text("info_url").notNull().default(""),
  reviewCadence: text("review_cadence", { enum: ["none", "weekly", "monthly"] }).notNull().default("none"),
  reviewNote: text("review_note").notNull().default(""),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  lookInto: integer("look_into", { mode: "boolean" }).notNull().default(false),
  tellChristy: integer("tell_christy", { mode: "boolean" }).notNull().default(false),
  seenSource: text("seen_source").notNull().default(""),
  inStock: integer("in_stock", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const productIngredients = sqliteTable("product_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  name: text("name").notNull(),
  amountPerServing: real("amount_per_serving"),
  unit: text("unit").notNull().default("mg"),
  elementalAmount: real("elemental_amount"),
  elementalUnit: text("elemental_unit"),
  elementalLabel: text("elemental_label"),
});

export const productTimes = sqliteTable("product_times", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  timeLabel: text("time_label").notNull(),
  conditional: integer("conditional", { mode: "boolean" }).notNull().default(false),
  conditionLabel: text("condition_label"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productFillers = sqliteTable("product_fillers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  name: text("name").notNull(),
});

export const ingredientLimits = sqliteTable("ingredient_limits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ingredientName: text("ingredient_name").notNull(),
  ceilingAmount: real("ceiling_amount").notNull(),
  unit: text("unit").notNull().default("mg"),
  sourceNote: text("source_note").notNull().default(""),
});

export const fillerBlacklist = sqliteTable("filler_blacklist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  term: text("term").notNull(),
});
