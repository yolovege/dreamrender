import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../src/rng.js';

test('same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds give different sequences', () => {
  const a = createRng(1);
  const b = createRng(2);
  const same = Array.from({ length: 10 }, () => a.next() === b.next());
  assert.ok(same.includes(false));
});

test('next stays in [0,1) and is roughly uniform', () => {
  const r = createRng(7);
  let sum = 0;
  for (let i = 0; i < 10000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  const mean = sum / 10000;
  assert.ok(mean > 0.45 && mean < 0.55, `mean ${mean}`);
});

test('range stays inside its bounds', () => {
  const r = createRng(9);
  for (let i = 0; i < 1000; i++) {
    const v = r.range(-2, 3);
    assert.ok(v >= -2 && v < 3);
  }
});

test('int covers both ends and nothing else', () => {
  const r = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(r.int(3, 5));
  assert.deepEqual([...seen].sort(), [3, 4, 5]);
});

test('chance(0) never fires and chance(1) always fires', () => {
  const r = createRng(5);
  for (let i = 0; i < 100; i++) {
    assert.equal(r.chance(0), false);
    assert.equal(r.chance(1), true);
  }
});

test('pick returns members of the array', () => {
  const r = createRng(11);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('shuffle keeps the elements and leaves the input alone', () => {
  const r = createRng(13);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = [...arr];
  const out = r.shuffle(arr);
  assert.deepEqual(arr, copy);
  assert.notEqual(out, arr);
  assert.deepEqual([...out].sort((x, y) => x - y), copy);
});

test('hashSeed is deterministic, order-sensitive and a uint32', () => {
  assert.equal(hashSeed(1, 2), hashSeed(1, 2));
  assert.notEqual(hashSeed(1, 2), hashSeed(2, 1));
  for (const n of [-5, 0, 1, 1e9]) {
    const h = hashSeed(123, n);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  }
});
