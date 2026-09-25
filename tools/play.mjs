// Drives the game headlessly with the QA autoplayer and captures screenshots.
// SONG=0 MODE=echo node tools/play.mjs   (SONG=intro runs the title, prologue and hub)
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:5287/';
const out = process.env.OUT || '/tmp/jazz-play';
const w = Number(process.env.W || 1440), h = Number(process.env.H || 900);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?qa=1');
await page.evaluate(() => localStorage.clear());
await page.goto(base + '?qa=1');
await page.waitForFunction(() => window.__ready === true);
const state = () => page.evaluate(() => window.__lastSet.state());
const song = process.env.SONG ?? '0';
if (song === 'intro') {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-title.png` });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}-prologue.png` });
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(900); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-hub.png` });
  await page.getByRole('button', { name: "Read Mae's note" }).click();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}-note.png` });
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(900); }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}-hub2.png` });
  await page.getByRole('button', { name: 'Look at the photograph' }).click();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}-photo.png` });
} else {
  await page.evaluate(([m, last]) => window.__autoplay(m, last === '1'), [process.env.MODE || 'echo', process.env.LAST ?? '1']);
  await page.evaluate((i) => { void window.__lastSet.song(i); }, Number(song));
  if (process.env.REC) await page.evaluate(() => window.__lastSet.record());
  let maxPeak = 0, rmsSum = 0, rmsN = 0, hot = 0;
  const shots = (process.env.AT || '4,14,30').split(',').map(Number);
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    const t = (Date.now() - t0) / 1000;
    if (shots.length && t >= shots[0]) { await page.screenshot({ path: `${out}-s${song}-${shots.shift()}s.png` }); }
    const lv = await page.evaluate(() => window.__lastSet.levels());
    if (lv && s.perf) { maxPeak = Math.max(maxPeak, lv.peak); rmsSum += lv.rms; rmsN++; if (lv.peak > 0.9) hot++; }
    if (!s.perf && t > 8) break;
    if (t > 400) break;
    await page.waitForTimeout(250);
  }
  const s = await state();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-s${song}-end.png` });
  console.log(JSON.stringify({ ...s, audio: { maxPeak: +maxPeak.toFixed(3), avgRmsDb: +(20 * Math.log10(rmsSum / Math.max(1, rmsN))).toFixed(1), samplesOver09: hot } }));
  if (process.env.REC) {
    const b64 = await page.evaluate(() => window.__lastSet.stopRecording());
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.REC, Buffer.from(b64, 'base64'));
    console.log('recorded', process.env.REC);
  }
}
if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 10).join('\n'));
await browser.close();
