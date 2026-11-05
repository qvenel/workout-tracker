import { useEffect, useRef, useState } from 'preact/hooks';
import { useBackClose } from '../lib/back';
import type { Unit } from '../lib/data';
import { tick } from '../lib/device';
import { clock, fr } from '../lib/format';
import { Close } from './Icons';
import { Stepper } from './Stepper';

type Phase = 'starting' | 'recording' | 'review' | 'error';

interface Props {
  title: string;
  unit: Unit;
  /** value of the set being filmed (after Stop: of the set just validated) */
  value: number | null;
  badForm: number | null;
  /** true once Stop has validated the set */
  recorded: boolean;
  /** rest running after the set, if any */
  rest: { left: number; total: number } | null;
  /** Stop: ends the set (validates it, starts the rest) */
  onStop: () => boolean;
  onValue: (v: number | null) => void;
  onBadForm: (v: number | null) => void;
  onSkipRest: () => void;
  onClose: () => void;
}

/** quarter turn that brings landscape footage back upright (flip the sign if it shows upside down) */
const ROTATE = 90;

function pickMime(): string | undefined {
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
}

/**
 * Front camera. Stop = end of the set: it is validated and the rest starts right away,
 * then the clip plays with the rest running on top, the set counter and a stopwatch.
 * Nothing is saved: the clip is dropped on exit.
 */
