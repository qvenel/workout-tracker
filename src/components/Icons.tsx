const base = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2.2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
} as const;

export const Check = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width={2.6}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Chevron = ({ up = false, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d={up ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} /></svg>
);
export const Back = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="m15 18-6-6 6-6" /></svg>
);
export const More = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
);
export const Camera = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width={2}>
    <rect x="2" y="6" width="14" height="12" rx="2.5" /><path d="m16 10 6-3.5v11L16 14" />
  </svg>
);
export const Handle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
);
export const Plus = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);
export const Timer = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M10 2h4" /></svg>
);
export const Gear = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width={2}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);
export const Close = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
export const Search = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
