import '@fontsource/spectral/300.css';
import '@fontsource/spectral/300-italic.css';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/league-gothic/400.css';
import './style.css';
import { World, SHOTS } from './scene/world.ts';
import { UI } from './ui/ui.ts';
import { credits, hubHints, inspects, lastSet, prologue, songs, touchText } from './story.ts';
import { Performance, type SongResult } from './game/performance.ts';
import * as I from './audio/instruments.ts';
import { chord, midi, nearest, voicing } from './audio/theory.ts';

const params = new URLSearchParams(location.search);
const qa = params.has('qa');
const touch = matchMedia('(pointer: coarse)').matches;
const forInput = (t: string | null) => (t && touch ? touchText[t] ?? t : t);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SAVE = 'last-set:v1';

await Promise.all([
  document.fonts.load('100px "League Gothic"'),
  document.fonts.load('300 20px Spectral'),
  document.fonts.load('italic 300 20px Spectral'),
]).catch(() => undefined);

const world = new World(document.getElementById('app')!);
const ui = new UI();

// Story order: each step names the object that moves the story on, and the song it unlocks.
const steps: { object: string; song: number | null }[] = [
  { object: 'note', song: null },
  { object: 'photo', song: 0 },
  { object: 'record', song: 1 },
  { object: 'door', song: 2 },
  { object: 'envelope', song: 3 },
  { object: 'stairs', song: null },
];
const flavour = ['tables', 'drums', 'bass', 'window', 'sign', 'poster', 'stairs'];

interface Progress {
  step: number;
  pending: number | null;
}
let progress: Progress = { step: 0, pending: null };
try {
  const saved = JSON.parse(localStorage.getItem(SAVE) ?? 'null');
  if (saved && typeof saved.step === 'number') progress = saved;
} catch {
  /* start fresh */
}
const save = () => localStorage.setItem(SAVE, JSON.stringify(progress));

let ctx: AudioContext | null = null;
let mixer: I.Mixer | null = null;
let rain: ReturnType<typeof I.createRain> | null = null;
let room: I.Level | null = null;
let performance: Performance | null = null;
let mode: 'title' | 'story' | 'hub' | 'song' | 'end' = 'title';
let busy = false;
let paused = false;
let soundOn = true;
let hovered: string | null = null;
let lastHornStart = -1;
let autoplay: { mode: 'echo' | 'none' | 'busy'; answerLast: boolean; planned: Set<string> } | null = null;

function audio() {
  if (ctx) return;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  mixer = I.createMixer(ctx);
  rain = I.createRain(ctx, mixer.ambience);
  room = I.createRoomTone(ctx, mixer.ambience);
  rain.setLevel(0.55);
  rain.setMuffle(1);
  room.setLevel(0.5);
  if (qa) {
    meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    mixer.master.connect(meter);
  }
}
let meter: AnalyserNode | null = null;
let recorder: MediaRecorder | null = null;
const recorded: Blob[] = [];
function levels() {
  if (!meter) return null;
  const buf = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(buf);
  let peak = 0, sum = 0;
  for (const v of buf) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / buf.length) };
}

function hubTargets() {
  const step = steps[progress.step];
  const ids = new Set(flavour);
  if (progress.pending !== null) ids.add('piano');
  if (step) ids.add(step.object);
  if (progress.step >= 4 || progress.pending === 3) ids.delete('envelope');
  if (step?.object === 'envelope' && progress.pending === null) ids.add('envelope');
  return [...ids];
}

function refreshHub() {
  mode = 'hub';
  world.memory.setVisible(false);
  world.setEnabled(hubTargets());
  const step = steps[progress.step];
  if (progress.pending !== null) {
    world.setMarker('piano');
    ui.setHubAction(hubHints.piano);
  } else if (step) {
    world.setMarker(step.object);
    const label = step.object === 'stairs' ? hubHints.leave : `Look at the ${inspects[step.object].label.toLowerCase()}`;
    ui.setHubAction(step.object === 'note' ? "Read Mae's note" : label, progress.step === 0 ? forInput(hubHints.first) : null);
  }
  ui.showSoundButton(true);
}

