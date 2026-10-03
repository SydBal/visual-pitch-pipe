/**
 * Dependency-free image geometry for staff detection.
 *
 * Everything here operates on raw pixel buffers (no DOM, no canvas), so the
 * whole pipeline can be unit-tested against synthetic images in Node.
 *
 * Coordinate conventions:
 * - Binary images use 1 = dark (ink), 0 = light (paper).
 * - Staff positions follow the app's mapping: the top staff line is
 *   position 7, each step down is one position unit (lines are odd,
 *   spaces are even), the bottom line is position -1.
 */

export interface LineFit {
  /** dy/dx of the fitted line. */
  slope: number;
  /** y of the fitted line at x = 0. */
  intercept: number;
}

export interface StaffFit {
  /** Five fitted lines, top to bottom. */
  lines: [LineFit, LineFit, LineFit, LineFit, LineFit];
  /** Median vertical distance between adjacent lines, in px. */
  staffSpace: number;
  /** 0..1 estimate of fit quality. */
  confidence: number;
}

export const TOP_LINE_POSITION = 7;
export const BOTTOM_LINE_POSITION = -1;
export const MIN_STAFF_POSITION = -14;
export const MAX_STAFF_POSITION = 21;

/** Luminance grayscale from RGBA bytes. */
export function grayscale(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return gray;
}

/**
 * Adaptive binarization: a pixel is ink when it is darker than its local
 * mean minus c. Uses an integral image so the window cost is O(1) per pixel.
 */
export function binarize(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  window = 15,
  c = 12
): Uint8ClampedArray {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const grayRow = y * width;
    const intRow = (y + 1) * stride;
    const intPrev = y * stride;
    for (let x = 0; x < width; x++) {
      rowSum += gray[grayRow + x];
      integral[intRow + x + 1] = integral[intPrev + x + 1] + rowSum;
    }
  }
  const out = new Uint8ClampedArray(width * height);
  const half = (window / 2) | 0;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    const iY0 = y0 * stride;
    const iY1 = (y1 + 1) * stride;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[iY1 + x1 + 1] - integral[iY0 + x1 + 1] - integral[iY1 + x0] + integral[iY0 + x0];
      out[y * width + x] = gray[y * width + x] < sum / area - c ? 1 : 0;
    }
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0];
}

/** Least-squares + RANSAC refinement of one near-horizontal line. */
function refineLine(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  yc: number
): LineFit {
  const band = 4;
  const xs: number[] = [];
  const ys: number[] = [];
  const yStart = Math.max(0, Math.floor(yc - band));
  const yEnd = Math.min(height - 1, Math.ceil(yc + band));
  for (let y = yStart; y <= yEnd; y++) {
    const row = y * width;
    for (let x = 0; x < width; x += 2) {
      if (binary[row + x]) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  const n = xs.length;
  if (n < 12) return { slope: 0, intercept: yc };

  // Deterministic LCG so results (and tests) are reproducible.
  let seed = 123456789;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let bestM = 0;
  let bestB = yc;
  let bestInliers = 0;
  for (let it = 0; it < 24; it++) {
    const i1 = (rand() * n) | 0;
    const i2 = (rand() * n) | 0;
    if (i1 === i2) continue;
    const dx = xs[i2] - xs[i1];
    if (dx === 0) continue;
    const m = (ys[i2] - ys[i1]) / dx;
    if (Math.abs(m) > 0.2) continue; // staff lines are near-horizontal
    const b = ys[i1] - m * xs[i1];
    let inliers = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(ys[i] - (m * xs[i] + b)) <= 2) inliers++;
    }
    if (inliers > bestInliers) {
      bestInliers = inliers;
      bestM = m;
      bestB = b;
    }
  }

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(ys[i] - (bestM * xs[i] + bestB)) <= 2) {
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
      cnt++;
    }
  }
  if (cnt < 8) return { slope: 0, intercept: yc };
  const denom = cnt * sxx - sx * sx;
  if (Math.abs(denom) < 1e-6) return { slope: 0, intercept: yc };
  const m = (cnt * sxy - sx * sy) / denom;
  if (Math.abs(m) > 0.2) return { slope: 0, intercept: yc };
  return { slope: m, intercept: (sy - m * sx) / cnt };
}

