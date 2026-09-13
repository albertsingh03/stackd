import test from "node:test";
import assert from "node:assert/strict";
import { newWorkoutSet } from "../lib/workouts.ts";

test("new additional sets start blank and unchecked, with unique identities", () => {
  const previous = { ...newWorkoutSet(), weight: "10", reps: "5", done: true };
  const sets = [previous, newWorkoutSet()];
  assert.equal(sets[1].weight, "");
  assert.equal(sets[1].reps, "");
  assert.equal(sets[1].done, false);
  assert.notEqual(sets[0].id, sets[1].id);
  assert.equal(sets[0].weight, "10");
});

test("intentional repeat-workout prefills remain unchecked", () => {
  const previous = { ...newWorkoutSet(), weight: "50", reps: "8", done: true };
  const repeated = newWorkoutSet(previous);
  assert.equal(repeated.weight, "50");
  assert.equal(repeated.reps, "8");
  assert.equal(repeated.done, false);
  assert.notEqual(repeated.id, previous.id);
});
