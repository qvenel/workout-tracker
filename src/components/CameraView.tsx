import { useEffect, useRef, useState } from 'preact/hooks';
import { useBackClose } from '../lib/back';
import { clock, fr } from '../lib/format';
import { Back, Close } from './Icons';

type Phase = 'starting' | 'recording' | 'review' | 'error';

const FRAME = 1 / 30;

function pickMime(): string | undefined {
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
}

/** Records a clip in-app, lets you scrub it, and throws it away on exit. Nothing is saved. */
export function CameraView({ title, onClose }: { title: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const liveRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  useBackClose(onClose);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (liveRef.current) liveRef.current.srcObject = stream;
        const mimeType = pickMime();
        const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.onstop = () => {
          const blob = new Blob(chunks.current, { type: rec.mimeType || 'video/webm' });
          setUrl(URL.createObjectURL(blob));
          stopStream();
          setPhase('review');
        };
        recRef.current = rec;
        rec.start(250);
        setStartedAt(Date.now());
        setPhase('recording');
      } catch (e) {
        setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Accès à la caméra refusé' : 'Caméra indisponible');
        setPhase('error');
      }
    })();
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => {
      cancelled = true;
      clearInterval(t);
      if (recRef.current?.state === 'recording') {
        recRef.current.onstop = null;
        recRef.current.stop();
      }
      stopStream();
    };
  }, []);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const stop = () => {
    setDuration((Date.now() - startedAt) / 1000);
    recRef.current?.stop();
  };

  const seek = (t: number) => {
    const v = playRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(duration, t));
  };

  if (phase === 'review' && url) {
    return (
      <div class="screen dark">
        <header class="cam-head">
          <span class="cam-title">{title}</span>
        </header>
        <main class="review">
          <video
            ref={playRef}
            class="clip"
            src={url}
            playsInline
            muted
            preload="auto"
            onTimeUpdate={(e) => setTime((e.currentTarget as HTMLVideoElement).currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          <div class="scrub">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={time}
              aria-label="Position dans la vidéo"
              onInput={(e) => seek(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <div class="scrub-times">
              <span class="strong">{fr(Math.round(time * 10) / 10)} s</span>
              <span>{fr(Math.round(duration * 10) / 10)} s</span>
            </div>
          </div>
          <div class="transport">
            <button type="button" class="round" aria-label="Image précédente" onClick={() => seek(time - FRAME)}>
              <Back size={22} />
            </button>
            <button
              type="button"
              class="round play"
              aria-label={playing ? 'Pause' : 'Lecture'}
              onClick={() => {
                const v = playRef.current;
                if (!v) return;
                if (v.paused) {
                  if (v.currentTime >= duration - 0.05) v.currentTime = 0;
                  void v.play();
                } else v.pause();
              }}
            >
              {playing ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>
              )}
            </button>
            <button type="button" class="round" aria-label="Image suivante" onClick={() => seek(time + FRAME)}>
              <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Back size={22} /></span>
            </button>
          </div>
        </main>
        <footer class="cam-foot">
          <button type="button" class="light" onClick={onClose}>Retour à la séance</button>
        </footer>
      </div>
    );
  }

  return (
    <div class="screen dark camera">
      <video ref={liveRef} class="live" autoPlay muted playsInline />
      <header class="cam-overlay-top">
        <button type="button" class="round dim" aria-label="Annuler" onClick={onClose}>
          <Close size={22} />
        </button>
        {phase === 'recording' && (
          <span class="rec">
            <span class="dot" />
            {clock((now - startedAt) / 1000)}
          </span>
        )}
        <span style={{ width: '48px' }} />
      </header>
      {phase === 'error' && <p class="cam-error">{error}</p>}
      {phase === 'recording' && (
        <footer class="cam-overlay-bottom">
          <button type="button" class="stop" aria-label="Arrêter l'enregistrement" onClick={stop}>
            <span />
          </button>
          <span class="cam-hint">Stop pour revoir</span>
        </footer>
      )}
    </div>
  );
}
