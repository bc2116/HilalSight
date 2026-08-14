import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, getVisibilityMap } from '../api'
import type { MapResult } from '../types'
import { messageOf } from '../utils/format'

type MapState = {
  key: string
  maps: Record<number, MapResult | undefined>
  loading: Record<number, boolean | undefined>
  errors: Record<number, string | undefined>
}

const EMPTY_STATE: MapState = { key: '', maps: {}, loading: {}, errors: {} }
const MAX_BUSY_RETRIES = 8

async function getVisibilityMapWithBusyRetry(
  params: { date: string; dayOffset: number; resolution: number },
  signal: AbortSignal,
): Promise<MapResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getVisibilityMap(params, { signal })
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 503 || attempt >= MAX_BUSY_RETRIES) throw error
      const delayMs = Math.min(5, Math.max(1, error.retryAfterSeconds ?? 2)) * 1_000
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
      signal.throwIfAborted()
    }
  }
}

/** Fetches only the selected evening's map grid, retaining prior selections in memory. */
export function useVisibilityMaps(
  dateLabel: string,
  evenings: number[],
  resolution: number,
  selectedDay: number,
) {
  const [state, setState] = useState<MapState>(EMPTY_STATE)
  const [retryToken, setRetryToken] = useState(0)
  const key = dateLabel ? `${dateLabel}:${resolution}:${evenings.join(',')}` : ''
  const daysKey = String(selectedDay)
  const current = state.key === key ? state : { ...EMPTY_STATE, key }
  const requestsRef = useRef<{ key: string; loaded: Set<number>; loading: Set<number> }>({
    key: '',
    loaded: new Set(),
    loading: new Set(),
  })

  useEffect(() => {
    if (!dateLabel) return
    if (requestsRef.current.key !== key) {
      requestsRef.current = { key, loaded: new Set(), loading: new Set() }
    }
    const requests = requestsRef.current
    const requestedDays = daysKey.split(',').map(Number)
    const missingDays = requestedDays.filter((day) => !requests.loaded.has(day) && !requests.loading.has(day))
    if (!missingDays.length) return
    for (const day of missingDays) requests.loading.add(day)

    const controller = new AbortController()
    const { signal } = controller

    setState((previous) => {
      const next = previous.key === key ? previous : { ...EMPTY_STATE, key }
      const loading = { ...next.loading }
      const errors = { ...next.errors }
      for (const day of missingDays) loading[day] = true
      for (const day of missingDays) errors[day] = undefined
      return { ...next, loading, errors }
    })

    Promise.all(
      missingDays.map(async (day) => {
        try {
          const map = await getVisibilityMapWithBusyRetry({ date: dateLabel, dayOffset: day, resolution }, signal)
          if (!signal.aborted) {
            requests.loaded.add(day)
            setState((previous) =>
              previous.key === key ? { ...previous, maps: { ...previous.maps, [day]: map } } : previous,
            )
          }
        } catch (e) {
          if (!signal.aborted) {
            setState((previous) =>
              previous.key === key
                ? { ...previous, errors: { ...previous.errors, [day]: messageOf(e) } }
                : previous,
            )
          }
        } finally {
          requests.loading.delete(day)
          if (!signal.aborted) {
            setState((previous) =>
              previous.key === key
                ? { ...previous, loading: { ...previous.loading, [day]: false } }
                : previous,
            )
          }
        }
      }),
    ).catch(() => {})

    return () => {
      controller.abort()
      for (const day of missingDays) requests.loading.delete(day)
    }
  }, [dateLabel, daysKey, key, resolution, retryToken])

  const retry = useCallback(() => {
    setState((previous) => ({
      ...previous,
      errors: { ...previous.errors, [selectedDay]: undefined },
    }))
    setRetryToken((previous) => previous + 1)
  }, [selectedDay])

  return { maps: current.maps, loading: current.loading, error: current.errors[selectedDay] ?? null, retry }
}
