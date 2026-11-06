import { type RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * FLIP animations for a list of [data-flip="id"] elements inside `root` (which must be position: relative):
 * - an element that moved slides from its old position,
 * - an id that changed element (upcoming row -> active card -> done row) morphs from where it was,
 * - a new element fades / rises in.
 * Positions use offsetTop, so scrolling and running animations don't count as moves.
 */
export function useFlip(root: RefObject<HTMLElement>, skip?: { current: boolean }, pause?: { current: boolean }) {
  const prev = useRef(new Map<string, { top: number; el: HTMLElement }>());
  const first = useRef(true);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const next = new Map<string, { top: number; el: HTMLElement }>();
    if (pause?.current) return; // a drag is moving the DOM: measure again once it is over
    const animate = !first.current && !skip?.current && !reducedMotion();
    container.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const id = el.dataset.flip!;
      const top = el.offsetTop;
      next.set(id, { top, el });
      if (!animate) return;
      const old = prev.current.get(id);
      if (!old) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 280, easing: EASE },
        );
      } else if (old.el !== el) {
        el.animate(
          [
            { opacity: 0.4, transform: `translateY(${old.top - top}px)` },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 340, easing: EASE },
        );
      } else if (Math.abs(old.top - top) > 1) {
        el.animate([{ transform: `translateY(${old.top - top}px)` }, { transform: 'none' }], { duration: 320, easing: EASE });
      }
    });
    prev.current = next;
    first.current = false;
    if (skip) skip.current = false;
  });
}