/** Fraction of sampled columns where a dark pixel sits near the fitted line. */
function lineCoverage(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  line: LineFit
): number {
  let hits = 0;
  let total = 0;
  for (let x = 0; x < width; x += 4) {
    const yl = Math.round(line.slope * x + line.intercept);
    let hit = false;
    for (let dy = -2; dy <= 2; dy++) {
      const y = yl + dy;
      if (y >= 0 && y < height && binary[y * width + x]) {
        hit = true;
        break;
      }
    }
    if (hit) hits++;
    total++;
  }
  return total === 0 ? 0 : hits / total;
}

/**
 * Find the dominant five-line staff in a binary image.
 * Handles slight rotation by first estimating the global skew, de-skewing a
 * copy of the image, detecting near-horizontal lines there, then mapping the
 * fitted slopes back to the original coordinates.
 * Returns null when no plausible staff is found.
 */
export function detectStaff(binary: Uint8ClampedArray, width: number, height: number): StaffFit | null {
  const skew = estimateSkew(binary, width, height);
  const straight = skew === 0 ? binary : shear(binary, width, height, -skew);
  const fit = detectStraightStaff(straight, width, height);
  if (!fit) return null;
  return {
    lines: [
      { slope: fit.lines[0].slope + skew, intercept: fit.lines[0].intercept },
      { slope: fit.lines[1].slope + skew, intercept: fit.lines[1].intercept },
      { slope: fit.lines[2].slope + skew, intercept: fit.lines[2].intercept },
      { slope: fit.lines[3].slope + skew, intercept: fit.lines[3].intercept },
      { slope: fit.lines[4].slope + skew, intercept: fit.lines[4].intercept },
    ],
    staffSpace: fit.staffSpace,
    confidence: fit.confidence,
  };
}

/**
 * Estimate the global dy/dx skew of staff lines by projecting along sheared
 * rows: the skew whose sheared rows contain the longest dark runs wins.
 */
function estimateSkew(binary: Uint8ClampedArray, width: number, height: number): number {
  let bestM = 0;
  let bestScore = -1;
  for (let m = -0.06; m <= 0.0601; m += 0.02) {
    const runs: number[] = [];
    for (let y0 = 0; y0 < height; y0++) {
      let best = 0;
      let cur = 0;
      for (let x = 0; x < width; x++) {
        const y = Math.round(y0 + m * x);
        const dark = y >= 0 && y < height && binary[y * width + x] === 1;
        if (dark) {
          cur++;
          if (cur > best) best = cur;
        } else {
          cur = 0;
        }
      }
      if (best >= width * 0.3) runs.push(best);
    }
    runs.sort((a, b) => b - a);
    const score = runs.slice(0, 12).reduce((s, r) => s + r, 0);
    if (score > bestScore) {
      bestScore = score;
      bestM = m;
    }
  }
  return Math.abs(bestM) < 0.001 ? 0 : bestM;
}

/** Nearest-neighbor vertical shear: out[y][x] = src[y - skew*x][x]. */
function shear(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  skew: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sy = Math.round(y - skew * x);
      out[y * width + x] = sy >= 0 && sy < height ? binary[sy * width + x] : 0;
    }
  }
  return out;
}

