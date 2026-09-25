import {
  bass,
  brushSweep,
  brushTap,
  createCrowd,
  createMixer,
  createRain,
  createRoomTone,
  epiano,
  glassClink,
  hat,
  kick,
  liveVoices,
  ride,
  snap,
  trumpet,
  type Held,
  type Mixer,
  type TrumpetOptions,
} from "./instruments";

export interface Buses {
  ctx: BaseAudioContext;
  band: AudioNode;
  trumpet: AudioNode;
  piano: AudioNode;
}

export interface Demo {
  label: string;
  length: number;
  play(b: Buses, t0: number): void;
}

export interface GrooveEvent {
  at: number;
  play(b: Buses, t: number): void;
}

const SWING = 0.64;

function clock(bpm: number): (bar: number, beat: number, and?: boolean) => number {
  const b = 60 / bpm;
  return (bar, beat, and = false) => (bar * 4 + beat) * b + (and ? SWING * b : 0);
}

type Phrase = [start: number, beats: number, midi: number, velocity: number, opts?: TrumpetOptions][];

function playPhrase(b: Buses, t0: number, bpm: number, phrase: Phrase, gate = 0.92): void {
  const beat = 60 / bpm;
  let lastEnd = -1;
  for (const [start, beats, midi, velocity, opts] of phrase) {
    const at = t0 + start * beat;
    const legato = lastEnd >= 0 && at - lastEnd < 0.06;
    trumpet(b.ctx, b.trumpet, midi, at, beats * beat * gate, velocity, { legato, ...opts });
    lastEnd = at + beats * beat * gate;
  }
}

const walking = [
  [41, 45, 48, 47],
  [46, 44, 43, 42],
  [41, 43, 45, 47],
  [48, 51, 41, 45],
  [46, 50, 53, 48],
  [47, 50, 53, 54],
  [55, 50, 48, 40],
];

const VOICINGS: Record<string, number[]> = {
  F7: [57, 62, 63, 67],
  Bb7: [56, 60, 62, 67],
  Cm7: [58, 62, 63, 67],
  Bdim7: [59, 62, 65, 68],
  Gm7: [58, 62, 65, 69],
  C7: [58, 62, 64, 69],
  F69: [57, 62, 64, 67],
};

function chord(b: Buses, dest: AudioNode, notes: number[], t: number, dur: number, velocity: number): void {
  notes.forEach((m, i) => epiano(b.ctx, dest, m, t + i * 0.006, velocity * (0.9 + 0.2 * Math.random()), dur));
}

