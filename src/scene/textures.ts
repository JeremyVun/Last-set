import * as THREE from 'three';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function finish(c: HTMLCanvasElement, repeat: [number, number], color = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, count: number, alpha: number, r: () => number) {
  for (let i = 0; i < count; i++) {
    const v = r() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

export function brick(repeat: [number, number]) {
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  g.fillStyle = '#2a2320';
  g.fillRect(0, 0, 512, 512);
  const rows = 16, bw = 64, bh = 512 / rows;
  const [bc, bg] = canvas(512, 512);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, 512, 512);
  for (let y = 0; y < rows; y++) {
    const off = y % 2 ? bw / 2 : 0;
    for (let x = -1; x < 512 / bw + 1; x++) {
      const px = x * bw + off, py = y * bh;
      const tone = 0.75 + r() * 0.5;
      const red = Math.floor(96 * tone), gr = Math.floor(52 * tone), bl = Math.floor(42 * tone);
      g.fillStyle = `rgb(${red},${gr},${bl})`;
      g.fillRect(px + 2, py + 2, bw - 4, bh - 4);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${r() > 0.5 ? 20 : 150},${r() > 0.5 ? 16 : 90},${r() > 0.5 ? 12 : 70},${0.15 * r()})`;
        g.fillRect(px + 2 + r() * (bw - 6), py + 2 + r() * (bh - 6), 2 + r() * 6, 1 + r() * 3);
      }
      bg.fillStyle = `rgb(${200 + r() * 40},${200 + r() * 40},${200 + r() * 40})`;
      bg.fillRect(px + 2, py + 2, bw - 4, bh - 4);
    }
  }
  speckle(g, 512, 512, 6000, 0.12, r);
  const grime = g.createLinearGradient(0, 0, 0, 512);
  grime.addColorStop(0, 'rgba(0,0,0,0.25)');
  grime.addColorStop(0.5, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = grime;
  g.fillRect(0, 0, 512, 512);
  return { map: finish(c, repeat), bump: finish(bc, repeat, false) };
}

export function planks(repeat: [number, number]) {
  const [c, g] = canvas(1024, 1024);
  const [rc, rg] = canvas(1024, 1024);
  const r = rng(11);
  const pw = 1024 / 8;
  for (let i = 0; i < 8; i++) {
    let y = -r() * 400;
    while (y < 1024) {
      const len = 300 + r() * 500;
      const tone = 0.86 + r() * 0.2;
      g.fillStyle = `rgb(${Math.floor(58 * tone)},${Math.floor(40 * tone)},${Math.floor(30 * tone)})`;
      g.fillRect(i * pw, y, pw, len);
      for (let k = 0; k < 26; k++) {
        const gx = i * pw + r() * pw;
        g.strokeStyle = `rgba(${r() > 0.5 ? 20 : 110},${r() > 0.5 ? 12 : 70},8,${0.12 + 0.18 * r()})`;
        g.lineWidth = 0.5 + r() * 2;
        g.beginPath();
        g.moveTo(gx, y);
        g.bezierCurveTo(gx + (r() - 0.5) * 12, y + len * 0.3, gx + (r() - 0.5) * 12, y + len * 0.6, gx + (r() - 0.5) * 8, y + len);
        g.stroke();
      }
      const worn = 150 + r() * 80;
      rg.fillStyle = `rgb(${worn},${worn},${worn})`;
      rg.fillRect(i * pw, y, pw, len);
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(i * pw, y, pw, 2);
      rg.fillStyle = '#fff';
      rg.fillRect(i * pw, y, pw, 3);
      y += len;
    }
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(i * pw, 0, 3, 1024);
    rg.fillStyle = '#fff';
    rg.fillRect(i * pw, 0, 3, 1024);
  }
  const path = rg.createRadialGradient(512, 512, 50, 512, 512, 700);
  path.addColorStop(0, 'rgba(60,60,60,0.5)');
  path.addColorStop(1, 'rgba(0,0,0,0)');
  rg.fillStyle = path;
  rg.fillRect(0, 0, 1024, 1024);
  speckle(g, 1024, 1024, 12000, 0.1, r);
  return { map: finish(c, repeat), rough: finish(rc, repeat, false) };
}

export function plaster(repeat: [number, number], base = '#1a2433') {
  const [c, g] = canvas(512, 512);
  const r = rng(23);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = r() * 512, y = r() * 512, rad = 10 + r() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() > 0.5;
    grd.addColorStop(0, dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 30; i++) {
    const x = r() * 512;
    const grd = g.createLinearGradient(x, 0, x + 6, 512);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(r(), 'rgba(0,0,0,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 2 + r() * 5, 512);
  }
  speckle(g, 512, 512, 5000, 0.08, r);
  return finish(c, repeat);
}

export function wood(repeat: [number, number], base: [number, number, number] = [60, 34, 22]) {
  const [c, g] = canvas(512, 512);
  const r = rng(31);
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 140; k++) {
    const y = r() * 512;
    g.strokeStyle = `rgba(${r() > 0.5 ? 10 : 120},${r() > 0.5 ? 6 : 70},4,${0.08 + 0.14 * r()})`;
    g.lineWidth = 0.5 + r() * 2.5;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + (r() - 0.5) * 18, 340, y + (r() - 0.5) * 18, 512, y + (r() - 0.5) * 6);
    g.stroke();
  }
  return finish(c, repeat);
}

export function neonGlowSprite() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function labelTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function loadImage(url: string, fallback: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 512) {
  const tex: THREE.Texture = labelTexture(fallback, w, h);
  const img = new Image();
  img.onload = () => {
    tex.dispose();
    tex.image = img;
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}
