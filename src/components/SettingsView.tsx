import { useState } from 'preact/hooks';
import type { Settings } from '../lib/source';
import { Back } from './Icons';

interface Props {
  settings: Settings;
  canGoBack: boolean;
  onSave: (s: Settings) => void;
  onBack: () => void;
}

export function SettingsView({ settings, canGoBack, onSave, onBack }: Props) {
  const [s, setS] = useState(settings);
  const field = (k: keyof Settings) => (e: Event) => setS({ ...s, [k]: (e.currentTarget as HTMLInputElement).value.trim() });

  return (
    <div class="screen">
      <header class="plain-head">
        {canGoBack && (
          <button type="button" class="icon-btn" aria-label="Retour" onClick={onBack}>
            <Back />
          </button>
        )}
        <h1>Réglages</h1>
      </header>
      <main class="form">
        <p class="hint">
          L'appli lit et enregistre tes séances dans un repo GitHub privé. Colle un jeton « fine-grained » limité à ce repo,
          avec la permission <strong>Contents : Read and write</strong>. Il reste stocké uniquement sur ce téléphone.
        </p>
        <label class="field">
          Jeton GitHub
          <input type="password" autoComplete="off" value={s.token} onInput={field('token')} placeholder="github_pat_…" />
        </label>
        <label class="field">
          Repo des données
          <input type="text" autoCapitalize="off" value={s.repo} onInput={field('repo')} />
        </label>
        <label class="field">
          Branche
          <input type="text" autoCapitalize="off" value={s.branch} onInput={field('branch')} />
        </label>
        {import.meta.env.DEV && (
          <label class="check">
            <input type="checkbox" checked={!!s.local} onChange={(e) => setS({ ...s, local: (e.currentTarget as HTMLInputElement).checked })} />
            Données locales (dev)
          </label>
        )}
      </main>
      <footer class="foot">
        <button type="button" class="primary big" disabled={!s.local && (!s.token || !s.repo)} onClick={() => onSave(s)}>
          Enregistrer
        </button>
      </footer>
    </div>
  );
}
