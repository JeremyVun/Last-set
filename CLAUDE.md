# Last Set

A three.js story game about a pianist locking up a closing jazz club. Read `docs/vision.md` first: it holds Jeremy's brief verbatim, the story, the mechanic, the look and the plan.

Commands: `npm run dev` (127.0.0.1:5287), `npm run typecheck`, `npm run build`, `npm run preview` (5288).

Deploy: `tools/deploy.sh` builds and uploads `dist/` as static assets of the Cloudflare Worker `last-set` (`wrangler.jsonc`), live at https://last-set.perch-admin.workers.dev. Needs `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit), a clean tree and the `main` branch, because every deploy goes to production.

Code: `src/story.ts` holds all narrative text and song data. `src/main.ts` is the state machine (title, hub, inspecting, songs, finale). `src/audio/instruments.ts` is the synthesised sound library; `band.ts` sequences songs from `story.ts`; `theory.ts` has voicings. `src/game/performance.ts` runs call and response, scoring and warmth. `src/scene/` builds the club (`club.ts`), memory figures (`figures.ts`), shafts, rain and dust (`atmosphere.ts`), grade and bloom (`post.ts`), camera and mood (`world.ts`). `src/ui/` is the DOM overlay.

Checks (dev server running): `node tools/journey.mjs` plays the whole game through real controls (LAST=0 for the let-it-ring ending); `SONG=n node tools/play.mjs` autoplays one song with screenshots, level metering and optional `REC=file.webm`; `node tools/shot.mjs out.png "?qa=1&shot=piano&warmth=1&memory=1"` captures a view (`look=<hotspot>` frames an object); `tools/look.mjs` and `tools/probe.mjs` do free-camera shots and scene queries. `node tools/render-audio.mjs` renders every instrument offline and checks levels; `/audition.html` lets you hear them. Captures go in `/tmp`. Remember the stage is 0.36 m high when placing anything on it.

Copy follows the `user-facing-copy` skill. Visual work follows the global model rules.
