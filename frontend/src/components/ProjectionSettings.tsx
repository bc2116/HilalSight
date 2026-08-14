import { useState } from 'react'

import { useMediaQuery } from '../hooks/useMediaQuery'
import type { CacheWarmStatus } from '../types'

const HIJRI_MONTHS = [
  { value: 1, label: 'Muharram' },
  { value: 2, label: 'Safar' },
  { value: 3, label: 'Rabi al-Awwal' },
  { value: 4, label: 'Rabi al-Thani' },
  { value: 5, label: 'Jumada al-Awwal' },
  { value: 6, label: 'Jumada al-Thani' },
  { value: 7, label: 'Rajab' },
  { value: 8, label: "Sha'ban" },
  { value: 9, label: 'Ramadan' },
  { value: 10, label: 'Shawwal' },
  { value: 11, label: "Dhu al-Qi'dah" },
  { value: 12, label: 'Dhu al-Hijjah' },
]

const HIJRI_YEAR_MIN = 1400
const HIJRI_YEAR_MAX = 1472
const HIJRI_YEARS = Array.from({ length: HIJRI_YEAR_MAX - HIJRI_YEAR_MIN + 1 }, (_, i) => HIJRI_YEAR_MIN + i)
const CIVIL_DATE_MIN = '1900-01-01'
const CIVIL_DATE_MAX = '2050-12-31'

function warmStatusText(status: CacheWarmStatus | null): string {
  if (!status?.job) return 'Precomputes upcoming months in the background to reduce future wait time.'
  if (status.running) {
    const j = status.job
    return `Warming ${j.doneMaps}/${j.totalMaps} maps… ${j.current ?? ''}`
  }
  if (status.job.status === 'done') return `Cache warm complete: ${status.job.totalMaps} maps`
  if (status.job.status === 'error') return `Cache warm error: ${status.job.error ?? 'unknown'}`
  return 'Precomputes upcoming months in the background to reduce future wait time.'
}

