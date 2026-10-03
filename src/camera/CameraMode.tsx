import { useCallback, useEffect, useRef, useState } from 'react';
import { playNote } from '../audio/note';
import noteLocationMapping from '../data/noteLocationMapping';
import KeySignatureMapping from '../data/keySignatureMapping';
import accidentalToDisplayCharacter from '../data/accidentalToDisplayCharacter';
import { calculateNote } from '../utils/calculateNote';
import {
  getKeySignatureDisplayString,
  getKeySignatureName,
  parseKeySignatureName,
} from '../utils/keySignatureName';
import {
  binarize,
  frameDifference,
  grayscale,
  meanBrightness,
  quantizeStaffPosition,
} from './geometry';
import {
  detectKeySignature,
  detectStaffGeometry,
  isOnStaff,
  keyTapROI,
  staffPositionAt,
  type DetectedGlyph,
  type KeySignatureROI,
  type StaffGeometry,
} from './keySignature';
import { useCamera } from './useCamera';
import type {
  ClefType,
  KeySignatureAccidental,
  KeySignatureAccidentalCount,
  KeySignatureName,
  NoteAccidental,
} from '../types/musicTypes';
import './CameraMode.css';

type Phase = 'idle' | 'key-tap' | 'key-reading' | 'ready' | 'playing';

const ANALYSIS_WIDTH = 640;
const ANALYSIS_INTERVAL_MS = 150;
const VOTE_WINDOW = 10;
const VOTES_TO_LOCK = 6;
const LOCK_SHARE = 0.7;
const KEY_READING_TIMEOUT_MS = 5000;
const PLAYING_MS = 1400;

const CLEFS: ClefType[] = ['treble', 'bass', 'alto', 'tenor'];
const CLEF_LABELS: Record<ClefType, string> = {
  treble: 'Treble',
  bass: 'Bass',
  alto: 'Alto',
  tenor: 'Tenor',
};

const ALL_KEY_NAMES: KeySignatureName[] = [
  'C',
  ...(['sharp'] as KeySignatureAccidental[])
    .flatMap((t) => (Object.keys(KeySignatureMapping[t]) as KeySignatureAccidentalCount[]).map((c) => KeySignatureMapping[t][c]))
    .filter((n) => n !== 'C'),
  ...(['flat'] as KeySignatureAccidental[])
    .flatMap((t) => (Object.keys(KeySignatureMapping[t]) as KeySignatureAccidentalCount[]).map((c) => KeySignatureMapping[t][c]))
    .filter((n) => n !== 'C'),
];

interface TapMarker {
  x: number;
  y: number;
  id: number;
}

interface LastResult {
  pos: number;
  label: string;
}

interface Props {
  onExitToManual: () => void;
}

