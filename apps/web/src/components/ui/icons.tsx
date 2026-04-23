import type { JSX, SVGProps } from 'react';

// Ported from design_handoff_diamondos_revamp/prototype/components/shared.jsx `Ico`.
// Thin-stroke, rounded linecap/linejoin, no fills. 24px viewBox.

type IconProps = SVGProps<SVGSVGElement>;

// Defaults applied to every icon. aria-hidden + focusable=false mean screen
// readers ignore the glyph by default — callers that need to announce an icon
// (icon-only buttons etc.) can pass role="img" + aria-label to override.
const ICON_BASE_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const Icon = {
  dash: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M12 2l10 10-10 10L2 12z" />
    </svg>
  ),
  sched: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  ball: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} strokeLinejoin={undefined} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 7c3 2 9 2 13 0M5.5 17c3-2 9-2 13 0" />
    </svg>
  ),
  stats: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M3 20V10M9 20V4M15 20v-8M21 20v-6" />
    </svg>
  ),
  msg: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M4 6h16v10H8l-4 4z" />
    </svg>
  ),
  team: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="8" r="3" />
      <path d="M21 20v-2a4 4 0 0 0-3-3.87M17 4.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  prac: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M6 4h4v16H6zM14 8h4v12h-4z" />
      <path d="M4 12h2M18 14h2" />
    </svg>
  ),
  bell: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  plus: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} width={16} height={16} strokeWidth={2.2} strokeLinejoin={undefined} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} width={16} height={16} strokeLinejoin={undefined} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  ),
  up: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} width={12} height={12} strokeWidth={2.5} {...p}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  ),
  chev: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} width={14} height={14} {...p}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  undo: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} width={14} height={14} {...p}>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7L3 9" />
    </svg>
  ),
  gear: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  admin: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M12 2 4 5v6c0 5.5 3.8 10.7 8 11 4.2-.3 8-5.5 8-11V5l-8-3z" />
    </svg>
  ),
  signout: (p: IconProps = {}): JSX.Element => (
    <svg {...ICON_BASE_PROPS} {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof Icon;
