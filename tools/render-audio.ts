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
  type Mixer,
} from "../src/audio/instruments";
import { demos, groove, type Buses } from "../src/audio/audition";

const SR = 48000;

interface Job {
  name: string;
  seconds: number;
  limit: number;
  spectrum?: boolean;
  settle?: boolean;
  run(ctx: OfflineAudioContext): void | ((out: Float32Array[]) => Record<string, number>);
}

const dry = (ctx: BaseAudioContext): Buses => ({ ctx, band: ctx.destination, trumpet: ctx.destination, piano: ctx.destination });

function mixed(ctx: BaseAudioContext, memory = 0, muffle = 0): Mixer {
  const m = createMixer(ctx);
  m.setMemory(memory, 0, 0.01);
  m.setMuffle(muffle, 0, 0.01);
  return m;
}

const oneShot = (name: string, seconds: number, run: (ctx: OfflineAudioContext, dest: AudioNode) => void): Job => ({
  name,
  seconds,
  limit: 0.5,
  settle: true,
  run: (ctx) => run(ctx, ctx.destination),
});

const jobs: Job[] = [
  ...[48, 60, 72, 84].map((m) => oneShot(`epiano-${m}`, 3, (c, d) => void epiano(c, d, m, 0.05, 1, 1.2))),
  oneShot("epiano-held", 2.5, (c, d) => epiano(c, d, 64, 0.05, 1).release(1.05)),
  ...[28, 41, 55].map((m) => oneShot(`bass-${m}`, 1.5, (c, d) => bass(c, d, m, 0.05, 1, 0.5))),
  ...[58, 70, 84].map((m) => oneShot(`trumpet-${m}`, 2.5, (c, d) => trumpet(c, d, m, 0.05, 1.2, 1))),
  oneShot("trumpet-70-scoop-fall", 3, (c, d) => trumpet(c, d, 70, 0.05, 1.2, 1, { scoop: true, fall: true, vibrato: 1.5 })),
  { ...oneShot("trumpet-65-soft", 2.5, (c, d) => trumpet(c, d, 65, 0.05, 1.2, 0.3)), spectrum: true },
  oneShot("ride", 4, (c, d) => ride(c, d, 0.05, 1)),
  oneShot("hat", 1, (c, d) => hat(c, d, 0.05, 1)),
  oneShot("brushSweep", 2, (c, d) => brushSweep(c, d, 0.05, 1.5, 1)),
  oneShot("brushTap", 1, (c, d) => brushTap(c, d, 0.05, 1)),
  oneShot("kick", 1.5, (c, d) => kick(c, d, 0.05, 1)),
  oneShot("snap", 1, (c, d) => snap(c, d, 0.05, 1)),
  oneShot("glassClink", 3.5, (c, d) => glassClink(c, d, 0.05, 1)),
  { ...oneShot("epiano-chord-F7-v0.8", 3, (c, d) => [57, 62, 63, 67].forEach((m) => epiano(c, d, m, 0.05, 0.8, 1.5))), limit: 1 },

  ...(["trumpetBallad", "trumpetSwing", "trumpetRange", "epianoChords", "epianoMelody", "bass", "ride", "brushes"] as const).map(
    (key): Job => ({
      name: `dry-${key}`,
      seconds: demos[key].length,
      limit: 0.9,
      spectrum: true,
      settle: true,
      run: (ctx) => demos[key].play(dry(ctx), 0.05),
    }),
  ),
  ...Object.entries(demos).map(
    ([key, demo]): Job => ({
      name: `mix-${key}`,
      seconds: demo.length + 1.5,
      limit: 1,
      run: (ctx) => demo.play(mixed(ctx), 0.05),
    }),
  ),

  ...([[0, 0], [1, 0], [0.5, 0], [1, 1]] as const).map(
    ([memory, muffle]): Job => ({
      name: `groove-mem${memory}${muffle ? "-muffled" : ""}`,
      seconds: groove().length,
      limit: 1,
      spectrum: memory !== 0.5,
      run: (ctx) => {
        const m = mixed(ctx, memory, muffle);
        for (const e of groove().events) e.play(m, 0.1 + e.at);
      },
    }),
  ),
  {
    name: "groove-memory-sweep",
    seconds: groove().length,
    limit: 1,
    run: (ctx) => {
      const m = mixed(ctx, 0);
      m.setMemory(1, 4, 8);
      m.setMuffle(1, 12, 2);
      for (const e of groove().events) e.play(m, 0.1 + e.at);
    },
  },

  {
    name: "rain-window",
    seconds: 8,
    limit: 0.5,
    spectrum: true,
    run: (ctx) => createRain(ctx, ctx.destination).setLevel(1, 0, 0.01),
  },
  {
    name: "rain-door",
    seconds: 8,
    limit: 0.5,
    spectrum: true,
    run: (ctx) => {
      const r = createRain(ctx, ctx.destination);
      r.setLevel(1, 0, 0.01);
      r.setMuffle(0, 0, 0.01);
    },
  },
  {
    name: "rain-stop",
    seconds: 7,
    limit: 0.5,
    run: (ctx) => {
      const r = createRain(ctx, ctx.destination);
      r.setLevel(1, 0, 0.5);
      r.setLevel(0, 3);
      return (out) => ({ tailDb: db(rms(out, 5.5 * SR, 7 * SR)) });
    },
  },
  { name: "room-tone", seconds: 6, limit: 0.5, spectrum: true, run: (ctx) => createRoomTone(ctx, ctx.destination).setLevel(1, 0, 0.01) },
  { name: "crowd", seconds: 24, limit: 0.5, spectrum: true, run: (ctx) => createCrowd(ctx, ctx.destination).setLevel(1, 0, 0.01) },
  {
    name: "mixer-idle-mem1",
    seconds: 6,
    limit: 0.1,
    run: (ctx) => void mixed(ctx, 1),
  },
  {
    name: "probe-latency",
    seconds: 1,
    limit: 1,
    run: (ctx) => {
      const m = mixed(ctx, 0);
      const buf = ctx.createBuffer(1, 1, SR);
      buf.getChannelData(0)[0] = 0.5;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(m.piano);
      src.start(0.1);
      return (out) => {
        const first = out[0].findIndex((x, i) => i >= 0.1 * SR && Math.abs(x) > 0.01);
        return { latencyMs: ((first - 0.1 * SR) / SR) * 1000 };
      };
    },
  },
  ...(["band", "trumpet", "piano"] as const).map(
    (bus): Job => ({
      name: `probe-${bus}-bus-gain`,
      seconds: 3,
      limit: 1,
      run: (ctx) => {
        const m = mixed(ctx, 0);
        const buf = ctx.createBuffer(1, SR * 3, SR);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.05;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(m[bus]);
        src.start(0);
        return (out) => ({ busGain: rms(out, 1.5 * SR, 2.9 * SR) / (0.05 / Math.sqrt(3)) });
      },
    }),
  ),
  {
    name: "probe-wow",
    seconds: 8,
    limit: 1,
    run: (ctx) => {
      const m = mixed(ctx, 1);
      const o = ctx.createOscillator();
      o.frequency.value = 1000;
      const g = ctx.createGain();
      g.gain.value = 0.1;
      o.connect(g).connect(m.band);
      o.start(0);
    },
  },
  ...(["band", "trumpet"] as const).map(
    (stem): Job => ({
      name: `groove-stem-${stem}`,
      seconds: groove().length,
      limit: 1,
      run: (ctx) => {
        const m = mixed(ctx, 0);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        const buses: Buses = { ctx, band: stem === "band" ? m.band : mute, trumpet: stem === "trumpet" ? m.trumpet : mute, piano: mute };
        for (const e of groove().events) e.play(buses, 0.1 + e.at);
        return (out) => ({ phraseRmsDb: db(rms(out, 8.1 * SR, 15 * SR)) });
      },
    }),
  ),
];

