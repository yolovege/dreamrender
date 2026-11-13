import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJI } from '../src/words.js';
import {
  SEGMENT_LENGTH, SEGMENTS_AHEAD, SEGMENTS_BEHIND, SEGMENTS_PER_ZONE, MAX_PER_SEGMENT,
  SPEED, MAX_DT, ROAD_HALF_WIDTH, WORLD_HALF_WIDTH,
  stepDistance, visibleSegments, makeZone, makeSegment, skyAt,
} from '../src/road.js';

const SEED = 20261113;
const LIVE = SEGMENTS_AHEAD + SEGMENTS_BEHIND + 1;
const SHAPES = ['billboard', 'sphere', 'box', 'cone', 'cylinder'];

test('stepDistance moves at SPEED for an ordinary frame', () => {
  assert.ok(Math.abs(stepDistance(0, 1 / 60) - SPEED / 60) < 1e-12);
});

test('stepDistance caps a huge frame gap (tab was in the background)', () => {
  assert.equal(stepDistance(0, 600), SPEED * MAX_DT);
});

test('stepDistance ignores zero, negative and NaN frame times', () => {
  assert.equal(stepDistance(5, 0), 5);
  assert.equal(stepDistance(5, -1), 5);
  assert.equal(stepDistance(5, NaN), 5);
});

test('visibleSegments is a fixed-size window around the camera', () => {
  const start = visibleSegments(0);
  assert.equal(start.length, LIVE);
  assert.ok(start.includes(0));
  assert.ok(start.includes(-SEGMENTS_BEHIND));
  assert.ok(start.includes(SEGMENTS_AHEAD));
});

test('visibleSegments still works after a very long run', () => {
  const far = visibleSegments(1e9);
  assert.equal(far.length, LIVE);
  assert.ok(far.every(Number.isInteger));
  assert.ok(far.includes(Math.floor(1e9 / SEGMENT_LENGTH)));
});

test('visibleSegments swaps exactly one segment per segment travelled', () => {
  for (const d of [0, 7, 12345.6]) {
    const before = new Set(visibleSegments(d));
    const after = visibleSegments(d + SEGMENT_LENGTH);
    assert.equal(after.filter((i) => !before.has(i)).length, 1);
  }
});

test('the live window can never exceed the 150 object cap', () => {
  assert.ok(LIVE * MAX_PER_SEGMENT <= 150);
});

test('makeSegment is deterministic and differs between segments', () => {
  assert.deepEqual(makeSegment(SEED, 12), makeSegment(SEED, 12));
  assert.notDeepEqual(makeSegment(SEED, 12).objects, makeSegment(SEED, 13).objects);
  assert.notDeepEqual(makeSegment(SEED, 12).objects, makeSegment(SEED + 1, 12).objects);
});

test('negative segment indices are valid road too', () => {
  const seg = makeSegment(SEED, -1);
  assert.equal(seg.index, -1);
  assert.equal(seg.zoneIndex, -1);
  assert.ok(seg.objects.length >= 1);
});

test('every object over 1000 segments is well formed', () => {
  const emoji = new Set(EMOJI);
  const shapes = new Set();
  const used = new Set();
  for (let i = 0; i < 1000; i++) {
    const seg = makeSegment(SEED, i);
    assert.equal(seg.index, i);
    assert.equal(seg.zoneIndex, Math.floor(i / SEGMENTS_PER_ZONE));
    assert.ok(seg.objects.length >= 1 && seg.objects.length <= MAX_PER_SEGMENT, `count ${seg.objects.length}`);
    const allowed = new Set([...makeZone(SEED, seg.zoneIndex).motions, 'still']);
    for (const o of seg.objects) {
      assert.ok(emoji.has(o.emoji));
      assert.ok(SHAPES.includes(o.shape));
      assert.ok(allowed.has(o.motion), `motion ${o.motion} not in zone`);
      for (const key of ['x', 'y', 'z', 'scale', 'speed', 'phase']) {
        assert.ok(Number.isFinite(o[key]), `${key} = ${o[key]}`);
      }
      assert.ok(o.z >= 0 && o.z <= SEGMENT_LENGTH);
      assert.ok(Math.abs(o.x) <= WORLD_HALF_WIDTH);
      assert.ok(o.scale > 0);
      assert.ok(o.y >= 0);
      if (o.motion !== 'cross') assert.ok(Math.abs(o.x) >= ROAD_HALF_WIDTH, `x ${o.x} blocks the road`);
      shapes.add(o.shape);
      used.add(o.emoji);
    }
  }
  assert.deepEqual([...shapes].sort(), [...SHAPES].sort());
  assert.ok(used.size >= 150, `only ${used.size} distinct emoji`);
});

test('zones have valid colours and differ from each other', () => {
  const skies = new Set();
  for (let z = 0; z < 20; z++) {
    const zone = makeZone(SEED, z);
    for (const colour of [zone.sky, zone.floorA, zone.floorB]) {
      assert.equal(colour.length, 3);
      for (const c of colour) assert.ok(c >= 0 && c <= 1);
    }
    assert.ok(['checker', 'stripes', 'dots', 'emoji'].includes(zone.floorPattern));
    assert.ok(EMOJI.includes(zone.floorEmoji));
    assert.ok(zone.scaleBias >= 0.5 && zone.scaleBias <= 3);
    assert.ok(zone.density >= 0 && zone.density <= 1);
    assert.ok(zone.motions.length >= 1 && zone.motions.length <= 3);
    skies.add(zone.sky.join());
  }
  assert.ok(skies.size >= 19);
  assert.deepEqual(makeZone(SEED, 3), makeZone(SEED, 3));
});

test('skyAt equals the zone sky in the middle of a zone', () => {
  const zoneLength = SEGMENT_LENGTH * SEGMENTS_PER_ZONE;
  assert.deepEqual(skyAt(SEED, zoneLength * 4.5), makeZone(SEED, 4).sky);
});

test('skyAt never jumps, including across zone borders', () => {
  let prev = skyAt(SEED, 0);
  for (let d = 0.5; d <= 2000; d += 0.5) {
    const cur = skyAt(SEED, d);
    for (let c = 0; c < 3; c++) {
      assert.ok(Math.abs(cur[c] - prev[c]) < 0.05, `jump at ${d}`);
    }
    prev = cur;
  }
});
