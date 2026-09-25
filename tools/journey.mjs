// Plays the whole game through its real controls, with the QA autoplayer answering Nell.
// LAST=0 lets her have the last note. OUT=/tmp/prefix for screenshots.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const base = process.env.BASE || 'http://127.0.0.1:5287/';
const out = process.env.OUT || '/tmp/jazz-journey';
const w = Number(process.env.W || 1440), h = Number(process.env.H || 900);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: process.env.TOUCH === '1' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?qa=1');
await page.evaluate(() => localStorage.clear());
await page.goto(base + '?qa=1');
await page.waitForFunction(() => window.__ready === true);
await page.evaluate((last) => window.__autoplay('echo', last), process.env.LAST !== '0');
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Start' }).click();
const started = Date.now();
const seen = [];
let shot = 0;
const snap = async (name) => page.screenshot({ path: `${out}-${String(++shot).padStart(2, '0')}-${name}.png` });
let lastKey = '';
for (;;) {
  if ((Date.now() - started) / 1000 > 900) throw new Error('journey timed out');
  const s = await page.evaluate(() => window.__lastSet.state());
  const key = `${s.mode}:${s.progress.step}:${s.progress.pending}`;
  if (key !== lastKey) {
    lastKey = key;
    seen.push(key);
    console.log(((Date.now() - started) / 1000).toFixed(0) + 's', key);
    await page.waitForTimeout(1800);
    await snap(key.replace(/[:]/g, '-'));
  }
  if (await page.locator('.title.on .title-sub', { hasText: 'Thank you for playing.' }).count()) break;
  const choice = page.locator('.choices button');
  if (await choice.count()) {
    await snap('choice');
    await choice.last().click();
  } else if (await page.locator('.continue.on').count()) {
    await page.keyboard.press('Space');
  } else if (s.mode === 'hub' && !s.busy && (await page.locator('.hub-action.on').count())) {
    await page.locator('.hub-action.on').click();
  }
  await page.waitForTimeout(450);
}
await page.waitForTimeout(1500);
await snap('credits');
console.log(JSON.stringify({ minutes: +((Date.now() - started) / 60000).toFixed(1), seen, errors }));
assert.equal(errors.length, 0, errors.join('\n'));
await browser.close();
