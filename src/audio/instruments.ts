export interface Held {
  release(time: number): void;
}

export interface Mixer {
  ctx: BaseAudioContext;
  band: AudioNode;
  trumpet: AudioNode;
  piano: AudioNode;
  ambience: AudioNode;
  master: GainNode;
  setMemory(amount: number, time?: number, seconds?: number): void;
  setMuffle(amount: number, time?: number, seconds?: number): void;
  setVolume(v: number): void;
}

export interface Level {
  setLevel(v: number, time?: number, seconds?: number): void;
}

export interface TrumpetOptions {
  scoop?: boolean;
  fall?: boolean;
  vibrato?: number;
  legato?: boolean;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const clamp01 = (x: number): number => clamp(Number.isFinite(x) ? x : 0, 0, 1);
const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const expRand = (): number => -Math.log(1 - Math.random());
const dyn = (v: number, floor = 0.1): number => floor + (1 - floor) * v ** 1.4;

let liveCount = 0;

/** One-shot voices whose nodes are still connected. Settles back to zero when nothing is sounding. */
export function liveVoices(): number {
  return liveCount;
}

const caches = new WeakMap<BaseAudioContext, Map<string, unknown>>();

function cached<T>(ctx: BaseAudioContext, key: string, make: () => T): T {
  let map = caches.get(ctx);
  if (!map) {
    map = new Map();
    caches.set(ctx, map);
  }
  if (!map.has(key)) map.set(key, make());
  return map.get(key) as T;
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cached(ctx, "noise", () => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 8), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  });
}

function periodic(ctx: BaseAudioContext, key: string, harmonics: number[]): PeriodicWave {
  return cached(ctx, key, () => {
    const imag = new Float32Array([0, ...harmonics]);
    return ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  });
}

const bassWave = (ctx: BaseAudioContext): PeriodicWave =>
  periodic(ctx, "bass", [1, 0.42, 0.17, 0.09, 0.05, 0.03, 0.015, 0.008]);

const brassWave = (ctx: BaseAudioContext): PeriodicWave =>
  periodic(ctx, "brass", Array.from({ length: 40 }, (_, i) => (i + 1) ** -0.9));

/** Owns every node of one note so the whole graph disconnects once its sources have ended. */
class Voice {
  private readonly nodes: AudioNode[] = [];
  private readonly stops = new Map<AudioScheduledSourceNode, number>();
  private pending = 0;

  constructor(readonly ctx: BaseAudioContext) {
    liveCount++;
  }

  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  gain(value = 0): GainNode {
    const g = this.add(this.ctx.createGain());
    g.gain.value = value;
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707, gainDb = 0): BiquadFilterNode {
    const f = this.add(this.ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.gain.value = gainDb;
    return f;
  }

  panner(pan: number): StereoPannerNode {
    const p = this.add(this.ctx.createStereoPanner());
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }

  osc(type: OscillatorType | PeriodicWave, freq: number, start: number, stop: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type);
    else o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    this.play(o, start, stop);
    return o;
  }

  noise(start: number, stop: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(this.ctx);
    s.loop = true;
    s.playbackRate.value = rate;
    this.play(s, start, stop, Math.random() * s.buffer.duration);
    return s;
  }

  constant(start: number, stop: number, value = 0): ConstantSourceNode {
    const c = this.ctx.createConstantSource();
    c.offset.value = value;
    this.play(c, start, stop);
    return c;
  }

  stopAt(time: number): void {
    for (const [src, planned] of this.stops) {
      if (time < planned) {
        src.stop(time);
        this.stops.set(src, time);
      }
    }
  }

  private play(src: AudioScheduledSourceNode, start: number, stop: number, offset = 0): void {
    this.add(src);
    const end = Math.max(stop, start + 0.01);
    this.stops.set(src, end);
    this.pending++;
    src.onended = () => {
      if (--this.pending === 0) this.dispose();
    };
    if (src instanceof AudioBufferSourceNode) src.start(start, offset);
    else src.start(start);
    src.stop(end);
  }

  private dispose(): void {
    liveCount--;
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
    this.stops.clear();
  }
}

function hit(p: AudioParam, t: number, peak: number, attack: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(0, t + attack, tau);
}

/** Lands an exponential decay started at `from` exactly on zero by `end`, so stopping the source cannot click. */
function landDecay(p: AudioParam, from: number, value: number, tau: number, end: number): void {
  const fadeAt = end - 0.12;
  if (fadeAt <= from) return;
  p.setValueAtTime(value * Math.exp(-(fadeAt - from) / tau), fadeAt);
  p.linearRampToValueAtTime(0, end - 0.01);
}

const METAL = [1, 1.483, 1.8, 2.546, 2.63, 3.897];

function metal(voice: Voice, base: number, start: number, stop: number): GainNode {
  const sum = voice.gain(1 / METAL.length);
  for (const r of METAL) voice.osc("square", base * r * rand(0.998, 1.002), start, stop).connect(sum);
  return sum;
}

