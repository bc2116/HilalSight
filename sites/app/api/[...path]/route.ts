import { addHijriMonth, gregorianToHijri, hijriReferenceContext, hijriToGregorian, monthName } from '@/lib/hijri'
import {
  computeVisibilityMap,
  computeVisibilityPoint,
  EPHEMERIS_INFO,
  nextNewMoon,
  parseDateLabel,
  SUPPORTED_DATE_MAX,
  SUPPORTED_DATE_MIN,
} from '@/lib/visibility'

const mapCache = new Map<string, ReturnType<typeof computeVisibilityMap>>()
const DAY_MS = 86_400_000
const HIJRI_CONTEXT_NOTE =
  'Hijri days begin at local sunset, and month starts may differ by location, calendar, or authority. Visibility projections do not establish an official date.'

function json(data: unknown, status = 200, cacheControl?: string): Response {
  const headers = cacheControl ? { 'Cache-Control': cacheControl } : undefined
  return Response.json(data, { status, headers })
}

function detail(message: string, status = 400, extraHeaders?: Record<string, string>): Response {
  const response = json({ detail: message }, status, 'no-store')
  for (const [name, value] of Object.entries(extraHeaders ?? {})) response.headers.set(name, value)
  return response
}

function pathOf(request: Request): string {
  return new URL(request.url).pathname.replace(/^\/api\/?/, '')
}

function integer(value: string | null): number | null {
  if (value == null || !/^-?\d+$/.test(value)) return null
  return Number(value)
}

