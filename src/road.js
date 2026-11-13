// The road, as plain data. Nothing here touches three.js: given the session
// seed and how far the camera has travelled, these functions say what exists.
//
// The road runs along one axis and is cut into segments. A run of segments
// forms a zone, which sets the mood (colours, floor, how things move).

import { createRng, hashSeed } from './rng.js';
import { EMOJI } from './words.js';

export const SEGMENT_LENGTH = 20;
export const SEGMENTS_AHEAD = 6;
export const SEGMENTS_BEHIND = 1;
export const SEGMENTS_PER_ZONE = 8;
export const MAX_PER_SEGMENT = 18;
export const SPEED = 6; // units per second
export const MAX_DT = 0.1; // seconds; longer frame gaps are treated as this
export const FOG_NEAR = 15;
export const FOG_FAR = 95;
export const ROAD_HALF_WIDTH = 2.5; // kept clear so nothing sits on the camera
export const WORLD_HALF_WIDTH = 28;

const ZONE_SALT = 0x5a17;
const MOTIONS = ['spin', 'bob', 'orbit', 'pulse', 'cross'];
const SOLIDS = ['sphere', 'box', 'cone', 'cylinder'];
const FLOOR_PATTERNS = ['checker', 'stripes', 'dots', 'emoji'];
const MAX_SCALE = 24;
const MAX_CROSSING_SCALE = 3;
const BLEND_SEGMENTS = 2; // a zone's sky fades into the next over its last segments

export function stepDistance(distance, dtSeconds) {
  if (!(dtSeconds > 0)) return distance;
  return distance + SPEED * Math.min(dtSeconds, MAX_DT);
}

export function visibleSegments(distance) {
  const current = Math.floor(distance / SEGMENT_LENGTH);
  const out = [];
  for (let i = current - SEGMENTS_BEHIND; i <= current + SEGMENTS_AHEAD; i++) out.push(i);
  return out;
}

function hslToRgb(h, s, l) {
  const channel = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

export function makeZone(seed, zoneIndex) {
  const rng = createRng(hashSeed(hashSeed(seed, zoneIndex), ZONE_SALT));
  const hue = rng.next();
  return {
    sky: hslToRgb(hue, rng.range(0.3, 0.9), rng.range(0.25, 0.75)),
    floorA: hslToRgb((hue + rng.range(0.2, 0.8)) % 1, rng.range(0.3, 0.9), rng.range(0.2, 0.6)),
    floorB: hslToRgb(rng.next(), rng.range(0.2, 0.9), rng.range(0.4, 0.85)),
    floorPattern: rng.pick(FLOOR_PATTERNS),
    floorEmoji: rng.pick(EMOJI),
    scaleBias: rng.range(0.5, 3),
    density: rng.range(0.2, 1),
    motions: rng.shuffle(MOTIONS).slice(0, rng.int(1, 3)),
  };
}

function makeObject(rng, zone) {
  const motion = rng.chance(0.2) ? 'still' : rng.pick(zone.motions);
  const giant = rng.chance(0.08) ? rng.range(4, 9) : 1;
  const scale = Math.min(
    motion === 'cross' ? MAX_CROSSING_SCALE : MAX_SCALE,
    zone.scaleBias * rng.range(0.5, 2) * giant,
  );
  const side = rng.chance(0.5) ? 1 : -1;
  // Bigger things stand further from the road, so they loom instead of
  // swallowing the camera. Things that cross the road start near its middle.
  const x = motion === 'cross'
    ? rng.range(-5, 5)
    : side * rng.range(ROAD_HALF_WIDTH + scale * 0.6, WORLD_HALF_WIDTH);
  const lift = rng.chance(0.25) ? rng.range(1, 10) : 0;
  return {
    emoji: rng.pick(EMOJI),
    shape: rng.chance(0.45) ? 'billboard' : rng.pick(SOLIDS),
    x,
    y: scale / 2 + lift,
    z: rng.range(0, SEGMENT_LENGTH),
    scale,
    motion,
    speed: rng.range(0.3, 2),
    phase: rng.range(0, Math.PI * 2),
    hue: rng.next(), // tint of a solid's surface behind its emoji
  };
}

export function makeSegment(seed, segIndex) {
  const zoneIndex = Math.floor(segIndex / SEGMENTS_PER_ZONE);
  const zone = makeZone(seed, zoneIndex);
  const rng = createRng(hashSeed(seed, segIndex));
  const target = rng.int(2, 2 + Math.round(zone.density * 10));
  const objects = [];

  while (objects.length < target) {
    const base = makeObject(rng, zone);
    objects.push(base);
    if (!rng.chance(0.15)) continue;
    // A stack: the same spot, piled upward, moving as one.
    const extra = rng.int(1, 3);
    for (let k = 1; k <= extra && objects.length < MAX_PER_SEGMENT; k++) {
      objects.push({
        ...base,
        emoji: rng.pick(EMOJI),
        shape: rng.chance(0.45) ? 'billboard' : rng.pick(SOLIDS),
        y: base.y + base.scale * k,
      });
    }
  }
  return { index: segIndex, zoneIndex, objects };
}

export function skyAt(seed, distance) {
  const zoneFloat = distance / SEGMENT_LENGTH / SEGMENTS_PER_ZONE;
  const zoneIndex = Math.floor(zoneFloat);
  const window = BLEND_SEGMENTS / SEGMENTS_PER_ZONE;
  const t = Math.max(0, (zoneFloat - zoneIndex - (1 - window)) / window);
  if (t === 0) return makeZone(seed, zoneIndex).sky;
  const eased = t * t * (3 - 2 * t);
  const from = makeZone(seed, zoneIndex).sky;
  const to = makeZone(seed, zoneIndex + 1).sky;
  return from.map((c, i) => c + (to[i] - c) * eased);
}
