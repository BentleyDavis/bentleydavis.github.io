// Actions for Walk Tracker.
//
// Storage model:
//   walks          — one row per finished / ended-early walk (history)
//   active_workout — singleton row (id 1) with the in-progress workout
//                    state as JSON, so the timer recovers its place
//   settings       — singleton row (id 1) with editable settings as JSON
//
// listWalks / getWalk are the published read surface the assistant uses
// to sync walk history into the Exercise Tracker.

import {
defineAction,
z,
type ActionsModule,
type Ctx,
} from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const settingsSchema = z.object({
  fastTargetHr: z.number().int().min(60).max(220),
  recoveryDropHr: z.number().int().min(5).max(80),
  fastMinutes: z.number().int().min(1).max(10),
  rounds: z.literal(3),
  voice: z.boolean(),
  beeps: z.boolean(),
  vibration: z.boolean(),
});

const DEFAULT_SETTINGS: z.infer<typeof settingsSchema> = {
  fastTargetHr: 150,
  recoveryDropHr: 30,
  fastMinutes: 3,
  rounds: 3,
  voice: true,
  beeps: true,
  vibration: true,
};

const hrSampleSchema = z.object({
  t: z.number().int().positive(), // epoch ms
  bpm: z.number().int().min(20).max(250),
});

const activeStateSchema = z.object({
  status: z.enum(["running", "paused", "done"]),
  // Anchor: wall-clock ms when the workout started.
  startTs: z.number().int().positive(),
  // Total ms spent paused before the current pause (if any).
  pausedTotalMs: z.number().int().nonnegative(),
  // Wall-clock ms when the current pause began, or null when running.
  pauseStartTs: z.number().int().positive().nullable(),
  config: z.object({
    fastMinutes: z.number().int().min(1).max(10),
    rounds: z.literal(3),
    fastTargetHr: z.number().int().min(60).max(220),
    recoveryDropHr: z.number().int().min(5).max(80),
  }),
  // Segment the workout is currently in, and the active-elapsed second
  // (pauses excluded) at which that segment began.
  segIndex: z.number().int().min(0).max(6),
  segStartActiveSec: z.number().nonnegative(),
  // Seconds spent in recovery segments already finished (recovery is
  // untimed, so the halfway cue is computed on timed elapsed only).
  recoveryTotalSec: z.number().nonnegative(),
  // Per-round peak HR as entered by the user or tracked from a connected
  // heart-rate strap; null = not recorded.
  peaks: z.array(z.number().int().min(30).max(250).nullable()),
  // Every HR sample from a connected strap, oldest first.
  hrSamples: z.array(hrSampleSchema).max(20000),
  halfwayFired: z.boolean(),
  savedWalkId: z.number().int().positive().nullable(),
});

const walkSchema = z.object({
  id: z.number(),
  started_at: z.string(),
  ended_at: z.string(),
  rounds_completed: z.number(),
  rounds_planned: z.number(),
  total_seconds: z.number(),
  fast_target_hr: z.number(),
  recovery_drop_hr: z.number(),
  fast_minutes: z.number(),
  peaks: z.array(z.number().nullable()),
  hr_samples: z.array(
    z.object({ at: z.string(), bpm: z.number() }),
  ),
  ended_early: z.boolean(),
});

type WalkRow = typeof schema.walks.$inferSelect;

function toWalk(row: WalkRow): z.infer<typeof walkSchema> {
  let peaks: (number | null)[] = [];
  try {
    const parsed: unknown = JSON.parse(row.peaksJson);
    if (Array.isArray(parsed)) {
      peaks = parsed.map((p) => (typeof p === "number" ? p : null));
    }
  } catch {
    peaks = [];
  }
  let hrSamples: { at: string; bpm: number }[] = [];
  try {
    const parsed: unknown = JSON.parse(row.hrSamplesJson);
    if (Array.isArray(parsed)) {
      hrSamples = parsed
        .filter(
          (s): s is { t: number; bpm: number } =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as { t?: unknown }).t === "number" &&
            typeof (s as { bpm?: unknown }).bpm === "number",
        )
        .map((s) => ({ at: new Date(s.t).toISOString(), bpm: s.bpm }));
    }
  } catch {
    hrSamples = [];
  }
  return {
    id: row.id,
    started_at: row.startedAt.toISOString(),
    ended_at: row.endedAt.toISOString(),
    rounds_completed: row.roundsCompleted,
    rounds_planned: row.roundsPlanned,
    total_seconds: row.totalSeconds,
    fast_target_hr: row.fastTargetHr,
    recovery_drop_hr: row.recoveryDropHr,
    fast_minutes: row.fastMinutes,
    peaks,
    hr_samples: hrSamples,
    ended_early: row.endedEarly === 1,
  };
}

