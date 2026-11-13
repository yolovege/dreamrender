// Emoji drawn onto tiny canvases and used as textures. One texture per emoji
// (two, counting the opaque variant), kept for the life of the page: the emoji
// list is fixed, so the cache cannot grow past twice its length.

import * as THREE from 'three';

const SIZE = 64;
const FONT = `${SIZE * 0.78}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
const cache = new Map();

export function drawEmoji(ctx, emoji, size) {
  ctx.font = FONT.replace(/^[\d.]+px/, `${size * 0.78}px`);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.06);
}

export function pixelTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

// backdrop: false gives a see-through cutout (for flat boards);
// true gives the emoji on white, repeated, to wrap around a solid and be tinted.
export function emojiTexture(emoji, backdrop = false) {
  const key = backdrop ? `${emoji}|backdrop` : emoji;
  let texture = cache.get(key);
  if (texture) return texture;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (backdrop) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  drawEmoji(ctx, emoji, SIZE);

  texture = pixelTexture(canvas);
  if (backdrop) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
  }
  cache.set(key, texture);
  return texture;
}
