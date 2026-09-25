// Screenshot one or more URLs of the running dev server: node tools/shot.mjs out.png "?shot=hub" [more pairs]
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://127.0.0.1:5287/';
const w = Number(process.env.W || 1440), h = Number(process.env.H || 900);
const wait = Number(process.env.WAIT || 2500);
const args = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
for (let i = 0; i < args.length; i += 2) {
  await page.goto(base + args[i + 1]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: args[i] });
  console.log('saved', args[i]);
}
if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
