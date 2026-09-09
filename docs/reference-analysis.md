# Reference analysis

Sources: user-supplied `Stackd.fig` and `Stackd.apk`, inspected locally without executing the APK. Original archives and decoded assets are excluded from this repository.

Figma: 402 × 874 mobile frames, Inter typography, near-black surfaces (#000000, #101010, #111111), gray labels, lime #c7f11f actions. Logging includes Set / Previous / KG / Reps / completion columns, Add Set, elapsed time, and Finish. Summary includes date, volume, exercise/set counts, and completed exercises. Mock values were not imported as user data.

APK: React Native/Expo with Hermes bytecode. Routes and UI strings cover sessions, exercise/set creation, summaries, repeat workouts, and saved workouts. Static inspection confirms at least one completed set is required before finishing, but does not prove runtime or backend behavior.

The MVP keeps the logging grid and visual identity, removes dashboard/onboarding complexity, and exposes Workout, History, Progress. Original web code uses a fresh database; no embedded backend credentials, Firebase configuration, or existing user records were repurposed.
