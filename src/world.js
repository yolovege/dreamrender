// Turns the road data from road.js into three.js objects and keeps them in
// step with the camera. The camera never moves forward: it stays at the origin
// looking down -z, and every segment slides toward it. Distances stay small, so
// the picture is as steady after ten hours as after ten seconds.

import * as THREE from 'three';
import { drawEmoji, emojiTexture, pixelTexture } from './emoji-texture.js';
import {
  SEGMENT_LENGTH, WORLD_HALF_WIDTH, FOG_NEAR, FOG_FAR,
  visibleSegments, makeSegment, makeZone, skyAt,
} from './road.js';

const FLOOR_WIDTH = 400;
const FLOOR_TILE = 4; // world units per repeat of the floor pattern
const TILE_PIXELS = 64;

const GEOMETRY = {
  billboard: new THREE.PlaneGeometry(1, 1),
  sphere: new THREE.SphereGeometry(0.5, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
};
const FLOOR_GEOMETRY = new THREE.PlaneGeometry(FLOOR_WIDTH, SEGMENT_LENGTH).rotateX(-Math.PI / 2);

const css = ([r, g, b]) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

function floorTexture(zone) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_PIXELS;
  const ctx = canvas.getContext('2d');
  const half = TILE_PIXELS / 2;
  ctx.fillStyle = css(zone.floorA);
  ctx.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
  ctx.fillStyle = css(zone.floorB);
  if (zone.floorPattern === 'checker') {
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
  } else if (zone.floorPattern === 'stripes') {
    ctx.fillRect(0, 0, TILE_PIXELS, half / 2);
    ctx.fillRect(0, half, TILE_PIXELS, half / 2);
  } else if (zone.floorPattern === 'dots') {
    ctx.beginPath();
    ctx.arc(half, half, half * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawEmoji(ctx, zone.floorEmoji, TILE_PIXELS);
  }
  const texture = pixelTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_WIDTH / FLOOR_TILE, SEGMENT_LENGTH / FLOOR_TILE);
  return texture;
}

export function createWorld(scene, seed) {
  const live = new Map(); // segment index -> { group, items, zoneIndex }
  const floors = new Map(); // zone index -> { material, users }
  const boards = new Map(); // emoji -> shared billboard material

  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(0.4, 1, 0.6);
  scene.add(sun);

  function boardMaterial(emoji) {
    let material = boards.get(emoji);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        map: emojiTexture(emoji), alphaTest: 0.5, side: THREE.DoubleSide,
      });
      boards.set(emoji, material);
    }
    return material;
  }

  function solidMaterial(spec) {
    return new THREE.MeshLambertMaterial({
      map: emojiTexture(spec.emoji, true),
      color: new THREE.Color().setHSL(spec.hue, 0.7, 0.7, THREE.SRGBColorSpace),
      flatShading: true,
    });
  }

  function takeFloor(zoneIndex) {
    let floor = floors.get(zoneIndex);
    if (!floor) {
      floor = {
        material: new THREE.MeshBasicMaterial({ map: floorTexture(makeZone(seed, zoneIndex)) }),
        users: 0,
      };
      floors.set(zoneIndex, floor);
    }
    floor.users++;
    return floor.material;
  }

  function releaseFloor(zoneIndex) {
    const floor = floors.get(zoneIndex);
    if (--floor.users > 0) return;
    floor.material.map.dispose();
    floor.material.dispose();
    floors.delete(zoneIndex);
  }

  function build(index) {
    const segment = makeSegment(seed, index);
    const group = new THREE.Group();

    const floor = new THREE.Mesh(FLOOR_GEOMETRY, takeFloor(segment.zoneIndex));
    floor.position.z = -SEGMENT_LENGTH / 2;
    group.add(floor);

    const items = segment.objects.map((spec) => {
      const flat = spec.shape === 'billboard';
      const mesh = new THREE.Mesh(
        GEOMETRY[spec.shape],
        flat ? boardMaterial(spec.emoji) : solidMaterial(spec),
      );
      mesh.scale.setScalar(spec.scale);
      group.add(mesh);
      return { mesh, spec, flat };
    });

    scene.add(group);
    return { group, items, zoneIndex: segment.zoneIndex };
  }

  function remove(entry) {
    scene.remove(entry.group);
    for (const { mesh, flat } of entry.items) if (!flat) mesh.material.dispose();
    releaseFloor(entry.zoneIndex);
  }

  // Positions depend only on the clock, never on the previous frame, so a
  // skipped frame or a long pause cannot leave anything out of place.
  function place({ mesh, spec, flat }, time, camera) {
    const angle = time * spec.speed + spec.phase;
    let x = spec.x;
    let y = spec.y;
    let z = -spec.z;
    let scale = spec.scale;
    let turn = 0;

    if (spec.motion === 'spin') turn = angle;
    else if (spec.motion === 'bob') y += (0.5 + 0.5 * Math.sin(angle)) * spec.scale;
    else if (spec.motion === 'pulse') scale *= 1 + 0.5 * Math.sin(angle);
    else if (spec.motion === 'cross') x += Math.sin(angle * 0.5) * WORLD_HALF_WIDTH * 0.8;
    else if (spec.motion === 'orbit') {
      const radius = Math.max(1, spec.scale);
      y += radius + Math.cos(angle) * radius;
      z += Math.sin(angle) * radius;
    }

    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    if (flat) {
      mesh.quaternion.copy(camera.quaternion);
      if (turn) mesh.rotateZ(turn);
    } else {
      mesh.rotation.y = turn + spec.phase;
    }
  }

  return {
    update(distance, time, camera) {
      const wanted = visibleSegments(distance);
      const keep = new Set(wanted);
      for (const [index, entry] of live) {
        if (keep.has(index)) continue;
        remove(entry);
        live.delete(index);
      }
      for (const index of wanted) if (!live.has(index)) live.set(index, build(index));

      for (const [index, entry] of live) {
        entry.group.position.z = distance - index * SEGMENT_LENGTH;
        for (const item of entry.items) place(item, time, camera);
      }

      const [r, g, b] = skyAt(seed, distance);
      scene.background.setRGB(r, g, b, THREE.SRGBColorSpace);
      scene.fog.color.copy(scene.background);
    },

    stats() {
      let objects = 0;
      for (const entry of live.values()) objects += entry.items.length;
      return { segments: live.size, objects, floors: floors.size };
    },
  };
}
