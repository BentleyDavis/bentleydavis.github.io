import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import * as schema from "./schema";

// ---------- helpers ----------
function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/^elemental\s+/, "").replace(/\s+/g, " ");
}
function isFlagged(fillerName: string, blacklist: string[]): boolean {
  const f = fillerName.toLowerCase();
  return blacklist.some((t) => {
    const term = t.trim().toLowerCase();
    if (!term) return false;
    return f.includes(term);
  });
}
function massFactorToMg(unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return 1000;
  if (u === "mg" || u === "milligram" || u === "milligrams") return 1;
  if (u === "mcg" || u === "ug" || u === "µg" || u === "μg" || u === "microgram" || u === "micrograms") return 0.001;
  if (u === "kg") return 1000000;
  return null;
}
function convertAmount(amount: number, fromUnit: string, toUnit: string): number | null {
  const ff = massFactorToMg(fromUnit);
  const tf = massFactorToMg(toUnit);
  if (ff != null && tf != null) return (amount * ff) / tf;
  if (fromUnit.trim().toLowerCase() === toUnit.trim().toLowerCase()) return amount;
  return null;
}

const ingredientInput = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  amountPerServing: z.number().nullable().optional(),
  unit: z.string().default("mg"),
  elementalAmount: z.number().nullable().optional(),
  elementalUnit: z.string().nullable().optional(),
  elementalLabel: z.string().nullable().optional(),
});

const timeInput = z.object({
  timeLabel: z.string().min(1),
  conditional: z.boolean().default(false),
  conditionLabel: z.string().nullable().optional(),
});

type TimeEntry = { timeLabel: string; conditional: boolean; conditionLabel: string | null };

function timingSummary(times: TimeEntry[]): string {
  return times
    .map((t) => (t.conditional ? `${t.timeLabel} (${t.conditionLabel || "sometimes only"})` : t.timeLabel))
    .join("; ");
}

const productShape = z.object({
  id: z.number(),
  name: z.string(),
  brand: z.string(),
  type: z.string(),
  servingDesc: z.string(),
  servingsPerDay: z.number(),
  timing: z.string(),
  status: z.string(),
  whyTaking: z.string(),
  effectWanted: z.string(),
  effectsWatch: z.string(),
  notes: z.string(),
  inStock: z.boolean(),
  ingredients: z.array(z.object({
    id: z.number(),
    name: z.string(),
    amountPerServing: z.number().nullable(),
    unit: z.string(),
    elementalAmount: z.number().nullable(),
    elementalUnit: z.string().nullable(),
    elementalLabel: z.string().nullable(),
  })),
  fillers: z.array(z.object({
    id: z.number(),
    name: z.string(),
    flagged: z.boolean(),
  })),
  times: z.array(z.object({
    id: z.number(),
    timeLabel: z.string(),
    conditional: z.boolean(),
    conditionLabel: z.string().nullable(),
  })),
  pillForm: z.string(),
  pillColor: z.string(),
  pillSize: z.string(),
  pillMarkings: z.string(),
  pillPhotoUrl: z.string().nullable(),
  infoUrl: z.string(),
  reviewCadence: z.string(),
  reviewNote: z.string(),
  lastReviewedAt: z.number().nullable(),
  lookInto: z.boolean(),
  tellChristy: z.boolean(),
  seenSource: z.string(),
});

async function loadAll(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const [products, ingredients, fillers, times, limits, blacklist] = await Promise.all([
    db.select().from(schema.products).orderBy(asc(schema.products.name)),
    db.select().from(schema.productIngredients),
    db.select().from(schema.productFillers),
    db.select().from(schema.productTimes).orderBy(asc(schema.productTimes.sortOrder), asc(schema.productTimes.id)),
    db.select().from(schema.ingredientLimits).orderBy(asc(schema.ingredientLimits.ingredientName)),
    db.select().from(schema.fillerBlacklist).orderBy(asc(schema.fillerBlacklist.term)),
  ]);
  const blacklistTerms = blacklist.map((b) => b.term);
  const assembled = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    type: p.type as string,
    servingDesc: p.servingDesc,
    servingsPerDay: p.servingsPerDay,
    timing: p.timing,
    status: p.status as string,
    whyTaking: p.whyTaking,
    effectWanted: p.effectWanted,
    effectsWatch: p.effectsWatch,
    notes: p.notes,
    inStock: p.inStock,
    ingredients: ingredients.filter((i) => i.productId === p.id).map((i) => ({
      id: i.id,
      name: i.name,
      amountPerServing: i.amountPerServing,
      unit: i.unit,
      elementalAmount: i.elementalAmount,
      elementalUnit: i.elementalUnit,
      elementalLabel: i.elementalLabel,
    })),
    fillers: fillers.filter((f) => f.productId === p.id).map((f) => ({
      id: f.id,
      name: f.name,
      flagged: isFlagged(f.name, blacklistTerms),
    })),
    times: times.filter((t) => t.productId === p.id).map((t) => ({
      id: t.id,
      timeLabel: t.timeLabel,
      conditional: t.conditional,
      conditionLabel: t.conditionLabel,
    })),
    pillForm: p.pillForm,
    pillColor: p.pillColor,
    pillSize: p.pillSize,
    pillMarkings: p.pillMarkings,
    pillPhotoKey: p.pillPhotoKey,
    infoUrl: p.infoUrl ?? "",
    reviewCadence: p.reviewCadence ?? "none",
    reviewNote: p.reviewNote ?? "",
    lastReviewedAt: p.lastReviewedAt ? p.lastReviewedAt.getTime() : null,
    lookInto: p.lookInto ?? false,
    tellChristy: p.tellChristy ?? false,
    seenSource: p.seenSource ?? "",
  }));

  // Resolve pill photo URLs (owned blobs)
  const assembledWithPhotos = await Promise.all(assembled.map(async (p) => {
    let pillPhotoUrl: string | null = null;
    if (p.pillPhotoKey) {
      try {
        pillPhotoUrl = await ctx.blobs.getUrl(p.pillPhotoKey);
      } catch {
        pillPhotoUrl = null;
      }
    }
    const { pillPhotoKey: _key, ...rest } = p;
    return { ...rest, pillPhotoUrl };
  }));

  // Totals
  type Contrib = { productId: number; productName: string; contribution: number; unit: string; perServing: number; servingsPerDay: number; sourceLabel: string };
  type TotalAcc = { ingredient: string; displayUnit: string; isMass: boolean; totalMgOrAmount: number; contributions: Contrib[] };
  const map = new Map<string, TotalAcc>();

  function addContribution(displayName: string, amountPerServing: number, unit: string, product: typeof assembled[number]) {
    const factor = massFactorToMg(unit);
    const isMass = factor != null;
    const displayUnit = isMass ? "mg" : unit;
    const key = normalizeKey(displayName) + "|" + displayUnit.toLowerCase();
    const contribAmount = isMass ? amountPerServing * (factor as number) * product.servingsPerDay : amountPerServing * product.servingsPerDay;
    let acc = map.get(key);
    if (!acc) {
      acc = { ingredient: displayName, displayUnit, isMass, totalMgOrAmount: 0, contributions: [] };
      map.set(key, acc);
    }
    acc.totalMgOrAmount += contribAmount;
    acc.contributions.push({
      productId: product.id,
      productName: product.name,
      contribution: contribAmount,
      unit: displayUnit,
      perServing: amountPerServing,
      servingsPerDay: product.servingsPerDay,
      sourceLabel: `${amountPerServing} ${unit} × ${product.servingsPerDay}/day`,
    });
  }

  for (const p of assembled) {
    if (p.status !== "on") continue;
    for (const ing of p.ingredients) {
      if (ing.amountPerServing != null) {
        addContribution(ing.name, ing.amountPerServing, ing.unit, p);
      }
      if (ing.elementalAmount != null && ing.elementalLabel) {
        addContribution(ing.elementalLabel, ing.elementalAmount, ing.elementalUnit || ing.unit, p);
      }
    }
  }

  const totals = Array.from(map.values()).map((acc) => {
    const limit = limits.find((l) => normalizeKey(l.ingredientName) === normalizeKey(acc.ingredient));
    let ceilingAmount: number | null = null;
    let ceilingUnit: string | null = null;
    let percent: number | null = null;
    let overCeiling = false;
    if (limit) {
      const converted = convertAmount(limit.ceilingAmount, limit.unit, acc.displayUnit);
      if (converted != null) {
        ceilingAmount = converted;
        ceilingUnit = acc.displayUnit;
        percent = ceilingAmount > 0 ? (acc.totalMgOrAmount / ceilingAmount) * 100 : null;
        overCeiling = acc.totalMgOrAmount > ceilingAmount;
      } else {
        ceilingAmount = limit.ceilingAmount;
        ceilingUnit = limit.unit;
      }
    }
    // Round nicely
    const totalRounded = Math.round(acc.totalMgOrAmount * 100) / 100;
    return {
      ingredient: acc.ingredient,
      totalAmount: totalRounded,
      unit: acc.displayUnit,
      ceilingAmount,
      ceilingUnit,
      ceilingSource: limit?.sourceNote ?? null,
      percentOfCeiling: percent != null ? Math.round(percent * 10) / 10 : null,
      overCeiling,
      contributions: acc.contributions.map((c) => ({ ...c, contribution: Math.round(c.contribution * 100) / 100 })),
    };
  }).sort((a, b) => {
    if (a.overCeiling !== b.overCeiling) return a.overCeiling ? -1 : 1;
    const pa = a.percentOfCeiling ?? -1;
    const pb = b.percentOfCeiling ?? -1;
    if (pb !== pa) return pb - pa;
    return a.ingredient.localeCompare(b.ingredient);
  });

  // Sort products: on first, paused, off, then name
  const statusOrder: Record<string, number> = { on: 0, paused: 1, off: 2 };
  assembledWithPhotos.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3) || a.name.localeCompare(b.name));

  return {
    products: assembledWithPhotos,
    totals,
    limits: limits.map((l) => ({ id: l.id, ingredientName: l.ingredientName, ceilingAmount: l.ceilingAmount, unit: l.unit, sourceNote: l.sourceNote })),
    blacklist: blacklist.map((b) => ({ id: b.id, term: b.term })),
  };
}