export function CameraView({ title, unit, value, badForm, recorded, rest, onStop, onValue, onBadForm, onSkipRest, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // stopwatch on the clip's own time: start/stop taps while watching
  const [swStart, setSwStart] = useState<number | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ h: number; style: Record<string, string> }>({ h: 240, style: {} });
  const [fast, setFast] = useState(false);
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
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
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

  // smooth stopwatch display while the clip plays
  useEffect(() => {
    if (swStart == null) return;
    let raf = 0;
    const loop = () => {
      if (playRef.current) setTime(playRef.current.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [swStart]);

  const stop = () => {
    tick();
    setDuration((Date.now() - startedAt) / 1000);
    onStop();
    recRef.current?.stop();
  };

  const seek = (t: number) => {
    const v = playRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
  };

  const togglePlay = () => {
    const v = playRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime >= duration - 0.05) v.currentTime = 0;
      void v.play();
    } else v.pause();
  };

  const stopwatch = () => {
    tick();
    const t = playRef.current?.currentTime ?? 0;
    if (swStart == null) {
      setSwStart(t);
      setMeasured(null);
      if (playRef.current?.paused) void playRef.current.play();
    } else {
      const m = Math.max(0, Math.round((t - swStart) * 10) / 10);
      setSwStart(null);
      setMeasured(m);
      if (unit === 'seconds') onValue(m);
    }
  };

  /**
   * Filmed with the phone turned a quarter turn counter-clockwise while the app stays portrait:
   * the frames are portrait with the scene on its side, so playback turns them back upright,
   * full width. Mirrored like the preview (front camera).
   */
  const fit = () => {
    const v = playRef.current;
    const b = boxRef.current;
    if (!v || !b || !v.videoWidth) return;
    const cw = b.clientWidth;
    const portrait = v.videoHeight > v.videoWidth;
    if (!portrait) {
      const h = Math.min((cw * v.videoHeight) / v.videoWidth, window.innerHeight * 0.5);
      setBox({ h, style: { width: '100%', height: `${h}px`, transform: 'scaleX(-1)' } });
      return;
    }
    // displayed (after rotation): cw wide, cw * w / h tall; the element itself is sized before rotation
    const shownH = (cw * v.videoWidth) / v.videoHeight;
    setBox({
      h: shownH,
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${shownH}px`,
        height: `${cw}px`,
        transform: `translate(-50%, -50%) scaleX(-1) rotate(${ROTATE}deg)`,
      },
    });
  };

  const jump = (d: number) => {
    tick();
    seek(time + d);
  };

  const toggleSpeed = () => {
    tick();
    const next = !fast;
    setFast(next);
    if (playRef.current) playRef.current.playbackRate = next ? 2 : 1;
  };

  const swShown = swStart != null ? Math.max(0, time - swStart) : measured;

  if (phase === 'review' && url) {
    return (
      <div class="screen dark">
        <header class="cam-head">
          <span class="cam-title">{title}</span>
          {rest ? (
            <div class="cam-rest" role="timer" aria-label="Repos en cours">
              <span class="cam-rest-label">Repos</span>
              <span class={`cam-rest-time ${rest.left <= 5 ? 'ending' : ''}`}>{clock(rest.left)}</span>
              <button type="button" class="cam-rest-skip" onClick={onSkipRest}>Passer</button>
              <div class="rest-bar" style={{ width: `${Math.min(100, (1 - rest.left / rest.total) * 100)}%` }} />
            </div>
          ) : (
            recorded && <span class="cam-rest-done">Repos terminé</span>
          )}
        </header>
        <main class="review">
          <div class="clip-box" ref={boxRef} style={{ height: `${box.h}px` }}>
            <video
              ref={playRef}
              class="clip"
              src={url}
              playsInline
              muted
              preload="auto"
              style={box.style}
              onLoadedMetadata={fit}
              onClick={togglePlay}
              onTimeUpdate={(e) => setTime((e.currentTarget as HTMLVideoElement).currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                if (swStart != null) stopwatch();
              }}
            />
          </div>
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
            <div class="transport">
              <button type="button" class="round jump" aria-label="Reculer de 5 secondes" onClick={() => jump(-5)}>−5</button>
              <button type="button" class="round play" aria-label={playing ? 'Pause' : 'Lecture'} onClick={togglePlay}>
                {playing ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>
                )}
              </button>
              <button type="button" class="round jump" aria-label="Avancer de 5 secondes" onClick={() => jump(5)}>+5</button>
              <button type="button" class={`round jump speed ${fast ? 'on' : ''}`} aria-label="Vitesse double" aria-pressed={fast} onClick={toggleSpeed}>×2</button>
              <span class="scrub-time">{fr(Math.round(time * 10) / 10)} s</span>
            </div>
          </div>

          <div class="cam-tools">
            {recorded ? (
              <div class="cam-counter">
                <Stepper
                  size="big"
                  label={unit === 'seconds' ? 'Secondes' : 'Reps'}
                  value={value}
                  step={unit === 'seconds' ? 0.5 : 1}
                  suffix={unit === 'seconds' ? 's' : undefined}
                  onChange={onValue}
                />
                <Stepper size="small" label="Mauvaise forme" value={badForm} step={unit === 'seconds' ? 0.5 : 1} muted onChange={onBadForm} />
              </div>
            ) : (
              <div />
            )}
            <button type="button" class={`stopwatch ${swStart != null ? 'running' : ''}`} onClick={stopwatch}>
              <span class="sw-label">{swStart != null ? 'Stop' : measured != null ? 'Recommencer' : 'Chrono'}</span>
              <span class="sw-time">{swShown != null ? `${fr(Math.round(swShown * 10) / 10)} s` : '–'}</span>
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
      <video ref={liveRef} class="live mirror" autoPlay muted playsInline />
      <header class="cam-overlay-top">
        <button type="button" class="round dim" aria-label="Annuler sans valider" onClick={onClose}>
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
      {phase === 'recording' && rest && (
        <div class="cam-live-rest" role="timer" aria-label="Repos restant">
          <span class="cam-rest-label">Repos</span>
          <span class={`cam-live-rest-time ${rest.left <= 5 ? 'ending' : ''}`}>{clock(rest.left)}</span>
        </div>
      )}
      {phase === 'error' && <p class="cam-error">{error}</p>}
      {phase === 'recording' && (
        <footer class="cam-overlay-bottom">
          <button type="button" class="stop" aria-label="Arrêter et valider la série" onClick={stop}>
            <span />
          </button>
          <span class="cam-hint">Stop = fin de la série</span>
        </footer>
      )}
    </div>
  );
}
