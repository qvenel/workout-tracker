import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Home } from './components/Home';
import { SessionView } from './components/SessionView';
import { SettingsView } from './components/SettingsView';
import { type Data, cachedData, fetchData, saveSession } from './lib/data';
import { keepAwake, unlockAudio } from './lib/device';
import {
  type ActiveSession,
  type PendingSession,
  loadActive,
  loadPending,
  saveActive,
  savePending,
  sessionFromTemplate,
  suggestedTemplate,
  toPending,
} from './lib/session';
import { type Settings, makeSource } from './lib/source';
import { load, save } from './lib/storage';

const DEFAULT_SETTINGS: Settings = { token: '', repo: 'qvenel/workout-data', branch: 'main' };

export function App() {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) }));
  const configured = !!settings.token || !!settings.local;
  const [view, setView] = useState<'home' | 'settings'>(configured ? 'home' : 'settings');
  const [data, setData] = useState<Data | null>(() => cachedData());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<ActiveSession | null>(() => loadActive());
  const [pending, setPending] = useState<PendingSession[]>(() => loadPending());
  const [syncing, setSyncing] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const source = useMemo(() => makeSource(settings), [settings]);

  const refresh = async () => {
    if (!configured) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchData(source));
    } catch (e) {
      const offline = e instanceof TypeError || !navigator.onLine;
      setError(
        offline
          ? data
            ? 'Hors ligne : historique en cache utilisé'
            : 'Hors ligne : impossible de charger l’historique'
          : e instanceof Error
            ? e.message
            : 'Chargement impossible',
      );
    } finally {
      setLoading(false);
    }
  };

  const sync = async (queue: PendingSession[]) => {
    if (!queue.length) return;
    setSyncing(true);
    const left: PendingSession[] = [];
    for (const p of queue) {
      try {
        await saveSession(source, p);
        setSavedMsg(`${p.name} enregistrée dans GitHub`);
      } catch (e) {
        left.push({ ...p, error: e instanceof Error ? e.message : 'Envoi impossible' });
      }
    }
    setPending(left);
    savePending(left);
    setSyncing(false);
    if (left.length < queue.length) void refresh();
  };

  useEffect(() => {
    void refresh();
    if (pending.length) void sync(pending);
  }, [source]);

  useEffect(() => keepAwake(!!active), [!!active]);

  // retry uploads as soon as the network or the app comes back
  const retryRef = useRef(() => {});
  retryRef.current = () => {
    if (pending.length && !syncing && navigator.onLine) void sync(pending);
  };
  useEffect(() => {
    const onWake = () => document.visibilityState === 'visible' && retryRef.current();
    const onOnline = () => retryRef.current();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);

  const updateActive = (s: ActiveSession | null) => {
    setActive(s);
    saveActive(s);
  };

  if (view === 'settings') {
    return (
      <SettingsView
        settings={settings}
        canGoBack={configured}
        onBack={() => setView('home')}
        onSave={(s) => {
          setSettings(s);
          save('settings', s);
          setView('home');
        }}
      />
    );
  }

  if (active && data) {
    return (
      <SessionView
        data={data}
        session={active}
        onChange={updateActive}
        onDiscard={() => updateActive(null)}
        onFinish={(comment) => {
          const p = toPending(active, comment);
          const queue = [...pending, p];
          setPending(queue);
          savePending(queue);
          updateActive(null);
          setSelected(null);
          setSavedMsg('');
          void sync(queue);
        }}
      />
    );
  }

  return (
    <Home
      data={data}
      loading={loading}
      error={error}
      suggested={data ? suggestedTemplate(data) : null}
      selected={selected}
      pending={pending}
      syncing={syncing}
      savedMsg={savedMsg}
      onSelect={setSelected}
      onRetry={() => void sync(pending)}
      onRefresh={() => void refresh()}
      onSettings={() => setView('settings')}
      onStart={(name) => {
        if (!data) return;
        unlockAudio();
        setSavedMsg('');
        updateActive(sessionFromTemplate(data, name));
      }}
    />
  );
}
