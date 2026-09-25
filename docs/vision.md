# Last Set — vision and plan

## Jeremy's brief (verbatim)

> Prototype a moody, atmospheric, story game with jazz music themes. It should feel nostalgic, blue, and have a compelline narrative and gameplay mechanics. Create it with three.js - you are free to make whatever game you want.

## The game

A basement jazz club called the Nightjar closes for good tonight, in November 1986. The party ended at two. Mae, the owner, left the narrator the keys and asked them to lock up. They haven't yet.

The narrator is a pianist. Their older sister Nell played trumpet in this room every Friday from 1952 until 1961, when she left for Paris after an argument in the alley. They never spoke again. Nell died in Paris this spring. In June an envelope arrived with the narrator's name on it: a tune she wrote for them, seven bars long, with the eighth bar empty.

The player explores the empty club, finds four objects, and plays four songs. Each song is a duet with the memory of Nell's trumpet. Playing well brings the memory back: the room warms from blue to lamplight amber, the band and the crowd fade in, and the lines people said that night come back clearly. Playing badly leaves the memory blurred. Words drop out of the remembered lines.

### Principles

1. **Blue is now, amber is then.** The present is blue. Memory is warm. Every colour choice follows this.
2. **The room is the interface.** Minimal HUD. The club itself reacts to the playing.
3. **Silence is allowed.** Space in the music, space in the layout. The last choice in the game is whether to play at all.
4. **The last note.** Nell always took the last note of every tune. The mechanic, the argument and the ending all turn on who plays it.

### Core mechanic: call and response

- Nell plays a two-bar phrase (the call). The player has the next two bars to answer.
- Eight keys (A S D F G H J K, or 1–8, or tap/click) play eight notes of the song's scale, low to high. Every key is in the scale, so nothing sounds wrong. The home key is marked.
- Each answer is judged on three things: **timing** (notes near the swing grid), **space** (not too few, not too many notes), and **answer** (echoing her rhythm or contour, or ending on the home note).
- Answer quality moves **warmth** (0–1). Warmth brings in the bass, then the drums, then the crowd, shifts the grade toward amber, and fades in the memory figures.
- After each answer, one remembered line appears. Its clarity depends on that answer. Poor answers blur words out of the line.

### The set

| # | Object | Song | Feel | Memory |
|---|---|---|---|---|
| 0 | Mae's note on the bar | — | — | Arrival, 2:40am |
| 1 | Band photograph, 1952 | Friday Blues | medium swing blues in F, 120 bpm | First time Nell let the narrator sit in. Tutorial. "Listen first." She let them take the last note, the only time. |
| 2 | The record behind the bar | Harbor Lights | ballad in Db, 66 bpm | 1958 recording session in the club after hours. "Leave me some space." |
| 3 | The back door | The Alley | fast C minor, 160 bpm | 1961, the argument. Nell's calls grow and crowd the answers until she plays over them. "You always take the last word anyway." |
| 4 | The envelope on the piano | Last Set | modal D dorian, 104 bpm | Her Christmas postcards from Paris, 1962–1985. Then the head: she plays seven bars, the player plays the eighth. Then her goodbye phrase, and the choice: answer, or let her have the last note. |

Two endings, both valid: **answer** (the first thing said to her in twenty-five years) or **let it ring** (she always wanted the last note). Then dawn through the street windows, keys in the mailbox.

## Look

- A small basement club: brick behind the stage, a raised stage with piano, bass, drum kit and a mic stand; round tables with chairs upturned on them; a bar with backlit bottles; high street-level windows with rain and passing headlights sweeping the ceiling; stairs up to the door; a blue neon NIGHTJAR sign.
- Fake volumetric light cones with dust, fog, bloom, film grain, vignette, a blue grade that shifts to amber with warmth.
- Memory figures are translucent, glowing, fresnel-lit people who sway to the beat.

### Tokens

| name | hex | use |
|---|---|---|
| night | `#07111f` | base, fog |
| blue hour | `#1d3a5f` | present-day light |
| neon | `#5fb3ff` | NIGHTJAR sign, your notes |
| smoke | `#b9cbe0` | narration text |
| lamplight | `#e8a85a` | memory, Nell's notes, remembered lines |
| brass | `#c9a26b` | trumpet, highlights |

- **League Gothic** for titles and song cards, in the Reid Miles record-sleeve idiom. **Spectral** for narration (light, italic for memory).
- Narration sits bottom-left, left-aligned, under 55ch, no box. Remembered lines sit top-centre in amber italic. Nell's lines left, the narrator's right.

## Sound

All synthesised with Web Audio: electric piano (the player and comping), plucked upright bass, brushes and ride, muted trumpet for Nell, rain, room tone, vinyl crackle and tape wow that rise with memory, a generated-impulse reverb. The band sequencer (comping, walking bass, drums, Nell's phrases) lives in `src/audio/band.ts`; instruments in `src/audio/instruments.ts`.

## Status (2026-09-25)

Built and playable end to end in about 15–20 minutes: title, prologue, hub with story and flavour objects, four songs, both endings, dawn, credits. Progress saves to localStorage. Keyboard, mouse and touch all work; Esc pauses. Both endings pass `tools/journey.mjs` with no errors.

Details that differ from the first sketch: a bare "ghost light" stands on the empty stage in the present and fades as the memory warms; the envelope lies on the closed piano lid; the record plays a worn snippet of Harbor Lights when you pick it up; the back door opens onto rain in the alley. The art in `public/art/` came from Astra.

Known gaps: nobody has listened to the audio yet (levels and spectra are checked, feel is not). The memory figures are stylised capsule people and could be more expressive. The scoring thresholds are tuned against an autoplayer, not a human.

## Plan

1. Scaffold (Vite, TS, three 0.186). Docs.
2. In parallel: instrument and effects library (Opus subagent, worktree), still images for close-ups (Astra via codex): 1952 band photo, 1958 record sleeve, the lead sheet, a club poster.
3. Lead builds the club scene, post-processing, camera rig, hotspots, UI, story data, band sequencer, call-and-response scoring.
4. Integrate, then play through with a headless Chrome harness and screenshot review. Iterate on look and feel.
