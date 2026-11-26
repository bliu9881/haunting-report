/** Inline ghost glyph. Decorative unless a title is given. */
export function Ghost({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M12 2.5c-4.4 0-7.2 3.2-7.2 7.6v11.4l2.4-1.9 2.4 1.9 2.4-1.9 2.4 1.9 2.4-1.9 2.4 1.9V10.1c0-4.4-2.8-7.6-7.2-7.6z" fill="currentColor" />
      <circle cx="9.3" cy="10.3" r="1.6" fill="var(--bg)" />
      <circle cx="14.7" cy="10.3" r="1.6" fill="var(--bg)" />
      <ellipse cx="12" cy="15" rx="1.5" ry="2" fill="var(--bg)" />
    </svg>
  );
}
