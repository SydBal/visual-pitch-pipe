/**
 * Unit tests for src/camera/keySignature.ts.
 *
 * Draws synthetic sharp/flat glyphs on a synthetic staff, then checks
 * classification and counting. Compile + run:
 *   npx tsc src/camera/geometry.ts src/camera/keySignature.ts \
 *     src/camera/__tests__/keySignature.test.ts \
 *     --outDir /tmp/camtest --module commonjs --target es2022 --strict --skipLibCheck
 *   node /tmp/camtest/__tests__/keySignature.test.js
 */
import { binarize, detectStaff, renderSyntheticStaff } from '../geometry';
import { detectKeySignature, keyTapROI } from '../keySignature';

const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  else console.log(`ok: ${name}`);
}

function setPx(gray: Uint8ClampedArray, width: number, height: number, x: number, y: number): void {
  if (x >= 0 && x < width && y >= 0 && y < height) gray[y * width + x] = 0;
}

/** Two vertical bars + two horizontal bars, ~2 staff spaces tall. */
function drawSharp(gray: Uint8ClampedArray, width: number, height: number, x: number, y0: number, space: number): void {
  const h = Math.round(space * 2);
  for (let y = y0; y < y0 + h; y++) {
    for (let dx = 0; dx < 3; dx++) {
      setPx(gray, width, height, x - 4 + dx, y);
      setPx(gray, width, height, x + 4 + dx, y);
    }
  }
  for (const hy of [y0 + Math.round(h * 0.28), y0 + Math.round(h * 0.66)]) {
    for (let xx = x - 10; xx <= x + 10; xx++) {
      for (let dy = 0; dy < 3; dy++) setPx(gray, width, height, xx, hy + dy);
    }
  }
}

/** Tall vertical bar + filled bulb, ~2.8 staff spaces tall. */
function drawFlat(gray: Uint8ClampedArray, width: number, height: number, x: number, y0: number, space: number): void {
  const h = Math.round(space * 2.8);
  for (let y = y0; y < y0 + h; y++) {
    for (let dx = 0; dx < 3; dx++) setPx(gray, width, height, x + dx, y);
  }
  const cx = x + 4;
  const cy = y0 + h - 14;
  const rx = 7;
  const ry = 12;
  for (let yy = cy - ry; yy <= cy + ry; yy++) {
    for (let xx = cx - rx; xx <= cx + rx; xx++) {
      const nx = (xx - cx) / rx;
      const ny = (yy - cy) / ry;
      if (nx * nx + ny * ny <= 1) setPx(gray, width, height, xx, yy);
    }
  }
}

function setup(draw: (gray: Uint8ClampedArray, width: number, height: number, space: number) => void) {
  const space = 24;
  const { gray, width, height } = renderSyntheticStaff({ topY: 120, staffSpace: space, slope: 0 });
  draw(gray, width, height, space);
  const binary = binarize(gray, width, height);
  const staff = detectStaff(binary, width, height);
  if (!staff) throw new Error('staff not detected in key-signature test setup');
  return { binary, width, height, staff, space };
}

// 1. Three sharps -> { type: 'sharp', count: 3 }.
{
  const { binary, width, height, staff } = setup((gray, w, h, sp) => {
    drawSharp(gray, w, h, 100, 130, sp);
    drawSharp(gray, w, h, 145, 130, sp);
    drawSharp(gray, w, h, 190, 130, sp);
  });
  const det = detectKeySignature(binary, width, height, staff);
  check('3 sharps: type', det.type === 'sharp', `got ${det.type}`);
  check('3 sharps: count', det.count === 3, `got ${det.count}`);
  check('3 sharps: confidence', det.confidence > 0.5, `got ${det.confidence}`);
}

// 2. Two flats -> { type: 'flat', count: 2 }.
{
  const { binary, width, height, staff } = setup((gray, w, h, sp) => {
    drawFlat(gray, w, h, 100, 130, sp);
    drawFlat(gray, w, h, 150, 130, sp);
  });
  const det = detectKeySignature(binary, width, height, staff);
  check('2 flats: type', det.type === 'flat', `got ${det.type}`);
  check('2 flats: count', det.count === 2, `got ${det.count}`);
}

// 3. No glyphs -> count 0 (reads as C major).
{
  const { binary, width, height, staff } = setup(() => undefined);
  const det = detectKeySignature(binary, width, height, staff);
  check('empty: count 0', det.count === 0, `got ${det.count}`);
  check('empty: some confidence', det.confidence > 0.2, `got ${det.confidence}`);
}

// 4. Mixed run breaks at the type change: sharp sharp flat -> count 2 sharps.
{
  const { binary, width, height, staff } = setup((gray, w, h, sp) => {
    drawSharp(gray, w, h, 100, 130, sp);
    drawSharp(gray, w, h, 145, 130, sp);
    drawFlat(gray, w, h, 195, 130, sp);
  });
  const det = detectKeySignature(binary, width, height, staff);
  check('mixed: type sharp', det.type === 'sharp', `got ${det.type}`);
  check('mixed: count 2', det.count === 2, `got ${det.count}`);
}

// 5. Tap-driven ROI: tap on the glyphs detects them; tap elsewhere finds nothing.
{
  const { binary, width, height, staff } = setup((gray, w, h, sp) => {
    drawSharp(gray, w, h, 100, 130, sp);
    drawSharp(gray, w, h, 145, 130, sp);
  });
  const onTap = keyTapROI(122, staff, width, height);
  const detOn = detectKeySignature(binary, width, height, staff, onTap);
  check('tap ROI on glyphs: 2 sharps', detOn.type === 'sharp' && detOn.count === 2,
    `got ${detOn.type} x${detOn.count}`);
  const offTap = keyTapROI(500, staff, width, height);
  const detOff = detectKeySignature(binary, width, height, staff, offTap);
  check('tap ROI away from glyphs: count 0', detOff.count === 0, `got ${detOff.count}`);
  check('tap ROI is bounded', onTap.x0 >= 0 && onTap.y0 >= 0 && onTap.x1 <= width && onTap.y1 <= height);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):\n- ${failures.join('\n- ')}`);
  throw new Error('key-signature tests failed');
}
console.log('\nAll key-signature tests passed.');