function detectStraightStaff(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): StaffFit | null {
  // 1. Longest dark run per row. Staff lines span much of the frame width.
  const minRun = width * 0.35;
  const rowRuns: { y: number; run: number }[] = [];
  for (let y = 0; y < height; y++) {
    let best = 0;
    let cur = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (binary[row + x]) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
    if (best >= minRun) rowRuns.push({ y, run: best });
  }
  if (rowRuns.length === 0) return null;

  // 2. Merge adjacent rows (line thickness) into line centers, run-weighted.
  const merged: { y: number; run: number }[] = [];
  let sumY = 0;
  let sumW = 0;
  let prevY = -10;
  const flush = (): void => {
    if (sumW > 0) {
      merged.push({ y: sumY / sumW, run: sumW });
      sumY = 0;
      sumW = 0;
    }
  };
  for (const c of rowRuns) {
    if (c.y - prevY > 2) flush();
    sumY += c.y * c.run;
    sumW += c.run;
    prevY = c.y;
  }
  flush();
  if (merged.length < 5) return null;

  // 3. Find the best window of 5 lines with consistent spacing.
  //    Prefer long runs and groups near the vertical center of the frame.
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 0; i + 4 < merged.length; i++) {
    const ys = [merged[i].y, merged[i + 1].y, merged[i + 2].y, merged[i + 3].y, merged[i + 4].y];
    const gaps = [ys[1] - ys[0], ys[2] - ys[1], ys[3] - ys[2], ys[4] - ys[3]];
    const space = median(gaps);
    if (space < 4) continue;
    const deviation = Math.max(...gaps.map((g) => Math.abs(g - space))) / space;
    if (deviation > 0.3) continue;
    const runScore = (merged[i].run + merged[i + 1].run + merged[i + 2].run + merged[i + 3].run + merged[i + 4].run) / 5;
    const centerY = (ys[0] + ys[4]) / 2;
    const centerPenalty = (Math.abs(centerY - height / 2) / height) * width * 0.5;
    const score = runScore - centerPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;

  // 4. Refine each line (slope + intercept) with RANSAC least-squares.
  const lines = [
    refineLine(binary, width, height, merged[bestIdx].y),
    refineLine(binary, width, height, merged[bestIdx + 1].y),
    refineLine(binary, width, height, merged[bestIdx + 2].y),
    refineLine(binary, width, height, merged[bestIdx + 3].y),
    refineLine(binary, width, height, merged[bestIdx + 4].y),
  ] as [LineFit, LineFit, LineFit, LineFit, LineFit];

  const midX = width / 2;
  const lineYs = lines.map((l) => l.slope * midX + l.intercept);
  const staffSpace = median([
    lineYs[1] - lineYs[0],
    lineYs[2] - lineYs[1],
    lineYs[3] - lineYs[2],
    lineYs[4] - lineYs[3],
  ]);
  if (staffSpace < 4) return null;
  const confidence = Math.min(...lines.map((l) => lineCoverage(binary, width, height, l)));

  return { lines, staffSpace, confidence };
}

/** Fractional staff position at a point (7 = top line, 6 = first space, ...). */
export function staffPositionAt(fit: StaffFit, x: number, y: number): number {
  const topY = fit.lines[0].slope * x + fit.lines[0].intercept;
  return TOP_LINE_POSITION - (2 * (y - topY)) / fit.staffSpace;
}

/** Round to an integer position and clamp to the app's supported range. */
export function quantizeStaffPosition(position: number): number {
  return Math.max(MIN_STAFF_POSITION, Math.min(MAX_STAFF_POSITION, Math.round(position)));
}

/**
 * True when a point is within marginSpaces staff spaces of the staff system
 * (top line = 7, bottom line = -3). Used to reject taps on empty paper.
 */
export function isOnStaff(fit: StaffFit, x: number, y: number, marginSpaces = 3): boolean {
  const p = staffPositionAt(fit, x, y);
  return p <= TOP_LINE_POSITION + marginSpaces * 2 && p >= BOTTOM_LINE_POSITION - marginSpaces * 2;
}

/** Mean brightness 0..255 of a grayscale buffer (for low-light hints). */
export function meanBrightness(gray: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return gray.length === 0 ? 0 : sum / gray.length;
}

/** Mean absolute per-pixel difference between two grayscale frames (motion hint). */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

// ---------------------------------------------------------------------------
// Synthetic image generation (for unit tests)
// ---------------------------------------------------------------------------

export interface SyntheticStaffOptions {
  width?: number;
  height?: number;
  /** y of the top line at x = 0. */
  topY?: number;
  staffSpace?: number;
  /** dy/dx of the staff lines. */
  slope?: number;
  thickness?: number;
  /** 0..1 fraction of random speckle pixels. */
  noise?: number;
  seed?: number;
}

/** Render a white page with five dark staff lines into a grayscale buffer. */
export function renderSyntheticStaff(opts: SyntheticStaffOptions = {}): {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const topY = opts.topY ?? 120;
  const staffSpace = opts.staffSpace ?? 24;
  const slope = opts.slope ?? 0;
  const thickness = opts.thickness ?? 3;
  const noise = opts.noise ?? 0;
  let seed = opts.seed ?? 42;

  const gray = new Uint8ClampedArray(width * height).fill(255);
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let line = 0; line < 5; line++) {
    const baseY = topY + line * staffSpace;
    for (let x = 0; x < width; x++) {
      const yl = Math.round(baseY + slope * x);
      for (let t = 0; t < thickness; t++) {
        const y = yl + t - ((thickness / 2) | 0);
        if (y >= 0 && y < height) gray[y * width + x] = 0;
      }
    }
  }
  if (noise > 0) {
    const specks = Math.floor(width * height * noise);
    for (let i = 0; i < specks; i++) {
      gray[(rand() * width * height) | 0] = rand() < 0.5 ? 0 : 255;
    }
  }
  return { gray, width, height };
}
