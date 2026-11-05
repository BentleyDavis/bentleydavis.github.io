import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type Dashboard = ApiResponse<typeof api, "getDashboard">;
type Session = Dashboard["sessions"][number];
type Log = Session["logs"][number];

const DAY_B = [
  { name: "Marcy Lat Pulldown", start: "5 plates (~70 lb)", target: "8–12", note: "You already moved up from Day A — start Day B pull work here if you include it, front pulldown to upper chest." },
  { name: "Dumbbell Romanian Deadlift", start: "40 lb pair", target: "8–12", note: "No pair of 35s exists, so the 40 pair is the Day B hinge weight. Hinge, flat back, stop at form failure." },
  { name: "One-Arm Dumbbell Row", start: "35 lb — single", target: "8–12 each side", note: "Supported on the Marcy seat, pull to hip, no twisting to finish." },
  { name: "Marcy Leg Curl", start: "Start light — calibrate", target: "10–15 (legs)", note: "Leg developer curl. First Day B is calibration: find a weight you fail at in range." },
  { name: "Slow Dumbbell Curl", start: "10 lb each hand", target: "8–12", note: "Slow tempo, no swing. Elbows pinned." },
];

const WALK = { title: "Interval Walk — 30 min", steps: ["3 min easy warmup", "4 × (3 min fast / 3 min slow) — 24 min", "3 min easy cooldown"], note: "Fast = short sentences only. Add incline before speed. Target over time: 60 min/week of fast walking. Tue + Fri in your week." };

function verdictColor(v: string) {
  if (v.toLowerCase().includes("go up")) return "bg-[var(--accent)] text-white";
  if (v.toLowerCase().includes("in range")) return "bg-[var(--accent2)] text-white";
  return "bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)]";
}

