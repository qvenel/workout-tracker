/** Beep, vibration and screen wake lock. */

let ctx: AudioContext | null = null;

/** Must be called from a user gesture once, so later beeps are allowed. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio */
  }
}

export function alertRestOver() {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* ignore */
  }
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [0, 0.25, 0.5].forEach((dt, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = i === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + dt);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0 + dt);
    osc.stop(t0 + dt + 0.2);
  });
}

let lock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  try {
    if (wanted && !lock && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    }
  } catch {
    /* denied or unsupported */
  }
}

document.addEventListener('visibilitychange', () => void acquire());

export function keepAwake(on: boolean) {
  wanted = on;
  if (on) void acquire();
  else {
    void lock?.release();
    lock = null;
  }
}
