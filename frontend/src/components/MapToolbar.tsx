import type { MapResult, PointVisibility } from '../types'
import {
  fmtLocalOrUtcClock,
  fmtShortDateUtc,
  fmtUtcMinute,
  fmtWeekdayDateUtc,
  MOONSET_HORIZON_NOTE,
} from '../utils/format'

export function MapToolbar(props: {
  civilDate: string
  crescentWindowLabel: string
  evenings: number[]
  dayDates: string[]
  selectedDay: number
  onSelectDay: (d: number) => void
  hasSelectedPoint: boolean
  pointResults: Record<number, PointVisibility | undefined>
  pointLoading: Record<number, boolean | undefined>
  pointErrors: Record<number, string | undefined>
  map: MapResult | null
  mapStatusLabel: string
  exporting: boolean
  onExport: () => void
}) {
  const {
    civilDate,
    crescentWindowLabel,
    evenings,
    dayDates,
    selectedDay,
    onSelectDay,
    hasSelectedPoint,
    pointResults,
    pointLoading,
    pointErrors,
    map,
    mapStatusLabel,
    exporting,
    onExport,
  } = props

  return (
    <div className="mapHeader">
      <div className="mapHeaderLeft">
        <div>
          <h2 className="mapTitle">Global Visibility Map</h2>
          <div className="mapSubtitle">
            {crescentWindowLabel ? <>{crescentWindowLabel} · </> : null}Evening of{' '}
            <span className="mono">{civilDate || '—'}</span>
            {civilDate ? <span className="muted2"> · {fmtWeekdayDateUtc(civilDate)} (civil-date label)</span> : null}
          </div>
        </div>
        <div className="daySelector">
          <div className="seg segSmall daySeg" role="group" aria-label="Evening to display">
            {evenings.map((d) => {
              const result = pointResults[d]
              const pointError = pointErrors[d]
              const isPointLoading =
                hasSelectedPoint &&
                !pointError &&
                (pointLoading[d] === true || (!result && pointLoading[d] == null))
              const moonset = result
                ? fmtLocalOrUtcClock(result.tmLocal, result.tmUtc, result.timezone, dayDates[d])
                : null
              const moonsetLabel = isPointLoading
                ? 'Moonset loading…'
                : pointError
                  ? 'Moonset failed'
                  : moonset
                    ? `Moonset ${moonset}`
                    : 'Moonset unavailable'
              const moonsetTitle = pointError
                ? `Moonset request failed: ${pointError}`
                : `${moonsetLabel}. ${MOONSET_HORIZON_NOTE}`
              const shortDate = fmtShortDateUtc(dayDates[d] ?? '') || '—'

              return (
                <button
                  key={d}
                  className={d === selectedDay ? 'segBtn segBtnOn' : 'segBtn'}
                  aria-label={`Day ${d}, ${shortDate}${hasSelectedPoint ? `. ${moonsetLabel}` : ''}`}
                  aria-pressed={d === selectedDay}
                  aria-busy={isPointLoading || undefined}
                  title={hasSelectedPoint ? moonsetTitle : undefined}
                  onClick={() => onSelectDay(d)}
                >
                  <span className="segDay">Day {d}</span>
                  <span className="segDate">{shortDate}</span>
                  {hasSelectedPoint ? (
                    <span
                      className={
                        pointError
                          ? 'segMoonset segMoonsetError'
                          : isPointLoading
                            ? 'segMoonset segMoonsetLoading'
                            : 'segMoonset'
                      }
                    >
                      {moonsetLabel}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="daySelectorHint">
            {hasSelectedPoint ? MOONSET_HORIZON_NOTE : 'Choose a location for local moonset times.'}
          </div>
        </div>
      </div>

      <div className="mapHeaderRight">
        <div className="mapMeta">
          {map ? (
            <>
              <span className="pill" title="Astronomical new moon (conjunction) in UTC">
                Conjunction {fmtUtcMinute(map.conjunctionUtc)} UTC
              </span>
              <span className="pill" title="Astronomy model or ephemeris used for positions">
                {map.ephemeris.file}
              </span>
              <span className="pill">{map.resolution}° grid</span>
            </>
          ) : (
            <span className="pill">{mapStatusLabel}</span>
          )}
        </div>
        <button className="btn btnSmall" onClick={onExport} disabled={!map || exporting}>
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>
    </div>
  )
}
