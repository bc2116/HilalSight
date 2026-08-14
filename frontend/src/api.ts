import type {
  CacheWarmJob,
  CacheWarmStatus,
  GeocodeSearchResponse,
  HijriContextResponse,
  HijriTodayResponse,
  MapResult,
  NewMoonNextResponse,
  VisibilityPointResponse,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null

  constructor(message: string, status: number, retryAfterSeconds: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Pull FastAPI's `{"detail": ...}` out of an error body when present. */
function extractDetail(body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: unknown }
    if (typeof j?.detail === 'string') return j.detail
    if (j?.detail != null) return JSON.stringify(j.detail)
  } catch {
    // not JSON; fall through to the raw body
  }
  return body
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = extractDetail(text).slice(0, 300)
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new ApiError(
      `HTTP ${res.status}: ${detail || res.statusText}`,
      res.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    )
  }
  return (await res.json()) as T
}

export function getHijriToday(init?: RequestInit): Promise<HijriTodayResponse> {
  return fetchJson('/api/hijri/today', init)
}

export function getHijriContext(referenceDate: string, init?: RequestInit): Promise<HijriContextResponse> {
  return fetchJson(`/api/hijri/context?date=${encodeURIComponent(referenceDate)}`, init)
}

export function hijriToGregorian(
  params: { year: number; month: number; day?: number },
  init?: RequestInit,
): Promise<{ gregorianDate: string }> {
  const q = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
    day: String(params.day ?? 1),
  })
  return fetchJson(`/api/hijri/to-gregorian?${q.toString()}`, init)
}

export function getNextNewMoon(fromDateUtc: string, init?: RequestInit): Promise<NewMoonNextResponse> {
  return fetchJson(`/api/newmoon/next?from=${encodeURIComponent(fromDateUtc)}`, init)
}

export async function searchGeocode(query: string, init?: RequestInit): Promise<GeocodeSearchResponse> {
  const q = new URLSearchParams({ q: query })
  const payload = await fetchJson<unknown>(`/api/geocode/search?${q.toString()}`, init)
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { results?: unknown }).results)) {
    throw new Error('Place search returned an invalid response.')
  }

  const results = (payload as { results: unknown[] }).results.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Place search returned an invalid result.')
    const { lat, lon, displayName } = value as Record<string, unknown>
    if (
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lon !== 'number' ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180 ||
      typeof displayName !== 'string' ||
      !displayName.trim()
    ) {
      throw new Error('Place search returned invalid coordinates.')
    }
    return { lat, lon, displayName }
  })

  return { results }
}

export function getVisibilityMap(params: {
  date: string
  dayOffset: number
  resolution: number
}, init?: RequestInit): Promise<MapResult> {
  const { date, dayOffset, resolution } = params
  const q = new URLSearchParams({
    date,
    dayOffset: String(dayOffset),
    resolution: String(resolution),
  })
  return fetchJson(`/api/visibility/map?${q.toString()}`, init)
}

export function getVisibilityPoint(params: {
  lat: number
  lon: number
  date: string
  dayOffset: number
}, init?: RequestInit): Promise<VisibilityPointResponse> {
  const { lat, lon, date, dayOffset } = params
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    date,
    dayOffset: String(dayOffset),
  })
  return fetchJson(`/api/visibility/point?${q.toString()}`, init)
}

export function startCacheWarm(params: {
  monthsAhead: 3 | 6 | 12
  evenings: 1 | 2 | 3
  resolution: 2 | 5
}): Promise<CacheWarmJob> {
  const q = new URLSearchParams({
    monthsAhead: String(params.monthsAhead),
    evenings: String(params.evenings),
    resolution: String(params.resolution),
  })
  return fetchJson(`/api/cache/warm?${q.toString()}`, { method: 'POST' })
}

export function getCacheWarmStatus(): Promise<CacheWarmStatus> {
  return fetchJson('/api/cache/warm/status')
}
