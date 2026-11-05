import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim, fileToBase64 } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type Data = ApiResponse<typeof api, "getAllData">;
type Product = Data["products"][number];
type Total = Data["totals"][number];

type Tab = "totals" | "products" | "catalog" | "flagged" | "schedule" | "prep" | "review" | "rules";

function appearanceText(p: Product): string {
  return [p.pillColor, p.pillForm, p.pillSize ? `size: ${p.pillSize}` : "", p.pillMarkings ? `marked: ${p.pillMarkings}` : ""].filter(Boolean).join(" · ");
}
function hasAppearance(p: Product): boolean {
  return Boolean(p.pillForm.trim() || p.pillColor.trim() || p.pillSize.trim() || p.pillMarkings.trim() || p.pillPhotoUrl);
}
// Two pills are look-alikes when form and color are both logged and match.
// If both carry markings and the markings differ, the imprint tells them apart.
function lookAlike(a: Product, b: Product): boolean {
  const formA = a.pillForm.trim().toLowerCase();
  const formB = b.pillForm.trim().toLowerCase();
  const colorA = a.pillColor.trim().toLowerCase();
  const colorB = b.pillColor.trim().toLowerCase();
  if (!formA || !formB || !colorA || !colorB) return false;
  if (formA !== formB || colorA !== colorB) return false;
  const markA = a.pillMarkings.trim().toLowerCase();
  const markB = b.pillMarkings.trim().toLowerCase();
  if (markA && markB && markA !== markB) return false;
  return true;
}
function describeLookAlike(p: Product): string {
  return `${p.pillColor.trim().toLowerCase()} ${p.pillForm.trim().toLowerCase()}s`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fmtAmount(amount: number, unit: string): string {
  if (unit === "mg" && amount >= 1000) return `${fmt(amount)} mg (${fmt(amount / 1000)} g)`;
  return `${fmt(amount)} ${unit}`;
}
function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function nextSundayOnOrAfter(d: Date): Date {
  const day = startOfLocalDay(d);
  const delta = (7 - day.getDay()) % 7;
  const res = new Date(day);
  res.setDate(res.getDate() + delta);
  return res;
}
function fmtReviewDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtLastReviewed(ms: number | null): string {
  if (ms == null) return "Never reviewed";
  return `Last reviewed ${new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
type ReviewSchedule = { nextDue: Date; inNextBatch: boolean; overdue: boolean; neverReviewed: boolean };
function reviewSchedule(p: Product, now: Date = new Date()): ReviewSchedule | null {
  if (p.reviewCadence !== "weekly" && p.reviewCadence !== "monthly") return null;
  const coming = nextSundayOnOrAfter(now);
  if (p.lastReviewedAt == null) {
    return { nextDue: coming, inNextBatch: true, overdue: false, neverReviewed: true };
  }
  const last = new Date(p.lastReviewedAt);
  let nextDue: Date;
  if (p.reviewCadence === "weekly") {
    const candidate = nextSundayOnOrAfter(last);
    nextDue = candidate.getTime() === startOfLocalDay(last).getTime()
      ? new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000)
      : candidate;
  } else {
    const target = new Date(startOfLocalDay(last).getTime() + 28 * 24 * 60 * 60 * 1000);
    nextDue = nextSundayOnOrAfter(target);
  }
  return {
    nextDue,
    inNextBatch: nextDue.getTime() <= coming.getTime(),
    overdue: nextDue.getTime() < startOfLocalDay(now).getTime(),
    neverReviewed: false,
  };
}
function reviewCadenceLabel(cadence: string): string {
  if (cadence === "weekly") return "Weekly review";
  if (cadence === "monthly") return "Monthly review";
  return "";
}

function statusStyle(status: string): string {
  if (status === "on") return "bg-[var(--accent-soft)] text-[var(--accent)]";
  if (status === "paused") return "bg-[var(--amber-soft)] text-[var(--amber)]";
  return "bg-[var(--surface2)] text-[var(--dim)]";
}

// Follow-up flags: "look into soon" (research it) and "tell Christy" (share
// it with her). They live on the product in any status — most flagged items
// sit in the Catalog — and the Flagged tab collects them so they aren't
// forgotten.
function FlagChips({ p }: { p: Product }) {
  if (!p.lookInto && !p.tellChristy) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-1.5">
      {p.lookInto && <span className="rounded-full bg-[var(--amber)] px-2.5 py-1 text-xs font-bold text-white">Look into soon</span>}
      {p.tellChristy && <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-white">Tell Christy</span>}
    </p>
  );
}

// "Where I saw it" — the owner's own record of where a supplement first
// crossed his path (a podcast episode, an article, a video…). Stored
// verbatim as pasted; any URLs inside it render as tappable links so he
// can get back to the episode page or media file.
function linkifySeenSource(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all font-medium text-[var(--accent)] underline">{part}</a>
      : <span key={i}>{part}</span>,
  );
}

function SeenSource({ p }: { p: Product }) {
  if (!p.seenSource.trim()) return null;
  return (
    <div className="rounded-lg bg-[var(--surface2)] px-3 py-2.5">
      <p className="font-semibold">Where I saw it</p>
      <p className="mt-1 whitespace-pre-line break-words text-sm text-[var(--dim)]">{linkifySeenSource(p.seenSource.trim())}</p>
    </div>
  );
}

function FlagControls({ p, onToggle }: { p: Product; onToggle: (args: { id: number; lookInto?: boolean; tellChristy?: boolean }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[var(--dim)]">Flags:</span>
      <button type="button" aria-label={p.lookInto ? `Remove look-into flag from ${p.name}` : `Flag ${p.name} to look into soon`} aria-pressed={p.lookInto} onClick={() => onToggle({ id: p.id, lookInto: !p.lookInto })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${p.lookInto ? "bg-[var(--amber)] text-white" : "bg-[var(--surface2)]"}`}>Look into soon</button>
      <button type="button" aria-label={p.tellChristy ? `Remove tell-Christy flag from ${p.name}` : `Flag ${p.name} to tell Christy about`} aria-pressed={p.tellChristy} onClick={() => onToggle({ id: p.id, tellChristy: !p.tellChristy })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${p.tellChristy ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)]"}`}>Tell Christy</button>
    </div>
  );
}

// ---------------- Product form ----------------
type IngDraft = { name: string; amount: string; unit: string; elementalAmount: string; elementalUnit: string; elementalLabel: string };
type TimeDraft = { timeLabel: string; conditional: boolean; conditionLabel: string };

