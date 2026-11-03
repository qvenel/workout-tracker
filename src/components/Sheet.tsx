import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useBackClose } from '../lib/back';
import { reducedMotion } from '../lib/motion';

/** Bottom sheet: slides up on open; dismissing (scrim, back) slides it down before closing. */
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ComponentChildren }) {
  const [closing, setClosing] = useState(false);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, reducedMotion() ? 0 : 200);
  };
  useBackClose(dismiss);
  return (
    <div class={`sheet-wrap ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" class="scrim" aria-label="Fermer" onClick={dismiss} />
      <div class="sheet">
        <div class="grabber" />
        {title && <h2 class="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
