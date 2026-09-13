"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Clock3, CloudCheck, Download, Dumbbell, History, LoaderCircle, Plus, RotateCcw, ShieldCheck, Trash2, TrendingUp, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Combobox, ComboboxInput, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { completedSets, exerciseNames, previousExercise, progressPoints, volume, workoutSchema, sessionClock, resumeSession, stopSessionTimer, workoutPayload as transport, sameWorkoutPayload as samePayload, newWorkoutSet as newSet, type Exercise, type LiftSet, type Workout } from "@/lib/workouts";

import { loadWorkoutPages, MAX_SAVE_BATCH } from "@/lib/workout-requests";

const number = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 1 });
const date = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const DRAFT_KEY = "stackd.unsaved-workout.v1";


export default function WorkoutApp() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [draft, setDraft] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [tab, setTab] = useState("workout");
  const [picker, setPicker] = useState(false);
  const exerciseDialog = useRef<HTMLDivElement | null>(null);
  const [customName, setCustomName] = useState("");
  const [detail, setDetail] = useState<Workout | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workout | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressName, setProgressName] = useState("");
  const [now, setNow] = useState(Date.now());
  const pending = useRef<Workout | null>(null);
  const outstanding = useRef<Workout | null>(null);
  const unparsedRecovery = useRef<string | null>(null);
  const revisions = useRef<Record<string, number>>({});
  const inFlight = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false);
  const autoSavePaused = useRef(false);
  const dirty = useRef(false);
  const actionLock = useRef(false);
  const activeId = useRef<string | null>(null);
  const clock = draft ? sessionClock(draft, now) : null;
  const timerRunning = clock?.running ?? false;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const all = await loadWorkoutPages();
      all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      setWorkouts(all);
      all.forEach(w => { revisions.current[w.id] = w.revision; });
      let active = all.find(w => !w.completedAt) ?? null;
      try {
        const savedDraft = sessionStorage.getItem(DRAFT_KEY);
        const envelope = savedDraft ? JSON.parse(savedDraft) : null;
        const rawDraft = envelope?.draft ?? envelope;
        const local = rawDraft ? workoutSchema.safeParse(transport(rawDraft)) : null;
        if (local?.success) {
          active = local.data;
          revisions.current[active.id] = local.data.revision;
          pending.current = active; dirty.current = true;
          const priorRequest = envelope?.outstanding ? workoutSchema.safeParse(envelope.outstanding) : null;
          if (priorRequest?.success) outstanding.current = priorRequest.data;
          setSaveStatus("unsaved");
          toast("Your unsaved workout has been recovered.");
        } else if (savedDraft) {
          unparsedRecovery.current = savedDraft;
          setError("A local recovery copy could not be opened. Export your log to preserve that copy before continuing.");
        }
      } catch { try { unparsedRecovery.current = sessionStorage.getItem(DRAFT_KEY); } catch { /* optional storage */ } }
      activeId.current = active?.id ?? null;
      setNow(Date.now()); setDraft(active); setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load workouts."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!timerRunning) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      clearInterval(timer);
      if (!document.hidden) {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 15000);
      }
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [timerRunning]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function remember(w: Workout) {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: { ...transport(w), revision: revisions.current[w.id] ?? w.revision }, outstanding: outstanding.current })); } catch { /* Storage unavailable: keep in memory and warn on leave. */ }
  }

  const flush = useCallback(async (automatic = false): Promise<boolean> => {
    if (automatic && autoSavePaused.current) return false;
    if (inFlight.current) return inFlight.current;
    if (blocked.current) return false;
    autoSavePaused.current = false;
    const task = (async () => {
      let requests = 0;
      while (pending.current || outstanding.current) {
        if (++requests > MAX_SAVE_BATCH) {
          autoSavePaused.current = true;
          setSaveStatus("unsaved");
          setError("Saving paused after several updates. Your edits are kept. Tap Retry to continue.");
          return false;
        }
        const current: Workout = outstanding.current ?? transport({ ...pending.current!, revision: revisions.current[pending.current!.id] ?? pending.current!.revision });
        outstanding.current = current;
        remember(pending.current ?? current);
        setSaveStatus("saving");
        try {
          const response = await fetch("/api/workouts", { method: "PUT", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) });
          const result = await response.json() as { workout: Workout; error?: string };
          if (!response.ok) {
            if (response.status === 409) blocked.current = true;
            if (response.status < 500) outstanding.current = null;
            remember(pending.current ?? current);
            throw new Error(result.error);
          }
          const saved = workoutSchema.parse(result.workout);
          if (!samePayload(current, saved)) {
            blocked.current = true;
            throw new Error("The save response did not match your workout. Your local edits are kept. Export them before reloading.");
          }
          outstanding.current = null;
          revisions.current[saved.id] = saved.revision;
          setWorkouts(prev => [saved, ...prev.filter(w => w.id !== saved.id)].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
          if (pending.current && samePayload(pending.current, saved)) pending.current = null;
          if (pending.current) remember(pending.current);
          else {
            dirty.current = false;
            try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* optional recovery */ }
            setDraft(prev => prev?.id === saved.id ? { ...prev, revision: saved.revision } : prev);
          }
          setError("");
        } catch (e) {
          autoSavePaused.current = true;
          setSaveStatus("unsaved"); setError(e instanceof Error ? e.message : "Not saved yet. Check your connection and retry.");
          return false;
        }
      }
      setSaveStatus("saved"); return true;
    })();
    inFlight.current = task;
    try { return await task; } finally { inFlight.current = null; }
  }, []);

  useEffect(() => {
    if (!pending.current) return;
    const timer = setTimeout(() => { void flush(true); }, 500);
    return () => clearTimeout(timer);
  }, [draft, flush]);

  function change(w: Workout, activity = true) {
    if (activity && actionLock.current) return;
    const time = Date.now();
    if (activity && draft && sessionClock(draft, time).needsReview) {
      setNow(time); toast("Resume or finish this paused session first."); return;
    }
    if (activity && !w.timer && !w.completedAt) w = resumeSession(w, time);
    autoSavePaused.current = false;
    if (activity && w.timer?.runningSince) w = { ...w, timer: { ...w.timer, lastActivityAt: new Date(time).toISOString() } };
    activeId.current = w.id;
    setNow(time);
    pending.current = w; dirty.current = true;
    remember(w); setDraft(w); setSaveStatus("unsaved");
  }
  const history = workouts.filter(w => !!w.completedAt);
  const totalSets = history.reduce((n, w) => n + completedSets(w).length, 0);
  const trackedNames = [...new Set(history.flatMap(w => w.exercises.filter(e => e.sets.some(s => s.done)).map(e => e.name)))].sort();
  const allNames = [...new Set([...exerciseNames, ...workouts.flatMap(w => w.exercises.map(e => e.name))])].sort();
  const selectedProgress = trackedNames.includes(progressName) ? progressName : trackedNames[0] ?? "";
  const points = progressPoints(history, selectedProgress);
  const thisWeek = history.filter(w => new Date(w.startedAt).getTime() >= now - 7 * 86400000);

  function start(from?: Workout) {
    if (activeId.current || actionLock.current) { setTab("workout"); toast("Finish or discard your current session first."); return; }
    const w: Workout = { id: crypto.randomUUID(), name: from?.name || "Workout", startedAt: new Date().toISOString(), completedAt: null, revision: 0, timer: { elapsedMs: 0, runningSince: null, lastActivityAt: null },
      exercises: from?.exercises.filter(e => e.sets.some(s => s.done)).map(e => ({ ...e, id: crypto.randomUUID(), sets: e.sets.filter(s => s.done).map(s => newSet(s)) })) ?? [] };
    revisions.current[w.id] = 0; change(w); setTab("workout"); setDetail(null);
    if (!from) setPicker(true);
  }
  function addExercise(name: string) {
    if (!draft || !name.trim()) return;
    const existing = allNames.find(n => n.toLowerCase() === name.trim().toLowerCase());
    name = existing || name.trim();
    if (draft.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) { toast("That exercise is already in this session."); return; }
    if (draft.exercises.length >= 30) { toast("A session supports up to 30 exercises."); return; }
    const prior = previousExercise(history.filter(w => w.id !== draft.id), name)?.sets.filter(s => s.done);
    const e: Exercise = { id: crypto.randomUUID(), name, sets: prior?.length ? prior.map(s => newSet(s)) : [newSet(), newSet(), newSet()] };
    change({ ...draft, exercises: [...draft.exercises, e] }); setPicker(false); setCustomName("");
  }
  function updateExercise(id: string, update: (e: Exercise) => Exercise) {
    if (draft) change({ ...draft, exercises: draft.exercises.map(e => e.id === id ? update(e) : e) });
  }
  function updateSet(e: Exercise, s: LiftSet, update: Partial<LiftSet>) {
    const next = { ...s, ...update };
    if (next.done && (!next.weight.trim() || !Number.isFinite(Number(next.weight)) || Number(next.weight) < 0 || Number(next.weight) > 2000 || !/^\d+$/.test(next.reps) || Number(next.reps) < 1 || Number(next.reps) > 1000)) { toast.error("Enter a valid weight and reps first. Use 0 kg for bodyweight."); return; }
    if (!draft) return;
    const w = draft.timer && !draft.timer.runningSince ? resumeSession(draft, Date.now()) : draft;
    change({ ...w, exercises: w.exercises.map(x => x.id === e.id ? { ...x, sets: x.sets.map(v => v.id === s.id ? next : v) } : x) });
  }
  async function finish() {
    if (!draft || !completedSets(draft).length || actionLock.current) return;
    actionLock.current = true; setBusy(true);
    const finished = { ...stopSessionTimer(draft, Date.now()), completedAt: draft.completedAt || new Date().toISOString() };
    change(finished, false);
    const saved = await flush();
    if (saved) { activeId.current = null; setDraft(null); setFinishOpen(false); setTab("history"); toast.success("Workout finished. Every set counts."); }
    actionLock.current = false; setBusy(false);
  }
  async function removeWorkout() {
    if (!deleteTarget || actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try {
      if (draft?.id === deleteTarget.id && !await flush()) throw new Error("Save or export your edits before discarding this workout.");
      const response = await fetch(`/api/workouts?id=${deleteTarget.id}&revision=${revisions.current[deleteTarget.id] ?? deleteTarget.revision}`, { method: "DELETE", signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setWorkouts(ws => ws.filter(w => w.id !== deleteTarget.id));
      if (draft?.id === deleteTarget.id) { activeId.current = null; setDraft(null); }
      setDeleteTarget(null); setDetail(null); toast("Workout deleted.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete workout."); }
    actionLock.current = false; setBusy(false);
  }
  function exportLog() {
    const blob = new Blob([JSON.stringify({ app: "Stackd", schemaVersion: 1, exportedAt: new Date().toISOString(), weightUnit: "kg", workouts, unsavedDraft: pending.current, unacknowledgedRequest: outstanding.current, unparsedRecovery: unparsedRecovery.current }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `stackd-workouts-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const currentSets = draft ? completedSets(draft).length : 0;
  const plannedSets = draft?.exercises.reduce((n, e) => n + e.sets.length, 0) ?? 0;

  return <div className="app-shell">
    <Toaster position="top-center" theme="dark" />
    <header className="topbar"><a href="/" className="brand" aria-label="Stackd home"><span className="brand-mark"><Dumbbell size={23} strokeWidth={2.7} /></span><span>stackd<span className="brand-stop">.</span></span></a><div className="topbar-right"><span className="private-label"><ShieldCheck size={15} /> Private training log</span><button className="icon-button export-button" onClick={exportLog} disabled={!loaded} aria-label="Export workout log"><Download size={18} /><span>Export log</span></button></div></header>
    <main className="workspace">
      <Tabs value={tab} onValueChange={setTab} className="main-tabs">
        <div className="workspace-heading"><div><p className="eyebrow">YOUR TRAINING, ON RECORD</p><h1>Make every set count<span>.</span></h1></div><TabsList className="nav-tabs"><TabsTrigger value="workout"><Dumbbell />Workout</TabsTrigger><TabsTrigger value="history"><History />History</TabsTrigger><TabsTrigger value="progress"><TrendingUp />Progress</TabsTrigger></TabsList></div>
        {error && <div role="alert" className="error-banner"><div><strong>{loaded ? "Your changes need attention" : "Unable to load your log"}</strong><p>{error}</p></div><button className="secondary-button" onClick={() => loaded ? void flush() : void load()}>Retry</button>{loaded && <button className="secondary-button" onClick={exportLog}>Export edits</button>}</div>}
        {loading ? <div className="loading"><LoaderCircle className="spin" /> Loading your training log…</div> : !loaded ? <div className="panel empty"><CloudCheck /><h2>Your saved workouts stay safe.</h2><p>Reconnect and retry to open your log.</p></div> : <>
        <TabsContent value="workout">
          <div className="workout-grid"><section className="session-main">
            {draft ? <>
              <div className="session-header"><div><p className="eyebrow">{draft.completedAt ? "FINISHING SESSION" : "CURRENT SESSION"}</p><input className="session-title" aria-label="Workout name" disabled={busy || !!clock?.needsReview} value={draft.name} maxLength={80} onChange={e => change({ ...draft, name: e.target.value })} onBlur={() => { if (!draft.name.trim()) change({ ...draft, name: "Workout" }); }} /><p className="session-meta"><Clock3 size={14} />{clock?.elapsedMs === null ? "Duration unavailable" : `${Math.floor((clock?.elapsedMs ?? 0) / 60000)} min`}{clock?.needsReview ? " · Paused" : ""} <span>·</span>{date(draft.startedAt)}</p></div><button className="primary-button" onClick={() => setFinishOpen(true)} disabled={!currentSets || busy}>Finish <Check size={17} /></button></div>
              {clock?.needsReview && <div className="panel session-review" role="status"><h2>This session was left open</h2><p>The timer has paused. Your sets are safe. Resume to keep logging, finish your completed sets, or discard the session.</p>{clock.elapsedMs === null && <p>This older session has no activity record, so its duration cannot be recovered reliably.</p>}<button className="secondary-button" disabled={busy} onClick={() => change(resumeSession(draft, Date.now()), false)}>Resume session</button></div>}
              {!draft.timer?.runningSince && !clock?.needsReview && !draft.completedAt && draft.timer?.elapsedMs === 0 && <p className="muted">The timer starts when you first enter a weight or reps.</p>}
              <fieldset className="session-fields" disabled={busy || !!clock?.needsReview || !!draft.completedAt}>
              {!draft.exercises.length && <div className="panel empty compact"><Dumbbell size={34} /><h2>First exercise. Fresh start.</h2><p>Add a lift to start logging your sets.</p><button className="primary-button" onClick={() => setPicker(true)}><Plus size={17} /> Add exercise</button></div>}
              {draft.exercises.map((e, index) => { const prior = previousExercise(history.filter(w => w.id !== draft.id), e.name)?.sets.filter(s => s.done); return <article className="exercise-card" key={e.id}><div className="exercise-header"><span className="exercise-index">{String(index + 1).padStart(2, "0")}</span><div><h2>{e.name}</h2><p>{prior ? "Last session shown below" : "No previous sets yet"}</p></div><button className="icon-button" aria-label={`Remove ${e.name}`} onClick={() => { if (e.sets.some(s => s.done)) { toast("Uncheck completed sets before removing this exercise."); return; } change({ ...draft, exercises: draft.exercises.filter(x => x.id !== e.id) }); }}><X size={17} /></button></div>
                <div className="set-grid set-labels" aria-hidden="true"><span>SET</span><span>PREVIOUS</span><span>KG</span><span>REPS</span><Check size={14} /><span /></div>
                {e.sets.map((s, i) => <div className={`set-grid set-row ${s.done ? "set-done" : ""}`} key={s.id}><span className="set-number">{i + 1}</span><span className="previous-set">{prior?.[i] ? `${prior[i].weight} × ${prior[i].reps}` : "—"}</span><input aria-label={`${e.name} set ${i + 1} weight in kg`} inputMode="decimal" type="text" autoComplete="off" placeholder="0" value={s.weight} maxLength={10} disabled={s.done} onFocus={ev => ev.target.select()} onChange={ev => { if (/^\d*(\.\d*)?$/.test(ev.target.value) && (ev.target.value === "" || Number(ev.target.value) <= 2000)) updateSet(e, s, { weight: ev.target.value }); }} /><input aria-label={`${e.name} set ${i + 1} reps`} inputMode="numeric" type="text" autoComplete="off" placeholder="0" value={s.reps} maxLength={4} disabled={s.done} onFocus={ev => ev.target.select()} onChange={ev => { if (/^\d*$/.test(ev.target.value) && Number(ev.target.value) <= 1000) updateSet(e, s, { reps: ev.target.value }); }} /><Checkbox className="set-check" checked={s.done} onCheckedChange={value => updateSet(e, s, { done: value === true })} aria-label={`${s.done ? "Uncheck" : "Complete"} ${e.name} set ${i + 1}`} /><button className="remove-set" aria-label={`Remove ${e.name} set ${i + 1}`} disabled={s.done} onClick={() => updateExercise(e.id, x => ({ ...x, sets: x.sets.filter(v => v.id !== s.id) }))}><X size={13} /></button></div>)}
                <button className="add-set" disabled={e.sets.length >= 30} onClick={() => updateExercise(e.id, x => ({ ...x, sets: [...x.sets, newSet()] }))}><Plus size={15} /> Add set</button>
              </article>; })}
              {!!draft.exercises.length && <button className="add-exercise" onClick={() => setPicker(true)}><Plus size={19} />Add exercise</button>}
              </fieldset>
              <div className="session-bottom"><span className={`save-label ${saveStatus !== "saved" ? "pending-save" : ""}`} aria-live="polite">{saveStatus === "saving" ? <LoaderCircle size={15} className="spin" /> : <CloudCheck size={15} />}{saveStatus === "saved" ? "All changes saved" : saveStatus === "saving" ? "Saving changes…" : "Changes not saved yet"}</span><button className="text-button muted" disabled={busy} onClick={() => setDeleteTarget(draft)}>Discard session</button></div>
            </> : <>
              <section className="start-panel"><div className="start-kicker"><span className="small-icon"><Dumbbell size={19} /></span> WORKOUT LOG</div><h2>{history.length ? "Ready for your next set?" : "Your first set starts here."}</h2><p>Log weight. Add reps. Tick it off.<br />Next time, your last lift is right beside you.</p><button className="primary-button start-button" onClick={() => start()}><Plus size={19} /> Start a workout <ArrowUpRight size={19} /></button><div className="start-footnote"><CloudCheck size={15} /> Your workouts save automatically.</div></section>
              <div className="section-heading"><h2>Recent workouts</h2>{!!history.length && <button className="text-button" onClick={() => setTab("history")}>View all <ChevronRight size={15} /></button>}</div>
              {history.length ? history.slice(0, 3).map(w => <div className="recent-workout" key={w.id}><button className="recent-main" onClick={() => setDetail(w)}><span className="workout-icon"><Dumbbell size={20} /></span><span><strong>{w.name}</strong><span>{date(w.startedAt)} · {completedSets(w).length} sets · {number(volume(w))} kg</span></span></button><button className="repeat-button" onClick={() => start(w)}><RotateCcw size={16} /> Repeat</button></div>) : <div className="panel history-empty"><History size={23} /><p>No workouts yet.<span>Your completed sessions will appear here.</span></p></div>}
            </>}
          </section><aside className="training-aside"><section className="summary-panel"><p className="eyebrow">{draft ? "THIS SESSION" : "LAST 7 DAYS"}</p><div className="big-stat"><strong>{draft ? currentSets : thisWeek.length}</strong><span>{draft ? `of ${plannedSets} sets complete` : "workouts completed"}</span></div><div className="summary-line"><span>{draft ? "Exercises" : "Sets logged"}</span><strong>{draft ? draft.exercises.filter(e => e.sets.some(s => s.done)).length : thisWeek.reduce((n, w) => n + completedSets(w).length, 0)}</strong></div><div className="summary-line"><span>Volume</span><strong>{number(draft ? volume(draft) : thisWeek.reduce((n, w) => n + volume(w), 0))}<small> kg</small></strong></div><p className="metric-note">Volume = weight × reps, completed sets only.</p></section><section className="aside-note"><span className="small-icon"><TrendingUp size={18} /></span><h3>A little more, over time.</h3><p>Your previous weights and reps appear as you log. Progress starts with a consistent record.</p><p className="weight-note">Use the same weight convention each time. For dumbbells, we recommend weight per dumbbell. Use 0 kg for bodyweight-only sets.</p></section></aside></div>
        </TabsContent>
        <TabsContent value="history"><div className="section-title"><div><p className="eyebrow">THE WORK YOU PUT IN</p><h2>Workout history</h2></div><span className="count-label">{history.length} sessions</span></div>{!history.length ? <div className="panel empty"><History size={34} /><h2>A clean slate.</h2><p>Finish a workout to add it to your history.</p><button className="primary-button" onClick={() => draft ? setTab("workout") : start()}>{draft ? "Resume workout" : "Start a workout"}</button></div> : <div className="history-grid">{history.map(w => <article className="history-card" key={w.id}><div className="history-card-top"><span>{date(w.startedAt)}</span><Dumbbell size={20} /></div><button className="history-title" onClick={() => setDetail(w)}>{w.name}<ChevronRight size={18} /></button><p className="history-exercises">{w.exercises.filter(e => e.sets.some(s => s.done)).map(e => e.name).join(" · ")}</p><div className="history-metrics"><span><strong>{completedSets(w).length}</strong> sets</span><span><strong>{number(volume(w))}</strong> kg volume</span></div><div className="history-actions"><button className="text-button" onClick={() => setDetail(w)}>View session</button><button className="repeat-button" onClick={() => start(w)}><RotateCcw size={15} />Repeat</button></div></article>)}</div>}</TabsContent>
        <TabsContent value="progress"><div className="section-title"><div><p className="eyebrow">BUILDING YOUR BASELINE</p><h2>Your progress</h2></div><span className="count-label">{totalSets} sets on record</span></div>{!trackedNames.length ? <div className="panel empty"><TrendingUp size={36} /><h2>Your baseline comes first.</h2><p>Complete your first workout to see your lifting history here.</p><button className="primary-button" onClick={() => draft ? setTab("workout") : start()}>{draft ? "Resume workout" : "Start a workout"}</button></div> : <div className="progress-panel"><div className="progress-heading"><div><p className="eyebrow">EXERCISE</p><Select value={selectedProgress} onValueChange={setProgressName}><SelectTrigger className="exercise-select" aria-label="Exercise progress"><SelectValue /></SelectTrigger><SelectContent>{trackedNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select></div><span className="chart-legend"><i /> Heaviest completed set</span></div><div className="progress-stats"><div><span>Best weight</span><strong>{number(Math.max(...points.map(p => p.weight)))} <small>kg</small></strong></div><div><span>Latest set at top weight</span><strong>{points.at(-1)?.weight} <small>kg ×</small> {points.at(-1)?.reps}</strong></div><div><span>Sessions logged</span><strong>{points.length}</strong></div></div><ProgressChart points={points} /><p className="metric-note">Heaviest weight per completed session. Compare reps too: a heavier set with fewer reps is not automatically an improvement.</p><div className="progress-table"><div className="progress-table-row progress-table-head"><span>SESSION</span><span>TOP SET</span><span>SETS</span></div>{[...points].reverse().map(p => <div className="progress-table-row" key={p.id}><span>{date(p.date)}</span><strong>{p.weight} kg × {p.reps}</strong><span>{p.sets}</span></div>)}</div></div>}</TabsContent>
        </>}
      </Tabs>
      <footer className="app-footer"><span>STACKD <span className="version">/ 01</span></span><span>One set at a time.</span></footer>
    </main>
    <Dialog open={picker} onOpenChange={setPicker}>
      <DialogContent ref={exerciseDialog} className="stackd-dialog">
        <DialogHeader><DialogTitle>Add an exercise</DialogTitle><DialogDescription>Tap a lift to add it, or create your own below.</DialogDescription></DialogHeader>
        <Combobox items={allNames} value={null} onValueChange={name => { if (name) addExercise(name); }}>
          <ComboboxInput placeholder="Search exercises…" aria-label="Search exercises" />
          {/* Keep the popup inside Radix's modal focus/pointer boundary. A body
              portal from a different UI library is treated as outside the dialog. */}
          <ComboboxPrimitive.Portal container={exerciseDialog}>
            <ComboboxPrimitive.Positioner sideOffset={6} align="start" className="exercise-picker-positioner">
              <ComboboxPrimitive.Popup data-slot="combobox-content" className="group/combobox-content exercise-picker-popup">
                <ComboboxEmpty>No matching exercise.</ComboboxEmpty>
                <ComboboxList>{(name: string) => <ComboboxItem className="exercise-picker-option" key={name} value={name}>{name}</ComboboxItem>}</ComboboxList>
              </ComboboxPrimitive.Popup>
            </ComboboxPrimitive.Positioner>
          </ComboboxPrimitive.Portal>
        </Combobox>
        <div className="custom-exercise"><label htmlFor="custom-exercise">Or create a custom exercise</label><div><input id="custom-exercise" placeholder="e.g. Incline curl (cable)" value={customName} maxLength={80} onChange={e => setCustomName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addExercise(customName); }} /><button className="secondary-button" disabled={!customName.trim()} onClick={() => addExercise(customName)}>Add</button></div></div>
      </DialogContent>
    </Dialog>
    <Dialog open={finishOpen} onOpenChange={v => { if (!busy) setFinishOpen(v); }}><DialogContent className="stackd-dialog"><DialogHeader><DialogTitle>Finish this workout?</DialogTitle><DialogDescription>{currentSets} completed sets · {draft ? number(volume(draft)) : 0} kg volume. Only checked sets count towards your progress.</DialogDescription></DialogHeader>{plannedSets > currentSets && <p className="muted">{plannedSets - currentSets} unchecked sets will not count as completed.</p>}<button className="primary-button" disabled={busy} onClick={() => void finish()}>{busy ? "Saving workout…" : "Finish & save"}<Check size={18} /></button></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={v => { if (!v) setDetail(null); }}><DialogContent className="stackd-dialog detail-dialog"><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>{detail && date(detail.startedAt)} · {detail && completedSets(detail).length} sets · {detail && number(volume(detail))} kg volume</DialogDescription></DialogHeader><div className="detail-list">{detail?.exercises.filter(e => e.sets.some(s => s.done)).map(e => <div key={e.id}><h3>{e.name}</h3>{e.sets.filter(s => s.done).map((s, i) => <p key={s.id}><span>Set {i + 1}</span><strong>{s.weight} kg × {s.reps}</strong><Check size={15} /></p>)}</div>)}</div><button className="primary-button" onClick={() => detail && start(detail)}><RotateCcw size={17} /> Repeat workout</button><button className="text-button danger" onClick={() => { setDeleteTarget(detail); setDetail(null); }}><Trash2 size={15} />Delete workout</button></DialogContent></Dialog>
    <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v && !busy) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this workout?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{deleteTarget?.name}” and its sets from your log and progress. Export your log first if you want a copy.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep workout</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={e => { e.preventDefault(); void removeWorkout(); }}>{busy ? "Deleting…" : "Delete workout"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function ProgressChart({ points }: { points: ReturnType<typeof progressPoints> }) {
  const shown = points.slice(-20), max = Math.max(1, ...shown.map(p => p.weight)) * 1.15;
  const coords = shown.map((p, i) => ({ x: shown.length === 1 ? 330 : 50 + i / (shown.length - 1) * 560, y: 185 - p.weight / max * 145, ...p }));
  return <div className="chart"><svg viewBox="0 0 650 230" role="img" aria-label={`Heaviest completed weight per session for the latest ${shown.length} sessions. Exact values are listed below.`}>{[0, .5, 1].map(v => <g key={v}><line x1="50" x2="610" y1={185 - v * 145} y2={185 - v * 145} stroke="#292d2c" strokeDasharray="4 5" /><text x="40" y={190 - v * 145} textAnchor="end" fill="#969e9a" fontSize="12">{Math.round(v * max)}</text></g>)}{coords.length > 1 && <polyline points={coords.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#c7f11f" strokeWidth="3" strokeLinejoin="round" />}{coords.map(p => <circle key={p.id} cx={p.x} cy={p.y} r="5" fill="#c7f11f"><title>{date(p.date)}: {p.weight} kg × {p.reps}</title></circle>)}<text x="50" y="216" fill="#969e9a" fontSize="12">{shown[0] && date(shown[0].date)}</text>{shown.length > 1 && <text x="610" y="216" textAnchor="end" fill="#969e9a" fontSize="12">{date(shown.at(-1)!.date)}</text>}</svg>{points.length === 1 && <p className="chart-caption">Baseline recorded. Your next session adds the next point.</p>}</div>;
}