function leaveHub() {
  busy = true;
  world.setEnabled([]);
  world.setMarker(null);
  ui.setHubAction(null);
  ui.hoverLabel(null);
}

async function inspect(id: string) {
  leaveHub();
  mode = 'story';
  const it = inspects[id];
  const story = steps[progress.step]?.object === id && progress.pending === null;
  if (id === 'stairs' && story) return leave();
  world.go(world.inspectShot(id), 2.0);
  const stopRecord = id === 'record' ? playRecord() : null;
  if (id === 'door') {
    openDoor(true);
    rain?.setMuffle(0.25);
    rain?.setLevel(0.8);
  }
  await wait(1300);
  if (id === 'envelope') {
    await ui.say([it.lines[0]]);
    ui.showInspect({ image: it.image });
    await ui.say(it.lines.slice(1));
  } else {
    ui.showInspect(it.image || it.paper ? { image: it.image, paper: it.paper } : null);
    await ui.say(it.lines);
  }
  ui.showInspect(null);
  stopRecord?.();
  if (id === 'door') {
    openDoor(false);
    rain?.setMuffle(1);
    rain?.setLevel(0.55);
  }
  if (story) {
    const step = steps[progress.step];
    if (step.song !== null) progress.pending = step.song;
    else progress.step++;
    save();
  }
  if (id === 'envelope' && story) return playSong(3);
  world.go(SHOTS.hub, 2.2);
  await wait(1200);
  busy = false;
  refreshHub();
}

// Mae's copy of Harbor Lights, heard as a worn record through the bar speakers.
function playRecord() {
  if (!ctx || !mixer) return () => undefined;
  const c = ctx, m = mixer;
  const song = songs[1];
  const spb = 60 / song.bpm;
  const t0 = c.currentTime + 1.2;
  const out = c.createGain();
  out.gain.value = 0.8;
  out.connect(m.band);
  m.setMemory(1, c.currentTime);
  m.setMuffle(0.55, c.currentTime);
  let center = 62;
  song.form.slice(0, 4).forEach((sym, i) => {
    const v = voicing(sym, center);
    center = v.reduce((a, b) => a + b, 0) / v.length;
    v.forEach((n) => I.epiano(c, out, n, t0 + i * 4 * spb, 0.32, 4 * spb * 0.95));
    I.bass(c, out, nearest(chord(sym).root, 38, 31, 50), t0 + i * 4 * spb, 0.7, 2 * spb);
    I.bass(c, out, nearest(chord(sym).root + 7, 40, 31, 50), t0 + (i * 4 + 2) * spb, 0.6, 2 * spb);
    for (let b = 0; b < 4; b += 2) I.brushSweep(c, out, t0 + (i * 4 + b) * spb, 2 * spb, 0.25);
  });
  const phrase = [...song.exchanges[0].call, ...song.exchanges[1].call.map((n) => ({ ...n, beat: n.beat + 8 }))];
  for (const n of phrase) I.trumpet(c, out, midi(n.pitch), t0 + n.beat * spb, n.dur * spb, 0.6, { scoop: n.fx === 'scoop', vibrato: 1 });
  return () => {
    out.gain.setTargetAtTime(0, c.currentTime, 0.4);
    m.setMemory(0, c.currentTime);
    m.setMuffle(0, c.currentTime);
    window.setTimeout(() => out.disconnect(), 3000);
  };
}

let doorAnim = 0;
function openDoor(open: boolean) {
  const target = open ? -1.15 : 0;
  const from = world.club.door.rotation.y;
  const start = performanceNow();
  cancelAnimationFrame(doorAnim);
  const step = () => {
    const k = Math.min(1, (performanceNow() - start) / 1400);
    world.club.door.rotation.y = from + (target - from) * (1 - Math.pow(1 - k, 3));
    if (k < 1) doorAnim = requestAnimationFrame(step);
  };
  step();
}
function performanceNow() {
  return window.performance.now();
}