function LogRow({ log, onDelete }: { log: Log; onDelete: (id: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(String(log.reps));
  const [weight, setWeight] = useState(log.weightLabel);
  const [next, setNext] = useState(log.nextWeightLabel);
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: () => api.updateLog({ id: log.id, reps: parseInt(reps) || log.reps, weightLabel: weight, nextWeightLabel: next }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); setEditing(false); },
  });

  return (
    <div className="border-b border-dashed border-[var(--border)] py-4 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display font-800 uppercase tracking-tight text-[17px] leading-tight font-extrabold">{log.exerciseName}</p>
          <p className="mt-1 text-[13px] text-[var(--dim)]">{log.targetLabel} • {log.toFailure ? "To failure" : "Stopped — had more in tank"}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono2 text-[28px] leading-none font-semibold">{log.reps}<span className="text-[13px] font-normal text-[var(--dim)]"> reps</span></div>
          <div className="font-mono2 text-[13px] mt-1">{log.weightLabel}</div>
        </div>
      </div>

      {log.verdict && <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${verdictColor(log.verdict)}`}>{log.verdict}</span>}

      {log.nextWeightLabel && (
        <div className="mt-3 flex gap-2 items-start bg-[var(--surface2)] rounded-lg px-3 py-2">
          <span className="text-[var(--accent)] font-black text-[13px] mt-0.5">→</span>
          <p className="text-[13px] leading-snug"><span className="font-bold">Next time:</span> {log.nextWeightLabel}</p>
        </div>
      )}
      {log.notes && <p className="mt-2 text-[13px] leading-relaxed text-[var(--dim)]">{log.notes}</p>}

      {!editing ? (
        <div className="mt-2 flex gap-3">
          <button onClick={() => setEditing(true)} className="text-[12px] font-semibold underline underline-offset-2" aria-label={`Edit ${log.exerciseName}`}>Edit</button>
          <button onClick={() => onDelete(log.id)} className="text-[12px] font-semibold text-red-600 underline underline-offset-2" aria-label={`Delete ${log.exerciseName}`}>Delete</button>
        </div>
      ) : (
        <form className="mt-3 grid grid-cols-3 gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); update.mutate(); }}>
          <label className="text-[11px] font-bold uppercase">Reps<input aria-label="Reps" value={reps} onChange={(e) => setReps(e.target.value)} inputMode="numeric" className="mt-1 w-full border border-[var(--border)] rounded-md px-2 py-2 text-[14px] bg-[var(--surface)]" /></label>
          <label className="text-[11px] font-bold uppercase col-span-2">Weight<input aria-label="Weight label" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 w-full border border-[var(--border)] rounded-md px-2 py-2 text-[14px] bg-[var(--surface)]" /></label>
          <label className="text-[11px] font-bold uppercase col-span-3">Next time<input aria-label="Next weight guidance" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1 w-full border border-[var(--border)] rounded-md px-2 py-2 text-[14px] bg-[var(--surface)]" /></label>
          <div className="col-span-3 flex gap-2"><button type="submit" className="bg-[var(--text)] text-[var(--bg)] px-4 py-2 rounded-full text-[13px] font-bold">Save</button><button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-full border border-[var(--border)] text-[13px] font-bold">Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function App() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.getDashboard({}) });
  const [showLogForm, setShowLogForm] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState<number | null>(null);

  // Log session form state
  const [fDate, setFDate] = useState("2026-10-27");
  const [fType, setFType] = useState<"HIT A" | "HIT B" | "Walk" | "Other">("HIT B");
  const [fTitle, setFTitle] = useState("HIT Day B");
  const [fNotes, setFNotes] = useState("");
  const [fExName, setFExName] = useState("");
  const [fExWeight, setFExWeight] = useState("");
  const [fExReps, setFExReps] = useState("");
  const [pendingLogs, setPendingLogs] = useState<{ exerciseName: string; weightLabel: string; reps: number; toFailure: boolean }[]>([]);

  const createSession = useMutation({
    mutationFn: () => api.createSession({ date: fDate, dayType: fType, title: fTitle, notes: fNotes || undefined, logs: pendingLogs }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); setShowLogForm(false); setPendingLogs([]); },
  });
  const deleteLogMut = useMutation({ mutationFn: (id: number) => api.deleteLog({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }) });
  const deleteSessionMut = useMutation({ mutationFn: (id: number) => api.deleteSession({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }) });
  const addLogMut = useMutation({
    mutationFn: (args: { sessionId: number; exerciseName: string; weightLabel: string; reps: number }) => api.addLog({ ...args, toFailure: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); setShowAddExercise(null); },
  });

  // Add-exercise inline state
  const [aName, setAName] = useState(""); const [aWeight, setAWeight] = useState(""); const [aReps, setAReps] = useState("");

  if (dash.isPending) return <div className="min-h-screen bg-[var(--bg)] px-5 py-16 text-center"><p className="font-display font-extrabold uppercase text-xl">Loading your log…</p></div>;
  if (dash.error) return <div className="min-h-screen bg-[var(--bg)] px-5 py-16 text-center"><p>Couldn’t load the tracker. Try reopening it.</p></div>;

  const data = dash.data as Dashboard;
  const latest = data.sessions[0];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-3xl px-4 pb-10 pt-5 sm:px-6">

        {/* Top stats — ledger header, no app title repeat */}
        <div className="flex items-end justify-between border-b-2 border-[var(--text)] pb-3">
          <div>
            <p className="font-mono2 text-[11px] uppercase tracking-[0.18em] text-[var(--dim)]">Slow HIT • Single set to failure</p>
            <p className="font-display text-[32px] leading-none font-black uppercase mt-1">Training Log</p>
          </div>
          <div className="text-right font-mono2">
            <div className="text-[22px] font-semibold leading-none">{data.totalSessions} <span className="text-[12px] font-normal text-[var(--dim)]">session{data.totalSessions === 1 ? "" : "s"}</span></div>
            <div className="text-[12px] text-[var(--dim)] mt-1">{data.totalSets} sets logged</div>
          </div>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1 mt-3 text-center">
          {[["Mon", "HIT A", true], ["Tue", "Walk", false], ["Wed", "Rest", false], ["Thu", "HIT B", false], ["Fri", "Walk", false], ["Sat", "Rest", false], ["Sun", "Rest", false]].map(([d, label, done]) => (
            <div key={d as string} className={`rounded-md py-2 px-1 ${done ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface)] border border-[var(--border)]"}`}>
              <div className="text-[11px] font-bold uppercase">{d}</div>
              <div className="text-[10px] leading-tight mt-0.5 opacity-80">{label}{done ? " ✓" : ""}</div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--dim)] mt-2">Week pattern from your plan. Drop the Friday walk first on low-energy weeks; keep the two HIT days.</p>

        {/* Latest / Hero session */}
        {latest ? (
          <section aria-label="Latest session" className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="bg-[var(--text)] text-[var(--bg)] px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-mono2 text-[11px] uppercase tracking-widest opacity-70">Mon • Oct 26, 2026 • {latest.dayType}</p>
                <h2 className="font-display font-extrabold uppercase text-[20px] leading-tight">{latest.title}</h2>
              </div>
              <span className="font-mono2 text-[12px] border border-current rounded-full px-2 py-1">{latest.durationMin ? `${latest.durationMin} min` : "—"}</span>
            </div>
            <div className="px-4">
              {latest.logs.map((l) => <LogRow key={l.id} log={l} onDelete={(id) => deleteLogMut.mutate(id)} />)}
            </div>
            {latest.notes && <p className="px-4 pb-4 text-[13px] text-[var(--dim)] leading-relaxed">{latest.notes}</p>}
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              {showAddExercise === latest.id ? (
                <form className="w-full grid grid-cols-3 gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); addLogMut.mutate({ sessionId: latest.id, exerciseName: aName, weightLabel: aWeight, reps: parseInt(aReps) || 0 }); }}>
                  <input aria-label="Exercise name" placeholder="Exercise" value={aName} onChange={(e) => setAName(e.target.value)} className="col-span-3 sm:col-span-1 border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" required />
                  <input aria-label="Weight" placeholder="Weight (e.g. 4 plates)" value={aWeight} onChange={(e) => setAWeight(e.target.value)} className="border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" required />
                  <input aria-label="Reps" placeholder="Reps" value={aReps} onChange={(e) => setAReps(e.target.value)} inputMode="numeric" className="border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" required />
                  <div className="col-span-3 flex gap-2"><button type="submit" className="bg-[var(--accent)] text-white px-4 py-2 rounded-full text-[13px] font-bold">Add exercise</button><button type="button" onClick={() => setShowAddExercise(null)} className="px-4 py-2 rounded-full border border-[var(--border)] text-[13px] font-bold">Cancel</button></div>
                </form>
              ) : (
                <button onClick={() => setShowAddExercise(latest.id)} className="text-[13px] font-bold border border-[var(--border)] rounded-full px-4 py-2">+ Add exercise to this session</button>
              )}
              <button onClick={() => { if (confirm("Delete this whole session?")) deleteSessionMut.mutate(latest.id); }} className="text-[13px] font-bold text-red-600 px-2 py-2">Delete session</button>
            </div>
          </section>
        ) : (
          <div className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 text-center"><p className="font-bold">No sessions yet</p><p className="text-[14px] text-[var(--dim)] mt-1">Log your first session below.</p></div>
        )}

        {/* Rules */}
        <section aria-label="How HIT works here" className="mt-6 grid sm:grid-cols-3 gap-3">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4"><p className="font-display font-extrabold uppercase text-[13px]">Tempo</p><p className="text-[13px] mt-1 leading-relaxed text-[var(--dim)]">3–4 sec up, 3–4 sec down. No momentum, no bouncing. One working set per exercise.</p></div>
          <div className="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-xl p-4"><p className="font-display font-extrabold uppercase text-[13px] text-[var(--accent)]">Rest Rule</p><p className="text-[13px] mt-1 leading-relaxed">Don’t start the next set until HR has dropped <strong>≥30 bpm from peak</strong> AND you can speak a full sentence comfortably. Up to ~5 min. Don’t chase overnight resting HR — daytime runs ~90–100.</p></div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4"><p className="font-display font-extrabold uppercase text-[13px]">Targets</p><p className="text-[13px] mt-1 leading-relaxed text-[var(--dim)]">8–12 reps upper body, 10–15 legs. Below range = too heavy. Cleanly above = go up next time.</p></div>
        </section>

        {/* Next: Day B */}
        <section aria-label="Next session Day B" className="mt-8">
          <div className="flex items-baseline justify-between"><h3 className="font-display font-black uppercase text-[22px]">Next — HIT Day B</h3><span className="font-mono2 text-[12px] text-[var(--dim)]">Thu • Not yet done</span></div>
          <p className="text-[13px] text-[var(--dim)] mt-1">Pull + hinge day. First time through is calibration — use these starts and report reps the same way as Day A.</p>
          <div className="mt-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 divide-y divide-dashed divide-[var(--border)]">
            {DAY_B.map((ex, i) => (
              <div key={ex.name} className="py-3 flex gap-3">
                <span className="font-mono2 font-semibold text-[var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold text-[15px]">{ex.name}</p><p className="font-mono2 text-[13px]">{ex.start} • {ex.target}</p></div><p className="text-[13px] text-[var(--dim)] mt-0.5 leading-relaxed">{ex.note}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[220px]"><p className="font-display font-extrabold uppercase text-[14px]">{WALK.title}</p><ul className="mt-1 text-[13px] text-[var(--dim)] list-disc pl-5">{WALK.steps.map((s) => <li key={s}>{s}</li>)}</ul><p className="text-[13px] text-[var(--dim)] mt-2">{WALK.note}</p></div>
          </div>
        </section>

        {/* Log new session */}
        <section aria-label="Log a session" className="mt-8">
          {!showLogForm ? (
            <button onClick={() => setShowLogForm(true)} className="w-full bg-[var(--accent)] text-white font-display font-extrabold uppercase tracking-wide py-4 rounded-xl text-[16px]">+ Log a session</button>
          ) : (
            <form className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4" onSubmit={(e: FormEvent) => { e.preventDefault(); createSession.mutate(); }}>
              <h3 className="font-display font-extrabold uppercase text-[18px]">Log a session</h3>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <label className="text-[11px] font-bold uppercase">Date<input aria-label="Session date" type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="mt-1 w-full border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" /></label>
                <label className="text-[11px] font-bold uppercase">Day type<select aria-label="Day type" value={fType} onChange={(e) => setFType(e.target.value as typeof fType)} className="mt-1 w-full border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]"><option>HIT A</option><option>HIT B</option><option>Walk</option><option>Other</option></select></label>
                <label className="text-[11px] font-bold uppercase col-span-2">Title<input aria-label="Session title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} className="mt-1 w-full border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" /></label>
                <label className="text-[11px] font-bold uppercase col-span-2">Notes<textarea aria-label="Session notes" value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} className="mt-1 w-full border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" /></label>
              </div>

              <div className="mt-4 border-t border-dashed border-[var(--border)] pt-4">
                <p className="text-[12px] font-bold uppercase">Exercises in this session</p>
                {pendingLogs.length === 0 && <p className="text-[13px] text-[var(--dim)] mt-1">Add each exercise, then save the session.</p>}
                {pendingLogs.map((l, i) => <div key={i} className="flex justify-between py-2 border-b border-dashed border-[var(--border)] text-[14px]"><span className="font-bold">{l.exerciseName}</span><span className="font-mono2">{l.weightLabel} × {l.reps}</span></div>)}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <input aria-label="New exercise name" placeholder="Exercise" value={fExName} onChange={(e) => setFExName(e.target.value)} className="col-span-3 sm:col-span-1 border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" />
                  <input aria-label="New exercise weight" placeholder="Weight" value={fExWeight} onChange={(e) => setFExWeight(e.target.value)} className="border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" />
                  <input aria-label="New exercise reps" placeholder="Reps" value={fExReps} onChange={(e) => setFExReps(e.target.value)} inputMode="numeric" className="border border-[var(--border)] rounded-md px-3 py-2 text-[14px] bg-[var(--bg)]" />
                </div>
                <button type="button" onClick={() => { if (!fExName || !fExWeight) return; setPendingLogs([...pendingLogs, { exerciseName: fExName, weightLabel: fExWeight, reps: parseInt(fExReps) || 0, toFailure: true }]); setFExName(""); setFExWeight(""); setFExReps(""); }} className="mt-2 text-[13px] font-bold border border-[var(--border)] rounded-full px-4 py-2">Add exercise to list</button>
              </div>

              <div className="flex gap-2 mt-5"><button type="submit" disabled={createSession.isPending} className="bg-[var(--text)] text-[var(--bg)] px-5 py-2.5 rounded-full font-bold text-[14px]">{createSession.isPending ? "Saving…" : "Save session"}</button><button type="button" onClick={() => setShowLogForm(false)} className="px-5 py-2.5 rounded-full border border-[var(--border)] font-bold text-[14px]">Cancel</button></div>
              {createSession.isError && <p className="text-[13px] text-red-600 mt-2">Couldn’t save — check the fields and try again.</p>}
            </form>
          )}
        </section>

        {/* History beyond latest */}
        {data.sessions.length > 1 && (
          <section aria-label="History" className="mt-8">
            <h3 className="font-display font-black uppercase text-[20px]">History</h3>
            <div className="mt-3 space-y-3">
              {data.sessions.slice(1).map((s) => (
                <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                  <div className="flex justify-between"><p className="font-bold">{s.title}</p><p className="font-mono2 text-[12px] text-[var(--dim)]">{s.date} • {s.dayType}</p></div>
                  <p className="text-[13px] text-[var(--dim)] mt-1">{s.logs.map((l) => `${l.exerciseName}: ${l.weightLabel} × ${l.reps}`).join(" • ") || "No exercises logged"}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Form reminders + equipment */}
        <section aria-label="Form reminders" className="mt-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <h3 className="font-display font-extrabold uppercase text-[16px]">Form reminders — from your corrections</h3>
          <ul className="mt-2 space-y-2 text-[14px] leading-relaxed list-disc pl-5">
            <li><strong>Lat pulldown:</strong> Front pulldown only — bar in front of face to upper chest / collarbone, never behind neck. No thigh hold-down on the MWM-990: sit facing the stack, feet braced on floor. If your body lifts off the seat, it’s too heavy.</li>
            <li><strong>Chest press:</strong> Back flat on pad, handles at mid-chest, don’t lock elbows hard or let the stack slam.</li>
            <li><strong>Goblet squat:</strong> Single dumbbell at chest, heels down, knees over toes. Set it down in front of you at failure.</li>
            <li><strong>Stop rule:</strong> Form failure, not grinding. Sharp pain = stop. If HR hasn’t dropped 30 bpm after ~5 min rest, call the session done.</li>
          </ul>
        </section>

        <section aria-label="Your equipment" className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <h3 className="font-display font-extrabold uppercase text-[16px]">Your equipment</h3>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
            <p>Marcy Home Gym MWM-990</p><p className="text-[var(--dim)]">Press • lat pulldown • leg developer</p>
            <p>Sunny treadmill</p><p className="text-[var(--dim)]">Incline to 12 • speed to 8 MPH</p>
            <p>Dumbbells — pairs</p><p className="text-[var(--dim)]">5 lb • 8 lb • 10 lb (Reebok)</p>
            <p>Dumbbell — single</p><p className="text-[var(--dim)]">35 lb hex (only one)</p>
            <p>Dumbbells — pair</p><p className="text-[var(--dim)]">40 lb hex (mismatched white / black)</p>
            <p>Also</p><p className="text-[var(--dim)]">14 lb medicine ball • blue yoga mat</p>
          </div>
          <p className="text-[12px] text-[var(--dim)] mt-3">Goal: visceral fat + mitochondria — slow HIT a few times a week plus 3 min fast / 3 min slow interval walking a few times a week.</p>
        </section>

      </main>
    </div>
  );
}
