// Renders every instrument, demo and the groove offline in headless Chrome, checks levels and writes WAVs.
// Usage: node tools/render-audio.mjs [name-filter]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = "/tmp/jazz-audio-render";
const port = 5291;
const filter = process.argv[2];

function wavFile(base64) {
  const pcm = Buffer.from(base64, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(48000 * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const fmt = (x, digits = 3) => (x === null || x === undefined ? "" : typeof x === "number" ? (Number.isFinite(x) ? x.toFixed(digits) : String(x)) : String(x));

mkdirSync(outDir, { recursive: true });
const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

let failures = 0;
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.goto(`http://127.0.0.1:${port}/tools/render-audio.html`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const names = (await page.evaluate(() => window.__jobs)).filter((n) => !filter || n.includes(filter));

  const rows = [];
  const spectra = [];
  for (const name of names) {
    const { stats, wav } = await page.evaluate((n) => window.__render(n), name);
    writeFileSync(`${outDir}/${name}.wav`, wavFile(wav));
    const problems = [];
    if (stats.nonFinite > 0) problems.push("non-finite samples");
    if (!(stats.peak > 1e-4)) problems.push("silent");
    if (!(stats.peak < stats.limit)) problems.push(`peak >= ${stats.limit}`);
    if (stats.leftoverVoices) problems.push(`${stats.leftoverVoices} voices not cleaned up`);
    if (stats.tailDb !== undefined && stats.tailDb > -80) problems.push("did not fade to silence");
    if (problems.length) failures++;
    const extra = ["latencyMs", "busGain", "tailDb", "phraseRmsDb"].filter((k) => stats[k] !== undefined).map((k) => `${k}=${fmt(stats[k], 2)}`);
    rows.push([name, fmt(stats.seconds, 1), fmt(stats.peak), fmt(stats.limit, 1), fmt(stats.rmsDb, 1), String(stats.nonFinite), extra.join(" "), problems.length ? `FAIL: ${problems.join(", ")}` : "ok"]);
    if (stats.spectrum) spectra.push([name, stats.spectrum]);
  }

  const head = ["render", "sec", "peak", "limit", "rms dB", "NaN", "notes", "result"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));

  if (spectra.length) {
    console.log("\nspectra (energy fractions; third-octave levels in dB re loudest band)");
    for (const [name, s] of spectra) {
      console.log(
        `${name}: <400Hz ${fmt(s.below400, 2)}  1.4-2.2k ${fmt(s.mute1400to2200, 2)}  >6k ${fmt(s.above6k, 3)}  centroid ${Math.round(s.centroidHz)} Hz  peak band ${Math.round(s.peakBandHz)} Hz`,
      );
      console.log(`    ${s.thirds}`);
    }
  }
  console.log(`\n${rows.length} renders, ${failures} failed. WAVs in ${outDir}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
