# Last Set

A three.js story game about a pianist locking up a closing jazz club. Read `docs/vision.md` first: it holds Jeremy's brief verbatim, the story, the mechanic, the look and the plan.

Commands: `npm run dev` (127.0.0.1:5287), `npm run typecheck`, `npm run build`, `npm run preview` (5288).

Code: `src/story.ts` holds all narrative text and song data. `src/audio/` is sound (instruments, band sequencer). `src/scene/` builds the club and post-processing. `src/game/` runs call and response and the hub. `src/ui/` is the DOM overlay. Keep checks in `tools/` and captures in `/tmp`. `?qa=1` exposes `window.__lastSet` for inspection.

Copy follows the `user-facing-copy` skill. Visual work follows the global model rules.
