/**
 * Deterministic, collision-free Flexoki color assignment.
 * Uses the Flexoki Extended palette (300–600) for vivid, high-brightness cards.
 * Scales to 32 companies with unique colors; beyond that, wraps gracefully.
 * https://github.com/kepano/flexoki
 *
 * Strategy: hash each slug to a preferred HUE (0–7), then pick the first
 * available shade for that hue. This guarantees maximum hue diversity —
 * companies only share a hue family when more than 4 want the same one.
 */

/** 8 hues × 4 shades, indexed as HUES[hue][shade]. */
const HUES = [
  ['#D14D41', '#E8705F', '#AF3029', '#C03E35'], // red:     400, 300, 600, 500
  ['#DA702C', '#EC8B49', '#BC5215', '#CB6120'], // orange:  400, 300, 600, 500
  ['#D0A215', '#DFB431', '#AD8301', '#BE9207'], // yellow:  400, 300, 600, 500
  ['#879A39', '#A0AF54', '#66800B', '#768D21'], // green:   400, 300, 600, 500
  ['#3AA99F', '#5ABDAC', '#24837B', '#2F968D'], // cyan:    400, 300, 600, 500
  ['#4385BE', '#66A0C8', '#205EA6', '#3171B2'], // blue:    400, 300, 600, 500
  ['#8B7EC8', '#A699D0', '#5E409D', '#735EB5'], // purple:  400, 300, 600, 500
  ['#CE5D97', '#E47DA8', '#A02F6F', '#B74583'], // magenta: 400, 300, 600, 500
];

const HUE_COUNT = HUES.length;        // 8
const SHADE_COUNT = HUES[0].length;   // 4
const TOTAL = HUE_COUNT * SHADE_COUNT; // 32

/** Relative luminance (WCAG 2.x) for an sRGB hex color. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Pick the best text color for a given card background.
 * - Dark backgrounds  → white
 * - Medium backgrounds → warm off-white (softer than pure white)
 * - Light backgrounds  → Flexoki black
 */
function textColor(bg: string): string {
  const L = luminance(bg);
  if (L > 0.36) return '#1C1B1A'; // light bg → dark text
  if (L > 0.12) return '#FFFCF0'; // medium bg → warm off-white
  return '#FFFFFF';                // dark bg → pure white
}

/** Simple deterministic hash for a string. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Build a slug → color map for all companies.
 *
 * 1. Hash each slug to a preferred hue (0–7).
 * 2. Try the first unused shade of that hue.
 * 3. If all 4 shades are taken, rotate to the next hue and repeat.
 *
 * This keeps the first 8 companies on 8 distinct hues, and gracefully
 * expands into shade variants as the count grows.
 */
export function buildColorMap(
  slugs: string[],
): Record<string, { bg: string; text: string }> {
  const sorted = [...slugs].sort();
  const used = new Set<string>(); // "hue,shade"
  const result: Record<string, { bg: string; text: string }> = {};

  for (const slug of sorted) {
    const preferredHue = hash(slug) % HUE_COUNT;
    let assigned = false;

    // Outer loop: shade. Inner loop: hue offset.
    // This tries ALL hues at shade 0 before any hue at shade 1,
    // guaranteeing maximum hue diversity for the first 8 companies.
    for (let shade = 0; shade < SHADE_COUNT && !assigned; shade++) {
      for (let hueOffset = 0; hueOffset < HUE_COUNT && !assigned; hueOffset++) {
        const hue = (preferredHue + hueOffset) % HUE_COUNT;
        const key = `${hue},${shade}`;
        if (!used.has(key)) {
          used.add(key);
          const bg = HUES[hue][shade];
          result[slug] = { bg, text: textColor(bg) };
          assigned = true;
        }
      }
    }

    // Fallback: all 32 slots taken — hash to any slot
    if (!assigned) {
      const hue = hash(slug) % HUE_COUNT;
      const shade = Math.floor(hash(slug) / HUE_COUNT) % SHADE_COUNT;
      const bg = HUES[hue][shade];
      result[slug] = { bg, text: textColor(bg) };
    }
  }

  return result;
}
