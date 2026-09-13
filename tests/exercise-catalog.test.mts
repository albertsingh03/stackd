import test from "node:test";
import assert from "node:assert/strict";
import { exerciseKey, exerciseMatches } from "../lib/exercise-catalog.ts";
const names = ["Bent-over row (barbell)", "Shoulder press (dumbbell)", "Shoulder press (machine)", "Bench press (barbell)"];
const catalog = names.map((name, i) => ({ id: String(i), name, normalized_key: exerciseKey(name) }));
test("case, spacing, punctuation, token order and common aliases reuse one key", () => {
  assert.equal(exerciseKey("BARBELL bent over row"), exerciseKey(names[0]));
  assert.equal(exerciseKey("shoulder press DB"), exerciseKey(names[1]));
  assert.equal(exerciseKey("Pull ups"), exerciseKey("pull-up"));
});
test("typos suggest the existing master without silently merging", () => {
  const matches = exerciseMatches("Bent ovr row barbell", catalog);
  assert.equal(matches[0].exercise.name, names[0]);
  assert.equal(matches[0].similar, true);
  assert.equal(matches[0].exact, false);
});
test("equipment and movement variants stay distinct", () => {
  assert.notEqual(exerciseKey(names[1]), exerciseKey(names[2]));
  assert.notEqual(exerciseKey("Incline bench press barbell"), exerciseKey(names[3]));
  assert.equal(exerciseMatches("Zercher squat", catalog).length, 0);
  assert.equal(exerciseMatches("shoulder press", catalog).length, 2);
  assert.equal(exerciseMatches("barbell bench press", catalog)[0].exact, true);
});