export function epiano(
  ctx: BaseAudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  velocity: number,
  duration?: number,
): Held {
  const v = clamp01(velocity);
  const f = mtof(midi);
  const t = Math.max(0, time);
  const high = clamp((midi - 40) / 50, 0, 1);
  const tauLong = clamp(3.4 * 2 ** (-(midi - 48) / 15), 0.45, 5);
  const naturalEnd = Math.min(t + 0.45 + tauLong * 6, t + 14);
  const voice = new Voice(ctx);
  const far = t + 20;

  const peak = 0.27 * dyn(v, 0.12) * (1.05 - 0.2 * high);
  const attack = 0.0025 + 0.004 * (1 - v);
  const amp = voice.gain(0);
  const out = voice.gain(1);
  amp.connect(out).connect(dest);

  const mod = voice.osc("sine", f, t, far);
  const depth = voice.gain(0);
  mod.connect(depth);
  const index = (0.7 + 2.5 * v ** 1.2) * (1.25 - 0.7 * high);
  depth.gain.setValueAtTime(index * f, t);
  depth.gain.setTargetAtTime(index * f * 0.28, t, 0.07 + 0.06 * (1 - high));
  depth.gain.setTargetAtTime(index * f * 0.08, t + 0.35, tauLong * 0.7);

  const pan = clamp((midi - 62) / 40, -0.35, 0.35);
  const merger = voice.add(ctx.createChannelMerger(2));
  merger.connect(amp);
  const center = voice.osc("sine", f, t, far);
  depth.connect(center.frequency);
  center.connect(voice.gain(Math.min(1, 1 - pan))).connect(merger, 0, 0);
  center.connect(voice.gain(Math.min(1, 1 + pan))).connect(merger, 0, 1);
  for (const [cents, channel] of [[-4, 0], [4, 1]] as const) {
    const side = voice.osc("sine", f, t, far, cents);
    depth.connect(side.frequency);
    side.connect(voice.gain(0.3)).connect(merger, 0, channel);
  }

  const partial = Math.max(2, Math.round(3000 / f));
  if (partial * f < 7000) {
    const tine = voice.osc("sine", partial * f, t, t + 0.4);
    const tineGain = voice.gain(0);
    tine.connect(tineGain).connect(merger, 0, 0);
    tineGain.connect(merger, 0, 1);
    tineGain.gain.setValueAtTime(0.16 * (0.3 + 0.7 * v) * (1 - 0.5 * high), t);
    tineGain.gain.setTargetAtTime(0, t, 0.02);
  }

  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.setTargetAtTime(peak * 0.62, t + attack, 0.16 + 0.1 * (1 - high));
  amp.gain.setTargetAtTime(0, t + 0.4, tauLong);

  let releasedAt = Infinity;
  const release = (when: number, tau: number): void => {
    const r = Math.max(when, t + attack + 0.005);
    if (r >= releasedAt) return;
    releasedAt = r;
    out.gain.cancelScheduledValues(r);
    out.gain.setValueAtTime(1, r);
    out.gain.setTargetAtTime(0, r, tau);
    voice.stopAt(r + tau * 9);
  };
  if (duration === undefined) release(naturalEnd - 0.3, 0.06);
  else release(t + Math.max(0.02, duration), 0.07);
  return { release: (when: number) => release(when, 0.07) };
}

export function bass(
  ctx: BaseAudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  velocity: number,
  duration: number,
): void {
  const v = clamp01(velocity);
  const f = mtof(midi);
  const t = Math.max(0, time);
  const d = clamp(duration, 0.05, 8);
  const voice = new Voice(ctx);
  const stop = t + d + 0.3;

  const peak = 0.34 * dyn(v, 0.15);
  const out = voice.gain(1);
  out.connect(voice.panner(-0.12)).connect(dest);

  const string = voice.osc(bassWave(ctx), f, t, stop);
  string.detune.setValueAtTime(12 + 14 * v, t);
  string.detune.setTargetAtTime(0, t + 0.002, 0.03);

  const lp = voice.filter("lowpass", 400, 0.8);
  lp.frequency.setValueAtTime(380 + 1000 * v + 2.5 * f, t);
  lp.frequency.setTargetAtTime(150 + 2.2 * f, t + 0.004, 0.11);

  const amp = voice.gain(0);
  string.connect(lp).connect(amp).connect(out);
  const attack = 0.005;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.setTargetAtTime(peak * 0.6, t + attack, 0.08);
  if (d > 0.2) amp.gain.setTargetAtTime(0, t + 0.2, 1.5 - 0.6 * clamp((midi - 28) / 27, 0, 1));
  amp.gain.setTargetAtTime(0, t + d, 0.03);

  const noise = voice.noise(t, t + 0.15);
  const thump = voice.gain(0);
  noise.connect(voice.filter("bandpass", 110 + 0.8 * f, 1.1)).connect(thump).connect(out);
  hit(thump.gain, t, 3.2 * peak * (0.4 + 0.6 * v), 0.003, 0.018);
  const click = voice.gain(0);
  noise.connect(voice.filter("bandpass", 1500, 1.2)).connect(click).connect(out);
  hit(click.gain, t, 0.12 * peak * v, 0.001, 0.006);
}

