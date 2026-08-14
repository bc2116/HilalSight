import { useCallback, useEffect, useRef, useState } from 'react'

import { getHijriToday, getNextNewMoon, hijriToGregorian } from '../api'
import type { HijriTodayResponse } from '../types'
import { addDaysUtc, messageOf } from '../utils/format'

const SUPPORTED_DATE_MIN = '1900-01-01'
const SUPPORTED_DATE_MAX = '2050-12-31'

function requireSupportedDateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < SUPPORTED_DATE_MIN || value > SUPPORTED_DATE_MAX) {
    throw new Error(
      `The next conjunction falls on ${value}, outside the supported ${SUPPORTED_DATE_MIN}–${SUPPORTED_DATE_MAX} date-label range.`,
    )
  }
  return value
}

/**
 * Loads today's Hijri context, resolves the next conjunction as the default
 * projection date, and lets the user re-project from a picked Hijri month.
 */
export function useHijriProjection() {
  const [hijri, setHijri] = useState<HijriTodayResponse | null>(null)
  const [dateLabel, setDateLabelState] = useState<string>('')
  const [pickYear, setPickYear] = useState<number | null>(null)
  const [pickMonth, setPickMonth] = useState<number | null>(null)
  const [applying, setApplying] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const dateRevisionRef = useRef(0)

  const setDateLabel = useCallback((value: string) => {
    dateRevisionRef.current += 1
    setError(null)
    setDateLabelState(value)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const revision = dateRevisionRef.current
    getHijriToday({ signal: controller.signal })
      .then(async (h) => {
        setHijri(h)
        setPickYear(h.nextHijriMonth.year)
        setPickMonth(h.nextHijriMonth.month)
        const dt = await getNextNewMoon(h.gregorianDateUtc, { signal: controller.signal })
        if (dateRevisionRef.current === revision) {
          setDateLabelState(requireSupportedDateLabel(dt.newMoonDateUtc))
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && dateRevisionRef.current === revision) setError(messageOf(e))
      })
    return () => controller.abort()
  }, [])

  /** Jump the projection to the lunation of the picked Hijri month. Resolves true on success. */
  const applyHijriPick = useCallback(async (): Promise<boolean> => {
    if (!pickYear || !pickMonth) return false
    const revision = ++dateRevisionRef.current
    setApplying(true)
    setError(null)
    try {
      const g = await hijriToGregorian({ year: pickYear, month: pickMonth, day: 1 })
      // Search a few days before the civil start-date label for the lunation's conjunction.
      const from = addDaysUtc(g.gregorianDate, -3)
      const nm = await getNextNewMoon(from || g.gregorianDate)
      if (dateRevisionRef.current !== revision) return false
      setDateLabelState(requireSupportedDateLabel(nm.newMoonDateUtc))
      return true
    } catch (e) {
      if (dateRevisionRef.current === revision) setError(messageOf(e))
      return false
    } finally {
      setApplying(false)
    }
  }, [pickYear, pickMonth])

  return {
    hijri,
    dateLabel,
    setDateLabel,
    pickYear,
    setPickYear,
    pickMonth,
    setPickMonth,
    applying,
    applyHijriPick,
    error,
  }
}
