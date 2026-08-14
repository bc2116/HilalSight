import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { searchGeocode } from '../api'
import type { PointVisibility } from '../types'
import { CATEGORY_LABELS, shortCode } from '../utils/colors'
import {
  addDaysUtc,
  fmtClock,
  fmtLatLon,
  fmtLocalOrUtcClock,
  fmtNum,
  fmtShortDateUtc,
  messageOf,
  MOONSET_HORIZON_NOTE,
} from '../utils/format'

const COORD_RE = /^\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*$/
const PLACE_SEARCH_TIMEOUT_MS = 10_000

export function PointDetails(props: {
  date: string
  placeSearchEnabled: boolean
  selected: { lat: number; lon: number } | null
  evenings: number[]
  results: Record<number, PointVisibility | undefined>
  loading: Record<number, boolean | undefined>
  errors: Record<number, string | undefined>
  onSetPoint: (lat: number, lon: number) => void
}) {
  const { date, placeSearchEnabled, selected, evenings, results, loading, errors, onSetPoint } = props
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const searchRequestIdRef = useRef(0)
  const geolocationRequestIdRef = useRef(0)
  const activeSearchRef = useRef<{ id: number; controller: AbortController } | null>(null)

  useEffect(
    () => () => {
      searchRequestIdRef.current += 1
      geolocationRequestIdRef.current += 1
      const active = activeSearchRef.current
      activeSearchRef.current = null
      active?.controller.abort()
    },
    [],
  )

  useLayoutEffect(() => {
    geolocationRequestIdRef.current += 1
    setLocating(false)
    searchRequestIdRef.current += 1
    const active = activeSearchRef.current
    activeSearchRef.current = null
    active?.controller.abort()
    setSearching(false)
  }, [selected?.lat, selected?.lon])

  const title = useMemo(() => {
    if (!selected) return 'Location Report'
    return `Location ${fmtLatLon(selected.lat, selected.lon)}`
  }, [selected])

  const timezone = useMemo(
    () => evenings.map((d) => results[d]?.timezone).find((tz) => !!tz) ?? null,
    [evenings, results],
  )

  async function handleSearch() {
    const q = query.trim()
    if (!q) return
    const requestId = ++searchRequestIdRef.current
    geolocationRequestIdRef.current += 1
    setLocating(false)
    const previous = activeSearchRef.current
    activeSearchRef.current = null
    previous?.controller.abort()
    setSearching(false)
    setActionError(null)

    // Direct "lat, lon" input
    const m = q.match(COORD_RE)
    if (m) {
      const lat = Number(m[1])
      const lon = Number(m[2])
      if (isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        onSetPoint(lat, lon)
      } else {
        setActionError('Coordinates out of range: latitude ±90, longitude ±180.')
      }
      return
    }

    if (!placeSearchEnabled) {
      setActionError('Hosted place-name search is disabled. Enter coordinates as “latitude, longitude”.')
      return
    }

    const controller = new AbortController()
    activeSearchRef.current = { id: requestId, controller }
    setSearching(true)
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, PLACE_SEARCH_TIMEOUT_MS)
    try {
      const data = await searchGeocode(q, { signal: controller.signal })
      if (activeSearchRef.current?.id !== requestId) return
      const hit = data.results[0]
      if (!hit) throw new Error(`No results for “${q}”.`)
      onSetPoint(hit.lat, hit.lon)
    } catch (e) {
      if (activeSearchRef.current?.id !== requestId) return
      setActionError(timedOut ? 'Place search timed out. Please try again.' : messageOf(e))
    } finally {
      window.clearTimeout(timeoutId)
      if (activeSearchRef.current?.id === requestId) {
        activeSearchRef.current = null
        setSearching(false)
      }
    }
  }

  function handleMyLocation() {
    searchRequestIdRef.current += 1
    const active = activeSearchRef.current
    activeSearchRef.current = null
    active?.controller.abort()
    setSearching(false)
    const requestId = ++geolocationRequestIdRef.current
    if (!('geolocation' in navigator)) {
      setActionError('Geolocation is not available in this browser.')
      return
    }
    setActionError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (geolocationRequestIdRef.current !== requestId) return
        setLocating(false)
        onSetPoint(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => {
        if (geolocationRequestIdRef.current !== requestId) return
        setLocating(false)
        setActionError(err.message || 'Could not determine your location.')
      },
      { timeout: 10_000 },
    )
  }

  async function exportPng() {
    if (!cardRef.current) return
    setActionError(null)
    setExporting('png')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0b1220', scale: 2 })
      const a = document.createElement('a')
      a.download = `hilalsight-report-${date}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch (e) {
      setActionError(messageOf(e))
    } finally {
      setExporting(null)
    }
  }

  async function exportPdf() {
    if (!cardRef.current) return
    setActionError(null)
    setExporting('pdf')
    try {
      const [{ default: html2canvas }, { default: JsPdf }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0b1220', scale: 2 })
      const img = canvas.toDataURL('image/png')
      const pdf = new JsPdf({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 36
      const availableW = pageW - margin * 2
      const availableH = pageH - margin * 2
      const ratio = Math.min(availableW / canvas.width, availableH / canvas.height)
      const w = canvas.width * ratio
      const h = canvas.height * ratio
      pdf.addImage(img, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
      pdf.save(`hilalsight-report-${date}.pdf`)
    } catch (e) {
      setActionError(messageOf(e))
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2 className="panelTitle">{title}</h2>
        <div className="panelSub">
          {placeSearchEnabled
            ? 'Click the map, search a city or “lat, lon”, or use your location.'
            : 'Click the map, enter “lat, lon”, or use your location.'}
        </div>
      </div>

      <div className="searchRow">
        <input
          className="input"
          placeholder={placeSearchEnabled ? 'City, country — or “21.4, 39.8”' : 'Coordinates — “21.4, 39.8”'}
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch().catch(() => {})
          }}
          aria-label={placeSearchEnabled ? 'Search a city or coordinates' : 'Enter coordinates'}
        />
        <button className="btn btnSmall" onClick={() => handleSearch().catch(() => {})} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        <button
          className="btn btnSmall btnGhost"
          onClick={handleMyLocation}
          disabled={locating}
          title="Use my current location"
        >
          {locating ? 'Locating…' : 'My location'}
        </button>
      </div>

      {placeSearchEnabled ? (
        <div className="help geocodeDisclosure">
          Typed place names are sent to Nominatim through HilalSight for search. Search data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors
          </a>
          ; powered by{' '}
          <a href="https://nominatim.org/" target="_blank" rel="noreferrer">
            Nominatim
          </a>
          .
        </div>
      ) : (
        <div className="help geocodeDisclosure">
          Hosted place-name search is disabled to respect public geocoder aggregate-use limits. Coordinate input stays
          within HilalSight.
        </div>
      )}

      {actionError ? (
        <div className="help warn searchStatus" role="alert">
          {actionError}
        </div>
      ) : null}

      {selected ? (
        <>
          <div className="reportCard" ref={cardRef}>
            <div className="reportTitle">Visibility Report Card</div>
            <div className="reportMeta">
              <div>
                Crescent-window base date: <span className="mono">{date}</span>
              </div>
              <div>
                Coordinates: <span className="mono">{selected.lat.toFixed(4)}</span>,{' '}
                <span className="mono">{selected.lon.toFixed(4)}</span>
              </div>
              {timezone ? <div>Local timezone: {timezone}</div> : null}
            </div>

            {evenings.map((d) => {
              const r = results[d]
              const err = errors[d]
              const isLoading = !err && (loading[d] === true || (!r && loading[d] == null))
              const label = err ? 'Request failed.' : r ? (CATEGORY_LABELS[r.category] ?? '—') : 'No data yet.'
              const civilDate = addDaysUtc(date, d)
              const moonset = r ? fmtLocalOrUtcClock(r.tmLocal, r.tmUtc, r.timezone, civilDate) : null
              const moonsetLabel = isLoading ? 'loading…' : err ? 'failed' : (moonset ?? 'unavailable')
              const moonsetTitle = err
                ? `Moonset request failed: ${err}`
                : `Moonset ${moonsetLabel}. ${MOONSET_HORIZON_NOTE}`
              return (
                <details className="eveningDetails" key={d} open={d === 0}>
                  <summary className="eveningSummary">
                    <div className="eveningSummaryLeft">
                      <span className="pill">
                        Day {d}{civilDate ? ` · ${fmtShortDateUtc(civilDate)}` : ''}
                      </span>
                      {isLoading ? <span className="pill">Computing…</span> : null}
                      {err ? (
                        <span className="pill pillBad" role="alert">
                          {err}
                        </span>
                      ) : null}
                      {r ? <span className="catBadge">{shortCode(r.category)}</span> : null}
                      <span className="eveningSummaryLabel">{label}</span>
                    </div>

                    <div className="eveningSummaryMetrics">
                      <span
                        className="eveningMoonsetMetric"
                        title={moonsetTitle}
                      >
                        Moonset {moonsetLabel}
                      </span>
                      {r ? (
                        <>
                          <span className="mono">Age {fmtNum(r.ageHours, 1)}h</span>
                          <span className="mono">Lag {fmtNum(r.lagMinutes, 0)}m</span>
                          <span className="mono">q {fmtNum(r.q, 3)}</span>
                        </>
                      ) : null}
                    </div>
                  </summary>

                  {r ? (
                    <div className="eveningBody">
                      <div className="eveningSummaryMethod">{r.method}</div>
                      <div className="grid2">
                        <div className="kv">
                          <div className="k">Ts (sunset)</div>
                          <div className="v mono">{fmtClock(r.tsLocal ?? r.tsUtc)}</div>
                        </div>
                        <div className="kv" title={MOONSET_HORIZON_NOTE}>
                          <div className="k">Tm (moonset)</div>
                          <div className="v mono">{moonset ?? 'Unavailable'}</div>
                        </div>
                        <div className="kv">
                          <div className="k">Tb (best time)</div>
                          <div className="v mono">{fmtClock(r.tbLocal ?? r.tbUtc)}</div>
                        </div>
                        <div className="kv">
                          <div className="k">Lag</div>
                          <div className="v">{fmtNum(r.lagMinutes, 0)} min</div>
                        </div>
                        <div className="kv">
                          <div className="k">Age at Tb</div>
                          <div className="v">{fmtNum(r.ageHours, 1)} h</div>
                        </div>
                        <div className="kv">
                          <div className="k">Moon alt @ Ts</div>
                          <div className="v">{fmtNum(r.moonAltSunsetDeg, 1)}°</div>
                        </div>
                        <div className="kv">
                          <div className="k">Moon alt @ Tb</div>
                          <div className="v">{fmtNum(r.moonAltBestDeg, 1)}°</div>
                        </div>
                        <div className="kv">
                          <div className="k">Elongation (ARCL)</div>
                          <div className="v">{fmtNum(r.arclDeg, 2)}°</div>
                        </div>
                        <div className="kv">
                          <div className="k">ARCV</div>
                          <div className="v">{fmtNum(r.arcvDeg, 2)}°</div>
                        </div>
                        <div className="kv">
                          <div className="k">DAZ</div>
                          <div className="v">{fmtNum(r.dazDeg, 1)}°</div>
                        </div>
                        <div className="kv">
                          <div className="k">W′ (crescent width)</div>
                          <div className="v">{fmtNum(r.wArcmin, 2)}′</div>
                        </div>
                        <div className="kv">
                          <div className="k">q</div>
                          <div className="v">{fmtNum(r.q, 3)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="eveningBody muted">{label}</div>
                  )}
                </details>
              )
            })}
          </div>

          <div className="exportRow">
            <button className="btn btnGhost" onClick={() => exportPng().catch(() => {})} disabled={exporting !== null}>
              {exporting === 'png' ? 'Exporting…' : 'Export PNG'}
            </button>
            <button className="btn btnGhost" onClick={() => exportPdf().catch(() => {})} disabled={exporting !== null}>
              {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </>
      ) : (
        <div className="locationEmpty" role="status">
          <div className="locationEmptyTitle">Choose a location</div>
          <div>Use the controls above or click anywhere on the map to generate a visibility report for the selected evenings.</div>
        </div>
      )}

      <div className="disclaimer">
        Visibility model only. Actual observation depends on weather, transparency, observer experience, optics, and
        local religious authority; this report does not confirm a sighting.
      </div>
    </div>
  )
}