async function playSong(index: number) {
  leaveHub();
  mode = 'song';
  const song = songs[index];
  world.go(SHOTS.piano, 2.6);
  world.memory.setVisible(true);
  world.warmthTarget = 0;
  rain?.setLevel(0.3);
  room?.setLevel(0.2);
  await wait(2200);
  ui.showSoundButton(false);
  ui.showPerf(true, song.home);
  const lineMs = ((4 * 60 * 1000) / song.bpm) * 3.6;
  const done = new Promise<SongResult>((resolve) => {
    performance = new Performance(ctx!, mixer!, song, {
      hint: (t) => ui.setHint(forInput(t)),
      line: (line, clarity) => ui.showLine(line, clarity, lineMs),
      feedback: (t, good) => ui.feedback(t, good),
      warmth: (w) => (world.warmthTarget = w),
      keyLit: (i, down, m) => {
        ui.lightKey(i, down);
        world.club.pressKey(m, down);
        if (down) world.playerPulse = 1;
      },
      finished: resolve,
    });
  });
  lastHornStart = -1;
  void ui.showCard(song.title, song.year, Math.max(2600, (4 * 60 * 1000) / song.bpm * (song.introBars + 0.6)));
  performance!.start();
  const result = await done;
  const perf = performance!;
  performance = null;
  window.setTimeout(() => perf.band.stop(3), 200);
  ui.showPerf(false);
  world.nellPlayingTarget = 0;
  if (index === 3) return finale(result);
  await wait(1500);
  world.warmthTarget = 0;
  rain?.setLevel(0.55);
  room?.setLevel(0.5);
  const avg = result.scores.length ? result.scores.reduce((s, x) => s + x.q, 0) / result.scores.length : 0;
  const recall = avg >= 0.62 ? 'I remembered nearly all of it.' : avg >= 0.42 ? 'Some of it came back.' : 'Most of that night is still blurred.';
  const pick = await ui.choose([recall], ['Play it again', 'Continue']);
  if (pick === 0) return playSong(index);
  world.memory.setVisible(false);
  await ui.say(song.after);
  progress.pending = null;
  progress.step++;
  save();
  world.go(SHOTS.hub, 3);
  await wait(1600);
  busy = false;
  refreshHub();
}

async function finale(result: SongResult) {
  mode = 'story';
  await wait(1200);
  const lines = [...(result.herEnding ? [lastSet.herEnding] : []), ...(result.ending === 'answered' ? lastSet.answered : lastSet.letRing)];
  await ui.say(lines);
  world.warmthTarget = 0;
  world.dawnTarget = 1;
  world.atmosphere.setRain(0.25);
  rain?.setLevel(0.15);
  world.go(SHOTS.hub, 5);
  await wait(4200);
  world.memory.setVisible(false);
  await ui.say([lastSet.dawn]);
  progress = { step: 5, pending: null };
  save();
  busy = false;
  refreshHub();
}

async function leave() {
  mode = 'end';
  world.go(SHOTS.stairs, 3);
  await wait(2200);
  await ui.say(lastSet.leave);
  world.ghostOn = 0;
  await wait(1200);
  world.fadeTarget = 0;
  rain?.setLevel(0, ctx!.currentTime);
  room?.setLevel(0, ctx!.currentTime);
  await wait(2500);
  localStorage.removeItem(SAVE);
  showCredits();
}

function showCredits() {
  const box = document.createElement('section');
  box.className = 'title on';
  box.innerHTML = `<h1 class="title-name">${credits.title}</h1><p class="title-sub">${credits.thanks}</p>`;
  const again = document.createElement('button');
  again.className = 'text-button start';
  again.textContent = 'Play again';
  again.style.pointerEvents = 'auto';
  again.addEventListener('click', () => location.reload());
  box.appendChild(again);
  ui.root.appendChild(box);
  again.focus();
}

