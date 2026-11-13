// The cheap-dream look. Three tricks, all borrowed from 1990s consoles:
//  1. draw the scene 180 pixels on its short side and let the browser blow it up unsmoothed
//     (the canvas has `image-rendering: pixelated`);
//  2. snap every vertex to a coarse screen grid, so shapes wobble as they move;
//  3. squeeze colours down to a few levels per channel with an ordered dither.

import * as THREE from 'three';

const SHORT_SIDE = 180;
const COLOUR_LEVELS = 6;
const SNAP_GRID = 'vec2(160.0, 90.0)'; // half-steps across the screen

const POST_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const POST_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  varying vec2 vUv;

  const float LEVELS = ${COLOUR_LEVELS.toFixed(1)};
  const float BAYER[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );

  // The scene is drawn in linear light; screens want sRGB.
  vec3 toDisplay(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 colour = toDisplay(clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0));
    ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
    float threshold = (BAYER[cell.x + cell.y * 4] + 0.5) / 16.0;
    gl_FragColor = vec4(floor(colour * (LEVELS - 1.0) + threshold) / (LEVELS - 1.0), 1.0);
  }
`;

export function createLofi(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
  });
  const screen = new THREE.Scene();
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  screen.add(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tScene: { value: target.texture } },
      vertexShader: POST_VERTEX,
      fragmentShader: POST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }),
  ));

  let width = 1;
  let height = 1;

  return {
    resize(widthCss, heightCss) {
      const scale = SHORT_SIDE / Math.min(widthCss, heightCss);
      width = Math.max(1, Math.round(widthCss * scale));
      height = Math.max(1, Math.round(heightCss * scale));
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false); // false: CSS keeps it full-screen
      target.setSize(width, height);
    },

    render(scene, camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(screen, screenCamera);
    },

    size: () => ({ width, height }),
  };
}

// Makes a material's vertices land on a coarse grid. Returns the same material.
export function snapVertices(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      /* glsl */ `#include <project_vertex>
      if (gl_Position.w > 0.01) {
        vec2 grid = ${SNAP_GRID};
        gl_Position.xy = floor(gl_Position.xy / gl_Position.w * grid + 0.5) / grid * gl_Position.w;
      }`,
    );
  };
  material.customProgramCacheKey = () => 'snap';
  return material;
}