async function loadSettings(
  ctx: Ctx,
): Promise<z.infer<typeof settingsSchema>> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(row.settingsJson));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export const Actions = {
  getState: defineAction({
    request: z.object({}),
    response: z.object({
      settings: settingsSchema,
      active: activeStateSchema.nullable(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const current = await loadSettings(ctx);
      const rows = await db
        .select()
        .from(schema.activeWorkout)
        .where(eq(schema.activeWorkout.id, 1))
        .limit(1);
      let active: z.infer<typeof activeStateSchema> | null = null;
      const row = rows[0];
      if (row) {
        try {
          const parsed = activeStateSchema.safeParse(
            JSON.parse(row.stateJson),
          );
          if (parsed.success) active = parsed.data;
        } catch {
          active = null;
        }
      }
      return { settings: current, active };
    },
  }),

  saveSettings: defineAction({
    request: z.object({ settings: settingsSchema }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const json = JSON.stringify(args.settings);
      const existing = await db
        .select({ id: schema.settings.id })
        .from(schema.settings)
        .where(eq(schema.settings.id, 1))
        .limit(1);
      if (existing[0]) {
        await db
          .update(schema.settings)
          .set({ settingsJson: json, updatedAt: new Date() })
          .where(eq(schema.settings.id, 1));
      } else {
        await db
          .insert(schema.settings)
          .values({ id: 1, settingsJson: json });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  saveActive: defineAction({
    request: z.object({ state: activeStateSchema }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const json = JSON.stringify(args.state);
      const existing = await db
        .select({ id: schema.activeWorkout.id })
        .from(schema.activeWorkout)
        .where(eq(schema.activeWorkout.id, 1))
        .limit(1);
      if (existing[0]) {
        await db
          .update(schema.activeWorkout)
          .set({ stateJson: json, updatedAt: new Date() })
          .where(eq(schema.activeWorkout.id, 1));
      } else {
        await db
          .insert(schema.activeWorkout)
          .values({ id: 1, stateJson: json });
      }
      return { ok: true };
    },
  }),

  clearActive: defineAction({
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.activeWorkout)
        .where(eq(schema.activeWorkout.id, 1));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  saveWalk: defineAction({
    request: z.object({
      started_at: z.string().datetime(),
      ended_at: z.string().datetime(),
      rounds_completed: z.number().int().min(0).max(3),
      rounds_planned: z.literal(3),
      total_seconds: z.number().int().nonnegative(),
      fast_target_hr: z.number().int().min(60).max(220),
      recovery_drop_hr: z.number().int().min(5).max(80),
      fast_minutes: z.number().int().min(1).max(10),
      peaks: z.array(z.number().int().min(30).max(250).nullable()).max(3),
      hr_samples: z.array(hrSampleSchema).max(20000).default([]),
      ended_early: z.boolean(),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.walks)
        .values({
          startedAt: new Date(args.started_at),
          endedAt: new Date(args.ended_at),
          roundsCompleted: args.rounds_completed,
          roundsPlanned: args.rounds_planned,
          totalSeconds: args.total_seconds,
          fastTargetHr: args.fast_target_hr,
          recoveryDropHr: args.recovery_drop_hr,
          fastMinutes: args.fast_minutes,
          peaksJson: JSON.stringify(args.peaks),
          hrSamplesJson: JSON.stringify(args.hr_samples),
          endedEarly: args.ended_early ? 1 : 0,
        })
        .returning({ id: schema.walks.id });
      const inserted = result[0];
      if (!inserted) throw new Error("saveWalk: insert returned no rows");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  listWalks: defineAction({
    request: z.object({
      limit: z.number().int().positive().max(200).default(50),
    }),
    response: z.object({ walks: z.array(walkSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.walks)
        .orderBy(desc(schema.walks.startedAt), desc(schema.walks.id))
        .limit(args.limit);
      return { walks: rows.map(toWalk) };
    },
  }),

  getWalk: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ walk: walkSchema.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.walks)
        .where(eq(schema.walks.id, args.id))
        .limit(1);
      const row = rows[0];
      return { walk: row ? toWalk(row) : null };
    },
  }),

  clearHistory: defineAction({
    request: z.object({}),
    response: z.object({ ok: z.literal(true), deleted: z.number() }),
    async handler(ctx): Promise<{ ok: true; deleted: number }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .delete(schema.walks)
        .returning({ id: schema.walks.id });
      ctx.invalidateQueries();
      return { ok: true, deleted: rows.length };
    },
  }),
} satisfies ActionsModule;
