import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import type { Data, Exercise } from '../lib/data';
import { useBackGuard } from '../lib/back';
import { alertRestOver, beepCount, beepMark, beepTen } from '../lib/device';
import { clock, formatSet } from '../lib/format';
import { useFlip } from '../lib/motion';
import {
  type ActiveSession,
  type Step,
  makeStep,
  nthOfExercise,
  propagate,
  restFor,
  restSignal,
} from '../lib/session';
import { CameraView } from './CameraView';
import { ExercisePicker } from './ExercisePicker';
import { Check, Chevron, Handle, More, Plus, Timer } from './Icons';
import { Sheet } from './Sheet';
import { StepCard } from './StepCard';

interface Props {
  data: Data;
  session: ActiveSession;
  onChange: (s: ActiveSession) => void;
  onFinish: (comment: string) => void;
  onDiscard: () => void;
}

type Picker = { mode: 'add' } | { mode: 'replace'; stepId: string };

export function SessionView({ data, session, onChange, onFinish, onDiscard }: Props) {
  const [now, setNow] = useState(Date.now());
  const [showAllDone, setShowAllDone] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [camera, setCamera] = useState<{ stepId: string } | null>(null);
  const [comment, setComment] = useState('');
  const [discardArmed, setDiscardArmed] = useState(false);
  const upcomingRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const skipFlip = useRef(false);
  useFlip(timelineRef, skipFlip);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useBackGuard();
  const [compact, setCompact] = useState(false);
  const headRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > (headRef.current?.offsetHeight ?? 100) - 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const steps = session.steps;
  const done = steps.filter((s) => s.status === 'done');
  const todo = steps.filter((s) => s.status === 'todo');
  const active = todo[0];
  const upcoming = todo.slice(1);
  const lastDone = done[done.length - 1];
  const restLeft = lastDone?.doneAt && lastDone.restSec ? lastDone.restSec - (now - lastDone.doneAt) / 1000 : 0;
  const resting = !!lastDone && !lastDone.restSkipped && !!active && restLeft > 0;
  const warmup = session.warmup;
  const warmupLeft = warmup ? warmup.sec - (now - session.startedAt) / 1000 : 0;
  const warmingUp = !!warmup && !warmup.skipped && !warmup.alerted && !done.length && warmupLeft > 0;
  const setWarmup = (patch: Partial<NonNullable<ActiveSession['warmup']>>) =>
    onChange({ ...sessionRef.current, warmup: { ...sessionRef.current.warmup!, ...patch } });

  const setSteps = (next: Step[]) => onChange({ ...sessionRef.current, steps: next });
  const patchStep = (id: string, patch: Partial<Step>) =>
    setSteps(sessionRef.current.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Short beep when 30 s, 1:00, 1:30… are left; triple beep + vibration when rest is over
  useEffect(() => {
    if (!lastDone || !active || lastDone.restSkipped || lastDone.restAlerted || !lastDone.restSec) return;
    const signal = restSignal(lastDone.restSec, restLeft, lastDone.restBeepedAt);
    if (signal?.kind === 'end') {
      alertRestOver();
      patchStep(lastDone.id, { restAlerted: true, restTaken: lastDone.restTaken ?? lastDone.restSec });
    } else if (signal) {
      play(signal.kind);
      patchStep(lastDone.id, { restBeepedAt: signal.mark });
    }
  });

  // Warm-up: short beep at each minute left, triple beep when over
  useEffect(() => {
    if (!warmup || warmup.skipped || warmup.alerted || done.length) return;
    const signal = restSignal(warmup.sec, warmupLeft, warmup.beepedAt, 60);
    if (signal?.kind === 'end') {
      alertRestOver();
      setWarmup({ alerted: true });
    } else if (signal) {
      play(signal.kind);
      setWarmup({ beepedAt: signal.mark });
    }
  });

  // Keep the action at the top of the screen: rest (or warm-up), then the current set, then what's next.
  const focusKey = `${lastDone?.id ?? 'start'}|${camera ? 'cam' : ''}`;
  const firstFocus = useRef(true);
  useEffect(() => {
    if (camera) return;
    const root = timelineRef.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>('.rest') ?? root.querySelector<HTMLElement>('.card') ?? root.querySelector<HTMLElement>('.all-done');
    if (!target) return;
    const first = firstFocus.current;
    firstFocus.current = false;
    // after the FLIP frame, so layout is final
    requestAnimationFrame(() => {
      const y = root.getBoundingClientRect().top + target.offsetTop; // position in the viewport
      // opening the session: leave the page at the top if the step is already in view
      if (first && y < window.innerHeight * 0.6) return;
      const delta = y - HEADER_COMPACT - 8;
      if (Math.abs(delta) < 6) return;
      window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: first ? 'auto' : 'smooth' });
    });
  }, [focusKey]);

  // Drag & drop on upcoming sets
  useEffect(() => {
    const el = upcomingRef.current;
    if (!el) return;
    const sortable = Sortable.create(el, {
      handle: '.handle',
      animation: 150,
      onEnd: (evt) => {
        const { oldIndex, newIndex, item, from } = evt;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        skipFlip.current = true; // Sortable already animated the move
        // let Preact own the DOM: undo Sortable's move, then reorder state
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        const cur = sessionRef.current.steps;
        const d = cur.filter((s) => s.status === 'done');
        const t = cur.filter((s) => s.status === 'todo');
        const [head, ...rest] = t;
        const [moved] = rest.splice(oldIndex, 1);
        rest.splice(newIndex, 0, moved);
        onChange({ ...sessionRef.current, steps: [...d, head, ...rest] });
      },
    });
    return () => sortable.destroy();
  }, [upcoming.length > 0]);

  const validate = (): boolean => {
    const cur = sessionRef.current.steps;
    const current = cur.find((s) => s.status === 'todo');
    if (!current) return false;
    // a double tap must not validate two sets
    const prev = cur.filter((s) => s.status === 'done').pop();
    const t = Date.now();
    if (prev?.doneAt && t - prev.doneAt < 1000) return false;
    const isLast = cur.filter((s) => s.status === 'todo').length === 1;
    const doneStep: Step = {
      ...current,
      status: 'done',
      touched: true,
      doneAt: t,
      restSec: restFor(),
      restSkipped: isLast,
      restAlerted: false,
    };
    const next = cur.map((s) => {
      if (s.id === current.id) return doneStep;
      // validating during a rest ends it: keep how long it actually lasted
      if (prev && s.id === prev.id && prev.restTaken == null && !prev.restSkipped && prev.doneAt && prev.restSec)
        return { ...s, restTaken: Math.min(prev.restSec, (t - prev.doneAt) / 1000) };
      return s;
    });
    setSteps(propagate(next, doneStep));
    return true;
  };

  const skipRest = () => lastDone?.doneAt && patchStep(lastDone.id, { restSkipped: true, restTaken: (Date.now() - lastDone.doneAt) / 1000 });

  const adjustRest = (delta: number) => {
    if (!lastDone?.restSec) return;
    const restSec = Math.max(15, lastDone.restSec + delta);
    patchStep(lastDone.id, { restSec });
  };

  /** Re-prefill only the given steps (new or replaced), from history, at their position in the session. */
  const rebuild = (list: Step[], ids: Set<string>, extra: Exercise[]) =>
    list.map((s, i) => (ids.has(s.id) ? { ...makeStep(data, s.exercise, nthOfExercise(list, i), undefined, extra), id: s.id } : s));

  const onPick = (ex: Exercise, count: number, isNew: boolean) => {
    const cur = sessionRef.current;
    const extra = isNew ? [...cur.newExercises, ex] : cur.newExercises;
    let list = cur.steps;
    const changed = new Set<string>();
    if (picker?.mode === 'add') {
      const added = Array.from({ length: count }, () => makeStep(data, ex.name, 1, undefined, extra));
      added.forEach((s) => changed.add(s.id));
      list = [...list, ...added];
    } else if (picker?.mode === 'replace') {
      const target = list.find((s) => s.id === picker.stepId);
      if (target) {
        const from = list.indexOf(target);
        list = list.map((s, i) => {
          if (i < from || s.status !== 'todo' || s.exercise !== target.exercise) return s;
          changed.add(s.id);
          return { ...s, exercise: ex.name };
        });
      }
    }
    onChange({ ...cur, newExercises: extra, steps: rebuild(list, changed, extra) });
    setPicker(null);
  };

  const menuStep = steps.find((s) => s.id === menuFor);
  const editStep = steps.find((s) => s.id === editing);
  const elapsed = (now - session.startedAt) / 1000;
  const visibleDone = showAllDone ? done : done.slice(-2);
  const hiddenCount = done.length - visibleDone.length;

  const camStep = camera && steps.find((s) => s.id === camera.stepId);
  if (camera && camStep) {
    const camRest = camStep.status === 'done' && camStep.id === lastDone?.id && resting ? { left: restLeft, total: camStep.restSec ?? 1 } : null;
    return (
      <CameraView
        title={`${camStep.exercise} · série ${nthOfExercise(steps, steps.indexOf(camStep))}`}
        unit={camStep.unit}
        value={camStep.value}
        recorded={camStep.status === 'done'}
        rest={camRest}
        onStop={validate}
        onValue={(value) => patchStep(camStep.id, { value, touched: true })}
        onSkipRest={skipRest}
        onClose={() => setCamera(null)}
      />
    );
  }

  return (
    <div class="screen">
      <div class="bar-anchor" aria-hidden={!compact}>
        <div class={`top-bar ${compact ? 'on' : ''}`}>
          <span class="top-name">{session.name}</span>
          <span class="chrono small">
            <Timer size={16} />
            {clock(elapsed)}
          </span>
        </div>
      </div>
      <header class="session-head" ref={headRef}>
        <div class="head-text">
          <span class="date">{new Date(session.startedAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>{session.name}</h1>
        </div>
        <span class="chrono">
          <Timer />
          {clock(elapsed)}
        </span>
      </header>

      <main class="timeline" ref={timelineRef}>
        {done.length > 2 && (
          <button type="button" class="collapsed" data-flip="collapsed" onClick={() => setShowAllDone(!showAllDone)}>
            <span class="ok"><Check /></span>
            <span class="grow">{showAllDone ? 'Masquer les séries faites' : plural(hiddenCount, 'série faite', 'séries faites')}</span>
            <span class={`chev ${showAllDone ? "up" : ""}`}><Chevron /></span>
          </button>
        )}

        {warmingUp && warmup && (
          <section class="rest warmup" role="timer" aria-label="Échauffement en cours" data-flip="warmup">
            <div class="grow">
              <span class="rest-label">Échauffement</span>
              <span class={`rest-time ${warmupLeft <= 5 ? 'ending' : ''}`}>{clock(warmupLeft)}</span>
            </div>
            <button type="button" class="rest-btn" onClick={() => setWarmup({ sec: Math.max(60, warmup.sec - 60) })} aria-label="Une minute de moins">−1′</button>
            <button type="button" class="rest-btn" onClick={() => setWarmup({ sec: warmup.sec + 60 })} aria-label="Une minute de plus">+1′</button>
            <button type="button" class="rest-btn solid" onClick={() => setWarmup({ skipped: true })}>Passer</button>
            <div class="rest-bar" style={{ width: `${Math.min(100, (1 - warmupLeft / warmup.sec) * 100)}%` }} />
          </section>
        )}
        {warmup && !warmingUp && (showAllDone || done.length <= 2) && (
          <div class="rest-line" data-flip="warmup-line"><Timer size={14} /> Échauffement</div>
        )}

        {visibleDone.map((s) => {
          const isLastDone = s.id === lastDone?.id;
          return (
            <div key={s.id} data-flip={s.id}>
              <button type="button" class={`done-row ${s.doneAt && now - s.doneAt < 1500 ? 'fresh' : ''}`} onClick={() => setEditing(s.id)}>
                <span class="ok"><Check /></span>
                <span class="grow">{s.exercise}</span>
                <span class="val">{formatSet(shown(s), s.unit)}</span>
              </button>
              {s.restTaken != null && !(isLastDone && resting) && (
                <div class="rest-line"><Timer size={14} /> Repos {clock(s.restTaken)}</div>
              )}
            </div>
          );
        })}

        {resting && lastDone && (
          <section class="rest" role="timer" aria-label="Repos en cours" data-flip={`rest-${lastDone.id}`}>
            <div class="grow">
              <span class="rest-label">Repos</span>
              <span class={`rest-time ${restLeft <= 5 ? "ending" : ""}`}>{clock(restLeft)}</span>
            </div>
            <button type="button" class="rest-btn" onClick={() => adjustRest(-15)}>−15</button>
            <button type="button" class="rest-btn" onClick={() => adjustRest(15)}>+15</button>
            <button type="button" class="rest-btn solid" onClick={skipRest}>Passer</button>
            <div class="rest-bar" style={{ width: `${Math.min(100, (1 - restLeft / (lastDone.restSec ?? 1)) * 100)}%` }} />
          </section>
        )}

        {active && (
          <StepCard
            key={active.id}
            flipId={active.id}
            step={active}
            nth={nthOfExercise(steps, steps.indexOf(active))}
            actionLabel="Valider"
            onChange={(p) => patchStep(active.id, p)}
            onAction={validate}
            onMenu={() => setMenuFor(active.id)}
            onCamera={() => setCamera({ stepId: active.id })}
          />
        )}

        {!active && (
          <div class="all-done" data-flip="all-done">
            <strong>Plus rien au programme.</strong>
            <span>Ajoute un exo ou termine la séance.</span>
          </div>
        )}

        <div ref={upcomingRef} class="upcoming">
          {upcoming.map((s) => {
            const idx = steps.indexOf(s);
            return (
              <div class="up-row" key={s.id} data-flip={s.id}>
                <span class="handle" aria-label="Déplacer"><Handle /></span>
                <div class="grow">
                  <span class="up-name">{s.exercise}</span>
                  <span class="up-sub">Série {nthOfExercise(steps, idx)} · {formatSet(shown(s), s.unit)}</span>
                </div>
                <button type="button" class="icon-btn" aria-label={`Options de ${s.exercise}`} onClick={() => setMenuFor(s.id)}>
                  <More size={20} />
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" class="ghost" data-flip="add" onClick={() => setPicker({ mode: 'add' })}>
          <Plus /> Ajouter un exo
        </button>
        <button type="button" class="finish" data-flip="finish" onClick={() => setFinishing(true)}>Terminer la séance</button>
      </main>

      {menuStep && (
        <Sheet title={menuStep.exercise} onClose={() => setMenuFor(null)}>
          <div class="menu">
            {menuStep.id !== active?.id && (
              <button type="button" onClick={() => {
                const cur = sessionRef.current.steps;
                const d = cur.filter((s) => s.status === 'done');
                const t = cur.filter((s) => s.status === 'todo' && s.id !== menuStep.id);
                setSteps([...d, menuStep, ...t]);
                setMenuFor(null);
              }}>Faire maintenant</button>
            )}
            <button type="button" onClick={() => { setPicker({ mode: 'replace', stepId: menuStep.id }); setMenuFor(null); }}>
              Remplacer l'exo
            </button>
            <button type="button" onClick={() => {
              const cur = sessionRef.current.steps;
              const i = cur.indexOf(cur.find((s) => s.id === menuStep.id)!);
              const copy: Step = { ...menuStep, id: `${menuStep.id}-${Date.now().toString(36)}`, touched: false, badForm: null };
              setSteps([...cur.slice(0, i + 1), copy, ...cur.slice(i + 1)]);
              setMenuFor(null);
            }}>Ajouter une série</button>
            {(['weight', 'rings', 'bands'] as const).map((f) => (
              <button type="button" key={f} onClick={() => {
                patchStep(menuStep.id, { fields: { ...menuStep.fields, [f]: !menuStep.fields[f] } });
                setMenuFor(null);
              }}>
                {menuStep.fields[f] ? 'Retirer' : 'Ajouter'} {f === 'weight' ? 'la charge' : f === 'rings' ? 'le niveau d’anneaux' : 'la bande'}
              </button>
            ))}
            <button type="button" class="danger" onClick={() => { setSteps(sessionRef.current.steps.filter((s) => s.id !== menuStep.id)); setMenuFor(null); }}>
              Supprimer cette série
            </button>
            <button type="button" class="danger" onClick={() => {
              setSteps(sessionRef.current.steps.filter((s) => s.status === 'done' || s.exercise !== menuStep.exercise));
              setMenuFor(null);
            }}>Supprimer l'exo (séries restantes)</button>
          </div>
        </Sheet>
      )}

      {editStep && (
        <Sheet onClose={() => setEditing(null)}>
          <StepCard
            step={editStep}
            nth={nthOfExercise(steps, steps.indexOf(editStep))}
            actionLabel="OK"
            onChange={(p) => patchStep(editStep.id, p)}
            onAction={() => setEditing(null)}
          />
          <button type="button" class="link danger" onClick={() => { setSteps(steps.filter((s) => s.id !== editStep.id)); setEditing(null); }}>
            Supprimer cette série
          </button>
        </Sheet>
      )}

      {picker && (
        <ExercisePicker
          data={data}
          extra={session.newExercises}
          title={picker.mode === 'add' ? 'Ajouter un exo' : 'Remplacer par'}
          withCount={picker.mode === 'add'}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}

      {finishing && (
        <Sheet title="Terminer la séance" onClose={() => { setFinishing(false); setDiscardArmed(false); }}>
          <p class="hint">
            {plural(done.length, 'série faite', 'séries faites')} en {clock(elapsed)}.
            {todo.length ? ` ${plural(todo.length, 'série non faite sera ignorée', 'séries non faites seront ignorées')}.` : ''}
          </p>
          <label class="field">
            Commentaire (optionnel)
            <textarea rows={3} value={comment} onInput={(e) => setComment((e.currentTarget as HTMLTextAreaElement).value)} />
          </label>
          <button type="button" class="primary" disabled={!done.length} onClick={() => onFinish(comment)}>Enregistrer</button>
          <button type="button" class="link danger" onClick={() => (discardArmed ? onDiscard() : setDiscardArmed(true))}>
            {discardArmed ? 'Toucher encore pour confirmer' : 'Abandonner sans enregistrer'}
          </button>
        </Sheet>
      )}
    </div>
  );
}

/** height of the sticky header once the page has scrolled */
const HEADER_COMPACT = 56;

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Values as they will be saved: hidden fields don't count. */
const shown = (s: Step) => ({
  ...s,
  weight: s.fields.weight ? s.weight : null,
  rings: s.fields.rings ? s.rings : null,
  bands: s.fields.bands ? s.bands : null,
});

function play(kind: 'mark' | 'ten' | 'count') {
  if (kind === 'count') beepCount();
  else if (kind === 'ten') beepTen();
  else beepMark();
}
