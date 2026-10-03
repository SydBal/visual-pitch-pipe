/**
 * Unit tests for src/camera/keySignature.ts (tap-ROI pipeline).
 *
 * Draws synthetic sharp/flat glyphs on a synthetic staff, then checks
 * classification, counting, and the staff geometry recovered from the
 * tap region. Compile + run:
 *   npx tsc src/camera/geometry.ts src/camera/keySignature.ts \
 *     src/camera/__tests__/keySignature.test.ts \
 *     --outDir /tmp/camtest --module commonjs --target es2022 --strict --skipLibCheck
 *   node /tmp/camtest/__tests__/keySignature.test.js
 */
import { binarize, renderSyntheticStaff } from '../geometry';
import {
  detectKeySignature,
  detectStaffGeometry,
  isOnStaff,
  keyTapROI,
  staffPositionAt,
} from '../keySignature';

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

/** Tall vertical stem + filled bulb, ~2.8 staff spaces tall. */
function drawFlat(gray: Uint8ClampedArray, width: number, height: number, x: number, y0: number, space: number): void {
  const h = Math.round(space * 2.8);
  for (let y = y0; y < y0 + h; y++) {
    for (let dx = 0; dx < 3; dx++) setPx(gray, width, height, x + dx, y);
  }
  const bulbH = Math.round(h * 0.45);
  const bulbW = Math.round(space * 0.7);
  const by0 = y0 + h - bulbH;
  for (let yy = by0; yy < y0 + h; yy++) {
    const t = (yy - by0) / Math.max(1, bulbH - 1);
    const wdt = Math.round(bulbW * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
    for (let xx = x - wdt; xx <= x + 3; xx++) setPx(gray, width, height, xx, yy);
  }
}

function setup(
  opts: { glyphs?: ('sharp' | 'flat')[]; space?: number; slope?: number; noise?: number } = {}
): { binary: Uint8ClampedArray; width: number; height: number } {
  const space = opts.space ?? 24;
  const { gray, width, height } = renderSyntheticStaff({
    width: 640,
    height: 480,
    topY: 120,
    staffSpace: space,
    slope: opts.slope ?? 0,
    thickness: 3,
    noise: opts.noise ?? 0,
  });
  const glyphs = opts.glyphs ?? [];
  glyphs.forEach((kind, i) => {
    const x = 150 + i * Math.round(space * 1.4);
    // Center the glyph vertically on the staff region.
    const y0 = 120 + Math.round(space * 1.2);
    if (kind === 'sharp') drawSharp(gray, width, height, x, y0, space);
    else drawFlat(gray, width, height, x, y0, space);
  });
  return { binary: binarize(gray, width, height), width, height };
}

// 1. Three sharps: type, count, and geometry from the tap region.
{
  const { binary, width, height } = setup({ glyphs: ['sharp', 'sharp', 'sharp'] });
  const roi = keyTapROI(170, 150, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('3 sharps: type', det.type === 'sharp', `got ${det.type}`);
  check('3 sharps: count', det.count === 3, `got ${det.count}`);
  check('3 sharps: geometry found', det.geometry !== null);
  if (det.geometry) {
    check('3 sharps: staffSpace', Math.abs(det.geometry.staffSpace - 24) < 2, `got ${det.geometry.staffSpace}`);
    check('3 sharps: yTop0', Math.abs(det.geometry.yTop0 - 120) < 4, `got ${det.geometry.yTop0}`);
    check('3 sharps: skew', Math.abs(det.geometry.skew) < 0.01, `got ${det.geometry.skew}`);
  }
}

// 2. Two flats.
{
  const { binary, width, height } = setup({ glyphs: ['flat', 'flat'] });
  const roi = keyTapROI(160, 150, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('2 flats: type', det.type === 'flat', `got ${det.type}`);
  check('2 flats: count', det.count === 2, `got ${det.count}`);
  check('2 flats: geometry found', det.geometry !== null);
}

// 3. No glyphs: C major, but geometry is still recovered from the lines.
{
  const { binary, width, height } = setup({});
  const roi = keyTapROI(320, 150, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('C major: count 0', det.count === 0, `got ${det.count}`);
  check('C major: geometry found', det.geometry !== null);
  if (det.geometry) {
    check('C major: staffSpace', Math.abs(det.geometry.staffSpace - 24) < 2, `got ${det.geometry.staffSpace}`);
  }
}

// 4. Tapping away from the staff: no lines, no geometry.
{
  const { binary, width, height } = setup({ glyphs: ['sharp'] });
  const roi = keyTapROI(500, 400, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('tap away: count 0', det.count === 0, `got ${det.count}`);
  check('tap away: no geometry', det.geometry === null);
}

// 5. Skewed staff: skew is recovered in the tap region.
{
  const { binary, width, height } = setup({ glyphs: ['sharp', 'sharp'], slope: 0.03 });
  const roi = keyTapROI(170, 150, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('skewed: count', det.count === 2, `got ${det.count}`);
  check('skewed: geometry found', det.geometry !== null);
  if (det.geometry) {
    check('skewed: skew', Math.abs(det.geometry.skew - 0.03) < 0.015, `got ${det.geometry.skew}`);
    check('skewed: yTop0', Math.abs(det.geometry.yTop0 - 120) < 6, `got ${det.geometry.yTop0}`);
  }
}

// 6. Scale independence: smaller staff still classifies.
{
  const { binary, width, height } = setup({ glyphs: ['sharp', 'sharp', 'flat', 'flat'], space: 16 });
  const roi = keyTapROI(160, 140, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('small staff: finds glyphs', det.count >= 2, `got ${det.count} ${det.type}`);
  check('small staff: geometry', det.geometry !== null && Math.abs(det.geometry.staffSpace - 16) < 2,
    `got ${det.geometry?.staffSpace}`);
}

// 7. detectStaffGeometry: fresh geometry at a note tap point.
{
  const { binary, width, height } = setup({ glyphs: ['sharp', 'sharp'] });
  const geo = detectStaffGeometry(binary, width, height, 400, 150);
  check('note tap: geometry found', geo !== null);
  if (geo) {
    check('note tap: top line maps to 7', Math.abs(staffPositionAt(geo, 400, 120) - 7) < 0.3,
      `got ${staffPositionAt(geo, 400, 120)}`);
    check('note tap: third space maps to 4', Math.abs(staffPositionAt(geo, 400, 120 + 3 * 12) - 4) < 0.3,
      `got ${staffPositionAt(geo, 400, 120 + 3 * 12)}`);
    check('note tap: on staff', isOnStaff(geo, 400, 150));
    check('note tap: far above rejected', !isOnStaff(geo, 400, 0));
  }
}

// 8. Noisy image: detection holds up.
{
  const { binary, width, height } = setup({ glyphs: ['sharp', 'sharp', 'sharp'], noise: 0.002 });
  const roi = keyTapROI(170, 150, width, height);
  const det = detectKeySignature(binary, width, height, roi);
  check('noisy: count', det.count === 3, `got ${det.count}`);
  check('noisy: geometry', det.geometry !== null);
}

// 9. ROI stays within the frame at the edges.
{
  const roi = keyTapROI(630, 470, 640, 480);
  check('roi clamped', roi.x1 <= 640 && roi.y1 <= 480 && roi.x0 >= 0 && roi.y0 >= 0,
    JSON.stringify(roi));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  FAIL: ${f}`);
  throw new Error(`${failures.length} test(s) failed`);
} else {
  console.log('\nAll key-signature tests passed.');
}
