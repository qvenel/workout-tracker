# workout-tracker

Mobile PWA to log calisthenics workouts, set by set. Data lives as CSV in a private repo ([workout-data](https://github.com/qvenel/workout-data)): the app reads the history to prefill each set with last time's numbers, and writes **one commit per session**.

Live: https://qvenel.github.io/workout-tracker/

## Features

- Session templates (Push A, Pull A…) from `templates.json`, next one suggested
- Timeline of sets: done sets fold up, active set card, rest timer slotted between sets, upcoming sets draggable
- Prefill from the last session (reps / seconds, weight, rings level, band); bad-form reps on every set
- Rest: always starts at 2:00, ±15 s for the rest in progress; short beep at every 30 s left, triple beep + vibration when over
- 5-minute warm-up countdown at the start of each session (±1 min, skip; ends by itself on the first set)
- Overall session clock, screen kept awake during a session
- Replace / add / delete exercises and sets on the fly, create new exercises
- In-app camera: record, scrub frame by frame, discarded on exit (nothing saved)
- Works offline once loaded; sessions that failed to upload are kept and retried

## Setup on the phone

1. Create a fine-grained token (GitHub → Settings → Developer settings → Fine-grained tokens): repository access **only `workout-data`**, permission **Contents: Read and write**.
2. Open the live URL in Chrome on Android → menu → *Install app*.
3. Paste the token in the app settings. It is stored on the phone only.

## Development

```sh
npm install
# point the dev server at a scratch copy of workout-data (it gets written to)
cp -r ../workout-data /tmp/wd && LOCAL_DATA_DIR=/tmp/wd npm run dev
```

Then in Settings tick *Données locales (dev)*. `npm run build` type-checks and builds to `dist/`. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

Stack: Vite, Preact, TypeScript, SortableJS, vite-plugin-pwa. No backend: the browser talks to the GitHub REST API (Git Data API for single-commit saves).
