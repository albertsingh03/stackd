import { database } from "@/db/raw";
import { exerciseNames } from "@/lib/workouts";
import { exerciseKey, exerciseMatches, type CatalogExercise } from "@/lib/exercise-catalog";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
// Owner-private MVP. Initialization is explicit POST, separate from schema migrations.
async function readCatalog() {
  const rows = await database().prepare("SELECT id, name, normalized_key FROM exercise_catalog ORDER BY name LIMIT 2001").all<CatalogExercise>();
  if (rows.results.length > 2000) throw new Error("Catalog capacity exceeded");
  return rows.results;
}
export async function GET() {
  try { return json({ exercises: await readCatalog() }); }
  catch { return json({ error: "Exercise database unavailable. Please retry." }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Request origin was not accepted." }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: "Request too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request." }, 400); }
    if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);
    let catalog = await readCatalog();
    if (body.action === "initialize") {
      if (!catalog.length) {
        const legacy = await database().prepare("SELECT DISTINCT json_extract(j.value, '$.name') AS name FROM workouts, json_each(workouts.exercises) AS j LIMIT 2001").all<{ name: string }>();
        if (legacy.results.length > 1900) return json({ error: "Exercise database needs an import review." }, 409);
        const names = [...exerciseNames, ...legacy.results.map(r => r.name)].filter(n => typeof n === "string" && n.trim() && n.length <= 80);
        // One atomic batch: a failed initialization leaves no half-imported catalog.
        await database().batch(names.map(name => database().prepare("INSERT INTO exercise_catalog (id, name, normalized_key) VALUES (?, ?, ?) ON CONFLICT(normalized_key) DO NOTHING").bind(crypto.randomUUID(), name.trim(), exerciseKey(name))));
        catalog = await readCatalog();
      }
      return json({ exercises: catalog });
    }
    if (!catalog.length) return json({ error: "Load the exercise database before creating an exercise." }, 409);
    if (typeof body.name !== "string" || body.name.trim().length < 3 || body.name.trim().length > 80 || !exerciseKey(body.name)) return json({ error: "Use an exercise name between 3 and 80 characters." }, 400);
    const name = body.name.trim().replace(/\s+/g, " "), key = exerciseKey(name);
    const matches = exerciseMatches(name, catalog);
    const exact = matches.find(m => m.exact);
    if (exact) return json({ exercise: exact.exercise, reused: true });
    const similar = matches.filter(m => m.similar).map(m => m.exercise);
    if (similar.length && body.confirmDifferent !== true) return json({ error: "Similar exercises already exist. Review these before creating a different exercise.", suggestions: similar }, 409);
    if (catalog.length >= 2000) return json({ error: "Exercise database is full. Please review existing exercises." }, 409);
    const inserted = await database().prepare("INSERT INTO exercise_catalog (id, name, normalized_key) VALUES (?, ?, ?) ON CONFLICT(normalized_key) DO NOTHING RETURNING id, name, normalized_key").bind(crypto.randomUUID(), name, key).first<CatalogExercise>();
    // A racing exact creation reuses the unique canonical row.
    const exercise = inserted ?? await database().prepare("SELECT id, name, normalized_key FROM exercise_catalog WHERE normalized_key = ?").bind(key).first<CatalogExercise>();
    return json({ exercise, reused: !inserted });
  } catch { return json({ error: "Exercise could not be saved. Your search is kept; please retry." }, 503); }
}
