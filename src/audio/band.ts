import type { Feel, Note, Song } from '../story.ts';
import { chord, midi, nearest, voicing } from './theory.ts';
import * as I from './instruments.ts';

export type SectionKind = 'countin' | 'intro' | 'call' | 'window' | 'head' | 'ending' | 'goodbye' | 'last';
export type Rhythm = 'play' | 'tacet' | 'hold' | 'stop';

export interface Section {
  kind: SectionKind;
  bar: number;
  bars: number;
  chords: string[];
  rhythm: Rhythm;
  trumpet?: Note[];
  exchange?: number;
}

type Ev =
  | { t: number; k: 'bass'; m: number; d: number; v: number }
  | { t: number; k: 'comp'; ms: number[]; d: number; v: number }
  | { t: number; k: 'ride' | 'hat' | 'kick' | 'tap' | 'snap'; v: number }
  | { t: number; k: 'sweep'; d: number; v: number }
  | { t: number; k: 'horn'; m: number; d: number; v: number; fx?: 'scoop' | 'fall' };

export interface HornNote {
  time: number;
  end: number;
  midi: number;
}

export interface Layers {
  bass: number;
  drums: number;
  crowd: number;
}

const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

export class Band {
  readonly ctx: AudioContext;
  readonly mixer: I.Mixer;
  song: Song;
  sections: Section[] = [];
  spb: number;
  startTime = 0;
  horn: HornNote[] = [];
  private events: Ev[] = [];
  private next = 0;
  private timer = 0;
  private stopped = false;
  private bassBus: GainNode;
  private drumBus: GainNode;
  private compBus: GainNode;
  private pulseBus: GainNode;
  private out: GainNode;
  private crowd: I.Level;

  constructor(ctx: AudioContext, mixer: I.Mixer, song: Song, sections: Section[]) {
    this.ctx = ctx;
    this.mixer = mixer;
    this.song = song;
    this.sections = sections;
    this.spb = 60 / song.bpm;
    this.out = ctx.createGain();
    this.out.connect(mixer.band);
    const bus = (g: number) => {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(this.out);
      return n;
    };
    this.bassBus = bus(0);
    this.drumBus = bus(0);
    this.compBus = bus(0.9);
    this.pulseBus = bus(0.7);
    this.crowd = I.createCrowd(ctx, mixer.ambience);
    this.build();
  }

  get totalBars() {
    const last = this.sections[this.sections.length - 1];
    return last.bar + last.bars;
  }

  beatTime(beat: number) {
    const whole = Math.floor(beat + 1e-6);
    const frac = beat - whole;
    const swung = Math.abs(frac - 0.5) < 1e-4 ? this.song.swing : frac;
    return this.startTime + (whole + swung) * this.spb;
  }

  barTime(bar: number) {
    return this.startTime + bar * 4 * this.spb;
  }

  beatAt(time: number) {
    return (time - this.startTime) / this.spb;
  }

  start(at: number) {
    this.startTime = at;
    for (const e of this.events) if (e.k === 'horn') this.horn.push({ time: this.beatTime(e.t), end: this.beatTime(e.t + e.d), midi: e.m });
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop(fade = 1.5) {
    this.stopped = true;
    window.clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, fade / 4);
    this.crowd.setLevel(0, now);
    window.setTimeout(() => this.out.disconnect(), fade * 1000 + 800);
  }

  setLayers(l: Layers) {
    const now = this.ctx.currentTime;
    this.bassBus.gain.setTargetAtTime(l.bass * 0.95, now, 0.4);
    this.drumBus.gain.setTargetAtTime(l.drums * 0.85, now, 0.5);
    this.pulseBus.gain.setTargetAtTime(0.7 - l.drums * 0.35, now, 0.5);
    this.crowd.setLevel(l.crowd * 0.8, now);
  }

  player(m: number, velocity = 0.8): I.Held {
    return I.epiano(this.ctx, this.mixer.piano, m, this.ctx.currentTime, velocity);
  }

  private tick() {
    if (this.stopped) return;
    const horizon = this.ctx.currentTime + 0.2;
    while (this.next < this.events.length) {
      const e = this.events[this.next];
      const time = this.beatTime(e.t);
      if (time > horizon) break;
      this.next++;
      if (time < this.ctx.currentTime - 0.05) continue;
      this.play(e, time);
    }
    if (this.next >= this.events.length) window.clearInterval(this.timer);
  }