export function trumpet(
  ctx: BaseAudioContext,
  dest: AudioNode,
  midi: number,
  time: number,
  duration: number,
  velocity: number,
  opts: TrumpetOptions = {},
): void {
  const v = clamp01(velocity);
  const f = mtof(midi);
  const t = Math.max(0, time);
  const d = clamp(duration, 0.06, 12);
  const scoop = opts.scoop === true;
  const fall = opts.fall === true;
  const legato = opts.legato === true;
  const vibrato = Math.max(0, opts.vibrato ?? 1);
  const voice = new Voice(ctx);

  const attack = (legato ? 0.012 : 0.022) + 0.075 * (1 - v) ** 1.5 + (scoop ? 0.04 : 0);
  const off = t + d;
  const fallLen = fall ? clamp(d * 0.55, 0.28, 0.7) : 0;
  const fallStart = Math.max(t + 0.05, off - fallLen * 0.3);
  const releaseAt = fall ? fallStart : off;
  const stop = releaseAt + fallLen + 0.45;

  const pitch = voice.constant(t, stop, 0);
  const scoopCents = scoop ? 170 + 90 * (1 - v) : legato ? 12 : 28 + 30 * (1 - v);
  const scoopTime = scoop ? 0.17 : 0.055;
  pitch.offset.setValueAtTime(-scoopCents, t);
  pitch.offset.setTargetAtTime(0, t, scoopTime / 3);
  if (fall) {
    const depth = 550 + 350 * v;
    const curve = new Float32Array(64);
    for (let i = 0; i < curve.length; i++) {
      const x = i / (curve.length - 1);
      curve[i] = -depth * x * x * (0.6 + 0.4 * x);
    }
    pitch.offset.setValueCurveAtTime(curve, fallStart, fallLen);
  }

  const reed = voice.osc("sawtooth", f, t, stop, -0.5);
  const bell = voice.osc(brassWave(ctx), f, t, stop, 0.5);
  const jitter = voice.noise(t, stop, 22 / ctx.sampleRate);
  const jitterDepth = voice.gain(3);
  const drift = voice.noise(t, stop, 1.5 / ctx.sampleRate);
  const driftDepth = voice.gain(4);
  jitter.connect(jitterDepth);
  drift.connect(driftDepth);
  const roughness = voice.gain(0.025);
  jitter.connect(roughness);
  for (const src of [reed, bell]) {
    pitch.connect(src.detune);
    jitterDepth.connect(src.detune);
    driftDepth.connect(src.detune);
  }

  const lp1 = voice.filter("lowpass", 1000, 0.5);
  const lp2 = voice.filter("lowpass", 1000, 0.9);
  const tone = voice.gain(0);
  roughness.connect(tone.gain);
  reed.connect(voice.gain(0.65)).connect(lp1);
  bell.connect(voice.gain(0.35)).connect(lp1);
  lp1.connect(lp2).connect(tone);

  const cutPeak = clamp(650 + 3700 * v ** 1.2 + 1.5 * f, 900, 6500);
  const cutStart = clamp(1.4 * f, 450, 1300);
  for (const lp of [lp1, lp2]) {
    lp.frequency.setValueAtTime(cutStart, t);
    lp.frequency.setTargetAtTime(cutPeak, t, attack * 0.5);
    if (t + attack + 0.05 < releaseAt) lp.frequency.setTargetAtTime(cutPeak * 0.75, t + attack + 0.05, 0.3);
    if (d > 0.9) {
      lp.frequency.setTargetAtTime(cutPeak * 0.88, t + attack + 0.25, d * 0.3);
      lp.frequency.setTargetAtTime(cutPeak * 0.7, off - Math.min(0.4, d * 0.3), 0.15);
    }
    lp.frequency.setTargetAtTime(cutStart * 0.85, releaseAt, fall ? fallLen / 2.5 : 0.06);
  }

  tone.gain.setValueAtTime(0, t);
  tone.gain.setTargetAtTime(1, t, attack / 3);
  if (t + attack < releaseAt) tone.gain.setTargetAtTime(0.82, t + attack, 0.1);
  if (d > 0.9) {
    tone.gain.setTargetAtTime(0.95, t + attack + 0.25, d * 0.3);
    tone.gain.setTargetAtTime(0.78, off - Math.min(0.4, d * 0.3), 0.15);
  }
  tone.gain.setTargetAtTime(0, releaseAt, fall ? fallLen / 3 : 0.05);
  roughness.gain.setValueAtTime(0, t);
  roughness.gain.linearRampToValueAtTime(0.025, Math.min(t + attack, releaseAt));
  roughness.gain.setTargetAtTime(0, releaseAt, 0.03);

  const vibStart = t + 0.25;
  if (vibrato > 0 && releaseAt > vibStart + 0.08) {
    const lfo = voice.osc("sine", rand(4.7, 5.3), vibStart, stop);
    const cents = voice.gain(0);
    const swell = voice.gain(0);
    lfo.connect(cents);
    lfo.connect(swell).connect(tone.gain);
    cents.connect(reed.detune);
    cents.connect(bell.detune);
    const full = Math.min(vibStart + 0.45, releaseAt);
    for (const [g, depth] of [[cents, 10 * vibrato], [swell, 0.045 * vibrato]] as const) {
      g.gain.setValueAtTime(0, vibStart);
      g.gain.linearRampToValueAtTime(depth, full);
      g.gain.setValueAtTime(depth, releaseAt);
      g.gain.linearRampToValueAtTime(0, releaseAt + 0.08);
    }
  }

  const breath = voice.gain(0);
  voice.noise(t, stop).connect(voice.filter("bandpass", 1500, 0.7)).connect(breath);
  const burst = (legato ? 0.12 : 0.5) * (0.35 + 0.65 * v);
  breath.gain.setValueAtTime(0, t);
  breath.gain.linearRampToValueAtTime(burst, t + 0.007);
  breath.gain.setTargetAtTime(0.05 + 0.07 * (1 - v), t + 0.007, 0.035);
  breath.gain.setTargetAtTime(0, releaseAt, 0.05);

  const mute = voice.gain(1);
  tone.connect(mute);
  breath.connect(mute);
  const out = voice.gain(0.19 * dyn(v, 0.3) * clamp(1 + (midi - 66) / 50, 0.85, 1.35));
  mute
    .connect(voice.filter("highpass", 470, 0.65))
    .connect(voice.filter("peaking", 850, 1.3, -5))
    .connect(voice.filter("peaking", 1750, 3.2, 13))
    .connect(voice.filter("peaking", 3100, 2, 2))
    .connect(voice.filter("lowpass", 5000, 0.6))
    .connect(voice.filter("lowpass", 5600, 0.75))
    .connect(out)
    .connect(dest);
}

export function ride(ctx: BaseAudioContext, dest: AudioNode, time: number, velocity: number): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const voice = new Voice(ctx);
  const stop = t + 3.6;
  const out = voice.gain(0.9 * dyn(v, 0.2));
  out.connect(voice.filter("lowpass", 8000, 0.5)).connect(voice.panner(0.28)).connect(dest);

  const bank = metal(voice, 311, t, stop);
  const ping = voice.gain(0);
  bank.connect(voice.filter("bandpass", 3100, 1.6)).connect(ping).connect(out);
  ping.gain.setValueAtTime(0, t);
  ping.gain.linearRampToValueAtTime(0.7, t + 0.0015);
  ping.gain.setTargetAtTime(0.1, t + 0.0015, 0.05);
  ping.gain.setTargetAtTime(0, t + 0.25, 0.35);

  const wash = voice.gain(0);
  bank.connect(voice.filter("highpass", 4200, 0.6)).connect(wash).connect(out);
  hit(wash.gain, t, 0.25, 0.004, 0.7);
  landDecay(wash.gain, t + 0.004, 0.25, 0.7, stop);

  const noise = voice.noise(t, stop);
  const air = voice.gain(0);
  noise.connect(voice.filter("highpass", 7500, 0.7)).connect(air).connect(out);
  hit(air.gain, t, 0.06, 0.002, 0.45);
  landDecay(air.gain, t + 0.002, 0.06, 0.45, stop);
  const tick = voice.gain(0);
  noise.connect(voice.filter("bandpass", 5500, 1)).connect(tick).connect(out);
  hit(tick.gain, t, 0.35, 0.0008, 0.004);
}

export function hat(ctx: BaseAudioContext, dest: AudioNode, time: number, velocity: number): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const voice = new Voice(ctx);
  const stop = t + 0.3;
  const out = voice.gain(dyn(v, 0.2));
  out.connect(voice.panner(-0.3)).connect(dest);

  const shimmer = voice.gain(0);
  metal(voice, 330, t, stop).connect(voice.filter("highpass", 6500, 0.7)).connect(shimmer).connect(out);
  hit(shimmer.gain, t, 0.3, 0.0015, 0.026);

  const noise = voice.noise(t, stop);
  const hiss = voice.gain(0);
  noise.connect(voice.filter("bandpass", 7000, 0.8)).connect(hiss).connect(out);
  hit(hiss.gain, t, 0.3, 0.0015, 0.02);
  const chick = voice.gain(0);
  noise.connect(voice.filter("bandpass", 650, 1.4)).connect(chick).connect(out);
  hit(chick.gain, t, 0.9, 0.001, 0.012);
}

