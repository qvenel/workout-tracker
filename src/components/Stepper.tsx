import { useEffect, useState } from 'preact/hooks';
import { fr } from '../lib/format';

interface Props {
  label: string;
  value: number | null;
  step: number;
  suffix?: string;
  size: 'big' | 'small';
  muted?: boolean;
  onChange: (v: number | null) => void;
}

const parse = (s: string): number | null => {
  const t = s.replace(',', '.').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Number with − / + buttons; the number itself is editable by tapping it. */
export function Stepper({ label, value, step, suffix, size, muted, onChange }: Props) {
  const [text, setText] = useState(value == null ? '' : fr(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value == null ? '' : fr(value));
  }, [value, editing]);

  const bump = (dir: 1 | -1) => onChange(Math.max(0, round((value ?? 0) + dir * step)));
  const input = (
    <input
      class={`num ${muted && !value ? 'muted' : ''}`}
      inputMode="decimal"
      aria-label={label}
      value={text}
      placeholder={muted ? '0' : '–'}
      onFocus={(e) => {
        setEditing(true);
        (e.currentTarget as HTMLInputElement).select();
      }}
      onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => {
        setEditing(false);
        onChange(parse(text));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );

  if (size === 'big') {
    return (
      <div class="tile">
        <span class="tile-label">{label}</span>
        <div class="tile-value">
          {input}
          {suffix && <span class="suffix">{suffix}</span>}
        </div>
        <div class="tile-buttons">
          <button type="button" class="pm" aria-label={`${label} moins`} onClick={() => bump(-1)}>−</button>
          <button type="button" class="pm" aria-label={`${label} plus`} onClick={() => bump(1)}>+</button>
        </div>
      </div>
    );
  }
  return (
    <div class="mini">
      <span class="mini-label">{label}</span>
      <div class="mini-ctrl">
        <button type="button" class="pm small" aria-label={`${label} moins`} onClick={() => bump(-1)}>−</button>
        {input}
        <button type="button" class="pm small" aria-label={`${label} plus`} onClick={() => bump(1)}>+</button>
      </div>
    </div>
  );
}