export function groove(): { length: number; events: GrooveEvent[] } {
  const bpm = 120;
  const beat = 60 / bpm;
  const at = clock(bpm);
  const events: GrooveEvent[] = [];
  const add = (time: number, play: GrooveEvent["play"]): void => {
    events.push({ at: time, play });
  };

  walking.forEach((bar, i) =>
    bar.forEach((m, j) => add(at(i, j), (b, t) => bass(b.ctx, b.band, m, t, j % 2 === 0 ? 0.78 : 0.68, beat * 0.92))),
  );
  add(at(7, 0), (b, t) => bass(b.ctx, b.band, 41, t, 0.8, beat * 3));

  for (let bar = 0; bar < 7; bar++) {
    for (const [beatIn, and, v] of [[0, false, 0.5], [1, false, 0.62], [1, true, 0.4], [2, false, 0.5], [3, false, 0.62], [3, true, 0.4]] as const) {
      add(at(bar, beatIn, and), (b, t) => ride(b.ctx, b.band, t, v + 0.06 * Math.random()));
    }
    add(at(bar, 1), (b, t) => hat(b.ctx, b.band, t, 0.5));
    add(at(bar, 3), (b, t) => hat(b.ctx, b.band, t, 0.5));
    for (let j = 0; j < 4; j++) add(at(bar, j), (b, t) => kick(b.ctx, b.band, t, 0.22));
  }
  add(at(7, 0), (b, t) => ride(b.ctx, b.band, t, 0.7));
  add(at(7, 0), (b, t) => kick(b.ctx, b.band, t, 0.45));
  add(at(7, 0), (b, t) => brushTap(b.ctx, b.band, t, 0.55));

  for (const [bar, beatIn, and, v] of [
    [1, 3, true, 0.3],
    [2, 2, true, 0.22],
    [3, 1, true, 0.35],
    [4, 3, true, 0.25],
    [5, 2, true, 0.3],
    [6, 1, true, 0.3],
    [6, 3, true, 0.45],
  ] as const) {
    add(at(bar, beatIn, and), (b, t) => brushTap(b.ctx, b.band, t, v));
  }

  const comp: [bar: number, beat: number, and: boolean, beats: number, chord: string, v: number][] = [
    [0, 0, false, 0.7, "F7", 0.45],
    [0, 1, true, 1.3, "F7", 0.5],
    [1, 1, true, 0.6, "Bb7", 0.48],
    [1, 3, false, 0.8, "Bb7", 0.42],
    [2, 0, false, 1.5, "F7", 0.46],
    [2, 2, true, 0.6, "F7", 0.4],
    [3, 0, false, 0.8, "Cm7", 0.46],
    [3, 2, false, 0.6, "F7", 0.44],
    [3, 3, true, 1.1, "Bb7", 0.5],
    [4, 2, false, 0.6, "Bb7", 0.4],
    [5, 0, false, 0.7, "Bdim7", 0.45],
    [5, 1, true, 1.2, "Bdim7", 0.46],
    [6, 0, false, 0.8, "Gm7", 0.46],
    [6, 1, true, 0.6, "Gm7", 0.4],
    [6, 2, true, 1.1, "C7", 0.5],
    [7, 0, false, 3.5, "F69", 0.5],
  ];
  for (const [bar, beatIn, and, beats, name, v] of comp) {
    add(at(bar, beatIn, and), (b, t) => chord(b, b.band, VOICINGS[name], t, beats * beat, v));
  }

  const phrase: Phrase = [
    [16 + SWING, 0.36, 72, 0.75],
    [17, 0.5, 74, 0.77],
    [17 + SWING, 1.3, 77, 0.85, { scoop: true }],
    [19, 0.45, 75, 0.75],
    [19 + SWING, 0.9, 74, 0.77],
    [21, 0.45, 71, 0.70],
    [21 + SWING, 0.36, 68, 0.70],
    [22, 1.5, 65, 0.75],
    [23 + SWING, 0.36, 67, 0.70],
    [24, 0.9, 70, 0.77],
    [25 + SWING, 0.36, 69, 0.73],
    [26, 0.45, 67, 0.71],
    [26 + SWING, 0.5, 64, 0.70],
    [27 + SWING, 0.36, 67, 0.70],
    [28, 3.2, 69, 0.77, { vibrato: 1.3 }],
  ];
  add(0, (b, t) => playPhrase(b, t, bpm, phrase));

  events.sort((a, b) => a.at - b.at);
  return { length: at(8, 0) + 3, events };
}

