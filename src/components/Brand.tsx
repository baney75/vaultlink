import type { CSSProperties } from 'react';

export const BRAND_NAME = 'VaultLink';
export const BRAND_TAGLINE = 'Your vault, beside the web.';

/*
 * The mark is fixed identity artwork: its colors do not follow page tokens or
 * vault themes. Geometry is shared with public/brand.svg and scripts/icons.mjs.
 */
const GROUND = '#133A32';
const VAULT = '#F3F0E4';
const WEB = '#7DC9A5';

export interface BrandMarkProps {
  /** Width and height in CSS pixels. Default 32; legible down to 16. */
  size?: number;
  /** Accessible name. Omit when nearby text already says VaultLink; the mark is then hidden from assistive tech. */
  title?: string;
  className?: string;
}

export function BrandMark({ size = 32, title, className }: BrandMarkProps) {
  return <svg
    className={className ? `vl-mark ${className}` : 'vl-mark'}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    <rect width="64" height="64" rx="15" fill={GROUND} />
    <path d="M45 18 32 46" fill="none" stroke={WEB} strokeWidth="9" strokeLinecap="round" />
    <path d="M19 18 32 46" fill="none" stroke={GROUND} strokeWidth="13" strokeLinecap="round" />
    <path d="M19 18 32 46" fill="none" stroke={VAULT} strokeWidth="9" strokeLinecap="round" />
  </svg>;
}

export interface BrandProps {
  /** Mark size in CSS pixels; the wordmark scales with it. Default 32. */
  size?: number;
  /** Optional second line, such as BRAND_TAGLINE or a short context label. */
  tagline?: string;
  className?: string;
}

export function Brand({ size = 32, tagline, className }: BrandProps) {
  return <span className={className ? `vl-brand ${className}` : 'vl-brand'} style={{ '--vl-brand-size': `${size}px` } as CSSProperties}>
    <BrandMark size={size} />
    <span className="vl-brand-text">
      <span className="vl-brand-name">{BRAND_NAME}</span>
      {tagline && <span className="vl-brand-tagline">{tagline}</span>}
    </span>
  </span>;
}
