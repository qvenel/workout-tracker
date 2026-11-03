import type { ComponentChildren } from 'preact';
import { useBackClose } from '../lib/back';

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ComponentChildren }) {
  useBackClose(onClose);
  return (
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" class="scrim" aria-label="Fermer" onClick={onClose} />
      <div class="sheet">
        <div class="grabber" />
        {title && <h2 class="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
