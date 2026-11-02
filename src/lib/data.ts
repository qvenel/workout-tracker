import { appendCsv, parseCsv } from './csv';
import type { DataSource } from './source';
import { load, save } from './storage';

export type Unit = 'reps' | 'seconds';

export interface Exercise {
  name: string;
  unit: Unit;
}

export interface SessionRow {
  id: string;
  date: string;
  name: string;
  duration_min: string;
  comment: string;
}

export interface SetValues {
  value: number | null;
  weight: number | null;
  rings: number | null;
  bands: number | null;
  badForm: number | null;
}

export interface LoggedSet extends SetValues {
  sessionId: string;
  exercise: string;
}

export interface TemplateStep {
  exercise: string;
  rings_level?: number;
  weight_kg?: number;
}

export interface Data {
  exercises: Exercise[];
  sessions: SessionRow[]; // sorted by date ascending
  templates: Record<string, TemplateStep[]>;
  /** exercise -> sets of its most recent session (in order) */
  lastByExercise: Record<string, LoggedSet[]>;
  /** exercise -> date of its most recent session */
  lastDateByExercise: Record<string, string>;
}

interface RawFiles {
  sessions: string | null;
  exercises: string | null;
  templates: string | null;
  sets: string[];
}

const CACHE_KEY = 'cache:files';

const num = (s: string | undefined): number | null => {
  if (s == null || s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function build(raw: RawFiles): Data {
  const exercises: Exercise[] = parseCsv(raw.exercises ?? '').map((r) => ({
    name: r.name,
    unit: r.unit === 'seconds' ? 'seconds' : 'reps',
  }));
  // stable sort: sessions on the same day keep their file (= logging) order
  const sessions = (parseCsv(raw.sessions ?? '') as unknown as SessionRow[]).sort((a, b) => a.date.localeCompare(b.date));
  const dateOf = new Map(sessions.map((s) => [s.id, s.date]));
  const lastByExercise: Record<string, LoggedSet[]> = {};
  const lastDateByExercise: Record<string, string> = {};
  const lastSessionByExercise: Record<string, string> = {};
  for (const text of raw.sets) {
    for (const r of parseCsv(text)) {
      const date = dateOf.get(r.session_id) ?? r.session_id.slice(0, 10);
      const ex = r.exercise;
      const prevSession = lastSessionByExercise[ex];
      const prevDate = lastDateByExercise[ex];
      const set: LoggedSet = {
        sessionId: r.session_id,
        exercise: ex,
        value: num(r.value),
        weight: num(r.weight_kg),
        rings: num(r.rings_level),
        bands: num(r.bands),
        badForm: num(r.bad_form),
      };
      if (prevSession === r.session_id) lastByExercise[ex].push(set);
      else if (!prevDate || date >= prevDate) {
        // later rows win on equal dates: files are in logging order
        lastSessionByExercise[ex] = r.session_id;
        lastDateByExercise[ex] = date;
        lastByExercise[ex] = [set];
      }
    }
  }
  let templates: Record<string, TemplateStep[]> = {};
  try {
    templates = JSON.parse(raw.templates ?? '{}');
  } catch {
    /* ignore */
  }
  // exercises seen in logs but missing from the catalogue
  const known = new Set(exercises.map((e) => e.name));
  for (const name of Object.keys(lastByExercise)) if (!known.has(name)) exercises.push({ name, unit: 'reps' });
  return { exercises, sessions, templates, lastByExercise, lastDateByExercise };
}

export function cachedData(): Data | null {
  const raw = load<RawFiles | null>(CACHE_KEY, null);
  return raw ? build(raw) : null;
}

export async function fetchData(src: DataSource): Promise<Data> {
  const year = new Date().getFullYear();
  const [sessions, exercises, templates, setsPrev, setsCur] = await Promise.all([
    src.read('sessions.csv'),
    src.read('exercises.csv'),
    src.read('templates.json'),
    src.read(`sets/${year - 1}.csv`),
    src.read(`sets/${year}.csv`),
  ]);
  if (sessions == null && exercises == null) throw new Error('Repo vide ou fichiers introuvables');
  const raw: RawFiles = { sessions, exercises, templates, sets: [setsPrev, setsCur].filter((s): s is string => !!s) };
  save(CACHE_KEY, raw);
  return build(raw);
}

// ---------- saving a finished session ----------

export interface FinishedSet extends SetValues {
  exercise: string;
}

export interface FinishedSession {
  name: string;
  date: string; // YYYY-MM-DD
  durationMin: number;
  comment: string;
  sets: FinishedSet[];
  newExercises: Exercise[];
}

const fmt = (n: number | null) => (n == null ? '' : String(Math.round(n * 100) / 100));

export function slug(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function saveSession(src: DataSource, s: FinishedSession): Promise<string> {
  let sessionId = '';
  const year = s.date.slice(0, 4);
  const changes = [
    {
      path: 'sessions.csv',
      update: (cur: string | null) => {
        const ids = new Set(parseCsv(cur ?? '').map((r) => r.id));
        const base = `${s.date}-${slug(s.name) || 'session'}`;
        sessionId = base;
        for (let k = 2; ids.has(sessionId); k++) sessionId = `${base}-${k}`;
        return appendCsv(cur, ['id', 'date', 'name', 'duration_min', 'comment'], [
          [sessionId, s.date, s.name, String(s.durationMin), s.comment.trim()],
        ]);
      },
    },
    {
      path: `sets/${year}.csv`,
      update: (cur: string | null) => {
        const count: Record<string, number> = {};
        const rows = s.sets.map((x) => {
          count[x.exercise] = (count[x.exercise] ?? 0) + 1;
          return [sessionId, x.exercise, String(count[x.exercise]), fmt(x.value), fmt(x.rings), fmt(x.weight), fmt(x.bands), fmt(x.badForm), ''];
        });
        return appendCsv(cur, ['session_id', 'exercise', 'set', 'value', 'rings_level', 'weight_kg', 'bands', 'bad_form', 'note'], rows);
      },
    },
  ];
  if (s.newExercises.length) {
    changes.push({
      path: 'exercises.csv',
      update: (cur: string | null) => {
        const known = new Set(parseCsv(cur ?? '').map((r) => r.name));
        return appendCsv(
          cur,
          ['name', 'unit'],
          s.newExercises.filter((e) => !known.has(e.name)).map((e) => [e.name, e.unit]),
        );
      },
    });
  }
  const d = s.date.split('-').reverse().join('/');
  await src.commit(changes, `${s.name} — ${d}`);
  return sessionId;
}