function rms(out: Float32Array[], from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (const ch of out) {
    for (let i = Math.floor(from); i < Math.min(ch.length, Math.floor(to)); i++) {
      sum += ch[i] * ch[i];
      n++;
    }
  }
  return Math.sqrt(sum / Math.max(1, n));
}

const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function powerSpectrum(out: Float32Array[]): Float64Array {
  const n = 8192;
  const power = new Float64Array(n / 2);
  const len = out[0].length;
  const win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let start = 0; start + n <= len; start += n / 2) {
    for (let i = 0; i < n; i++) {
      re[i] = ((out[0][start + i] + out[1][start + i]) / 2) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  return power;
}

function spectrumStats(out: Float32Array[]): Record<string, number | string> {
  const p = powerSpectrum(out);
  const hz = SR / 8192;
  const band = (lo: number, hi: number): number => {
    let s = 0;
    for (let k = Math.max(1, Math.floor(lo / hz)); k < Math.min(p.length, Math.ceil(hi / hz)); k++) s += p[k];
    return s;
  };
  const total = band(20, SR / 2);
  let centroid = 0;
  for (let k = 1; k < p.length; k++) centroid += k * hz * p[k];
  const thirds: [number, number][] = [];
  for (let c = 100; c < 13000; c *= 2 ** (1 / 3)) thirds.push([c, band(c / 2 ** (1 / 6), c * 2 ** (1 / 6))]);
  const max = Math.max(...thirds.map(([, e]) => e));
  const above150 = thirds.filter(([c]) => c > 150);
  const peak = above150.reduce((a, b) => (b[1] > a[1] ? b : a));
  return {
    below400: band(20, 400) / total,
    mute1400to2200: band(1400, 2200) / total,
    above6k: band(6000, SR / 2) / total,
    centroidHz: centroid / total,
    peakBandHz: peak[0],
    thirds: thirds.map(([c, e]) => `${c < 1000 ? Math.round(c) : (c / 1000).toFixed(1) + "k"}:${Math.round(10 * Math.log10(e / max))}`).join(" "),
  };
}

function wavBase64(out: Float32Array[]): string {
  const frames = out[0].length;
  const pcm = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < 2; c++) {
      const x = Math.max(-1, Math.min(1, out[c][i] || 0));
      pcm[i * 2 + c] = Math.round(x * 32767);
    }
  }
  const bytes = new Uint8Array(pcm.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function render(name: string): Promise<unknown> {
  const job = jobs.find((j) => j.name === name);
  if (!job) throw new Error(`no job ${name}`);
  const before = liveVoices();
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(job.seconds * SR), sampleRate: SR });
  const check = job.run(ctx);
  const buffer = await ctx.startRendering();
  await new Promise((r) => setTimeout(r, 150));
  const out = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let peak = 0;
  let nonFinite = 0;
  for (const ch of out) {
    for (const x of ch) {
      if (!Number.isFinite(x)) nonFinite++;
      else if (Math.abs(x) > peak) peak = Math.abs(x);
    }
  }
  const stats: Record<string, unknown> = {
    name,
    seconds: buffer.duration,
    peak,
    rmsDb: db(rms(out, 0, out[0].length)),
    nonFinite,
    limit: job.limit,
    leftoverVoices: job.settle ? liveVoices() - before : null,
    ...(check ? check(out) : {}),
    ...(job.spectrum ? { spectrum: spectrumStats(out) } : {}),
  };
  return { stats, wav: wavBase64(out) };
}

Object.assign(window, { __jobs: jobs.map((j) => j.name), __render: render, __ready: true });
