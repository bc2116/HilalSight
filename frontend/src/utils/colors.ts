export type CategoryCode =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'MOON_SET_BEFORE_SUN'
  | 'PRIOR_CONJUNCTION'
  | 'NO_SUNSET'
  | 'NO_MOONSET'

export const CATEGORY_LABELS: Record<string, string> = {
  A: 'Easily visible to the naked eye',
  B: 'Visible to the naked eye under perfect conditions',
  C: 'May need optical aid to find the crescent moon initially',
  D: 'Will need optical aid to find the crescent moon',
  E: 'Not visible with a conventional telescope',
  F: 'Not visible – below the Danjon limit',
  MOON_SET_BEFORE_SUN: 'Moon sets before the Sun',
  PRIOR_CONJUNCTION: 'Moon prior to conjunction',
  NO_SUNSET: 'No sunset (polar day)',
  NO_MOONSET: 'No moonset (circumpolar)',
}

/** Compact labels for tight spaces (legend overlay, hover readout). */
export const CATEGORY_LABELS_SHORT: Record<string, string> = {
  A: 'Naked eye, easily',
  B: 'Naked eye, perfect conditions',
  C: 'Optical aid first, then naked eye',
  D: 'Optical aid needed',
  E: 'Not visible (telescope)',
  F: 'Not visible (Danjon limit)',
  MOON_SET_BEFORE_SUN: 'Moon sets before Sun',
  PRIOR_CONJUNCTION: 'Before conjunction',
  NO_SUNSET: 'No sunset (polar)',
  NO_MOONSET: 'No moonset (polar)',
}

/** Two-letter badges for the special (non q-test) classifications. */
export const CATEGORY_CODES_SHORT: Record<string, string> = {
  MOON_SET_BEFORE_SUN: 'MS',
  PRIOR_CONJUNCTION: 'PC',
  NO_SUNSET: 'NS',
  NO_MOONSET: 'NM',
}

export function shortCode(code: string): string {
  return CATEGORY_CODES_SHORT[code] ?? code
}

export const CATEGORY_COLORS: Record<string, [number, number, number, number]> = {
  A: [13, 99, 54, 255], // deep green
  B: [63, 173, 79, 255], // green
  C: [235, 206, 73, 255], // yellow
  D: [236, 140, 50, 255], // orange
  E: [212, 76, 69, 255], // red-orange
  F: [145, 27, 44, 255], // deep red
  MOON_SET_BEFORE_SUN: [39, 104, 166, 220], // blue
  PRIOR_CONJUNCTION: [160, 160, 160, 220], // gray
  NO_SUNSET: [60, 60, 70, 220], // dark gray
  NO_MOONSET: [60, 60, 70, 220], // dark gray
}

export function cssColor(rgba: [number, number, number, number] | undefined): string {
  if (!rgba) return 'rgba(80, 80, 90, 1)'
  const [r, g, b, a] = rgba
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

export function mix(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  const cl = (x: number) => Math.max(0, Math.min(255, x))
  return [
    cl(a[0] + (b[0] - a[0]) * t),
    cl(a[1] + (b[1] - a[1]) * t),
    cl(a[2] + (b[2] - a[2]) * t),
    cl(a[3] + (b[3] - a[3]) * t),
  ].map((x) => Math.round(x)) as [number, number, number, number]
}
