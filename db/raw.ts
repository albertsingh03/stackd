import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB) throw new Error("Workout database is not configured");
  return env.DB;
}
