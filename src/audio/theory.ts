const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + LETTERS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export interface ChordInfo {
  root: number;
  third: number;
  fifth: number;
  seventh: number;
  upper: number[];
  scale: number[];
}

export function chord(symbol: string): ChordInfo {
  const m = /^([A-G])(#|b)?(.*)$/.exec(symbol);
  if (!m) throw new Error(`Bad chord ${symbol}`);
  const root = (LETTERS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = m[3];
  if (q.startsWith('maj')) return { root, third: 4, fifth: 7, seventh: 11, upper: [4, 7, 11, 14], scale: [0, 2, 4, 7, 9, 11] };
  if (q.startsWith('m7b5')) return { root, third: 3, fifth: 6, seventh: 10, upper: [3, 6, 10, 13], scale: [0, 3, 5, 6, 8, 10] };
  if (q.startsWith('m')) return { root, third: 3, fifth: 7, seventh: 10, upper: [3, 7, 10, 14], scale: [0, 2, 3, 5, 7, 9, 10] };
  if (q === '7alt') return { root, third: 4, fifth: 8, seventh: 10, upper: [4, 10, 15, 20], scale: [0, 1, 3, 4, 6, 8, 10] };
  if (q === '13') return { root, third: 4, fifth: 7, seventh: 10, upper: [4, 9, 10, 14], scale: [0, 2, 4, 7, 9, 10] };
  if (q === '7sus') return { root, third: 5, fifth: 7, seventh: 10, upper: [5, 7, 10, 14], scale: [0, 2, 5, 7, 9, 10] };
  return { root, third: 4, fifth: 7, seventh: 10, upper: [4, 7, 10, 14], scale: [0, 2, 4, 7, 9, 10] };
}

// Rootless voicings kept close to the previous chord, between D3 and F5.
export function voicing(symbol: string, prevCenter: number): number[] {
  const c = chord(symbol);
  const a = c.upper.map((i) => c.root + i);
  const b = [a[2] - 12, a[3] - 12, a[0], a[1]].sort((x, y) => x - y);
  let best: number[] = a, bestD = Infinity;
  for (const form of [a, b]) {
    for (let oct = 2; oct <= 6; oct++) {
      const notes = form.map((n) => n + oct * 12);
      if (notes[0] < 50 || notes[notes.length - 1] > 77) continue;
      const center = notes.reduce((s, n) => s + n, 0) / notes.length;
      const d = Math.abs(center - prevCenter);
      if (d < bestD) {
        bestD = d;
        best = notes;
      }
    }
  }
  return best;
}

export function nearest(pc: number, near: number, lo = 28, hi = 52): number {
  let best = pc, bestD = Infinity;
  for (let n = lo; n <= hi; n++) {
    if (((n % 12) + 12) % 12 !== ((pc % 12) + 12) % 12) continue;
    const d = Math.abs(n - near);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}
