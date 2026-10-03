/**
 * Key-signature detection for the camera pipeline.
 *
 * Given a binarized frame and a fitted staff, this scans the left portion of
 * the staff (where the key signature lives on printed music), removes the
 * staff lines while preserving vertical glyph strokes, finds connected
 * components, and classifies each as a sharp or a flat.
 *
 * v2 scope: count + sharp/flat classification only. Per-note accidentals are
 * a manual override in the UI.
 */

import type { StaffFit } from './geometry';
import type { KeySignatureAccidental } from '../types/musicTypes';

export interface DetectedGlyph {
  /** Bounding box in analysis-image coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'sharp' | 'flat';
}

export interface KeySignatureDetection {
  type: KeySignatureAccidental;
  /** 0..7 accidentals. 0 with decent confidence means "looks like C major". */
  count: number;
  confidence: number;
  glyphs: DetectedGlyph[];
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

/** Erase staff lines except where they are crossed by vertical strokes. */
function eraseStaffLines(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  staff: StaffFit,
  roiX0: number,
  roiX1: number
): void {
  const space = staff.staffSpace;
  const band = 3;
  // Look less than one staff space up/down: far enough to see a glyph stroke
  // crossing the line, but not so far that neighboring staff lines (exactly
  // one space away) count as strokes and prevent erasure.
  const reach = Math.max(6, Math.round(space * 0.8));
  for (const line of staff.lines) {
    for (let x = roiX0; x < roiX1; x++) {
      const yl = Math.round(line.slope * x + line.intercept);
      for (let dy = -band; dy <= band; dy++) {
        const y = yl + dy;
        if (y < 0 || y >= height) continue;
        // Keep the pixel if the column shows ink well above/below the line:
        // that means a glyph stroke crosses here.
        let stroke = false;
        for (let yy = y - reach; yy <= y + reach; yy += 2) {
          if (yy < 0 || yy >= height) continue;
          if (Math.abs(yy - yl) <= band) continue;
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

/** 4-connected components over dark pixels inside the ROI. */
function findComponents(
  binary: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Component[] {
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
        // 4-neighbors, clamped to the ROI
        if (px > x0) {
          const q = p - 1;
          const qvi = (py - y0) * width + px - 1;
          if (binary[q] && !visited[qvi]) {
            visited[qvi] = 1;
            stack.push(q);
          }
        }
        if (px + 1 < x1) {
          const q = p + 1;
          const qvi = (py - y0) * width + px + 1;
          if (binary[q] && !visited[qvi]) {
            visited[qvi] = 1;
            stack.push(q);
          }
        }
        if (py > y0) {
          const q = p - width;
          const qvi = (py - 1 - y0) * width + px;
          if (binary[q] && !visited[qvi]) {
            visited[qvi] = 1;
            stack.push(q);
          }
        }
        if (py + 1 < y1) {
          const q = p + width;
          const qvi = (py + 1 - y0) * width + px;
          if (binary[q] && !visited[qvi]) {
            visited[qvi] = 1;
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
 * Count tall vertical strokes inside a component's bbox: columns whose dark
 * run is at least ~1.1 staff spaces. Sharps show two, flats show one.
 */
function countVerticalStrokes(
  binary: Uint8ClampedArray,
  width: number,
  comp: Component,
  staffSpace: number
): number {
  const minRun = Math.round(staffSpace * 1.1);
  const xStart = comp.minX + ((comp.maxX - comp.minX) * 0.25) | 0;
  const xEnd = comp.minX + ((comp.maxX - comp.minX) * 0.75) | 0;
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

function classifyGlyph(
  binary: Uint8ClampedArray,
  width: number,
  comp: Component,
  staffSpace: number
): 'sharp' | 'flat' | null {
  const w = comp.maxX - comp.minX + 1;
  const h = comp.maxY - comp.minY + 1;
  const hSpace = h / staffSpace;
  const wSpace = w / staffSpace;
  if (comp.pixels < 12) return null;
  if (hSpace < 1.1 || hSpace > 3.6 || wSpace > 1.7) return null;
  const aspect = h / Math.max(1, w);
  const strokes = countVerticalStrokes(binary, width, comp, staffSpace);
  // Sharp: compact, roughly square-ish, two vertical strokes.
  if (strokes >= 2 && hSpace >= 1.4 && hSpace <= 2.8 && aspect >= 1.1 && aspect <= 2.8) {
    return 'sharp';
  }
  // Flat: tall and narrow, a single vertical stroke with a bulb.
  if (strokes <= 1 && hSpace >= 2.2 && hSpace <= 3.6 && aspect > 1.8) {
    return 'flat';
  }
  return null;
}

export function detectKeySignature(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  staff: StaffFit
): KeySignatureDetection {
  const space = staff.staffSpace;
  const topY = staff.lines[0].intercept;
  const bottomY = staff.lines[4].intercept;
  const x0 = Math.max(0, Math.round(width * 0.03));
  const x1 = Math.min(width, Math.round(width * 0.5));
  const y0 = Math.max(0, Math.round(Math.min(topY, bottomY) - space * 2.5));
  const y1 = Math.min(height, Math.round(Math.max(topY, bottomY) + space * 2.5));

  // Work on a copy: eraseStaffLines mutates.
  const work = new Uint8ClampedArray(binary);
  eraseStaffLines(work, width, height, staff, x0, x1);

  const glyphs: DetectedGlyph[] = [];
  for (const comp of findComponents(work, width, x0, y0, x1, y1)) {
    // Ignore components touching the ROI border (partially visible glyphs).
    if (comp.minX <= x0 + 1 || comp.maxX >= x1 - 2 || comp.minY <= y0 + 1 || comp.maxY >= y1 - 2) {
      continue;
    }
    const type = classifyGlyph(work, width, comp, space);
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

  // Key signatures are a uniform run of sharps or flats. Take the longest
  // leading run, breaking on type changes or large horizontal gaps.
  let runType: 'sharp' | 'flat' | null = null;
  let runCount = 0;
  let prevRight = -Infinity;
  for (const g of glyphs) {
    if (runType !== null && (g.type !== runType || g.x - prevRight > space * 3)) break;
    runType = g.type;
    runCount++;
    prevRight = g.x + g.w;
  }
  const runGlyphs = glyphs.slice(0, runCount);

  if (runCount === 0) {
    return { type: 'sharp', count: 0, confidence: 0.55 * staff.confidence, glyphs: [] };
  }
  const type: KeySignatureAccidental = runType === 'flat' ? 'flat' : 'sharp';
  const confidence = Math.min(1, 0.45 + 0.12 * Math.min(runCount, 7));
  return { type, count: Math.min(runCount, 7), confidence, glyphs: runGlyphs };
}
