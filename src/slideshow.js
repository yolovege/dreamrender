// The slideshow: one picture and one caption at a time, cross-fading every few
// seconds, drawn small and dithered so it looks like an old tape.

import { createRng } from './rng.js';
import { createDeck } from './deck.js';
import { dither } from './lofi.js';
import { parseScenes } from './scenes.js';

const SECONDS = 6; // from one picture starting to fade in to the next
const FADE = 1.2;
const CAPTION_FADE = 0.6; // matches the CSS transition on #caption
const SHORT_SIDE = 180; // pixels the picture is drawn at before being blown up
const ZOOM_FROM = 1.05;
const ZOOM_TO = 1.17;
const MAX_DT = 0.1; // a long pause (hidden tab) counts as this much time
const RETRY_SECONDS = 3; // wait after a whole round of pictures failed to load (offline)

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const captionBox = document.getElementById('caption');
const zhLine = document.getElementById('zh');
const enLine = document.getElementById('en');
const stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function say(zh, en) {
  zhLine.textContent = zh;
  enLine.textContent = en;
  captionBox.classList.add('on');
}

function loadPicture(scene) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
    img.onerror = () => resolve(null);
    img.src = `./images/${scene.id}.jpg`;
  });
}

function resize() {
  const scale = SHORT_SIDE / Math.min(window.innerWidth, window.innerHeight);
  canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
  canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
}

// Cover the canvas with the picture, pushing in slowly toward one corner.
function draw(slide) {
  const { img, age, drift } = slide;
  const t = Math.min(1, age / (SECONDS + FADE));
  const still = stillMotion.matches;
  const zoom = still ? ZOOM_FROM : ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * t;
  const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  const push = still ? 0 : t / 4;
  const dx = (drift & 1 ? 1 : -1) * (w - canvas.width) * push;
  const dy = (drift & 2 ? 1 : -1) * (h - canvas.height) * push;
  ctx.globalAlpha = Math.min(1, age / FADE);
  ctx.drawImage(img, (canvas.width - w) / 2 + dx, (canvas.height - h) / 2 + dy, w, h);
}

async function start() {
  const [tsv, ready] = await Promise.all([
    fetch('./data/scenes.tsv').then((r) => r.text()),
    fetch('./images/index.json').then((r) => r.json()),
  ]);
  const hasPicture = new Set(ready);
  const scenes = parseScenes(tsv).filter((scene) => hasPicture.has(scene.id));
  if (scenes.length === 0) throw new Error('no pictures yet');

  const deck = createDeck(scenes, createRng(Math.floor(Math.random() * 2 ** 32)));
  let upcoming = null; // the next slide, once its picture has loaded
  let shown = 0;

  // Keeps trying until a picture loads: if the connection drops, the show
  // holds the current picture and carries on once it is back.
  async function prepareNext() {
    for (;;) {
      for (let tries = 0; tries < scenes.length; tries++) {
        const scene = deck.next();
        const img = await loadPicture(scene);
        if (img) {
          upcoming = { scene, img, age: 0, drift: 0 };
          return;
        }
      }
      if (shown === 0) say('夢還在路上，網路恢復後會自己開始。', 'The dream is on its way. It will start once the connection is back.');
      await new Promise((resolve) => setTimeout(resolve, RETRY_SECONDS * 1000));
    }
  }

  const slides = []; // oldest first; at most two while cross-fading

  function bringOnNext() {
    const slide = upcoming;
    upcoming = null;
    slide.drift = shown++;
    slides.push(slide);
    say(slide.scene.zh, slide.scene.en);
    prepareNext();
  }

  await prepareNext();
  resize();
  window.addEventListener('resize', resize);
  bringOnNext();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
    last = now;
    for (const slide of slides) slide.age += dt;

    const newest = slides[slides.length - 1];
    if (upcoming && newest.age >= SECONDS - CAPTION_FADE) captionBox.classList.remove('on');
    if (upcoming && newest.age >= SECONDS) bringOnNext();
    if (slides.length > 1 && slides[slides.length - 1].age >= FADE) slides.splice(0, slides.length - 1);

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const slide of slides) draw(slide);
    const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    dither(frameData.data, canvas.width, canvas.height);
    ctx.putImageData(frameData, 0, 0);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Read by scripts/smoke.mjs.
  window.__dream = { shown: () => shown, pictures: () => scenes.length };
}

start().catch((error) => {
  console.error(error);
  say('夢載入失敗，請重新整理。', 'The dream failed to load. Please refresh.');
});
