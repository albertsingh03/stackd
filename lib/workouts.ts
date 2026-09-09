import { z } from "zod";
export const setSchema = z.object({
  id: z.string().uuid(),
  weight: z.string().max(10).refine(v => v === "" || (/^\d*(\.\d*)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 2000)),
  reps: z.string().max(4).refine(v => v === "" || (/^\d+$/.test(v) && Number(v) <= 1000)),
  done: z.boolean(),
}).refine(s => !s.done || (s.weight.trim() !== "" && Number.isFinite(Number(s.weight)) && s.reps !== "" && Number(s.reps) > 0), { message: "Completed sets need a weight and at least one rep." });
export const workoutSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(80),
  startedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
  revision: z.number().int().nonnegative(),
  exercises: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), sets: z.array(setSchema).max(30) })).max(30),
}).refine(w => !w.completedAt || (w.completedAt >= w.startedAt && w.exercises.some(e => e.sets.some(s => s.done))), { message: "Finish at least one set before completing your workout." });
export type Workout = z.infer<typeof workoutSchema>;
export type Exercise = Workout["exercises"][number];
export type LiftSet = Exercise["sets"][number];
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
