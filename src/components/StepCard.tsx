import type { Step } from '../lib/session';
import { formatSet } from '../lib/format';
import { Camera, More } from './Icons';
import { Stepper } from './Stepper';

interface Props {
  step: Step;
  nth: number;
  actionLabel: string;
  onChange: (patch: Partial<Step>) => void;
  onAction: () => void;
  onMenu?: () => void;
  onCamera?: () => void;
}

export function StepCard({ step, nth, actionLabel, onChange, onAction, onMenu, onCamera }: Props) {
  const set = (patch: Partial<Step>) => onChange({ ...patch, touched: true });
  const secs = step.unit === 'seconds';
  const valueStep = secs ? 0.5 : 1;
  const minis = [
    step.fields.rings && (
      <Stepper key="r" size="small" label="Anneaux" value={step.rings} step={1} onChange={(rings) => set({ rings })} />
    ),
    step.fields.bands && (
      <Stepper key="b" size="small" label="Bande" value={step.bands} step={1} onChange={(bands) => set({ bands })} />
    ),
    <Stepper
      key="bf"
      size="small"
      label="Mauvaise forme"
      value={step.badForm}
      step={valueStep}
      muted
      onChange={(badForm) => set({ badForm })}
    />,
  ].filter(Boolean);

  return (
    <section class="card">
      <div class="card-head">
        <div class="card-title">
          <h2>{step.exercise}</h2>
          <span class="sub">
            Série {nth}
            {step.last ? ` · dernière fois ${formatSet(step.last, step.unit)}` : ''}
          </span>
        </div>
        <div class="card-icons">
          {onCamera && (
            <button type="button" class="icon-btn" aria-label="Filmer la série" onClick={onCamera}>
              <Camera />
            </button>
          )}
          {onMenu && (
            <button type="button" class="icon-btn" aria-label="Options de la série" onClick={onMenu}>
              <More />
            </button>
          )}
        </div>
      </div>

      <div class={`tiles ${step.fields.weight ? 'two' : ''}`}>
        <Stepper
          size="big"
          label={secs ? 'Secondes' : 'Reps'}
          value={step.value}
          step={valueStep}
          suffix={secs ? 's' : undefined}
          onChange={(value) => set({ value })}
        />
        {step.fields.weight && (
          <Stepper size="big" label="Charge" value={step.weight} step={2.5} suffix="kg" onChange={(weight) => set({ weight })} />
        )}
      </div>

      <div class={`minis ${minis.length > 1 ? 'two' : ''}`}>{minis}</div>

      <button type="button" class="primary" onClick={onAction}>
        {actionLabel}
      </button>
    </section>
  );
}
