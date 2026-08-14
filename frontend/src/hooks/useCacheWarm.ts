import { useCallback, useEffect, useState } from 'react'

import { getCacheWarmStatus, startCacheWarm } from '../api'
import type { CacheWarmStatus } from '../types'
import { messageOf } from '../utils/format'

const POLL_MS = 3500

/** Polls backend cache-warm status and exposes a starter for new warm jobs. */
export function useCacheWarm(enabled = true) {
  const [status, setStatus] = useState<CacheWarmStatus | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const tick = async () => {
      try {
        const s = await getCacheWarmStatus()
        if (alive) setStatus(s)
      } catch (e) {
        if (alive) setError(messageOf(e))
      }
    }
    tick().catch(() => {})
    const id = window.setInterval(() => tick().catch(() => {}), POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [enabled])

  const start = useCallback(async (params: { monthsAhead: 3 | 6 | 12; evenings: 1 | 2 | 3; resolution: 2 | 5 }) => {
    if (!enabled) return
    setError(null)
    setBusy(true)
    try {
      await startCacheWarm(params)
      setStatus(await getCacheWarmStatus())
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [enabled])

  return { status, busy, error, start }
}