function decimal(value: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function supportedDate(date: Date): boolean {
  const label = date.toISOString().slice(0, 10)
  return label >= SUPPORTED_DATE_MIN && label <= SUPPORTED_DATE_MAX
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = pathOf(request)

  if (path === 'status') {
    return json({ ok: true, service: 'HilalSight Sites', utcNow: new Date().toISOString(), ephemeris: EPHEMERIS_INFO })
  }

  if (path === 'geocode/search') {
    return detail('Hosted place-name search is disabled; enter latitude, longitude instead.', 501)
  }

  if (path === 'hijri/today') {
    const today = new Date()
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const hijri = gregorianToHijri(utcToday)
    const next = addHijriMonth(hijri)
    return json({
      gregorianDateUtc: utcToday.toISOString().slice(0, 10),
      hijri: { ...hijri, monthName: monthName(hijri.month) },
      nextHijriMonth: { ...next, monthName: monthName(next.month) },
      calendar: 'Islamic Civil (tabular arithmetic)',
      note: 'Official month starts may differ by country/authority and actual sighting.',
    })
  }

  if (path === 'hijri/context') {
    const date = parseDateLabel(url.searchParams.get('date'))
    if (!date) return detail('Invalid date=YYYY-MM-DD')

    const context = hijriReferenceContext(date)
    const searchStart = new Date(context.projectionBoundaryDate.getTime() - 15 * DAY_MS)
    const conjunction = nextNewMoon(searchStart)
    const separationDays = Math.abs(context.projectionBoundaryDate.getTime() - conjunction.getTime()) / DAY_MS
    if (separationDays > 7) return detail('Unable to match the reference month boundary to a conjunction', 500)

    const referenceDate = date.toISOString().slice(0, 10)
    const conjunctionUtc = conjunction.toISOString()
    const conjunctionDateLabel = conjunctionUtc.slice(0, 10)
    const defaultProjection =
      conjunctionDateLabel >= SUPPORTED_DATE_MIN && conjunctionDateLabel <= SUPPORTED_DATE_MAX
        ? {
            targetMonth: context.targetMonth,
            dateLabel: conjunctionDateLabel,
            conjunctionUtc,
            relation: conjunctionDateLabel < referenceDate ? ('recent' as const) : ('upcoming' as const),
          }
        : null
    return json({
      referenceDate,
      mode: context.mode,
      month: context.month,
      transition: context.transition,
      calendar: 'Islamic Civil (tabular reference)',
      note: HIJRI_CONTEXT_NOTE,
      defaultProjection,
    })
  }

  if (path === 'hijri/from-gregorian') {
    const date = parseDateLabel(url.searchParams.get('date'))
    if (!date) return detail('Invalid date=YYYY-MM-DD')
    const hijri = gregorianToHijri(date)
    return json({ gregorianDate: date.toISOString().slice(0, 10), hijri: { ...hijri, monthName: monthName(hijri.month) } })
  }

  if (path === 'hijri/to-gregorian') {
    const year = integer(url.searchParams.get('year'))
    const month = integer(url.searchParams.get('month'))
    const rawDay = url.searchParams.get('day')
    const parsedDay = integer(rawDay)
    if (rawDay != null && parsedDay == null) return detail('Invalid Hijri date')
    const day = parsedDay ?? 1
    if (year == null || year < 1 || month == null || month < 1 || month > 12 || day < 1 || day > 30) {
      return detail('Invalid Hijri date')
    }
    const date = hijriToGregorian({ year, month, day })
    if (!Number.isFinite(date.getTime())) return detail('Invalid Hijri date')
    const roundTrip = gregorianToHijri(date)
    if (roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day) {
      return detail('Invalid Hijri date')
    }
    if (!supportedDate(date)) {
      return detail('Hijri date is outside the supported 1900-2050 range')
    }
    return json({ hijri: { year, month, day }, gregorianDate: date.toISOString().slice(0, 10), calendar: 'Islamic Civil (tabular arithmetic)' })
  }

  if (path === 'newmoon/next') {
    const from = parseDateLabel(url.searchParams.get('from'))
    if (!from) return detail('Invalid from=YYYY-MM-DD')
    const conjunction = nextNewMoon(from)
    return json({ from: from.toISOString().slice(0, 10), newMoonUtc: conjunction.toISOString(), newMoonDateUtc: conjunction.toISOString().slice(0, 10) })
  }

  if (path === 'visibility/point') {
    const lat = decimal(url.searchParams.get('lat'))
    const lon = decimal(url.searchParams.get('lon'))
    const date = parseDateLabel(url.searchParams.get('date'))
    const rawDayOffset = url.searchParams.get('dayOffset')
    const parsedDayOffset = integer(rawDayOffset)
    if (rawDayOffset != null && parsedDayOffset == null) return detail('dayOffset must be 0-3')
    const dayOffset = parsedDayOffset ?? 0
    if (!date) return detail('Invalid date=YYYY-MM-DD')
    if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return detail('lat/lon out of range')
    }
    if (dayOffset < 0 || dayOffset > 3) return detail('dayOffset must be 0-3')
    const result = computeVisibilityPoint(lat, lon, date, dayOffset)
    return json({ lat, lon, date: date.toISOString().slice(0, 10), dayOffset, result }, 200, 'no-store')
  }

  if (path === 'visibility/map') {
    const date = parseDateLabel(url.searchParams.get('date'))
    const rawDayOffset = url.searchParams.get('dayOffset')
    const parsedDayOffset = integer(rawDayOffset)
    if (rawDayOffset != null && parsedDayOffset == null) return detail('dayOffset must be 0-3')
    const dayOffset = parsedDayOffset ?? 0
    const rawResolution = url.searchParams.get('resolution')
    const resolution = rawResolution == null ? 2 : decimal(rawResolution)
    if (!date) return detail('Invalid date=YYYY-MM-DD')
    if (dayOffset < 0 || dayOffset > 3) return detail('dayOffset must be 0-3')
    if (resolution == null || ![2, 5].includes(resolution)) return detail('Hosted resolution must be 2 or 5 degrees')
    const key = `${date.toISOString().slice(0, 10)}:${dayOffset}:${resolution}`
    let result = mapCache.get(key)
    if (!result) {
      result = computeVisibilityMap(date, dayOffset, resolution)
      mapCache.set(key, result)
      if (mapCache.size > 12) mapCache.delete(mapCache.keys().next().value as string)
    }
    return json(result, 200, 'public, max-age=86400')
  }

  if (path === 'cache/warm/status') return json({ running: false, job: null })

  return detail('Not found', 404)
}

export async function POST(request: Request): Promise<Response> {
  if (pathOf(request) === 'cache/warm') {
    return json({ detail: 'Hosted maps are calculated and cached on demand.' }, 409)
  }
  return detail('Not found', 404)
}
