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
  detectStaff,
  frameDifference,
  grayscale,
  isOnStaff,
  meanBrightness,
  quantizeStaffPosition,
  staffPositionAt,
  type StaffFit,
} from './geometry';
import { detectKeySignature } from './keySignature';
import { useCamera } from './useCamera';
import type {
  ClefType,
  KeySignatureAccidental,
  KeySignatureAccidentalCount,
  KeySignatureName,
  NoteAccidental,
} from '../types/musicTypes';
import './CameraMode.css';

type Phase = 'idle' | 'scanning' | 'ready' | 'playing';

const ANALYSIS_WIDTH = 640;
const ANALYSIS_INTERVAL_MS = 150;
const VOTE_WINDOW = 10;
const VOTES_TO_LOCK = 6;
const LOCK_SHARE = 0.7;
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

  const staffFitRef = useRef<StaffFit | null>(null);
  const glyphsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const votesRef = useRef<{ type: KeySignatureAccidental; count: number }[]>([]);
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

  const handleTap = useCallback(
    (clientX: number, clientY: number) => {
      const { phase: ph } = liveRef.current;
      if (ph !== 'ready' && ph !== 'playing') return;
      const container = containerRef.current;
      const mapping = getMapping();
      const fit = staffFitRef.current;
      if (!container || !mapping) return;
      if (!fit || fit.confidence < 0.2) {
        flashHint('No staff in view — aim at your music');
        return;
      }
      const rect = container.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const { ax, ay } = mapping.elementToAnalysis(cx, cy);
      if (!isOnStaff(fit, ax, ay)) {
        flashHint('Tap a note on the staff');
        return;
      }
      const pos = quantizeStaffPosition(staffPositionAt(fit, ax, ay));
      // Snap the marker to the detected line/space, not the raw touch point.
      const topY = fit.lines[0].slope * ax + fit.lines[0].intercept;
      const snappedAy = topY + ((7 - pos) / 2) * fit.staffSpace;
      const snapped = mapping.analysisToElement(ax, snappedAy);
      soundPosition(pos, snapped);
    },
    [flashHint, getMapping, soundPosition]
  );

  const nudge = useCallback(
    (delta: number) => {
      if (!lastResult) return;
      const pos = Math.max(-14, Math.min(21, lastResult.pos + delta));
      const container = containerRef.current;
      const mapping = getMapping();
      const fit = staffFitRef.current;
      let marker: { cx: number; cy: number } = { cx: container ? container.clientWidth / 2 : 0, cy: 0 };
      if (container && mapping && fit) {
        const rect = container.getBoundingClientRect();
        const ax = mapping.elementToAnalysis(rect.width / 2, 0).ax;
        const topY = fit.lines[0].slope * ax + fit.lines[0].intercept;
        marker = mapping.analysisToElement(ax, topY + ((7 - pos) / 2) * fit.staffSpace);
      }
      soundPosition(pos, marker);
    },
    [getMapping, lastResult, soundPosition]
  );

  const rescanKey = useCallback(() => {
    votesRef.current = [];
    lastGrayRef.current = null;
    setKeySource('auto');
    setShowKeyEditor(false);
    setPhase('scanning');
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

    const drawOverlay = (staff: StaffFit | null, scanning: boolean) => {
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

      if (staff) {
        ctx.strokeStyle = 'rgba(124, 58, 237, 0.85)';
        ctx.lineWidth = 2;
        for (const line of staff.lines) {
          const p0 = mapping.analysisToElement(0, line.intercept);
          const p1 = mapping.analysisToElement(ANALYSIS_WIDTH, line.slope * ANALYSIS_WIDTH + line.intercept);
          ctx.beginPath();
          ctx.moveTo(p0.cx, p0.cy);
          ctx.lineTo(p1.cx, p1.cy);
          ctx.stroke();
        }
      }
      if (scanning) {
        // Scan brackets around the key-signature zone (left half of frame).
        const r0 = mapping.analysisToElement(ANALYSIS_WIDTH * 0.03, 0);
        const r1 = mapping.analysisToElement(ANALYSIS_WIDTH * 0.5, 0);
        const bracket = 26;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3;
        const top = 90;
        const bottom = rect.height - 190;
        for (const [bx, dir] of [[r0.cx, 1], [r1.cx, -1]] as [number, number][]) {
          ctx.beginPath();
          ctx.moveTo(bx + dir * bracket, top);
          ctx.lineTo(bx, top);
          ctx.lineTo(bx, top + bracket);
          ctx.moveTo(bx, bottom - bracket);
          ctx.lineTo(bx, bottom);
          ctx.lineTo(bx + dir * bracket, bottom);
          ctx.stroke();
        }
        // Detected glyph boxes.
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
        ctx.lineWidth = 2;
        for (const g of glyphsRef.current) {
          const p0 = mapping.analysisToElement(g.x, g.y);
          const p1 = mapping.analysisToElement(g.x + g.w, g.y + g.h);
          ctx.strokeRect(p0.cx, p0.cy, p1.cx - p0.cx, p1.cy - p0.cy);
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

      // Environment hints (scanning phase only).
      if (live.phase === 'scanning') {
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
      const staff = detectStaff(binary, ANALYSIS_WIDTH, ah);
      staffFitRef.current = staff;

      if (live.phase === 'scanning' && staff && staff.confidence > 0.2) {
        const det = detectKeySignature(binary, ANALYSIS_WIDTH, ah, staff);
        glyphsRef.current = det.glyphs;
        if (det.confidence > 0.35) {
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
            setPhase('ready');
          }
        }
      } else {
        glyphsRef.current = [];
      }

      drawOverlay(staff, live.phase === 'scanning');
    };

    setPhase('scanning');
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
    phase === 'scanning'
      ? 'Finding key signature… point at the start of your line'
      : phase === 'ready'
        ? 'Tap a note'
        : phase === 'playing'
          ? 'Playing…'
          : '';
  const hint = hintOverride ?? phaseHint;

  const startCamera = () => {
    setPhase('idle');
    void start().then(() => {
      // The analysis effect flips idle -> scanning once live.
    });
  };

  if (status === 'idle' || status === 'requesting') {
    return (
      <div className="cam-fullscreen">
      <div className="cam-intro">
        <h2>Camera mode</h2>
        <p>
          Point your camera at your sheet music, tap a note, and hear your pitch.
          The app reads the key signature from the page. Your clef stays manual.
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
            Use manual mode
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
            {phase === 'scanning' ? 'Finding key…' : `${keyDisplay}${keySource === 'manual' ? ' ✎' : ''}`}
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
            <button className="cam-link" onClick={rescanKey}>
              Rescan key
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
            <button className="cam-primary" onClick={rescanKey}>
              Auto-detect
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
