# Architecture and data safety

## Access boundary

The production Site is owner-only. Access enforcement happens before the Worker, including `/api/workouts`. The MVP has one dataset and one active session. It makes no HealthKit or third-party AI requests.

Do not make this Site public/shared with the current routes. Before multi-user deployment add authenticated user IDs, ownership columns, owner/session indexes, per-user active-session uniqueness, and ownership checks to every read, write, export, and deletion. Use isolated synthetic data for a public portfolio demo.

## Data model

`workouts`: UUID, name, start timestamp, nullable completion timestamp, nullable active slot, revision, exercise JSON.

Exercise JSON contains ordered exercise UUID/name entries and sets with UUID, decimal-weight string, reps string, and completion flag. Input remains strings to distinguish a blank from zero. Completed sets require valid weight and positive integer reps. Finishing requires at least one checked set.

Sessions are bounded to 30 exercises and 30 sets each. Atomic whole-session saves keep the initial editor small. Normalize exercises/sets and add stable catalog IDs and explicit load conventions before large-scale analytics/native integrations. Exercise names currently identify progress series.

## Saving and recovery

Edits update the UI and a temporary session-storage recovery envelope. A 500 ms debounce queues serialized saves. The exact outstanding request is retained separately from newer edits; after an ambiguous network failure it is replayed first, recovering the server revision before newer changes are sent. The server accepts identical lost-response retries without duplicating data.

The saved indicator only updates after acknowledgment. Conditional updates reject stale revisions. Conflicts preserve/export local edits instead of silently merging. Temporary blank names and partial decimal inputs are normalized for persistence while remaining editable. Invalid recovery copies are retained for export.

Browser storage is not authoritative or durable across all browser lifecycle events. An internet connection is required; this is not offline-first sync. Wait for acknowledgment before leaving.

## API

- `GET /api/workouts?cursor=UUID`: up to 100 sessions, UUID-keyset pagination, no-store caching. Client sorts results by start time.
- `PUT /api/workouts`: create at revision 0 or conditionally update an existing revision; return canonical saved session and new revision.
- `DELETE /api/workouts?id=UUID&revision=N`: confirmed revision-checked deletion.

SQL values use bound parameters. Mutations require matching Origin. Errors return recoverable messages. Drizzle migrations own schema creation; no runtime DDL.

## Verification and limits

Domain tests cover validation, bodyweight, volume, prior-session lookup, repeat prefills, and progression. Type checking and production compilation are performed before publication. Browser/end-to-end testing is separate and has not been performed for this build; deployment success alone does not verify iPhone interactions.

JSON restore, historical correction, offline-first synchronization, and multi-user ownership are future work, not implemented claims.
