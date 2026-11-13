import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dither, LEVELS } from '../src/lofi.js';

const STEP = 255 / (LEVELS - 1);
const image = (w, h, fill) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) data.set(fill(p % w, Math.floor(p / w)), p * 4);
  return data;
};

test('every colour channel ends up on one of the six levels', () => {
  assert.equal(LEVELS, 6);
  const data = image(16, 16, (x, y) => [x * 16, y * 16, (x + y) * 8, 200]);
  dither(data, 16, 16);
  const allowed = new Set(Array.from({ length: LEVELS }, (_, i) => Math.round(i * STEP)));
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;
    assert.ok(allowed.has(data[i]), `value ${data[i]} at ${i}`);
  }
});

test('alpha is left alone', () => {
  const data = image(4, 4, () => [10, 20, 30, 77]);
  dither(data, 4, 4);
  for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 77);
});

test('a flat mid-tone becomes a pattern of the two nearest levels averaging to it', () => {
  const grey = 128;
  const data = image(8, 8, () => [grey, grey, grey, 255]);
  dither(data, 8, 8);
  const reds = [];
  for (let i = 0; i < data.length; i += 4) reds.push(data[i]);
  assert.deepEqual([...new Set(reds)].sort((a, b) => a - b), [102, 153]);
  const mean = reds.reduce((a, b) => a + b, 0) / reds.length;
  assert.ok(Math.abs(mean - grey) < STEP / 4, `mean ${mean}`);
});

test('black and white stay black and white', () => {
  const data = image(4, 4, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  dither(data, 4, 4);
  for (let p = 0; p < 16; p++) {
    const expected = p % 4 < 2 ? 0 : 255;
    assert.deepEqual([...data.slice(p * 4, p * 4 + 3)], [expected, expected, expected]);
  }
});
