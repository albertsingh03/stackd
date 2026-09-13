import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { completedSets, volume, previousExercise, progressPoints, workoutSchema, sessionClock, resumeSession, stopSessionTimer, SESSION_IDLE_MS, SESSION_REVIEW_MS, sameWorkoutPayload, type Workout } from "../lib/workouts.ts";
const set = (weight="50", reps="10", done=true) => ({ id:randomUUID(), weight, reps, done });
const workout = (changes: Partial<Workout> = {}): Workout => ({ id:randomUUID(), name:"Push", startedAt:"2026-09-01T10:00:00.000Z", completedAt:"2026-09-01T11:00:00.000Z", revision:1, exercises:[{id:randomUUID(),name:"Bench press (barbell)",sets:[set(),set("60","5",false)]}], ...changes });
test("only completed sets contribute volume", () => { const w=workout(); assert.equal(volume(w),500); assert.equal(completedSets(w).length,1); });
test("bodyweight zero is valid; blank completed weight is not", () => { const w=workout(); w.exercises[0].sets=[set("0","12")]; assert.equal(workoutSchema.safeParse(w).success,true); w.exercises[0].sets=[set("","12")]; assert.equal(workoutSchema.safeParse(w).success,false); });
test("reject negative weights, fractional reps, and zero completed reps", () => { for(const [weight,reps] of [["-5","10"],["50","2.5"],["50","0"],["Infinity","10"],["50","1001"]]) { const w=workout(); w.exercises[0].sets=[set(weight,reps)]; assert.equal(workoutSchema.safeParse(w).success,false); } });
test("unfinished blank sets are valid; empty finished workouts are not", () => { const w=workout({completedAt:null}); w.exercises[0].sets=[set("","",false)]; assert.equal(workoutSchema.safeParse(w).success,true); w.completedAt="2026-09-01T11:00:00.000Z"; assert.equal(workoutSchema.safeParse(w).success,false); });
test("previous exercise ignores unfinished sessions", () => { const done=workout(), active=workout({startedAt:"2026-09-02T10:00:00.000Z",completedAt:null}); active.exercises[0].sets=[set("90","10")]; assert.equal(previousExercise([active,done],"Bench press (barbell)")?.sets[0].weight,"50"); });
test("progress retains top-weight reps and chronological order", () => { const a=workout(), b=workout({startedAt:"2026-09-03T10:00:00.000Z",completedAt:"2026-09-03T11:00:00.000Z"}), active=workout({completedAt:null}); b.exercises[0].sets=[set("55","7"),set("55","9"),set("100","2",false)]; const points=progressPoints([b,active,a],"Bench press (barbell)"); assert.equal(points.length,2); assert.equal(points[0].weight,50); assert.equal(points[1].weight,55); assert.equal(points[1].reps,9); assert.equal(points[1].sets,2); });
test("repeat rows start blank and do not count", () => { const w=workout({completedAt:null}); w.exercises=w.exercises.map(e=>({...e,sets:e.sets.filter(s=>s.done).map(s=>({...s,id:randomUUID(),weight:"",reps:"",done:false}))})); assert.equal(volume(w),0); assert.equal(completedSets(w).length,0); });

const startTime = Date.parse("2026-09-01T10:00:00.000Z");
const stamp = (offset: number) => new Date(startTime + offset).toISOString();
test("an empty session does not run a timer and asks for review when abandoned", () => {
  const w = workout({ completedAt: null, exercises: [], timer: { elapsedMs: 0, runningSince: null, lastActivityAt: null } });
  assert.equal(sessionClock(w, startTime + 60_000).running, false);
  assert.equal(sessionClock(w, startTime + 3 * 86400000).elapsedMs, 0);
  assert.equal(sessionClock(w, startTime + SESSION_IDLE_MS).needsReview, true);
});
test("idle timeout freezes at last activity, including after reload", () => {
  const w = workout({ completedAt: null, timer: { elapsedMs: 0, runningSince: stamp(0), lastActivityAt: stamp(20 * 60_000) } });
  assert.equal(sessionClock(w, startTime + 30 * 60_000).elapsedMs, 30 * 60_000);
  const restored = workoutSchema.parse(JSON.parse(JSON.stringify(w)));
  const clock = sessionClock(restored, startTime + 20 * 60_000 + SESSION_IDLE_MS);
  assert.equal(clock.needsReview, true); assert.equal(clock.running, false); assert.equal(clock.elapsedMs, 20 * 60_000);
});
test("resume excludes idle time and finish stops the clock permanently", () => {
  const w = workout({ completedAt: null, timer: { elapsedMs: 0, runningSince: stamp(0), lastActivityAt: stamp(20 * 60_000) } });
  const resumed = resumeSession(w, startTime + 86400000);
  assert.equal(sessionClock(resumed, startTime + 86400000 + 5 * 60_000).elapsedMs, 25 * 60_000);
  const stopped = { ...stopSessionTimer(resumed, startTime + 86400000 + 5 * 60_000), completedAt: stamp(86400000 + 5 * 60_000) };
  assert.equal(sessionClock(stopped, startTime + 8 * 86400000).elapsedMs, 25 * 60_000);
  assert.equal(sessionClock(stopped, startTime + 8 * 86400000).needsReview, false);
  assert.equal(workoutSchema.safeParse(stopped).success, true);
});
test("legacy two-day session retains sets without inventing elapsed time", () => {
  const w = workout({ completedAt: null });
  const clock = sessionClock(w, startTime + 2 * 86400000);
  assert.equal(clock.needsReview, true); assert.equal(clock.elapsedMs, null);
  const resumed = resumeSession(w, startTime + 2 * 86400000);
  assert.deepEqual(resumed.exercises, w.exercises);
  assert.equal(sessionClock(resumed, startTime + 2 * 86400000).needsReview, false);
  assert.equal(sessionClock(resumed, startTime + 2 * 86400000).elapsedMs, null);
});
test("a continuously active session still has a six-hour review limit", () => {
  const w = workout({ completedAt: null, timer: { elapsedMs: 0, runningSince: stamp(0), lastActivityAt: stamp(SESSION_REVIEW_MS - 60_000) } });
  assert.equal(sessionClock(w, startTime + SESSION_REVIEW_MS).needsReview, true);
});

test("server normalization and reordered timer keys do not keep the save queue alive", () => {
  const w = resumeSession(workout({ completedAt: null, name: " Push " }), startTime);
  w.exercises[0].name = " Bench press (barbell) ";
  const server = workoutSchema.parse({ ...w, revision: w.revision + 1 });
  assert.equal(sameWorkoutPayload(w, server), true);
  const edited = { ...server, timer: { ...server.timer!, lastActivityAt: stamp(60_000) } };
  assert.equal(sameWorkoutPayload(edited, server), false);
});
