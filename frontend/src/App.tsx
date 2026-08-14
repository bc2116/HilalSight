import { useEffect, useMemo, useRef, useState } from 'react'

import { AppHeader } from './components/AppHeader'
import { Legend } from './components/Legend'
import { MapToolbar } from './components/MapToolbar'
import { PointDetails } from './components/PointDetails'
import { ProjectionSettings } from './components/ProjectionSettings'
import { VisibilityMap } from './components/VisibilityMap'
import { useCacheWarm } from './hooks/useCacheWarm'
import { useHijriProjection } from './hooks/useHijriProjection'
import { usePointVisibility } from './hooks/usePointVisibility'
import { useVisibilityMaps } from './hooks/useVisibilityMaps'
import { addDaysUtc, messageOf } from './utils/format'
import { computeFirstVisibilityMarker } from './utils/markers'

function App({ hosted = false }: { hosted?: boolean }) {
  const hijriProjection = useHijriProjection()
  const { dateLabel, setDateLabel } = hijriProjection

  const [selectedDay, setSelectedDay] = useState(0)
  const [eveningsCount, setEveningsCount] = useState(3)
  const [resolution, setResolution] = useState(2.0)
  const [nakedThreshold, setNakedThreshold] = useState<'A' | 'B'>('B')
  const [opticalThreshold, setOpticalThreshold] = useState<'C' | 'D'>('D')
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [exportingMap, setExportingMap] = useState(false)

  const mapExportRef = useRef<HTMLDivElement | null>(null)

  const evenings = useMemo(() => Array.from({ length: eveningsCount }, (_, i) => i), [eveningsCount])
  const effectiveSelectedDay = Math.min(selectedDay, Math.max(0, eveningsCount - 1))

  const { maps, loading: mapLoading, error: mapError, retry: retryMaps } = useVisibilityMaps(
    dateLabel,
    evenings,
    resolution,
    effectiveSelectedDay,
  )
  const point = usePointVisibility(dateLabel, evenings, selectedPoint)
  const warm = useCacheWarm(!hosted)

  const currentMap = maps[effectiveSelectedDay] ?? null
  const dayDates = useMemo(() => evenings.map((d) => addDaysUtc(dateLabel, d)), [dateLabel, evenings])

  const derivedMarkers = useMemo(() => {
    if (!currentMap) return null
    return {
      firstNakedEye: computeFirstVisibilityMarker(currentMap, nakedThreshold),
      firstOpticalAid: computeFirstVisibilityMarker(currentMap, opticalThreshold),
    }
  }, [currentMap, nakedThreshold, opticalThreshold])

  // Keep the selected day within range when the user lowers the evening count.
  useEffect(() => {
    if (selectedDay >= eveningsCount) setSelectedDay(Math.max(0, eveningsCount - 1))
  }, [eveningsCount, selectedDay])

  async function applyHijriPick() {
    const ok = await hijriProjection.applyHijriPick()
    if (ok) setSelectedDay(0)
  }

  async function exportMapPng() {
    if (!mapExportRef.current) return
    setExportingMap(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(mapExportRef.current, { backgroundColor: '#0b1220', scale: 2 })
      const a = document.createElement('a')
      a.download = `hilalsight-map-${dateLabel}-day${effectiveSelectedDay}-res${resolution}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } finally {
      setExportingMap(false)
    }
  }

  const initError = !dateLabel && hijriProjection.error ? hijriProjection.error : null

  return (
    <div className="app">
      <AppHeader hijri={hijriProjection.hijri} />

      <div className="layout">
        <main className="main mapTop">
          <MapToolbar
            civilDate={dayDates[effectiveSelectedDay] ?? ''}
            evenings={evenings}
            dayDates={dayDates}
            selectedDay={effectiveSelectedDay}
            onSelectDay={setSelectedDay}
            hasSelectedPoint={selectedPoint !== null}
            pointResults={point.results}
            pointLoading={point.loading}
            pointErrors={point.errors}
            map={currentMap}
            exporting={exportingMap}
            onExport={() => exportMapPng().catch((e) => alert(messageOf(e)))}
          />

          <div className="mapCard" ref={mapExportRef}>
            <VisibilityMap
              map={currentMap}
              markers={derivedMarkers}
              selected={selectedPoint}
              loading={!!mapLoading[effectiveSelectedDay]}
              error={!currentMap && !mapLoading[effectiveSelectedDay] ? mapError : null}
              onRetry={retryMaps}
              onPickPoint={(lat, lon) => setSelectedPoint({ lat, lon })}
            />
            <div className="mapLegendOverlay">
              <Legend
                markers={derivedMarkers ?? undefined}
                nakedThreshold={nakedThreshold}
                opticalThreshold={opticalThreshold}
              />
            </div>
          </div>

          {initError ? (
            <div className="error" role="alert">
              Could not initialize HilalSight: {initError}
            </div>
          ) : null}
          {mapError && currentMap ? (
            <div className="error" role="alert">
              {mapError}
            </div>
          ) : null}

          <div className="footnote">
            Best time <span className="mono">Tb = Ts + (4/9)·Lag</span>, Lag = Tm − Ts. Crescent classification via
            HMNAO / Yallop (1997) q-test. Hover the map to read q at any location.
          </div>
        </main>

        <aside className="sidebar">
          <ProjectionSettings
            hosted={hosted}
            pickMonth={hijriProjection.pickMonth}
            pickYear={hijriProjection.pickYear}
            onPickMonth={hijriProjection.setPickMonth}
            onPickYear={hijriProjection.setPickYear}
            onApplyHijri={() => applyHijriPick().catch(() => {})}
            applyingHijri={hijriProjection.applying}
            hijriError={dateLabel ? hijriProjection.error : null}
            dateLabel={dateLabel}
            onDateLabel={setDateLabel}
            eveningsCount={eveningsCount}
            onEveningsCount={setEveningsCount}
            resolution={resolution}
            onResolution={setResolution}
            nakedThreshold={nakedThreshold}
            onNakedThreshold={setNakedThreshold}
            opticalThreshold={opticalThreshold}
            onOpticalThreshold={setOpticalThreshold}
            warmStatus={warm.status}
            warmBusy={warm.busy}
            warmError={warm.error}
            onWarmCache={(monthsAhead) =>
              warm
                .start({
                  monthsAhead,
                  evenings: eveningsCount as 1 | 2 | 3,
                  resolution: resolution >= 5 ? 5 : 2,
                })
                .catch(() => {})
            }
          />
        </aside>

        <aside className="details">
          <PointDetails
            date={dateLabel || '—'}
            placeSearchEnabled={!hosted}
            selected={selectedPoint}
            evenings={evenings}
            results={point.results}
            loading={point.loading}
            errors={point.errors}
            onSetPoint={(lat, lon) => setSelectedPoint({ lat, lon })}
          />
        </aside>
      </div>

      <footer className="footer">
        <div>
          Deterministic Hijri conversion: <span className="mono">{hijriProjection.hijri?.calendar ?? '—'}</span>. This is
          an astronomical projection; official month starts may differ.
        </div>
        <div>
          <a href="https://github.com/bc2116/HilalSight" target="_blank" rel="noreferrer">Source</a>
          {' · '}
          <a href="https://github.com/bc2116/HilalSight/blob/main/LICENSE" target="_blank" rel="noreferrer">
            AGPL-3.0-only
          </a>
          {' · '}Copyright © 2026 bc2116 and contributors · provided without warranty.
        </div>
      </footer>
    </div>
  )
}

export default App