  private play(e: Ev, time: number) {
    const { ctx } = this;
    const dur = (d: number) => this.beatTime(e.t + d) - time;
    switch (e.k) {
      case 'bass':
        I.bass(ctx, this.bassBus, e.m, time, e.v, dur(e.d));
        break;
      case 'comp':
        e.ms.forEach((m, i) => I.epiano(ctx, this.compBus, m, time + i * (this.song.feel === 'ballad' ? 0.018 : 0.004), e.v * (i === e.ms.length - 1 ? 1.05 : 0.9), dur(e.d)));
        break;
      case 'ride':
        I.ride(ctx, this.drumBus, time, e.v);
        break;
      case 'hat':
        I.hat(ctx, this.pulseBus, time, e.v);
        break;
      case 'kick':
        I.kick(ctx, this.drumBus, time, e.v);
        break;
      case 'tap':
        I.brushTap(ctx, this.drumBus, time, e.v);
        break;
      case 'sweep':
        I.brushSweep(ctx, this.drumBus, time, dur(e.d), e.v);
        break;
      case 'snap':
        I.snap(ctx, this.out, time, e.v);
        break;
      case 'horn':
        I.trumpet(ctx, this.mixer.trumpet, e.m, time, dur(e.d), e.v, { scoop: e.fx === 'scoop', fall: e.fx === 'fall', vibrato: e.d >= 1.5 ? 1 : 0.4 });
        break;
    }
  }

