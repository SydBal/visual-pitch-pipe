/**
 * Key-signature reading from a tap ROI.
 *
 * The user taps the key signature. Everything happens inside a small region
 * around the tap: staff lines are found locally (simple row projection, no
 * global RANSAC pipeline), glyphs are classified scale-free, and the staff
 * geometry comes from the detected lines. No music-theory tables, no
 * font-metric assumptions.
 *
 * Binary images use 1 = dark (ink), 0 = light (paper).
 */

import { median } from './geometry';

export interface DetectedGlyph {
  /** Bounding box in analysis-image coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'sharp' | 'flat';
}

/** Staff geometry derived from the detected lines in the tap ROI. */
export interface StaffGeometry {
  /** y of the top staff line (position 7) at x = 0, in analysis px. */
  yTop0: number;
  /** dy/dx skew of the staff lines. */
  skew: number;
  /** px per staff space. */
  staffSpace: number;
}

export interface KeySignatureDetection {
  type: 'sharp' | 'flat';
  /** 0..7 accidentals. 0 with decent confidence means "looks like C major". */
  count: number;
  confidence: number;
  /** Glyphs of the winning run (for the overlay). */
  glyphs: DetectedGlyph[];
  /** Null when no staff lines were found in the ROI. */
  geometry: StaffGeometry | null;
}

/** Rectangular detection region in analysis-image coordinates. */
export interface KeySignatureROI {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const ROI_HALF = 110;

/** Fixed-size box around the tap. Staff-free: no geometry needed. */
export function keyTapROI(
  tapX: number,
  tapY: number,
  width: number,
  height: number
): KeySignatureROI {
  return {
    x0: Math.max(0, Math.round(tapX - ROI_HALF)),
    y0: Math.max(0, Math.round(tapY - ROI_HALF)),
    x1: Math.min(width, Math.round(tapX + ROI_HALF)),
    y1: Math.min(height, Math.round(tapY + ROI_HALF)),
  };
}

/** Fractional staff position at a point (7 = top line, 6 = first space, ...). */
export function staffPositionAt(geo: StaffGeometry, x: number, y: number): number {
  const yTop = geo.yTop0 + geo.skew * x;
  return 7 - (2 * (y - yTop)) / geo.staffSpace;
}

/**
 * True when a point is within marginSpaces staff spaces of the staff system.
 * Used to reject taps on empty paper.
 */
export function isOnStaff(geo: StaffGeometry, x: number, y: number, marginSpaces = 3): boolean {
  const p = staffPositionAt(geo, x, y);
  return p <= 7 + marginSpaces * 2 && p >= -1 - marginSpaces * 2;
}

// ---------------------------------------------------------------------------
// Local staff-line detection (inside the tap ROI)
// ---------------------------------------------------------------------------

/**
 * Estimate the staff skew by projecting along sheared rows: the skew whose
 * sheared rows contain the longest dark runs wins.
 */
function estimateSkew(
  binary: Uint8ClampedArray,
  width: number,
  roi: KeySignatureROI
): number {
  const { x0, y0, x1, y1 } = roi;
  const roiW = x1 - x0;
  let bestM = 0;
  let bestScore = -1;
  for (let m = -0.06; m <= 0.061; m += 0.03) {
    const runs: number[] = [];
    for (let yr = y0; yr < y1; yr++) {
      let best = 0;
      let cur = 0;
      for (let x = x0; x < x1; x++) {
        const y = Math.round(yr + m * (x - x0));
        const dark = y >= y0 && y < y1 && binary[y * width + x] === 1;
        if (dark) {
          cur++;
          if (cur > best) best = cur;
        } else {
          cur = 0;
        }
      }
      if (best >= roiW * 0.5) runs.push(best);
    }
    runs.sort((a, b) => b - a);
    const score = runs.slice(0, 5).reduce((s, r) => s + r, 0);
    if (score > bestScore) {
      bestScore = score;
      bestM = m;
    }
  }
  return bestM;
}

interface DetectedLines {
  /** Sheared row of each line (yr = y - skew*(x-x0)), top to bottom. */
  rows: number[];
  space: number;
  skew: number;
}

/**
 * Find the five staff lines in the ROI via sheared row projection.
 * Takes the five lines nearest the ROI center (the tap).
 */
function detectLines(
  binary: Uint8ClampedArray,
  width: number,
  roi: KeySignatureROI,
  skew: number
): DetectedLines | null {
  const { x0, y0, x1, y1 } = roi;
  const roiW = x1 - x0;
  const cy = (y0 + y1) / 2;

  const candidates: { y: number; run: number }[] = [];
  for (let yr = y0; yr < y1; yr++) {
    let best = 0;
    let cur = 0;
    for (let x = x0; x < x1; x++) {
      const y = Math.round(yr + skew * (x - x0));
      const dark = y >= y0 && y < y1 && binary[y * width + x] === 1;
      if (dark) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
    if (best >= roiW * 0.5) candidates.push({ y: yr, run: best });
  }
  if (candidates.length === 0) return null;

  // Cluster adjacent rows (line thickness) into lines, run-weighted.
  const lines: { y: number; run: number }[] = [];
  let sumY = 0;
  let sumW = 0;
  let prevY = -10;
  const flush = (): void => {
    if (sumW > 0) {
      lines.push({ y: sumY / sumW, run: sumW });
      sumY = 0;
      sumW = 0;
    }
  };
  for (const c of candidates) {
    if (c.y - prevY > 3) flush();
    sumY += c.y * c.run;
    sumW += c.run;
    prevY = c.y;
  }
  flush();
  if (lines.length < 5) return null;

  // The five lines nearest the tap (ROI center).
  const nearest = [...lines]
    .sort((a, b) => Math.abs(a.y - cy) - Math.abs(b.y - cy))
    .slice(0, 5)
    .sort((a, b) => a.y - b.y);

  const gaps: number[] = [];
  for (let i = 1; i < nearest.length; i++) gaps.push(nearest[i].y - nearest[i - 1].y);
  const space = median(gaps);
  if (space < 6 || space > 90) return null;
  const deviation = Math.max(...gaps.map((g) => Math.abs(g - space))) / space;
  if (deviation > 0.35) return null;

  return { rows: nearest.map((l) => l.y), space, skew };
}

/**
 * Erase staff lines inside the ROI, keeping pixels where a glyph stroke
 * crosses a line. Operates on a copy; the caller passes the detected lines.
 */
function eraseStaffLines(
  binary: Uint8ClampedArray,
  width: number,
  roi: KeySignatureROI,
  lines: DetectedLines
): void {
  const { x0, y0, x1, y1 } = roi;
  const { rows, skew } = lines;
  const band = 3;
  const reach = 22;
  const lineYAt = (yr: number, x: number): number => Math.round(yr + skew * (x - x0));

  for (const yr of rows) {
    for (let x = x0; x < x1; x++) {
      const yl = lineYAt(yr, x);
      for (let dy = -band; dy <= band; dy++) {
        const y = yl + dy;
        if (y < y0 || y >= y1) continue;
        if (!binary[y * width + x]) continue;
        // Keep the pixel if the column shows ink beyond the band that is
        // not on another staff line: a glyph stroke crosses here.
        let stroke = false;
        for (let yy = y - reach; yy <= y + reach; yy += 2) {
          if (yy < y0 || yy >= y1) continue;
          if (Math.abs(yy - y) <= band) continue;
          let onLine = false;
          for (const yr2 of rows) {
            if (Math.abs(yy - lineYAt(yr2, x)) <= band) {
              onLine = true;
              break;
            }
          }
          if (onLine) continue;
          if (binary[yy * width + x]) {
            stroke = true;
            break;
          }
        }
        if (!stroke) binary[y * width + x] = 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Glyph detection (scale-free)
// ---------------------------------------------------------------------------

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

/** 4-connected components over dark pixels inside the ROI. */
function findComponents(
  binary: Uint8ClampedArray,
  width: number,
  roi: KeySignatureROI
): Component[] {
  const { x0, y0, x1, y1 } = roi;
  const visited = new Uint8Array(width * (y1 - y0));
  const components: Component[] = [];
  const stack: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const vi = (y - y0) * width + x;
      if (!binary[y * width + x] || visited[vi]) continue;
      const comp: Component = { minX: x, minY: y, maxX: x, maxY: y, pixels: 0 };
      stack.push(y * width + x);
      visited[vi] = 1;
      while (stack.length > 0) {
        const p = stack.pop() as number;
        const px = p % width;
        const py = (p / width) | 0;
        comp.pixels++;
        if (px < comp.minX) comp.minX = px;
        if (px > comp.maxX) comp.maxX = px;
        if (py < comp.minY) comp.minY = py;
        if (py > comp.maxY) comp.maxY = py;
        if (px > x0) {
          const q = p - 1;
          if (binary[q] && !visited[(py - y0) * width + px - 1]) {
            visited[(py - y0) * width + px - 1] = 1;
            stack.push(q);
          }
        }
        if (px + 1 < x1) {
          const q = p + 1;
          if (binary[q] && !visited[(py - y0) * width + px + 1]) {
            visited[(py - y0) * width + px + 1] = 1;
            stack.push(q);
          }
        }
        if (py > y0) {
          const q = p - width;
          if (binary[q] && !visited[(py - 1 - y0) * width + px]) {
            visited[(py - 1 - y0) * width + px] = 1;
            stack.push(q);
          }
        }
        if (py + 1 < y1) {
          const q = p + width;
          if (binary[q] && !visited[(py + 1 - y0) * width + px]) {
            visited[(py + 1 - y0) * width + px] = 1;
            stack.push(q);
          }
        }
      }
      components.push(comp);
    }
  }
  return components;
}

/**
 * Count tall vertical strokes: columns in the middle half of the bbox whose
 * dark run is at least ~65% of the component height. Scale-free.
 * Sharps show two (the vertical bars); flats show at most one (stem/bulb).
 */
function countVerticalStrokes(
  binary: Uint8ClampedArray,
  width: number,
  comp: Component
): number {
  const h = comp.maxY - comp.minY + 1;
  const minRun = Math.max(8, Math.round(h * 0.65));
  const xStart = comp.minX + (((comp.maxX - comp.minX) * 0.25) | 0);
  const xEnd = comp.minX + (((comp.maxX - comp.minX) * 0.75) | 0);
  let strokes = 0;
  let inStroke = false;
  for (let x = Math.max(comp.minX, xStart); x <= Math.min(comp.maxX, xEnd); x++) {
    let run = 0;
    for (let y = comp.minY; y <= comp.maxY; y++) {
      if (binary[y * width + x]) {
        run++;
        if (run >= minRun) break;
      } else {
        run = 0;
      }
    }
    const isStroke = run >= minRun;
    if (isStroke && !inStroke) strokes++;
    inStroke = isStroke;
  }
  return strokes;
}

/** Classify a component as a sharp, flat, or neither (scale-free). */
function classifyGlyph(
  binary: Uint8ClampedArray,
  width: number,
  comp: Component
): 'sharp' | 'flat' | null {
  const w = comp.maxX - comp.minX + 1;
  const h = comp.maxY - comp.minY + 1;
  if (comp.pixels < 20) return null;
  if (h < 12 || h > 300 || w < 6 || w > 200) return null;
  const aspect = h / Math.max(1, w);
  const strokes = countVerticalStrokes(binary, width, comp);
  if (strokes >= 2 && aspect >= 1.1 && aspect <= 2.9) return 'sharp';
  if (strokes <= 1 && aspect > 1.8) return 'flat';
  return null;
}

// ---------------------------------------------------------------------------
// Top-level detection
// ---------------------------------------------------------------------------

/**
 * Staff geometry from the staff lines around a tap point. Used for note
 * taps: each tap gets fresh geometry, so moving the phone between taps
 * never leaves a stale fit behind.
 */
export function detectStaffGeometry(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  tapX: number,
  tapY: number
): StaffGeometry | null {
  const roi = keyTapROI(tapX, tapY, width, height);
  const x0 = Math.max(0, Math.min(width - 1, Math.round(roi.x0)));
  const y0 = Math.max(0, Math.min(height - 1, Math.round(roi.y0)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.round(roi.x1)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.round(roi.y1)));
  const clamped: KeySignatureROI = { x0, y0, x1, y1 };
  const cx = (x0 + x1) / 2;
  const skew = estimateSkew(binary, width, clamped);
  const lines = detectLines(binary, width, clamped, skew);
  if (!lines) return null;
  const yTopAtCx = lines.rows[0] + skew * (cx - x0);
  return {
    yTop0: yTopAtCx - skew * cx,
    skew,
    staffSpace: lines.space,
  };
}

export function detectKeySignature(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  roi: KeySignatureROI
): KeySignatureDetection {
  // Clamp the ROI to the frame.
  const x0 = Math.max(0, Math.min(width - 1, Math.round(roi.x0)));
  const y0 = Math.max(0, Math.min(height - 1, Math.round(roi.y0)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.round(roi.x1)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.round(roi.y1)));
  const clamped: KeySignatureROI = { x0, y0, x1, y1 };
  const cx = (x0 + x1) / 2;

  // Staff lines first: they give the geometry and guide the erasure.
  const skew = estimateSkew(binary, width, clamped);
  const lines = detectLines(binary, width, clamped, skew);
  let geometry: StaffGeometry | null = null;
  if (lines) {
    const yTopAtCx = lines.rows[0] + skew * (cx - x0);
    geometry = {
      yTop0: yTopAtCx - skew * cx,
      skew,
      staffSpace: lines.space,
    };
  }

  // Erase the lines (keeping glyph strokes), then find glyph components.
  const work = new Uint8ClampedArray(binary);
  if (lines) eraseStaffLines(work, width, clamped, lines);

  const glyphs: DetectedGlyph[] = [];
  for (const comp of findComponents(work, width, clamped)) {
    if (comp.minX <= x0 + 1 || comp.maxX >= x1 - 2 || comp.minY <= y0 + 1 || comp.maxY >= y1 - 2) {
      continue;
    }
    const type = classifyGlyph(work, width, comp);
    if (type) {
      glyphs.push({
        x: comp.minX,
        y: comp.minY,
        w: comp.maxX - comp.minX + 1,
        h: comp.maxY - comp.minY + 1,
        type,
      });
    }
  }
  glyphs.sort((a, b) => a.x - b.x);

  // Group into uniform runs (key signatures are uniform; glyphs in a run
  // have consistent size, which excludes clefs and stray marks).
  interface Run {
    type: 'sharp' | 'flat';
    glyphs: DetectedGlyph[];
  }
  const runs: Run[] = [];
  for (const g of glyphs) {
    const last = runs[runs.length - 1];
    const prev = last ? last.glyphs[last.glyphs.length - 1] : null;
    const sizeOk = !prev || Math.abs(g.h - prev.h) / Math.max(1, prev.h) < 0.5;
    const gapOk = !prev || g.x - (prev.x + prev.w) < 80;
    if (last && last.type === g.type && sizeOk && gapOk) {
      last.glyphs.push(g);
    } else {
      runs.push({ type: g.type, glyphs: [g] });
    }
  }
  // Longest run wins; ties break toward the tap (ROI center).
  const tapX = cx;
  runs.sort((a, b) => {
    if (b.glyphs.length !== a.glyphs.length) return b.glyphs.length - a.glyphs.length;
    const mid = (r: Run): number =>
      (r.glyphs[0].x + r.glyphs[r.glyphs.length - 1].x + r.glyphs[r.glyphs.length - 1].w) / 2;
    return Math.abs(mid(a) - tapX) - Math.abs(mid(b) - tapX);
  });
  const best = runs[0];
  const runGlyphs = best ? best.glyphs : [];

  if (runGlyphs.length === 0 || !geometry) {
    return {
      type: 'sharp',
      count: 0,
      confidence: geometry ? 0.5 : 0,
      glyphs: [],
      geometry,
    };
  }
  const type = best.type === 'flat' ? 'flat' : 'sharp';
  const count = Math.min(runGlyphs.length, 7);
  return {
    type,
    count,
    confidence: Math.min(1, 0.45 + 0.12 * count),
    glyphs: runGlyphs.slice(0, count),
    geometry,
  };
}
