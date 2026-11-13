import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { EMOJI, NOUNS, VERBS, PLACES, ADJECTIVES, TIMES, TEMPLATES } from '../src/words.js';
import { WRITTEN } from '../src/captions-written.js';
import { makeSentence, createCaptionStream } from '../src/captions.js';

const length = (s) => [...s].length;
const wellFormed = (s) =>
  length(s) >= 8 && length(s) <= 45 && /[。？！]$/.test(s) && !/[{}]/.test(s);

test('emoji list is big, unique, and single-codepoint only', () => {
  assert.ok(EMOJI.length >= 200, `only ${EMOJI.length}`);
  assert.equal(new Set(EMOJI).size, EMOJI.length);
  for (const e of EMOJI) {
    assert.equal(length(e.replaceAll('️', '')), 1, `not a single codepoint: ${e}`);
  }
});

test('written captions: exactly 500, unique, well formed', () => {
  assert.equal(WRITTEN.length, 500);
  assert.equal(new Set(WRITTEN).size, 500);
  for (const s of WRITTEN) assert.ok(wellFormed(s), `malformed: ${s}`);
});

test('every template fits the caption box with the longest and shortest words', () => {
  const lists = { noun: NOUNS, verb: VERBS, place: PLACES, adj: ADJECTIVES, time: TIMES };
  const extreme = (key, cmp) =>
    key === 'num'
      ? cmp > 0 ? '99' : '2'
      : [...lists[key]].sort((a, b) => cmp * (length(b) - length(a)))[0];
  assert.ok(TEMPLATES.length >= 25);
  for (const t of TEMPLATES) {
    const longest = t.replace(/\{(\w+)\}/g, (_, k) => extreme(k, 1));
    const shortest = t.replace(/\{(\w+)\}/g, (_, k) => extreme(k, -1));
    assert.ok(wellFormed(longest), `too long: ${longest}`);
    assert.ok(wellFormed(shortest), `too short: ${shortest}`);
  }
});

test('generated sentences are well formed and varied', () => {
  const seen = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const s = makeSentence(createRng(seed));
    assert.ok(wellFormed(s), `malformed: ${s}`);
    seen.add(s);
  }
  assert.ok(seen.size >= 450, `only ${seen.size} distinct`);
});

test('stream never shows the same caption twice in a row', () => {
  const stream = createCaptionStream(createRng(1));
  let prev = stream.next();
  for (let i = 0; i < 2000; i++) {
    const cur = stream.next();
    assert.notEqual(cur, prev);
    prev = cur;
  }
});

test('stream uses up every written caption before repeating one', () => {
  const stream = createCaptionStream(createRng(2));
  const written = new Set(WRITTEN);
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    const s = stream.next();
    if (!written.has(s)) continue;
    assert.ok(!seen.has(s), `repeated early: ${s}`);
    seen.add(s);
  }
});

test('stream mixes written and generated captions about 60/40', () => {
  const stream = createCaptionStream(createRng(3));
  const written = new Set(WRITTEN);
  let fromWritten = 0;
  for (let i = 0; i < 2000; i++) if (written.has(stream.next())) fromWritten++;
  const share = fromWritten / 2000;
  assert.ok(share >= 0.5 && share <= 0.7, `written share ${share}`);
});

test('stream accepts a custom written list', () => {
  const stream = createCaptionStream(createRng(4), ['甲甲甲甲甲甲甲甲。', '乙乙乙乙乙乙乙乙。']);
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(stream.next());
  assert.ok(seen.has('甲甲甲甲甲甲甲甲。') && seen.has('乙乙乙乙乙乙乙乙。'));
});
