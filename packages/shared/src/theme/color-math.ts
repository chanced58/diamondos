/** Pure color helpers: hex parsing, mixing, and WCAG contrast. */

export type Rgb = [number, number, number];

const HEX_6 = /^#([0-9a-fA-F]{6})$/;
const HEX_3 = /^#([0-9a-fA-F]{3})$/;

/** Parse `#rgb` or `#rrggbb` into [r, g, b]. Throws on anything else. */
export function hexToRgb(hex: string): Rgb {
  let digits: string | undefined;
  const m6 = typeof hex === 'string' ? HEX_6.exec(hex) : null;
  if (m6) {
    digits = m6[1];
  } else {
    const m3 = typeof hex === 'string' ? HEX_3.exec(hex) : null;
    if (m3) digits = m3[1].split('').map((c) => c + c).join('');
  }
  if (!digits) throw new Error(`Invalid hex color: ${String(hex)}`);
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

/** `"R G B"` space-separated channels, for `rgb(var(--x) / alpha)`. */
export function rgbChannels(hex: string): string {
  return hexToRgb(hex).join(' ');
}

function toHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Linear sRGB-channel mix: `weight` of `top` over `1 - weight` of `base`.
 * Returns lowercase `#rrggbb`.
 */
export function mixHex(top: string, base: string, weight: number): string {
  const t = hexToRgb(top);
  const b = hexToRgb(base);
  const mixed = t.map((c, i) => {
    const v = Math.round(c * weight + b[i] * (1 - weight));
    return Math.min(255, Math.max(0, v));
  }) as Rgb;
  return toHex(mixed);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two colors (symmetric, 1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
