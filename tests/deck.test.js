import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createDeck } from '../src/deck.js';

const items = ['a', 'b', 'c', 'd', 'e'];

test('every item is dealt once before any repeats', () => {
  const deck = createDeck(items, createRng(1));
  for (let round = 0; round < 20; round++) {
    const dealt = items.map(() => deck.next());
    assert.deepEqual([...dealt].sort(), items);
  }
});

test('the same item never shows twice in a row, even across rounds', () => {
  for (let seed = 0; seed < 200; seed++) {
    const deck = createDeck(items, createRng(seed));
    let prev = deck.next();
    for (let i = 0; i < 30; i++) {
      const cur = deck.next();
      assert.notEqual(cur, prev, `seed ${seed}`);
      prev = cur;
    }
  }
});

test('order differs between seeds', () => {
  const first = (seed) => {
    const deck = createDeck(items, createRng(seed));
    return items.map(() => deck.next()).join('');
  };
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(first)).size > 1);
});

test('a single item is dealt forever', () => {
  const deck = createDeck(['only'], createRng(1));
  for (let i = 0; i < 5; i++) assert.equal(deck.next(), 'only');
});

test('does not change the list it was given', () => {
  const list = [...items];
  createDeck(list, createRng(1)).next();
  assert.deepEqual(list, items);
});