export function brushSweep(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  duration: number,
  velocity: number,
): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const d = clamp(duration, 0.15, 8);
  const voice = new Voice(ctx);
  const turns = Math.max(1, Math.round(d / 0.45));
  const n = Math.max(32, Math.ceil(d * 80));
  const phase = Math.random() * Math.PI * 2;
  const freq = new Float32Array(n);
  const amp = new Float32Array(n);
  const pan = new Float32Array(n);
  const peak = 0.55 * dyn(v, 0.2);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const fadeIn = Math.min(1, x / 0.18);
    const fadeOut = Math.min(1, (1 - x) / 0.25);
    const stroke = 0.65 + 0.35 * Math.abs(Math.sin(Math.PI * turns * x + phase / 2));
    freq[i] = 2600 + 1100 * Math.sin(Math.PI * 2 * turns * x + phase);
    amp[i] = peak * fadeIn * fadeIn * fadeOut * stroke;
    pan[i] = 0.15 * Math.sin(Math.PI * 2 * turns * x + phase);
  }
  amp[n - 1] = 0;

  const bp = voice.filter("bandpass", 2600, 0.7);
  const g = voice.gain(0);
  const p = voice.panner(0);
  voice
    .noise(t, t + d + 0.05)
    .connect(bp)
    .connect(voice.filter("highpass", 900, 0.7))
    .connect(voice.filter("lowpass", 7500, 0.7))
    .connect(g)
    .connect(p)
    .connect(dest);
  bp.frequency.setValueCurveAtTime(freq, t, d);
  g.gain.setValueCurveAtTime(amp, t, d);
  p.pan.setValueCurveAtTime(pan, t, d);
}

export function brushTap(ctx: BaseAudioContext, dest: AudioNode, time: number, velocity: number): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const voice = new Voice(ctx);
  const stop = t + 0.6;
  const out = voice.gain(0.55 * dyn(v, 0.15));
  out.connect(voice.filter("lowpass", 9000, 0.6)).connect(voice.panner(0.05)).connect(dest);

  const noise = voice.noise(t, stop);
  const bristles = voice.gain(0);
  noise.connect(voice.filter("bandpass", 2600, 0.55)).connect(bristles).connect(out);
  const b = 0.9;
  bristles.gain.setValueAtTime(0, t);
  bristles.gain.linearRampToValueAtTime(0.55 * b, t + 0.002);
  bristles.gain.linearRampToValueAtTime(0.3 * b, t + 0.005);
  bristles.gain.linearRampToValueAtTime(b, t + 0.009);
  bristles.gain.setTargetAtTime(0, t + 0.009, 0.035);

  const wires = voice.gain(0);
  noise.connect(voice.filter("bandpass", 5200, 0.9)).connect(wires).connect(out);
  hit(wires.gain, t + 0.003, 0.45, 0.004, 0.08);

  const shell = voice.osc("sine", 205, t, stop);
  shell.frequency.setValueAtTime(205, t);
  shell.frequency.exponentialRampToValueAtTime(182, t + 0.06);
  const body = voice.gain(0);
  shell.connect(body).connect(out);
  hit(body.gain, t, 0.12, 0.003, 0.05);
}

export function kick(ctx: BaseAudioContext, dest: AudioNode, time: number, velocity: number): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const voice = new Voice(ctx);
  const stop = t + 1.1;
  const out = voice.gain(dyn(v, 0.15));
  out.connect(dest);

  const head = voice.osc("sine", 96, t, stop);
  head.frequency.setValueAtTime(96, t);
  head.frequency.exponentialRampToValueAtTime(54, t + 0.07);
  const boom = voice.gain(0);
  head.connect(boom).connect(out);
  hit(boom.gain, t, 0.42, 0.004, 0.13);
  landDecay(boom.gain, t + 0.004, 0.42, 0.13, stop);

  const skin = voice.osc("sine", 150, t, t + 0.4);
  skin.frequency.setValueAtTime(150, t);
  skin.frequency.exponentialRampToValueAtTime(108, t + 0.05);
  const skinGain = voice.gain(0);
  skin.connect(skinGain).connect(out);
  hit(skinGain.gain, t, 0.07, 0.003, 0.03);

  const beater = voice.gain(0);
  voice.noise(t, t + 0.1).connect(voice.filter("lowpass", 1000, 0.7)).connect(beater).connect(out);
  hit(beater.gain, t, 0.5, 0.001, 0.006);
}

export function snap(ctx: BaseAudioContext, dest: AudioNode, time: number, velocity: number): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const voice = new Voice(ctx);
  const out = voice.gain(0.62 * dyn(v, 0.2));
  out.connect(dest);
  const noise = voice.noise(t, t + 0.3);
  const parts: [BiquadFilterNode, number, number, number][] = [
    [voice.filter("bandpass", 2300, 1.6), 1, 0.0004, 0.011],
    [voice.filter("bandpass", 1100, 2.2), 0.5, 0.0008, 0.02],
    [voice.filter("highpass", 5000, 0.7), 0.5, 0.0002, 0.0025],
  ];
  for (const [filter, level, attack, tau] of parts) {
    const g = voice.gain(0);
    noise.connect(filter).connect(g).connect(out);
    hit(g.gain, t, level, attack, tau);
  }
}

