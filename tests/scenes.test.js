import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parseScenes } from '../src/scenes.js';

const tsv = await readFile(new URL('../data/scenes.tsv', import.meta.url), 'utf8');
const scenes = parseScenes(tsv);
const ready = JSON.parse(await readFile(new URL('../images/index.json', import.meta.url), 'utf8'));
const files = (await readdir(new URL('../images/', import.meta.url))).filter((f) => f.endsWith('.jpg'));

test('parseScenes reads tab-separated lines and skips comments and blanks', () => {
  const parsed = parseScenes('# header\n001\t甲乙。\tan apple\n\n002\t丙丁？\ta pear\n');
  assert.deepEqual(parsed, [
    { id: '001', caption: '甲乙。', prompt: 'an apple' },
    { id: '002', caption: '丙丁？', prompt: 'a pear' },
  ]);
});

test('parseScenes tolerates Windows line endings', () => {
  assert.deepEqual(parseScenes('001\t甲。\tx\r\n'), [{ id: '001', caption: '甲。', prompt: 'x' }]);
});

test('parseScenes rejects a line without three columns, naming the line', () => {
  assert.throws(() => parseScenes('001\t甲。\tx\n002\t乙。\n'), /line 2/);
});

test('the scene list has 500 well-formed scenes with unique ids', () => {
  assert.ok(scenes.length >= 500, `only ${scenes.length}`);
  assert.equal(new Set(scenes.map((s) => s.id)).size, scenes.length);
  for (const s of scenes) {
    assert.match(s.id, /^\d{3,}$/, `bad id ${s.id}`);
    const length = [...s.caption].length;
    assert.ok(length >= 8 && length <= 45, `caption length ${length}: ${s.caption}`);
    assert.match(s.caption, /[。？！]$/, `caption ending: ${s.caption}`);
    assert.ok(s.prompt.length >= 20, `prompt too short for ${s.id}`);
  }
});

test('images/index.json lists exactly the pictures on disk, all for known scenes', () => {
  const ids = new Set(scenes.map((s) => s.id));
  assert.deepEqual([...ready].sort(), files.map((f) => f.replace(/\.jpg$/, '')).sort());
  for (const id of ready) assert.ok(ids.has(id), `picture ${id} has no scene`);
});
