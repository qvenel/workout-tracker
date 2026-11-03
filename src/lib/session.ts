import type { Data, Exercise, SetValues, TemplateStep, Unit } from './data';
import { load, save } from './storage';

export interface Step extends SetValues {
  id: string;
  exercise: string;
  unit: Unit;
  /** fields shown in the card besides value and bad form */
  fields: { weight: boolean; rings: boolean; bands: boolean };
  /** what was done last time for this set, for display */
  last: SetValues | null;
  /** values the set was prefilled with, to tell what the user changed */
  planned?: Pick<SetValues, 'weight' | 'rings' | 'bands'> & { fields: Step['fields'] };
  status: 'todo' | 'done';
  touched: boolean;
  doneAt?: number;
  /** rest following this set */
  restSec?: number;
  restSkipped?: boolean;
  restAlerted?: boolean;
  /** smallest "time left" mark (multiple of 30 s) already announced */
  restBeepedAt?: number;
}

export interface ActiveSession {
  name: string;
  startedAt: number;
  steps: Step[];
  newExercises: Exercise[];
}

export interface PendingSession {
  name: string;
  date: string;
  durationMin: number;
  comment: string;
  sets: (SetValues & { exercise: string })[];
  newExercises: Exercise[];
  error?: string;
}

const KEY = 'session:active';
const PENDING = 'session:pending';
export const DEFAULT_REST = 120;

export const loadActive = () => load<ActiveSession | null>(KEY, null);
export const saveActive = (s: ActiveSession | null) => save(KEY, s);
export const loadPending = () => load<PendingSession[]>(PENDING, []);
export const savePending = (p: PendingSession[]) => save(PENDING, p.length ? p : null);

/** Every rest starts at the default; −15 / +15 only change the rest in progress. */
export const restFor = () => DEFAULT_REST;

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function unitOf(data: Data, exercise: string, extra: Exercise[] = []): Unit {
  return (extra.find((e) => e.name === exercise) ?? data.exercises.find((e) => e.name === exercise))?.unit ?? 'reps';
}

/** Build a step for the n-th (1-based) set of `exercise` in the session, prefilled from history. */
export function makeStep(data: Data, exercise: string, nth: number, tpl?: TemplateStep, extra: Exercise[] = []): Step {
  const hist = data.lastByExercise[exercise] ?? [];
  const last = hist[nth - 1] ?? hist[hist.length - 1] ?? null;
  const weight = last?.weight ?? tpl?.weight_kg ?? null;
  const rings = last?.rings ?? tpl?.rings_level ?? null;
  const bands = last?.bands ?? null;
  const fields = { weight: weight != null, rings: rings != null, bands: bands != null };
  return {
    id: newId(),
    exercise,
    unit: unitOf(data, exercise, extra),
    value: last?.value ?? null,
    weight,
    rings,
    bands,
    badForm: null,
    fields,
    planned: { weight, rings, bands, fields },
    last: last && { value: last.value, weight: last.weight, rings: last.rings, bands: last.bands, badForm: last.badForm },
    status: 'todo',
    touched: false,
  };
}

export function sessionFromTemplate(data: Data, name: string): ActiveSession {
  const tpl = data.templates[name] ?? [];
  const seen: Record<string, number> = {};
  const steps = tpl.map((t) => {
    seen[t.exercise] = (seen[t.exercise] ?? 0) + 1;
    return makeStep(data, t.exercise, seen[t.exercise], t);
  });
  return { name, startedAt: Date.now(), steps, newExercises: [] };
}

/** Next template in the cycle after the most recent session. */
export function suggestedTemplate(data: Data): string | null {
  const names = Object.keys(data.templates);
  if (!names.length) return null;
  for (let i = data.sessions.length - 1; i >= 0; i--) {
    const idx = names.indexOf(data.sessions[i].name);
    if (idx >= 0) return names[(idx + 1) % names.length];
  }
  return names[0];
}

export function nthOfExercise(steps: Step[], index: number): number {
  const ex = steps[index].exercise;
  return steps.slice(0, index + 1).filter((s) => s.exercise === ex).length;
}

/**
 * After validating a set, carry what the user *changed* (weight, rings, band) to the following untouched
 * sets of the same exercise that were planned with the same value. Back-off sets planned lighter keep
 * their own weight: 15 kg → 17.5 kg on set 1 moves the other 15 kg sets, not the 10 kg ones.
 */
export function propagate(steps: Step[], from: Step): Step[] {
  const plan = from.planned;
  if (!plan) return steps;
  const keys = (['weight', 'rings', 'bands'] as const).filter(
    (k) => from[k] !== plan[k] || from.fields[k] !== plan.fields[k],
  );
  if (!keys.length) return steps;
  return steps.map((s) => {
    if (s.status !== 'todo' || s.touched || s.exercise !== from.exercise || s.id === from.id) return s;
    const next = { ...s, fields: { ...s.fields } };
    for (const k of keys) {
      const same = s[k] === plan[k] && s.fields[k] === plan.fields[k];
      if (!same) continue;
      next[k] = from[k];
      next.fields[k] = from.fields[k];
    }
    return next;
  });
}

export type RestSignal = { kind: 'end' } | { kind: 'mark'; mark: number } | null;

/**
 * What to play now during a rest: a short beep each time 30 s, 1:00, 1:30… are left
 * (never at the very start), the end alert when time is up.
 */
export function restSignal(restSec: number, left: number, beepedAt: number | undefined): RestSignal {
  if (left <= 0) return { kind: 'end' };
  const mark = Math.ceil(left / 30) * 30;
  if (mark < restSec && (beepedAt == null || mark < beepedAt)) return { kind: 'mark', mark };
  return null;
}

export function toPending(s: ActiveSession, comment: string, now = Date.now()): PendingSession {
  const d = new Date(s.startedAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    name: s.name,
    date,
    durationMin: Math.max(1, Math.round((now - s.startedAt) / 60000)),
    comment,
    sets: s.steps
      .filter((x) => x.status === 'done')
      .map((x) => ({
        exercise: x.exercise,
        value: x.value,
        weight: x.fields.weight ? x.weight : null,
        rings: x.fields.rings ? x.rings : null,
        bands: x.fields.bands ? x.bands : null,
        badForm: x.badForm || null,
      })),
    newExercises: s.newExercises,
  };
}
