import type { HijriContextResponse, HijriMonth } from '../types'

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

function monthLabel(month: HijriMonth): string {
  return `${month.monthName} ${month.year} AH`
}

export function AppHeader(props: {
  context: HijriContextResponse | null
  loading: boolean
  error: string | null
}) {
  const { context, loading, error } = props
  const transition = context?.mode === 'transition' ? context.transition : null
  const stableMonth = context?.mode === 'stable' ? context.month : null

  return (
    <header className="header">
      <div className="brand">
        <CrescentIcon />
        <div>
          <h1 className="brandName">HilalSight</h1>
          <div className="brandTag">New crescent moon visibility projections · HMNAO / Yallop q-test</div>
        </div>
      </div>

      <div className="monthStrip" aria-live="polite" aria-busy={loading || undefined}>
        {transition ? (
          <div className="monthPill monthPillTransition">
            <div className="monthK">Hijri month transition</div>
            <div className="monthTransitionV">
              <span>
                <span className="monthRole">Leaving</span> {monthLabel(transition.leavingMonth)}
              </span>
              <span className="monthArrow" aria-hidden="true">
                →
              </span>
              <span>
                <span className="monthRole">Coming</span> {monthLabel(transition.enteringMonth)}
              </span>
            </div>
            <div className="monthNote">
              {error
                ? 'Reference transition refresh unavailable.'
                : loading
                  ? 'Refreshing reference transition…'
                  : 'Reference transition · local day varies'}
            </div>
          </div>
        ) : stableMonth ? (
          <div className="monthPill">
            <div className="monthK">Hijri month</div>
            <div className="monthV">{monthLabel(stableMonth)}</div>
            <div className="monthNote">
              {error
                ? 'Reference month refresh unavailable.'
                : loading
                  ? 'Refreshing reference month…'
                  : 'Reference month · local day varies'}
            </div>
          </div>
        ) : error ? (
          <div className="monthPill" title={error}>
            <div className="monthK">Hijri month</div>
            <div className="monthV muted">Unavailable</div>
            <div className="monthNote">Reference calendar could not be loaded.</div>
          </div>
        ) : (
          <div className="monthPill">
            <div className="monthK">Hijri month</div>
            <div className="monthV muted">Loading…</div>
            <div className="monthNote">Loading the local-date reference…</div>
          </div>
        )}
      </div>
    </header>
  )
}
