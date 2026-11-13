// Boot and main loop: a camera that drifts forward forever, and a caption.

import * as THREE from 'three';
import { createRng } from './rng.js';
import { createCaptionStream } from './captions.js';
import { MAX_DT, stepDistance } from './road.js';
import { createWorld } from './world.js';

const EYE_HEIGHT = 1.7;
const CAPTION_SECONDS = 6;
const CAPTION_FADE_SECONDS = 0.6; // matches the CSS transition on #caption

const canvas = document.getElementById('view');
const captionBox = document.getElementById('caption');
const fpsBox = document.getElementById('fps');

function createRenderer() {
  // Probe on a throwaway canvas: asking the real one would fix its settings.
  if (!document.createElement('canvas').getContext('webgl2')) return null;
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  } catch {
    return null;
  }
}

function start(renderer) {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.rotation.order = 'YXZ';
  const world = createWorld(scene, seed);
  const captions = createCaptionStream(createRng(seed));

  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (event) => {
    if (event.key === 'f' || event.key === 'F') fpsBox.hidden = !fpsBox.hidden;
  });

  let distance = 0;
  let time = 0; // seconds of dream, with long pauses squeezed out
  let frames = 0;
  let last = performance.now();
  let captionAge = CAPTION_SECONDS; // so the first caption appears at once
  let fpsFrames = 0;
  let fpsSince = last;

  function sleepwalk() {
    camera.position.set(Math.sin(time * 0.4) * 0.6, EYE_HEIGHT + Math.sin(time * 1.7) * 0.08, 0);
    camera.rotation.set(Math.sin(time * 0.17) * 0.06, Math.sin(time * 0.13) * 0.35, Math.sin(time * 0.21) * 0.04);
    camera.updateMatrixWorld();
  }

  function caption(dt) {
    captionAge += dt;
    if (captionAge >= CAPTION_SECONDS) {
      captionBox.textContent = captions.next();
      captionBox.classList.add('on');
      captionAge = 0;
    } else if (captionAge >= CAPTION_SECONDS - CAPTION_FADE_SECONDS) {
      captionBox.classList.remove('on');
    }
  }

  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
    last = now;
    distance = stepDistance(distance, dt);
    time += dt;

    sleepwalk();
    world.update(distance, time, camera);
    caption(dt);
    renderer.render(scene, camera);

    frames++;
    fpsFrames++;
    if (now - fpsSince >= 1000) {
      if (!fpsBox.hidden) fpsBox.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} fps`;
      fpsFrames = 0;
      fpsSince = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Read by scripts/smoke.mjs.
  window.__dream = {
    distance: () => distance,
    frames: () => frames,
    stats: () => world.stats(),
    info: () => ({
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    }),
  };
}

const renderer = createRenderer();
if (renderer) start(renderer);
else document.getElementById('nogl').hidden = false;
