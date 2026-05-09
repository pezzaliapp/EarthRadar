# Education tutorial screenshots

Drop tutorial screenshots here. Each tutorial defined in
`src/pages/education/educationData.ts` declares the file it expects:

| Tutorial id  | Expected file               |
| ------------ | --------------------------- |
| `iss`        | `tutorial-iss.png`          |
| `quake`      | `tutorial-quake.png`        |
| `satellite`  | `tutorial-satellite.png`    |
| `storm`      | `tutorial-storm.png`        |

Files in this directory are served at `/EarthRadar/screenshots/edu/<file>` by Vite.
Until a file is dropped here, the `TutorialCard` renders a "Screenshot in arrivo"
placeholder block (see `onError` handler in `TutorialCard.tsx`).

Suggested format: PNG 600×800 (3:4 portrait) so the card aspect-ratio doesn't
change when files are added.