  private build() {
    const feel: Feel = this.song.feel;
    const r = rand(this.song.bpm * 31 + this.song.title.length);
    let center = 62;
    let prevBass = 40;
    const ev = this.events;
    const allBars: { bar: number; chord: string; next: string; rhythm: Rhythm; first: boolean; kind: SectionKind }[] = [];
    for (const s of this.sections) {
      for (let b = 0; b < s.bars; b++) allBars.push({ bar: s.bar + b, chord: s.chords[b] ?? s.chords[s.chords.length - 1], next: '', rhythm: s.rhythm, first: b === 0, kind: s.kind });
      if (s.trumpet)
        for (const n of s.trumpet) {
          const m = midi(n.pitch);
          const v = 0.62 + Math.min(0.2, Math.max(-0.1, (m - 70) * 0.012)) + (n.dur >= 1.5 ? 0.04 : 0);
          ev.push({ t: s.bar * 4 + n.beat, k: 'horn', m, d: n.dur, v, fx: n.fx });
        }
    }
    allBars.forEach((b, i) => (b.next = allBars[i + 1]?.chord ?? b.chord));

    for (const b of allBars) {
      const t0 = b.bar * 4;
      if (b.kind === 'countin') {
        for (let k = 0; k < 4; k++) ev.push({ t: t0 + k, k: 'snap', v: k === 0 ? 0.7 : 0.55 });
        continue;
      }
      if (b.rhythm === 'tacet') continue;
      const c = chord(b.chord);
      const root = nearest(c.root, prevBass, 31, 50);
      if (b.rhythm === 'hold' || b.rhythm === 'stop') {
        if (!b.first) continue;
        const short = b.rhythm === 'stop';
        const v = voicing(b.chord, center);
        ev.push({ t: t0, k: 'comp', ms: v, d: short ? 0.35 : 7, v: short ? 0.62 : 0.5 });
        ev.push({ t: t0, k: 'bass', m: nearest(c.root, 36, 28, 43), d: short ? 0.35 : 6, v: 0.85 });
        ev.push({ t: t0, k: 'ride', v: short ? 0.75 : 0.62 });
        ev.push({ t: t0, k: 'kick', v: short ? 0.6 : 0.35 });
        if (!short) for (let k = 0; k < 6; k++) ev.push({ t: t0 + 1 + k * 0.5, k: 'sweep', d: 0.5, v: 0.1 * (1 - k / 6) });
        continue;
      }

      // Bass
      const target = nearest(chord(b.next).root, root, 31, 50);
      if (feel === 'ballad') {
        ev.push({ t: t0, k: 'bass', m: root, d: 1.9, v: 0.8 });
        const second = r() > 0.4 ? root + c.fifth : target + (target > root ? -1 : 1);
        ev.push({ t: t0 + 2, k: 'bass', m: clampBass(second), d: 1.9, v: 0.7 });
        prevBass = root;
      } else {
        const line = [root];
        const up = target >= root;
        const step2 = r() > 0.5 ? root + c.third : root + (c.scale[1] ?? 2);
        const step3 = r() > 0.35 ? root + c.fifth : root + c.third + (up ? 2 : -1);
        line.push(clampBass(step2), clampBass(step3));
        const approach = r() > 0.3 ? target + (line[2] > target ? 1 : -1) : target + (up ? -2 : 2);
        line.push(clampBass(approach));
        line.forEach((m, k) => ev.push({ t: t0 + k, k: 'bass', m, d: feel === 'fast' ? 0.85 : 0.95, v: k === 0 ? 0.82 : 0.72 }));
        prevBass = line[3];
      }

      // Drums
      if (feel === 'ballad') {
        ev.push({ t: t0, k: 'sweep', d: 2, v: 0.32 });
        ev.push({ t: t0 + 2, k: 'sweep', d: 2, v: 0.3 });
        ev.push({ t: t0 + 1, k: 'tap', v: 0.26 });
        ev.push({ t: t0 + 3, k: 'tap', v: 0.28 });
        ev.push({ t: t0 + 1, k: 'hat', v: 0.3 });
        ev.push({ t: t0 + 3, k: 'hat', v: 0.3 });
        if (r() > 0.6) ev.push({ t: t0 + 3.5, k: 'tap', v: 0.14 });
      } else {
        const loud = feel === 'fast' ? 1.1 : 1;
        for (const [bt, v] of [[0, 0.46], [1, 0.58], [1.5, 0.3], [2, 0.46], [3, 0.58], [3.5, 0.3]] as const) ev.push({ t: t0 + bt, k: 'ride', v: v * loud });
        ev.push({ t: t0 + 1, k: 'hat', v: 0.5 });
        ev.push({ t: t0 + 3, k: 'hat', v: 0.5 });
        for (let k = 0; k < 4; k++) ev.push({ t: t0 + k, k: 'kick', v: 0.16 });
        const tapP = feel === 'fast' ? 0.3 : 0.16;
        for (const bt of [1.5, 2.5, 3.5]) if (r() < tapP) ev.push({ t: t0 + bt, k: 'tap', v: 0.2 + r() * 0.15 });
        if (feel === 'modal' && r() > 0.7) ev.push({ t: t0 + 3.5, k: 'tap', v: 0.3 });
      }

      // Comping
      const v1 = voicing(b.chord, center);
      const vNext = voicing(b.next, center);
      center = v1.reduce((s, n) => s + n, 0) / v1.length;
      const pats: Record<Feel, [number, number, boolean?][][]> = {
        swing: [[[0, 0.9]], [[1.5, 0.45], [3, 0.7]], [[0, 0.45], [1.5, 1.4]], [[2.5, 0.4], [3.5, 1.2, true]], [[1, 0.5], [2.5, 0.9]]],
        fast: [[[0, 0.3], [1.5, 0.3]], [[1, 0.3], [2.5, 0.4]], [[0.5, 0.3], [3.5, 0.5, true]], [[2, 0.4]]],
        modal: [[[0, 2.2]], [[1.5, 0.5], [2.5, 1.2]], [[0, 0.6], [3.5, 1.2, true]], [[2.5, 1.4]]],
        ballad: [[[0, 3.7]], [[0, 1.9], [2, 1.9]], [[0, 2.6], [3, 0.9]]],
      };
      const pick = pats[feel][Math.floor(r() * pats[feel].length)];
      const base = feel === 'ballad' ? 0.36 : feel === 'fast' ? 0.42 : 0.4;
      for (const [bt, d, push] of pick) ev.push({ t: t0 + bt, k: 'comp', ms: push ? vNext : v1, d, v: base + r() * 0.08 });
    }
    ev.sort((a, b) => a.t - b.t);
  }
}

function clampBass(m: number) {
  while (m > 52) m -= 12;
  while (m < 28) m += 12;
  return m;
}
