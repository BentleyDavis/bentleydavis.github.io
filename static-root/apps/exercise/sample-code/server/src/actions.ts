import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const logSchema = z.object({
  id: z.number(),
  sessionId: z.number(),
  exerciseName: z.string(),
  weightLabel: z.string(),
  reps: z.number(),
  toFailure: z.boolean(),
  targetLabel: z.string(),
  verdict: z.string(),
  nextWeightLabel: z.string(),
  notes: z.string().nullable(),
  sortOrder: z.number(),
});

const sessionSchema = z.object({
  id: z.number(),
  date: z.string(),
  dayType: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  durationMin: z.number().nullable(),
  createdAt: z.string(),
  logs: z.array(logSchema),
});

const dashboardResponse = z.object({
  sessions: z.array(sessionSchema),
  totalSessions: z.number(),
  totalSets: z.number(),
  lastDate: z.string().nullable(),
});

export const Actions = {
  getDashboard: defineAction({
    request: z.object({}),
    response: dashboardResponse,
    async handler(ctx): Promise<z.infer<typeof dashboardResponse>> {
      const db = ctx.db<typeof schema>();
      const sessions = await db.select().from(schema.sessions).orderBy(desc(schema.sessions.date), desc(schema.sessions.id));
      const allLogs = await db.select().from(schema.exerciseLogs).orderBy(asc(schema.exerciseLogs.sortOrder), asc(schema.exerciseLogs.id));
      const bySession = new Map<number, z.infer<typeof logSchema>[]>();
      for (const l of allLogs) {
        const arr = bySession.get(l.sessionId) ?? [];
        arr.push({
          id: l.id,
          sessionId: l.sessionId,
          exerciseName: l.exerciseName,
          weightLabel: l.weightLabel,
          reps: l.reps,
          toFailure: l.toFailure === 1,
          targetLabel: l.targetLabel,
          verdict: l.verdict,
          nextWeightLabel: l.nextWeightLabel,
          notes: l.notes,
          sortOrder: l.sortOrder,
        });
        bySession.set(l.sessionId, arr);
      }
      const mapped = sessions.map((s) => ({
        id: s.id,
        date: s.date,
        dayType: s.dayType,
        title: s.title,
        notes: s.notes,
        durationMin: s.durationMin,
        createdAt: s.createdAt.toISOString(),
        logs: bySession.get(s.id) ?? [],
      }));
      return {
        sessions: mapped,
        totalSessions: mapped.length,
        totalSets: allLogs.length,
        lastDate: mapped[0]?.date ?? null,
      };
    },
  }),

  seedInitialData: defineAction({
    request: z.object({}),
    response: z.object({ seeded: z.boolean(), sessionId: z.number().nullable() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const existing = await db.select().from(schema.sessions).where(eq(schema.sessions.date, "2026-10-26"));
      const hitA = existing.find((s) => s.dayType === "HIT A");
      if (hitA) return { seeded: false, sessionId: hitA.id };

      const inserted = await db.insert(schema.sessions).values({
        date: "2026-10-26",
        dayType: "HIT A",
        title: "HIT Day A — First Session",
        notes: "Slow HIT, single set to form failure. Rest rule: wait until HR drops ≥30 bpm from peak and breathing allows full sentences, up to ~5 min.",
        durationMin: null,
      }).returning({ id: schema.sessions.id });
      const sid = inserted[0]?.id;
      if (!sid) throw new Error("seed failed");

      const logs = [
        { exerciseName: "Marcy Chest Press", weightLabel: "4 plates", reps: 9, toFailure: 1, targetLabel: "8–12 reps", verdict: "In range — keep", nextWeightLabel: "4 plates — aim 10–12 before 5 plates (~83 lb front-press)", notes: "Pin was at 4 plates by accident (planned 3). 9 is in target, so 4 becomes the working weight.", sortOrder: 1 },
        { exerciseName: "Goblet Squat", weightLabel: "35 lb — single dumbbell", reps: 11, toFailure: 1, targetLabel: "10–15 reps (legs)", verdict: "In range — keep", nextWeightLabel: "35 lb — aim 12–15 before trying a single 40", notes: "Single 35 lb dumbbell held at chest. You only have one 35, not a pair — that is correct for this lift.", sortOrder: 2 },
        { exerciseName: "Marcy Leg Extension", weightLabel: "4 plates", reps: 10, toFailure: 1, targetLabel: "10–15 reps (legs)", verdict: "In range, low end — keep", nextWeightLabel: "4 plates — aim 11–15 before 5 plates", notes: "At the low end of the leg target. Build reps before adding a plate.", sortOrder: 3 },
        { exerciseName: "Marcy Lat Pulldown", weightLabel: "4 plates (~60 lb)", reps: 15, toFailure: 0, targetLabel: "8–12 reps", verdict: "Above range — go up", nextWeightLabel: "5 plates (~70 lb lat-pull)", notes: "15 reps and could have done more. Front pulldown only: bar in front of face to upper chest / collarbone, never behind neck. No thigh hold-down on the MWM-990 — feet braced on floor; if your body lifts, weight is too heavy.", sortOrder: 4 },
        { exerciseName: "Seated Dumbbell Shoulder Press", weightLabel: "10 lb each hand", reps: 10, toFailure: 1, targetLabel: "8–12 reps", verdict: "In range — keep", nextWeightLabel: "10 lb — aim 11–12; stretch reps/tempo next (no 12/15 pair to jump to)", notes: "Seated with back support, ribs down, no arch to finish.", sortOrder: 5 },
      ];
      for (const l of logs) {
        await db.insert(schema.exerciseLogs).values({ sessionId: sid, ...l });
      }
      ctx.invalidateQueries();
      return { seeded: true, sessionId: sid };
    },
  }),

  createSession: defineAction({
    request: z.object({
      date: z.string().min(10),
      dayType: z.enum(["HIT A", "HIT B", "Walk", "Other"]),
      title: z.string().min(1),
      notes: z.string().optional(),
      durationMin: z.number().int().positive().nullable().optional(),
      logs: z.array(z.object({
        exerciseName: z.string().min(1),
        weightLabel: z.string().min(1),
        reps: z.number().int().min(0).max(200),
        toFailure: z.boolean(),
        targetLabel: z.string().optional(),
        verdict: z.string().optional(),
        nextWeightLabel: z.string().optional(),
        notes: z.string().optional(),
      })).default([]),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const ins = await db.insert(schema.sessions).values({
        date: args.date,
        dayType: args.dayType,
        title: args.title,
        notes: args.notes ?? null,
        durationMin: args.durationMin ?? null,
      }).returning({ id: schema.sessions.id });
      const id = ins[0]?.id;
      if (!id) throw new Error("create failed");
      let i = 1;
      for (const l of args.logs) {
        await db.insert(schema.exerciseLogs).values({
          sessionId: id,
          exerciseName: l.exerciseName,
          weightLabel: l.weightLabel,
          reps: l.reps,
          toFailure: l.toFailure ? 1 : 0,
          targetLabel: l.targetLabel ?? "",
          verdict: l.verdict ?? "",
          nextWeightLabel: l.nextWeightLabel ?? "",
          notes: l.notes ?? null,
          sortOrder: i++,
        });
      }
      ctx.invalidateQueries();
      return { id };
    },
  }),

  addLog: defineAction({
    request: z.object({
      sessionId: z.number(),
      exerciseName: z.string().min(1),
      weightLabel: z.string().min(1),
      reps: z.number().int().min(0).max(200),
      toFailure: z.boolean().default(true),
      targetLabel: z.string().optional(),
      verdict: z.string().optional(),
      nextWeightLabel: z.string().optional(),
      notes: z.string().optional(),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db.select().from(schema.exerciseLogs).where(eq(schema.exerciseLogs.sessionId, args.sessionId));
      const ins = await db.insert(schema.exerciseLogs).values({
        sessionId: args.sessionId,
        exerciseName: args.exerciseName,
        weightLabel: args.weightLabel,
        reps: args.reps,
        toFailure: args.toFailure ? 1 : 0,
        targetLabel: args.targetLabel ?? "",
        verdict: args.verdict ?? "",
        nextWeightLabel: args.nextWeightLabel ?? "",
        notes: args.notes ?? null,
        sortOrder: existing.length + 1,
      }).returning({ id: schema.exerciseLogs.id });
      const id = ins[0]?.id;
      if (!id) throw new Error("addLog failed");
      ctx.invalidateQueries();
      return { id };
    },
  }),

  updateLog: defineAction({
    request: z.object({
      id: z.number(),
      exerciseName: z.string().min(1).optional(),
      weightLabel: z.string().min(1).optional(),
      reps: z.number().int().min(0).max(200).optional(),
      toFailure: z.boolean().optional(),
      nextWeightLabel: z.string().optional(),
      verdict: z.string().optional(),
      notes: z.string().optional(),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const patch: Partial<typeof schema.exerciseLogs.$inferInsert> = {};
      if (args.exerciseName !== undefined) patch.exerciseName = args.exerciseName;
      if (args.weightLabel !== undefined) patch.weightLabel = args.weightLabel;
      if (args.reps !== undefined) patch.reps = args.reps;
      if (args.toFailure !== undefined) patch.toFailure = args.toFailure ? 1 : 0;
      if (args.nextWeightLabel !== undefined) patch.nextWeightLabel = args.nextWeightLabel;
      if (args.verdict !== undefined) patch.verdict = args.verdict;
      if (args.notes !== undefined) patch.notes = args.notes;
      if (Object.keys(patch).length > 0) {
        await db.update(schema.exerciseLogs).set(patch).where(eq(schema.exerciseLogs.id, args.id));
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteLog: defineAction({
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.exerciseLogs).where(eq(schema.exerciseLogs.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteSession: defineAction({
    request: z.object({ id: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.exerciseLogs).where(eq(schema.exerciseLogs.sessionId, args.id));
      await db.delete(schema.sessions).where(eq(schema.sessions.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),
} satisfies ActionsModule;
