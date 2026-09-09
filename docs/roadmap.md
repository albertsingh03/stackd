# Stackd roadmap

## 1. Logging-first web MVP — implemented

Weight/reps logging, previous performance, repeat sessions, durable autosaves, history, simple exercise trends, and JSON export. Validate in real gym sessions before widening scope: time to log a set, missed entries, wrong weights, and tap count.

## 2. Harden the foundation

Browser/iPhone acceptance tests, historical correction, backup restore, stable exercise IDs and load conventions. Decide whether offline-first logging is required. Add ownership/authentication before supporting additional users. Publish a documented GitHub portfolio with synthetic demo data, never personal records or supplied design/APK sources by default.

## 3. Native iPhone companion + Apple Health

The website is not a direct HealthKit client. Apple's documented integration requires an app capability and device-side access. Introduce the iPhone layer before direct Apple Health integration, rather than waiting until the final monetization phase.

Make sleep and active-energy permissions optional and separate. Empty reads are not necessarily zero activity or permission denial. Store provenance, stable sample IDs, dates, and units; support incremental updates and deletions. Distinguish active from total energy and avoid double-counting.

Sources: [HealthKit setup](https://developer.apple.com/documentation/healthkit/setting-up-healthkit), [authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data), [synchronization](https://developer.apple.com/videos/play/wwdc2020/10184/).

## 4. Macros tracking

Food logging, portions, macro/energy totals and targets. Evaluate licensed food-data providers and Australian coverage before selecting one. Keep nutrition and exercise energy separate; no automatic rule to eat back all estimated exercise calories is assumed.

## 5. AI assistance

Explainable suggestions based on training history and goals. Require explicit permission before transmitting personal/health information to an AI provider. Respect user-reported limitations, allow edits, distinguish proposed from completed workouts, and evaluate quality/safety before rollout. Imported observations are not medical diagnoses.

## 6. App Store product and monetization

Account lifecycle, privacy/consent, export/deletion, reliable sync, accessibility, and subscription management must precede launch. A possible model is free core logging plus paid planning/advanced analysis; pricing and willingness to pay are unvalidated. No paid APIs, subscriptions, or memberships were purchased in this build.

Monetize functionality rather than health-data targeting. Review current [Apple privacy and health-data rules](https://developer.apple.com/app-store/review/guidelines/#health-and-health-research) before launch.
