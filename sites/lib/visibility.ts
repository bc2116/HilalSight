import {
  AngleFromSun,
  Body,
  Equator,
  Horizon,
  KM_PER_AU,
  Observer,
  SearchAltitude,
  SearchMoonPhase,
} from 'astronomy-engine'
import tzLookup from 'tz-lookup'

import type { MapResult, Marker, PointVisibility } from '../../frontend/src/types'

const DAY_MS = 86_400_000
const MOON_RADIUS_KM = 1737.4
export const SUPPORTED_DATE_MIN = '1900-01-01'
export const SUPPORTED_DATE_MAX = '2050-12-31'

const MOON_SET_BEFORE_SUN = 'MOON_SET_BEFORE_SUN'
const PRIOR_CONJUNCTION = 'PRIOR_CONJUNCTION'
const NO_SUNSET = 'NO_SUNSET'
const NO_MOONSET = 'NO_MOONSET'

export const EPHEMERIS_INFO = {
  file: 'Astronomy Engine 2.1.19',
  sha256: null,
  size_bytes: 0,
  mtime_utc: null,
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export function parseDateLabel(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (value < SUPPORTED_DATE_MIN || value > SUPPORTED_DATE_MAX) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

export function nextNewMoon(fromDate: Date): Date {
  const conjunction = SearchMoonPhase(0, fromDate, 40)
  if (!conjunction) throw new Error('No new moon found in search window')
  return conjunction.date
}

function conjunctionNearDate(date: Date): Date {
  return nextNewMoon(addDays(date, -1))
}

function horizontal(body: Body, date: Date, observer: Observer) {
  const equatorial = Equator(body, date, observer, true, true)
  const horizon = Horizon(date, observer, equatorial.ra, equatorial.dec)
  return { altitude: horizon.altitude, azimuth: horizon.azimuth, distanceAu: equatorial.dist }
}

function emptyPoint(category: string, method: string, values: Partial<PointVisibility> = {}): PointVisibility {
  return {
    category,
    method,
    q: null,
    arclDeg: null,
    arcvDeg: null,
    dazDeg: null,
    wArcmin: null,
    ageHours: null,
    lagMinutes: null,
    moonAltSunsetDeg: null,
    moonAltBestDeg: null,
    sunAltBestDeg: null,
    tsUtc: null,
    tmUtc: null,
    tbUtc: null,
    tsLocal: null,
    tmLocal: null,
    tbLocal: null,
    timezone: null,
    ...values,
  }
}

function qValue(arcv: number, widthArcmin: number): number {
  const threshold = 11.8371 - 6.3226 * widthArcmin + 0.7319 * widthArcmin ** 2 - 0.1018 * widthArcmin ** 3
  return (arcv - threshold) / 10
}

function classifyQ(q: number): string {
  if (q > 0.216) return 'A'
  if (q > -0.014) return 'B'
  if (q > -0.16) return 'C'
  if (q > -0.232) return 'D'
  if (q > -0.293) return 'E'
  return 'F'
}

function recommendedMethod(category: string): string {
  if (category === 'A' || category === 'B') return 'Naked eye'
  if (category === 'C' || category === 'D') return 'Optical aid (binoculars/telescope), then possibly naked eye'
  return 'Not visible'
}

function localIso(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const zone = get('timeZoneName')
  const offset = zone === 'GMT' ? 'Z' : zone.replace(/^GMT/, '')
  if (offset !== 'Z' && !/^[+-]\d{2}:\d{2}$/.test(offset)) {
    throw new Error('Unable to determine local UTC offset')
  }
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`
}

function computePoint(
  lat: number,
  lon: number,
  dateLabel: Date,
  dayOffset: number,
  conjunction: Date,
  includeLocalTimes: boolean,
): PointVisibility {
  const observer = new Observer(lat, lon, 0)
  const localDate = addDays(dateLabel, dayOffset)
  const localNoonUtc = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 12) - (lon / 15) * 3_600_000
  const sunsetEvent = SearchAltitude(Body.Sun, observer, -1, new Date(localNoonUtc), 1, 0)
  if (!sunsetEvent) return emptyPoint(NO_SUNSET, 'N/A')

  const sunset = sunsetEvent.date
  const moonAtSunset = horizontal(Body.Moon, sunset, observer)
  if (moonAtSunset.altitude <= 0) {
    return emptyPoint(MOON_SET_BEFORE_SUN, 'Not visible', {
      moonAltSunsetDeg: moonAtSunset.altitude,
      tsUtc: sunset.toISOString(),
    })
  }

  const moonsetEvent = SearchAltitude(Body.Moon, observer, -1, sunset, 1, 0)
  if (!moonsetEvent) {
    return emptyPoint(NO_MOONSET, 'N/A', {
      moonAltSunsetDeg: moonAtSunset.altitude,
      tsUtc: sunset.toISOString(),
    })
  }

  const moonset = moonsetEvent.date
  const lagMs = moonset.getTime() - sunset.getTime()
  const bestTime = new Date(sunset.getTime() + (4 / 9) * lagMs)
  const moonAtBest = horizontal(Body.Moon, bestTime, observer)
  const sunAtBest = horizontal(Body.Sun, bestTime, observer)
  const ageHours = (bestTime.getTime() - conjunction.getTime()) / 3_600_000

  if (bestTime < conjunction) {
    return emptyPoint(PRIOR_CONJUNCTION, 'Not visible', {
      ageHours,
      lagMinutes: lagMs / 60_000,
      moonAltSunsetDeg: moonAtSunset.altitude,
      moonAltBestDeg: moonAtBest.altitude,
      sunAltBestDeg: sunAtBest.altitude,
      tsUtc: sunset.toISOString(),
      tmUtc: moonset.toISOString(),
      tbUtc: bestTime.toISOString(),
    })
  }

  const arcv = moonAtBest.altitude - sunAtBest.altitude
  const daz = ((sunAtBest.azimuth - moonAtBest.azimuth + 540) % 360) - 180
  const arcl = AngleFromSun(Body.Moon, bestTime)
  const distanceKm = moonAtBest.distanceAu * KM_PER_AU
  const semidiameterArcmin = (Math.asin(MOON_RADIUS_KM / distanceKm) * 180 * 60) / Math.PI
  const widthArcmin = semidiameterArcmin * (1 - Math.cos((arcl * Math.PI) / 180))
  const q = qValue(arcv, widthArcmin)
  const category = classifyQ(q)

  let timezone: string | null = null
  let tsLocal: string | null = null
  let tmLocal: string | null = null
  let tbLocal: string | null = null
  if (includeLocalTimes) {
    try {
      timezone = tzLookup(lat, lon)
      tsLocal = localIso(sunset, timezone)
      tmLocal = localIso(moonset, timezone)
      tbLocal = localIso(bestTime, timezone)
    } catch {
      timezone = 'UTC'
      tsLocal = sunset.toISOString()
      tmLocal = moonset.toISOString()
      tbLocal = bestTime.toISOString()
    }
  }

  return {
    category,
    method: recommendedMethod(category),
    q,
    arclDeg: arcl,
    arcvDeg: arcv,
    dazDeg: daz,
    wArcmin: widthArcmin,
    ageHours,
    lagMinutes: lagMs / 60_000,
    moonAltSunsetDeg: moonAtSunset.altitude,
    moonAltBestDeg: moonAtBest.altitude,
    sunAltBestDeg: sunAtBest.altitude,
    tsUtc: sunset.toISOString(),
    tmUtc: moonset.toISOString(),
    tbUtc: bestTime.toISOString(),
    tsLocal,
    tmLocal,
    tbLocal,
    timezone,
  }
}

export function computeVisibilityPoint(lat: number, lon: number, dateLabel: Date, dayOffset: number): PointVisibility {
  return computePoint(lat, lon, dateLabel, dayOffset, conjunctionNearDate(dateLabel), true)
}

export function computeVisibilityMap(dateLabel: Date, dayOffset: number, resolution: number): MapResult {
  const conjunction = conjunctionNearDate(dateLabel)
  const nLon = Math.round(360 / resolution)
  const nLat = Math.round(180 / resolution)
  const lon0 = -180 + resolution / 2
  const lat0 = 90 - resolution / 2
  const categories: string[] = []
  const ageHours: Array<number | null> = []
  const qValues: Array<number | null> = []
  const moonSetsBeforeSun: boolean[] = []
  const priorConjunction: boolean[] = []
  const noSunset: boolean[] = []
  const noMoonset: boolean[] = []
  let firstNakedEye: Marker | null = null
  let firstOpticalAid: Marker | null = null

  for (let latIndex = 0; latIndex < nLat; latIndex += 1) {
    const lat = lat0 - latIndex * resolution
    for (let lonIndex = 0; lonIndex < nLon; lonIndex += 1) {
      const lon = lon0 + lonIndex * resolution
      const point = computePoint(lat, lon, dateLabel, dayOffset, conjunction, false)
      categories.push(point.category)
      ageHours.push(point.ageHours)
      qValues.push(point.q)
      moonSetsBeforeSun.push(point.category === MOON_SET_BEFORE_SUN)
      priorConjunction.push(point.category === PRIOR_CONJUNCTION)
      noSunset.push(point.category === NO_SUNSET)
      noMoonset.push(point.category === NO_MOONSET)

      if (point.ageHours != null) {
        const marker = { lat, lon, age_hours: point.ageHours, category: point.category }
        if (['A', 'B'].includes(point.category) && (!firstNakedEye || marker.age_hours < firstNakedEye.age_hours)) {
          firstNakedEye = marker
        }
        if (['A', 'B', 'C', 'D'].includes(point.category) && (!firstOpticalAid || marker.age_hours < firstOpticalAid.age_hours)) {
          firstOpticalAid = marker
        }
      }
    }
  }

  return {
    date: dateLabel.toISOString().slice(0, 10),
    dayOffset,
    resolution,
    lat0,
    lon0,
    nLat,
    nLon,
    categories,
    ageHours,
    qValues,
    overlays: { moonSetsBeforeSun, priorConjunction, noSunset, noMoonset },
    markers: { firstNakedEye, firstOpticalAid },
    conjunctionUtc: conjunction.toISOString(),
    ephemeris: EPHEMERIS_INFO,
  }
}
