// Opens the real page in a headless browser and checks that the slideshow
// runs: pictures are drawn, captions change, missing pictures are skipped,
// phones get a full-screen picture, and nothing errors.

import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'smoke-out');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.jpg': 'image/jpeg',
};

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

const browser = await chromium.launch();

// allowPicture(url) decides, at request time, whether a picture loads or 404s.
async function openPage(viewport, { allowPicture } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // A deliberately missing picture logs a 404; that is the case under test.
    if (message.type() === 'error' && !(allowPicture && /404/.test(message.text()))) {
      errors.push(message.text());
    }
  });
  if (allowPicture) {
    await page.route('**/images/*.jpg', (route) =>
      allowPicture(route.request().url()) ? route.continue() : route.fulfill({ status: 404, body: '' }),
    );
  }
  await page.goto(url, { waitUntil: 'load' });
  return { page, errors };
}

// Mean brightness of what the canvas shows, 0-255.
const brightness = (page) =>
  page.evaluate(() => {
    const view = document.getElementById('view');
    const { data } = view.getContext('2d').getImageData(0, 0, view.width, view.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (data.length / 4) / 3;
  });

const canvasSize = (page) =>
  page.evaluate(() => {
    const view = document.getElementById('view');
    const box = view.getBoundingClientRect();
    return { w: view.width, h: view.height, cssW: box.width, cssH: box.height };
  });

async function desktop() {
  const { page, errors } = await openPage({ width: 1280, height: 720 });
  await sleep(2);
  const size = await canvasSize(page);
  check('canvas is drawn small', size.w === 320 && size.h === 180, `${size.w}x${size.h}`);
  check('a picture is on screen', (await brightness(page)) > 10);
  await page.screenshot({ path: path.join(outDir, 'desktop.png') });

  const english = await page.textContent('#en');
  check('English caption under the Chinese one', /^[\x20-\x7e’]+[.?!]$/.test(english), english);
  const captions = new Set([await page.textContent('#caption')]);
  let darkest = 255;
  for (let i = 0; i < 18; i++) {
    await sleep(1);
    captions.add(await page.textContent('#caption'));
    darkest = Math.min(darkest, await brightness(page));
  }
  await page.screenshot({ path: path.join(outDir, 'desktop-later.png') });
  check('never goes black between pictures', darkest > 10, `darkest frame brightness ${darkest.toFixed(0)}`);
  check('captions change every few seconds', captions.size >= 3, `${captions.size} captions in 20 s`);
  check('desktop: no errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function phone() {
  const { page, errors } = await openPage({ width: 390, height: 844 });
  await sleep(2);
  const size = await canvasSize(page);
  check('phone: short side 180 pixels', size.w === 180 && size.h === Math.round((180 * 844) / 390), `${size.w}x${size.h}`);
  check('phone: fills the screen', size.cssW === 390 && size.cssH === 844, `${size.cssW}x${size.cssH}`);
  check('phone: a picture is on screen', (await brightness(page)) > 10);
  const box = await page.evaluate(() => document.getElementById('caption').getBoundingClientRect());
  check('phone: both caption lines fit on screen', box.left >= 0 && box.right <= 390 && box.top > 844 / 2, `caption box ${Math.round(box.left)}–${Math.round(box.right)} px, top ${Math.round(box.top)} px`);
  await page.screenshot({ path: path.join(outDir, 'phone.png') });
  check('phone: no errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

const shownCount = (page) => page.evaluate(() => window.__dream?.shown() ?? 0);

// Resolves true once at least `count` slides have been shown, false after `seconds`.
const reaches = (page, count, seconds) =>
  page
    .waitForFunction((n) => (window.__dream?.shown() ?? 0) >= n, count, { timeout: seconds * 1000 })
    .then(() => true, () => false);

async function missingPictures() {
  const ready = JSON.parse(await readFile(path.join(root, 'images/index.json'), 'utf8'));
  const keep = ready.slice(0, 2);
  const allowPicture = (url) => keep.some((id) => url.endsWith(`/${id}.jpg`));
  const { page, errors } = await openPage({ width: 640, height: 360 }, { allowPicture });
  const ok = await reaches(page, 5, 40);
  check('missing pictures are skipped and the show goes on', ok, `${await shownCount(page)} slides shown with only ${keep.length} of ${ready.length} loadable`);
  check('missing pictures: no other errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function networkDrop() {
  let offline = false;
  const { page, errors } = await openPage({ width: 640, height: 360 }, { allowPicture: () => !offline });
  await reaches(page, 1, 10);
  offline = true;
  await sleep(10); // long enough for the next picture to fail to load
  const before = await shownCount(page);
  offline = false;
  const ok = await reaches(page, before + 1, 15);
  check('carries on after the network drops and comes back', ok, `${before} before the drop, ${await shownCount(page)} after`);
  check('network drop: no other errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function startOffline() {
  let offline = true;
  const { page, errors } = await openPage({ width: 640, height: 360 }, { allowPicture: () => !offline });
  await sleep(3);
  check('offline at start: says it will start by itself', /網路恢復/.test(await page.textContent('#caption')));
  offline = false;
  const ok = await reaches(page, 1, 15);
  check('offline at start: starts once pictures load', ok);
  check('offline at start: no other errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

try {
  await desktop();
  await phone();
  await missingPictures();
  await networkDrop();
  await startOffline();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
