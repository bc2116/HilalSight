import { useCallback, useEffect, useRef, useState } from 'react'

import { getHijriContext, getNextNewMoon, hijriToGregorian } from '../api'
import type { HijriContextResponse } from '../types'
import { addDaysUtc, messageOf } from '../utils/format'

const SUPPORTED_DATE_MIN = '1900-01-01'
const SUPPORTED_DATE_MAX = '2050-12-31'

function requireSupportedDateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < SUPPORTED_DATE_MIN || value > SUPPORTED_DATE_MAX) {
    throw new Error(
      `The crescent-window base date falls on ${value}, outside the supported ${SUPPORTED_DATE_MIN}–${SUPPORTED_DATE_MAX} date-label range.`,
    )
  }
  return value
}

function browserLocalDateLabel(now = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Loads the reference Hijri context for the browser's local civil date. The
 * API selects the transition lunation; visibility results never select the
 * month label. Users can still re-project from a picked Hijri month.
 */
export function useHijriProjection() {
  const [context, setContext] = useState<HijriContextResponse | null>(null)
  const [contextLoading, setContextLoading] = useState(true)
  const [contextError, setContextError] = useState<string | null>(null)
  const [dateLabel, setDateLabelState] = useState<string>('')
  const [pickYear, setPickYearState] = useState<number | null>(null)
  const [pickMonth, setPickMonthState] = useState<number | null>(null)
  const [applying, setApplying] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [projectionMode, setProjectionMode] = useState<'auto' | 'manual' | 'pending'>('auto')
  const dateRevisionRef = useRef(0)
  const autoProjectionRef = useRef(true)
  const pickerDirtyRef = useRef(false)
  const contextRef = useRef<HijriContextResponse | null>(null)

  const setDateLabel = useCallback((value: string) => {
    dateRevisionRef.current += 1
    autoProjectionRef.current = false
    setProjectionMode('manual')
    setError(null)
    setDateLabelState(value)
  }, [])

  const setPickYear = useCallback((value: number) => {
    pickerDirtyRef.current = true
    setPickYearState(value)
  }, [])

  const setPickMonth = useCallback((value: number) => {
    pickerDirtyRef.current = true
    setPickMonthState(value)
  }, [])

  useEffect(() => {
    let disposed = false
    let requestedDate: string | null = null
    let requestId = 0
    let controller: AbortController | null = null

    const refreshForLocalDate = () => {
      const referenceDate = browserLocalDateLabel()
      if (requestedDate === referenceDate) return

      requestedDate = referenceDate
      const activeRequest = ++requestId
      controller?.abort()
      controller = new AbortController()
      const revision = dateRevisionRef.current
      setContextLoading(true)
      setContextError(null)

      void getHijriContext(referenceDate, { signal: controller.signal })
        .then((nextContext) => {
          const defaultProjection = nextContext.defaultProjection
          const projectionDate = defaultProjection ? requireSupportedDateLabel(defaultProjection.dateLabel) : null
          if (disposed || activeRequest !== requestId) return

          contextRef.current = nextContext
          setContext(nextContext)
          if (!pickerDirtyRef.current) {
            setPickYearState(defaultProjection?.targetMonth.year ?? null)
            setPickMonthState(defaultProjection?.targetMonth.month ?? null)
          }
          if (autoProjectionRef.current && dateRevisionRef.current === revision) {
            setDateLabelState(projectionDate ?? '')
            setProjectionMode('auto')
            setError(null)
          }
        })
        .catch((cause) => {
          if (disposed || activeRequest !== requestId || controller?.signal.aborted) return
          requestedDate = null
          if (contextRef.current?.referenceDate !== referenceDate) {
            contextRef.current = null
            setContext(null)
          }
          setContextError(messageOf(cause))
        })
        .finally(() => {
          if (!disposed && activeRequest === requestId) setContextLoading(false)
        })
    }

    refreshForLocalDate()
    const refreshTimer = window.setInterval(refreshForLocalDate, 60_000)
    return () => {
      disposed = true
      window.clearInterval(refreshTimer)
      controller?.abort()
    }
  }, [])

  /** Jump the projection to the lunation of the picked Hijri month. Resolves true on success. */
  const applyHijriPick = useCallback(async (): Promise<boolean> => {
    if (!pickYear || !pickMonth) return false
    const revision = ++dateRevisionRef.current
    const wasAuto = autoProjectionRef.current
    autoProjectionRef.current = false
    pickerDirtyRef.current = true
    setProjectionMode('pending')
    setApplying(true)
    setError(null)
    try {
      const g = await hijriToGregorian({ year: pickYear, month: pickMonth, day: 1 })
      // Search a few days before the civil start-date label for the lunation's conjunction.
      const from = addDaysUtc(g.gregorianDate, -3)
      const nm = await getNextNewMoon(from || g.gregorianDate)
      if (dateRevisionRef.current !== revision) return false
      setDateLabelState(requireSupportedDateLabel(nm.newMoonDateUtc))
      setProjectionMode('manual')
      return true
    } catch (e) {
      if (dateRevisionRef.current === revision) {
        setError(messageOf(e))
        if (wasAuto) {
          autoProjectionRef.current = true
          setProjectionMode('auto')
          const currentDefault = contextRef.current?.defaultProjection
          setDateLabelState(currentDefault ? requireSupportedDateLabel(currentDefault.dateLabel) : '')
        } else {
          setProjectionMode('manual')
        }
      }
      return false
    } finally {
      setApplying(false)
    }
  }, [pickYear, pickMonth])

  return {
    context,
    contextLoading,
    contextError,
    dateLabel,
    setDateLabel,
    pickYear,
    setPickYear,
    pickMonth,
    setPickMonth,
    applying,
    applyHijriPick,
    error,
    isAutoProjection: projectionMode === 'auto',
    projectionPending: projectionMode === 'pending',
  }
}
