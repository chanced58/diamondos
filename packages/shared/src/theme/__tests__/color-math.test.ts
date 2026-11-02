import { hexToRgb, rgbChannels, mixHex, contrastRatio } from '../color-math';
import { BASE_COLORS, NEUTRAL_RAMPS, SHADES } from '../palette';

const HEX = /^#[0-9a-f]{6}$/;

describe('hexToRgb', () => {
  it('parses #rrggbb', () => {
    expect(hexToRgb('#1e3a8a')).toEqual([30, 58, 138]);
  });
  it('parses #rgb', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });
  it('throws on invalid input', () => {
    expect(() => hexToRgb('navy')).toThrow();
    expect(() => hexToRgb('#12345')).toThrow();
    expect(() => hexToRgb('')).toThrow();
  });
});

describe('rgbChannels', () => {
  it('returns space-separated channels', () => {
    expect(rgbChannels('#181b22')).toBe('24 27 34');
  });
});

describe('mixHex', () => {
  it('weight 0 returns base', () => {
    expect(mixHex('#ef4444', '#181b22', 0)).toBe('#181b22');
  });
  it('weight 1 returns top', () => {
    expect(mixHex('#ef4444', '#181b22', 1)).toBe('#ef4444');
  });
  it('mixes halfway', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
  });
});

describe('contrastRatio', () => {
  it('white on black is 21', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
  });
  it('white on #2563eb is at least 5.1', () => {
    expect(contrastRatio('#ffffff', '#2563eb')).toBeGreaterThanOrEqual(5.1);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#ffffff', '#2563eb')).toBe(contrastRatio('#2563eb', '#ffffff'));
  });
});

describe('palette data', () => {
  it('BASE_COLORS has every shade as lowercase hex', () => {
    for (const [name, scale] of Object.entries(BASE_COLORS)) {
      for (const shade of SHADES) {
        expect(`${name}-${shade}:${scale[shade]}`).toMatch(new RegExp(`^${name}-${shade}:#[0-9a-f]{6}$`));
      }
    }
  });
  it('NEUTRAL_RAMPS has every shade as lowercase hex', () => {
    for (const ramp of Object.values(NEUTRAL_RAMPS)) {
      expect(ramp.bg.white).toMatch(HEX);
      expect(ramp.black).toMatch(HEX);
      for (const shade of SHADES) {
        expect(ramp.bg[shade]).toMatch(HEX);
        expect(ramp.fg[shade]).toMatch(HEX);
        expect(ramp.line[shade]).toMatch(HEX);
      }
    }
  });
});
