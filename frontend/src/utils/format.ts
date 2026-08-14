export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(digits)
}

/** '2026-06-17T19:42:00' → '2026-06-17 19:42:00' */
export function fmtClock(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace('T', ' ')
}

const WALL_CLOCK_RE = /(?:^|[T\s])(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/
const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/
const DAY_MS = 86_400_000

/**
 * Read an ISO-like timestamp's own wall-clock fields without converting it
 * through Date (and therefore without applying the browser's timezone).
 */
export function fmtWallClock(s: string | null | undefined): string | null {
  const match = s?.trim().match(WALL_CLOCK_RE)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] == null ? 0 : Number(match[3])
  if (hour > 23 || minute > 59 || second > 59) return null

  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function dayOffsetLabel(timestamp: string | null | undefined, civilDate: string | null | undefined): string {
  const timestampDate = timestamp?.trim().match(ISO_DATE_RE)?.[1]
  if (!timestampDate || !civilDate) return ''

  const timestampMs = Date.parse(`${timestampDate}T00:00:00Z`)
  const civilMs = Date.parse(`${civilDate}T00:00:00Z`)
  if (!Number.isFinite(timestampMs) || !Number.isFinite(civilMs)) return ''

  const offset = Math.round((timestampMs - civilMs) / DAY_MS)
  if (offset === 0) return ''
  const sign = offset > 0 ? '+' : ''
  return ` (${sign}${offset} ${Math.abs(offset) === 1 ? 'day' : 'days'})`
}

/** Prefer a local wall clock; retain calendar rollover and mark a UTC fallback unmistakably. */
export function fmtLocalOrUtcClock(
  local: string | null | undefined,
  utc: string | null | undefined,
  timezone?: string | null,
  civilDate?: string | null,
): string | null {
  const localClock = fmtWallClock(local)
  if (localClock) {
    const utcLabel = timezone === 'UTC' ? ' UTC' : ''
    return `${localClock}${utcLabel}${dayOffsetLabel(local, civilDate)}`
  }

  const utcClock = fmtWallClock(utc)
  return utcClock ? `${utcClock} UTC${dayOffsetLabel(utc, civilDate)}` : null
}

export const MOONSET_HORIZON_NOTE =
  "HilalSight's geometric moonset at the 0° horizon; apparent or refraction-aware almanacs can differ by a few minutes."

/** ISO timestamp → 'YYYY-MM-DD HH:MM', dropping seconds/microseconds/offset. */
export function fmtUtcMinute(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace('T', ' ').slice(0, 16)
}

/** Add whole days to a YYYY-MM-DD label (UTC math); '' when the input is invalid. */
export function addDaysUtc(dateIso: string, days: number): string {
  if (!dateIso) return ''
  const d = new Date(`${dateIso}T00:00:00Z`)
  if (!isFinite(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const SHORT_DATE = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const WEEKDAY_DATE = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** 'Jun 17' from a YYYY-MM-DD label; '' when invalid. */
export function fmtShortDateUtc(dateIso: string): string {
  if (!dateIso) return ''
  const d = new Date(`${dateIso}T00:00:00Z`)
  if (!isFinite(d.getTime())) return ''
  return SHORT_DATE.format(d)
}

/** 'Wed, Jun 17' from a YYYY-MM-DD label; '' when invalid. */
export function fmtWeekdayDateUtc(dateIso: string): string {
  if (!dateIso) return ''
  const d = new Date(`${dateIso}T00:00:00Z`)
  if (!isFinite(d.getTime())) return ''
  return WEEKDAY_DATE.format(d)
}

/** '21.42°N, 39.83°E' */
export function fmtLatLon(lat: number, lon: number, digits = 2): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(digits)}°${ns}, ${Math.abs(lon).toFixed(digits)}°${ew}`
}

export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
