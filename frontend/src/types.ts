export type HijriTodayResponse = {
  gregorianDateUtc: string
  hijri: { year: number; month: number; day: number; monthName: string }
  nextHijriMonth: { year: number; month: number; day: number; monthName: string }
  calendar: string
  note: string
}

export type HijriMonth = {
  year: number
  month: number
  monthName: string
}

export type HijriContextResponse = {
  referenceDate: string
  mode: 'stable' | 'transition'
  month: HijriMonth | null
  transition: {
    phase: 'before' | 'after'
    leavingMonth: HijriMonth
    enteringMonth: HijriMonth
    referenceBoundaryDate: string
  } | null
  calendar: string
  note: string
  defaultProjection: {
    targetMonth: HijriMonth
    dateLabel: string
    conjunctionUtc: string
    relation: 'upcoming' | 'recent'
  } | null
}

export type NewMoonNextResponse = {
  from: string
  newMoonUtc: string
  newMoonDateUtc: string
}

export type GeocodeSearchResult = {
  lat: number
  lon: number
  displayName: string
}

export type GeocodeSearchResponse = {
  results: GeocodeSearchResult[]
}

export type Marker = { lat: number; lon: number; age_hours: number; category: string }

export type MapResult = {
  date: string
  dayOffset: number
  resolution: number
  lat0: number
  lon0: number
  nLat: number
  nLon: number
  categories: string[]
  ageHours: Array<number | null>
  qValues: Array<number | null>
  overlays: {
    moonSetsBeforeSun: boolean[]
    priorConjunction: boolean[]
    noSunset: boolean[]
    noMoonset: boolean[]
  }
  markers: {
    firstNakedEye: Marker | null
    firstOpticalAid: Marker | null
  }
  conjunctionUtc: string
  ephemeris: { file: string; size_bytes: number; mtime_utc: string | null; sha256?: string | null }
}

export type PointVisibility = {
  category: string
  method: string
  q: number | null
  arclDeg: number | null
  arcvDeg: number | null
  dazDeg: number | null
  wArcmin: number | null
  ageHours: number | null
  lagMinutes: number | null
  moonAltSunsetDeg: number | null
  moonAltBestDeg: number | null
  sunAltBestDeg: number | null
  tsUtc: string | null
  tmUtc: string | null
  tbUtc: string | null
  tsLocal: string | null
  tmLocal: string | null
  tbLocal: string | null
  timezone: string | null
}

export type VisibilityPointResponse = {
  lat: number
  lon: number
  date: string
  dayOffset: number
  result: PointVisibility
}

export type CacheWarmJob = {
  id: string
  status: 'queued' | 'running' | 'done' | 'error'
  monthsAhead: number
  evenings: number
  resolution: number
  fromDate: string
  createdUtc: string
  startedUtc: string | null
  finishedUtc: string | null
  totalMaps: number
  doneMaps: number
  current: string | null
  error: string | null
}

export type CacheWarmStatus = {
  running: boolean
  job: CacheWarmJob | null
}
