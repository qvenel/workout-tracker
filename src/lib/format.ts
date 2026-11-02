import type { SetValues, Unit } from './data';

export const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function formatSet(v: SetValues | null, unit: Unit): string {
  if (!v || v.value == null) return '—';
  let s = unit === 'seconds' ? `${fr(v.value)} s` : fr(v.value);
  if (v.weight != null) s += ` × ${fr(v.weight)} kg`;
  if (v.rings != null) s += ` · niv. ${fr(v.rings)}`;
  if (v.bands != null) s += ` · bande ${fr(v.bands)}`;
  if (v.badForm) s += ` (+${fr(v.badForm)})`;
  return s;
}

export function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function longDate(d = new Date()): string {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
