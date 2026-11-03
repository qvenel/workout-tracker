import { useEffect, useRef } from 'preact/hooks';

/**
 * Android back button / gesture: closes the top-most overlay (sheet, camera) instead of leaving
 * the app, and never leaves the app in the middle of a session.
 */

const stack: (() => void)[] = [];
let ignorePops = 0;
let guarded = false;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    const top = stack.pop();
    if (top) top();
    else if (guarded) history.pushState({ guard: true }, '');
  });
}

/** While mounted, the back button calls `onBack` (overlays). */
export function useBackClose(onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    let closedByBack = false;
    const handler = () => {
      closedByBack = true;
      ref.current();
    };
    stack.push(handler);
    history.pushState({ overlay: stack.length }, '');
    return () => {
      const i = stack.indexOf(handler);
      if (i >= 0) stack.splice(i, 1);
      if (!closedByBack) {
        // closed from the UI: drop the history entry we added, silently
        ignorePops++;
        history.back();
      }
    };
  }, []);
}

/** While mounted, a back press with no overlay open does nothing (stays in the session). */
export function useBackGuard() {
  useEffect(() => {
    guarded = true;
    history.pushState({ guard: true }, '');
    return () => {
      guarded = false;
    };
  }, []);
}
