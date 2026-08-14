import { useState } from 'react'

import type { Marker } from '../types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { CATEGORY_COLORS, CATEGORY_LABELS_SHORT, cssColor, shortCode } from '../utils/colors'
import { fmtLatLon } from '../utils/format'

const LEGEND_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'MOON_SET_BEFORE_SUN', 'PRIOR_CONJUNCTION']

function MarkerLine(props: { kind: 'naked' | 'optical'; threshold: string; marker: Marker | null }) {
  const { kind, threshold, marker } = props
  return (
    <div className="markerRow">
      <span className={kind === 'naked' ? 'markerDot markerDotNaked' : 'markerDot markerDotOptical'} />
      <span>
        {kind === 'naked' ? 'Naked eye' : 'Optical aid'} (≥{threshold}):{' '}
        {marker ? `${marker.age_hours.toFixed(1)}h at ${fmtLatLon(marker.lat, marker.lon, 1)}` : 'none on grid'}
      </span>
    </div>
  )
}

export function Legend(props: {
  markers?: { firstNakedEye: Marker | null; firstOpticalAid: Marker | null }
  nakedThreshold?: 'A' | 'B'
  opticalThreshold?: 'C' | 'D'
}) {
  const { markers, nakedThreshold = 'B', opticalThreshold = 'D' } = props
  const compact = useMediaQuery('(max-width: 760px)')
  const [openByMode, setOpenByMode] = useState({ compact: false, wide: true })
  const open = compact ? openByMode.compact : openByMode.wide

  return (
    <details
      className="legend"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open
        const mode = compact ? 'compact' : 'wide'
        setOpenByMode((current) => (current[mode] === next ? current : { ...current, [mode]: next }))
      }}
    >
      <summary className="legendSummary">Legend</summary>
      <div className="legendBody">
        <div className="legendGrid">
          {LEGEND_CODES.map((code) => (
            <div className="legendRow" key={code}>
              <span className="legendSwatch" style={{ background: cssColor(CATEGORY_COLORS[code]) }} />
              <span className="legendCode">{shortCode(code)}</span>
              <span className="legendLabel">{CATEGORY_LABELS_SHORT[code] ?? '—'}</span>
            </div>
          ))}
        </div>

        {markers ? (
          <div className="legendMarkers">
            <div className="legendMarkersTitle">First visibility</div>
            <MarkerLine kind="naked" threshold={nakedThreshold} marker={markers.firstNakedEye} />
            <MarkerLine kind="optical" threshold={opticalThreshold} marker={markers.firstOpticalAid} />
          </div>
        ) : null}
      </div>
    </details>
  )
}
