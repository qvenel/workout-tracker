import type { Data } from '../lib/data';
import { fr, longDate } from '../lib/format';
import type { PendingSession } from '../lib/session';
import { unitOf } from '../lib/session';
import { Gear } from './Icons';

interface Props {
  data: Data | null;
  loading: boolean;
  error: string;
  suggested: string | null;
  selected: string | null;
  pending: PendingSession[];
  syncing: boolean;
  savedMsg: string;
  onSelect: (name: string) => void;
  onStart: (name: string) => void;
  onRetry: () => void;
  onRefresh: () => void;
  onSettings: () => void;
}

export function Home(p: Props) {
  const names = p.data ? Object.keys(p.data.templates) : [];
  const current = p.selected ?? p.suggested ?? names[0] ?? null;
  const exercises = current && p.data ? [...new Set(p.data.templates[current]?.map((s) => s.exercise) ?? [])] : [];

  return (
    <div class="screen">
      <header class="home-head">
        <div>
          <span class="date">{longDate()}</span>
          <h1>{current ?? 'Séance'}</h1>
        </div>
        <button type="button" class="icon-btn" aria-label="Réglages" onClick={p.onSettings}>
          <Gear />
        </button>
      </header>

      <main class="home">
        {p.savedMsg && <div class="banner ok">{p.savedMsg}</div>}
        {p.pending.length > 0 && (
          <div class="banner warn">
            <span class="grow">
              {p.pending.length} séance{p.pending.length > 1 ? 's' : ''} pas encore envoyée{p.pending.length > 1 ? 's' : ''}
              {p.pending[0].error ? ` · ${p.pending[0].error}` : ''}
            </span>
            <button type="button" class="banner-btn" disabled={p.syncing} onClick={p.onRetry}>
              {p.syncing ? 'Envoi…' : 'Réessayer'}
            </button>
          </div>
        )}
        {p.error && (
          <div class="banner warn">
            <span class="grow">{p.error}</span>
            <button type="button" class="banner-btn" onClick={p.onRefresh}>Réessayer</button>
          </div>
        )}
        {!p.data && p.loading && <p class="hint">Chargement de l'historique…</p>}

        {p.data && current && (
          <div class="list-card swap" key={current}>
            {exercises.map((ex) => (
              <div class="list-row" key={ex}>
                <span class="list-name">{ex}</span>
                <span class="list-sub">
                  {summary(p.data!, ex)}
                </span>
              </div>
            ))}
          </div>
        )}

        {p.data && (
          <div class="chips">
            {names.map((n) => (
              <button type="button" key={n} class={`chip ${n === current ? 'on' : ''}`} onClick={() => p.onSelect(n)}>
                {n}
              </button>
            ))}
            <button type="button" class="chip" onClick={() => p.onStart('Free session')}>
              Séance libre
            </button>
          </div>
        )}
      </main>

      <footer class="foot">
        <button type="button" class="primary big" disabled={!p.data || !current} onClick={() => current && p.onStart(current)}>
          Commencer
        </button>
      </footer>
    </div>
  );
}

/** "8 · 7 · 7 · 6 s × 35 kg" from the last time an exercise was done. */
function summary(data: Data, ex: string): string {
  const sets = data.lastByExercise[ex] ?? [];
  if (!sets.length) return 'Jamais fait';
  const secs = unitOf(data, ex) === 'seconds';
  let s = sets.map((x) => (x.value == null ? '–' : fr(x.value))).join(' · ') + (secs ? ' s' : '');
  const w = [...new Set(sets.map((x) => x.weight).filter((x): x is number => x != null))];
  if (w.length) s += ` × ${w.map(fr).join('/')} kg`;
  return s;
}