async function begin() {
  audio();
  ui.hideTitle();
  mode = 'story';
  busy = true;
  if (progress.step > 0 || progress.pending !== null) {
    world.go(SHOTS.hub, 3);
    if (progress.step >= 5) {
      world.dawnTarget = world.dawn = 1;
      world.atmosphere.setRain(0.25);
    }
    await wait(2000);
    busy = false;
    refreshHub();
    return;
  }
  world.fadeTarget = 0.12;
  await wait(1200);
  ui.setDateline(prologue.dateline);
  await ui.say(prologue.lines);
  ui.setDateline(null);
  world.cut(SHOTS.hub);
  world.fadeTarget = 1;
  await wait(1400);
  busy = false;
  refreshHub();
}

// Input
const KEYMAP: Record<string, number> = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4, KeyH: 5, KeyJ: 6, KeyK: 7, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 };

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && ctx && mode !== 'title') {
    togglePause();
    return;
  }
  if (paused) return;
  const k = KEYMAP[e.code];
  if (k !== undefined && performance) {
    e.preventDefault();
    if (!e.repeat) performance.press(k);
    return;
  }
  if ((e.code === 'Space' || e.code === 'Enter') && ui.waitingForContinue) {
    e.preventDefault();
    ui.advance();
    return;
  }
  if (e.code === 'Enter' && mode === 'hub' && !busy && document.activeElement === document.body) hubAction();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k !== undefined && performance) performance.release(k);
});
window.addEventListener('blur', () => performance?.releaseAll());
ui.onKey = (i, down) => {
  if (!performance || paused) return;
  if (down) performance.press(i);
  else performance.release(i);
};

function hubAction() {
  if (busy || mode !== 'hub') return;
  if (progress.pending !== null) return void playSong(progress.pending);
  const step = steps[progress.step];
  if (step) void inspect(step.object);
}
ui.onHubAction = hubAction;

const canvas = world.renderer.domElement;
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'hub' || busy) {
    if (hovered) ui.hoverLabel(null);
    hovered = null;
    return;
  }
  hovered = world.pick(e.clientX, e.clientY);
  const text = hovered === 'piano' ? hubHints.piano : hovered === 'stairs' && steps[progress.step]?.object === 'stairs' ? hubHints.leave : hovered ? inspects[hovered].label : null;
  ui.hoverLabel(text, e.clientX, e.clientY);
});
canvas.addEventListener('click', (e) => {
  if (ui.waitingForContinue) return ui.advance();
  if (mode !== 'hub' || busy) return;
  const id = world.pick(e.clientX, e.clientY);
  if (!id) return;
  if (id === 'piano') return void playSong(progress.pending!);
  void inspect(id);
});

function togglePause() {
  paused = !paused;
  ui.showPause(paused);
  if (paused) {
    performance?.releaseAll();
    void ctx?.suspend();
  } else void ctx?.resume();
}
ui.onResume = togglePause;
ui.onSound = () => {
  soundOn = !soundOn;
  mixer?.setVolume(soundOn ? 1 : 0);
  ui.setSound(soundOn);
};

world.onFrame = () => {
  const perf = performance;
  if (!perf || !ctx) return;
  perf.update();
  const now = perf.now();
  world.beat = perf.band.beatAt(now);
  let playing = 0;
  for (const n of perf.band.horn) {
    if (now >= n.time - 0.35 && now < n.end + 0.5) playing = 1;
    if (now >= n.time && n.time > lastHornStart) {
      lastHornStart = n.time;
      world.nellPulse = 1;
    }
  }
  world.nellPlayingTarget = playing;
  if (autoplay) runAutoplay(perf, now);
  ui.drawTrack(now, perf.currentBlock(now), perf.band.horn, perf.played, perf.keys, perf.song.home);
};

world.fade = 0;
world.fadeTarget = 1;
world.memory.setVisible(false);
world.start();
const hasSave = progress.step > 0 || progress.pending !== null;
ui.showTitle(
  hasSave
    ? [
        { label: 'Continue', run: () => void begin() },
        {
          label: 'Start over',
          run: () => {
            progress = { step: 0, pending: null };
            save();
            void begin();
          },
        },
      ]
    : [{ label: 'Start', run: () => void begin() }],
);

