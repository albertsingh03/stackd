// Normalize spelling conventions without merging different equipment or movements.
export function exerciseKey(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bdb\b/g, "dumbbell").replace(/\bbb\b/g, "barbell")
    .replace(/\bdumbbells\b/g, "dumbbell").replace(/\bbarbells\b/g, "barbell")
    .replace(/\bbicep\b/g, "biceps").replace(/\btricep\b/g, "triceps")
    .replace(/pull[\s-]*ups?\b/g, "pullup").replace(/push[\s-]*ups?\b/g, "pushup")
    .replace(/pull[\s-]*downs?\b/g, "pulldown").replace(/bent[\s-]*over\b/g, "bentover")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).sort().join(" ");
}
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
export type CatalogExercise = { id: string; name: string; normalized_key: string };
export function exerciseMatches(query: string, catalog: CatalogExercise[]) {
  const key = exerciseKey(query);
  if (!key) return catalog.map(exercise => ({ exercise, score: 0, exact: false, similar: false }));
  return catalog.map(exercise => {
    const other = exercise.normalized_key, exact = key === other;
    const similarity = 1 - distance(key, other) / Math.max(key.length, other.length);
    const tokens = key.split(" "), contains = tokens.every(t => other.includes(t));
    const similar = exact || similarity >= .76;
    return { exercise, exact, similar, score: exact ? 2 : contains ? 1.1 : similarity };
  }).filter(m => m.similar || m.score >= 1.1).sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
}
