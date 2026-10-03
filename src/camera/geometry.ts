/**
 * Dependency-free pixel utilities for the camera pipeline.
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

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0];
}

/** Round to an integer position and clamp to the app's supported range. */
export function quantizeStaffPosition(position: number): number {
  return Math.max(MIN_STAFF_POSITION, Math.min(MAX_STAFF_POSITION, Math.round(position)));
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
