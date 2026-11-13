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

async function openPage(viewport, { onlyPictures } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // A deliberately missing picture logs a 404; that is the case under test.
    if (message.type() === 'error' && !(onlyPictures && /404/.test(message.text()))) {
      errors.push(message.text());
    }
  });
  if (onlyPictures) {
    await page.route('**/images/*.jpg', (route) =>
      onlyPictures.some((id) => route.request().url().endsWith(`/${id}.jpg`))
        ? route.continue()
        : route.fulfill({ status: 404, body: '' }),
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
  await page.screenshot({ path: path.join(outDir, 'phone.png') });
  check('phone: no errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function missingPictures() {
  const ready = JSON.parse(await readFile(path.join(root, 'images/index.json'), 'utf8'));
  const keep = ready.slice(0, 2);
  const { page, errors } = await openPage({ width: 640, height: 360 }, { onlyPictures: keep });
  await sleep(14);
  const shown = await page.evaluate(() => window.__dream.shown());
  check('missing pictures are skipped and the show goes on', shown >= 3, `${shown} slides shown with only ${keep.length} loadable`);
  check('missing pictures: no other errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

try {
  await desktop();
  await phone();
  await missingPictures();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