export function glassClink(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  velocity: number,
  pan = rand(-0.25, 0.25),
): void {
  const v = clamp01(velocity);
  const t = Math.max(0, time);
  const voice = new Voice(ctx);
  const stop = t + 3;
  const out = voice.gain(0.14 * dyn(v, 0.15));
  out.connect(voice.panner(pan)).connect(dest);

  const rebound = Math.random() < 0.55 ? rand(0.018, 0.05) : 0;
  const strike = (p: AudioParam, a: number, tau: number): void => {
    hit(p, t, a, 0.0008, tau);
    if (!rebound) {
      landDecay(p, t + 0.0008, a, tau, stop);
      return;
    }
    const t2 = t + rebound;
    const now = a * Math.exp(-(t2 - t - 0.0008) / tau);
    p.setValueAtTime(now, t2);
    p.linearRampToValueAtTime(now + 0.35 * a, t2 + 0.0008);
    p.setTargetAtTime(0, t2 + 0.0008, tau);
    landDecay(p, t2 + 0.0008, now + 0.35 * a, tau, stop);
  };
  const modes: [number, number, number][] = [
    [1, 1, 0.55],
    [2.61, 0.45, 0.3],
    [4.9, 0.22, 0.15],
    [7.7, 0.1, 0.07],
  ];
  const glasses = [rand(1750, 2150), rand(2300, 2750)];
  glasses.forEach((f0, gi) => {
    const weight = gi === 0 ? 1 : 0.7;
    for (const [ratio, level, decay] of modes) {
      const f = f0 * ratio;
      if (f > 11000) continue;
      const g = voice.gain(0);
      voice.osc("sine", f, t, stop).connect(g).connect(out);
      strike(g.gain, level * weight, decay * (0.7 + 0.3 * v));
    }
    const beat = voice.gain(0);
    voice.osc("sine", f0 + rand(0.8, 2.2), t, stop).connect(beat).connect(out);
    strike(beat.gain, 0.3 * weight, 0.55 * (0.7 + 0.3 * v));
  });

  const click = voice.gain(0);
  voice.noise(t, t + 0.1).connect(voice.filter("highpass", 4000, 0.7)).connect(click).connect(out);
  hit(click.gain, t, 0.6, 0.0003, 0.0015);
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(n);
  const knee = 0.8;
  const room = 0.18;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < knee ? a : knee + room * Math.tanh((a - knee) / room));
  }
  return c;
}

function tapeCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(n);
  const drive = 1.8;
  const bias = 0.1;
  const slope = drive * (1 - Math.tanh(drive * bias) ** 2);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (Math.tanh(drive * (x + bias)) - Math.tanh(drive * bias)) / slope;
  }
  return c;
}

function clubImpulse(ctx: BaseAudioContext): AudioBuffer {
  return cached(ctx, "club", () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.4);
    const buf = ctx.createBuffer(2, len, sr);
    const rt60 = 2.05;
    const k = 6.91 / rt60;
    const reflections: [number, number][] = [
      [0.0071, 0.55], [0.0113, 0.42], [0.0167, 0.5], [0.0219, 0.33], [0.0283, 0.38],
      [0.0347, 0.28], [0.0431, 0.3], [0.0523, 0.22], [0.0619, 0.2], [0.0751, 0.15],
    ];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const time = i / sr;
        const build = time < 0.012 ? 0 : Math.min(1, (time - 0.012) / 0.05);
        const fc = 1500 + 6500 * Math.exp(-time / 0.6);
        lp += (1 - Math.exp((-2 * Math.PI * fc) / sr)) * (Math.random() * 2 - 1 - lp);
        d[i] = lp * build * Math.exp(-k * time);
      }
      for (const [at, level] of reflections) {
        const start = Math.floor((at + rand(-0.0015, 0.0015)) * sr);
        const g = level * rand(0.8, 1.2) * (Math.random() < 0.5 ? -1 : 1);
        const spread = 14;
        for (let j = 0; j < spread; j++) d[start + j] += g * Math.sin((Math.PI * (j + 0.5)) / spread) * 0.5;
      }
      let energy = 0;
      for (let i = 0; i < len; i++) energy += d[i] * d[i];
      const scale = 1 / Math.sqrt(energy);
      for (let i = 0; i < len; i++) d[i] *= scale;
    }
    return buf;
  });
}

function addRing(d: Float32Array, at: number, amp: number, tau: number, w: number, phase = 0): void {
  const len = d.length;
  const n = Math.ceil(tau * 7);
  for (let j = 0; j < n; j++) d[(at + j) % len] += amp * Math.exp(-j / tau) * Math.cos(w * j + phase);
}

function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cached(ctx, "crackle", () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 7.7);
    const buf = ctx.createBuffer(2, len, sr);
    const ch = [buf.getChannelData(0), buf.getChannelData(1)];
    for (let i = Math.ceil(expRand() * sr / 26); i < len; i += Math.ceil(expRand() * sr / 26)) {
      const a = (Math.random() < 0.5 ? -1 : 1) * (0.006 + 0.07 * Math.random() ** 5);
      const tau = rand(1, 4.5);
      const w = rand(0.4, 2.2);
      const near = Math.random() < 0.5 ? 0 : 1;
      addRing(ch[near], i, a, tau, w);
      addRing(ch[1 - near], i, a * rand(0.3, 1), tau, w);
    }
    for (let i = Math.ceil(expRand() * sr * 1.6); i < len; i += Math.ceil(expRand() * sr * 1.6)) {
      const a = rand(0.015, 0.04) * (Math.random() < 0.5 ? -1 : 1);
      const width = Math.floor(sr * rand(0.0006, 0.0015));
      for (let j = 0; j < width; j++) {
        const s = a * Math.sin((Math.PI * j) / width);
        ch[0][(i + j) % len] += s;
        ch[1][(i + j) % len] += s * 0.8;
      }
    }
    return buf;
  });
}

function loop(ctx: BaseAudioContext, buffer: AudioBuffer, start: number, rate = 1): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(start, Math.random() * buffer.duration);
  return s;
}

/** Uniform random control signal in [-1, 1] with `rate` linearly interpolated breakpoints per second. */
function randomLfo(ctx: BaseAudioContext, rate: number, start: number): AudioBufferSourceNode {
  return loop(ctx, noiseBuffer(ctx), start, rate / ctx.sampleRate);
}

function node<T extends AudioNode>(n: T, setup: (n: T) => void): T {
  setup(n);
  return n;
}

const gainNode = (ctx: BaseAudioContext, value: number): GainNode => node(ctx.createGain(), (g) => (g.gain.value = value));

const biquad = (ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707, gainDb = 0): BiquadFilterNode =>
  node(ctx.createBiquadFilter(), (f) => {
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.gain.value = gainDb;
  });

function shaper(ctx: BaseAudioContext, fn: (x: number) => number): WaveShaperNode {
  const n = 1025;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = fn((i / (n - 1)) * 2 - 1);
  return node(ctx.createWaveShaper(), (w) => (w.curve = curve));
}

function glide(p: AudioParam, value: number, time: number, seconds: number): void {
  p.cancelScheduledValues(time);
  p.setTargetAtTime(value, time, Math.max(0.005, seconds / 4));
}

const LIMITER_TRIM = 0.84;
const BUS_TRIM = 0.62;

