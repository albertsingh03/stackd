import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkoutPages } from "../lib/workout-requests.ts";

test("a repeated cursor stops loading instead of requesting forever", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({ workouts: [], nextCursor: "same" }); }) as typeof fetch;
  await assert.rejects(loadWorkoutPages(fetcher), /repeated a page/);
  assert.equal(calls, 2);
});
test("even unique cursors cannot cause unlimited page requests", async () => {
  let calls = 0;
  const fetcher = (async () => Response.json({ workouts: [], nextCursor: String(++calls) })) as typeof fetch;
  await assert.rejects(loadWorkoutPages(fetcher), /too many pages/);
  assert.equal(calls, 200);
});
test("a failed load is not retried automatically", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({}, { status: 503 }); }) as typeof fetch;
  await assert.rejects(loadWorkoutPages(fetcher), /Please retry/);
  assert.equal(calls, 1);
});
test("normal pagination terminates and malformed responses fail safely", async () => {
  const seen: string[] = [];
  const fetcher = (async (url, options) => {
    seen.push(String(url)); assert.ok(options?.signal);
    return Response.json({ workouts: [], nextCursor: seen.length === 1 ? "next" : null });
  }) as typeof fetch;
  assert.deepEqual(await loadWorkoutPages(fetcher), []);
  assert.deepEqual(seen, ["/api/workouts", "/api/workouts?cursor=next"]);
  await assert.rejects(loadWorkoutPages((async () => Response.json({ workouts: "bad", nextCursor: null })) as typeof fetch), /unreadable/);
});
