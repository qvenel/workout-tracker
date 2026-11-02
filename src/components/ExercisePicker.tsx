import { useMemo, useState } from 'preact/hooks';
import type { Data, Exercise, Unit } from '../lib/data';
import { Plus, Search } from './Icons';
import { Sheet } from './Sheet';

interface Props {
  data: Data;
  extra: Exercise[];
  title: string;
  withCount?: boolean;
  onPick: (exercise: Exercise, count: number, isNew: boolean) => void;
  onClose: () => void;
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ExercisePicker({ data, extra, title, withCount, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [count, setCount] = useState(3);
  const [creating, setCreating] = useState<string | null>(null);

  const all = useMemo(() => {
    const list = [...data.exercises, ...extra];
    const recent = (e: Exercise) => data.lastDateByExercise[e.name] ?? '';
    return list.sort((a, b) => recent(b).localeCompare(recent(a)) || a.name.localeCompare(b.name));
  }, [data, extra]);

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return all.filter((e) => words.every((w) => norm(e.name).includes(w))).slice(0, 30);
  }, [all, q]);

  const exact = all.some((e) => norm(e.name) === norm(q.trim()));

  if (creating) {
    const make = (unit: Unit) => onPick({ name: creating, unit }, withCount ? count : 1, true);
    return (
      <Sheet title={`Créer « ${creating} »`} onClose={onClose}>
        <p class="hint">Cet exo se mesure en…</p>
        <div class="row-2">
          <button type="button" class="secondary" onClick={() => make('reps')}>Reps</button>
          <button type="button" class="secondary" onClick={() => make('seconds')}>Secondes</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <label class="search">
        <Search />
        <input
          type="text"
          placeholder="Rechercher un exo"
          aria-label="Rechercher un exo"
          value={q}
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      {withCount && (
        <div class="count-row">
          <span>Séries</span>
          <div class="mini-ctrl">
            <button type="button" class="pm small" aria-label="Une série de moins" onClick={() => setCount(Math.max(1, count - 1))}>−</button>
            <span class="count">{count}</span>
            <button type="button" class="pm small" aria-label="Une série de plus" onClick={() => setCount(count + 1)}>+</button>
          </div>
        </div>
      )}
      <div class="results">
        {q.trim() && !exact && (
          <button type="button" class="result create" onClick={() => setCreating(q.trim())}>
            <Plus /> Créer « {q.trim()} »
          </button>
        )}
        {results.map((e) => (
          <button type="button" class="result" key={e.name} onClick={() => onPick(e, withCount ? count : 1, false)}>
            {e.name}
            {e.unit === 'seconds' && <span class="tag">s</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