export const demos: Record<string, Demo> = {
  trumpetBallad: {
    label: "Trumpet: ballad",
    length: 13,
    play: (b, t0) =>
      playPhrase(b, t0, 66, [
        [0, 0.5, 68, 0.42],
        [0.5 + 0.1, 0.4, 70, 0.45],
        [1, 1.5, 72, 0.5, { scoop: true }],
        [2.5, 0.5, 73, 0.48],
        [3, 2, 77, 0.58, { vibrato: 1.3 }],
        [5, 0.5, 75, 0.5],
        [5.6, 0.4, 73, 0.46],
        [6, 2.2, 72, 0.5],
        [8.5, 2, 68, 0.45, { fall: true }],
      ]),
  },
  trumpetSwing: {
    label: "Trumpet: swing lick",
    length: 6,
    play: (b, t0) =>
      playPhrase(b, t0, 120, [
        [0, 0.5, 70, 0.75],
        [SWING, 0.36, 72, 0.7],
        [1, 0.5, 74, 0.78],
        [1 + SWING, 0.36, 77, 0.82],
        [2, 1, 79, 0.9, { scoop: true }],
        [3 + SWING, 0.36, 77, 0.7],
        [4, 0.5, 74, 0.72],
        [4 + SWING, 0.36, 72, 0.68],
        [5, 0.5, 70, 0.7],
        [5 + SWING, 0.36, 67, 0.66],
        [6, 1.6, 65, 0.8, { fall: true }],
      ]),
  },
  trumpetRange: {
    label: "Trumpet: range",
    length: 6,
    play: (b, t0) => [58, 63, 68, 73, 78, 84].forEach((m, i) => trumpet(b.ctx, b.trumpet, m, t0 + i * 0.85, 0.7, 0.7)),
  },
  epianoChords: {
    label: "E-piano: ii-V-I",
    length: 12,
    play: (b, t0) => {
      const seq: [number[], number][] = [
        [[58, 62, 65, 69], 1.3],
        [[58, 62, 64, 69], 1.3],
        [[57, 60, 64, 67], 2.4],
        [[54, 58, 61, 65], 1.6],
        [[54, 58, 60, 65], 1.6],
        [[53, 56, 60, 63], 3],
      ];
      let t = t0;
      for (const [notes, dur] of seq) {
        chord(b, b.band, notes, t, dur * 0.95, 0.55);
        t += dur;
      }
    },
  },
  epianoMelody: {
    label: "E-piano: held melody",
    length: 7,
    play: (b, t0) => {
      const notes: [number, number, number, number][] = [
        [65, 0, 0.3, 0.6],
        [69, 0.33, 0.25, 0.55],
        [72, 0.66, 0.9, 0.75],
        [70, 1.7, 0.2, 0.5],
        [69, 2, 0.2, 0.55],
        [67, 2.33, 0.6, 0.6],
        [65, 3.2, 2.2, 0.7],
      ];
      for (const [m, at, hold, v] of notes) {
        const held: Held = epiano(b.ctx, b.piano, m, t0 + at, v);
        held.release(t0 + at + hold);
      }
    },
  },
  bass: {
    label: "Bass: walking",
    length: 9,
    play: (b, t0) =>
      walking.slice(0, 4).forEach((bar, i) =>
        bar.forEach((m, j) => bass(b.ctx, b.band, m, t0 + (i * 4 + j) * 0.5, j % 2 === 0 ? 0.8 : 0.7, 0.46)),
      ),
  },
  ride: {
    label: "Ride",
    length: 8,
    play: (b, t0) => {
      const at = clock(120);
      for (let bar = 0; bar < 2; bar++)
        for (const [beatIn, and, v] of [[0, false, 0.55], [1, false, 0.65], [1, true, 0.42], [2, false, 0.55], [3, false, 0.65], [3, true, 0.42]] as const)
          ride(b.ctx, b.band, t0 + at(bar, beatIn, and), v);
    },
  },
  hat: {
    label: "Hi-hat (foot)",
    length: 4,
    play: (b, t0) => [0.5, 1.5, 2.5, 3.5].forEach((x) => hat(b.ctx, b.band, t0 + x, 0.6)),
  },
  brushes: {
    label: "Brushes",
    length: 5,
    play: (b, t0) => {
      brushSweep(b.ctx, b.band, t0, 1.9, 0.6);
      [0.5, 1.5].forEach((x) => brushTap(b.ctx, b.band, t0 + x, 0.55));
      brushSweep(b.ctx, b.band, t0 + 2, 1.9, 0.6);
      [2.5, 3.32, 3.5].forEach((x, i) => brushTap(b.ctx, b.band, t0 + x, i === 1 ? 0.3 : 0.6));
    },
  },
  kick: {
    label: "Kick (feathered)",
    length: 3,
    play: (b, t0) => [0, 0.5, 1, 1.5].forEach((x, i) => kick(b.ctx, b.band, t0 + x, i === 0 ? 0.7 : 0.35)),
  },
  snap: {
    label: "Snaps: count-in",
    length: 3,
    play: (b, t0) => [0, 0.5, 1, 1.5].forEach((x) => snap(b.ctx, b.band, t0 + x, 0.75)),
  },
  glass: {
    label: "Glass clink",
    length: 4,
    play: (b, t0) => {
      glassClink(b.ctx, b.band, t0, 0.6);
      glassClink(b.ctx, b.band, t0 + 1.5, 0.9);
    },
  },
};

const MELODY_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const MELODY_NOTES = [65, 67, 69, 70, 72, 74, 75, 77];