export default function CameraMode({ onExitToManual }: Props) {
  const { videoRef, status, start, stop } = useCamera();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [clef, setClef] = useState<ClefType>('treble');
  const [keyType, setKeyType] = useState<KeySignatureAccidental>('sharp');
  const [keyCount, setKeyCount] = useState<KeySignatureAccidentalCount>('0');
  const [keySource, setKeySource] = useState<'auto' | 'manual'>('auto');
  const [noteAccidentalType, setNoteAccidentalType] = useState<NoteAccidental>('');
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [tapMarker, setTapMarker] = useState<TapMarker | null>(null);
  const [hintOverride, setHintOverride] = useState<string | null>(null);
  const [showKeyEditor, setShowKeyEditor] = useState(false);

  const glyphsRef = useRef<DetectedGlyph[]>([]);
  const roiRef = useRef<KeySignatureROI | null>(null);
  const keyTapRef = useRef<{ ax: number; ay: number } | null>(null);
  const votesRef = useRef<{ type: KeySignatureAccidental; count: number }[]>([]);
  const readingStartRef = useRef(0);
  const lastBinaryRef = useRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);
  const lastNoteTapRef = useRef<{ ax: number; ay: number } | null>(null);
  const lastGeoRef = useRef<StaffGeometry | null>(null);
  const lastGrayRef = useRef<Uint8ClampedArray | null>(null);
  const playTimeoutRef = useRef<number | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);
  const markerIdRef = useRef(0);

  // Mirror of state for the analysis interval (avoids stale closures).
  const liveRef = useRef({ phase, clef, keyType, keyCount, keySource, noteAccidentalType });
  liveRef.current = { phase, clef, keyType, keyCount, keySource, noteAccidentalType };

  const flashHint = useCallback((message: string) => {
    setHintOverride(message);
    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => setHintOverride(null), 1800);
  }, []);

  const getMapping = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || video.videoWidth === 0) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const rect = container.getBoundingClientRect();
    const ew = rect.width;
    const eh = rect.height;
    // object-fit: cover — the frame is scaled to cover, then center-cropped.
    const scale = Math.max(ew / vw, eh / vh);
    const offX = (vw - ew / scale) / 2;
    const offY = (vh - eh / scale) / 2;
    const ah = Math.round((ANALYSIS_WIDTH * vh) / vw);
    const frameToAnalysis = ANALYSIS_WIDTH / vw;
    return {
      elementToAnalysis: (cx: number, cy: number) => ({
        ax: (offX + cx / scale) * frameToAnalysis,
        ay: (offY + cy / scale) * (ah / vh),
      }),
      analysisToElement: (ax: number, ay: number) => ({
        cx: (ax / frameToAnalysis - offX) * scale,
        cy: (ay / (ah / vh) - offY) * scale,
      }),
    };
  }, [videoRef]);

  const soundPosition = useCallback(
    (pos: number, marker: { cx: number; cy: number }) => {
      const { clef: c, keyType: kt, keyCount: kc, noteAccidentalType: nat } = liveRef.current;
      const noteLocationName = noteLocationMapping[c][String(pos)];
      if (!noteLocationName) return;
      const keyName = getKeySignatureName(kt, kc);
      const { note, octave, accidental } = calculateNote(noteLocationName, nat, keyName, kt);
      try {
        playNote(note + accidental, parseInt(octave, 10));
      } catch {
        // Audio unavailable; the visual result still shows.
      }
      const label = `${note}${accidentalToDisplayCharacter[accidental]}${octave}`;
      markerIdRef.current += 1;
      setTapMarker({ x: marker.cx, y: marker.cy, id: markerIdRef.current });
      setLastResult({ pos, label });
      setPhase('playing');
      if (playTimeoutRef.current) window.clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = window.setTimeout(() => setPhase('ready'), PLAYING_MS);
    },
    []
  );

  /** Snap a tap to the nearest line/space using fresh local geometry. */
  const resolveNoteTap = useCallback(
    (ax: number, ay: number): { pos: number; snappedAy: number } | null => {
      const frame = lastBinaryRef.current;
      if (!frame) return null;
      const geo = detectStaffGeometry(frame.data, frame.width, frame.height, ax, ay);
      if (!geo) return null;
      if (!isOnStaff(geo, ax, ay)) return null;
      const pos = quantizeStaffPosition(staffPositionAt(geo, ax, ay));
      const yTop = geo.yTop0 + geo.skew * ax;
      lastGeoRef.current = geo;
      lastNoteTapRef.current = { ax, ay };
      return { pos, snappedAy: yTop + ((7 - pos) / 2) * geo.staffSpace };
    },
    []
  );

  const handleTap = useCallback(
    (clientX: number, clientY: number) => {
      const { phase: ph } = liveRef.current;
      if (ph !== 'key-tap' && ph !== 'key-reading' && ph !== 'ready' && ph !== 'playing') return;
      const container = containerRef.current;
      const mapping = getMapping();
      if (!container || !mapping) return;
      const rect = container.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const { ax, ay } = mapping.elementToAnalysis(cx, cy);
      if (ph === 'key-tap' || ph === 'key-reading') {
        // Screen 1: (re)start key-signature reading at the tapped spot.
        keyTapRef.current = { ax, ay };
        votesRef.current = [];
        readingStartRef.current = Date.now();
        setPhase('key-reading');
        return;
      }
      // Screen 2: tap a note. Geometry is detected fresh around the tap,
      // so moving the phone between taps never leaves a stale fit behind.
      const resolved = resolveNoteTap(ax, ay);
      if (!resolved) {
        flashHint('Tap a note on the staff');
        return;
      }
      const snapped = mapping.analysisToElement(ax, resolved.snappedAy);
      soundPosition(resolved.pos, snapped);
    },
    [flashHint, getMapping, resolveNoteTap, soundPosition]
  );

  const nudge = useCallback(
    (delta: number) => {
      if (!lastResult) return;
      const pos = Math.max(-14, Math.min(21, lastResult.pos + delta));
      const container = containerRef.current;
      const mapping = getMapping();
      let marker: { cx: number; cy: number } | null = null;
      const noteTap = lastNoteTapRef.current;
      if (container && mapping && noteTap) {
        const resolved = resolveNoteTap(noteTap.ax, noteTap.ay);
        if (resolved) {
          marker = mapping.analysisToElement(noteTap.ax, resolved.snappedAy);
        }
      }
      if (!marker && tapMarker) marker = { cx: tapMarker.x, cy: tapMarker.y };
      if (!marker && container) marker = { cx: container.clientWidth / 2, cy: container.clientHeight / 2 };
      if (marker) soundPosition(pos, marker);
    },
    [getMapping, lastResult, resolveNoteTap, soundPosition, tapMarker]
  );

  const retapKey = useCallback(() => {
    keyTapRef.current = null;
    roiRef.current = null;
    votesRef.current = [];
    lastGrayRef.current = null;
    lastGeoRef.current = null;
    setKeySource('auto');
    setShowKeyEditor(false);
    setPhase('key-tap');
  }, []);

  const applyManualKey = useCallback((name: KeySignatureName) => {
    const { type, count } = parseKeySignatureName(name);
    setKeyType(type);
    setKeyCount(count);
    setKeySource('manual');
    setShowKeyEditor(false);
    setPhase('ready');
  }, []);

  // --- Frame analysis loop -------------------------------------------------
  useEffect(() => {
    if (status !== 'live') return;
    const workCanvas = document.createElement('canvas');
    workCanvasRef.current = workCanvas;

    const drawOverlay = (phase: Phase) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const mapping = getMapping();
      if (!canvas || !container || !mapping) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Fitted staff lines from the last note tap (confirmation).
      const geo = lastGeoRef.current;
      if (geo && (phase === 'ready' || phase === 'playing')) {
        ctx.strokeStyle = 'rgba(124, 58, 237, 0.85)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const y0 = geo.yTop0 + (i * geo.staffSpace) / 2;
          const p0 = mapping.analysisToElement(0, y0);
          const p1 = mapping.analysisToElement(ANALYSIS_WIDTH, y0 + geo.skew * ANALYSIS_WIDTH);
          ctx.beginPath();
          ctx.moveTo(p0.cx, p0.cy);
          ctx.lineTo(p1.cx, p1.cy);
          ctx.stroke();
        }
      }
      const roi = roiRef.current;
      if (roi && phase === 'key-reading') {
        // Box around the tapped key-signature region.
        const p0 = mapping.analysisToElement(roi.x0, roi.y0);
        const p1 = mapping.analysisToElement(roi.x1, roi.y1);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(p0.cx, p0.cy, p1.cx - p0.cx, p1.cy - p0.cy);
        // Detected glyph boxes.
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
        for (const g of glyphsRef.current) {
          const g0 = mapping.analysisToElement(g.x, g.y);
          const g1 = mapping.analysisToElement(g.x + g.w, g.y + g.h);
          ctx.strokeRect(g0.cx, g0.cy, g1.cx - g0.cx, g1.cy - g0.cy);
        }
        const tap = keyTapRef.current;
        if (tap) {
          const p = mapping.analysisToElement(tap.ax, tap.ay);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const tick = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      // If the stream attached but playback stalled, nudge it along.
      if (video.paused && video.srcObject) {
        video.play().catch(() => undefined);
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const ah = Math.round((ANALYSIS_WIDTH * vh) / vw);
      workCanvas.width = ANALYSIS_WIDTH;
      workCanvas.height = ah;
      const wctx = workCanvas.getContext('2d', { willReadFrequently: true });
      if (!wctx) return;
      wctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ah);
      const imageData = wctx.getImageData(0, 0, ANALYSIS_WIDTH, ah);
      const gray = grayscale(imageData.data, ANALYSIS_WIDTH, ah);
      const live = liveRef.current;

      // Environment hints (key screens only).
      if (live.phase === 'key-tap' || live.phase === 'key-reading') {
        if (meanBrightness(gray) < 45) {
          setHintOverride('More light needed');
        } else if (lastGrayRef.current && frameDifference(gray, lastGrayRef.current) > 28) {
          setHintOverride('Hold steady…');
        } else {
          setHintOverride((prev) =>
            prev === 'More light needed' || prev === 'Hold steady…' ? null : prev
          );
        }
        lastGrayRef.current = gray;
      }

      const binary = binarize(gray, ANALYSIS_WIDTH, ah);
      lastBinaryRef.current = { data: binary, width: ANALYSIS_WIDTH, height: ah };

      if (live.phase === 'key-reading' && keyTapRef.current) {
        const roi = keyTapROI(keyTapRef.current.ax, keyTapRef.current.ay, ANALYSIS_WIDTH, ah);
        roiRef.current = roi;
        const det = detectKeySignature(binary, ANALYSIS_WIDTH, ah, roi);
        glyphsRef.current = det.glyphs;
        if (det.confidence > 0.3) {
          votesRef.current.push({ type: det.type, count: det.count });
          if (votesRef.current.length > VOTE_WINDOW) votesRef.current.shift();
        }
        if (votesRef.current.length >= VOTES_TO_LOCK) {
          const tally = new Map<string, number>();
          for (const v of votesRef.current) {
            const k = `${v.type}:${v.count}`;
            tally.set(k, (tally.get(k) ?? 0) + 1);
          }
          let topKey = '';
          let topVotes = 0;
          for (const [k, n] of tally) {
            if (n > topVotes) {
              topVotes = n;
              topKey = k;
            }
          }
          if (topVotes / votesRef.current.length >= LOCK_SHARE) {
            const [type, countStr] = topKey.split(':');
            setKeyType(type as KeySignatureAccidental);
            setKeyCount(countStr as KeySignatureAccidentalCount);
            setKeySource('auto');
            votesRef.current = [];
            const disp = getKeySignatureDisplayString(getKeySignatureName(type as KeySignatureAccidental, countStr as KeySignatureAccidentalCount));
            flashHint(`${disp} major ✓`);
            setPhase('ready');
          }
        } else if (Date.now() - readingStartRef.current > KEY_READING_TIMEOUT_MS) {
          votesRef.current = [];
          flashHint("Couldn't read it — tap the sharps or flats");
          setPhase('key-tap');
        }
      } else {
        glyphsRef.current = [];
        roiRef.current = null;
      }

      drawOverlay(live.phase);
    };

    setPhase('key-tap');
    const id = window.setInterval(tick, ANALYSIS_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      if (playTimeoutRef.current) window.clearTimeout(playTimeoutRef.current);
      if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    };
  }, [status, getMapping, videoRef]);

  // --- Derived UI -----------------------------------------------------------
  const keyName = getKeySignatureName(keyType, keyCount);
  const keyDisplay = getKeySignatureDisplayString(keyName);
  const phaseHint =
    phase === 'key-tap'
      ? 'Tap the key signature'
      : phase === 'key-reading'
        ? 'Reading key signature…'
        : phase === 'ready'
          ? 'Tap a note'
          : phase === 'playing'
            ? 'Playing…'
            : '';
  const hint = hintOverride ?? phaseHint;

  const startCamera = () => {
    setPhase('idle');
    void start().then(() => {
      // The analysis effect flips idle -> key-tap once live.
    });
  };

  if (status === 'idle' || status === 'requesting') {
    return (
      <div className="cam-fullscreen">
      <div className="cam-intro">
        <h2>Camera mode</h2>
        <p>
          Point your camera at your sheet music, tap the key signature, then
          tap a note to hear your pitch. Your clef stays manual.
        </p>
        {status === 'requesting' ? (
          <p className="cam-status">Starting camera…</p>
        ) : (
          <div className="cam-intro-actions">
            <button className="cam-primary" onClick={startCamera}>
              Enable camera
            </button>
            <button className="cam-secondary" onClick={onExitToManual}>
              Use manual mode instead
            </button>
          </div>
        )}
        <p className="cam-fineprint">Everything is processed on your device. No photos leave your phone.</p>
      </div>
      </div>
    );
  }

  if (status === 'denied' || status === 'unavailable') {
    return (
      <div className="cam-fullscreen">
      <div className="cam-intro">
        <h2>Camera unavailable</h2>
        <p>
          {status === 'denied'
            ? 'Camera access was denied. You can allow it in your browser settings and try again, or just use manual mode.'
            : 'This browser or device could not provide a camera. Manual mode works the same as always.'}
        </p>
        <div className="cam-intro-actions">
          {status === 'denied' && (
            <button className="cam-primary" onClick={startCamera}>
              Try again
            </button>
          )}
          <button className="cam-secondary" onClick={onExitToManual}>
            Use manual mode instead
          </button>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="cam-fullscreen">
    <div className="cam-root" ref={containerRef}>
      <video ref={videoRef} playsInline muted disablePictureInPicture className="cam-video" />
      <canvas
        ref={canvasRef}
        className="cam-overlay"
        onPointerUp={(e) => handleTap(e.clientX, e.clientY)}
      />
      {tapMarker && <div key={tapMarker.id} className="cam-tap" style={{ left: tapMarker.x, top: tapMarker.y }} />}

      <div className="cam-topbar">
        <div className="cam-topbar-row">
          <button className="cam-keychip" onClick={() => setShowKeyEditor(true)} title="Key signature">
            {phase === 'key-tap' || phase === 'key-reading' ? 'Key: ?' : `${keyDisplay}${keySource === 'manual' ? ' ✎' : ''}`}
          </button>
          <button
            className="cam-close"
            onClick={() => {
              stop();
              onExitToManual();
            }}
            aria-label="Exit camera mode"
          >
            ✕
          </button>
        </div>
        <div className="cam-clefseg" role="group" aria-label="Clef">
          {CLEFS.map((c) => (
            <button
              key={c}
              className={c === clef ? 'active' : ''}
              onClick={() => setClef(c)}
            >
              {CLEF_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {(phase === 'ready' || phase === 'playing') && lastResult && (
        <div className="cam-result">
          <div className="cam-note">{lastResult.label}</div>
          <div className="cam-result-row">
            <button onClick={() => lastResult && nudge(0)}>Replay</button>
            <button onClick={() => nudge(-1)} aria-label="Down one step">−1</button>
            <button onClick={() => nudge(1)} aria-label="Up one step">+1</button>
            <select
              value={noteAccidentalType}
              onChange={(e) => setNoteAccidentalType(e.target.value as NoteAccidental)}
              aria-label="Per-note accidental"
            >
              <option value="">Acc: none</option>
              <option value="#">Acc: ♯</option>
              <option value="b">Acc: ♭</option>
              <option value="n">Acc: ♮</option>
            </select>
          </div>
          <div className="cam-result-row">
            <button className="cam-link" onClick={retapKey}>
              Change key
            </button>
          </div>
        </div>
      )}

      <div className="cam-hintbar">{hint}</div>

      {showKeyEditor && (
        <div className="cam-sheet" role="dialog" aria-label="Key signature">
          <h3>Key signature</h3>
          <p>{keySource === 'auto' ? `Detected: ${keyDisplay}` : `Manual: ${keyDisplay}`}</p>
          <label>
            Choose manually
            <select value={keyName} onChange={(e) => applyManualKey(e.target.value as KeySignatureName)}>
              {ALL_KEY_NAMES.map((n) => (
                <option key={n} value={n}>
                  {getKeySignatureDisplayString(n)}
                </option>
              ))}
            </select>
          </label>
          <div className="cam-sheet-actions">
            <button className="cam-primary" onClick={() => { setShowKeyEditor(false); retapKey(); }}>
              Tap key signature
            </button>
            <button className="cam-secondary" onClick={() => setShowKeyEditor(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
