/**
 * The mark: a talking-board planchette whose lens looks into a lit, arched tenement window.
 * Solid shapes only, so it holds up at 16 px. Same geometry as app/icon.svg.
 */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M32 3 C45 15 55 30 53 46 C52 55 45 59 32 59 C19 59 12 55 11 46 C9 30 19 15 32 3 Z" fill="#e3a34a" />
      <circle cx="32" cy="35" r="14" fill="#1d1424" />
      <path d="M26 45 V33 a6 6 0 0 1 12 0 V45 Z" fill="#eee4d3" />
      <path d="M32 27 V45 M26 37.5 H38" stroke="#1d1424" strokeWidth="1.8" />
    </svg>
  );
}