const getAllResponse = z.object({
  products: z.array(productShape),
  totals: z.array(z.object({
    ingredient: z.string(),
    totalAmount: z.number(),
    unit: z.string(),
    ceilingAmount: z.number().nullable(),
    ceilingUnit: z.string().nullable(),
    ceilingSource: z.string().nullable(),
    percentOfCeiling: z.number().nullable(),
    overCeiling: z.boolean(),
    contributions: z.array(z.object({
      productId: z.number(),
      productName: z.string(),
      contribution: z.number(),
      unit: z.string(),
      perServing: z.number(),
      servingsPerDay: z.number(),
      sourceLabel: z.string(),
    })),
  })),
  limits: z.array(z.object({ id: z.number(), ingredientName: z.string(), ceilingAmount: z.number(), unit: z.string(), sourceNote: z.string() })),
  blacklist: z.array(z.object({ id: z.number(), term: z.string() })),
});

// One-time, fill-only-if-empty conversions for rows seeded before a feature
// existed. Never overwrites anything the owner has entered.
async function runTimesBackfill(ctx: Ctx): Promise<number> {
  const db = ctx.db<typeof schema>();
  const [products, times] = await Promise.all([
    db.select().from(schema.products),
    db.select().from(schema.productTimes),
  ]);
  const hasTimes = new Set(times.map((t) => t.productId));
  let updated = 0;
  for (const p of products) {
    if (hasTimes.has(p.id)) continue;
    const name = p.name.trim().toLowerCase();
    let entries: TimeEntry[] = [];
    if (name === "valacyclovir") {
      entries = [
        { timeLabel: "9pm", conditional: false, conditionLabel: null },
        { timeLabel: "9am", conditional: true, conditionLabel: "double-dose days only" },
      ];
    } else if (name === "glycine") {
      entries = [{ timeLabel: "9pm", conditional: false, conditionLabel: null }];
    } else if (p.timing.trim()) {
      entries = [{ timeLabel: p.timing.trim(), conditional: false, conditionLabel: null }];
    }
    if (!entries.length) continue;
    await db.insert(schema.productTimes).values(entries.map((t, idx) => ({
      productId: p.id, timeLabel: t.timeLabel, conditional: t.conditional, conditionLabel: t.conditionLabel, sortOrder: idx,
    })));
    await db.update(schema.products).set({ timing: timingSummary(entries) }).where(eq(schema.products.id, p.id));
    updated += 1;
  }
  return updated;
}

const KNOWN_INFO_URLS: { match: (name: string) => boolean; url: string }[] = [
  {
    match: (n) => n.includes("glycine"),
    url: "https://www.nowfoods.com/products/supplements/glycine-1000-mg-veg-capsules",
  },
  {
    match: (n) => n.includes("egcg"),
    url: "https://www.nowfoods.com/products/supplements/egcg-green-tea-extract-400-mg-veg-capsules",
  },
];

async function runInfoUrlBackfill(ctx: Ctx): Promise<number> {
  const db = ctx.db<typeof schema>();
  const products = await db.select().from(schema.products);
  let updated = 0;
  for (const p of products) {
    if (p.infoUrl && p.infoUrl.trim()) continue;
    const name = p.name.trim().toLowerCase();
    const known = KNOWN_INFO_URLS.find((k) => k.match(name));
    if (!known) continue;
    await db.update(schema.products).set({ infoUrl: known.url }).where(eq(schema.products.id, p.id));
    updated += 1;
  }
  return updated;
}

async function runAppearanceBackfill(ctx: Ctx): Promise<number> {
  const db = ctx.db<typeof schema>();
  const products = await db.select().from(schema.products);
  let updated = 0;
  for (const p of products) {
    const hasAppearance = p.pillForm.trim() || p.pillColor.trim() || p.pillSize.trim() || p.pillMarkings.trim() || p.pillPhotoKey;
    if (hasAppearance) continue;
    const name = p.name.trim().toLowerCase();
    let patch: { pillForm: string; pillColor: string } | null = null;
    if (name === "valacyclovir") patch = { pillForm: "tablet", pillColor: "white" };
    else if (name === "glycine") patch = { pillForm: "capsule", pillColor: "white" };
    else if (name.startsWith("egcg")) patch = { pillForm: "capsule", pillColor: "" };
    if (!patch) continue;
    await db.update(schema.products).set(patch).where(eq(schema.products.id, p.id));
    updated += 1;
  }
  return updated;
}

// The owner asked for CaloCurb to be flagged as something to look into soon
// (a new study is expected) and to suggest to Christy for over-hunger. Only
// fills flags on the CaloCurb row when both are still unset, so a flag the
// owner deliberately clears later is never re-added by a re-run.
async function runFlagsBackfill(ctx: Ctx): Promise<number> {
  const db = ctx.db<typeof schema>();
  const products = await db.select().from(schema.products);
  let updated = 0;
  for (const p of products) {
    if (!p.name.trim().toLowerCase().includes("calocurb")) continue;
    if (p.lookInto || p.tellChristy) continue;
    await db.update(schema.products).set({ lookInto: true, tellChristy: true }).where(eq(schema.products.id, p.id));
    updated += 1;
  }
  return updated;
}

// Where the owner first saw CaloCurb, pasted verbatim from the podcast
// episode details he supplied (2026-11-02): "The Human Upgrade" episode
// 1565. Fill-only-if-empty so anything the owner types himself is never
// overwritten by a re-run.
const CALOCURB_SEEN_SOURCE = `The Human Upgrade: Biohacking for Longevity & Performance: The No-Brainer Solution To Stop Overeating : 1565

Episode webpage: https://daveasprey.com/category/podcasts/

Media file: https://dts.podtrac.com/redirect.mp3/mgln.ai/e/p394/rss.art19.com/episodes/e770b57e-55b9-4ff8-9e47-d65bca2f2068.mp3?rss_browser=BAhJIg9BbnRlbm5hUG9kBjoGRVQ%3D--bba5bdd77df5f5806138bf3e7d4615ea7f8e6a75x`;

async function runSeenSourceBackfill(ctx: Ctx): Promise<number> {
  const db = ctx.db<typeof schema>();
  const products = await db.select().from(schema.products);
  let updated = 0;
  for (const p of products) {
    if (!p.name.trim().toLowerCase().includes("calocurb")) continue;
    if (p.seenSource && p.seenSource.trim()) continue;
    await db.update(schema.products).set({ seenSource: CALOCURB_SEEN_SOURCE }).where(eq(schema.products.id, p.id));
    updated += 1;
  }
  return updated;
}