function runAutoplay(perf: Performance, now: number) {
  const a = autoplay!;
  const block = perf.currentBlock(now);
  if (!block || block.split >= block.end || a.mode === 'none') return;
  const key = `${block.start}`;
  if (a.planned.has(key)) return;
  a.planned.add(key);
  if (block.who === 'goodbye' && !a.answerLast) return;
  const calls = perf.band.horn.filter((n) => n.time >= block.start && n.time < block.split);
  const spb = perf.band.spb;
  const plan: { at: number; i: number; dur: number }[] = [];
  if (a.mode === 'busy') for (let k = 0; k < 14; k++) plan.push({ at: block.split + k * spb * 0.5, i: k % 8, dur: spb * 0.3 });
  else if (block.who === 'head') [4, 2, 0].forEach((i, k) => plan.push({ at: block.split + k * spb, i, dur: spb * 0.8 }));
  else {
    for (const c of calls.slice(0, 7)) {
      const at = block.split + (c.time - block.start);
      if (at >= block.end - 0.05) break;
      let best = 0;
      perf.keys.forEach((m, i) => { if (Math.abs(m - c.midi) < Math.abs(perf.keys[best] - c.midi)) best = i; });
      plan.push({ at, i: best, dur: Math.min(c.end - c.time, spb) * 0.8 });
    }
    if (plan.length) plan[plan.length - 1].i = perf.song.home[0];
  }
  for (const p of plan) {
    const lat = perf.latency;
    window.setTimeout(() => perf.press(p.i), Math.max(0, (p.at - now) * 1000 + lat * 1000));
    window.setTimeout(() => perf.release(p.i), Math.max(0, (p.at - now + p.dur) * 1000 + lat * 1000));
  }
}

if (qa) {
  const w = window as unknown as Record<string, unknown>;
  w.__autoplay = (mode: 'echo' | 'none' | 'busy', answerLast = true) => (autoplay = { mode, answerLast, planned: new Set() });
  w.__lastSet = {
    world,
    ui,
    levels,
    record: () => {
      const dest = ctx!.createMediaStreamDestination();
      mixer!.master.connect(dest);
      recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
      recorder.ondataavailable = (e) => recorded.push(e.data);
      recorder.start(1000);
    },
    stopRecording: () =>
      new Promise<string>((resolve) => {
        recorder!.onstop = async () => {
          const buf = new Uint8Array(await new Blob(recorded, { type: 'audio/webm' }).arrayBuffer());
          let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          resolve(btoa(bin));
        };
        recorder!.stop();
      }),
    state: () => ({ mode, busy, progress, warmth: world.warmth, perf: performance ? { scores: performance.scores, warmth: performance.warmth, now: performance.now(), start: performance.band.startTime, spb: performance.band.spb } : null }),
    song: (i: number) => {
      audio();
      ui.hideTitle();
      progress = { step: [1, 2, 3, 4][i], pending: i };
      busy = false;
      mode = 'hub';
      return playSong(i);
    },
    progress: (step: number, pending: number | null) => {
      progress = { step, pending };
      save();
    },
  };
  const shot = params.get('shot') as keyof typeof SHOTS | null;
  if (shot && SHOTS[shot]) {
    world.cut(SHOTS[shot]);
    ui.hideTitle();
  }
  const look = params.get('look');
  if (look && world.hotspot(look)) {
    world.cut(world.inspectShot(look));
    ui.hideTitle();
    if (look === 'door') world.club.door.rotation.y = -1.15;
  }
  if (params.has('warmth')) world.warmthTarget = world.warmth = Number(params.get('warmth'));
  if (params.has('dawn')) world.dawnTarget = world.dawn = Number(params.get('dawn'));
  if (params.has('nell')) world.nellPlayingTarget = Number(params.get('nell'));
  if (params.has('memory')) world.memory.setVisible(params.get('memory') === '1');
}
(window as unknown as { __ready: boolean }).__ready = true;
