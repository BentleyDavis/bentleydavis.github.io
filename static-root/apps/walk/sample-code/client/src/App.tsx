import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

import voiceWarmup from "./assets/voice-warmup.mp3";
import voiceFast from "./assets/voice-fast.mp3";
import voiceSlow from "./assets/voice-slow.mp3";
import voiceCooldown from "./assets/voice-cooldown.mp3";
import voiceReturn from "./assets/voice-return.mp3";
import voiceDone from "./assets/voice-done.mp3";

// ---------------------------------------------------------------------------
// Types (mirror the server schemas in server/src/actions.ts)
// ---------------------------------------------------------------------------

type Settings = ApiResponse<typeof api, "getState">["settings"];
type ActiveState = NonNullable<ApiResponse<typeof api, "getState">["active"]>;
type Walk = ApiResponse<typeof api, "listWalks">["walks"][number];

type VoiceKey = "warmup" | "fast" | "slow" | "cooldown" | "return" | "done";
const VOICE: Record<VoiceKey, string> = {
  warmup: voiceWarmup,
  fast: voiceFast,
  slow: voiceSlow,
  cooldown: voiceCooldown,
  return: voiceReturn,
  done: voiceDone,
};

// ---------------------------------------------------------------------------
// Workout plan: warmup, then per round fast + HR-guided slow recovery
// (no recovery after the last round), then cooldown. 7 segments.
// ---------------------------------------------------------------------------

type SegKind = "warmup" | "fast" | "recovery" | "cooldown";
interface Seg {
  kind: SegKind;
  label: string;
  round: number | null; // round this segment belongs to (fast/recovery)
  durationSec: number | null; // null = untimed (HR-guided recovery)
  voice: VoiceKey;
}

const WARMUP_SEC = 180;
const COOLDOWN_SEC = 180;
const ROUNDS = 3;

function buildSegments(fastMinutes: number): Seg[] {
  const segs: Seg[] = [
    { kind: "warmup", label: "Warmup", round: null, durationSec: WARMUP_SEC, voice: "warmup" },
  ];
  for (let r = 1; r <= ROUNDS; r++) {
    segs.push({
      kind: "fast",
      label: "Fast walk",
      round: r,
      durationSec: fastMinutes * 60,
      voice: "fast",
    });
    if (r < ROUNDS) {
      segs.push({
        kind: "recovery",
        label: "Slow recovery",
        round: r,
        durationSec: null,
        voice: "slow",
      });
    }
  }
  segs.push({
    kind: "cooldown",
    label: "Cooldown",
    round: null,
    durationSec: COOLDOWN_SEC,
    voice: "cooldown",
  });
  return segs;
}

function totalTimedSec(segs: Seg[]): number {
  return segs.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
}

// Nominal recovery length used for the planned total and the halfway
// "start return" cue: recovery itself is untimed and HR-guided, but the
// plan total (21:00 at defaults) and the halfway cue (10:30) count each
// recovery at about 3 minutes, matching the original walk plan.
const NOMINAL_RECOVERY_SEC = 180;

function plannedTotalSec(segs: Seg[]): number {
  const recoveries = segs.filter((s) => s.kind === "recovery").length;
  return totalTimedSec(segs) + recoveries * NOMINAL_RECOVERY_SEC;
}

const PHASE_COLORS: Record<SegKind, string> = {
  warmup: "#4d7c0f",
  fast: "#d97706",
  recovery: "#0369a1",
  cooldown: "#475569",
};

// ---------------------------------------------------------------------------
// Timing engine. Everything derives from the anchored start timestamp:
// active seconds = wall time since start, minus all paused time.
// ---------------------------------------------------------------------------

function activeSecAt(state: ActiveState, nowMs: number): number {
  let paused = state.pausedTotalMs;
  if (state.pauseStartTs != null) paused += nowMs - state.pauseStartTs;
  const elapsed = (nowMs - state.startTs - paused) / 1000;
  return Math.max(0, elapsed);
}

interface Position {
  segIndex: number;
  segStartActiveSec: number;
  done: boolean;
}

/** Advance through timed segments whose time has fully elapsed.
 *  Stops at a recovery segment (it ends only when the user starts the
 *  next fast round) and past the cooldown (workout done). */
function advancePosition(
  segs: Seg[],
  fromIndex: number,
  fromStartSec: number,
  activeSec: number,
): Position {
  let idx = fromIndex;
  let start = fromStartSec;
  while (idx < segs.length) {
    const seg = segs[idx];
    if (!seg || seg.durationSec == null) break;
    if (activeSec < start + seg.durationSec) break;
    start += seg.durationSec;
    idx += 1;
  }
  return { segIndex: idx, segStartActiveSec: start, done: idx >= segs.length };
}

/** The halfway cue runs on total active elapsed (pauses excluded,
 *  recovery included): halfway through the planned total is when an
 *  out-and-back walk should turn for home. */
function halfwaySec(segs: Seg[]): number {
  return plannedTotalSec(segs) / 2;
}

