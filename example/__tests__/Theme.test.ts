import {palettes} from '../../src/theme';

test('text colors stay readable in both themes', () => {
  function luminance(hex: string) {
    const parts = hex.slice(1).match(/../g)!.map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
  }
  function contrast(a: string, b: string) {
    const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (values[1] + 0.05) / (values[0] + 0.05);
  }
  for (const palette of Object.values(palettes)) {
    for (const role of ['ink', 'muted', 'primary', 'error', 'success'] as const) {
      expect(contrast(palette[role], palette.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(palette.onPrimary, palette.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.warningInk, palette.warningSoft)).toBeGreaterThanOrEqual(4.5);
  }
});
