/**
 * Screenshot HTML snippets to PNG — used by build_slides.py to turn every SQL
 * example and result table into an image for the slide decks.
 *
 * Input is a JSON file: [{ "file": "/abs/out.png", "html": "<!doctype html>…" }].
 * Each page must contain an element with id="card"; only that element is
 * captured, at 2x for sharp text on a projector.
 *
 * Usage:  node scripts/slides/render_examples.mjs jobs.json
 *         CHROME_PATH overrides the browser location.
 */

import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 3600, height: 2400, deviceScaleFactor: 2 });

for (const job of jobs) {
  await page.setContent(job.html, { waitUntil: 'load' });
  const card = await page.$('#card');
  await card.screenshot({ path: job.file, omitBackground: true });
}

await browser.close();
