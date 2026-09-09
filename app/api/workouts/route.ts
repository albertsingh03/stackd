import { database } from "@/db/raw";
import { workoutSchema } from "@/lib/workouts";
// SINGLE-OWNER MVP behind Sites' private access gate. Never make this deployment
// public/shared without app authentication and per-user checks on every query.
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const sameOrigin = (r: Request) => !!r.headers.get("origin") && r.headers.get("origin") === new URL(r.url).origin;
type Row = { id: string; name: string; started_at: string; completed_at: string | null; revision: number; exercises: string };
const decode = (r: Row) => ({ id: r.id, name: r.name, startedAt: r.started_at, completedAt: r.completed_at, revision: r.revision, exercises: JSON.parse(r.exercises) });
export async function GET(request: Request) {
  try {
    const cursor = new URL(request.url).searchParams.get("cursor") || "";
    const result = await database().prepare("SELECT id, name, started_at, completed_at, revision, exercises FROM workouts WHERE id > ? ORDER BY id LIMIT 101").bind(cursor).all<Row>();
    const rows = result.results.slice(0, 100);
    return json({ workouts: rows.map(decode), nextCursor: result.results.length > 100 ? rows[rows.length - 1].id : null });
  } catch (error) {
    console.error("workout read failed", error);
    return json({ error: "Your workouts could not be loaded. Please try again." }, 503);
  }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin was not accepted." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 100_000) return json({ error: "This workout is too large to save." }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid workout data." }, 400); }
    const parsed = workoutSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Check your workout: use valid weights, reps, and exercise names." }, 400);
    const w = parsed.data, exercises = JSON.stringify(w.exercises), db = database();
    const existing = await db.prepare("SELECT id, name, started_at, completed_at, revision, exercises FROM workouts WHERE id = ?").bind(w.id).first<Row>();
    // A lost response can be retried without duplicating a set or incrementing twice.
    if (existing && existing.revision === w.revision + 1 && existing.name === w.name && existing.started_at === w.startedAt && existing.completed_at === w.completedAt && existing.exercises === exercises) return json({ workout: decode(existing) });
    if ((!existing && w.revision !== 0) || (existing && (existing.revision !== w.revision || existing.started_at !== w.startedAt))) return json({ error: "This workout changed in another tab or device. Your local edits are kept. Export them before reloading." }, 409);
    let saved: Row | null;
    if (!existing) {
      saved = await db.prepare("INSERT INTO workouts (id, name, started_at, completed_at, active_slot, revision, exercises) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING *").bind(w.id, w.name, w.startedAt, w.completedAt, w.completedAt ? null : 1, exercises).first<Row>();
    } else {
      saved = await db.prepare("UPDATE workouts SET name = ?, completed_at = ?, active_slot = ?, revision = revision + 1, exercises = ? WHERE id = ? AND revision = ? RETURNING *").bind(w.name, w.completedAt, w.completedAt ? null : 1, exercises, w.id, w.revision).first<Row>();
    }
    if (!saved) return json({ error: "This workout changed elsewhere. Export your local edits before reloading." }, 409);
    return json({ workout: decode(saved) });
  } catch (error) {
    console.error("workout save failed", error);
    if (String(error).includes("UNIQUE constraint")) return json({ error: "Another workout is already open. Export your local draft, then reload to resume it." }, 409);
    return json({ error: "Not saved yet. Your edits are kept here. Check your connection and retry." }, 503);
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Request origin was not accepted." }, 403);
  const url = new URL(request.url), id = url.searchParams.get("id"), revision = Number(url.searchParams.get("revision"));
  if (!id || !Number.isInteger(revision) || revision < 1) return json({ error: "Invalid workout." }, 400);
  try {
    const result = await database().prepare("DELETE FROM workouts WHERE id = ? AND revision = ? RETURNING id").bind(id, revision).first();
    if (!result) return json({ error: "This workout changed elsewhere. Reload before deleting it." }, 409);
    return json({ deleted: true });
  } catch (error) {
    console.error("workout delete failed", error);
    return json({ error: "Workout could not be deleted. Please retry." }, 503);
  }
}