export function createMixer(ctx: BaseAudioContext): Mixer {
  const nyquist = ctx.sampleRate / 2;
  const open = Math.min(20000, nyquist * 0.9);

  const master = gainNode(ctx, 1);
  const limiter = node(ctx.createDynamicsCompressor(), (c) => {
    c.threshold.value = -3;
    c.knee.value = 2;
    c.ratio.value = 20;
    c.attack.value = 0.002;
    c.release.value = 0.12;
  });
  const clip = node(ctx.createWaveShaper(), (w) => (w.curve = softClipCurve()));
  master.connect(limiter).connect(gainNode(ctx, LIMITER_TRIM)).connect(clip).connect(ctx.destination);

  const music = gainNode(ctx, 1);
  const wow = node(ctx.createDelay(0.05), (d) => (d.delayTime.value = 0.002));
  const dry = gainNode(ctx, 1);
  const wet = gainNode(ctx, 0);
  const saturate = node(ctx.createWaveShaper(), (w) => (w.curve = tapeCurve()));
  const dc = biquad(ctx, "highpass", 16, 0.7);
  const warm = biquad(ctx, "lowshelf", 220);
  const dull = biquad(ctx, "highshelf", 3600);
  const dark = biquad(ctx, "lowpass", open, 0.5);
  const muffle = biquad(ctx, "lowpass", open, 0.6);
  const muffleGain = gainNode(ctx, 1);
  music.connect(wow);
  wow.connect(dry).connect(dc);
  wow.connect(saturate).connect(wet).connect(dc);
  dc.connect(warm).connect(dull).connect(dark).connect(muffle).connect(muffleGain).connect(master);

  const wowDepth = gainNode(ctx, 0);
  const flutterDepth = gainNode(ctx, 0);
  const driftDepth = gainNode(ctx, 0);
  node(ctx.createOscillator(), (o) => {
    o.frequency.value = 0.52;
    o.start(0);
  }).connect(wowDepth);
  node(ctx.createOscillator(), (o) => {
    o.frequency.value = 6.3;
    o.start(0);
  }).connect(flutterDepth);
  randomLfo(ctx, 1.1, 0).connect(biquad(ctx, "lowpass", 0.5, 0.5)).connect(driftDepth);
  for (const depth of [wowDepth, flutterDepth, driftDepth]) depth.connect(wow.delayTime);

  const crackle = gainNode(ctx, 0);
  loop(ctx, crackleBuffer(ctx), 0)
    .connect(biquad(ctx, "highpass", 300, 0.7))
    .connect(biquad(ctx, "lowpass", 7500, 0.7))
    .connect(crackle)
    .connect(muffle);
  const hiss = gainNode(ctx, 0);
  loop(ctx, noiseBuffer(ctx), 0).connect(biquad(ctx, "bandpass", 5000, 0.4)).connect(hiss).connect(muffle);

  const reverbIn = gainNode(ctx, 1);
  const convolver = node(ctx.createConvolver(), (c) => {
    c.normalize = false;
    c.buffer = clubImpulse(ctx);
  });
  const reverbReturn = gainNode(ctx, 1);
  reverbIn
    .connect(biquad(ctx, "highpass", 220, 0.6))
    .connect(biquad(ctx, "lowpass", 6000, 0.5))
    .connect(convolver)
    .connect(reverbReturn)
    .connect(music);

  const bus = (level: number, send: number, comp?: { threshold: number; ratio: number; attack: number; release: number }): GainNode => {
    const input = gainNode(ctx, level);
    const out = gainNode(ctx, comp ? BUS_TRIM : 1);
    if (comp) {
      input
        .connect(
          node(ctx.createDynamicsCompressor(), (c) => {
            c.threshold.value = comp.threshold;
            c.knee.value = 14;
            c.ratio.value = comp.ratio;
            c.attack.value = comp.attack;
            c.release.value = comp.release;
          }),
        )
        .connect(out);
    } else {
      input.connect(out);
    }
    out.connect(music);
    out.connect(gainNode(ctx, send)).connect(reverbIn);
    return input;
  };
  const band = bus(0.8, 0.16, { threshold: -20, ratio: 2.2, attack: 0.012, release: 0.22 });
  const trumpetBus = bus(1, 0.36, { threshold: -22, ratio: 2, attack: 0.02, release: 0.3 });
  // The compressor's 6 ms look-ahead would sit between a key press and its note, so the player's bus stays uncompressed.
  const piano = bus(1, 0.22);

  const ambience = gainNode(ctx, 1);
  ambience.connect(master);

  const at = (time?: number): number => Math.max(time ?? ctx.currentTime, ctx.currentTime);

  return {
    ctx,
    band,
    trumpet: trumpetBus,
    piano,
    ambience,
    master,
    setMemory(amount, time, seconds = 1.5) {
      const m = clamp01(amount);
      const t = at(time);
      glide(wowDepth.gain, 0.0006 * m, t, seconds);
      glide(flutterDepth.gain, 0.000025 * m, t, seconds);
      glide(driftDepth.gain, 0.0005 * m, t, seconds);
      glide(dry.gain, 1 - 0.6 * m, t, seconds);
      glide(wet.gain, 0.6 * m, t, seconds);
      glide(warm.gain, 2.5 * m, t, seconds);
      glide(dull.gain, -6.5 * m, t, seconds);
      glide(dark.frequency, open * 0.42 ** m, t, seconds);
      glide(reverbReturn.gain, 1 + 0.45 * m, t, seconds);
      glide(crackle.gain, 0.9 * m, t, seconds);
      glide(hiss.gain, 0.003 * m, t, seconds);
    },
    setMuffle(amount, time, seconds = 0.6) {
      const a = clamp01(amount);
      const t = at(time);
      glide(muffle.frequency, open * (380 / open) ** a, t, seconds);
      glide(muffleGain.gain, 1 - 0.3 * a, t, seconds);
    },
    setVolume(v) {
      glide(master.gain, clamp01(v), ctx.currentTime, 0.2);
    },
  };
}

function continuous(
  ctx: BaseAudioContext,
  dest: AudioNode,
  build: (out: GainNode, start: number, audible: () => boolean) => void,
): Level {
  const out = gainNode(ctx, 0);
  out.connect(dest);
  let built = false;
  let level = 0;
  return {
    setLevel(v, time, seconds = 1.2) {
      level = clamp01(v);
      if (!built && level > 0) {
        built = true;
        build(out, ctx.currentTime, () => level > 0);
      }
      glide(out.gain, level, Math.max(time ?? ctx.currentTime, ctx.currentTime), seconds);
    },
  };
}

