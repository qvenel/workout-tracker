import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import type { Data, Exercise } from '../lib/data';
import { alertRestOver, beepMark } from '../lib/device';
import { clock, formatSet } from '../lib/format';
import {
  type ActiveSession,
  type Step,
  makeStep,
  nthOfExercise,
  propagate,
  rememberRest,
  restFor,
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
  const [camera, setCamera] = useState(false);
  const [comment, setComment] = useState('');
  const [discardArmed, setDiscardArmed] = useState(false);
  const upcomingRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

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

  const setSteps = (next: Step[]) => onChange({ ...sessionRef.current, steps: next });
  const patchStep = (id: string, patch: Partial<Step>) =>
    setSteps(sessionRef.current.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Short beep when 30 s, 1:00, 1:30… are left; triple beep + vibration when rest is over
  useEffect(() => {
    if (!lastDone || !active || lastDone.restSkipped || lastDone.restAlerted || !lastDone.restSec) return;
    if (restLeft <= 0) {
      alertRestOver();
      patchStep(lastDone.id, { restAlerted: true });
      return;
    }
    const mark = Math.ceil(restLeft / 30) * 30;
    if (mark < lastDone.restSec && (lastDone.restBeepedAt == null || mark < lastDone.restBeepedAt)) {
      beepMark();
      patchStep(lastDone.id, { restBeepedAt: mark });
    }
  });

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

  const validate = () => {
    if (!active) return;
    const cur = sessionRef.current.steps;
    const isLast = cur.filter((s) => s.status === 'todo').length === 1;
    const doneStep: Step = {
      ...active,
      status: 'done',
      touched: true,
      doneAt: Date.now(),
      restSec: restFor(active.exercise),
      restSkipped: isLast,
      restAlerted: false,
    };
    setSteps(propagate(cur.map((s) => (s.id === active.id ? doneStep : s)), doneStep));
  };

  const adjustRest = (delta: number) => {
    if (!lastDone?.restSec) return;
    const restSec = Math.max(15, lastDone.restSec + delta);
    rememberRest(lastDone.exercise, restSec);
    patchStep(lastDone.id, { restSec });
  };

  const rebuildFrom = (list: Step[], extra: Exercise[]) =>
    list.map((s, i) => {
      if (s.status === 'done' || s.touched) return s;
      const fresh = makeStep(data, s.exercise, nthOfExercise(list, i), undefined, extra);
      return { ...fresh, id: s.id };
    });

  const onPick = (ex: Exercise, count: number, isNew: boolean) => {
    const cur = sessionRef.current;
    const extra = isNew ? [...cur.newExercises, ex] : cur.newExercises;
    let list = cur.steps;
    if (picker?.mode === 'add') {
      list = [...list, ...Array.from({ length: count }, () => makeStep(data, ex.name, 1, undefined, extra))];
    } else if (picker?.mode === 'replace') {
      const target = list.find((s) => s.id === picker.stepId);
      if (target) {
        const from = list.indexOf(target);
        list = list.map((s, i) =>
          i >= from && s.status === 'todo' && s.exercise === target.exercise ? { ...s, exercise: ex.name, touched: false } : s,
        );
      }
    }
    onChange({ ...cur, newExercises: extra, steps: rebuildFrom(list, extra) });
    setPicker(null);
  };

  const menuStep = steps.find((s) => s.id === menuFor);
  const editStep = steps.find((s) => s.id === editing);
  const elapsed = (now - session.startedAt) / 1000;
  const visibleDone = showAllDone ? done : done.slice(-2);
  const hiddenCount = done.length - visibleDone.length;

  if (camera) return <CameraView title={active ? `${active.exercise} · série ${nthOfExercise(steps, steps.indexOf(active))}` : ''} onClose={() => setCamera(false)} />;

  return (
    <div class="screen">
      <header class="session-head">
        <div>
          <span class="date">{new Date(session.startedAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>{session.name}</h1>
        </div>
        <span class="chrono">
          <Timer />
          {clock(elapsed)}
        </span>
      </header>

      <main class="timeline">
        {done.length > 2 && (
          <button type="button" class="collapsed" onClick={() => setShowAllDone(!showAllDone)}>
            <span class="ok"><Check /></span>
            <span class="grow">{showAllDone ? 'Masquer les séries faites' : hiddenCount > 1 ? `${hiddenCount} séries faites` : '1 série faite'}</span>
            <Chevron up={showAllDone} />
          </button>
        )}

        {visibleDone.map((s, i) => {
          const isLastDone = s.id === lastDone?.id;
          return (
            <div key={s.id}>
              <button type="button" class="done-row" onClick={() => setEditing(s.id)}>
                <span class="ok"><Check /></span>
                <span class="grow">{s.exercise}</span>
                <span class="val">{formatSet(s, s.unit)}</span>
              </button>
              {!isLastDone && i < visibleDone.length && s.restSec && !s.restSkipped && (
                <div class="rest-line"><Timer size={14} /> Repos {clock(s.restSec)}</div>
              )}
              {isLastDone && !resting && active && s.restSec && !s.restSkipped && (
                <div class="rest-line"><Timer size={14} /> Repos {clock(s.restSec)}</div>
              )}
            </div>
          );
        })}

        {resting && lastDone && (
          <section class="rest" role="timer" aria-label="Repos en cours">
            <div class="grow">
              <span class="rest-label">Repos</span>
              <span class="rest-time">{clock(restLeft)}</span>
            </div>
            <button type="button" class="rest-btn" onClick={() => adjustRest(-15)}>−15</button>
            <button type="button" class="rest-btn" onClick={() => adjustRest(15)}>+15</button>
            <button type="button" class="rest-btn solid" onClick={() => patchStep(lastDone.id, { restSkipped: true })}>Passer</button>
            <div class="rest-bar" style={{ width: `${Math.min(100, (1 - restLeft / (lastDone.restSec ?? 1)) * 100)}%` }} />
          </section>
        )}

        {active && (
          <StepCard
            key={active.id}
            step={active}
            nth={nthOfExercise(steps, steps.indexOf(active))}
            actionLabel="Valider"
            onChange={(p) => patchStep(active.id, p)}
            onAction={validate}
            onMenu={() => setMenuFor(active.id)}
            onCamera={() => setCamera(true)}
          />
        )}

        <div ref={upcomingRef} class="upcoming">
          {upcoming.map((s) => {
            const idx = steps.indexOf(s);
            return (
              <div class="up-row" key={s.id}>
                <span class="handle" aria-label="Déplacer"><Handle /></span>
                <div class="grow">
                  <span class="up-name">{s.exercise}</span>
                  <span class="up-sub">Série {nthOfExercise(steps, idx)} · {formatSet(s.last, s.unit)}</span>
                </div>
                <button type="button" class="icon-btn" aria-label={`Options de ${s.exercise}`} onClick={() => setMenuFor(s.id)}>
                  <More size={20} />
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" class="ghost" onClick={() => setPicker({ mode: 'add' })}>
          <Plus /> Ajouter un exo
        </button>
        <button type="button" class="finish" onClick={() => setFinishing(true)}>Terminer la séance</button>
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
        <Sheet title="Terminer la séance" onClose={() => setFinishing(false)}>
          <p class="hint">
            {done.length} séries faites en {clock(elapsed)}.{todo.length ? ` ${todo.length} séries non faites seront ignorées.` : ''}
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