function initAuditionPage(root: HTMLElement): void {
  let mixer: Mixer | undefined;
  let ctx: AudioContext | undefined;
  let rain: ReturnType<typeof createRain> | undefined;
  let room: ReturnType<typeof createRoomTone> | undefined;
  let crowd: ReturnType<typeof createCrowd> | undefined;
  let grooveTimer: number | undefined;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", parent: HTMLElement = root): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.textContent = text;
    parent.append(e);
    return e;
  };

  el("h1", "Last Set: sound check");
  const start = el("button", "Start audio");
  start.className = "start";
  const status = el("p", "Audio is off.");
  status.className = "status";

  el("h2", "Instruments");
  const grid = el("div");
  grid.className = "grid";
  for (const demo of Object.values(demos)) {
    const button = el("button", demo.label, grid);
    button.addEventListener("click", () => {
      if (mixer && ctx) demo.play(mixer, ctx.currentTime + 0.08);
    });
  }

  el("h2", "Band");
  const grooveButton = el("button", "Play the groove");
  const stopGroove = (): void => {
    if (grooveTimer !== undefined) clearInterval(grooveTimer);
    grooveTimer = undefined;
    grooveButton.textContent = "Play the groove";
  };
  grooveButton.addEventListener("click", () => {
    if (!mixer || !ctx) return;
    if (grooveTimer !== undefined) {
      stopGroove();
      return;
    }
    const { length, events } = groove();
    const m = mixer;
    const c = ctx;
    const t0 = c.currentTime + 0.1;
    let next = 0;
    grooveButton.textContent = "Stop the groove";
    grooveTimer = window.setInterval(() => {
      while (next < events.length && t0 + events[next].at < c.currentTime + 0.15) {
        events[next].play(m, t0 + events[next].at);
        next++;
      }
      if (c.currentTime > t0 + length) stopGroove();
    }, 25);
  });

  el("h2", "Room");
  const toggles = el("div");
  toggles.className = "row";
  const toggle = (label: string, onChange: (on: boolean) => void): void => {
    const wrap = el("label", "", toggles);
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => onChange(box.checked));
    wrap.append(box, ` ${label}`);
  };
  toggle("Rain", (on) => rain?.setLevel(on ? 1 : 0));
  toggle("Rain at the open door", (on) => rain?.setMuffle(on ? 0 : 1));
  toggle("Room tone", (on) => room?.setLevel(on ? 1 : 0));
  toggle("Crowd", (on) => crowd?.setLevel(on ? 1 : 0));

  const sliders = el("div");
  sliders.className = "sliders";
  const slider = (label: string, value: number, onInput: (v: number) => void): void => {
    const wrap = el("label", `${label} `, sliders);
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "1";
    range.step = "0.01";
    range.value = String(value);
    const readout = document.createElement("span");
    readout.textContent = value.toFixed(2);
    range.addEventListener("input", () => {
      readout.textContent = Number(range.value).toFixed(2);
      onInput(Number(range.value));
    });
    wrap.append(range, readout);
  };
  slider("Memory", 0, (v) => mixer?.setMemory(v, undefined, 0.4));
  slider("Muffle", 0, (v) => mixer?.setMuffle(v, undefined, 0.3));
  slider("Volume", 0.8, (v) => mixer?.setVolume(v));

  el("h2", "Your piano");
  el("p", "Hold A S D F G H J K to play the e-piano (F mixolydian, low to high).");

  const held = new Map<string, Held>();
  window.addEventListener("keydown", (e) => {
    const i = MELODY_KEYS.indexOf(e.key.toLowerCase());
    if (i < 0 || e.repeat || !mixer || !ctx || held.has(e.key.toLowerCase())) return;
    held.set(e.key.toLowerCase(), epiano(ctx, mixer.piano, MELODY_NOTES[i], ctx.currentTime, 0.7));
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    const note = held.get(key);
    if (!note || !ctx) return;
    note.release(ctx.currentTime);
    held.delete(key);
  });

  start.addEventListener("click", async () => {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "interactive" });
      mixer = createMixer(ctx);
      mixer.setVolume(0.8);
      rain = createRain(ctx, mixer.ambience);
      room = createRoomTone(ctx, mixer.ambience);
      crowd = createCrowd(ctx, mixer.ambience);
      window.setInterval(() => {
        if (ctx) status.textContent = `Audio is on. ${ctx.sampleRate} Hz, live voices: ${liveVoices()}`;
      }, 500);
    }
    await ctx.resume();
    start.textContent = "Audio is on";
    start.disabled = true;
  });
}

const root = typeof document !== "undefined" ? document.getElementById("audition") : null;
if (root) initAuditionPage(root);
