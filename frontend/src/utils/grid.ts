import type { MapResult } from '../types'

export type VisibilityThreshold = 'A' | 'B' | 'C' | 'D'

/** Normalize a longitude to [-180, 180). */
export function wrapLon(lon: number): number {
  let x = lon
  while (x < -180) x += 360
  while (x >= 180) x -= 360
  return x
}

export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat))
}

/** Yallop (1997) q-test category boundaries: q must exceed minQ to earn the code. */
const Q_BOUNDARIES: Array<{ code: string; minQ: number }> = [
  { code: 'A', minQ: 0.216 },
  { code: 'B', minQ: -0.014 },
  { code: 'C', minQ: -0.16 },
  { code: 'D', minQ: -0.232 },
  { code: 'E', minQ: -0.293 },
]

export function categoryFromQ(q: number): string {
  for (const { code, minQ } of Q_BOUNDARIES) {
    if (q > minQ) return code
  }
  return 'F'
}

/** Minimum (exclusive) q for a point to count as visible at the given threshold. */
export function thresholdQ(th: VisibilityThreshold): number {
  const found = Q_BOUNDARIES.find((b) => b.code === th)
  return found ? found.minQ : Number.POSITIVE_INFINITY
}

/** Rank categories best (1) to worst (6); non-categories rank last. */
export function categoryRank(cat: string): number {
  const i = Q_BOUNDARIES.findIndex((b) => b.code === cat)
  if (i >= 0) return i + 1
  return cat === 'F' ? Q_BOUNDARIES.length + 1 : 99
}

/** Index of the grid cell containing (lat, lon), or null when off-grid in latitude. */
export function gridIndex(map: MapResult, lat: number, lon: number): number | null {
  const uRaw = (wrapLon(lon) - map.lon0) / map.resolution
  const u = ((uRaw % map.nLon) + map.nLon) % map.nLon
  const iLon = Math.floor(u)
  const iLat = Math.floor((map.lat0 - lat) / map.resolution)
  if (iLat < 0 || iLat >= map.nLat) return null
  return iLat * map.nLon + iLon
}

export function idxToLatLon(map: MapResult, idx: number): { lat: number; lon: number } {
  const iLat = Math.floor(idx / map.nLon)
  const iLon = idx % map.nLon
  return { lat: map.lat0 - iLat * map.resolution, lon: map.lon0 + iLon * map.resolution }
}

/**
 * Bilinear sample of a flattened grid at (lat, lon), wrapping in longitude and
 * skipping null/non-finite neighbors. Returns null when no neighbor has data.
 */
export function sampleBilinear(
  map: MapResult,
  values: Array<number | null>,
  lat: number,
  lon: number,
): number | null {
  const v = (map.lat0 - lat) / map.resolution
  if (v < 0 || v > map.nLat - 1) return null

  const uRaw = (wrapLon(lon) - map.lon0) / map.resolution
  const u = ((uRaw % map.nLon) + map.nLon) % map.nLon

  const i0 = Math.floor(u)
  const i1 = (i0 + 1) % map.nLon
  const j0 = Math.floor(v)
  const j1 = Math.min(j0 + 1, map.nLat - 1)
  const fx = u - i0
  const fy = v - j0

  const weights = [
    [(1 - fx) * (1 - fy), values[j0 * map.nLon + i0]] as const,
    [fx * (1 - fy), values[j0 * map.nLon + i1]] as const,
    [(1 - fx) * fy, values[j1 * map.nLon + i0]] as const,
    [fx * fy, values[j1 * map.nLon + i1]] as const,
  ]

  let sum = 0
  let wsum = 0
  for (const [w, val] of weights) {
    if (val == null || !isFinite(val)) continue
    sum += w * val
    wsum += w
  }
  if (wsum <= 0) return null
  return sum / wsum
}
