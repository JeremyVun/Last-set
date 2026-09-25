import type { Line, Note, Song } from '../story.ts';
import { lastSet } from '../story.ts';
import { Band, type Section } from '../audio/band.ts';
import { midi } from '../audio/theory.ts';
import type { Held, Mixer } from '../audio/instruments.ts';

export interface Played {
  time: number;
  end: number | null;
  index: number;
  midi: number;
}

export interface Block {
  start: number;
  split: number;
  end: number;
  who: 'call' | 'head' | 'goodbye' | 'intro';
  label: [string, string];
}

interface Window {
  exchange: number;
  start: number;
  end: number;
  callStart: number;
  call: Note[];
  kind: 'answer' | 'ending' | 'last' | 'none';
  line?: Line;
  scored: boolean;
}

interface Cue {
  time: number;
  run: () => void;
  done?: boolean;
}

export interface Score {
  q: number;
  timing: number;
  space: number;
  answer: number;
  count: number;
  feedback: string;
}

export interface PerformanceHooks {
  hint(text: string | null): void;
  line(line: Line, clarity: number): void;
  feedback(text: string, good: boolean): void;
  warmth(value: number): void;
  keyLit(index: number, down: boolean, m: number): void;
  finished(result: SongResult): void;
}

export interface SongResult {
  song: Song;
  scores: Score[];
  warmth: number;
  ending?: 'answered' | 'ring';
  herEnding?: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class Performance {
  band: Band;
  song: Song;
  keys: number[];
  played: Played[] = [];
  blocks: Block[] = [];
  warmth: number;
  scores: Score[] = [];
  private windows: Window[] = [];
  private cues: Cue[] = [];
  private held = new Map<number, { voice: Held; note: Played }>();
  private ctx: AudioContext;
  private hooks: PerformanceHooks;
  private endTime = 0;
  private finished = false;
  private herEnding = false;
  private endingChoice: 'answered' | 'ring' | undefined;
  latency: number;

  constructor(ctx: AudioContext, mixer: Mixer, song: Song, hooks: PerformanceHooks) {
    this.ctx = ctx;
    this.song = song;
    this.hooks = hooks;
    this.keys = song.keys.map(midi);
    this.warmth = song.id === 'lastset' ? 0.3 : 0.12;
    this.latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const sections = this.arrange();
    this.band = new Band(ctx, mixer, song, sections);
  }

  private arrange(): Section[] {
    const s = this.song;
    const out: Section[] = [];
    const formAt = (i: number) => s.form[((i % s.form.length) + s.form.length) % s.form.length];
    out.push({ kind: 'countin', bar: 0, bars: 1, chords: [formAt(-s.introBars)], rhythm: 'tacet' });
    let bar = 1;
    const introChords = Array.from({ length: s.introBars }, (_, i) => formAt(i - s.introBars));
    out.push({ kind: 'intro', bar, bars: s.introBars, chords: introChords, rhythm: 'play' });
    bar += s.introBars;
    let formBar = 0;
    s.exchanges.forEach((ex, i) => {
      const callBars = ex.callBars ?? 2;
      const chords = Array.from({ length: 4 }, (_, k) => formAt(formBar + k));
      out.push({ kind: 'call', bar, bars: callBars, chords: chords.slice(0, callBars), rhythm: 'play', trumpet: ex.call, exchange: i });
      if (callBars < 4) out.push({ kind: 'window', bar: bar + callBars, bars: 4 - callBars, chords: chords.slice(callBars), rhythm: 'play', exchange: i });
      bar += 4;
      formBar += 4;
    });
    if (s.ending === 'player') {
      out.push({ kind: 'ending', bar, bars: 2, chords: [s.finalChord], rhythm: 'hold' });
    } else if (s.ending === 'nell') {
      out.push({ kind: 'ending', bar, bars: 2, chords: [s.finalChord], rhythm: 'hold', trumpet: s.tag });
    } else if (s.ending === 'stop') {
      out.push({ kind: 'ending', bar, bars: 1, chords: [formAt(formBar)], rhythm: 'play', trumpet: s.tag });
      out.push({ kind: 'ending', bar: bar + 1, bars: 1, chords: [s.finalChord], rhythm: 'stop' });
    } else if (s.head && s.goodbye) {
      out.push({ kind: 'head', bar, bars: 7, chords: s.head.chords.slice(0, 7), rhythm: 'play', trumpet: s.head.melody });
      out.push({ kind: 'window', bar: bar + 7, bars: 2, chords: [s.head.chords[7]], rhythm: 'hold' });
      out.push({ kind: 'goodbye', bar: bar + 9, bars: 3, chords: [s.finalChord], rhythm: 'tacet', trumpet: s.goodbye });
      out.push({ kind: 'last', bar: bar + 12, bars: 3, chords: [s.finalChord], rhythm: 'tacet' });
    }
    return out;
  }

  start() {
    const b = this.band;
    b.start(this.ctx.currentTime + 0.4);
    const s = this.song;
    const secs = b.sections;
    const t = (bar: number) => b.barTime(bar);
    const introHint = s.introHint;
    this.cue(t(0), () => this.hooks.hint(introHint ?? null));
    const intro = secs.find((x) => x.kind === 'intro')!;
    this.blocks.push({ start: t(0), split: t(intro.bar + intro.bars), end: t(intro.bar + intro.bars), who: 'intro', label: ['Count in', ''] });
    s.exchanges.forEach((ex, i) => {
      const call = secs.find((x) => x.kind === 'call' && x.exchange === i)!;
      const callBars = ex.callBars ?? 2;
      const start = t(call.bar), split = t(call.bar + callBars), end = t(call.bar + 4);
      this.blocks.push({ start, split, end, who: 'call', label: ['Nell', callBars < 4 ? 'You' : ''] });
      if (ex.hint) this.cue(start, () => this.hooks.hint(ex.hint!));
      else if (i > 0) this.cue(start, () => this.hooks.hint(null));
      if (ex.answerHint) this.cue(split, () => this.hooks.hint(ex.answerHint!));
      this.windows.push({ exchange: i, start: split, end, callStart: start, call: ex.call, kind: callBars < 4 ? 'answer' : 'none', line: ex.line, scored: false });
    });
    const last = secs[secs.length - 1];
    this.endTime = t(last.bar + last.bars);
    if (s.ending === 'player') {
      const lastWin = this.windows[this.windows.length - 1];
      this.cue(lastWin.end, () => this.hooks.hint(null));
    }
    if (s.head) {
      const head = secs.find((x) => x.kind === 'head')!;
      const win = secs.find((x) => x.kind === 'window' && x.exchange === undefined)!;
      const bye = secs.find((x) => x.kind === 'goodbye')!;
      const lastWin = secs.find((x) => x.kind === 'last')!;
      this.blocks.push({ start: t(head.bar), split: t(win.bar), end: t(win.bar + win.bars), who: 'head', label: ['Nell', 'The ending'] });
      this.blocks.push({ start: t(bye.bar), split: t(lastWin.bar), end: t(lastWin.bar + lastWin.bars), who: 'goodbye', label: ['Nell', ''] });
      this.cue(t(head.bar), () => this.hooks.hint(lastSet.headHint));
      this.cue(t(win.bar) - this.band.spb * 2, () => this.hooks.hint(lastSet.endingHint));
      this.cue(t(bye.bar), () => this.hooks.hint(null));
      this.windows.push({ exchange: -1, start: t(win.bar), end: t(win.bar + win.bars), callStart: t(head.bar), call: s.head.melody, kind: 'ending', scored: false });
      this.windows.push({ exchange: -2, start: t(lastWin.bar), end: t(lastWin.bar + lastWin.bars), callStart: t(bye.bar), call: s.goodbye!, kind: 'last', scored: false });
    } else {
      const endSec = secs.filter((x) => x.kind === 'ending');
      if (endSec.length) this.blocks.push({ start: t(endSec[0].bar), split: this.endTime, end: this.endTime, who: 'call', label: ['', ''] });
    }
    this.applyWarmth();
  }

  private cue(time: number, run: () => void) {
    this.cues.push({ time, run });
  }

  now() {
    return this.ctx.currentTime - this.latency;
  }

  press(index: number) {
    if (this.finished || this.held.has(index)) return;
    const m = this.keys[index];
    const voice = this.band.player(m, 0.8);
    const note: Played = { time: this.now(), end: null, index, midi: m };
    this.played.push(note);
    this.held.set(index, { voice, note });
    this.hooks.keyLit(index, true, m);
  }

  release(index: number) {
    const h = this.held.get(index);
    if (!h) return;
    h.voice.release(this.ctx.currentTime);
    h.note.end = this.now();
    this.held.delete(index);
    this.hooks.keyLit(index, false, h.note.midi);
  }

  releaseAll() {
    for (const i of [...this.held.keys()]) this.release(i);
  }

  currentBlock(time = this.now()) {
    let found: Block | null = null;
    for (const b of this.blocks) if (time >= b.start - 0.05) found = b;
    return found;
  }

  update() {
    if (this.finished) return;
    const now = this.now();
    for (const c of this.cues) {
      if (!c.done && now >= c.time) {
        c.done = true;
        c.run();
      }
    }
    for (const w of this.windows) {
      if (!w.scored && now >= w.end + 0.03) {
        w.scored = true;
        this.score(w);
      }
    }
    if (now >= this.endTime + (this.song.ending === 'stop' ? 1.2 : 2.2)) {
      this.finished = true;
      this.releaseAll();
      this.hooks.finished({ song: this.song, scores: this.scores, warmth: this.warmth, ending: this.endingChoice, herEnding: this.herEnding });
    }
  }

  stop() {
    this.finished = true;
    this.releaseAll();
    this.band.stop();
  }

  private notesIn(a: number, b: number) {
    return this.played.filter((p) => p.time >= a && p.time < b);
  }

  private score(w: Window) {
    const lead = 0.1;
    const notes = this.notesIn(w.start - lead, w.end + 0.02);
    if (w.kind === 'last') {
      this.endingChoice = notes.length > 0 ? 'answered' : 'ring';
      return;
    }
    if (w.kind === 'ending') {
      const last3 = notes.slice(-3);
      const homes = this.song.home.map((i) => this.keys[i] % 12);
      const endsHome = last3.length > 0 && homes.includes(last3[last3.length - 1].midi % 12);
      this.herEnding = last3.length === 3 && last3[0].midi > last3[1].midi && last3[1].midi > last3[2].midi && endsHome;
      const s = this.evaluate(w, notes);
      this.scores.push(s);
      this.warmth = clamp01(this.warmth + (s.q - 0.4) * 0.5);
      this.applyWarmth();
      this.hooks.feedback(notes.length === 0 ? 'No ending.' : endsHome ? 'That sounds finished.' : s.feedback, endsHome);
      return;
    }
    if (w.kind === 'none') {
      if (w.line) this.hooks.line(w.line, 0.5 + this.warmth * 0.5);
      return;
    }
    const s = this.evaluate(w, notes);
    const talkedOver = this.notesIn(w.callStart + 0.2, w.start - lead).length;
    if (talkedOver > 3 && (this.song.exchanges[w.exchange]?.callBars ?? 2) === 2) {
      s.q *= 0.75;
      s.feedback = 'Wait for her phrase to finish.';
    }
    this.scores.push(s);
    this.warmth = clamp01(this.warmth + (s.q - 0.42) * 0.48);
    this.applyWarmth();
    this.hooks.feedback(s.feedback, s.q >= 0.62);
    if (w.line) this.hooks.line(w.line, clamp01(0.22 + s.q * 1.05));
  }

  evaluate(w: Window, notes: Played[]): Score {
    const spb = this.band.spb;
    const swing = this.song.swing;
    const [lo, hi] = this.song.space;
    const n = notes.length;
    if (n === 0) return { q: 0, timing: 0, space: 0, answer: 0, count: 0, feedback: 'No answer.' };

    const grid = this.song.feel === 'ballad' ? [0, 1 / 3, 0.5, 2 / 3] : [0, swing];
    let timing = 0, drift = 0;
    for (const p of notes) {
      const beat = (p.time - this.band.startTime) / spb;
      const whole = Math.floor(beat);
      let best = Infinity, signed = 0;
      for (const g of [...grid, 1]) {
        const d = (beat - (whole + g)) * spb;
        if (Math.abs(d) < Math.abs(best)) {
          best = d;
          signed = d;
        }
      }
      const e = Math.abs(best);
      timing += e < 0.05 ? 1 : e > 0.15 ? 0 : 1 - (e - 0.05) / 0.1;
      drift += signed;
    }
    timing /= n;
    drift /= n;

    const space = n < lo ? n / lo : n > hi ? Math.max(0, 1 - (n - hi) / hi) : 1;

    const slots = (times: number[], origin: number) => new Set(times.map((x) => Math.round(((x - origin) / spb) * 2)));
    const callSlots = slots(w.call.map((c) => this.band.beatTime(0) + c.beat * spb), this.band.beatTime(0));
    const mySlots = slots(notes.map((p) => p.time), w.start);
    let shared = 0;
    for (const x of mySlots) if (callSlots.has(x) || callSlots.has(x - 1) || callSlots.has(x + 1)) shared++;
    const rhythm = shared / Math.max(callSlots.size, mySlots.size);
    const dir = (a: number[]) => a.slice(1).map((x, i) => Math.sign(x - a[i]));
    const cd = dir(w.call.map((c) => midi(c.pitch)));
    const md = dir(notes.map((p) => p.midi));
    let same = 0;
    const len = Math.min(cd.length, md.length);
    for (let i = 0; i < len; i++) if (cd[i] === md[i]) same++;
    const contour = len > 0 ? same / len : 0;
    const echo = 0.6 * rhythm + 0.4 * contour;
    const homes = this.song.home.map((i) => this.keys[i] % 12);
    const lastPc = notes[n - 1].midi % 12;
    const fifth = (this.keys[this.song.home[0]] + 7) % 12;
    const resolve = homes.includes(lastPc) ? 1 : lastPc === fifth ? 0.6 : 0.2;
    const answer = Math.max(0.3, echo, resolve);

    const q = clamp01(0.4 * timing + 0.25 * space + 0.35 * answer);
    let feedback: string;
    if (n > hi) feedback = 'Too many notes. Leave some space.';
    else if (n < lo && n <= 1) feedback = 'Try a few more notes.';
    else if (timing < 0.5) feedback = drift < 0 ? 'A little early. Wait for the beat.' : 'A little late. Stay with the beat.';
    else if (echo >= 0.6 && echo >= resolve) feedback = 'Good answer. You echoed her.';
    else if (resolve === 1) feedback = 'Good answer. You ended on home.';
    else if (q >= 0.62) feedback = 'Good answer.';
    else feedback = 'Try ending on a marked key.';
    return { q, timing, space, answer, count: n, feedback };
  }

  private applyWarmth() {
    const w = this.warmth;
    const ss = (a: number, b: number) => clamp01((w - a) / (b - a));
    this.band.setLayers({ bass: ss(0.12, 0.3), drums: ss(0.28, 0.48), crowd: ss(0.5, 0.78) });
    this.band.mixer.setMemory(w, this.ctx.currentTime);
    this.hooks.warmth(w);
  }
}