/** Calls `schedule(from, to)` for successive windows: once up front in an OfflineAudioContext, from a timer otherwise. */
function eventLoop(ctx: BaseAudioContext, schedule: (from: number, to: number) => void): void {
  const start = ctx.currentTime;
  if (typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext) {
    schedule(start, ctx.length / ctx.sampleRate);
    return;
  }
  let cursor = start;
  const tick = (): void => {
    if (ctx.state === "closed") {
      clearInterval(timer);
      return;
    }
    const to = ctx.currentTime + 1.5;
    if (to > cursor) {
      schedule(Math.max(cursor, ctx.currentTime + 0.05), to);
      cursor = to;
    }
  };
  const timer = setInterval(tick, 400);
  tick();
}

function rainPatterBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cached(ctx, "patter", () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 9.3);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const white = new Float32Array(len);
      for (let i = 0; i < len; i++) white[i] = Math.random() * 2 - 1;
      let slow = 0;
      let fast = 0;
      for (let i = 0; i < len * 2; i++) {
        const w = white[i % len];
        slow += 0.03 * (w - slow);
        fast += 0.4 * (w - fast);
        if (i >= len) d[i - len] = 1.6 * slow + 0.1 * fast;
      }
      for (let i = Math.ceil((expRand() * sr) / 1400); i < len; i += Math.ceil((expRand() * sr) / 1400)) {
        const a = (Math.random() < 0.5 ? -1 : 1) * 0.05 * Math.min(4, expRand()) ** 1.6;
        addRing(d, i, a, rand(1, 11), rand(0, 1.2));
      }
      let sum = 0;
      for (let i = 0; i < len; i++) sum += d[i] * d[i];
      const scale = 0.25 / Math.sqrt(sum / len);
      for (let i = 0; i < len; i++) d[i] *= scale;
    }
    return buf;
  });
}

function glassDropsBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cached(ctx, "drops", () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 13.1);
    const buf = ctx.createBuffer(2, len, sr);
    const ch = [buf.getChannelData(0), buf.getChannelData(1)];
    const drop = (at: number, scale: number): void => {
      const p = rand(-0.9, 0.9);
      const gains = [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
      if (Math.random() < 0.8) {
        const a = scale * (0.08 + 0.35 * Math.random() ** 3);
        const w = (2 * Math.PI * rand(1600, 4200)) / sr;
        const tau = rand(0.0015, 0.005) * sr;
        for (let c = 0; c < 2; c++) {
          addRing(ch[c], at, a * gains[c], tau, w, Math.PI / 2);
          for (let j = 0; j < 3; j++) ch[c][(at + j) % len] += a * gains[c] * 0.6 * (Math.random() * 2 - 1);
        }
      } else {
        const a = scale * rand(0.05, 0.15);
        const f0 = rand(700, 1100);
        const n = Math.floor(0.08 * sr);
        let phase = 0;
        for (let j = 0; j < n; j++) {
          const time = j / sr;
          phase += (2 * Math.PI * f0 * (1 + 0.6 * Math.min(1, time / 0.025))) / sr;
          const s = a * Math.exp(-time / 0.012) * Math.sin(phase);
          for (let c = 0; c < 2; c++) ch[c][(at + j) % len] += s * gains[c];
        }
      }
    };
    for (let i = Math.ceil((expRand() * sr) / 3.2); i < len; i += Math.ceil((expRand() * sr) / 3.2)) {
      drop(i, 1);
      if (Math.random() < 0.15) {
        const extra = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < extra; k++) drop(i + Math.floor(rand(0.02, 0.15) * sr), 0.5);
      }
    }
    return buf;
  });
}

export function createRain(ctx: BaseAudioContext, dest: AudioNode): Level & { setMuffle(v: number, time?: number, seconds?: number): void } {
  let muffled = 1;
  let apply: ((m: number, t: number, seconds: number) => void) | undefined;
  const level = continuous(ctx, dest, (out, start) => {
    const wash = gainNode(ctx, 0.1);
    const lpA = biquad(ctx, "lowpass", 600, 0.5);
    const lpB = biquad(ctx, "lowpass", 600, 0.7);
    loop(ctx, rainPatterBuffer(ctx), start)
      .connect(biquad(ctx, "highpass", 90, 0.7))
      .connect(lpA)
      .connect(lpB)
      .connect(wash)
      .connect(out);
    const gust = gainNode(ctx, 0.025);
    randomLfo(ctx, 0.2, start).connect(gust).connect(wash.gain);

    const drops = gainNode(ctx, 0.3);
    loop(ctx, glassDropsBuffer(ctx), start)
      .connect(biquad(ctx, "highpass", 250, 0.7))
      .connect(biquad(ctx, "lowpass", 7000, 0.6))
      .connect(drops)
      .connect(out);

    apply = (m, t, seconds) => {
      const cutoff = 600 * (9000 / 600) ** (1 - m);
      glide(lpA.frequency, cutoff, t, seconds);
      glide(lpB.frequency, cutoff, t, seconds);
      glide(wash.gain, 0.1 + 0.1 * (1 - m), t, seconds);
      glide(gust.gain, 0.025 + 0.025 * (1 - m), t, seconds);
      glide(drops.gain, 0.1 + 0.2 * m, t, seconds);
    };
    apply(muffled, start, 0.02);
  });
  return {
    setLevel: level.setLevel,
    setMuffle(v, time, seconds = 1) {
      muffled = clamp01(v);
      apply?.(muffled, Math.max(time ?? ctx.currentTime, ctx.currentTime), seconds);
    },
  };
}

