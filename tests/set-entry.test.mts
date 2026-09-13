import test from "node:test";
import assert from "node:assert/strict";
import { newWorkoutSet, isLoggedSet, completedSets, logEnteredSets, workoutSchema } from "../lib/workouts.ts";

test("new additional sets start blank and unchecked, with unique identities", () => {
  const previous = { ...newWorkoutSet(), weight: "10", reps: "5", done: true };
  const sets = [previous, newWorkoutSet()];
  assert.equal(sets[1].weight, "");
  assert.equal(sets[1].reps, "");
  assert.equal(sets[1].done, false);
  assert.notEqual(sets[0].id, sets[1].id);
  assert.equal(sets[0].weight, "10");
});

test("repeated sets start blank too", () => {
  const repeated = newWorkoutSet();
  assert.equal(repeated.weight, "");
  assert.equal(repeated.reps, "");
  assert.equal(repeated.done, false);
});

test("only valid manually entered weights and reps count", () => {
  for (const [weight, reps, expected] of [["", "8", false], ["5", "", false], [".", "8", false], ["0", "8", true], [".5", "8", true], ["5", "0", false], ["2001", "8", false], ["5", "1001", false], ["5", "1.5", false], ["10", "7", true]] as const) {
    assert.equal(isLoggedSet({ ...newWorkoutSet(), weight, reps }), expected, `${weight} x ${reps}`);
  }
});
test("active valid entries count without ticks; finishing logs them without changing old history", () => {
  const w = { id: crypto.randomUUID(), name: "Workout", startedAt: "2026-09-13T00:00:00Z", completedAt: null, revision: 0, exercises: [{ id: crypto.randomUUID(), name: "Squat", sets: [{ ...newWorkoutSet(), weight: "10", reps: "5" }, newWorkoutSet()] }] };
  assert.equal(completedSets(w).length, 1);
  const finished = { ...logEnteredSets(w), completedAt: "2026-09-13T01:00:00Z" };
  assert.equal(workoutSchema.safeParse(finished).success, true);
  assert.equal(completedSets(finished).length, 1);
  assert.equal(completedSets({ ...w, completedAt: finished.completedAt }).length, 0);
  const cleared = { ...w, exercises: [{ ...w.exercises[0], sets: [{ ...w.exercises[0].sets[0], reps: "" }] }] };
  assert.equal(completedSets(cleared).length, 0);
});
