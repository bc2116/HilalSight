import type { MapResult, Marker } from '../types'
import {
  categoryFromQ,
  categoryRank,
  idxToLatLon,
  sampleBilinear,
  thresholdQ,
  wrapLon,
  type VisibilityThreshold,
} from './grid'

function isVisibleByThreshold(category: string, threshold: VisibilityThreshold): boolean {
  const r = categoryRank(category)
  if (r >= 99) return false
  return r <= categoryRank(threshold)
}

export function computeFirstVisibilityMarker(
  map: MapResult,
  threshold: VisibilityThreshold,
): Marker | null {
  const qThreshold = thresholdQ(threshold)

  // Prefer q-based search so markers are consistent with Yallop boundaries and
  // less sensitive to coarse grid cells.
  if (Array.isArray(map.qValues) && map.qValues.length === map.categories.length) {
    let bestIdx = -1
    let bestAge = Number.POSITIVE_INFINITY

    for (let i = 0; i < map.categories.length; i++) {
      const age = map.ageHours[i]
      const q = map.qValues[i]
      if (age == null || q == null) continue
      if (!isFinite(age) || !isFinite(q)) continue
      if (!(q > qThreshold)) continue
      if (age < bestAge) {
        bestAge = age
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      let { lat: bestLat, lon: bestLon } = idxToLatLon(map, bestIdx)
      let refinedAge = bestAge
      let refinedQ = map.qValues[bestIdx] ?? null

      const baseStep = Math.max(map.resolution / 2, 0.125)
      const offsets = [-2, -1, 0, 1, 2]
      for (let round = 0; round < 3; round++) {
        const step = baseStep / 2 ** round
        for (const dLat of offsets) {
          for (const dLon of offsets) {
            const lat = Math.max(-89.9, Math.min(89.9, bestLat + dLat * step))
            const lon = wrapLon(bestLon + dLon * step)
            const age = sampleBilinear(map, map.ageHours, lat, lon)
            const q = sampleBilinear(map, map.qValues, lat, lon)
            if (age == null || q == null) continue
            if (!(q > qThreshold)) continue
            if (age < refinedAge) {
              refinedAge = age
              refinedQ = q
              bestLat = lat
              bestLon = lon
            }
          }
        }
      }

      return {
        lat: bestLat,
        lon: bestLon,
        age_hours: refinedAge,
        category: refinedQ == null ? map.categories[bestIdx] : categoryFromQ(refinedQ),
      }
    }
  }

  // Fallback to category-based on-grid marker when q values are unavailable.
  let bestIdx = -1
  let bestAge = Number.POSITIVE_INFINITY

  for (let i = 0; i < map.categories.length; i++) {
    const cat = map.categories[i]
    const age = map.ageHours[i]
    if (age == null) continue
    if (!isFinite(age)) continue
    if (!isVisibleByThreshold(cat, threshold)) continue
    if (age < bestAge) {
      bestAge = age
      bestIdx = i
    }
  }

  if (bestIdx < 0) return null
  const { lat, lon } = idxToLatLon(map, bestIdx)
  return { lat, lon, age_hours: bestAge, category: map.categories[bestIdx] }
}