export function ProjectionSettings(props: {
  hosted?: boolean
  pickMonth: number | null
  pickYear: number | null
  onPickMonth: (m: number) => void
  onPickYear: (y: number) => void
  onApplyHijri: () => void
  applyingHijri: boolean
  hijriError: string | null
  defaultWindowLabel: string

  dateLabel: string
  onDateLabel: (v: string) => void

  eveningsCount: number
  onEveningsCount: (n: number) => void

  resolution: number
  onResolution: (r: number) => void

  nakedThreshold: 'A' | 'B'
  onNakedThreshold: (v: 'A' | 'B') => void
  opticalThreshold: 'C' | 'D'
  onOpticalThreshold: (v: 'C' | 'D') => void

  warmStatus: CacheWarmStatus | null
  warmBusy: boolean
  warmError: string | null
  onWarmCache: (monthsAhead: 3 | 6 | 12) => void
}) {
  const [warmMonthsAhead, setWarmMonthsAhead] = useState<3 | 6 | 12>(6)
  const compact = useMediaQuery('(max-width: 760px)')
  const [openByMode, setOpenByMode] = useState({ compact: false, wide: true })
  const open = compact ? openByMode.compact : openByMode.wide

  return (
    <details
      className="panel settingsPanel"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open
        const mode = compact ? 'compact' : 'wide'
        setOpenByMode((current) => (current[mode] === next ? current : { ...current, [mode]: next }))
      }}
    >
      <summary className="panelSummary">
        <span>
          <span className="panelTitle">Projection Settings</span>
          <span className="panelSub">{props.defaultWindowLabel}</span>
        </span>
      </summary>

      <div className="form settingsBody">
        <div className="field">
          <span className="label">Jump to a Hijri month</span>
          <div className="row hijriPickerRow">
            <select
              className="input"
              value={props.pickMonth ?? ''}
              onChange={(e) => props.onPickMonth(Number(e.target.value))}
              aria-label="Hijri month"
            >
              <option value="" disabled>
                Month…
              </option>
              {HIJRI_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              className="input inputYear"
              value={props.pickYear ?? ''}
              onChange={(e) => props.onPickYear(Number(e.target.value))}
              aria-label="Hijri year (AH)"
            >
              <option value="" disabled>
                Year…
              </option>
              {HIJRI_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              className="btn btnSmall"
              onClick={props.onApplyHijri}
              disabled={props.applyingHijri || !props.pickYear || !props.pickMonth}
              title="Show the crescent window for the selected Hijri month"
            >
              {props.applyingHijri ? 'Loading…' : 'Show window'}
            </button>
          </div>
          {props.hijriError ? (
            <div className="help warn" role="alert">
              {props.hijriError}
            </div>
          ) : null}
        </div>

        <label className="field">
          <span className="label">Crescent-window base date (civil date)</span>
          <input
            className="input"
            type="date"
            min={CIVIL_DATE_MIN}
            max={CIVIL_DATE_MAX}
            value={props.dateLabel}
            onChange={(e) => props.onDateLabel(e.target.value)}
          />
          <div className="help">
            Evenings are evaluated at local sunset on this civil date and the next 1–2 days, not by UTC midnight.
          </div>
        </label>

        <label className="field">
          <span className="label">Evenings to generate</span>
          <div className="row">
            <input
              className="range"
              type="range"
              min={1}
              max={3}
              value={props.eveningsCount}
              onChange={(e) => props.onEveningsCount(Number(e.target.value))}
            />
            <span className="pill">{props.eveningsCount}</span>
          </div>
        </label>

        <label className="field">
          <span className="label">Grid resolution</span>
          <select className="input" value={props.resolution} onChange={(e) => props.onResolution(Number(e.target.value))}>
            <option value={5}>5° (fast)</option>
            <option value={2}>2° (default)</option>
            {!props.hosted ? <option value={1}>1° (slower)</option> : null}
            {!props.hosted ? <option value={0.5}>0.5° (slow)</option> : null}
          </select>
          {props.hosted ? (
            <div className="help">Hosted maps use web-friendly 2° and 5° grids; the local app also supports research-detail grids.</div>
          ) : props.resolution < 2 ? (
            <div className="help warn">
              Higher resolution grids can take time to compute. Results are cached on disk by the backend.
            </div>
          ) : null}
        </label>

        <div className="field">
          <span className="label">First visibility marker thresholds</span>
          <div className="grid2tight">
            <label className="subfield">
              <span className="sublabel">Naked eye</span>
              <select
                className="input"
                value={props.nakedThreshold}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'A' || v === 'B') props.onNakedThreshold(v)
                }}
              >
                <option value="B">B or better (recommended)</option>
                <option value="A">A only</option>
              </select>
            </label>
            <label className="subfield">
              <span className="sublabel">Optical aid</span>
              <select
                className="input"
                value={props.opticalThreshold}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'C' || v === 'D') props.onOpticalThreshold(v)
                }}
              >
                <option value="D">D or better (recommended)</option>
                <option value="C">C or better</option>
              </select>
            </label>
          </div>
        </div>

        {!props.hosted ? (
          <div className="field">
            <span className="label">Precompute upcoming maps (optional)</span>
            <div className="row">
              <select
                className="input inputInline"
                value={warmMonthsAhead}
                onChange={(e) => setWarmMonthsAhead(Number(e.target.value) as 3 | 6 | 12)}
              >
                <option value={3}>3 months ahead</option>
                <option value={6}>6 months ahead</option>
                <option value={12}>12 months ahead</option>
              </select>
              <button
                className="btn btnSmall"
                onClick={() => props.onWarmCache(warmMonthsAhead)}
                disabled={props.warmBusy || !!props.warmStatus?.running}
              >
                {props.warmStatus?.running ? 'Warming…' : 'Warm cache'}
              </button>
            </div>
            <div className="help" role="status">
              {warmStatusText(props.warmStatus)}
            </div>
            {props.warmError ? (
              <div className="help warn" role="alert">
                {props.warmError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  )
}
