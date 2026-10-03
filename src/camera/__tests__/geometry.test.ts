/**
 * Unit tests for src/camera/geometry.ts (pixel utilities).
 *
 * Compile + run:
 *   npx tsc src/camera/geometry.ts src/camera/__tests__/geometry.test.ts \
 *     --outDir /tmp/camtest --module commonjs --target es2022 --strict --skipLibCheck
 *   node /tmp/camtest/__tests__/geometry.test.js
 */
import {
  binarize,
  frameDifference,
  grayscale,
  MAX_STAFF_POSITION,
  meanBrightness,
  median,
  MIN_STAFF_POSITION,
  quantizeStaffPosition,
} from '../geometry';

const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  else console.log(`ok: ${name}`);
}

// grayscale: pure red -> ~76, white -> 255.
{
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]);
  const gray = grayscale(rgba, 2, 1);
  check('grayscale red', Math.abs(gray[0] - 76) <= 1, `got ${gray[0]}`);
  check('grayscale white', gray[1] === 255, `got ${gray[1]}`);
}

// binarize: dark pixel on light background -> 1, light -> 0.
{
  const gray = new Uint8ClampedArray(25 * 25).fill(255);
  gray[12 * 25 + 12] = 0;
  const binary = binarize(gray, 25, 25);
  check('binarize dark pixel', binary[12 * 25 + 12] === 1);
  check('binarize light pixel', binary[0] === 0);
}

// median.
{
  check('median odd', median([3, 1, 2]) === 2);
  check('median single', median([7]) === 7);
}

// quantize: rounds and clamps.
{
  check('quantize rounds', quantizeStaffPosition(6.6) === 7);
  check('quantize clamps high', quantizeStaffPosition(999) === MAX_STAFF_POSITION);
  check('quantize clamps low', quantizeStaffPosition(-999) === MIN_STAFF_POSITION);
}

// meanBrightness / frameDifference.
{
  const a = new Uint8ClampedArray([100, 100, 100, 100]);
  check('meanBrightness', meanBrightness(a) === 100);
  const b = new Uint8ClampedArray([110, 90, 100, 100]);
  check('frameDifference', frameDifference(a, b) === 5, `got ${frameDifference(a, b)}`);
  check('frameDifference empty', frameDifference(new Uint8ClampedArray(0), new Uint8ClampedArray(0)) === 0);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  FAIL: ${f}`);
  throw new Error(`${failures.length} test(s) failed`);
} else {
  console.log('\nAll geometry tests passed.');
}
