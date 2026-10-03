# Camera mode (v2)

Point the phone at sheet music, tap a note, hear the pitch.

## State machine

`CameraMode.tsx` owns one state at a time:

- **idle** — intro screen with the Enable camera button. Camera permission
  lives here, with designed fallbacks for denied/unavailable.
- **key-tap** — screen 1: "Tap the key signature". Staff detection runs
  continuously and draws the fitted lines; once a staff is found the user
  taps where the sharps/flats are.
- **key-reading** — detection runs on a region around the tap
  (`keyTapROI`), voting across frames for robustness. The tap point, the ROI
  box, and detected glyph boxes draw on the overlay.
- **key-confirm** — the locked key is shown ("E♭ major · 3 flats") with
  [Tap a note →] and [Re-tap]. Manual entry is available from the key chip.
- **ready** — screen 2: "Tap a note". Staff tracking keeps running so the
  geometry follows a drifting hand. Taps map to a staff position through the
  existing note pipeline and `playNote`.
- **playing** — the note sounds (reuses v1 audio verbatim) and the UI offers
  Replay plus -1/+1 step nudge, then melts back to ready after ~1.4s.

Clef stays manual (segmented control). Per-note accidental is a manual
override. The key chip re-opens screen 1 or manual entry at any time.

## Pipeline (`geometry.ts`, `keySignature.ts`)

Both modules are dependency-free and operate on raw pixel buffers, so they
run identically in the browser and in Node tests.

1. Downscale the video frame to 640px wide, grayscale, adaptive binarize
   (integral-image local threshold).
2. `detectStaff`: estimate global skew by projecting along sheared rows,
   de-skew, find rows with long dark runs, merge into line centers, keep the
   best window of 5 lines with consistent spacing, refine each line with
   RANSAC least-squares. Returns 5 fitted lines + staff space + confidence.
3. `detectKeySignature`: crop the left half of the staff, erase staff lines
   except where vertical glyph strokes cross them, find connected components,
   classify each as sharp (compact, two vertical strokes) or flat (tall,
   single stroke), and take the longest leading uniform run. Count 0 with
   moderate confidence reads as C major.
4. Tap -> staff position: `7 - 2 * round((tapY - topLineY) / staffSpace)`,
   clamped to [-14, 21]. Taps further than 3 staff spaces from the staff are
   rejected with a hint instead of playing a garbage pitch.

Shared with manual mode: `src/utils/calculateNote.ts` and
`src/utils/keySignatureName.ts` (pure functions extracted from the v1 hooks).

## Tests

```
npx tsc src/camera/geometry.ts src/camera/keySignature.ts \
  src/camera/__tests__/geometry.test.ts src/camera/__tests__/keySignature.test.ts \
  --outDir /tmp/camtest --module commonjs --target es2022 --strict --skipLibCheck
node /tmp/camtest/camera/__tests__/geometry.test.js
node /tmp/camtest/camera/__tests__/keySignature.test.js
```

Covers: clean / skewed / noisy synthetic staves, blank page, tap-to-position
mapping (top line = 7 ... bottom line = -1), quantization clamping, off-staff
rejection, sharp/flat counting, empty key signature, mixed runs.

## Tuning knobs

- `ANALYSIS_INTERVAL_MS` (150) — frame analysis cadence; lower = more
  responsive, more battery.
- `VOTES_TO_LOCK` / `LOCK_SHARE` — key-signature lock strictness.
- `estimateSkew` range (+/-0.06 slope, 0.02 step) — rotation tolerance.
- Brightness (< 45) and motion (frame diff > 28) hint thresholds.
