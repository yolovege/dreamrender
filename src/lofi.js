// The worn-tape look: squeeze each colour channel down to a few levels and
// break up the bands with a 4x4 ordered dither. Works on canvas ImageData.

export const LEVELS = 6;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const STEP = 255 / (LEVELS - 1);

export function dither(data, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const threshold = (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16;
      const p = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[p + c] = Math.floor(data[p + c] / STEP + threshold) * STEP;
      }
    }
  }
}