function ProductForm({ initial, blacklistTerms, onClose }: { initial: Product | null; blacklistTerms: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [type, setType] = useState<"supplement" | "medication">((initial?.type as "supplement" | "medication") ?? "supplement");
  const [status, setStatus] = useState<"on" | "off" | "paused">((initial?.status as "on" | "off" | "paused") ?? "on");
  const [servingDesc, setServingDesc] = useState(initial?.servingDesc ?? "");
  const [servingsPerDay, setServingsPerDay] = useState(String(initial?.servingsPerDay ?? 1));
  const [timeDrafts, setTimeDrafts] = useState<TimeDraft[]>(
    initial && initial.times.length > 0
      ? initial.times.map((t) => ({ timeLabel: t.timeLabel, conditional: t.conditional, conditionLabel: t.conditionLabel ?? "" }))
      : [{ timeLabel: "", conditional: false, conditionLabel: "" }],
  );
  const [whyTaking, setWhyTaking] = useState(initial?.whyTaking ?? "");
  const [effectWanted, setEffectWanted] = useState(initial?.effectWanted ?? "");
  const [effectsWatch, setEffectsWatch] = useState(initial?.effectsWatch ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pillForm, setPillForm] = useState(initial?.pillForm ?? "");
  const [pillColor, setPillColor] = useState(initial?.pillColor ?? "");
  const [pillSize, setPillSize] = useState(initial?.pillSize ?? "");
  const [pillMarkings, setPillMarkings] = useState(initial?.pillMarkings ?? "");
  const [infoUrl, setInfoUrl] = useState(initial?.infoUrl ?? "");
  const [reviewCadence, setReviewCadence] = useState<"none" | "weekly" | "monthly">(((initial?.reviewCadence as "none" | "weekly" | "monthly") ?? "none"));
  const [reviewNote, setReviewNote] = useState(initial?.reviewNote ?? "");
  const [lookInto, setLookInto] = useState(initial?.lookInto ?? false);
  const [tellChristy, setTellChristy] = useState(initial?.tellChristy ?? false);
  const [seenSource, setSeenSource] = useState(initial?.seenSource ?? "");
  const [photoError, setPhotoError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.pillPhotoUrl ?? null);
  const [inStock, setInStock] = useState(initial?.inStock ?? true);
  const [ings, setIngs] = useState<IngDraft[]>(
    initial && initial.ingredients.length > 0
      ? initial.ingredients.map((i) => ({ name: i.name, amount: i.amountPerServing != null ? String(i.amountPerServing) : "", unit: i.unit, elementalAmount: i.elementalAmount != null ? String(i.elementalAmount) : "", elementalUnit: i.elementalUnit ?? "mg", elementalLabel: i.elementalLabel ?? "" }))
      : [{ name: "", amount: "", unit: "mg", elementalAmount: "", elementalUnit: "mg", elementalLabel: "" }],
  );
  const [fillersText, setFillersText] = useState(initial ? initial.fillers.map((f) => f.name).join("\n") : "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.saveProduct({
        id: initial?.id ?? null,
        name: name.trim(),
        brand,
        type,
        status,
        servingDesc,
        servingsPerDay: parseFloat(servingsPerDay) || 0,
        timing: "",
        times: timeDrafts.filter((t) => t.timeLabel.trim()).map((t) => ({
          timeLabel: t.timeLabel.trim(),
          conditional: t.conditional,
          conditionLabel: t.conditional && t.conditionLabel.trim() ? t.conditionLabel.trim() : null,
        })),
        whyTaking,
        effectWanted,
        effectsWatch,
        notes,
        pillForm: pillForm.trim(),
        pillColor: pillColor.trim(),
        pillSize: pillSize.trim(),
        pillMarkings: pillMarkings.trim(),
        infoUrl: infoUrl.trim(),
        reviewCadence,
        reviewNote: reviewNote.trim(),
        lookInto,
        tellChristy,
        seenSource,
        inStock,
        ingredients: ings.filter((i) => i.name.trim()).map((i) => ({
          name: i.name.trim(),
          amountPerServing: i.amount.trim() === "" ? null : parseFloat(i.amount),
          unit: i.unit,
          elementalAmount: i.elementalAmount.trim() === "" ? null : parseFloat(i.elementalAmount),
          elementalUnit: i.elementalUnit || null,
          elementalLabel: i.elementalLabel.trim() === "" ? null : i.elementalLabel.trim(),
        })),
        fillers: fillersText.split("\n").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all"] }); onClose(); },
    onError: (e) => setError(String(e)),
  });

  const del = useMutation({
    mutationFn: () => api.deleteProduct({ id: initial?.id ?? 0 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all"] }); onClose(); },
  });

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const { dataBase64, mimeType } = await fileToBase64(file);
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(mimeType)) throw new Error("Please choose a JPEG, PNG, WebP, or GIF photo of the pill.");
      return api.setProductPhoto({ productId: initial?.id ?? 0, dataBase64, mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif" });
    },
    onSuccess: (data) => { setPhotoError(""); setPhotoUrl(data.url); queryClient.invalidateQueries({ queryKey: ["all"] }); },
    onError: (e) => setPhotoError(e instanceof Error ? e.message : String(e)),
  });
  const removePhoto = useMutation({
    mutationFn: () => api.removeProductPhoto({ productId: initial?.id ?? 0 }),
    onSuccess: () => { setPhotoUrl(null); queryClient.invalidateQueries({ queryKey: ["all"] }); },
  });
  const onPhotoPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPhoto.mutate(file);
    e.target.value = "";
  };

  const fillerLines = fillersText.split("\n").map((s) => s.trim()).filter(Boolean);
  const flaggedPreview = fillerLines.filter((f) => blacklistTerms.some((t) => f.toLowerCase().includes(t.toLowerCase())));

  const inputCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)]";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-[var(--dim)] mb-1";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-safe">
        <div className="flex items-center justify-between py-4">
          <h2 className="font-serif-display text-2xl font-bold">{initial ? "Edit product" : "Add product"}</h2>
          <button type="button" onClick={onClose} aria-label="Close editor" className="rounded-full bg-[var(--surface2)] px-4 py-2 text-sm font-medium">Cancel</button>
        </div>
        {error && <p className="mb-3 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">{error}</p>}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label htmlFor="pf-name" className={labelCls}>Product name *</label><input id="pf-name" aria-label="Product name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Magnesium Glycinate" /></div>
            <div><label htmlFor="pf-brand" className={labelCls}>Brand</label><input id="pf-brand" aria-label="Brand" className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. NOW Foods" /></div>
            <div><label htmlFor="pf-type" className={labelCls}>Type</label><select id="pf-type" aria-label="Type" className={inputCls} value={type} onChange={(e) => setType(e.target.value as "supplement" | "medication")}><option value="supplement">Supplement</option><option value="medication">Medication</option></select></div>
            <div><label htmlFor="pf-status" className={labelCls}>Status</label><select id="pf-status" aria-label="Status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as "on" | "off" | "paused")}><option value="on">On — taking now</option><option value="paused">Paused</option><option value="off">Off</option></select></div>
            <div><label htmlFor="pf-serving" className={labelCls}>Serving description</label><input id="pf-serving" aria-label="Serving description" className={inputCls} value={servingDesc} onChange={(e) => setServingDesc(e.target.value)} placeholder="e.g. 3 veg capsules" /></div>
            <div><label htmlFor="pf-spd" className={labelCls}>Servings per day</label><input id="pf-spd" aria-label="Servings per day" className={inputCls} type="number" step="0.25" min="0" inputMode="decimal" value={servingsPerDay} onChange={(e) => setServingsPerDay(e.target.value)} /></div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <label htmlFor="pf-infourl" className={labelCls}>Info link — product page online</label>
            <input id="pf-infourl" aria-label="Info link URL" className={inputCls} type="url" inputMode="url" placeholder="https://www.nowfoods.com/products/… or the Amazon listing" value={infoUrl} onChange={(e) => setInfoUrl(e.target.value)} />
            <p className="mt-2 text-sm text-[var(--dim)]">Manufacturer page or store listing for this exact product. Leave blank if you don't have a verified link.</p>
            {infoUrl.trim() && <p className="mt-2 text-sm"><a href={infoUrl.trim()} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent)] underline">Open product info ↗</a></p>}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <label htmlFor="pf-seen" className={labelCls}>Where I saw it</label>
            <textarea id="pf-seen" aria-label="Where I saw it" className={inputCls} rows={5} value={seenSource} onChange={(e) => setSeenSource(e.target.value)} placeholder={"Paste where you came across this — e.g. a podcast episode title and number, the episode webpage, a media file link, an article, or a video."} />
            <p className="mt-2 text-sm text-[var(--dim)]">Kept exactly as you paste it. Any links in it become tappable on the product's card, in the Catalog, and on the Flagged tab, so you can get back to the source.</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-serif-display text-lg font-semibold">Follow-up flags</h3>
            <p className="mt-1 text-sm text-[var(--dim)]">Flagged products collect on the Flagged tab — which shows its count in the tab bar and in the header — so they don't get forgotten, whatever their status.</p>
            <div className="mt-3 space-y-2.5">
              <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" aria-label="Flag to look into soon" checked={lookInto} onChange={(e) => setLookInto(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>Look into soon</strong> — I want to research this one (a study coming out, a claim to check). Works for Catalog items too.</span></label>
              <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" aria-label="Flag to tell Christy about" checked={tellChristy} onChange={(e) => setTellChristy(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>Tell Christy</strong> — mention this one to Christy; it stays flagged until I clear it after telling her.</span></label>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-serif-display text-lg font-semibold">Periodic review — for acute issues</h3>
            <p className="mt-1 text-sm text-[var(--dim)]">Some things are only for treating an acute issue, so they shouldn't just stay on the list forever. Set a review cadence and this product joins the Sunday-afternoon review queue on the Review tab, grouped with the others due that week.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pf-review-cadence" className={labelCls}>Review cadence</label>
                <select id="pf-review-cadence" aria-label="Review cadence" className={inputCls} value={reviewCadence} onChange={(e) => setReviewCadence(e.target.value as "none" | "weekly" | "monthly")}>
                  <option value="none">No periodic review</option>
                  <option value="weekly">Weekly — Sunday afternoon</option>
                  <option value="monthly">Monthly — Sunday afternoon</option>
                </select>
              </div>
              <div>
                <label htmlFor="pf-review-last" className={labelCls}>Last reviewed</label>
                <p id="pf-review-last" className="rounded-lg bg-[var(--surface2)] px-3 py-2.5 text-sm">{initial ? fmtLastReviewed(initial.lastReviewedAt) : "Not reviewed yet — set after saving, from the Review tab"}</p>
              </div>
            </div>
            {reviewCadence !== "none" && (
              <div className="mt-3">
                <label htmlFor="pf-review-note" className={labelCls}>What to check at review</label>
                <textarea id="pf-review-note" aria-label="What to check at review" className={inputCls} rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="e.g. Is the breakout cleared? Still needed, or step down / stop? Any side effects?" />
                <p className="mt-2 text-sm text-[var(--dim)]">{reviewCadence === "weekly" ? "Due every Sunday afternoon. Marking it reviewed moves it to the next Sunday." : "Due on a Sunday afternoon about once a month (the first Sunday at least 4 weeks after the last review). Marking it reviewed schedules the next one."}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-serif-display text-lg font-semibold">Times taken</h3>
            <p className="mt-1 text-sm text-[var(--dim)]">Add one row per time of day. A product with two times shows up in both groups on the Schedule tab. Mark a time “only sometimes” when it doesn't happen every day — e.g. a 9am dose that's double-dose days only.</p>
            <div className="mt-3 space-y-3">
              {timeDrafts.map((t, idx) => (
                <div key={idx} className="rounded-lg bg-[var(--surface2)] p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-32 flex-1"><label htmlFor={`time-label-${idx}`} className={labelCls}>Time</label><input id={`time-label-${idx}`} aria-label={`Time ${idx + 1}`} className={inputCls} value={t.timeLabel} onChange={(e) => setTimeDrafts(timeDrafts.map((x, i) => i === idx ? { ...x, timeLabel: e.target.value } : x))} placeholder="e.g. 9pm or With meals" /></div>
                    <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" aria-label={`Time ${idx + 1} only sometimes`} checked={t.conditional} onChange={(e) => setTimeDrafts(timeDrafts.map((x, i) => i === idx ? { ...x, conditional: e.target.checked } : x))} className="h-5 w-5" /> Only sometimes</label>
                    <button type="button" aria-label={`Remove time ${idx + 1}`} onClick={() => setTimeDrafts(timeDrafts.filter((_, i) => i !== idx))} className="rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm font-medium text-[var(--warn)]">Remove</button>
                  </div>
                  {t.conditional && <div className="mt-2"><label htmlFor={`time-cond-${idx}`} className={labelCls}>When? (short label)</label><input id={`time-cond-${idx}`} aria-label={`Time ${idx + 1} condition`} className={inputCls} value={t.conditionLabel} onChange={(e) => setTimeDrafts(timeDrafts.map((x, i) => i === idx ? { ...x, conditionLabel: e.target.value } : x))} placeholder="e.g. double-dose days only" /></div>}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setTimeDrafts([...timeDrafts, { timeLabel: "", conditional: false, conditionLabel: "" }])} className="mt-3 rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent)]">+ Add another time</button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-serif-display text-lg font-semibold">Active ingredients — per serving</h3>
            <p className="mt-1 text-sm text-[var(--dim)]">One product can have several. If an ingredient is a compound (like magnesium glycinate), add the elemental part too — that's how your total magnesium <em>and</em> total glycinate both get counted. Example: name “Magnesium Glycinate”, amount 500 mg, elemental 70, unit mg, elemental label “Magnesium”.</p>
            <div className="mt-3 space-y-3">
              {ings.map((ing, idx) => (
                <div key={idx} className="rounded-lg bg-[var(--surface2)] p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="col-span-2"><label htmlFor={`ing-name-${idx}`} className={labelCls}>Ingredient name</label><input id={`ing-name-${idx}`} aria-label={`Ingredient ${idx + 1} name`} className={inputCls} value={ing.name} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="e.g. Glycine" /></div>
                    <div><label htmlFor={`ing-amt-${idx}`} className={labelCls}>Amount / serving</label><input id={`ing-amt-${idx}`} aria-label={`Ingredient ${idx + 1} amount per serving`} className={inputCls} type="number" step="any" min="0" inputMode="decimal" value={ing.amount} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} placeholder="—" /></div>
                    <div><label htmlFor={`ing-unit-${idx}`} className={labelCls}>Unit</label><select id={`ing-unit-${idx}`} aria-label={`Ingredient ${idx + 1} unit`} className={inputCls} value={ing.unit} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}><option>mg</option><option>g</option><option>mcg</option><option>IU</option><option>ml</option><option>billion CFU</option></select></div>
                    <div><label htmlFor={`ing-elabel-${idx}`} className={labelCls}>Elemental label (optional)</label><input id={`ing-elabel-${idx}`} aria-label={`Ingredient ${idx + 1} elemental label`} className={inputCls} value={ing.elementalLabel} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, elementalLabel: e.target.value } : x))} placeholder="e.g. Magnesium" /></div>
                    <div><label htmlFor={`ing-eamt-${idx}`} className={labelCls}>Elemental amount</label><input id={`ing-eamt-${idx}`} aria-label={`Ingredient ${idx + 1} elemental amount`} className={inputCls} type="number" step="any" min="0" inputMode="decimal" value={ing.elementalAmount} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, elementalAmount: e.target.value } : x))} placeholder="—" /></div>
                    <div><label htmlFor={`ing-eunit-${idx}`} className={labelCls}>Elemental unit</label><select id={`ing-eunit-${idx}`} aria-label={`Ingredient ${idx + 1} elemental unit`} className={inputCls} value={ing.elementalUnit} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, elementalUnit: e.target.value } : x))}><option>mg</option><option>g</option><option>mcg</option></select></div>
                    <div className="flex items-end"><button type="button" aria-label={`Remove ingredient ${idx + 1}`} onClick={() => setIngs(ings.filter((_, i) => i !== idx))} className="rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm font-medium text-[var(--warn)]">Remove</button></div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setIngs([...ings, { name: "", amount: "", unit: "mg", elementalAmount: "", elementalUnit: "mg", elementalLabel: "" }])} className="mt-3 rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent)]">+ Add ingredient</button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <label htmlFor="pf-fillers" className={labelCls}>Fillers / other ingredients — one per line</label>
            <textarea id="pf-fillers" aria-label="Fillers, one per line" className={inputCls} rows={4} value={fillersText} onChange={(e) => setFillersText(e.target.value)} placeholder={"Hypromellose (cellulose capsule)\nSilicon dioxide"} />
            {flaggedPreview.length > 0 && <p className="mt-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm font-medium text-[var(--warn)]">⚠ Flagged by your blacklist: {flaggedPreview.join(", ")}</p>}
            <p className="mt-2 text-sm text-[var(--dim)]">Blacklist: {blacklistTerms.join(", ") || "—"} (edit in Rules tab)</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-serif-display text-lg font-semibold">What the pill looks like</h3>
            <p className="mt-1 text-sm text-[var(--dim)]">So a prepped week can be undone: if you change your mind, the Prep tab uses this — plus the photo — to tell look-alikes apart and sort pills back into the right bottles.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label htmlFor="pf-pillform" className={labelCls}>Form</label><select id="pf-pillform" aria-label="Pill form" className={inputCls} value={pillForm} onChange={(e) => setPillForm(e.target.value)}><option value="">Not logged yet</option><option value="capsule">Capsule</option><option value="tablet">Tablet</option><option value="softgel">Softgel</option><option value="powder">Powder</option><option value="gummy">Gummy</option><option value="liquid">Liquid</option><option value="other">Other</option></select></div>
              <div><label htmlFor="pf-pillcolor" className={labelCls}>Color</label><input id="pf-pillcolor" aria-label="Pill color" className={inputCls} value={pillColor} onChange={(e) => setPillColor(e.target.value)} placeholder="e.g. white" /></div>
              <div><label htmlFor="pf-pillsize" className={labelCls}>Size</label><input id="pf-pillsize" aria-label="Pill size" className={inputCls} value={pillSize} onChange={(e) => setPillSize(e.target.value)} placeholder="e.g. large, 00, 10 mm" /></div>
              <div><label htmlFor="pf-pillmark" className={labelCls}>Markings / imprint</label><input id="pf-pillmark" aria-label="Pill markings or imprint" className={inputCls} value={pillMarkings} onChange={(e) => setPillMarkings(e.target.value)} placeholder="e.g. scored, '500' imprint, none" /></div>
            </div>
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <p className={labelCls}>Photo of the actual pill</p>
              {initial ? (
                <div className="flex flex-wrap items-start gap-3">
                  {photoUrl ? <img src={photoUrl} alt={`Pill photo for ${initial.name}`} className="h-24 w-24 rounded-lg border border-[var(--border)] object-cover" /> : <p className="text-sm text-[var(--dim)]">No photo yet — a photo is the surest way to tell look-alikes apart.</p>}
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer rounded-lg bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)]">
                      {uploadPhoto.isPending ? "Uploading…" : photoUrl ? "Replace photo" : "Add pill photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Upload a photo of the pill" className="sr-only" onChange={onPhotoPick} disabled={uploadPhoto.isPending} />
                    </label>
                    {photoUrl && <button type="button" onClick={() => removePhoto.mutate()} disabled={removePhoto.isPending} className="rounded-lg bg-[var(--warn-soft)] px-4 py-2.5 text-sm font-medium text-[var(--warn)]">Remove photo</button>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--dim)]">Save the product first, then reopen it here to add a photo of the pill.</p>
              )}
              {photoError && <p className="mt-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">{photoError}</p>}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div><label htmlFor="pf-why" className={labelCls}>Why I'm taking it</label><textarea id="pf-why" aria-label="Why taking it" className={inputCls} rows={2} value={whyTaking} onChange={(e) => setWhyTaking(e.target.value)} /></div>
            <div><label htmlFor="pf-effect" className={labelCls}>Effect I actually want</label><textarea id="pf-effect" aria-label="Effect I actually want" className={inputCls} rows={2} value={effectWanted} onChange={(e) => setEffectWanted(e.target.value)} placeholder="Even if it's technically a 'side effect' — that's the point of this field" /></div>
            <div><label htmlFor="pf-watch" className={labelCls}>Other effects to watch / concerns</label><textarea id="pf-watch" aria-label="Other effects to watch" className={inputCls} rows={2} value={effectsWatch} onChange={(e) => setEffectsWatch(e.target.value)} /></div>
            <div><label htmlFor="pf-notes" className={labelCls}>Notes</label><textarea id="pf-notes" aria-label="Notes" className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="In stock" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-5 w-5" /> I have this in stock</label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()} className="flex-1 rounded-xl bg-[var(--accent)] px-5 py-3.5 font-semibold text-white disabled:opacity-50">{save.isPending ? "Saving…" : initial ? "Save changes" : "Add product"}</button>
            {initial && <button type="button" onClick={() => { if (window.confirm(`Delete ${initial.name}?`)) del.mutate(); }} className="rounded-xl bg-[var(--warn-soft)] px-5 py-3.5 font-semibold text-[var(--warn)]">Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Totals ----------------
function TotalCard({ t }: { t: Total }) {
  const pct = t.percentOfCeiling;
  const barWidth = pct != null ? Math.min(100, pct) : 0;
  const barColor = t.overCeiling ? "var(--warn)" : pct != null && pct >= 75 ? "var(--amber)" : "var(--accent)";
  return (
    <article className={`rounded-2xl border p-4 ${t.overCeiling ? "border-[var(--warn)] bg-[var(--warn-soft)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif-display text-xl font-bold">{t.ingredient}</h3>
        {t.overCeiling && <span className="rounded-full bg-[var(--warn)] px-2.5 py-1 text-xs font-bold text-white">OVER CEILING</span>}
        {!t.overCeiling && pct != null && pct >= 75 && <span className="rounded-full bg-[var(--amber-soft)] px-2.5 py-1 text-xs font-bold text-[var(--amber)]">NEAR CEILING</span>}
      </div>
      <p className="mt-1"><span className="font-serif-display text-3xl font-bold">{fmtAmount(t.totalAmount, t.unit)}</span> <span className="text-[var(--dim)]">per day</span></p>
      {t.ceilingAmount != null && (
        <div className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface2)]" role="progressbar" aria-label={`${t.ingredient} percent of ceiling`} aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: barColor }} />
          </div>
          <p className="mt-1.5 text-sm text-[var(--dim)]">{pct != null ? `${fmt(pct)}% of ` : ""}ceiling {fmtAmount(t.ceilingAmount, t.ceilingUnit ?? t.unit)}/day{t.ceilingSource ? ` — ${t.ceilingSource}` : ""}</p>
        </div>
      )}
      <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
        {t.contributions.map((c) => (
          <p key={c.productId + c.sourceLabel} className="flex flex-wrap justify-between gap-2 text-sm"><span>{c.productName} <span className="text-[var(--dim)]">({c.sourceLabel})</span></span><span className="font-semibold">{fmtAmount(c.contribution, c.unit)}</span></p>
        ))}
      </div>
    </article>
  );
}

// ---------------- Main ----------------
export function App() {
  const [tab, setTab] = useState<Tab>("totals");
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [catalogSearch, setCatalogSearch] = useState("");
  const queryClient = useQueryClient();

  const q = useQuery({ queryKey: ["all"], queryFn: () => api.getAllData({}) });
  const setStatus = useMutation({
    mutationFn: (args: { id: number; status: "on" | "off" | "paused" }) => api.setProductStatus(args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all"] }),
  });
  const markReviewed = useMutation({
    mutationFn: (args: { id: number }) => api.markProductReviewed(args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all"] }),
  });
  const setFlags = useMutation({
    mutationFn: (args: { id: number; lookInto?: boolean; tellChristy?: boolean }) => api.setProductFlags(args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all"] }),
  });

  const data = q.data;
  const blacklistTerms = useMemo(() => data?.blacklist.map((b) => b.term) ?? [], [data]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    return data.products.filter((p) => {
      if (statusFilter === "active") {
        if (p.status === "off") return false;
      } else if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search && !`${p.name} ${p.brand}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, search, statusFilter]);

  const scheduleGroups = useMemo(() => {
    type SchedItem = { product: Product; conditional: boolean; conditionLabel: string | null };
    if (!data) return [] as { timing: string; items: SchedItem[] }[];
    const groups = new Map<string, SchedItem[]>();
    const push = (key: string, item: SchedItem) => {
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    };
    for (const p of data.products) {
      if (p.status === "off") continue;
      if (p.times.length === 0) {
        push("No time set", { product: p, conditional: false, conditionLabel: null });
      } else {
        for (const t of p.times) {
          push(t.timeLabel, { product: p, conditional: t.conditional, conditionLabel: t.conditionLabel });
        }
      }
    }
    const minutesOf = (label: string): number | null => {
      const m = label.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
      if (!m) return null;
      let h = parseInt(m[1] ?? "0", 10) % 12;
      if (m[3] === "pm") h += 12;
      return h * 60 + parseInt(m[2] ?? "0", 10);
    };
    return Array.from(groups.entries())
      .map(([timing, items]) => ({ timing, items: items.sort((a, b) => a.product.name.localeCompare(b.product.name)) }))
      .sort((a, b) => {
        if (a.timing === "No time set") return 1;
        if (b.timing === "No time set") return -1;
        const ma = minutesOf(a.timing);
        const mb = minutesOf(b.timing);
        if (ma != null && mb != null) return ma - mb;
        if (ma != null) return -1;
        if (mb != null) return 1;
        return a.timing.localeCompare(b.timing);
      });
  }, [data]);

  const reviewProducts = useMemo(() => {
    if (!data) return [] as Product[];
    return data.products.filter((p) => p.status !== "off" && (p.reviewCadence === "weekly" || p.reviewCadence === "monthly"));
  }, [data]);
  const reviewBatch = useMemo(() => {
    return reviewProducts
      .map((p) => ({ product: p, schedule: reviewSchedule(p) }))
      .filter((x): x is { product: Product; schedule: ReviewSchedule } => x.schedule != null && x.schedule.inNextBatch)
      .sort((a, b) => a.schedule.nextDue.getTime() - b.schedule.nextDue.getTime() || a.product.name.localeCompare(b.product.name));
  }, [reviewProducts]);
  const comingSunday = useMemo(() => nextSundayOnOrAfter(new Date()), []);

  const catalogProducts = useMemo(() => {
    if (!data) return [] as Product[];
    return data.products
      .filter((p) => p.status === "off")
      .filter((p) => !catalogSearch || `${p.name} ${p.brand} ${p.notes} ${p.seenSource}`.toLowerCase().includes(catalogSearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, catalogSearch]);

  const lookIntoProducts = useMemo(() => {
    if (!data) return [] as Product[];
    return data.products.filter((p) => p.lookInto).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const tellChristyProducts = useMemo(() => {
    if (!data) return [] as Product[];
    return data.products.filter((p) => p.tellChristy).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const onCount = data?.products.filter((p) => p.status === "on").length ?? 0;
  const offCount = data?.products.filter((p) => p.status === "off").length ?? 0;
  const followUpCount = data?.products.filter((p) => p.lookInto || p.tellChristy).length ?? 0;
  const flaggedCount = data?.products.filter((p) => p.fillers.some((f) => f.flagged)).length ?? 0;
  const overCount = data?.totals.filter((t) => t.overCeiling).length ?? 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "totals", label: "Daily totals" },
    { id: "products", label: "Products" },
    { id: "catalog", label: offCount > 0 ? `Catalog (${offCount})` : "Catalog" },
    { id: "flagged", label: followUpCount > 0 ? `Flagged (${followUpCount})` : "Flagged" },
    { id: "schedule", label: "Schedule" },
    { id: "prep", label: "Prep" },
    { id: "review", label: reviewBatch.length > 0 ? `Review (${reviewBatch.length})` : "Review" },
    { id: "rules", label: "Ceilings & fillers" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      {editing !== null && <ProductForm initial={editing === "new" ? null : editing} blacklistTerms={blacklistTerms} onClose={() => setEditing(null)} />}
      <main className="mx-auto max-w-3xl px-4 pb-24">
        <header className="pb-2 pt-5">
          <p className="font-serif-display text-3xl font-bold leading-tight">What am I actually<br />getting each day?</p>
          <p className="mt-2 text-[15px] text-[var(--dim)]">
            {q.isPending ? "Loading your regimen…" : data ? <>{onCount} product{onCount === 1 ? "" : "s"} on{overCount > 0 ? <> · <span className="font-semibold text-[var(--warn)]">{overCount} ingredient{overCount === 1 ? "" : "s"} over ceiling</span></> : ""}{flaggedCount > 0 ? <> · {flaggedCount} with flagged fillers</> : ""}{reviewBatch.length > 0 ? <> · <button type="button" onClick={() => setTab("review")} className="font-semibold text-[var(--accent)] underline">{reviewBatch.length} for Sunday review</button></> : ""}{followUpCount > 0 ? <> · <button type="button" onClick={() => setTab("flagged")} className="font-semibold text-[var(--amber)] underline">{lookIntoProducts.length > 0 ? `${lookIntoProducts.length} to look into` : ""}{lookIntoProducts.length > 0 && tellChristyProducts.length > 0 ? ", " : ""}{tellChristyProducts.length > 0 ? `${tellChristyProducts.length} to tell Christy` : ""}</button></> : ""}{offCount > 0 ? <> · <button type="button" onClick={() => setTab("catalog")} className="font-semibold text-[var(--accent)] underline">{offCount} in the catalog</button></> : ""}</> : ""}
          </p>
        </header>

        <nav aria-label="Sections" className="sticky top-0 z-20 -mx-4 bg-[var(--bg)] px-4 py-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold ${tab === t.id ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]"}`}>{t.label}</button>
            ))}
          </div>
        </nav>

        {q.isPending && <p className="py-10 text-center text-[var(--dim)]">Loading…</p>}
        {q.error && <div className="mt-4 rounded-xl bg-[var(--warn-soft)] p-4 text-[var(--warn)]"><p>Couldn't load your tracker.</p><button type="button" onClick={() => q.refetch()} className="mt-2 font-semibold underline">Retry</button></div>}

        {data && tab === "totals" && (
          <section aria-label="Daily totals" className="mt-3 space-y-3">
            <p className="text-sm text-[var(--dim)]">Summed across everything marked <strong>On</strong> — per-serving amount × servings/day. Where a compound lists an elemental amount, the elemental total (e.g. Magnesium) is counted separately from the compound.</p>
            {data.totals.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center"><p className="font-medium">No ingredient totals yet</p><p className="mt-1 text-sm text-[var(--dim)]">Products marked On need ingredient amounts before totals can calculate. Add them from the Products tab.</p></div>}
            {data.totals.map((t) => <TotalCard key={t.ingredient + t.unit} t={t} />)}
          </section>
        )}

        {data && tab === "products" && (
          <section aria-label="Products" className="mt-3">
            <div className="flex flex-wrap gap-2">
              <input aria-label="Search products" className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select aria-label="Filter by status" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">Active — on + paused</option><option value="on">On</option><option value="paused">Paused</option><option value="off">Off</option><option value="all">All statuses</option></select>
            </div>
            <button type="button" onClick={() => setEditing("new")} className="mt-3 w-full rounded-xl bg-[var(--accent)] px-5 py-3.5 font-semibold text-white">+ Add a product</button>
            <div className="mt-3 space-y-3">
              {filteredProducts.length === 0 && <p className="py-8 text-center text-[var(--dim)]">No products match.</p>}
              {filteredProducts.map((p) => {
                const flagged = p.fillers.filter((f) => f.flagged);
                const expanded = expandedId === p.id;
                return (
                  <article key={p.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-serif-display text-xl font-bold leading-snug">{p.name}</h3>
                        <p className="text-sm text-[var(--dim)]">{[p.brand, p.type === "medication" ? "Medication" : "Supplement", p.inStock ? "" : "Not in stock"].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusStyle(p.status)}`}>{p.status}</span>
                    </div>
                    {(p.servingDesc || p.times.length > 0) && <p className="mt-2 text-sm">{p.servingDesc}{p.servingDesc && p.servingsPerDay !== 1 ? ` · ${p.servingsPerDay}×/day` : ""}{p.times.length > 0 ? <> · <span className="font-medium">{p.times.map((t) => t.conditional ? `${t.timeLabel} (${t.conditionLabel || "sometimes only"})` : t.timeLabel).join(" · ")}</span></> : ""}</p>}
                    {p.ingredients.length > 0 && <p className="mt-1.5 text-sm text-[var(--dim)]">{p.ingredients.map((i) => `${i.name}${i.amountPerServing != null ? ` ${fmtAmount(i.amountPerServing, i.unit)}` : ""}${i.elementalAmount != null && i.elementalLabel ? ` (${fmtAmount(i.elementalAmount, i.elementalUnit ?? i.unit)} ${i.elementalLabel})` : ""}`).join(" · ")}</p>}
                    {hasAppearance(p) && <p className="mt-1.5 flex items-center gap-2 text-sm text-[var(--dim)]">{p.pillPhotoUrl && <img src={p.pillPhotoUrl} alt={`Pill photo for ${p.name}`} className="h-8 w-8 shrink-0 rounded object-cover" />}<span>Looks like: {appearanceText(p) || "photo on file"}</span></p>}
                    {(p.reviewCadence === "weekly" || p.reviewCadence === "monthly") && (() => { const sched = reviewSchedule(p); return (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">{reviewCadenceLabel(p.reviewCadence)} · Sun afternoon</span>
                        {sched?.overdue && <span className="rounded-full bg-[var(--warn)] px-2.5 py-1 text-xs font-bold text-white">Review overdue</span>}
                        {sched && !sched.overdue && sched.inNextBatch && <span className="rounded-full bg-[var(--amber-soft)] px-2.5 py-1 text-xs font-bold text-[var(--amber)]">For {fmtReviewDate(sched.nextDue)}</span>}
                        {sched && !sched.inNextBatch && <span className="text-[var(--dim)]">Next: {fmtReviewDate(sched.nextDue)}</span>}
                      </p>
                    ); })()}
                    {p.infoUrl && <p className="mt-1.5 text-sm"><a href={p.infoUrl} target="_blank" rel="noreferrer" aria-label={`Product info for ${p.name}`} className="font-semibold text-[var(--accent)] underline">Product info ↗</a></p>}
                    <FlagChips p={p} />
                    {flagged.length > 0 && <p className="mt-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm font-medium text-[var(--warn)]">⚠ Flagged filler{flagged.length === 1 ? "" : "s"}: {flagged.map((f) => f.name).join(", ")}</p>}
                    {p.whyTaking && <p className="mt-2 text-sm"><span className="font-semibold">Why:</span> {p.whyTaking}</p>}
                    {expanded && (
                      <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 text-sm">
                        {p.infoUrl && <p><span className="font-semibold">Info link:</span> <a href={p.infoUrl} target="_blank" rel="noreferrer" aria-label={`Open product info for ${p.name}`} className="break-all font-medium text-[var(--accent)] underline">{p.infoUrl}</a></p>}
                        {p.seenSource.trim() && <SeenSource p={p} />}
                        {(p.reviewCadence === "weekly" || p.reviewCadence === "monthly") && (
                          <div className="rounded-lg bg-[var(--surface2)] px-3 py-2.5">
                            <p><span className="font-semibold">Periodic review:</span> {reviewCadenceLabel(p.reviewCadence)} on Sunday afternoons · {fmtLastReviewed(p.lastReviewedAt)}</p>
                            {p.reviewNote && <p className="mt-1"><span className="font-semibold">What to check:</span> {p.reviewNote}</p>}
                            <button type="button" aria-label={`Mark ${p.name} as reviewed today`} disabled={markReviewed.isPending} onClick={() => markReviewed.mutate({ id: p.id })} className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Mark reviewed today</button>
                          </div>
                        )}
                        {p.effectWanted && <p><span className="font-semibold">Effect I actually want:</span> {p.effectWanted}</p>}
                        {p.effectsWatch && <p><span className="font-semibold">Watch / concerns:</span> {p.effectsWatch}</p>}
                        {p.notes && <p><span className="font-semibold">Notes:</span> {p.notes}</p>}
                        {p.fillers.length > 0 && <div><p className="font-semibold">Fillers / other ingredients:</p><div className="mt-1.5 flex flex-wrap gap-1.5">{p.fillers.map((f) => <span key={f.id} className={`rounded-full px-2.5 py-1 text-xs font-medium ${f.flagged ? "bg-[var(--warn)] text-white" : "bg-[var(--surface2)] text-[var(--dim)]"}`}>{f.name}{f.flagged ? " ⚠" : ""}</span>)}</div></div>}
                        {p.fillers.length === 0 && <p className="text-[var(--dim)]">No fillers recorded yet.</p>}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-[var(--dim)]">Set status:</span>
                          {(["on", "paused", "off"] as const).map((s) => (
                            <button key={s} type="button" aria-label={`Set ${p.name} to ${s}`} disabled={p.status === s} onClick={() => setStatus.mutate({ id: p.id, status: s })} className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${p.status === s ? statusStyle(s) + " opacity-60" : "bg-[var(--surface2)]"}`}>{s}</button>
                          ))}
                        </div>
                        <FlagControls p={p} onToggle={(args) => setFlags.mutate(args)} />
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setExpandedId(expanded ? null : p.id)} aria-expanded={expanded} className="flex-1 rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-semibold">{expanded ? "Hide details" : "Details — why, effects, fillers"}</button>
                      <button type="button" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="rounded-lg bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)]">Edit</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {data && tab === "catalog" && (
          <section aria-label="Catalog — not currently taking" className="mt-3">
            <div>
              <h2 className="font-serif-display text-2xl font-bold">Catalog — not taking right now</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Everything here is marked <strong>Off</strong>, so it stays out of your daily totals, schedule, prep, and Sunday review. Most of these came from your Amazon order history — the notes on each one carry the order dates, how many you ordered, and the last price. When you start taking one, tap <strong>Start taking</strong> and it joins your regimen; stock isn't confirmed for any of them, so check the shelf first.</p>
            </div>
            <input aria-label="Search the catalog" className="mt-3 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5" placeholder="Search the catalog…" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} />
            <div className="mt-3 space-y-3">
              {catalogProducts.length === 0 && <p className="py-8 text-center text-[var(--dim)]">{offCount === 0 ? "Nothing in the catalog — everything you track is active." : "No catalog products match your search."}</p>}
              {catalogProducts.map((p) => (
                <article key={p.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-serif-display text-xl font-bold leading-snug">{p.name}</h3>
                      <p className="text-sm text-[var(--dim)]">{[p.brand, p.type === "medication" ? "Medication" : "Supplement"].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusStyle(p.status)}`}>{p.status}</span>
                  </div>
                  {p.servingDesc && <p className="mt-2 text-sm">{p.servingDesc}</p>}
                  {p.ingredients.length > 0 && <p className="mt-1.5 text-sm text-[var(--dim)]">{p.ingredients.map((i) => `${i.name}${i.amountPerServing != null ? ` ${fmtAmount(i.amountPerServing, i.unit)}` : ""}`).join(" · ")}</p>}
                  {p.infoUrl && <p className="mt-1.5 text-sm"><a href={p.infoUrl} target="_blank" rel="noreferrer" aria-label={`Product info for ${p.name}`} className="font-semibold text-[var(--accent)] underline">Product info ↗</a></p>}
                  <FlagChips p={p} />
                  {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-[var(--dim)]">{p.notes}</p>}
                  {p.seenSource.trim() && <div className="mt-2 text-sm"><SeenSource p={p} /></div>}
                  <div className="mt-3">
                    <FlagControls p={p} onToggle={(args) => setFlags.mutate(args)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" aria-label={`Start taking ${p.name}`} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: p.id, status: "on" })} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Start taking</button>
                    <button type="button" aria-label={`Pause ${p.name} instead of off`} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: p.id, status: "paused" })} className="rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Move to paused</button>
                    <button type="button" aria-label={`Edit ${p.name} in catalog`} onClick={() => setEditing(p)} className="rounded-lg bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)]">Edit</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {data && tab === "flagged" && (
          <section aria-label="Flagged follow-ups" className="mt-3 space-y-4">
            <div>
              <h2 className="font-serif-display text-2xl font-bold">Flagged — so you don't forget</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Two kinds of flag, one list. <strong>Look into soon</strong> is for things you want to research. <strong>Tell Christy</strong> is for things you want to mention to her. Flags work on any product, taking it or not, and they stay counted in the header and the tab bar until you clear them — and they ride along in the Sunday review below, too.</p>
            </div>

            <div className="rounded-2xl border border-[var(--amber)] bg-[var(--amber-soft)] p-4">
              <h3 className="font-serif-display text-lg font-bold">Look into soon{lookIntoProducts.length > 0 ? ` — ${lookIntoProducts.length}` : ""}</h3>
              {lookIntoProducts.length === 0 && <p className="mt-1 text-sm text-[var(--dim)]">Nothing flagged to look into. Flag a product from its card in Products or the Catalog, or from the Edit screen's “Follow-up flags” section.</p>}
              {lookIntoProducts.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {lookIntoProducts.map((p) => (
                    <li key={p.id} className="rounded-xl bg-[var(--surface)] p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-sm text-[var(--dim)]">{[p.brand, p.type === "medication" ? "Medication" : "Supplement"].filter(Boolean).join(" · ")}{p.tellChristy ? " · also flagged for Christy" : ""}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusStyle(p.status)}`}>{p.status}</span>
                      </div>
                      {p.whyTaking && <p className="mt-2 text-sm"><span className="font-semibold">Why:</span> {p.whyTaking}</p>}
                      {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-[var(--dim)]">{p.notes}</p>}
                      {p.seenSource.trim() && <div className="mt-2"><SeenSource p={p} /></div>}
                      {p.infoUrl && <p className="mt-1.5 text-sm"><a href={p.infoUrl} target="_blank" rel="noreferrer" aria-label={`Product info for ${p.name}`} className="font-semibold text-[var(--accent)] underline">Product info ↗</a></p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" aria-label={`Done looking into ${p.name} — clear flag`} disabled={setFlags.isPending} onClick={() => setFlags.mutate({ id: p.id, lookInto: false })} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Looked into — clear flag</button>
                        {p.status === "off" && <button type="button" aria-label={`Start taking ${p.name} from flagged`} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: p.id, status: "on" })} className="rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Start taking</button>}
                        <button type="button" aria-label={`Edit ${p.name} from flagged`} onClick={() => setEditing(p)} className="rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-semibold">Edit</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="font-serif-display text-lg font-bold">Tell Christy about{tellChristyProducts.length > 0 ? ` — ${tellChristyProducts.length}` : ""}</h3>
              <p className="mt-1 text-sm text-[var(--dim)]">Things to mention to Christy. Clear each one once you've told her.</p>
              {tellChristyProducts.length === 0 && <p className="mt-3 text-sm text-[var(--dim)]">Nothing flagged for Christy right now.</p>}
              {tellChristyProducts.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {tellChristyProducts.map((p) => (
                    <li key={p.id} className="rounded-xl bg-[var(--surface2)] p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-sm text-[var(--dim)]">{[p.brand, p.type === "medication" ? "Medication" : "Supplement"].filter(Boolean).join(" · ")}{p.lookInto ? " · also flagged to look into" : ""}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusStyle(p.status)}`}>{p.status}</span>
                      </div>
                      {p.whyTaking && <p className="mt-2 text-sm"><span className="font-semibold">Why:</span> {p.whyTaking}</p>}
                      {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-[var(--dim)]">{p.notes}</p>}
                      {p.seenSource.trim() && <div className="mt-2"><SeenSource p={p} /></div>}
                      {p.infoUrl && <p className="mt-1.5 text-sm"><a href={p.infoUrl} target="_blank" rel="noreferrer" aria-label={`Product info for ${p.name}`} className="font-semibold text-[var(--accent)] underline">Product info ↗</a></p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" aria-label={`Told Christy about ${p.name} — clear flag`} disabled={setFlags.isPending} onClick={() => setFlags.mutate({ id: p.id, tellChristy: false })} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Told her — clear flag</button>
                        <button type="button" aria-label={`Edit ${p.name} from tell-Christy list`} onClick={() => setEditing(p)} className="rounded-lg bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold">Edit</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {data && tab === "schedule" && (
          <section aria-label="Schedule" className="mt-3 space-y-4">
            <p className="text-sm text-[var(--dim)]">Everything you're on (plus paused items, dimmed), grouped by time of day. A product taken at more than one time appears in each of its groups.</p>
            {scheduleGroups.length === 0 && <p className="py-8 text-center text-[var(--dim)]">Nothing scheduled yet.</p>}
            {scheduleGroups.map((g) => (
              <div key={g.timing} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="font-serif-display text-lg font-bold">{g.timing}</h3>
                <ul className="mt-2 divide-y divide-[var(--border)]">
                  {g.items.map((item) => (
                    <li key={item.product.id} className={`flex items-baseline justify-between gap-3 py-2.5 ${item.product.status === "paused" ? "opacity-50" : ""}`}>
                      <span className="font-medium">
                        {item.product.name}{item.product.status === "paused" ? " (paused)" : ""}
                        {item.conditional && <span className="ml-2 rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-xs font-bold text-[var(--amber)]">{item.conditionLabel || "sometimes only"}</span>}
                      </span>
                      <span className="shrink-0 text-sm text-[var(--dim)]">{item.product.servingDesc}{item.product.servingsPerDay !== 1 ? ` × ${item.product.servingsPerDay}/day` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {data && tab === "prep" && (
          <section aria-label="Weekly prep" className="mt-3 space-y-4">
            <p className="text-sm text-[var(--dim)]">Your week, slot by slot — with what each pill looks like, so if you change your mind mid-week you can sort pills back into the right bottles. Paused items are dimmed.</p>
            {scheduleGroups.length === 0 && <p className="py-8 text-center text-[var(--dim)]">Nothing to prep yet.</p>}
            {scheduleGroups.map((g) => {
              const slotProducts = g.items.map((i) => i.product);
              const pairs: { a: Product; b: Product }[] = [];
              for (let i = 0; i < slotProducts.length; i++) {
                for (let j = i + 1; j < slotProducts.length; j++) {
                  const a = slotProducts[i];
                  const b = slotProducts[j];
                  if (a && b && a.id !== b.id && lookAlike(a, b)) pairs.push({ a, b });
                }
              }
              const unlogged = slotProducts.filter((p) => !hasAppearance(p));
              return (
                <div key={g.timing} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="font-serif-display text-lg font-bold">{g.timing}</h3>
                  {pairs.length > 0 && (
                    <div className="mt-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm text-[var(--warn)]">
                      <p className="font-bold">⚠ Look-alikes in this slot</p>
                      {pairs.map(({ a, b }) => (
                        <p key={`${a.id}-${b.id}`} className="mt-1"><strong>{a.name}</strong> and <strong>{b.name}</strong> are both {describeLookAlike(a)}. Prep this slot into <strong>separate containers — one per product</strong> — instead of mixing them, so you can sort them back if you change your mind.</p>
                      ))}
                    </div>
                  )}
                  <ul className="mt-2 divide-y divide-[var(--border)]">
                    {g.items.map((item) => (
                      <li key={item.product.id} className={`flex gap-3 py-3 ${item.product.status === "paused" ? "opacity-50" : ""}`}>
                        {item.product.pillPhotoUrl
                          ? <img src={item.product.pillPhotoUrl} alt={`Pill photo for ${item.product.name}`} className="h-14 w-14 shrink-0 rounded-lg border border-[var(--border)] object-cover" />
                          : <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--surface2)] text-xs text-[var(--dim)]">no photo</span>}
                        <div className="min-w-0">
                          <p className="font-medium">
                            {item.product.name}{item.product.status === "paused" ? " (paused)" : ""}
                            {item.conditional && <span className="ml-2 rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-xs font-bold text-[var(--amber)]">{item.conditionLabel || "sometimes only"}</span>}
                          </p>
                          <p className="text-sm text-[var(--dim)]">{item.product.servingDesc}{item.product.servingsPerDay !== 1 ? ` × ${item.product.servingsPerDay}/day` : ""}</p>
                          {hasAppearance(item.product)
                            ? <p className="text-sm">{appearanceText(item.product) || "See photo"}</p>
                            : <p className="text-sm text-[var(--dim)]">Appearance not logged yet — add it from Products → Edit so look-alikes can be told apart.</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {unlogged.length > 0 && pairs.length === 0 && (
                    <p className="mt-2 text-sm text-[var(--dim)]">Look-alike check is incomplete for this slot — appearance not logged for: {unlogged.map((p) => p.name).join(", ")}.</p>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {data && tab === "review" && (
          <section aria-label="Sunday afternoon review" className="mt-3 space-y-4">
            <div>
              <h2 className="font-serif-display text-2xl font-bold">Sunday afternoon review</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">For supplements and meds treating an acute issue — the ones that shouldn't stay on autopilot. Weekly and monthly items are grouped together here so one Sunday sitting covers everything due. Next review day: <strong className="text-[var(--text)]">{fmtReviewDate(comingSunday)}</strong>.</p>
            </div>

            <div className={`rounded-2xl border p-4 ${reviewBatch.length > 0 ? "border-[var(--amber)] bg-[var(--amber-soft)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <h3 className="font-serif-display text-lg font-bold">{reviewBatch.length > 0 ? `For this Sunday — ${reviewBatch.length} to review` : "Nothing due this Sunday"}</h3>
              {reviewBatch.length === 0 && <p className="mt-1 text-sm text-[var(--dim)]">{reviewProducts.length === 0 ? "No products have a periodic review set yet. Open a product below — or from the Products tab — choose Edit, and set its review cadence to Weekly or Monthly." : "Everything with a periodic review is scheduled for a later Sunday. The full list is below."}</p>}
              {reviewBatch.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {reviewBatch.map(({ product: p, schedule: sched }) => (
                    <li key={p.id} className="rounded-xl bg-[var(--surface)] p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{p.name}{p.status === "paused" ? " (paused)" : ""}</p>
                          <p className="text-sm text-[var(--dim)]">{reviewCadenceLabel(p.reviewCadence)} · {sched.neverReviewed ? `Due ${fmtReviewDate(sched.nextDue)} — never reviewed yet` : sched.overdue ? `Was due ${fmtReviewDate(sched.nextDue)}` : `Due ${fmtReviewDate(sched.nextDue)}`}{!sched.neverReviewed && <> · {fmtLastReviewed(p.lastReviewedAt)}</>}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusStyle(p.status)}`}>{p.status}</span>
                      </div>
                      {p.reviewNote && <p className="mt-2 text-sm"><span className="font-semibold">Check:</span> {p.reviewNote}</p>}
                      {!p.reviewNote && p.whyTaking && <p className="mt-2 text-sm"><span className="font-semibold">Why:</span> {p.whyTaking}</p>}
                      {p.effectWanted && <p className="mt-1 text-sm text-[var(--dim)]">Wanted effect: {p.effectWanted}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" aria-label={`Mark ${p.name} as reviewed`} disabled={markReviewed.isPending} onClick={() => markReviewed.mutate({ id: p.id })} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Mark reviewed today</button>
                        <button type="button" aria-label={`Edit ${p.name} from review`} onClick={() => setEditing(p)} className="rounded-lg bg-[var(--surface2)] px-4 py-2.5 text-sm font-semibold">Edit — change, pause, or stop it</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {followUpCount > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="font-serif-display text-lg font-bold">Also flagged — don't forget these</h3>
                <p className="mt-1 text-sm text-[var(--dim)]">Your follow-up flags ride along here so Sunday covers them too. Clear them on the Flagged tab once they're handled.</p>
                <ul className="mt-2 divide-y divide-[var(--border)]">
                  {[...lookIntoProducts, ...tellChristyProducts.filter((p) => !p.lookInto)].map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{p.name}{p.status !== "on" ? <span className="text-[var(--dim)]"> ({p.status})</span> : ""}</p>
                        <p className="flex flex-wrap gap-1.5 pt-1">
                          {p.lookInto && <span className="rounded-full bg-[var(--amber)] px-2 py-0.5 text-xs font-bold text-white">Look into soon</span>}
                          {p.tellChristy && <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-bold text-white">Tell Christy</span>}
                        </p>
                      </div>
                      <button type="button" aria-label={`Open ${p.name} on the Flagged tab`} onClick={() => setTab("flagged")} className="shrink-0 rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm font-semibold">Open Flagged tab</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(["weekly", "monthly"] as const).map((cadence) => {
              const group = reviewProducts
                .filter((p) => p.reviewCadence === cadence)
                .map((p) => ({ product: p, schedule: reviewSchedule(p) }))
                .filter((x): x is { product: Product; schedule: ReviewSchedule } => x.schedule != null)
                .sort((a, b) => a.schedule.nextDue.getTime() - b.schedule.nextDue.getTime() || a.product.name.localeCompare(b.product.name));
              return (
                <div key={cadence} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="font-serif-display text-lg font-bold">{cadence === "weekly" ? "Weekly reviews" : "Monthly reviews"}</h3>
                  <p className="mt-1 text-sm text-[var(--dim)]">{cadence === "weekly" ? "Due every Sunday afternoon." : "Due on a Sunday afternoon about once a month — the first Sunday at least 4 weeks after the last review."}</p>
                  {group.length === 0 && <p className="mt-3 text-sm text-[var(--dim)]">None set. Add one from a product's Edit screen — look for “Periodic review”.</p>}
                  {group.length > 0 && (
                    <ul className="mt-2 divide-y divide-[var(--border)]">
                      {group.map(({ product: p, schedule: sched }) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                          <div className="min-w-0">
                            <p className="font-medium">{p.name}{p.status === "paused" ? " (paused)" : ""}{sched.overdue ? <span className="ml-2 rounded-full bg-[var(--warn)] px-2 py-0.5 text-xs font-bold text-white">OVERDUE</span> : sched.inNextBatch ? <span className="ml-2 rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-xs font-bold text-[var(--amber)]">THIS SUNDAY</span> : ""}</p>
                            <p className="text-sm text-[var(--dim)]">Next: {fmtReviewDate(sched.nextDue)} · {fmtLastReviewed(p.lastReviewedAt)}{p.reviewNote ? ` · Check: ${p.reviewNote}` : ""}</p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button type="button" aria-label={`Mark ${p.name} as reviewed in ${cadence} group`} disabled={markReviewed.isPending} onClick={() => markReviewed.mutate({ id: p.id })} className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50">Mark reviewed</button>
                            <button type="button" aria-label={`Edit ${p.name} in ${cadence} group`} onClick={() => setEditing(p)} className="rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm font-semibold">Edit</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {data && tab === "rules" && <RulesSection data={data} />}
      </main>
    </div>
  );
}

function RulesSection({ data }: { data: Data }) {
  const queryClient = useQueryClient();
  const [ingName, setIngName] = useState("");
  const [ceilAmt, setCeilAmt] = useState("");
  const [ceilUnit, setCeilUnit] = useState("mg");
  const [ceilSource, setCeilSource] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const inputCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)]";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-[var(--dim)] mb-1";

  const saveLimit = useMutation({
    mutationFn: () => api.saveLimit({ ingredientName: ingName.trim(), ceilingAmount: parseFloat(ceilAmt), unit: ceilUnit, sourceNote: ceilSource }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all"] }); setIngName(""); setCeilAmt(""); setCeilSource(""); },
  });
  const delLimit = useMutation({ mutationFn: (id: number) => api.deleteLimit({ id }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all"] }) });
  const addTerm = useMutation({ mutationFn: () => api.addBlacklistTerm({ term: newTerm.trim() }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all"] }); setNewTerm(""); } });
  const delTerm = useMutation({ mutationFn: (id: number) => api.deleteBlacklistTerm({ id }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all"] }) });

  return (
    <section aria-label="Ceilings and filler rules" className="mt-3 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-serif-display text-xl font-bold">Daily ceilings</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">Daily totals are checked against these. Exceeding one flags the ingredient on the totals board.</p>
        <ul className="mt-3 space-y-2">
          {data.limits.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface2)] px-3 py-2.5">
              <div><p className="font-semibold">{l.ingredientName} — {fmtAmount(l.ceilingAmount, l.unit)}/day</p>{l.sourceNote && <p className="text-sm text-[var(--dim)]">{l.sourceNote}</p>}</div>
              <button type="button" aria-label={`Delete ceiling for ${l.ingredientName}`} onClick={() => delLimit.mutate(l.id)} className="shrink-0 rounded-lg bg-[var(--warn-soft)] px-3 py-1.5 text-sm font-medium text-[var(--warn)]">Delete</button>
            </li>
          ))}
          {data.limits.length === 0 && <li className="text-sm text-[var(--dim)]">No ceilings set.</li>}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-4">
          <div className="col-span-2 sm:col-span-1"><label htmlFor="lim-name" className={labelCls}>Ingredient</label><input id="lim-name" aria-label="Ceiling ingredient name" className={inputCls} value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="e.g. Magnesium" /></div>
          <div><label htmlFor="lim-amt" className={labelCls}>Ceiling amount</label><input id="lim-amt" aria-label="Ceiling amount" className={inputCls} type="number" step="any" min="0" inputMode="decimal" value={ceilAmt} onChange={(e) => setCeilAmt(e.target.value)} placeholder="500" /></div>
          <div><label htmlFor="lim-unit" className={labelCls}>Unit</label><select id="lim-unit" aria-label="Ceiling unit" className={inputCls} value={ceilUnit} onChange={(e) => setCeilUnit(e.target.value)}><option>mg</option><option>g</option><option>mcg</option><option>IU</option></select></div>
          <div className="col-span-2"><label htmlFor="lim-src" className={labelCls}>Source note</label><input id="lim-src" aria-label="Ceiling source note" className={inputCls} value={ceilSource} onChange={(e) => setCeilSource(e.target.value)} placeholder="e.g. EFSA 2018" /></div>
        </div>
        <button type="button" disabled={!ingName.trim() || !ceilAmt || saveLimit.isPending} onClick={() => saveLimit.mutate()} className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add ceiling</button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-serif-display text-xl font-bold">Flagged fillers — your blacklist</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">Any product whose filler list contains one of these terms gets flagged, everywhere. Matching is “contains” — “rice” catches rice flour, rice starch, and rice powder. Editing this re-flags every product instantly.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.blacklist.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-2 rounded-full bg-[var(--warn-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--warn)]">{b.term}<button type="button" aria-label={`Remove ${b.term} from blacklist`} onClick={() => delTerm.mutate(b.id)} className="font-bold">×</button></span>
          ))}
          {data.blacklist.length === 0 && <p className="text-sm text-[var(--dim)]">Blacklist is empty.</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <input aria-label="New blacklist term" className={`${inputCls} flex-1`} value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder="Add a filler to flag…" />
          <button type="button" disabled={!newTerm.trim() || addTerm.isPending} onClick={() => addTerm.mutate()} className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add</button>
        </div>
      </div>
    </section>
  );
}
