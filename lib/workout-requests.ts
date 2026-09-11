import { workoutSchema, type Workout } from "./workouts.ts";

import { z } from "zod";

export const MAX_SAVE_BATCH = 8;
const pageSchema = z.object({ workouts: workoutSchema.array(), nextCursor: z.string().nullable() });
export async function loadWorkoutPages(fetcher: typeof fetch = fetch): Promise<Workout[]> {
  const all: Workout[] = [];
  const cursors = new Set<string>();
  let cursor = "";
  for (let page = 0; page < 200; page++) {
    if (cursors.has(cursor)) throw new Error("Loading stopped because the server repeated a page. Please retry.");
    cursors.add(cursor);
    const response = await fetcher(`/api/workouts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error("Could not load workouts. Please retry.");
    const parsed = pageSchema.safeParse(result);
    if (!parsed.success) throw new Error("The server returned an unreadable workout log. Your saved data has not been changed.");
    all.push(...parsed.data.workouts);
    if (!parsed.data.nextCursor) return all;
    cursor = parsed.data.nextCursor;
  }
  throw new Error("Loading stopped after too many pages. Export or contact support before continuing.");
}