function roundsCompletedAt(segs: Seg[], pos: Position): number {
  if (pos.done) return ROUNDS;
  let n = 0;
  for (let i = 0; i < pos.segIndex && i < segs.length; i++) {
    if (segs[i]?.kind === "fast") n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Cues: recorded voice, WebAudio beeps, vibration
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function beepPattern(kind: VoiceKey | "tick", settings: Settings) {
  if (!settings.beeps) return;
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const patterns: Record<string, [number, number][]> = {
      // [offsetSec, freqHz]
      warmup: [[0, 660], [0.18, 660]],
      fast: [[0, 880], [0.15, 880], [0.3, 1174]],
      slow: [[0, 587], [0.2, 440]],
      cooldown: [[0, 587], [0.2, 440]],
      return: [[0, 784], [0.16, 784], [0.32, 784], [0.48, 1046]],
      done: [[0, 659], [0.16, 784], [0.32, 1046], [0.52, 1318]],
      tick: [[0, 990]],
    };
    const notes = patterns[kind] ?? patterns.tick!;
    for (const [offset, freq] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }
  } catch {
    // audio unavailable — voice/vibration may still fire
  }
}

function vibratePattern(kind: VoiceKey, settings: Settings) {
  if (!settings.vibration || !("vibrate" in navigator)) return;
  const patterns: Record<VoiceKey, number | number[]> = {
    warmup: [200, 110, 260],
    fast: [220, 110, 220, 110, 320],
    slow: [320, 120, 180],
    cooldown: [320, 120, 180],
    return: [300, 120, 300, 120, 300, 120, 450],
    done: [200, 100, 200, 100, 200, 100, 420],
  };
  navigator.vibrate(patterns[kind]);
}

function playVoice(kind: VoiceKey, settings: Settings) {
  if (!settings.voice) return;
  try {
    const audio = new Audio(VOICE[kind]);
    void audio.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

function fireCue(kind: VoiceKey, settings: Settings) {
  playVoice(kind, settings);
  beepPattern(kind, settings);
  vibratePattern(kind, settings);
}

// ---------------------------------------------------------------------------
// Web Bluetooth heart-rate strap (e.g. Polar H10).
// Heart Rate Service 0x180D, Heart Rate Measurement 0x2A37.
// Minimal local typings — Web Bluetooth is not in the standard DOM lib.
// ---------------------------------------------------------------------------

interface BleCharacteristic extends EventTarget {
  value?: DataView | null;
  startNotifications(): Promise<BleCharacteristic>;
}
interface BleService {
  getCharacteristic(name: string): Promise<BleCharacteristic>;
}
interface BleGattServer {
  connect(): Promise<BleGattServer>;
  disconnect(): void;
  getPrimaryService(name: string): Promise<BleService>;
}
interface BleDevice extends EventTarget {
  name?: string;
  gatt?: BleGattServer;
}
interface BluetoothApi {
  requestDevice(options: unknown): Promise<BleDevice>;
}

function getBluetooth(): BluetoothApi | null {
  const nav = navigator as Navigator & { bluetooth?: BluetoothApi };
  return nav.bluetooth ?? null;
}

/** Parse a Heart Rate Measurement (0x2A37) value: flags byte, then the
 *  heart rate as uint8 or uint16 depending on flag bit 0. */
function parseHeartRateBpm(value: DataView): number | null {
  if (value.byteLength < 2) return null;
  const flags = value.getUint8(0);
  const bpm =
    flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
  return bpm > 0 ? bpm : null;
}

type BleStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "dropped"
  | "error";

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const queryClient = useQueryClient();
  const stateQuery = useQuery({
    queryKey: ["state"],
    queryFn: () => api.getState({}),
  });
  const walksQuery = useQuery({
    queryKey: ["walks"],
    queryFn: () => api.listWalks({ limit: 50 }),
  });

  const [settings, setSettings] = useState<Settings | null>(null);
  const [workout, setWorkout] = useState<ActiveState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [peakDraft, setPeakDraft] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;
  const workoutRef = useRef<ActiveState | null>(null);
  workoutRef.current = workout;
  const restoredRef = useRef(false);
  const settingsInitRef = useRef(false);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Bluetooth heart-rate strap -----------------------------------------
  const [bleSupported] = useState(() => getBluetooth() != null);
  const [bleStatus, setBleStatus] = useState<BleStatus>("idle");
  const [bleName, setBleName] = useState<string | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [recoveredRound, setRecoveredRound] = useState<number | null>(null);
  const bleDeviceRef = useRef<BleDevice | null>(null);
  const bleManualDropRef = useRef(false);
  const hrSamplesRef = useRef<{ t: number; bpm: number }[]>([]);
  const lastSamplePersistRef = useRef(0);
  const autoCuedRoundRef = useRef<number | null>(null);

  const saveActiveMut = useMutation({
    mutationFn: (s: ActiveState) => api.saveActive({ state: s }),
  });
  const clearActiveMut = useMutation({
    mutationFn: () => api.clearActive({}),
    onSuccess: () => {
      setWorkout(null);
      void queryClient.invalidateQueries({ queryKey: ["state"] });
    },
  });
  const saveWalkMut = useMutation({
    mutationFn: (w: Parameters<typeof api.saveWalk>[0]) => api.saveWalk(w),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["walks"] });
    },
  });
  const saveSettingsMut = useMutation({
    mutationFn: (s: Settings) => api.saveSettings({ settings: s }),
  });
  const clearHistoryMut = useMutation({
    mutationFn: () => api.clearHistory({}),
    onSuccess: () => {
      setConfirmClear(false);
      void queryClient.invalidateQueries({ queryKey: ["walks"] });
    },
  });

  const persistActive = (s: ActiveState) => {
    // Always persist the freshest sample stream, not a stale snapshot.
    const withSamples = { ...s, hrSamples: [...hrSamplesRef.current] };
    setWorkout(withSamples);
    workoutRef.current = withSamples;
    saveActiveMut.mutate(withSamples);
  };

  const persistSettings = (s: Settings) => {
    setSettings(s);
    settingsRef.current = s;
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => {
      saveSettingsMut.mutate(s);
    }, 400);
  };

  // --- finalize a walk: save the history row, mark state done ------------
  const finalizeWalk = (w: ActiveState, endedEarly: boolean) => {
    const segs = buildSegments(w.config.fastMinutes);
    const now = Date.now();
    const aSec = activeSecAt(w, now);
    const pos = advancePosition(segs, w.segIndex, w.segStartActiveSec, aSec);
    const peaks: (number | null)[] = [0, 1, 2].map(
      (i) => w.peaks[i] ?? null,
    );
    saveWalkMut.mutate(
      {
        started_at: new Date(w.startTs).toISOString(),
        ended_at: new Date(now).toISOString(),
        rounds_completed: endedEarly ? roundsCompletedAt(segs, pos) : ROUNDS,
        rounds_planned: 3,
        total_seconds: Math.floor(aSec),
        fast_target_hr: w.config.fastTargetHr,
        recovery_drop_hr: w.config.recoveryDropHr,
        fast_minutes: w.config.fastMinutes,
        peaks,
        hr_samples: hrSamplesRef.current.slice(0, 20000),
        ended_early: endedEarly,
      },
      {
        onSuccess: (res) => {
          persistActive({ ...w, status: "done", savedWalkId: res.id });
        },
        onError: () => {
          persistActive({ ...w, status: "done", savedWalkId: null });
        },
      },
    );
  };
  const finalizeRef = useRef(finalizeWalk);
  finalizeRef.current = finalizeWalk;

  // --- strap sample handling: record, track peaks, auto-cue recovery ------
  const handleHrSample = (bpm: number) => {
    const now = Date.now();
    if (hrSamplesRef.current.length < 20000) {
      hrSamplesRef.current.push({ t: now, bpm });
    }
    setLiveBpm(bpm);
    const w = workoutRef.current;
    if (!w || w.status !== "running") return;
    const segs = buildSegments(w.config.fastMinutes);
    const aSec = activeSecAt(w, now);
    const pos = advancePosition(segs, w.segIndex, w.segStartActiveSec, aSec);
    const seg = segs[pos.segIndex];
    if (!seg || seg.round == null) return;
    if (seg.kind === "fast") {
      const idx = seg.round - 1;
      const current = w.peaks[idx] ?? null;
      if (current == null || bpm > current) {
        const peaks = [0, 1, 2].map((i) =>
          i === idx ? bpm : (w.peaks[i] ?? null),
        );
        const next = { ...w, peaks };
        setWorkout(next);
        workoutRef.current = next;
      }
    } else if (seg.kind === "recovery") {
      const peak = w.peaks[seg.round - 1] ?? null;
      if (peak != null && autoCuedRoundRef.current !== seg.round) {
        if (bpm <= peak - w.config.recoveryDropHr) {
          autoCuedRoundRef.current = seg.round;
          setRecoveredRound(seg.round);
          const s = settingsRef.current;
          if (s) fireCue("fast", s);
        }
      }
    }
    // Throttled persistence so the sample stream survives an app close.
    if (now - lastSamplePersistRef.current > 15000) {
      lastSamplePersistRef.current = now;
      const cur = workoutRef.current;
      if (cur) {
        const next = { ...cur, hrSamples: [...hrSamplesRef.current] };
        setWorkout(next);
        workoutRef.current = next;
        saveActiveMut.mutate(next);
      }
    }
  };
  const hrSampleRef = useRef(handleHrSample);
  hrSampleRef.current = handleHrSample;

  const subscribeToStrap = async (device: BleDevice) => {
    if (!device.gatt) throw new Error("Device has no GATT server");
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService("heart_rate");
    const ch = await service.getCharacteristic("heart_rate_measurement");
    await ch.startNotifications();
    ch.addEventListener("characteristicvaluechanged", (e: Event) => {
      const target = e.target as BleCharacteristic | null;
      if (target?.value) {
        const bpm = parseHeartRateBpm(target.value);
        if (bpm != null) hrSampleRef.current(bpm);
      }
    });
  };

  const connectStrap = async () => {
    const bt = getBluetooth();
    if (!bt) return;
    setBleError(null);
    setBleStatus("connecting");
    try {
      const device = await bt.requestDevice({
        filters: [{ services: ["heart_rate"] }],
      });
      bleDeviceRef.current = device;
      setBleName(device.name ?? "Heart rate strap");
      device.addEventListener("gattserverdisconnected", () => {
        if (bleManualDropRef.current) {
          bleManualDropRef.current = false;
          return;
        }
        setBleStatus("dropped");
        setLiveBpm(null);
      });
      await subscribeToStrap(device);
      setBleStatus("connected");
    } catch (err) {
      setBleStatus("error");
      setBleError(
        err instanceof Error && err.name === "NotFoundError"
          ? "No strap was selected."
          : "Couldn't connect to the strap. Make sure it's awake and nearby, then try again.",
      );
    }
  };

  const reconnectStrap = async () => {
    const device = bleDeviceRef.current;
    if (!device) {
      void connectStrap();
      return;
    }
    setBleError(null);
    setBleStatus("connecting");
    try {
      await subscribeToStrap(device);
      setBleStatus("connected");
    } catch {
      setBleStatus("dropped");
      setBleError(
        "Reconnect failed — make sure the strap is awake and nearby, then try again.",
      );
    }
  };

  const disconnectStrap = () => {
    bleManualDropRef.current = true;
    try {
      bleDeviceRef.current?.gatt?.disconnect();
    } catch {
      // ignore
    }
    setBleStatus("idle");
    setLiveBpm(null);
  };

  // --- restore settings + in-progress workout from the server ------------
  useEffect(() => {
    const data = stateQuery.data;
    if (!data) return;
    if (!settingsInitRef.current) {
      settingsInitRef.current = true;
      setSettings(data.settings);
      settingsRef.current = data.settings;
    }
    if (restoredRef.current) return;
    restoredRef.current = true;
    const active = data.active;
    if (!active) return;
    hrSamplesRef.current = [...active.hrSamples];
    lastSamplePersistRef.current = Date.now();

    if (active.status === "done") {
      setWorkout(active);
      workoutRef.current = active;
      // A done walk whose history row never saved (app closed mid-save):
      // save it now so the history is complete.
      if (active.savedWalkId == null) finalizeRef.current(active, false);
      return;
    }

    const segs = buildSegments(active.config.fastMinutes);
    const now = Date.now();
    const aSec = activeSecAt(active, now);
    const pos = advancePosition(
      segs,
      active.segIndex,
      active.segStartActiveSec,
      aSec,
    );
    if (pos.done) {
      finalizeRef.current(active, false);
      return;
    }
    const half = halfwaySec(segs);
    const restored: ActiveState = {
      ...active,
      segIndex: pos.segIndex,
      segStartActiveSec: pos.segStartActiveSec,
      halfwayFired: active.halfwayFired || aSec >= half,
    };
    setWorkout(restored);
    workoutRef.current = restored;
    if (
      restored.segIndex !== active.segIndex ||
      restored.halfwayFired !== active.halfwayFired
    ) {
      saveActiveMut.mutate(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateQuery.data]);

  // --- ticking loop: advance segments, fire cues, detect finish ----------
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
      const w = workoutRef.current;
      if (!w || w.status !== "running") return;
      const s = settingsRef.current;
      if (!s) return;
      const segs = buildSegments(w.config.fastMinutes);
      const now = Date.now();
      const aSec = activeSecAt(w, now);
      const pos = advancePosition(segs, w.segIndex, w.segStartActiveSec, aSec);
      if (pos.done) {
        finalizeRef.current(w, false);
        fireCue("done", s);
        return;
      }
      let next = w;
      let changed = false;
      if (
        pos.segIndex !== w.segIndex ||
        pos.segStartActiveSec !== w.segStartActiveSec
      ) {
        next = {
          ...next,
          segIndex: pos.segIndex,
          segStartActiveSec: pos.segStartActiveSec,
        };
        changed = true;
      }
      const half = halfwaySec(segs);
      let halfwayJustFired = false;
      if (!next.halfwayFired && aSec >= half) {
        next = { ...next, halfwayFired: true };
        changed = true;
        halfwayJustFired = true;
      }
      if (changed) {
        setWorkout(next);
        workoutRef.current = next;
        saveActiveMut.mutate(next);
      }
      if (pos.segIndex !== w.segIndex) {
        const seg = segs[pos.segIndex];
        if (seg) fireCue(seg.voice, s);
      }
      if (halfwayJustFired) fireCue("return", s);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- keep the screen on while a walk is running -------------------------
  useEffect(() => {
    if (workout?.status !== "running") return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      try {
        void lock?.release();
      } catch {
        // ignore
      }
    };
  }, [workout?.status]);

  // --- derived position for rendering -------------------------------------
  const derived = useMemo(() => {
    if (!workout) return null;
    const segs = buildSegments(workout.config.fastMinutes);
    const aSec = activeSecAt(workout, nowMs);
    const pos = advancePosition(
      segs,
      workout.segIndex,
      workout.segStartActiveSec,
      aSec,
    );
    const seg = segs[pos.segIndex] ?? null;
    return { segs, aSec, pos, seg };
  }, [workout, nowMs]);

  // Reset the peak draft whenever a new recovery round begins.
  const recoveryRound =
    derived?.seg?.kind === "recovery" ? derived.seg.round : null;
  const lastRecoveryRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (recoveryRound !== lastRecoveryRoundRef.current) {
      lastRecoveryRoundRef.current = recoveryRound;
      if (recoveryRound != null && workout) {
        const existing = workout.peaks[recoveryRound - 1];
        setPeakDraft(existing != null ? String(existing) : "");
      }
    }
  }, [recoveryRound, workout]);

  // --- actions -------------------------------------------------------------
  const startWalk = () => {
    const s = settingsRef.current;
    if (!s) return;
    const now = Date.now();
    const next: ActiveState = {
      status: "running",
      startTs: now,
      pausedTotalMs: 0,
      pauseStartTs: null,
      config: {
        fastMinutes: s.fastMinutes,
        rounds: 3,
        fastTargetHr: s.fastTargetHr,
        recoveryDropHr: s.recoveryDropHr,
      },
      segIndex: 0,
      segStartActiveSec: 0,
      recoveryTotalSec: 0,
      peaks: [null, null, null],
      hrSamples: [],
      halfwayFired: false,
      savedWalkId: null,
    };
    hrSamplesRef.current = [];
    autoCuedRoundRef.current = null;
    setRecoveredRound(null);
    setConfirmEnd(false);
    setConfirmDiscard(false);
    persistActive(next);
    fireCue("warmup", s);
  };

  const pauseWalk = () => {
    const w = workoutRef.current;
    if (!w || w.status !== "running") return;
    persistActive({ ...w, status: "paused", pauseStartTs: Date.now() });
  };

  const resumeWalk = () => {
    const w = workoutRef.current;
    if (!w || w.status !== "paused") return;
    const now = Date.now();
    persistActive({
      ...w,
      status: "running",
      pausedTotalMs: w.pausedTotalMs + (now - (w.pauseStartTs ?? now)),
      pauseStartTs: null,
    });
  };

  const startNextFast = () => {
    const w = workoutRef.current;
    const s = settingsRef.current;
    if (!w || !s || w.status !== "running" || !derived) return;
    if (derived.seg?.kind !== "recovery") return;
    const recDur = derived.aSec - derived.pos.segStartActiveSec;
    setRecoveredRound(null);
    persistActive({
      ...w,
      segIndex: derived.pos.segIndex + 1,
      segStartActiveSec: derived.aSec,
      recoveryTotalSec: w.recoveryTotalSec + Math.max(0, recDur),
    });
    fireCue("fast", s);
  };

  const savePeak = () => {
    const w = workoutRef.current;
    if (!w || recoveryRound == null) return;
    const value = peakDraft.trim() === "" ? null : Number(peakDraft);
    if (value != null && (!Number.isFinite(value) || value < 30 || value > 250))
      return;
    const peaks = [0, 1, 2].map((i) =>
      i === recoveryRound - 1 ? value : (w.peaks[i] ?? null),
    );
    persistActive({ ...w, peaks });
  };

  const endWalkEarly = () => {
    const w = workoutRef.current;
    if (!w || w.status === "done") return;
    setConfirmEnd(false);
    finalizeWalk(w, true);
  };

  const discardWalk = () => {
    setConfirmDiscard(false);
    clearActiveMut.mutate();
  };

  // --- loading / error ------------------------------------------------------
  if (stateQuery.isPending || !settings) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-[var(--dim)]">Loading your walk…</p>
        </main>
      </div>
    );
  }
  if (stateQuery.error) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-[var(--text)]">Couldn't load the Walk Tracker.</p>
          <button
            type="button"
            onClick={() => void stateQuery.refetch()}
            className="mt-4 rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white"
          >
            Try again
          </button>
        </main>
      </div>
    );
  }

  const setupSegs = buildSegments(settings.fastMinutes);
  const setupTotal = plannedTotalSec(setupSegs);
  const inWorkout = workout != null && workout.status !== "done";
  const walks = walksQuery.data?.walks ?? [];
  const doneWalk =
    workout?.status === "done" && workout.savedWalkId != null
      ? (walks.find((x) => x.id === workout.savedWalkId) ?? null)
      : null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-xl px-4 pb-10 pt-4">
        <TimerPanel
          settings={settings}
          workout={workout}
          derived={derived}
          setupTotal={setupTotal}
          doneWalk={doneWalk}
          peakDraft={peakDraft}
          onPeakDraftChange={setPeakDraft}
          onSavePeak={savePeak}
          onStart={startWalk}
          onPause={pauseWalk}
          onResume={resumeWalk}
          onStartNextFast={startNextFast}
          onReset={() => clearActiveMut.mutate()}
          liveBpm={bleStatus === "connected" ? liveBpm : null}
          recoveredRound={recoveredRound}
        />

        {inWorkout && (
          <div className="mt-4 flex flex-col gap-2">
            {confirmEnd ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={endWalkEarly}
                  className="flex-1 rounded-full bg-red-700 px-4 py-3 font-semibold text-white"
                >
                  End walk &amp; save it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEnd(false)}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-semibold text-[var(--text)]"
                >
                  Keep walking
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-semibold text-[var(--text)]"
              >
                End walk early
              </button>
            )}
            {confirmDiscard ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={discardWalk}
                  className="flex-1 rounded-full border border-red-700 px-4 py-2.5 font-semibold text-red-700"
                >
                  Discard — don't save
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-semibold text-[var(--text)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                className="self-center px-3 py-1 text-sm font-medium text-[var(--dim)] underline"
              >
                Discard this walk without saving
              </button>
            )}
          </div>
        )}

        <StrapCard
          supported={bleSupported}
          status={bleStatus}
          name={bleName}
          liveBpm={liveBpm}
          error={bleError}
          onConnect={() => void connectStrap()}
          onReconnect={() => void reconnectStrap()}
          onDisconnect={disconnectStrap}
        />

        {!inWorkout && (
          <>
            <PlanCard
              settings={settings}
              onChange={persistSettings}
              locked={workout?.status === "done"}
            />
            <HrGoalsCard settings={settings} onChange={persistSettings} />
          </>
        )}

        {inWorkout && workout && (
          <section
            aria-label="This walk"
            className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <h2 className="font-bold text-[var(--text)]">This walk</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-[var(--dim)]">Fast target</dt>
              <dd className="tnum text-right font-semibold text-[var(--text)]">
                {workout.config.fastTargetHr} bpm
              </dd>
              <dt className="text-[var(--dim)]">Recovery drop</dt>
              <dd className="tnum text-right font-semibold text-[var(--text)]">
                {workout.config.recoveryDropHr} bpm
              </dd>
              <dt className="text-[var(--dim)]">Recover to</dt>
              <dd className="tnum text-right font-semibold text-[var(--text)]">
                {workout.config.fastTargetHr - workout.config.recoveryDropHr}{" "}
                bpm or below
              </dd>
              <dt className="text-[var(--dim)]">Fast length</dt>
              <dd className="tnum text-right font-semibold text-[var(--text)]">
                {fmtClock(workout.config.fastMinutes * 60)}
              </dd>
              <dt className="text-[var(--dim)]">Round peaks</dt>
              <dd className="tnum text-right font-semibold text-[var(--text)]">
                {workout.peaks.map((p) => (p == null ? "—" : String(p))).join(" · ")}
              </dd>
            </dl>
          </section>
        )}

        <CueSettingsCard settings={settings} onChange={persistSettings} />

        <HistorySection
          walks={walks}
          loading={walksQuery.isPending}
          confirmClear={confirmClear}
          onConfirmClearChange={setConfirmClear}
          onClear={() => clearHistoryMut.mutate()}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timer panel — the hero. One dark panel, phase-colored, giant digits.
