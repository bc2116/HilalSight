import type { HijriTodayResponse } from '../types'

function CrescentIcon() {
  return (
    <svg className="brandIcon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <mask id="crescent-mask">
          <rect width="32" height="32" fill="white" />
          <circle cx="20.5" cy="12.5" r="10.5" fill="black" />
        </mask>
      </defs>
      <circle cx="15" cy="17" r="12" fill="currentColor" mask="url(#crescent-mask)" />
    </svg>
  )
}

export function AppHeader(props: { hijri: HijriTodayResponse | null }) {
  const { hijri } = props
  return (
    <header className="header">
      <div className="brand">
        <CrescentIcon />
        <div>
          <h1 className="brandName">HilalSight</h1>
          <div className="brandTag">New crescent moon visibility projections · HMNAO / Yallop q-test</div>
        </div>
      </div>

      <div className="monthStrip">
        {hijri ? (
          <>
            <div className="monthPill">
              <div className="monthK">Today (Hijri)</div>
              <div className="monthV">
                {hijri.hijri.monthName} {hijri.hijri.year} AH
              </div>
            </div>
            <div className="monthPill">
              <div className="monthK">Next month</div>
              <div className="monthV">
                {hijri.nextHijriMonth.monthName} {hijri.nextHijriMonth.year} AH
              </div>
            </div>
          </>
        ) : (
          <div className="monthPill">
            <div className="monthK">Hijri calendar</div>
            <div className="monthV muted">Loading…</div>
          </div>
        )}
      </div>
    </header>
  )
}
