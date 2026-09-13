# Stackd

A focused, mobile-first workout log: enter weight and reps to log a set automatically, and see what you lifted last time.

## Why this exists

Recording a workout should not interrupt it. Stackd starts with the smallest useful training loop: log a set, save the session, and make the next session easier to compare. Nutrition, health integrations, and AI remain separate future phases.

The first version simplifies an existing Figma/Android concept into three views: **Workout**, **History**, and **Progress**. It preserves the reference's dark surfaces, lime accent, and Set / Previous / KG / Reps layout. This web implementation is original; the supplied APK, Figma document, embedded credentials, and personal data are not included in source control.

## Working features

- Start a workout or repeat a completed session.
- Search a durable exercise master database, review fuzzy suggestions, and create a distinct exercise in the same picker.
- Valid kg and reps automatically log a set; empty/partial rows do not count. Entries remain editable; removing entered data requires confirmation.
- Additional sets start with blank kg/reps; tapping a search result adds the exercise directly. Exercise search uses an inline command list inside the dialog, without a nested popup or portal. Opening the picker leaves the keyboard closed until search is tapped.
- Show previous weights/reps as reference only. Every new/repeated row starts blank.
- Autosave to a server-backed database; resume an unfinished session.
- Start timing on the first set entry; review sessions after 90 minutes without logging or six hours of continuous timing.
- Review history and per-exercise heaviest-set trends with exact rep counts.
- Export the log as JSON, including pending edits, and confirm before deleting sessions.
- Validate writes and reject stale revisions; replay an unacknowledged request before sending newer edits.

## Current boundaries

This is a **private, single-owner MVP**, not a public multi-user service. Its data API relies on the hosting platform's owner-only access gate. Do not make this deployment public or shared. A multi-user release must first add authentication and owner-scoped queries.

An internet connection is required to save and load workouts. Session storage holds a best-effort recovery copy of unsaved edits, not the authoritative database or an offline mode. Wait for “All changes saved” before leaving. After a conflicting edit, export the draft before reloading.

Weights use kilograms. Keep a consistent convention per exercise; per-dumbbell weight is suggested for dumbbells and 0 kg represents bodyweight-only loading. Volume is logged weight × reps, not physiological workload. Only logged sets from finished sessions enter progress. Older completed history retains its original completion flags. Finished sessions can be viewed, repeated, exported, or deleted; direct historical correction and JSON import are not yet implemented.

## Session safeguards

An empty session stays at zero. The first weight/reps entry starts timing. After 90 minutes without a workout edit, timing freezes at the last recorded activity. Six hours of continuous timing also requires review. Resume excludes the idle gap; Finish stops timing and saves logged sets; Discard requires confirmation. Old sessions without activity timestamps retain their sets but show an unknown duration when stale. Expiry is derived from stored timestamps on return, so it does not depend on a background job staying alive.

Timer refreshes stop while the page is hidden and when timing has stopped. Loading detects repeated cursors and has a 200-page ceiling. Saving sends at most eight requests in one batch, stops automatic retries on errors or the batch limit, and retains pending edits for manual retry/export. Requests time out after 15 seconds. Canonical payload comparison avoids repeated saves caused only by field order or trimmed names. Finish, discard, and session creation are protected against duplicate clicks.

## Engineering

React 19 + TypeScript, Vinext, Cloudflare Workers, Cloudflare D1 / SQLite, Drizzle migrations, Zod validation, and Radix/Base UI accessibility primitives. Session revisions provide optimistic concurrency control; a unique active-session constraint prevents two live sessions. Prepared SQL statements and same-origin checks protect write endpoints. Reads are cursor-paginated.

## Run and verify

Requires Node.js 22.13+ and npm. See [runtime setup](docs/runtime.md) for portable and managed environment details. `npm ci`, `npm run dev`, and `npm run build` are the normal commands in a portable checkout. Generate schema changes using `npm run db:generate`; production hosting applies tracked migrations. Do not create production tables at runtime.

Domain checks: `node --experimental-strip-types --test tests/*.test.mts`.

Type checks: `npx tsc --noEmit`.

## Portfolio documentation

- [Architecture and data safety](docs/architecture.md)
- [Phased product roadmap](docs/roadmap.md)
- [Reference analysis](docs/reference-analysis.md)

Keep health records, uploaded design archives, APK binaries, secrets, local databases, and exports out of the public repository. Publishing source does not imply publishing the private training log. A license for public reuse has not yet been selected.

## Exercise master integrity

The exercise catalog has stable IDs and a unique normalized name key. An explicit initialization request imports built-in and existing workout names without rewriting history; schema migrations only create the table/index. Creation uses same-origin checks, bounded requests, prepared SQL and a uniqueness constraint. Exact spelling conventions (case, punctuation, token order and common aliases) reuse a canonical row even with concurrent requests. Fuzzy matches prompt review and require an explicit different-exercise confirmation; no fuzzy auto-merging occurs. Exercise selection and new creation share the working inline search, with no nested dropdown. Catalog requests time out and require manual retry on failure. New workout exercise names must resolve to the catalog. This remains an owner-private catalog, not a public crowdsourced master or administrative merge tool.
