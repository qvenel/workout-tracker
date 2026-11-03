import { useEffect, useRef, useState } from 'preact/hooks';
import { tick } from '../lib/device';
import { fr } from '../lib/format';
import { EASE, reducedMotion } from '../lib/motion';

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
  const ref = useRef<HTMLInputElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (!editing) setText(value == null ? '' : fr(value));
    // the number rolls in from below when it goes up, from above when it goes down
    const before = prev.current;
    prev.current = value;
    if (editing || before === value || reducedMotion() || !ref.current) return;
    const dir = (value ?? 0) > (before ?? 0) ? 1 : -1;
    ref.current.animate(
      [
        { transform: `translateY(${dir * (size === 'big' ? 14 : 8)}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 200, easing: EASE },
    );
  }, [value, editing]);

  const bump = (dir: 1 | -1) => {
    tick();
    onChange(Math.max(0, round((value ?? 0) + dir * step)));
  };
  const input = (
    <input
      ref={ref}
      class={`num ${muted && !value ? 'muted' : ''}`}
      inputMode="decimal"
      aria-label={label}
      value={text}
      placeholder={muted || size === 'small' ? '0' : '–'}
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