export function createRoomTone(ctx: BaseAudioContext, dest: AudioNode): Level {
  return continuous(ctx, dest, (out, start) => {
    const hum = node(ctx.createOscillator(), (o) => {
      o.setPeriodicWave(periodic(ctx, "hum", [1, 0.55, 0.4, 0.22, 0.12, 0.08, 0.05]));
      o.frequency.value = 60;
      o.start(start);
    });
    hum.connect(gainNode(ctx, 0.012)).connect(out);

    const fridge = node(ctx.createOscillator(), (o) => {
      o.setPeriodicWave(
        periodic(ctx, "fridge", Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 1 : 0.6) * (i + 1) ** -0.6)),
      );
      o.frequency.value = 119.6;
      o.start(start);
    });
    randomLfo(ctx, 3, start).connect(gainNode(ctx, 0.3)).connect(fridge.frequency);
    const fridgeLevel = gainNode(ctx, 0.012);
    randomLfo(ctx, 0.5, start).connect(gainNode(ctx, 0.004)).connect(fridgeLevel.gain);
    fridge
      .connect(biquad(ctx, "bandpass", 420, 0.9))
      .connect(biquad(ctx, "lowpass", 1800, 0.7))
      .connect(fridgeLevel)
      .connect(node(ctx.createStereoPanner(), (p) => (p.pan.value = 0.55)))
      .connect(out);

    const air = ctx.createChannelMerger(2);
    for (const c of [0, 1]) {
      const src = loop(ctx, noiseBuffer(ctx), start);
      src.connect(biquad(ctx, "lowpass", 220, 0.5)).connect(gainNode(ctx, 0.05)).connect(air, 0, c);
      src.connect(biquad(ctx, "bandpass", 1100, 0.4)).connect(gainNode(ctx, 0.004)).connect(air, 0, c);
    }
    air.connect(out);
  });
}

export function createCrowd(ctx: BaseAudioContext, dest: AudioNode): Level {
  return continuous(ctx, dest, (out, start, audible) => {
    const room = gainNode(ctx, 0.28);
    const swell = gainNode(ctx, 1);
    swell
      .connect(biquad(ctx, "highpass", 120, 0.7))
      .connect(biquad(ctx, "lowpass", 2800, 0.5))
      .connect(room)
      .connect(out);

    const syllable = (x: number): number => 1.3 * Math.max(0, x + 0.05) ** 1.5;
    const turnTaking = (x: number): number => Math.min(1, Math.max(0, x + 0.3) * 1.2);
    for (let i = 0; i < 9; i++) {
      const female = i % 2 === 1;
      const f0 = female ? rand(180, 235) : rand(98, 135);
      const voice = node(ctx.createOscillator(), (o) => {
        o.type = "sawtooth";
        o.frequency.value = f0;
        o.start(start);
      });
      randomLfo(ctx, 2.5, start).connect(gainNode(ctx, f0 * 0.1)).connect(voice.frequency);
      const f1 = biquad(ctx, "bandpass", rand(450, 650), 4);
      const f2 = biquad(ctx, "bandpass", rand(1300, 1700), 6);
      randomLfo(ctx, 7, start).connect(gainNode(ctx, 200)).connect(f1.frequency);
      randomLfo(ctx, 6, start).connect(gainNode(ctx, 450)).connect(f2.frequency);
      const talk = gainNode(ctx, 0);
      voice.connect(f1).connect(talk);
      voice.connect(f2).connect(gainNode(ctx, 0.55)).connect(talk);
      randomLfo(ctx, 9, start).connect(shaper(ctx, syllable)).connect(talk.gain);
      const turn = gainNode(ctx, 0);
      randomLfo(ctx, 0.35, start).connect(shaper(ctx, turnTaking)).connect(turn.gain);
      talk
        .connect(turn)
        .connect(node(ctx.createStereoPanner(), (p) => (p.pan.value = rand(-0.8, 0.8))))
        .connect(swell);
    }

    const bed = ctx.createChannelMerger(2);
    for (const c of [0, 1]) loop(ctx, noiseBuffer(ctx), start).connect(bed, 0, c);
    const bedLevel = gainNode(ctx, 0.1);
    randomLfo(ctx, 0.3, start).connect(gainNode(ctx, 0.03)).connect(bedLevel.gain);
    bed.connect(biquad(ctx, "bandpass", 480, 0.6)).connect(bedLevel).connect(swell);

    const laughers = [rand(210, 250), rand(160, 190)].map((f0, i) => {
      const osc = node(ctx.createOscillator(), (o) => {
        o.type = "sawtooth";
        o.frequency.value = f0;
        o.start(start);
      });
      const g = gainNode(ctx, 0);
      osc.connect(biquad(ctx, "bandpass", 780, 3)).connect(g);
      osc.connect(biquad(ctx, "bandpass", 1200, 4)).connect(gainNode(ctx, 0.6)).connect(g);
      g.connect(node(ctx.createStereoPanner(), (p) => (p.pan.value = i === 0 ? -0.5 : 0.4))).connect(swell);
      return { osc, g, f0, busyUntil: 0 };
    });
    const laugh = (at: number): void => {
      const bursts = 4 + Math.floor(Math.random() * 3);
      const period = rand(0.17, 0.22);
      laughers.forEach((l, i) => {
        const t = at + i * rand(0.05, 0.12);
        if (t < l.busyUntil) return;
        const dur = bursts * period + 0.15;
        const n = Math.ceil(dur * 200);
        const g = new Float32Array(n);
        const f = new Float32Array(n);
        for (let j = 0; j < n; j++) {
          const time = (j / (n - 1)) * dur;
          const phase = (time % period) / period;
          const pulse = phase < 0.15 ? phase / 0.15 : Math.exp(-(phase - 0.15) * 5);
          g[j] = 0.35 * pulse * Math.sin((Math.PI * time) / dur) ** 0.7;
          f[j] = l.f0 * (1.35 - (0.35 * time) / dur) * (1 - 0.05 * phase);
        }
        g[n - 1] = 0;
        l.g.gain.setValueCurveAtTime(g, t, dur);
        l.osc.frequency.setValueCurveAtTime(f, t, dur);
        l.busyUntil = t + dur + 0.05;
      });
      swell.gain.setTargetAtTime(1.3, at, 0.3);
      swell.gain.setTargetAtTime(1, at + 1.2, 0.8);
    };

    const distant = gainNode(ctx, 0.35);
    distant.connect(biquad(ctx, "lowpass", 3200, 0.6)).connect(room);
    let nextGlass = start + rand(1, 6);
    let nextLaugh = start + rand(4, 14);
    eventLoop(ctx, (from, to) => {
      while (nextGlass < to) {
        if (nextGlass >= from && audible()) glassClink(ctx, distant, nextGlass, rand(0.2, 0.7), rand(-0.8, 0.8));
        nextGlass += 2 + expRand() * 8;
      }
      while (nextLaugh < to) {
        if (nextLaugh >= from && audible()) laugh(nextLaugh);
        nextLaugh += 8 + expRand() * 16;
      }
    });
  });
}
