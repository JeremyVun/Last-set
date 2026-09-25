import { chromium } from 'playwright-core';
// Free camera captures: node tools/look.mjs '[["name",[x,y,z],[lx,ly,lz]]]' (QUERY adds URL params)
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
await page.goto(`http://127.0.0.1:5287/?qa=1&shot=hub&memory=0&${process.env.QUERY || ''}`);
await page.waitForFunction(() => window.__ready === true);
const views = JSON.parse(process.argv[2]);
for (const [name, pos, look] of views) {
  await page.evaluate(([p, l]) => { const T = window.__lastSet.world; T.cut({ pos: T.camera.position.clone().set(...p), look: T.camera.position.clone().set(...l), fov: 45 }); }, [pos, look]);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/jazz-dbg-${name}.png` });
}
await browser.close();
