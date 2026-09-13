import { z } from "zod";
export const setSchema = z.object({
  id: z.string().uuid(),
  weight: z.string().max(10).refine(v => v === "" || (/^\d*(\.\d*)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 2000)),
  reps: z.string().max(4).refine(v => v === "" || (/^\d+$/.test(v) && Number(v) <= 1000)),
  done: z.boolean(),
}).refine(s => !s.done || (s.weight.trim() !== "" && Number.isFinite(Number(s.weight)) && s.reps !== "" && Number(s.reps) > 0), { message: "Completed sets need a weight and at least one rep." });
export const timerSchema = z.object({
  elapsedMs: z.number().finite().nonnegative().nullable(),
  runningSince: z.string().datetime().nullable(),
  lastActivityAt: z.string().datetime().nullable(),
}).refine(t => !t.runningSince || (!!t.lastActivityAt && t.lastActivityAt >= t.runningSince), { message: "Invalid session timer." });
export const workoutSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(80),
  startedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
  revision: z.number().int().nonnegative(),
  timer: timerSchema.optional(),
  exercises: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), sets: z.array(setSchema).max(30) })).max(30),
}).refine(w => !w.completedAt || (w.completedAt >= w.startedAt && w.exercises.some(e => e.sets.some(s => s.done))), { message: "Finish at least one set before completing your workout." });
export type Workout = z.infer<typeof workoutSchema>;
export type Exercise = Workout["exercises"][number];
export type LiftSet = Exercise["sets"][number];
export const newWorkoutSet = (from?: LiftSet): LiftSet => ({ id: crypto.randomUUID(), weight: from?.weight ?? "", reps: from?.reps ?? "", done: false });
export const exerciseNames = ["Bench press (barbell)", "Incline bench press (dumbbell)", "Chest press (machine)", "Cable fly", "Push-up", "Lat pulldown", "Seated cable row", "Bent-over row (barbell)", "One-arm row (dumbbell)", "Pull-up", "Shoulder press (dumbbell)", "Shoulder press (machine)", "Lateral raise (dumbbell)", "Lateral raise (cable)", "Reverse fly", "Face pull", "Biceps curl (dumbbell)", "Incline curl (dumbbell)", "Hammer curl", "Preacher curl", "Triceps pushdown", "Overhead triceps extension", "Squat (barbell)", "Leg press", "Romanian deadlift", "Deadlift (barbell)", "Leg extension", "Seated leg curl", "Lying leg curl", "Bulgarian split squat", "Hip thrust", "Standing calf raise", "Seated calf raise", "Cable crunch"];
export const completedSets = (w: Workout) => w.exercises.flatMap(e => e.sets.filter(s => s.done));
export const volume = (w: Workout) => completedSets(w).reduce((n, s) => n + Number(s.weight) * Number(s.reps), 0);
export function previousExercise(history: Workout[], name: string): Exercise | undefined {
  return history.filter(w => !!w.completedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).flatMap(w => w.exercises).find(e => e.name.toLowerCase() === name.toLowerCase() && e.sets.some(s => s.done));
}
export function progressPoints(history: Workout[], name: string) {
  return history.filter(w => !!w.completedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).flatMap(w => {
    const sets = w.exercises.filter(e => e.name === name).flatMap(e => e.sets.filter(s => s.done));
    if (!sets.length) return [];
    const best = [...sets].sort((a, b) => Number(b.weight) - Number(a.weight) || Number(b.reps) - Number(a.reps))[0];
    return [{ id: w.id, date: w.startedAt, weight: Number(best.weight), reps: Number(best.reps), sets: sets.length }];
  });
}

// No background writes are needed: derive expiry from persisted user activity.
export const SESSION_IDLE_MS = 90 * 60_000;
export const SESSION_REVIEW_MS = 6 * 60 * 60_000;
export function sessionClock(w: Workout, now: number) {
  const start = Date.parse(w.startedAt);
  const legacyStale = !w.timer && !w.completedAt && now - start >= SESSION_REVIEW_MS;
  const timer = w.timer ?? { elapsedMs: legacyStale ? null : 0, runningSince: w.startedAt, lastActivityAt: w.startedAt };
  const since = timer.runningSince ? Date.parse(timer.runningSince) : null;
  const last = timer.lastActivityAt ? Date.parse(timer.lastActivityAt) : since;
  const needsReview = !w.completedAt && (legacyStale || (since === null && now - start >= SESSION_IDLE_MS) || (since !== null && last !== null &&
    (now - last >= SESSION_IDLE_MS || now - since >= SESSION_REVIEW_MS)));
  // Legacy records have no activity timestamp. Do not invent their duration.
  const unknown = legacyStale || (!w.timer && needsReview);
  const end = w.completedAt ? Date.parse(w.completedAt) : needsReview ? (last ?? start) : now;
  const elapsedMs = unknown || timer.elapsedMs === null ? null : timer.elapsedMs + (since === null ? 0 : Math.max(0, end - since));
  return { elapsedMs, needsReview, running: !w.completedAt && !needsReview && since !== null };
}
export function resumeSession(w: Workout, now: number): Workout {
  const elapsedMs = sessionClock(w, now).elapsedMs;
  const stamp = new Date(now).toISOString();
  return { ...w, timer: { elapsedMs, runningSince: stamp, lastActivityAt: stamp } };
}
export function stopSessionTimer(w: Workout, now: number): Workout {
  return { ...w, timer: { elapsedMs: sessionClock(w, now).elapsedMs, runningSince: null, lastActivityAt: w.timer?.lastActivityAt ?? null } };
}

export const workoutPayload = (w: Workout): Workout => ({ ...w, name: w.name.trim() || "Workout", exercises: w.exercises.map(e => ({ ...e, name: e.name.trim(), sets: e.sets.map(s => ({ ...s, weight: s.weight === "." ? "" : s.weight })) })) });
// Schema parsing makes property order canonical, including optional timer metadata.
export const sameWorkoutPayload = (a: Workout, b: Workout) => JSON.stringify(workoutSchema.parse({ ...workoutPayload(a), revision: 0 })) === JSON.stringify(workoutSchema.parse({ ...workoutPayload(b), revision: 0 }));
