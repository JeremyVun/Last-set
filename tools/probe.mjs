// Evaluate an expression against window.__lastSet in the running game: node tools/probe.mjs "<js returning JSON>"
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
page.on('console', (m) => console.log('console:', m.text()));
await page.goto(`http://127.0.0.1:5287/?qa=1&shot=hub&memory=0&${process.env.QUERY || ''}`);
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(new Function('L', `return (${process.argv[2]})`), null), null, 1));
await browser.close();
