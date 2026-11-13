// Opens the real page in a headless browser and checks that the dream runs:
// frames advance, captions change, nothing errors, and nothing piles up.
// Headless Chromium draws WebGL on the CPU, so frame rates here are a floor.

import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EMOJI } from '../src/words.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'smoke-out');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const RUN_SECONDS = 40;
const SAMPLE_SECONDS = 5;
const GEOMETRY_LIMIT = 8; // five shapes, one floor, the screen quad, one spare
const TEXTURE_LIMIT = EMOJI.length * 2 + 8; // both variants of every emoji, plus floors

const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(outDir, { recursive: true });

async function openPage(args) {
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  await page.goto(url, { waitUntil: 'load' });
  return { browser, page, errors };
}

async function dreamRuns() {
  const { browser, page, errors } = await openPage(['--enable-unsafe-swiftshader']);
  const dream = (expression) => page.evaluate(`window.__dream.${expression}`);
  const captionText = () => page.textContent('#caption');

  await sleep(3);
  const startedFrames = await dream('frames()');
  check('frames advance', startedFrames > 30, `${startedFrames} frames in 3 s`);
  check('camera moves forward', (await dream('distance()')) > 5);
  check('WebGL fallback stays hidden', await page.isHidden('#nogl'));

  const lofi = await dream('lofiSize()');
  const buffer = await page.evaluate(() => {
    const view = document.getElementById('view');
    return { width: view.width, height: view.height };
  });
  check('short side is 180 pixels', lofi.height === 180 && lofi.width === 320, `${lofi.width}x${lofi.height}`);
  check('canvas itself is low resolution', buffer.width === 320 && buffer.height === 180, `${buffer.width}x${buffer.height}`);

  const firstCaption = await captionText();
  check('caption is shown', firstCaption.trim().length >= 8, firstCaption);
  await page.screenshot({ path: path.join(outDir, 'at-03s.png') });

  const captions = new Set([firstCaption]);
  const samples = [];
  for (let elapsed = 3; elapsed < RUN_SECONDS; elapsed += SAMPLE_SECONDS) {
    await sleep(SAMPLE_SECONDS);
    captions.add(await captionText());
    samples.push({ ...(await dream('stats()')), ...(await dream('info()')) });
    if (elapsed + SAMPLE_SECONDS === 23) await page.screenshot({ path: path.join(outDir, 'at-23s.png') });
  }
  await page.screenshot({ path: path.join(outDir, 'at-end.png') });

  const max = (key) => Math.max(...samples.map((sample) => sample[key]));
  check('caption changes', captions.size >= 4, `${captions.size} different captions`);
  check('always 8 live segments', samples.every((sample) => sample.segments === 8));
  check('object cap holds', max('objects') <= 150, `peak ${max('objects')}`);
  check('floor textures are released', max('floors') <= 3, `peak ${max('floors')}`);
  check('geometries do not pile up', max('geometries') <= GEOMETRY_LIMIT, `peak ${max('geometries')}`);
  check('textures do not pile up', max('textures') <= TEXTURE_LIMIT, `peak ${max('textures')}`);

  const frames = await dream('frames()');
  const distance = await dream('distance()');
  const fps = (frames - startedFrames) / (RUN_SECONDS - 3);
  check('crossed into another zone', distance > 160, `travelled ${distance.toFixed(0)} units`);

  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1);
  const phone = await dream('lofiSize()');
  const box = await page.evaluate(() => {
    const rect = document.getElementById('view').getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  check('phone: short side stays 180 pixels', phone.width === 180 && phone.height === Math.round((180 * 844) / 390), `${phone.width}x${phone.height}`);
  // An upright phone would get a 35 degree slot if the vertical angle stayed at 70.
  const sideways = await dream('horizontalFov()');
  check('phone: view is not a narrow slot', sideways >= 55, `${sideways.toFixed(0)} degrees across`);
  check('phone: canvas fills the screen', box.width === 390 && box.height === 844, `${box.width}x${box.height}`);
  await page.screenshot({ path: path.join(outDir, 'phone.png') });

  check('no errors', errors.length === 0, errors.join(' | '));
  console.log(`     software-rendered frame rate: ${fps.toFixed(1)} fps (a floor, not what a GPU gives)`);
  await browser.close();
}

async function fallbackWithoutWebGL() {
  const { browser, page, errors } = await openPage(['--disable-3d-apis']);
  await sleep(1);
  check('without WebGL: message is shown', await page.isVisible('#nogl'));
  const uncaught = errors.filter((error) => error.startsWith('page:'));
  check('without WebGL: no uncaught errors', uncaught.length === 0, uncaught.join(' | '));
  await page.screenshot({ path: path.join(outDir, 'no-webgl.png') });
  await browser.close();
}

try {
  await dreamRuns();
  await fallbackWithoutWebGL();
} finally {
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
