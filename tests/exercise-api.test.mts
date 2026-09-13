import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { exerciseNames } from "../lib/workouts.ts";
import { exerciseKey, exerciseMatches } from "../lib/exercise-catalog.ts";

test("catalog API imports legacy names, reuses duplicates, reviews fuzzy names and persists new exercises", async () => {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(`drizzle/${file}`, "utf8"));
  sql.prepare("INSERT INTO workouts(id,name,started_at,revision,exercises) VALUES(?,?,?,?,?)").run("legacy", "Workout", "2026-09-13", 1, JSON.stringify([{ name: "Shoulder press (barbell)", sets: [] }]));
  const db = {
    prepare(query: string) {
      let bindings: (string | number | null)[] = [];
      const stmt = {
        bind(...values: (string | number | null)[]) { bindings = values; return stmt; },
        async first() { return sql.prepare(query).get(...bindings) ?? null; },
        async all() { return { results: sql.prepare(query).all(...bindings) }; },
        run() { return sql.prepare(query).run(...bindings); },
      }; return stmt;
    },
    async batch(statements: { run: () => unknown }[]) {
      sql.exec("BEGIN");
      try { const results = statements.map(s => s.run()); sql.exec("COMMIT"); return results; }
      catch (e) { sql.exec("ROLLBACK"); throw e; }
    },
  };
  const source = readFileSync("app/api/exercises/route.ts", "utf8").replace(/^import .*;\n/gm, "").replace(/export async function/g, "async function");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const api = new Function("database", "exerciseNames", "exerciseKey", "exerciseMatches", `${js}; return { GET, POST };`)(() => db, exerciseNames, exerciseKey, exerciseMatches);
  const post = (body: unknown, origin = "https://stackd.test") => api.POST(new Request("https://stackd.test/api/exercises", { method: "POST", headers: { origin }, body: JSON.stringify(body) })) as Promise<Response>;
  assert.equal((await post({ action: "initialize" })).status, 200);
  let data = await (await api.GET()).json();
  assert.ok(data.exercises.some((e: { name: string }) => e.name === "Shoulder press (barbell)"));
  const count = data.exercises.length;
  await post({ action: "initialize" });
  assert.equal((await (await api.GET()).json()).exercises.length, count);
  const reused = await (await post({ name: "barbell BENT OVER row" })).json() as { reused: boolean; exercise: { name: string } };
  assert.equal(reused.reused, true);
  assert.equal(reused.exercise.name, "Bent-over row (barbell)");
  const fuzzy = await post({ name: "Bent ovr row barbell" });
  assert.equal(fuzzy.status, 409);
  assert.ok(((await fuzzy.json()) as { suggestions: unknown[] }).suggestions.length);
  const created = await (await post({ name: "Zercher squat (barbell)" })).json() as { reused: boolean; exercise: { id: string } };
  assert.equal(created.reused, false);
  const retry = await (await post({ name: "Zercher squat (barbell)" })).json() as { exercise: { id: string } };
  assert.equal(retry.exercise.id, created.exercise.id);
  assert.equal((await post({ name: "new lift" }, "https://other.test")).status, 403);
  assert.equal((await post({ name: "!!" })).status, 400);
  sql.prepare("DELETE FROM workouts").run();
  data = await (await api.GET()).json();
  assert.ok(data.exercises.some((e: { name: string }) => e.name === "Shoulder press (barbell)"));
  sql.close();
});