// ---------------------------------------------------------------------------

interface Derived {
  segs: Seg[];
  aSec: number;
  pos: Position;
  seg: Seg | null;
}

function TimerPanel(props: {
  settings: Settings;
  workout: ActiveState | null;
  derived: Derived | null;
  setupTotal: number;
  doneWalk: Walk | null;
  peakDraft: string;
  onPeakDraftChange: (v: string) => void;
  onSavePeak: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStartNextFast: () => void;
  onReset: () => void;
  liveBpm: number | null;
  recoveredRound: number | null;
}) {
  const {
    settings,
    workout,
    derived,
    setupTotal,
    doneWalk,
    peakDraft,
    onPeakDraftChange,
    onSavePeak,
    onStart,
    onPause,
    onResume,
    onStartNextFast,
    onReset,
    liveBpm,
    recoveredRound,
  } = props;

  const panelStyle = { backgroundColor: "var(--panel)", color: "var(--panel-text)" };

  // ----- setup mode -------------------------------------------------------
  if (!workout) {
    return (
      <section
        aria-label="Walk timer"
        className="rounded-3xl p-5"
        style={panelStyle}
      >
        <p className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--panel-dim)" }}>
          Ready when you are
        </p>
        <p className="tnum mt-2 text-7xl font-black leading-none">
          {fmtClock(setupTotal)}
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--panel-dim)" }}>
          of timed walking · 3 fast rounds of {fmtClock(settings.fastMinutes * 60)}{" "}
          with heart-rate-guided slow recovery between them
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-5 w-full rounded-full bg-[#4ade80] px-6 py-4 text-lg font-extrabold text-[#0c1f14]"
        >
          Start walk
        </button>
        <p className="mt-3 text-center text-xs" style={{ color: "var(--panel-dim)" }}>
          Keep the screen on while using this app — it stays awake on its own
          while a walk is running.
        </p>
      </section>
    );
  }

  // ----- done mode ----------------------------------------------------------
  if (workout.status === "done" || derived?.pos.done) {
    return (
      <section
        aria-label="Walk complete"
        className="rounded-3xl p-5"
        style={panelStyle}
      >
        <p className="text-sm font-bold uppercase tracking-widest text-[#4ade80]">
          Walk complete
        </p>
        {doneWalk ? (
          <>
            <p className="tnum mt-2 text-6xl font-black leading-none">
              {fmtDuration(doneWalk.total_seconds)}
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--panel-dim)" }}>
              {doneWalk.ended_early
                ? `Ended early · ${doneWalk.rounds_completed} of ${doneWalk.rounds_planned} fast rounds`
                : `All ${doneWalk.rounds_planned} fast rounds done`}{" "}
              · saved to your history below
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--panel-dim)" }}>
            Saved to your history below.
          </p>
        )}
        <button
          type="button"
          onClick={onReset}
          className="mt-5 w-full rounded-full bg-white/15 px-6 py-3.5 text-lg font-extrabold text-white"
        >
          Done — back to setup
        </button>
      </section>
    );
  }

  if (!derived || !derived.seg) return null;
  const { seg, pos, aSec } = derived;
  const paused = workout.status === "paused";
  const color = PHASE_COLORS[seg.kind];
  const roundPeak =
    seg.round != null ? (workout.peaks[seg.round - 1] ?? null) : null;
  // With a strap, recovery is judged against this round's actual peak;
  // without one, against the fast target from the HR goals.
  const recoveryTarget =
    roundPeak != null
      ? roundPeak - workout.config.recoveryDropHr
      : workout.config.fastTargetHr - workout.config.recoveryDropHr;
  const plannedTotal = plannedTotalSec(derived.segs);

  return (
    <section
      aria-label="Walk timer"
      className="rounded-3xl p-5"
      style={panelStyle}
    >
      {/* segment progress */}
      <div className="flex gap-1" aria-hidden="true">
        {derived.segs.map((s, i) => (
          <div
            key={i}
            className="h-2 flex-1 rounded-full"
            style={{
              backgroundColor:
                i < pos.segIndex
                  ? PHASE_COLORS[s.kind]
                  : i === pos.segIndex
                    ? PHASE_COLORS[s.kind]
                    : "rgba(255,255,255,0.18)",
              opacity: i === pos.segIndex ? 1 : i < pos.segIndex ? 0.85 : 1,
            }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span
          className="rounded-full px-3 py-1 text-sm font-extrabold uppercase tracking-wide text-white"
          style={{ backgroundColor: color }}
        >
          {seg.label}
        </span>
        {seg.round != null && (
          <span className="text-sm font-semibold" style={{ color: "var(--panel-dim)" }}>
            Round {seg.round} of {ROUNDS}
          </span>
        )}
        {paused && (
          <span className="rounded-full bg-white px-3 py-1 text-sm font-extrabold uppercase tracking-wide text-[#0c1f14]">
            Paused
          </span>
        )}
      </div>

      {seg.kind === "recovery" ? (
        <>
          <p className="tnum mt-3 text-7xl font-black leading-none">
            {fmtClock(aSec - pos.segStartActiveSec)}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--panel-dim)" }}>
            slow walking — no fixed length, your heart rate decides
          </p>
          <div className="mt-4 rounded-2xl bg-white/10 p-4">
            <p className="text-sm" style={{ color: "var(--panel-dim)" }}>
              Recover to
            </p>
            <p className="tnum text-4xl font-extrabold">
              {recoveryTarget} bpm{" "}
              <span className="text-lg font-semibold">or below</span>
            </p>
            {liveBpm != null ? (
              <p className="tnum mt-1 text-lg font-bold">
                Now: {liveBpm} bpm
                {roundPeak != null && (
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--panel-dim)" }}
                  >
                    {" "}
                    · round {seg.round} peak {roundPeak}
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm">
                Start the next fast round when your heart rate — read off your
                band — is at or below {recoveryTarget}. That's a drop of about{" "}
                {workout.config.recoveryDropHr} bpm from{" "}
                {roundPeak != null
                  ? `this round's peak of ${roundPeak}`
                  : "your fast pace"}
                .
              </p>
            )}
          </div>

          {recoveredRound != null && recoveredRound === seg.round && (
            <p className="mt-3 rounded-2xl bg-green-800/70 p-3 text-sm font-bold text-green-100">
              Heart rate recovered — you're at or below {recoveryTarget} bpm.
              Start the next fast round when ready.
            </p>
          )}

          {aSec - pos.segStartActiveSec >= 300 && (
            <p className="mt-3 rounded-2xl bg-red-900/60 p-3 text-sm font-semibold text-red-100">
              5 minutes of slow walking and your heart rate still hasn't
              dropped ~{workout.config.recoveryDropHr} bpm from the fast peak —
              end the walk for today.
            </p>
          )}

          <label
            htmlFor="peak-input"
            className="mt-4 block text-sm font-semibold"
            style={{ color: "var(--panel-dim)" }}
          >
            Round {seg.round} fast peak (optional)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="peak-input"
              type="number"
              inputMode="numeric"
              min={30}
              max={250}
              value={peakDraft}
              onChange={(e) => onPeakDraftChange(e.target.value)}
              placeholder="e.g. 152"
              className="tnum w-full min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-lg font-bold text-white placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={onSavePeak}
              className="rounded-xl bg-white/15 px-4 py-2.5 font-bold text-white"
            >
              Save peak
            </button>
          </div>

          <button
            type="button"
            onClick={onStartNextFast}
            disabled={paused}
            className="mt-4 w-full rounded-full bg-[#d97706] px-6 py-4 text-lg font-extrabold text-white disabled:opacity-40"
          >
            Start fast round {(seg.round ?? 1) + 1}
          </button>
        </>
      ) : (
        <>
          <p className="tnum mt-3 text-7xl font-black leading-none">
            {fmtClock((seg.durationSec ?? 0) - (aSec - pos.segStartActiveSec))}
          </p>
          <p className="tnum mt-1 text-sm" style={{ color: "var(--panel-dim)" }}>
            {fmtClock(aSec)} elapsed · planned total {fmtClock(plannedTotal)}
          </p>
          {seg.kind === "fast" && (
            <p className="mt-3 text-sm">
              Brisk — short sentences only, no singing. Aim for{" "}
              {workout.config.fastTargetHr} bpm.
              {liveBpm != null && (
                <span className="tnum font-bold">
                  {" "}
                  Live: {liveBpm} bpm · round peak {roundPeak ?? "—"}
                </span>
              )}
            </p>
          )}
          {seg.kind === "warmup" && (
            <p className="mt-3 text-sm">
              Easy pace — just getting moving.
              {liveBpm != null && (
                <span className="tnum font-bold"> Live: {liveBpm} bpm</span>
              )}
            </p>
          )}
          {seg.kind === "cooldown" && (
            <p className="mt-3 text-sm">
              Easy pace — you're nearly home.
              {liveBpm != null && (
                <span className="tnum font-bold"> Live: {liveBpm} bpm</span>
              )}
            </p>
          )}
          {workout.halfwayFired && (
            <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
              Halfway — start heading back
            </p>
          )}
        </>
      )}

      <div className="mt-5">
        {paused ? (
          <button
            type="button"
            onClick={onResume}
            className="w-full rounded-full bg-[#4ade80] px-6 py-3.5 text-lg font-extrabold text-[#0c1f14]"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            className="w-full rounded-full bg-white/15 px-6 py-3.5 text-lg font-extrabold text-white"
          >
            Pause
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Heart-rate strap (Web Bluetooth)
// ---------------------------------------------------------------------------

function StrapCard(props: {
  supported: boolean;
  status: BleStatus;
  name: string | null;
  liveBpm: number | null;
  error: string | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const { supported, status, name, liveBpm, error, onConnect, onReconnect, onDisconnect } =
    props;
  return (
    <section
      aria-label="Heart rate strap"
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h2 className="text-lg font-extrabold text-[var(--text)]">
        Heart rate strap
      </h2>
      {!supported ? (
        <p className="mt-2 text-sm text-[var(--text)]">
          Bluetooth isn't available in this browser — open this page in Chrome
          on Android to connect a heart-rate strap.
        </p>
      ) : status === "connected" ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">
              Connected{name ? ` · ${name}` : ""}
            </p>
            <p className="tnum text-3xl font-black text-[var(--text)]">
              {liveBpm != null ? `${liveBpm} bpm` : "— bpm"}
            </p>
            <p className="text-sm text-[var(--dim)]">
              Peaks are tracked automatically; recovery cues itself when your
              heart rate drops enough.
            </p>
          </div>
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-full border border-[var(--border)] px-4 py-2.5 font-semibold text-[var(--text)]"
          >
            Disconnect
          </button>
        </div>
      ) : status === "dropped" ? (
        <div className="mt-2">
          <p className="text-sm font-semibold text-[var(--text)]">
            The strap connection dropped. The timer keeps running — reconnect
            to keep recording heart rate.
          </p>
          <button
            type="button"
            onClick={onReconnect}
            className="mt-3 w-full rounded-full bg-[var(--accent)] px-5 py-3 font-bold text-white"
          >
            Reconnect strap
          </button>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-[var(--dim)]">
            Connect a Bluetooth heart-rate strap (like a Polar H10) to see
            live heart rate, track each round's peak automatically, and get
            cued when you've recovered.
          </p>
          <button
            type="button"
            onClick={onConnect}
            disabled={status === "connecting"}
            className="mt-3 w-full rounded-full bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {status === "connecting"
              ? "Connecting…"
              : "Connect heart rate strap"}
          </button>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Plan card — starts directly with "Interval rounds"
// ---------------------------------------------------------------------------

function PlanCard(props: {
  settings: Settings;
  onChange: (s: Settings) => void;
  locked: boolean;
}) {
  const { settings, onChange, locked } = props;
  const segs = buildSegments(settings.fastMinutes);
  const total = plannedTotalSec(segs);
  const setFast = (m: number) => {
    const clamped = Math.min(10, Math.max(1, m));
    onChange({ ...settings, fastMinutes: clamped });
  };
  return (
    <section
      aria-label="Workout plan"
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-[var(--text)]">
          Interval rounds
        </h2>
        <span className="tnum text-sm font-semibold text-[var(--dim)]">
          × {ROUNDS}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--text)]">Fast length</p>
          <p className="text-sm text-[var(--dim)]">
            Each fast interval — the total updates with it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Shorter fast intervals"
            disabled={locked || settings.fastMinutes <= 1}
            onClick={() => setFast(settings.fastMinutes - 1)}
            className="h-11 w-11 rounded-full border border-[var(--border)] text-xl font-bold text-[var(--text)] disabled:opacity-40"
          >
            −
          </button>
          <span className="tnum w-14 text-center text-lg font-extrabold text-[var(--text)]">
            {fmtClock(settings.fastMinutes * 60)}
          </span>
          <button
            type="button"
            aria-label="Longer fast intervals"
            disabled={locked || settings.fastMinutes >= 10}
            onClick={() => setFast(settings.fastMinutes + 1)}
            className="h-11 w-11 rounded-full border border-[var(--border)] text-xl font-bold text-[var(--text)] disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex justify-between">
          <span className="text-[var(--text)]">Warmup — easy</span>
          <span className="tnum font-semibold text-[var(--dim)]">3:00</span>
        </li>
        <li className="flex justify-between">
          <span className="text-[var(--text)]">
            Fast — brisk, short sentences only
          </span>
          <span className="tnum font-semibold text-[var(--dim)]">
            {fmtClock(settings.fastMinutes * 60)} × {ROUNDS}
          </span>
        </li>
        <li className="flex justify-between">
          <span className="text-[var(--text)]">
            Slow recovery — until HR drops ~{settings.recoveryDropHr} bpm
          </span>
          <span className="font-semibold text-[var(--dim)]">untimed</span>
        </li>
        <li className="flex justify-between">
          <span className="text-[var(--text)]">Cooldown — easy</span>
          <span className="tnum font-semibold text-[var(--dim)]">3:00</span>
        </li>
      </ul>

      <p className="tnum mt-3 border-t border-[var(--border)] pt-3 text-sm font-semibold text-[var(--text)]">
        Total timed {fmtClock(total)} · halfway “start return” cue at{" "}
        {fmtClock(total / 2)}
      </p>
      <p className="mt-1 text-sm text-[var(--dim)]">
        The total counts each recovery at about 3:00 — yours runs until your
        heart rate drops, so the walk can take longer.
      </p>
      {locked && (
        <p className="mt-1 text-sm text-[var(--dim)]">
          Finish the completed walk above to change the plan.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Heart-rate goals
// ---------------------------------------------------------------------------

function HrGoalsCard(props: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const { settings, onChange } = props;
  const recoveryTarget = settings.fastTargetHr - settings.recoveryDropHr;
  return (
    <section
      aria-label="Heart rate goals"
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h2 className="text-lg font-extrabold text-[var(--text)]">
        Heart rate goals
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="fast-target"
            className="text-sm font-semibold text-[var(--text)]"
          >
            Fast target (bpm)
          </label>
          <input
            id="fast-target"
            type="number"
            inputMode="numeric"
            min={60}
            max={220}
            value={settings.fastTargetHr}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 60 && v <= 220)
                onChange({ ...settings, fastTargetHr: Math.round(v) });
            }}
            className="tnum mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-lg font-bold text-[var(--text)]"
          />
        </div>
        <div>
          <label
            htmlFor="recovery-drop"
            className="text-sm font-semibold text-[var(--text)]"
          >
            Recovery drop (bpm)
          </label>
          <input
            id="recovery-drop"
            type="number"
            inputMode="numeric"
            min={5}
            max={80}
            value={settings.recoveryDropHr}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 5 && v <= 80)
                onChange({ ...settings, recoveryDropHr: Math.round(v) });
            }}
            className="tnum mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-lg font-bold text-[var(--text)]"
          />
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--text)]">
        During slow recovery, walk until your heart rate is at{" "}
        <strong className="tnum">
          {recoveryTarget} bpm or below
        </strong>{" "}
        — a drop of ~{settings.recoveryDropHr} bpm. If it won't drop within
        about 5 minutes of slow walking, the walk is over for the day.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cue toggles
// ---------------------------------------------------------------------------

function CueSettingsCard(props: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const { settings, onChange } = props;
  const toggles: { key: "voice" | "beeps" | "vibration"; label: string }[] = [
    { key: "voice", label: "Voice cues" },
    { key: "beeps", label: "Beeps" },
    { key: "vibration", label: "Vibration" },
  ];
  return (
    <section
      aria-label="Cue settings"
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h2 className="text-lg font-extrabold text-[var(--text)]">Cues</h2>
      <div className="mt-2 divide-y divide-[var(--border)]">
        {toggles.map((t) => {
          const on = settings[t.key];
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              aria-label={`${t.label} ${on ? "on" : "off"}`}
              onClick={() => onChange({ ...settings, [t.key]: !on })}
              className="flex w-full items-center justify-between py-3 text-left"
            >
              <span className="font-semibold text-[var(--text)]">{t.label}</span>
              <span
                aria-hidden="true"
                className="relative h-7 w-12 rounded-full transition-colors"
                style={{ backgroundColor: on ? "#14532d" : "#b6beb6" }}
              >
                <span
                  className="absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all"
                  style={{ left: on ? "22px" : "2px" }}
                />
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-[var(--dim)]">
        Keep the screen on while using this app — it requests a wake lock
        while a walk is running.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistorySection(props: {
  walks: Walk[];
  loading: boolean;
  confirmClear: boolean;
  onConfirmClearChange: (v: boolean) => void;
  onClear: () => void;
}) {
  const { walks, loading, confirmClear, onConfirmClearChange, onClear } =
    props;
  return (
    <section aria-label="Walk history" className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-[var(--text)]">
          Walk history
        </h2>
        {walks.length > 0 &&
          (confirmClear ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClear}
                className="rounded-full bg-red-700 px-3.5 py-1.5 text-sm font-bold text-white"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => onConfirmClearChange(false)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-sm font-bold text-[var(--text)]"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onConfirmClearChange(true)}
              className="px-2 py-1 text-sm font-semibold text-[var(--dim)] underline"
            >
              Clear history
            </button>
          ))}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Loading history…</p>
      ) : walks.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--dim)]">
          No walks saved yet. Finish a walk and it will be kept here — date,
          rounds, time, and the heart-rate goals you used.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {walks.map((w) => (
            <li
              key={w.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-[var(--text)]">
                  {fmtDateTime(w.started_at)}
                </p>
                <p className="tnum font-extrabold text-[var(--text)]">
                  {fmtDuration(w.total_seconds)}
                </p>
              </div>
              <p className="mt-1 text-sm text-[var(--text)]">
                {w.ended_early
                  ? `Ended early · ${w.rounds_completed} of ${w.rounds_planned} fast rounds`
                  : `All ${w.rounds_planned} fast rounds completed`}
              </p>
              <p className="tnum mt-0.5 text-sm text-[var(--dim)]">
                Fast target {w.fast_target_hr} bpm · drop {w.recovery_drop_hr}{" "}
                bpm · fast {fmtClock(w.fast_minutes * 60)}
                {w.peaks.some((p) => p != null) &&
                  ` · peaks ${w.peaks.map((p) => (p == null ? "—" : String(p))).join(" · ")}`}
                {w.hr_samples.length > 0 &&
                  ` · ${w.hr_samples.length} heart-rate samples recorded`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
