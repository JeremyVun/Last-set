import type { Line } from '../story.ts';
import type { Block, Played } from '../game/performance.ts';
import type { HornNote } from '../audio/band.ts';

const KEY_LABELS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class UI {
  root = el('div', 'ui');
  private title = el('section', 'title');
  private dateline = el('p', 'dateline');
  private narration = el('section', 'narration');
  private narrationText = el('div', 'narration-text');
  private continueBtn = el('button', 'text-button continue', undefined, 'Continue');
  private label = el('div', 'hover-label');
  private card = el('section', 'card');
  private memory = el('section', 'memory');
  private perf = el('section', 'perf');
  private hint = el('p', 'hint');
  private track = el('canvas', 'track');
  private keysRow = el('div', 'keys');
  private feedbackEl = el('p', 'feedback');
  private inspect = el('section', 'inspect');
  private choices = el('div', 'choices');
  private hubAction = el('button', 'text-button hub-action');
  private hubHint = el('p', 'hub-hint');
  private pause = el('section', 'pause');
  private soundBtn = el('button', 'text-button sound');
  keyButtons: HTMLButtonElement[] = [];
  private continueResolve: (() => void) | null = null;
  private feedbackTimer = 0;
  onKey: ((index: number, down: boolean) => void) | null = null;
  onHubAction: (() => void) | null = null;
  onSound: (() => void) | null = null;
  onResume: (() => void) | null = null;

  constructor() {
    document.body.appendChild(this.root);
    this.root.append(this.title, this.dateline, this.card, this.memory, this.inspect, this.narration, this.label, this.perf, this.hubAction, this.hubHint, this.pause, this.soundBtn);
    this.narration.append(this.narrationText, this.choices, this.continueBtn);
    this.perf.append(this.hint, this.track, this.keysRow, this.feedbackEl);
    this.continueBtn.addEventListener('click', () => this.advance());
    this.hubAction.addEventListener('click', () => this.onHubAction?.());
    this.soundBtn.addEventListener('click', () => this.onSound?.());
    this.setSound(true);
    this.memory.setAttribute('aria-live', 'polite');
    this.narration.setAttribute('aria-live', 'polite');
    this.hint.setAttribute('aria-live', 'polite');

    KEY_LABELS.forEach((k, i) => {
      const b = el('button', 'key', this.keysRow) as HTMLButtonElement;
      b.setAttribute('aria-label', `Note ${i + 1}`);
      el('span', 'key-letter', b, k);
      el('span', 'key-dot', b);
      const down = (e: Event) => {
        e.preventDefault();
        this.onKey?.(i, true);
      };
      const up = (e: Event) => {
        e.preventDefault();
        this.onKey?.(i, false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      this.keyButtons.push(b);
    });
  }

  showTitle(actions: { label: string; run: () => void }[]) {
    this.title.innerHTML = '';
    el('h1', 'title-name', this.title, 'Last Set');
    el('p', 'title-sub', this.title, 'A story in four songs.');
    const row = el('div', 'title-actions', this.title);
    const buttons = actions.map((a) => {
      const b = el('button', 'text-button start', row, a.label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        buttons.forEach((x) => (x.disabled = true));
        a.run();
      });
      return b;
    });
    el('p', 'title-note', this.title, 'Best with sound on.');
    this.title.classList.add('on');
    setTimeout(() => buttons[0].focus(), 50);
  }

  hideTitle() {
    this.title.classList.remove('on');
  }

  setDateline(text: string | null) {
    this.dateline.textContent = text ?? '';
    this.dateline.classList.toggle('on', !!text);
  }

  async say(lines: string[], opts: { waitEach?: boolean } = {}) {
    this.narration.classList.add('on');
    this.narrationText.innerHTML = '';
    this.choices.innerHTML = '';
    for (let i = 0; i < lines.length; i++) {
      const p = el('p', 'line', this.narrationText, lines[i]);
      await wait(30);
      p.classList.add('in');
      if (opts.waitEach !== false && i < lines.length - 1) {
        await this.waitContinue();
      }
    }
    await this.waitContinue();
    this.narration.classList.remove('on');
    await wait(350);
  }

  waitContinue() {
    this.continueBtn.classList.add('on');
    this.continueBtn.focus({ preventScroll: true });
    return new Promise<void>((resolve) => {
      this.continueResolve = () => {
        this.continueBtn.classList.remove('on');
        resolve();
      };
    });
  }

  get waitingForContinue() {
    return this.continueResolve !== null;
  }

  advance() {
    const r = this.continueResolve;
    this.continueResolve = null;
    r?.();
  }

  async choose(lines: string[], options: string[]): Promise<number> {
    this.narration.classList.add('on');
    this.narrationText.innerHTML = '';
    for (const l of lines) {
      const p = el('p', 'line', this.narrationText, l);
      await wait(30);
      p.classList.add('in');
    }
    this.choices.innerHTML = '';
    return new Promise((resolve) => {
      options.forEach((o, i) => {
        const b = el('button', 'text-button choice', this.choices, o) as HTMLButtonElement;
        b.addEventListener('click', () => {
          this.choices.innerHTML = '';
          this.narration.classList.remove('on');
          resolve(i);
        });
        if (i === options.length - 1) setTimeout(() => b.focus({ preventScroll: true }), 50);
      });
    });
  }

  hoverLabel(text: string | null, x = 0, y = 0) {
    this.label.textContent = text ?? '';
    this.label.classList.toggle('on', !!text);
    this.label.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    document.body.style.cursor = text ? 'pointer' : '';
  }

  setHubAction(text: string | null, hint?: string | null) {
    this.hubAction.textContent = text ?? '';
    this.hubAction.classList.toggle('on', !!text);
    this.hubHint.textContent = hint ?? '';
    this.hubHint.classList.toggle('on', !!hint);
  }

  async showCard(title: string, year: string, ms = 3600) {
    this.card.innerHTML = '';
    el('h2', 'card-title', this.card, title);
    el('p', 'card-year', this.card, year);
    this.card.classList.add('on');
    await wait(ms);
    this.card.classList.remove('on');
  }

  showInspect(opts: { image?: string; paper?: string } | null) {
    this.inspect.innerHTML = '';
    if (!opts) {
      this.inspect.classList.remove('on');
      return;
    }
    if (opts.image) {
      const img = el('img', 'inspect-image', this.inspect) as HTMLImageElement;
      img.src = opts.image;
      img.alt = '';
    } else if (opts.paper) {
      const paper = el('div', 'paper', this.inspect);
      for (const para of opts.paper.split('\n\n')) el('p', '', paper, para);
    }
    requestAnimationFrame(() => this.inspect.classList.add('on'));
  }

  showPerf(on: boolean, homes: number[] = []) {
    this.perf.classList.toggle('on', on);
    this.keyButtons.forEach((b, i) => {
      b.classList.toggle('home', homes.includes(i));
      b.setAttribute('aria-label', homes.includes(i) ? `Note ${i + 1}, home` : `Note ${i + 1}`);
    });
    if (!on) {
      this.setHint(null);
      this.memory.classList.remove('on');
    }
  }

  setHint(text: string | null) {
    this.hint.textContent = text ?? '';
    this.hint.classList.toggle('on', !!text);
  }

  lightKey(i: number, down: boolean) {
    this.keyButtons[i]?.classList.toggle('down', down);
  }

  feedback(text: string, good: boolean) {
    this.feedbackEl.textContent = text;
    this.feedbackEl.classList.toggle('good', good);
    this.feedbackEl.classList.add('on');
    window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => this.feedbackEl.classList.remove('on'), 2600);
  }

  showLine(line: Line, clarity: number, holdMs: number) {
    this.memory.innerHTML = '';
    this.memory.className = `memory who-${line.who}`;
    if (line.note) el('p', 'memory-note', this.memory, line.note);
    const p = el('p', 'memory-line', this.memory);
    if (line.who !== 'me') el('span', 'memory-who', p, line.who);
    const words = line.text.split(' ');
    const hide = new Set<number>();
    const toHide = Math.round(words.length * (1 - clarity));
    const order = words.map((_, i) => i).sort((a, b) => Math.sin(a * 91.7 + line.text.length) - Math.sin(b * 91.7 + line.text.length));
    for (let i = 0; i < toHide; i++) hide.add(order[i]);
    const q = el('span', 'memory-text', p);
    words.forEach((w, i) => {
      const s = el('span', hide.has(i) ? 'word lost' : 'word', q, w);
      if (hide.has(i)) s.setAttribute('aria-hidden', 'true');
      q.append(' ');
    });
    if (hide.size) q.setAttribute('aria-label', words.map((w, i) => (hide.has(i) ? 'blank' : w)).join(' '));
    requestAnimationFrame(() => this.memory.classList.add('on'));
    window.setTimeout(() => {
      if (p.isConnected) this.memory.classList.remove('on');
    }, holdMs);
  }

  setSound(on: boolean) {
    this.soundBtn.textContent = on ? 'Turn sound off' : 'Turn sound on';
  }

  showSoundButton(on: boolean) {
    this.soundBtn.classList.toggle('on', on);
  }

  showPause(on: boolean) {
    this.pause.innerHTML = '';
    this.pause.classList.toggle('on', on);
    if (!on) return;
    el('h2', 'pause-title', this.pause, 'Paused');
    const b = el('button', 'text-button', this.pause, 'Resume') as HTMLButtonElement;
    b.addEventListener('click', () => this.onResume?.());
    setTimeout(() => b.focus(), 30);
  }

  drawTrack(now: number, block: Block | null, horn: HornNote[], played: Played[], keys: number[], homes: number[]) {
    const c = this.track;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!block) return;
    const pad = 8;
    const x = (t: number) => pad + ((t - block.start) / (block.end - block.start)) * (w - pad * 2);
    const all = [...keys, ...horn.filter((n) => n.time >= block.start && n.time < block.end).map((n) => n.midi)];
    const lo = Math.min(...all) - 1, hi = Math.max(...all) + 1;
    const top = 20, bottom = h - 6;
    const y = (m: number) => bottom - ((m - lo) / (hi - lo)) * (bottom - top);

    g.fillStyle = 'rgba(232,168,90,0.06)';
    g.fillRect(x(block.start), top - 4, x(block.split) - x(block.start), bottom - top + 8);
    g.fillStyle = 'rgba(95,179,255,0.07)';
    g.fillRect(x(block.split), top - 4, x(block.end) - x(block.split), bottom - top + 8);
    g.font = '400 13px Spectral, serif';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(232,168,90,0.85)';
    if (block.label[0]) g.fillText(block.label[0], x(block.start) + 2, 13);
    g.fillStyle = 'rgba(160,205,255,0.9)';
    if (block.label[1] && block.split < block.end) g.fillText(block.label[1], x(block.split) + 4, 13);

    for (const hk of homes) {
      g.strokeStyle = 'rgba(232,168,90,0.18)';
      g.setLineDash([2, 4]);
      g.beginPath();
      g.moveTo(x(block.split), y(keys[hk]));
      g.lineTo(x(block.end), y(keys[hk]));
      g.stroke();
      g.setLineDash([]);
    }

    for (const n of horn) {
      if (n.end < block.start || n.time > block.end) continue;
      const lit = now >= n.time && now < n.end;
      const past = now >= n.time;
      g.fillStyle = lit ? 'rgba(255,205,140,1)' : past ? 'rgba(232,168,90,0.75)' : 'rgba(232,168,90,0.22)';
      const x0 = x(n.time), x1 = Math.max(x0 + 3, x(Math.min(n.end, block.end)) - 2);
      g.fillRect(x0, y(n.midi) - 2, x1 - x0, 4);
    }
    for (const p of played) {
      if (p.time < block.start - 0.2 || p.time > block.end) continue;
      const end = p.end ?? now;
      g.fillStyle = p.end === null ? 'rgba(200,230,255,1)' : 'rgba(120,190,255,0.85)';
      const x0 = x(p.time), x1 = Math.max(x0 + 3, x(Math.min(end, block.end)));
      g.fillRect(x0, y(p.midi) - 2, x1 - x0, 4);
    }
    if (now >= block.start && now <= block.end) {
      g.strokeStyle = 'rgba(220,235,255,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x(now), top - 6);
      g.lineTo(x(now), bottom + 4);
      g.stroke();
    }
  }
}