export const Actions = {
  getAllData: defineAction({
    description: "Load the whole supplement tracker: all products with ingredients, fillers, times, and flags, plus daily totals, ceilings, and the filler blacklist.",
    request: z.object({}),
    response: getAllResponse,
    async handler(ctx): Promise<z.infer<typeof getAllResponse>> {
      const data = await loadAll(ctx);
      return data as z.infer<typeof getAllResponse>;
    },
  }),

  seedInitialData: defineAction({
    description: "Seed the tracker's starter regimen, ceilings, and filler blacklist — only when the products table is completely empty.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), seeded: z.boolean() }),
    async handler(ctx): Promise<{ ok: true; seeded: boolean }> {
      const db = ctx.db<typeof schema>();
      const existing = await db.select().from(schema.products);
      if (existing.length > 0) return { ok: true, seeded: false };

      // Blacklist
      await db.insert(schema.fillerBlacklist).values([{ term: "maltodextrin" }, { term: "rice" }]);
      // Limits
      await db.insert(schema.ingredientLimits).values([
        { ingredientName: "Magnesium", ceilingAmount: 500, unit: "mg", sourceNote: "CRN industry guidance (2025 review) — NIH UL is 350 mg/day supplemental; CRN supports up to 500 mg/day with normal kidney function" },
        { ingredientName: "EGCG", ceilingAmount: 800, unit: "mg", sourceNote: "EFSA (2018) — liver enzyme signal at ≥800 mg/day; EU cap for green tea extract supplements" },
      ]);

      const now = new Date();
      async function addProduct(
        p: { name: string; brand: string; type: "supplement" | "medication"; servingDesc: string; servingsPerDay: number; timing: string; status: "on" | "off" | "paused"; whyTaking: string; effectWanted: string; effectsWatch: string; notes: string; pillForm?: string; pillColor?: string; infoUrl?: string },
        ings: { name: string; amountPerServing: number | null; unit: string; elementalAmount?: number | null; elementalUnit?: string | null; elementalLabel?: string | null }[],
        fillers: string[],
        times: TimeEntry[] = [],
      ) {
        const res = await db.insert(schema.products).values({ ...p, pillForm: p.pillForm ?? "", pillColor: p.pillColor ?? "", infoUrl: p.infoUrl ?? "", timing: times.length ? timingSummary(times) : p.timing, inStock: true, createdAt: now, updatedAt: now }).returning({ id: schema.products.id });
        const row = res[0];
        if (!row) return;
        if (times.length) {
          await db.insert(schema.productTimes).values(times.map((t, idx) => ({
            productId: row.id, timeLabel: t.timeLabel, conditional: t.conditional, conditionLabel: t.conditionLabel, sortOrder: idx,
          })));
        }
        if (ings.length) {
          await db.insert(schema.productIngredients).values(ings.map((i) => ({
            productId: row.id, name: i.name, amountPerServing: i.amountPerServing, unit: i.unit,
            elementalAmount: i.elementalAmount ?? null, elementalUnit: i.elementalUnit ?? null, elementalLabel: i.elementalLabel ?? null,
          })));
        }
        if (fillers.length) {
          await db.insert(schema.productFillers).values(fillers.map((f) => ({ productId: row.id, name: f })));
        }
      }

      await addProduct(
        { name: "Valacyclovir", brand: "Aurobindo", type: "medication", servingDesc: "1 tablet (500 mg)", servingsPerDay: 1, timing: "9pm daily; 9am also if on double dose", status: "on", whyTaking: "Keep breakouts down — most important", effectWanted: "Fewer / no breakouts (maintenance suppression)", effectsWatch: "", notes: "1/day maintenance, 2/day during a breakout. During a breakout, bump Servings/day to 2 to see the doubled total.", pillForm: "tablet", pillColor: "white" },
        [{ name: "Valacyclovir", amountPerServing: 500, unit: "mg" }],
        [],
        [
          { timeLabel: "9pm", conditional: false, conditionLabel: null },
          { timeLabel: "9am", conditional: true, conditionLabel: "double-dose days only" },
        ],
      );
      await addProduct(
        { name: "Magnesium", brand: "", type: "supplement", servingDesc: "", servingsPerDay: 1, timing: "", status: "on", whyTaking: "", effectWanted: "", effectsWatch: "Diarrhea is the dose-limiting signal (basis of the 350 mg NIH UL); serious toxicity is essentially a kidney-impairment issue", notes: "Brand and dose TBD — restarting after a lapse. Tracked option: magnesium glycinate dissolved in a drink and sipped every ~30 min through the day let you tolerate a higher total without GI trouble. Add the bottle's ingredients here when you restart so totals can calculate." },
        [],
        [],
      );
      await addProduct(
        { name: "Benadryl", brand: "", type: "medication", servingDesc: "", servingsPerDay: 1, timing: "", status: "on", whyTaking: "Histamine management", effectWanted: "", effectsWatch: "", notes: "Details TBD — brand, dose, and timing to add." },
        [],
        [],
      );
      await addProduct(
        { name: "Claritin", brand: "", type: "medication", servingDesc: "", servingsPerDay: 1, timing: "", status: "on", whyTaking: "Histamine management", effectWanted: "", effectsWatch: "", notes: "Details TBD — brand, dose, and timing to add." },
        [],
        [],
      );
      await addProduct(
        { name: "EGCG — Green Tea Extract", brand: "NOW Foods", type: "supplement", servingDesc: "1 veg capsule", servingsPerDay: 1, timing: "With meat-containing meals, up to 3x/day", status: "paused", pillForm: "capsule", infoUrl: "https://www.nowfoods.com/products/supplements/egcg-green-tea-extract-400-mg-veg-capsules", whyTaking: "Reduce iron absorption (single hemochromatosis mutation) + metabolic / mitochondrial benefits", effectWanted: "Less iron absorbed from meat meals; metabolic / mitochondrial benefits", effectsWatch: "Liver injury risk at high dose — EFSA signal at ≥800 mg/day EGCG, rare cases lower; pro-oxidant at high concentrations. Always take with food, never fasted. Suggested cautious zone discussed: 400–500 mg/day total, split across meat-heaviest meals (2 caps = 400 mg).", notes: "Currently paused / not taking. Each capsule: 400 mg green tea extract standardized to 200 mg EGCG (50%), up to 4 mg naturally occurring caffeine, plus 50 mg decaffeinated green tea leaf. Fillers checked 2026-10-30: clean — no maltodextrin, no rice." },
        [
          { name: "Green Tea Extract", amountPerServing: 400, unit: "mg" },
          { name: "EGCG", amountPerServing: 200, unit: "mg" },
        ],
        ["Hypromellose (cellulose capsule)", "Microcrystalline cellulose", "Stearic acid (vegetable source)", "Silicon dioxide"],
        [{ timeLabel: "With meat-containing meals", conditional: false, conditionLabel: null }],
      );
      await addProduct(
        { name: "Glycine", brand: "NOW Foods", type: "supplement", servingDesc: "3 veg capsules", servingsPerDay: 1, timing: "9pm", status: "on", whyTaking: "Sleep + metabolic / mitochondrial benefits", effectWanted: "Restful sleep; glutathione / metabolic support", effectsWatch: "", notes: "3 × 1000 mg capsules at night = 3 g. Fillers checked: clean — no maltodextrin, no rice.", pillForm: "capsule", pillColor: "white", infoUrl: "https://www.nowfoods.com/products/supplements/glycine-1000-mg-veg-capsules" },
        [{ name: "Glycine", amountPerServing: 3000, unit: "mg" }],
        ["Hypromellose (cellulose capsule)", "Hydroxypropyl cellulose", "Stearic acid (vegetable source)", "Silicon dioxide"],
        [{ timeLabel: "9pm", conditional: false, conditionLabel: null }],
      );

      ctx.invalidateQueries();
      return { ok: true, seeded: true };
    },
  }),

  backfillProductTimes: defineAction({
    description: "One-time conversion: give products that still only have a free-text timing their structured time entries, without touching products that already have any.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), updated: z.number() }),
    async handler(ctx): Promise<{ ok: true; updated: number }> {
      const updated = await runTimesBackfill(ctx);
      if (updated > 0) ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  applyDataFixups: defineAction({
    description: "Run the one-time, fill-only-if-empty data fixups (times backfill, pill appearance, info URLs, the CaloCurb flags, and the CaloCurb where-I-saw-it source) without overwriting anything the owner entered.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), timesUpdated: z.number(), appearanceUpdated: z.number(), infoUrlsUpdated: z.number(), flagsUpdated: z.number(), seenSourceUpdated: z.number() }),
    async handler(ctx): Promise<{ ok: true; timesUpdated: number; appearanceUpdated: number; infoUrlsUpdated: number; flagsUpdated: number; seenSourceUpdated: number }> {
      const timesUpdated = await runTimesBackfill(ctx);
      const appearanceUpdated = await runAppearanceBackfill(ctx);
      const infoUrlsUpdated = await runInfoUrlBackfill(ctx);
      const flagsUpdated = await runFlagsBackfill(ctx);
      const seenSourceUpdated = await runSeenSourceBackfill(ctx);
      if (timesUpdated > 0 || appearanceUpdated > 0 || infoUrlsUpdated > 0 || flagsUpdated > 0 || seenSourceUpdated > 0) ctx.invalidateQueries();
      return { ok: true, timesUpdated, appearanceUpdated, infoUrlsUpdated, flagsUpdated, seenSourceUpdated };
    },
  }),

  importAmazonCatalog: defineAction({
    description: "Import the deduped supplement products from the owner's Amazon order history into the Catalog as off, reconciling rows an earlier import already added.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), added: z.number(), updated: z.number(), removed: z.number(), skipped: z.number(), total: z.number() }),
    async handler(ctx): Promise<{ ok: true; added: number; updated: number; removed: number; skipped: number; total: number }> {
      const db = ctx.db<typeof schema>();
      // 61 distinct supplement products deduped from the owner's Amazon order
      // history shortlist (75 rows, last year, not already tracked): duplicate
      // ASINs merged (NATURDAO MAX, BulkSupplements Activated Charcoal), pack
      // sizes / flavors merged (LMNT, Cata-Kor NAD+, Nutricost Creatine,
      // Beyond Brew), and 7 non-supplement rows left out (silver socks, lens
      // spray, shampoo set, curling iron, kettlebell, grounding sheets,
      // iron-on labels). Ingredient amounts are taken only from the Amazon
      // product titles themselves; where a title states no amount, none is
      // recorded. All imported as status "off" so they stay out of totals,
      // schedule, prep, and review until the owner turns one on.
      type CatIng = { name: string; amount: number; unit: string };
      type CatItem = { name: string; brand: string; type?: "medication"; servingDesc: string; ings: CatIng[]; asin: string; lastOrdered: string; dates: string; totalQty: number; lastPrice: number; extra?: string };
      const catalog: CatItem[] = [
        { name: "H Formula — Diosmin & Hesperidin", brand: "VITASUPPORTMD", servingDesc: "Capsules — 60 per bottle", ings: [{ name: "Diosmin + Hesperidin (MPFF)", amount: 1000, unit: "mg" }, { name: "Horse Chestnut Extract", amount: 300, unit: "mg" }], asin: "B09BNYCZXZ", lastOrdered: "2026-10-26", dates: "2026-10-26", totalQty: 1, lastPrice: 49.95, extra: "For hemorrhoidal vein support. This was one of the orders behind the vague '1 item: Supplements' Amazon emails." },
        { name: "LMNT Zero Sugar Electrolytes — Variety Pack", brand: "LMNT", servingDesc: "Drink mix packets", ings: [], asin: "B0FTGLCJW2", lastOrdered: "2026-10-21", dates: "2026-10-21; 2026-08-30; 2026-08-01; 2026-07-08; 2026-06-17; 2026-06-01; 2026-05-26", totalQty: 7, lastPrice: 74.99, extra: "Ordered in both 54-count and 18-count variety packs (7 orders in the last year — your most-reordered item on this list). Per-packet amounts aren't in the Amazon titles, so no ingredients are recorded." },
        { name: "Black Cumin Seed Oil", brand: "BulkSupplements.com", servingDesc: "1 softgel per serving — 120 per bottle", ings: [{ name: "Black Cumin Seed Oil", amount: 1000, unit: "mg" }], asin: "B0B9HRGK11", lastOrdered: "2026-10-21", dates: "2026-10-21", totalQty: 1, lastPrice: 26.97, extra: "The other item behind an Oct 21 '1 item: Supplements' email." },
        { name: "Cayenne Pepper", brand: "Nutricost", servingDesc: "Capsules — 240 per bottle, 40,000 heat units", ings: [{ name: "Cayenne Pepper", amount: 530, unit: "mg" }], asin: "B098KGFLX5", lastOrdered: "2026-09-19", dates: "2026-09-19", totalQty: 1, lastPrice: 16.95 },
        { name: "Iodine — from Organic Sea Kelp", brand: "Nutricost", servingDesc: "Capsules — 120 per bottle", ings: [{ name: "Iodine", amount: 325, unit: "mcg" }], asin: "B0B69J6S7Y", lastOrdered: "2026-09-11", dates: "2026-09-11", totalQty: 1, lastPrice: 14.95 },
        { name: "Beyond Brew — Mushroom Coffee Alternative", brand: "Live Conscious / Beyond Brew", servingDesc: "Powder drink mix — 30 servings", ings: [], asin: "B0B628D7ZN", lastOrdered: "2026-09-09", dates: "2026-09-09; 2026-05-14; 2026-03-09; 2025-12-18; 2025-09-24; 2025-05-30", totalQty: 6, lastPrice: 39, extra: "Mushroom complex (lion's mane, reishi, cordyceps, chaga) with prebiotics & probiotics. Ordered in three flavors across 6 orders: original, Vanilla Latte, and Caramel Macchiato. Amounts aren't in the Amazon titles, so no ingredients are recorded." },
        { name: "Essential T2 — Thyroid Supplement", brand: "Dr. Westin Childs", servingDesc: "Capsules — 60 per bottle", ings: [{ name: "T2", amount: 100, unit: "mcg" }], asin: "B0BQX2D3B6", lastOrdered: "2026-09-06", dates: "2026-09-06", totalQty: 1, lastPrice: 41.99 },
        { name: "L-Carnitine", brand: "BulkSupplements.com", servingDesc: "2 capsules per serving — 240 per bottle", ings: [{ name: "L-Carnitine", amount: 1000, unit: "mg" }], asin: "B0C3SFJRQD", lastOrdered: "2026-09-02", dates: "2026-09-02", totalQty: 1, lastPrice: 23.96 },
        { name: "Liposomal NAD+ with Resveratrol", brand: "Cata-Kor", servingDesc: "Capsules — 60-day supply (120 count)", ings: [], asin: "B0F6NMS39Y", lastOrdered: "2026-08-19", dates: "2026-08-19; 2026-05-24", totalQty: 2, lastPrice: 71.99, extra: "Ordered as both a pack of 2 and a single bottle. Amounts aren't in the Amazon titles, so no ingredients are recorded." },
        { name: "ReCalcia — Liquid Calcium", brand: "RnA ReSet", servingDesc: "Liquid — 8.1 fl oz", ings: [], asin: "B074YPW4RS", lastOrdered: "2026-08-18", dates: "2026-08-18; 2026-08-06", totalQty: 2, lastPrice: 38.99 },
        { name: "5-HTP", brand: "BulkSupplements.com", servingDesc: "1 capsule per serving — 365 per bottle", ings: [{ name: "5-HTP", amount: 50, unit: "mg" }], asin: "B0CC72PMQF", lastOrdered: "2026-08-15", dates: "2026-08-15", totalQty: 1, lastPrice: 17.97 },
        { name: "Liposomal Vitamin C", brand: "NOW Foods", servingDesc: "Veg capsules — 120 per bottle", ings: [], asin: "B0BV8BM7LX", lastOrdered: "2026-08-11", dates: "2026-08-11; 2025-06-01; 2025-04-25", totalQty: 3, lastPrice: 15.24, extra: "Amount per capsule isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "NATURDAO MAX — DAO Enzyme", brand: "NATURDAO", servingDesc: "Tablets — 120 per bottle, extended release", ings: [{ name: "Diamine Oxidase (DAO)", amount: 50000, unit: "HDU" }], asin: "B0GV11RRLC", lastOrdered: "2026-08-10", dates: "2026-08-10; 2026-05-11", totalQty: 2, lastPrice: 24.9, extra: "Histamine blocker (diamine oxidase) — sits next to your Benadryl / Claritin histamine management." },
        { name: "Cortisol Manager", brand: "Integrative Therapeutics", servingDesc: "Tablets — 30 per bottle", ings: [], asin: "B002D2JYYG", lastOrdered: "2026-08-09", dates: "2026-08-09", totalQty: 1, lastPrice: 26.75, extra: "Ashwagandha & L-theanine blend for cortisol balance / restful sleep; amounts aren't in the Amazon title, so no ingredients are recorded." },
        { name: "Phosphatidylserine", brand: "", servingDesc: "Capsules — 120 per bottle", ings: [{ name: "Phosphatidylserine", amount: 300, unit: "mg" }], asin: "B079YF1K1B", lastOrdered: "2026-08-06", dates: "2026-08-06", totalQty: 1, lastPrice: 20.95, extra: "Brand isn't named in the Amazon product title." },
        { name: "L-Lysine", brand: "Nutricost", servingDesc: "500 mg per capsule — 250 per bottle", ings: [{ name: "L-Lysine", amount: 500, unit: "mg" }], asin: "B01CV1FFSM", lastOrdered: "2026-08-06", dates: "2026-08-06", totalQty: 1, lastPrice: 14.95 },
        { name: "L-Arginine", brand: "Nutricost", servingDesc: "Tablets — 150 per bottle", ings: [{ name: "L-Arginine", amount: 1000, unit: "mg" }], asin: "B07W8XM8H1", lastOrdered: "2026-08-06", dates: "2026-08-06", totalQty: 2, lastPrice: 15.95 },
        { name: "Ashwagandha Extract", brand: "BulkSupplements.com", servingDesc: "1 capsule per serving — 240 per bottle", ings: [], asin: "B0BHM7K95P", lastOrdered: "2026-07-19", dates: "2026-07-19", totalQty: 1, lastPrice: 22.97, extra: "Amount per capsule isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "Lemon Balm Extract", brand: "Nutricost", servingDesc: "Capsules — 120 per bottle, 60 servings", ings: [], asin: "B0FFD3XQTZ", lastOrdered: "2026-07-19", dates: "2026-07-19", totalQty: 1, lastPrice: 9.95, extra: "Amount per serving isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "Sardines in Extra Virgin Olive Oil", brand: "Season", servingDesc: "Tins — 12-pack, 4.37 oz each", ings: [], asin: "B01FR5II4C", lastOrdered: "2026-07-03", dates: "2026-07-03; 2026-05-17", totalQty: 2, lastPrice: 47.47, extra: "A food, not a pill — skinless & boneless, wild caught, 22 g protein per tin. Kept here because it was on the supplement shortlist from your order history." },
        { name: "Ubiquinol", brand: "Nutricost", servingDesc: "Softgels — 120 per bottle", ings: [{ name: "Ubiquinol (active CoQ10)", amount: 100, unit: "mg" }], asin: "B0C87VT8CW", lastOrdered: "2026-06-18", dates: "2026-06-18", totalQty: 1, lastPrice: 40.5 },
        { name: "L-Glutamine Powder", brand: "Nutricost", servingDesc: "Powder — 500 g, 100 servings", ings: [{ name: "L-Glutamine", amount: 5000, unit: "mg" }], asin: "B00SHXE7VK", lastOrdered: "2026-06-17", dates: "2026-06-17; 2026-03-09; 2025-09-30; 2025-07-17", totalQty: 6, lastPrice: 22.95 },
        { name: "Butyrate — Sodium Butyrate", brand: "BodyBio", servingDesc: "Capsules", ings: [], asin: "B0058A9SF0", lastOrdered: "2026-06-17", dates: "2026-06-17; 2025-09-14; 2025-08-09", totalQty: 5, lastPrice: 36.99, extra: "Postbiotic for gut health. Amount per serving isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "Brain Octane C8 MCT Oil", brand: "Bulletproof", servingDesc: "Oil — 32 oz, pack of 2", ings: [], asin: "B08V6HT1KR", lastOrdered: "2026-06-17", dates: "2026-06-17", totalQty: 1, lastPrice: 94.99 },
        { name: "Creatine Monohydrate Powder", brand: "Nutricost", servingDesc: "Powder — 5 g per serving, 100 servings", ings: [{ name: "Creatine Monohydrate", amount: 5000, unit: "mg" }], asin: "B00GL2HMES", lastOrdered: "2026-06-14", dates: "2026-06-14; 2026-03-12; 2025-11-07", totalQty: 4, lastPrice: 21.5, extra: "Ordered in both 500 g and 1 kg tubs." },
        { name: "L-Theanine", brand: "BulkSupplements.com", servingDesc: "1 capsule per serving — 365 per bottle", ings: [{ name: "L-Theanine", amount: 200, unit: "mg" }], asin: "B0C5Y7Q9JH", lastOrdered: "2026-06-08", dates: "2026-06-08", totalQty: 1, lastPrice: 18.97 },
        { name: "Brazil Nuts — Raw, Wild Harvested", brand: "", servingDesc: "Whole nuts — 8 oz bag", ings: [], asin: "B0G1N44CZN", lastOrdered: "2026-06-04", dates: "2026-06-04", totalQty: 1, lastPrice: 14.95, extra: "A food, bought for selenium ('High Selenium' in the listing). Brand isn't named in the Amazon product title." },
        { name: "L-Citrulline", brand: "Nutricost", servingDesc: "500 mg per capsule, 1000 mg per serving — 120 per bottle", ings: [{ name: "L-Citrulline", amount: 500, unit: "mg" }], asin: "B07H4YS9L7", lastOrdered: "2026-06-01", dates: "2026-06-01; 2026-03-19", totalQty: 4, lastPrice: 12.95 },
        { name: "MSM", brand: "BulkSupplements.com", servingDesc: "4 capsules per serving — 240 per bottle", ings: [{ name: "MSM (Methylsulfonylmethane)", amount: 3000, unit: "mg" }], asin: "B0B9Q9P9JZ", lastOrdered: "2026-06-01", dates: "2026-06-01; 2026-03-26", totalQty: 2, lastPrice: 17.97 },
        { name: "B-Complex Plus", brand: "Pure Encapsulations", servingDesc: "Capsules — 120 per bottle", ings: [], asin: "B00JYFN6DU", lastOrdered: "2026-06-01", dates: "2026-06-01; 2026-02-02", totalQty: 3, lastPrice: 42, extra: "Per-vitamin amounts aren't in the Amazon title, so no ingredients are recorded." },
        { name: "PEA — Palmitoylethanolamide", brand: "", servingDesc: "Capsules — 120 per bottle, micronized", ings: [{ name: "Palmitoylethanolamide (PEA)", amount: 600, unit: "mg" }], asin: "B0C8LJT2R4", lastOrdered: "2026-06-01", dates: "2026-06-01; 2026-03-27", totalQty: 2, lastPrice: 29.95, extra: "Brand isn't named in the Amazon product title." },
        { name: "Saccharomyces Boulardii", brand: "Klaire Labs / SFI Health", servingDesc: "Capsules — 60 per bottle", ings: [{ name: "Saccharomyces Boulardii", amount: 5, unit: "billion CFU" }], asin: "B001PYZBPY", lastOrdered: "2026-05-28", dates: "2026-05-28", totalQty: 1, lastPrice: 37.99 },
        { name: "Prebiotic Fiber with Fibersol-2", brand: "NOW Foods", servingDesc: "Powder — 12 oz", ings: [], asin: "B077T2MYK5", lastOrdered: "2026-05-22", dates: "2026-05-22", totalQty: 1, lastPrice: 14.1 },
        { name: "Berberine", brand: "Integrative Therapeutics", servingDesc: "Capsules — 120 per bottle", ings: [], asin: "B0BN6WQMMC", lastOrdered: "2026-05-17", dates: "2026-05-17", totalQty: 1, lastPrice: 63, extra: "Amount per capsule isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "Quercetin", brand: "Pure Encapsulations", servingDesc: "Capsules — 60 per bottle", ings: [{ name: "Quercetin", amount: 500, unit: "mg" }], asin: "B00GZRK124", lastOrdered: "2026-05-17", dates: "2026-05-17; 2025-05-10", totalQty: 4, lastPrice: 29 },
        { name: "Omega-3 Elixir — Fish Oil", brand: "Gorilla Mind", servingDesc: "Softgels — 60 per bottle", ings: [{ name: "Fish Oil", amount: 2210, unit: "mg" }], asin: "B0DDFD3B2B", lastOrdered: "2026-05-17", dates: "2026-05-17; 2026-04-13; 2026-03-26", totalQty: 5, lastPrice: 49.99 },
        { name: "Activated Charcoal", brand: "BulkSupplements.com", servingDesc: "3 capsules per serving — 270 per bottle", ings: [{ name: "Activated Charcoal", amount: 1200, unit: "mg" }], asin: "B0C5KK2KDS", lastOrdered: "2026-05-17", dates: "2026-05-17; 2026-04-13; 2026-03-11; 2026-02-21; 2025-11-17; 2025-11-15", totalQty: 10, lastPrice: 21.97 },
        { name: "Lactobacillus Salivarius Probiotic", brand: "", servingDesc: "Tablets — 240 per bottle (4-month supply)", ings: [{ name: "Lactobacillus Salivarius (LS97)", amount: 3, unit: "billion CFU" }], asin: "B0CWVLQXSJ", lastOrdered: "2026-05-08", dates: "2026-05-08", totalQty: 1, lastPrice: 9.95, extra: "Brand isn't named in the Amazon product title." },
        { name: "Melatonin 60 mg", brand: "Scientific Health Solutions", servingDesc: "Capsules", ings: [{ name: "Melatonin", amount: 60, unit: "mg" }], asin: "B09BS4YF9C", lastOrdered: "2026-04-16", dates: "2026-04-16", totalQty: 1, lastPrice: 32.95, extra: "Listed as a high-dosage melatonin — 60 mg is far above typical 0.5–10 mg doses; worth a deliberate decision before turning this one on." },
        { name: "Melatonin 10 mg — Fast Dissolve", brand: "Natrol", servingDesc: "Fast-dissolve tablets — 100 per bottle, citrus", ings: [{ name: "Melatonin", amount: 10, unit: "mg" }], asin: "B01G0S5EKQ", lastOrdered: "2026-04-15", dates: "2026-04-15", totalQty: 1, lastPrice: 17.32 },
        { name: "MyVitalC — ESS60 Olive Oil Softgels", brand: "MyVitalC", servingDesc: "Softgels — 180 per bottle", ings: [], asin: "B09GB29NDL", lastOrdered: "2026-04-13", dates: "2026-04-13; 2026-03-15; 2026-02-21; 2026-02-11", totalQty: 6, lastPrice: 174.99, extra: "ESS60 (C60) in extra virgin olive oil. Your priciest repeat order on this list." },
        { name: "Pantothenic Acid — Vitamin B-5", brand: "NOW Foods", servingDesc: "Capsules — 250 per bottle", ings: [{ name: "Pantothenic Acid (Vitamin B-5)", amount: 500, unit: "mg" }], asin: "B0013OUQEM", lastOrdered: "2026-04-06", dates: "2026-04-06; 2025-10-01; 2025-09-02", totalQty: 4, lastPrice: 18.36 },
        { name: "Resveratrol", brand: "Double Wood", servingDesc: "Capsules — 120 per bottle", ings: [{ name: "Resveratrol", amount: 500, unit: "mg" }], asin: "B08QBXMHRT", lastOrdered: "2026-04-06", dates: "2026-04-06; 2025-08-13; 2024-12-04", totalQty: 4, lastPrice: 17.95, extra: "Polygonum root extract providing 50% trans-resveratrol, per the listing title." },
        { name: "Omega 3 Fish Oil", brand: "Nutricost", servingDesc: "Softgels — 120 per bottle (40 servings)", ings: [{ name: "Fish Oil", amount: 2500, unit: "mg" }, { name: "EPA", amount: 1200, unit: "mg" }, { name: "DHA", amount: 850, unit: "mg" }], asin: "B098KLWZHN", lastOrdered: "2026-03-15", dates: "2026-03-15; 2026-02-09", totalQty: 3, lastPrice: 19.95 },
        { name: "Hi-Lyte K700 Electrolyte Caps", brand: "Hi-Lyte", servingDesc: "Capsules — 40 servings", ings: [], asin: "B07RCVX27G", lastOrdered: "2026-03-15", dates: "2026-03-15", totalQty: 1, lastPrice: 20.96, extra: "High-potassium keto electrolyte caps; amounts aren't in the Amazon title, so no ingredients are recorded." },
        { name: "L-Serine", brand: "BulkSupplements.com", servingDesc: "3 capsules per serving — 180 per bottle", ings: [], asin: "B0B9PZ5TYK", lastOrdered: "2026-03-15", dates: "2026-03-15; 2026-01-18", totalQty: 4, lastPrice: 17.97, extra: "Amount per serving isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "Zinc with Copper", brand: "Bulletproof", servingDesc: "Capsules — 120 per bottle", ings: [], asin: "B08XQXQG47", lastOrdered: "2026-03-11", dates: "2026-03-11; 2025-09-11; 2025-03-09", totalQty: 5, lastPrice: 29.95, extra: "Amounts aren't in the Amazon title, so no ingredients are recorded." },
        { name: "MTE Healthy Energy Drink Powder", brand: "MTE", servingDesc: "Drink pouches — 24 per box", ings: [], asin: "B0DXL6JN43", lastOrdered: "2026-03-10", dates: "2026-03-10", totalQty: 1, lastPrice: 59.99, extra: "Caffeine-free energy / focus drink mix with paraxanthine." },
        { name: "Alaway Antihistamine Eye Drops", brand: "Alaway", type: "medication", servingDesc: "Eye drops — 0.34 fl oz, pack of 2", ings: [], asin: "B012H5W7W4", lastOrdered: "2026-03-10", dates: "2026-03-10", totalQty: 1, lastPrice: 19.17, extra: "For itchy eyes — fits alongside your histamine management." },
        { name: "Mitopure — Urolithin A", brand: "Timeline", servingDesc: "Softgels", ings: [], asin: "B0F5FPSDQV", lastOrdered: "2026-03-09", dates: "2026-03-09; 2026-02-09; 2026-01-03", totalQty: 4, lastPrice: 125, extra: "Amount per softgel isn't in the Amazon title, so no ingredient amount is recorded." },
        { name: "MotilPro", brand: "Pure Encapsulations", servingDesc: "Capsules — 180 per bottle", ings: [], asin: "B004BD4MWY", lastOrdered: "2026-02-23", dates: "2026-02-23; 2025-10-05; 2025-08-22", totalQty: 3, lastPrice: 66, extra: "For gut motility. Ingredient amounts aren't in the Amazon title, so none are recorded." },
        { name: "Benfotiamine", brand: "Source Naturals", servingDesc: "Tablets — 120 per bottle", ings: [{ name: "Benfotiamine", amount: 150, unit: "mg" }], asin: "B0014GXEDE", lastOrdered: "2026-02-23", dates: "2026-02-23; 2025-12-28; 2025-12-06", totalQty: 5, lastPrice: 20.81, extra: "Fat-soluble form of vitamin B-1 (thiamine)." },
        { name: "RYZE Mushroom Coffee", brand: "RYZE Superfoods", servingDesc: "Instant coffee — 30 servings", ings: [], asin: "B0DJWV4BQ1", lastOrdered: "2025-12-13", dates: "2025-12-13", totalQty: 1, lastPrice: 47.99, extra: "6 adaptogenic mushrooms + MCT oil, per the listing title." },
        { name: "Iron Bisglycinate", brand: "Thorne", servingDesc: "Capsules — 60 servings", ings: [{ name: "Iron (bisglycinate)", amount: 25, unit: "mg" }], asin: "B0797GZDZL", lastOrdered: "2025-12-11", dates: "2025-12-11", totalQty: 1, lastPrice: 15 },
        { name: "MyReuteri Starter Culture", brand: "MyReuteri", servingDesc: "Culture starter — makes 6 quarts", ings: [], asin: "B0FQBL2GLY", lastOrdered: "2025-11-30", dates: "2025-11-30", totalQty: 1, lastPrice: 34, extra: "LRDR + 13 other live cultures with FOS, for making yogurt-like cultured dairy (developed with Dr. William Davis)." },
        { name: "Inulin Prebiotic Fiber", brand: "It's Just!", servingDesc: "Powder — chicory root", ings: [], asin: "B085LV5ZSZ", lastOrdered: "2025-11-30", dates: "2025-11-30", totalQty: 1, lastPrice: 27.99 },
        { name: "Biothin Probiotic", brand: "Dr. Mercola", servingDesc: "Capsules — 30 per bottle", ings: [], asin: "B09CSFTM24", lastOrdered: "2025-11-30", dates: "2025-11-30", totalQty: 1, lastPrice: 23.97 },
        { name: "Molybdenum", brand: "Seeking Health", servingDesc: "Capsules — 90 per bottle", ings: [{ name: "Molybdenum", amount: 500, unit: "mcg" }], asin: "B009LQX8L2", lastOrdered: "2025-11-21", dates: "2025-11-21", totalQty: 2, lastPrice: 18 },
        { name: "L-Carnosine", brand: "Nutricost", servingDesc: "Capsules — 120 per bottle", ings: [{ name: "L-Carnosine", amount: 500, unit: "mg" }], asin: "B07XSHFN58", lastOrdered: "2025-10-29", dates: "2025-10-29; 2025-10-18", totalQty: 3, lastPrice: 34.95 },
        { name: "Glutathione", brand: "NOW Foods", servingDesc: "Veg capsules — 120 per bottle", ings: [{ name: "Glutathione", amount: 500, unit: "mg" }], asin: "B0B3JKB3WG", lastOrdered: "2025-10-22", dates: "2025-10-22; 2025-08-23", totalQty: 2, lastPrice: 33.98, extra: "Also contains milk thistle extract & alpha lipoic acid, per the listing title (their amounts aren't stated there)." },
        { name: "Vitamin B6", brand: "Nutricost", servingDesc: "Capsules — 240 per bottle", ings: [{ name: "Vitamin B6 (Pyridoxine HCl)", amount: 25, unit: "mg" }], asin: "B0B3LHGB19", lastOrdered: "2025-10-04", dates: "2025-10-04; 2025-06-01", totalQty: 2, lastPrice: 11.95 },
      ];
      // Reconciliation: an earlier pass already added most of these to the
      // tracker as raw Amazon listing titles with status "paused" (notes
      // marked "Added from Amazon order history"). Those rows hold no
      // owner-entered data, so a match is updated in place with the clean
      // catalog data and set to "off" (the owner's ask: not-taking items
      // hidden in the Catalog), and any extra rows for the same product
      // (duplicate ASINs, pack sizes, flavors) are deleted. Rows from this
      // import are recognised by the ASIN in their notes. Products the
      // owner tracks themselves (no import marker in notes) are never
      // touched, except that an exact name match is treated as already
      // present and skipped.
      const MATCH_KEYS: Record<string, string[]> = {
        B09BNYCZXZ: ["h formula"], B0FTGLCJW2: ["lmnt zero sugar"], B0B9HRGK11: ["black cumin"],
        B098KGFLX5: ["cayenne"], B0B69J6S7Y: ["nutricost iodine"], B0B628D7ZN: ["beyond brew"],
        B0BQX2D3B6: ["essential t2"], B0C3SFJRQD: ["l-carnitine"], B0F6NMS39Y: ["cata-kor"],
        B074YPW4RS: ["recalcia"], B0CC72PMQF: ["5-htp"], B0BV8BM7LX: ["liposomal vitamin c"],
        B0GV11RRLC: ["naturdao"], B002D2JYYG: ["cortisol manager"], B079YF1K1B: ["phosphatidylserine"],
        B01CV1FFSM: ["l-lysine"], B07W8XM8H1: ["l-arginine"], B0BHM7K95P: ["ashwagandha"],
        B0FFD3XQTZ: ["lemon balm"], B01FR5II4C: ["sardines"], B0C87VT8CW: ["ubiquinol"],
        B00SHXE7VK: ["l-glutamine"], B0058A9SF0: ["butyrate"], B08V6HT1KR: ["brain octane"],
        B00GL2HMES: ["creatine monohydrate"], B0C5Y7Q9JH: ["l-theanine"], B0G1N44CZN: ["brazil nuts"],
        B07H4YS9L7: ["l-citrulline"], B0B9Q9P9JZ: ["msm capsules"], B00JYFN6DU: ["b-complex plus"],
        B0C8LJT2R4: ["palmitoylethanolamide"], B001PYZBPY: ["saccharomyces boulardii"], B077T2MYK5: ["prebiotic fiber with fibersol"],
        B0BN6WQMMC: ["berberine"], B00GZRK124: ["quercetin"], B0DDFD3B2B: ["omega-3 elixir"],
        B0C5KK2KDS: ["activated charcoal"], B0CWVLQXSJ: ["lactobacillus salivarius"], B09BS4YF9C: ["melatonin 60mg"],
        B01G0S5EKQ: ["natrol melatonin"], B09GB29NDL: ["myvitalc"], B0013OUQEM: ["pantothenic acid"],
        B08QBXMHRT: ["resveratrol supplement 500mg"], B098KLWZHN: ["nutricost omega 3"], B07RCVX27G: ["hi-lyte"],
        B0B9PZ5TYK: ["l-serine"], B08XQXQG47: ["zinc with copper"], B0DXL6JN43: ["mte healthy energy"],
        B012H5W7W4: ["alaway"], B0F5FPSDQV: ["mitopure"], B004BD4MWY: ["motilpro"],
        B0014GXEDE: ["benfotiamine"], B0DJWV4BQ1: ["ryze"], B0797GZDZL: ["iron bisglycinate"],
        B0FQBL2GLY: ["myreuteri"], B085LV5ZSZ: ["inulin prebiotic"], B09CSFTM24: ["biothin"],
        B009LQX8L2: ["molybdenum"], B07XSHFN58: ["l-carnosine"], B0B3JKB3WG: ["glutathione 500"],
        B0B3LHGB19: ["vitamin b6"],
      };
      const existing = await db.select().from(schema.products);
      const isImportRow = (notes: string) => notes.includes("Added from Amazon order history") || notes.includes("Imported from your Amazon order history");
      const consumed = new Set<number>();
      const now = new Date();
      let added = 0;
      let updated = 0;
      let removed = 0;
      let skipped = 0;

      async function writeIngredients(productId: number, item: CatItem) {
        await db.delete(schema.productIngredients).where(eq(schema.productIngredients.productId, productId));
        if (item.ings.length) {
          await db.insert(schema.productIngredients).values(item.ings.map((i) => ({
            productId, name: i.name, amountPerServing: i.amount, unit: i.unit,
            elementalAmount: null, elementalUnit: null, elementalLabel: null,
          })));
        }
      }
      async function deleteProductRows(productId: number) {
        await db.delete(schema.productIngredients).where(eq(schema.productIngredients.productId, productId));
        await db.delete(schema.productFillers).where(eq(schema.productFillers.productId, productId));
        await db.delete(schema.productTimes).where(eq(schema.productTimes.productId, productId));
        await db.delete(schema.products).where(eq(schema.products.id, productId));
      }

      for (const item of catalog) {
        const notes = [
          `Imported from your Amazon order history — ASIN ${item.asin}. Last ordered ${item.lastOrdered}; order dates: ${item.dates}; ${item.totalQty} ordered in total; last price $${item.lastPrice.toFixed(2)}.`,
          "Not currently taking — kept in the Catalog until you turn it on. Whether you still have any in stock isn't confirmed.",
          item.extra ?? "",
        ].filter(Boolean).join("\n");
        const values = {
          name: item.name,
          brand: item.brand,
          type: item.type ?? "supplement" as const,
          servingDesc: item.servingDesc,
          servingsPerDay: 1,
          timing: "",
          status: "off" as const,
          whyTaking: "",
          effectWanted: "",
          effectsWatch: "",
          notes,
          infoUrl: "",
          inStock: false,
          updatedAt: now,
        };
        const keys = MATCH_KEYS[item.asin] ?? [];
        const matches = existing.filter((p) => !consumed.has(p.id) && isImportRow(p.notes) && (
          p.notes.includes(item.asin)
          || p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
          || keys.some((k) => p.name.toLowerCase().includes(k))
        ));
        const first = matches[0];
        if (first) {
          await db.update(schema.products).set(values).where(eq(schema.products.id, first.id));
          await db.delete(schema.productTimes).where(eq(schema.productTimes.productId, first.id));
          await writeIngredients(first.id, item);
          consumed.add(first.id);
          updated += 1;
          for (const dup of matches.slice(1)) {
            await deleteProductRows(dup.id);
            consumed.add(dup.id);
            removed += 1;
          }
          continue;
        }
        const exactElsewhere = existing.some((p) => !consumed.has(p.id) && p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
        if (exactElsewhere) { skipped += 1; continue; }
        const res = await db.insert(schema.products).values({ ...values, createdAt: now }).returning({ id: schema.products.id });
        const row = res[0];
        if (!row) { skipped += 1; continue; }
        consumed.add(row.id);
        await writeIngredients(row.id, item);
        added += 1;
      }
      if (added > 0 || updated > 0 || removed > 0) ctx.invalidateQueries();
      return { ok: true, added, updated, removed, skipped, total: catalog.length };
    },
  }),

  saveProduct: defineAction({
    description: "Create or fully update one product, replacing its ingredients, fillers, and time entries with the ones supplied.",
    request: z.object({
      id: z.number().nullable().optional(),
      name: z.string().min(1),
      brand: z.string().default(""),
      type: z.enum(["supplement", "medication"]).default("supplement"),
      servingDesc: z.string().default(""),
      servingsPerDay: z.number().min(0).default(1),
      timing: z.string().default(""),
      times: z.array(timeInput).default([]),
      status: z.enum(["on", "off", "paused"]).default("on"),
      whyTaking: z.string().default(""),
      effectWanted: z.string().default(""),
      effectsWatch: z.string().default(""),
      notes: z.string().default(""),
      pillForm: z.string().default(""),
      pillColor: z.string().default(""),
      pillSize: z.string().default(""),
      pillMarkings: z.string().default(""),
      infoUrl: z.string().default(""),
      reviewCadence: z.enum(["none", "weekly", "monthly"]).default("none"),
      reviewNote: z.string().default(""),
      lookInto: z.boolean().default(false),
      tellChristy: z.boolean().default(false),
      seenSource: z.string().default(""),
      inStock: z.boolean().default(true),
      ingredients: z.array(ingredientInput).default([]),
      fillers: z.array(z.string()).default([]),
    }),
    response: z.object({ ok: z.literal(true), id: z.number() }),
    async handler(ctx, args): Promise<{ ok: true; id: number }> {
      const db = ctx.db<typeof schema>();
      let productId: number;
      const cleanTimes: TimeEntry[] = args.times
        .map((t) => ({ timeLabel: t.timeLabel.trim(), conditional: t.conditional, conditionLabel: t.conditional ? (t.conditionLabel?.trim() || null) : null }))
        .filter((t) => t.timeLabel.length > 0);
      const values = {
        name: args.name.trim(),
        brand: args.brand.trim(),
        type: args.type,
        servingDesc: args.servingDesc,
        servingsPerDay: args.servingsPerDay,
        timing: cleanTimes.length ? timingSummary(cleanTimes) : args.timing,
        status: args.status,
        whyTaking: args.whyTaking,
        effectWanted: args.effectWanted,
        effectsWatch: args.effectsWatch,
        notes: args.notes,
        pillForm: args.pillForm,
        pillColor: args.pillColor,
        pillSize: args.pillSize,
        pillMarkings: args.pillMarkings,
        infoUrl: args.infoUrl.trim(),
        reviewCadence: args.reviewCadence,
        reviewNote: args.reviewNote,
        lookInto: args.lookInto,
        tellChristy: args.tellChristy,
        seenSource: args.seenSource,
        inStock: args.inStock,
        updatedAt: new Date(),
      };
      if (args.id) {
        await db.update(schema.products).set(values).where(eq(schema.products.id, args.id));
        productId = args.id;
        await db.delete(schema.productIngredients).where(eq(schema.productIngredients.productId, productId));
        await db.delete(schema.productFillers).where(eq(schema.productFillers.productId, productId));
        await db.delete(schema.productTimes).where(eq(schema.productTimes.productId, productId));
      } else {
        const res = await db.insert(schema.products).values({ ...values, createdAt: new Date() }).returning({ id: schema.products.id });
        const row = res[0];
        if (!row) throw new Error("saveProduct: insert failed");
        productId = row.id;
      }
      const ings = args.ingredients.filter((i) => i.name.trim().length > 0);
      if (ings.length) {
        await db.insert(schema.productIngredients).values(ings.map((i) => ({
          productId,
          name: i.name.trim(),
          amountPerServing: i.amountPerServing ?? null,
          unit: i.unit || "mg",
          elementalAmount: i.elementalAmount ?? null,
          elementalUnit: i.elementalUnit ?? null,
          elementalLabel: i.elementalLabel ?? null,
        })));
      }
      const fills = args.fillers.map((f) => f.trim()).filter(Boolean);
      if (fills.length) {
        await db.insert(schema.productFillers).values(fills.map((f) => ({ productId, name: f })));
      }
      if (cleanTimes.length) {
        await db.insert(schema.productTimes).values(cleanTimes.map((t, idx) => ({
          productId, timeLabel: t.timeLabel, conditional: t.conditional, conditionLabel: t.conditionLabel, sortOrder: idx,
        })));
      }
      ctx.invalidateQueries();
      return { ok: true, id: productId };
    },
  }),

  setProductPhoto: defineAction({
    description: "Store an uploaded photo of a product's pill as the product's appearance photo.",
    request: z.object({
      productId: z.number(),
      dataBase64: z.string().min(1),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    }),
    response: z.object({ ok: z.literal(true), url: z.string().nullable() }),
    async handler(ctx, args): Promise<{ ok: true; url: string | null }> {
      const db = ctx.db<typeof schema>();
      const binary = atob(args.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const key = `pill-photo/product-${args.productId}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mimeType });
      await db.update(schema.products).set({ pillPhotoKey: key, updatedAt: new Date() }).where(eq(schema.products.id, args.productId));
      ctx.invalidateQueries();
      let url: string | null = null;
      try {
        url = await ctx.blobs.getUrl(key);
      } catch {
        url = null;
      }
      return { ok: true, url };
    },
  }),

  removeProductPhoto: defineAction({
    description: "Remove a product's pill appearance photo.",
    request: z.object({ productId: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.products).set({ pillPhotoKey: null, updatedAt: new Date() }).where(eq(schema.products.id, args.productId));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteProduct: defineAction({
    description: "Delete one product along with its ingredients, fillers, and time entries.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.productIngredients).where(eq(schema.productIngredients.productId, args.id));
      await db.delete(schema.productFillers).where(eq(schema.productFillers.productId, args.id));
      await db.delete(schema.productTimes).where(eq(schema.productTimes.productId, args.id));
      await db.delete(schema.products).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setProductStatus: defineAction({
    description: "Set one product's status to on, paused, or off.",
    request: z.object({ id: z.number(), status: z.enum(["on", "off", "paused"]) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.products).set({ status: args.status, updatedAt: new Date() }).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setProductFlags: defineAction({
    description: "Set the look-into-soon and/or tell-Christy flags on one product; omitted flags are left unchanged.",
    request: z.object({ id: z.number(), lookInto: z.boolean().optional(), tellChristy: z.boolean().optional() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const patch: { lookInto?: boolean; tellChristy?: boolean; updatedAt: Date } = { updatedAt: new Date() };
      if (args.lookInto !== undefined) patch.lookInto = args.lookInto;
      if (args.tellChristy !== undefined) patch.tellChristy = args.tellChristy;
      await db.update(schema.products).set(patch).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  markProductReviewed: defineAction({
    description: "Stamp a product as reviewed today, which reschedules its next Sunday-afternoon periodic review.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true), lastReviewedAt: z.number() }),
    async handler(ctx, args): Promise<{ ok: true; lastReviewedAt: number }> {
      const db = ctx.db<typeof schema>();
      const now = new Date();
      await db.update(schema.products).set({ lastReviewedAt: now, updatedAt: now }).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true, lastReviewedAt: now.getTime() };
    },
  }),

  clearProductReviewed: defineAction({
    description: "Clear a product's last-reviewed stamp, making it due at the coming Sunday review again.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.products).set({ lastReviewedAt: null, updatedAt: new Date() }).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  saveLimit: defineAction({
    description: "Create or update a daily ceiling for one ingredient, used to flag totals that exceed it.",
    request: z.object({
      id: z.number().nullable().optional(),
      ingredientName: z.string().min(1),
      ceilingAmount: z.number().positive(),
      unit: z.string().default("mg"),
      sourceNote: z.string().default(""),
    }),
    response: z.object({ ok: z.literal(true), id: z.number() }),
    async handler(ctx, args): Promise<{ ok: true; id: number }> {
      const db = ctx.db<typeof schema>();
      if (args.id) {
        await db.update(schema.ingredientLimits).set({ ingredientName: args.ingredientName.trim(), ceilingAmount: args.ceilingAmount, unit: args.unit, sourceNote: args.sourceNote }).where(eq(schema.ingredientLimits.id, args.id));
        ctx.invalidateQueries();
        return { ok: true, id: args.id };
      }
      const res = await db.insert(schema.ingredientLimits).values({ ingredientName: args.ingredientName.trim(), ceilingAmount: args.ceilingAmount, unit: args.unit, sourceNote: args.sourceNote }).returning({ id: schema.ingredientLimits.id });
      const row = res[0];
      if (!row) throw new Error("saveLimit failed");
      ctx.invalidateQueries();
      return { ok: true, id: row.id };
    },
  }),

  deleteLimit: defineAction({
    description: "Delete one ingredient's daily ceiling.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.ingredientLimits).where(eq(schema.ingredientLimits.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  addBlacklistTerm: defineAction({
    description: "Add a term to the filler blacklist so any product containing that filler gets flagged.",
    request: z.object({ term: z.string().min(1) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const existing = await db.select().from(schema.fillerBlacklist);
      if (!existing.some((e) => e.term.toLowerCase() === args.term.trim().toLowerCase())) {
        await db.insert(schema.fillerBlacklist).values({ term: args.term.trim().toLowerCase() });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteBlacklistTerm: defineAction({
    description: "Remove one term from the filler blacklist.",
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.fillerBlacklist).where(eq(schema.fillerBlacklist.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
