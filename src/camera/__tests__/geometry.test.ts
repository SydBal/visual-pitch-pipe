/**
 * Unit tests for src/camera/geometry.ts.
 *
 * Zero-dependency: compiled with the project's tsc to JS, then run with
 * plain node (no test runner, no @types/node — a thrown Error fails the run).
 *
 * Compile + run:
 *   npx tsc src/camera/geometry.ts src/camera/__tests__/geometry.test.ts \
 *     --outDir /tmp/camtest --module commonjs --target es2022 --strict --skipLibCheck
 *   node /tmp/camtest/__tests__/geometry.test.js
 */
import {
  binarize,
  detectStaff,
  isOnStaff,
  quantizeStaffPosition,
  renderSyntheticStaff,
  staffPositionAt,
} from '../geometry';

const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  else console.log(`ok: ${name}`);
}

function approx(actual: number, expected: number, tol: number): boolean {
  return Math.abs(actual - expected) <= tol;
}

// 1. Clean synthetic staff: 5 lines found, correct spacing and position.
{
  const { gray, width, height } = renderSyntheticStaff({ topY: 120, staffSpace: 24, slope: 0 });
  const fit = detectStaff(binarize(gray, width, height), width, height);
  check('clean staff detected', fit !== null);
  if (fit) {
    check('clean staff space ~24', approx(fit.staffSpace, 24, 1.5), `got ${fit.staffSpace}`);
    const topY = fit.lines[0].intercept;
    check('clean top line y ~120', approx(topY, 120, 2), `got ${topY}`);
    check('clean confidence high', fit.confidence > 0.8, `got ${fit.confidence}`);
    check('clean slopes ~0', fit.lines.every((l) => Math.abs(l.slope) < 0.005));
  }
}

// 2. Skewed staff (slope 0.03, ~1.7deg): still found, slope recovered.
{
  const { gray, width, height } = renderSyntheticStaff({ topY: 120, staffSpace: 24, slope: 0.03 });
  const fit = detectStaff(binarize(gray, width, height), width, height);
  check('skewed staff detected', fit !== null);
  if (fit) {
    check('skewed staff space ~24', approx(fit.staffSpace, 24, 2), `got ${fit.staffSpace}`);
    const avgSlope = fit.lines.reduce((s, l) => s + l.slope, 0) / 5;
    check('skew recovered ~0.03', approx(avgSlope, 0.03, 0.012), `got ${avgSlope}`);
  }
}

// 3. Noisy staff: 2% speckle should not break detection.
{
  const { gray, width, height } = renderSyntheticStaff({ topY: 100, staffSpace: 20, noise: 0.02, seed: 7 });
  const fit = detectStaff(binarize(gray, width, height), width, height);
  check('noisy staff detected', fit !== null);
  if (fit) {
    check('noisy staff space ~20', approx(fit.staffSpace, 20, 2), `got ${fit.staffSpace}`);
  }
}

// 4. Blank page: no staff.
{
  const { gray, width, height } = renderSyntheticStaff({ noise: 0 });
  gray.fill(255);
  const fit = detectStaff(binarize(gray, width, height), width, height);
  check('blank page returns null', fit === null);
}

// 5. Tap mapping: top line = 7, each space = 2 units, bottom line = -3.
{
  const { gray, width, height } = renderSyntheticStaff({ topY: 120, staffSpace: 24, slope: 0 });
  const fit = detectStaff(binarize(gray, width, height), width, height);
  check('mapping staff detected', fit !== null);
  if (fit) {
    const x = width / 2;
    const topY = fit.lines[0].slope * x + fit.lines[0].intercept;
    check('tap on top line = 7', approx(staffPositionAt(fit, x, topY), 7, 0.15));
    check('tap one space below = 6', approx(staffPositionAt(fit, x, topY + 12), 6, 0.15));
    check('tap on second line = 5', approx(staffPositionAt(fit, x, topY + 24), 5, 0.15));
    const botY = fit.lines[4].slope * x + fit.lines[4].intercept;
    check('tap on bottom line = -1', approx(staffPositionAt(fit, x, botY), -1, 0.15));
    check('quantize rounds', quantizeStaffPosition(6.4) === 6 && quantizeStaffPosition(6.6) === 7);
    check('quantize clamps', quantizeStaffPosition(99) === 21 && quantizeStaffPosition(-99) === -14);
    check('on-staff tap accepted', isOnStaff(fit, x, topY + 24));
    check('far tap rejected', !isOnStaff(fit, x, topY - 200));
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):\n- ${failures.join('\n- ')}`);
  throw new Error('geometry tests failed');
}
console.log('\nAll geometry tests passed.');
