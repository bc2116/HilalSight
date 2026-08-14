import { useEffect, useState } from 'react'

import { getVisibilityPoint } from '../api'
import type { PointVisibility } from '../types'
import { messageOf } from '../utils/format'

/** Fetches per-evening visibility details for the selected location. */
export function usePointVisibility(
  dateLabel: string,
  evenings: number[],
  point: { lat: number; lon: number } | null,
) {
  const requestIdentity = point && dateLabel
    ? `${dateLabel}|${point.lat}|${point.lon}|${evenings.join(',')}`
    : null
  const [activeRequestIdentity, setActiveRequestIdentity] = useState<string | null>(null)
  const [results, setResults] = useState<Record<number, PointVisibility | undefined>>({})
  const [loading, setLoading] = useState<Record<number, boolean | undefined>>({})
  const [errors, setErrors] = useState<Record<number, string | undefined>>({})

  useEffect(() => {
    if (!point || !dateLabel) {
      setActiveRequestIdentity(null)
      setResults({})
      setLoading({})
      setErrors({})
      return
    }
    const { lat, lon } = point

    // A new location means the old numbers are wrong for it — clear instead of keeping stale data.
    setActiveRequestIdentity(requestIdentity)
    setResults({})
    setErrors({})
    setLoading(() => {
      const next: Record<number, boolean> = {}
      for (const d of evenings) next[d] = true
      return next
    })

    const controller = new AbortController()
    const { signal } = controller

    Promise.all(
      evenings.map(async (d) => {
        try {
          const r = await getVisibilityPoint({ lat, lon, date: dateLabel, dayOffset: d }, { signal })
          if (!signal.aborted) setResults((prev) => ({ ...prev, [d]: r.result }))
        } catch (e) {
          if (!signal.aborted) setErrors((prev) => ({ ...prev, [d]: messageOf(e) }))
        } finally {
          if (!signal.aborted) setLoading((prev) => ({ ...prev, [d]: false }))
        }
      }),
    ).catch(() => {})

    return () => controller.abort()
  }, [dateLabel, evenings, point, requestIdentity])

  if (!requestIdentity) {
    const idle: Record<number, boolean> = {}
    for (const d of evenings) idle[d] = false
    return { results: {}, loading: idle, errors: {} }
  }

  if (activeRequestIdentity !== requestIdentity) {
    const pending: Record<number, boolean> = {}
    for (const d of evenings) pending[d] = true
    return { results: {}, loading: pending, errors: {} }
  }

  return { results, loading, errors }
}
