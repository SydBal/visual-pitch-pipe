import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable';

export interface CameraControls {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Manages a getUserMedia video stream, preferring the rear camera.
 *
 * The <video> element only mounts once status flips to 'live', so the stream
 * is attached in an effect after mount — attaching it inside start() races
 * the render and leaves the preview black.
 */
export function useCamera(): CameraControls {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStatus('live');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setStatus('denied');
      } else {
        setStatus('unavailable');
      }
    }
  }, []);

  // Attach the stream once the video element exists.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (status === 'live' && video && stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  }, [status]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return { videoRef, status, start, stop };
}
