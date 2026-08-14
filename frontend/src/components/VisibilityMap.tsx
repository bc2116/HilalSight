import { contours } from 'd3-contour'
import { geoGraticule10, geoPath } from 'd3-geo'
import { geoWinkel3 } from 'd3-geo-projection'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'

import worldData from 'world-atlas/countries-110m.json'

import type { MapResult, Marker } from '../types'
import { CATEGORY_COLORS, CATEGORY_LABELS_SHORT, cssColor, mix, shortCode } from '../utils/colors'
import { fmtLatLon, fmtNum } from '../utils/format'
import { categoryFromQ, clampLat, gridIndex, sampleBilinear, wrapLon } from '../utils/grid'

type Position = [number, number]
type LinearRing = Position[]
type Polygon = LinearRing[]
type MultiPolygon = Polygon[]

type ContourLike = { value: number; coordinates: MultiPolygon }

type GeoJsonFeature = {
  type: 'Feature'
  properties: { value: number }
  geometry: { type: 'MultiPolygon'; coordinates: MultiPolygon }
}

const SPHERE = { type: 'Sphere' } as const

type WorldTopo = {
  type: string
  objects: Record<string, unknown>
  arcs: unknown
  bbox?: number[]
  transform?: unknown
}

type HoverInfo = {
  x: number
  y: number
  lat: number
  lon: number
  code: string
  q: number | null
  age: number | null
}

function makeProjection(width: number, height: number) {
  const proj = geoWinkel3()
  // Center the map on the continental U.S. for the primary user base.
  // Rotation is [lambda, phi, gamma]; positive lambda moves the map center westward.
  proj.rotate([98, 0, 0])
  proj.fitSize([width, height], SPHERE)
  return proj
}

function computeContours(map: MapResult) {
  const values = new Float32Array(map.nLat * map.nLon)
  for (let i = 0; i < values.length; i++) {
    const v = map.ageHours[i]
    values[i] = v == null ? -999 : v
  }
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v > -900 && v > max) max = v
  }
  if (!isFinite(max)) max = 0
  const step = 2
  const levels: number[] = []
  for (let t = 2; t <= Math.min(40, Math.ceil(max)); t += step) levels.push(t)

  const gen = contours().size([map.nLon, map.nLat]).thresholds(levels)
  return gen(values)
}

function asGeoJsonFromContour(map: MapResult, c: ContourLike): GeoJsonFeature {
  const coordinates: MultiPolygon = c.coordinates.map((poly) =>
    poly.map((ring) =>
      ring.map(([x, y]: [number, number]) => {
        const lon = map.lon0 + x * map.resolution
        const lat = map.lat0 - y * map.resolution
        return [lon, lat]
      }),
    ),
  )
  return {
    type: 'Feature',
    properties: { value: c.value },
    geometry: { type: 'MultiPolygon', coordinates },
  }
}

function isSpecialCell(map: MapResult, idx: number): boolean {
  return (
    map.overlays.moonSetsBeforeSun[idx] ||
    map.overlays.priorConjunction[idx] ||
    map.overlays.noSunset[idx] ||
    map.overlays.noMoonset[idx]
  )
}

/** Category/q/age at a location, using the same q-smoothing as the raster. */
function readCell(map: MapResult, lat: number, lon: number): { code: string; q: number | null; age: number | null } | null {
  const idx = gridIndex(map, lat, lon)
  if (idx == null) return null
  let code = map.categories[idx]
  let q = map.qValues?.[idx] ?? null
  if (!isSpecialCell(map, idx) && map.qValues?.length === map.categories.length) {
    const qs = sampleBilinear(map, map.qValues, lat, lon)
    if (qs != null && isFinite(qs)) {
      q = qs
      code = categoryFromQ(qs)
    }
  }
  return { code, q, age: map.ageHours[idx] ?? null }
}

export function VisibilityMap(props: {
  map: MapResult | null
  markers: { firstNakedEye: Marker | null; firstOpticalAid: Marker | null } | null
  selected: { lat: number; lon: number } | null
  loading?: boolean
  error?: string | null
  emptyMessage?: string | null
  onRetry?: () => void
  onPickPoint: (lat: number, lon: number) => void
}) {
  const { map, markers, selected, loading = false, error = null, emptyMessage = null, onRetry, onPickPoint } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ w: 800, h: 520 })
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const landFeature = useMemo(() => {
    const topo = worldData as unknown as WorldTopo
    const objKey = Object.keys(topo.objects)[0] ?? 'countries'
    return feature(topo, topo.objects[objKey])
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setSize({ w: Math.max(1, Math.floor(cr.width)), h: Math.max(280, Math.floor(cr.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const projection = useMemo(() => makeProjection(size.w, size.h), [size.w, size.h])

  /** Screen position → geo coordinates, with a round-trip check so clicks outside the globe are ignored. */
  function locate(e: React.MouseEvent): { x: number; y: number; lat: number; lon: number } | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const ll = projection.invert?.([x, y]) as [number, number] | null | undefined
    if (!ll) return null
    const [lonRaw, latRaw] = ll
    if (!isFinite(latRaw) || !isFinite(lonRaw)) return null
    const lat = clampLat(latRaw)
    const lon = wrapLon(lonRaw)
    const back = projection([lon, lat]) as [number, number] | null
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 2) return null
    return { x, y, lat, lon }
  }

  // Base layer: background, visibility raster, isolines, land, graticule. Expensive — only on data/size change.
  useEffect(() => {
    const canvas = baseCanvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    // Background
    const g = ctx.createLinearGradient(0, 0, size.w, size.h)
    g.addColorStop(0, '#0b1220')
    g.addColorStop(0.55, '#0a2330')
    g.addColorStop(1, '#0b1220')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size.w, size.h)

    // Subtle vignette
    const vg = ctx.createRadialGradient(size.w / 2, size.h / 2, 10, size.w / 2, size.h / 2, Math.max(size.w, size.h) / 1.2)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, size.w, size.h)

    const path = geoPath(projection, ctx)

    // Globe outline
    ctx.beginPath()
    path(SPHERE)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Raster visibility overlay
    if (map) {
      // Render at near-native internal resolution and classify from interpolated q
      // to avoid blocky cell boundaries and better match published visibility arcs.
      const rasterScale = 0.9
      const rw = Math.max(1, Math.floor(size.w * rasterScale))
      const rh = Math.max(1, Math.floor(size.h * rasterScale))
      const img = ctx.createImageData(rw, rh)
      const data = img.data

      // Overall opacity for the visibility shading.
      const alphaMul = 0.56

      for (let ry = 0; ry < rh; ry++) {
        const y = (ry + 0.5) * (size.h / rh)
        for (let rx = 0; rx < rw; rx++) {
          const x = (rx + 0.5) * (size.w / rw)
          const ll = projection.invert([x, y]) as [number, number] | null
          const baseIndex = (ry * rw + rx) * 4
          if (!ll) {
            data[baseIndex + 3] = 0
            continue
          }
          const [lon, lat] = ll
          const idx = gridIndex(map, lat, lon)
          if (idx == null) {
            data[baseIndex + 3] = 0
            continue
          }

          const isMoonSetBeforeSun = map.overlays.moonSetsBeforeSun[idx]
          const isPriorConjunction = map.overlays.priorConjunction[idx]

          let code = map.categories[idx]
          const isSpecial = isSpecialCell(map, idx)

          if (!isSpecial && map.qValues?.length === map.categories.length) {
            const q = sampleBilinear(map, map.qValues, lat, lon)
            if (q != null && isFinite(q)) code = categoryFromQ(q)
          }

          let rgba = CATEGORY_COLORS[code] ?? ([80, 80, 90, 255] as [number, number, number, number])

          // Overlay patterns (subtle hatch)
          if (isMoonSetBeforeSun) {
            const stripe = (Math.floor(x) + Math.floor(y)) % 22 < 2
            if (stripe) rgba = mix(rgba, [240, 248, 255, rgba[3]], 0.25)
          }
          if (isPriorConjunction) {
            const hatch = ((((Math.floor(x) - Math.floor(y)) % 26) + 26) % 26) < 2
            if (hatch) rgba = mix(rgba, [10, 10, 10, rgba[3]], 0.18)
          }

          const a = Math.max(0, Math.min(255, Math.round(rgba[3] * alphaMul)))
          data[baseIndex + 0] = rgba[0]
          data[baseIndex + 1] = rgba[1]
          data[baseIndex + 2] = rgba[2]
          data[baseIndex + 3] = a
        }
      }

      // Clip to sphere
      ctx.save()
      ctx.beginPath()
      path(SPHERE)
      ctx.clip()
      // `putImageData` ignores the current transform. On HiDPI displays we scale the
      // canvas via `setTransform(dpr, ...)`, which would cause the raster to render
      // at the wrong size/position. Draw via an offscreen canvas so the raster is
      // affected by the DPR transform like the rest of the map.
      const raster = document.createElement('canvas')
      raster.width = rw
      raster.height = rh
      const rctx = raster.getContext('2d')
      if (rctx) {
        rctx.putImageData(img, 0, 0)
        const prevSmoothing = ctx.imageSmoothingEnabled
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(raster, 0, 0, size.w, size.h)
        ctx.imageSmoothingEnabled = prevSmoothing
      } else {
        ctx.putImageData(img, 0, 0)
      }
      ctx.restore()

      // Age isolines
      const cs = computeContours(map)
      ctx.save()
      ctx.beginPath()
      path(SPHERE)
      ctx.clip()
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 0.7
      ctx.setLineDash([3, 3])
      for (const c of cs) {
        const gj = asGeoJsonFromContour(map, c as unknown as ContourLike)
        ctx.beginPath()
        path(gj)
        ctx.stroke()
      }
      ctx.restore()
      ctx.setLineDash([])
    }

    // Land outlines on top
    ctx.save()
    ctx.beginPath()
    path(SPHERE)
    ctx.clip()
    ctx.beginPath()
    path(landFeature)
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.fill()
    // Double-stroke for clearer coastlines/borders on a dark background.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1.25
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'
    ctx.lineWidth = 0.75
    ctx.stroke()
    ctx.restore()

    // Graticule
    ctx.save()
    ctx.beginPath()
    path(SPHERE)
    ctx.clip()
    ctx.beginPath()
    path(geoGraticule10())
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 0.55
    ctx.stroke()
    ctx.restore()
  }, [landFeature, map, projection, size.h, size.w])

  // Overlay layer: first-visibility markers and the selected point. Cheap — redraws on every selection.
  useEffect(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const project = (lat: number, lon: number): [number, number] | null =>
      (projection([lon, lat]) as [number, number] | null) ?? null

    if (map && markers) {
      const drawMarker = (m: Marker | null, stroke: string) => {
        if (!m) return
        const p = project(m.lat, m.lon)
        if (!p) return
        ctx.beginPath()
        ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.fill()
        ctx.strokeStyle = stroke
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      drawMarker(markers.firstOpticalAid, 'rgba(255,140,0,0.95)')
      drawMarker(markers.firstNakedEye, 'rgba(65,214,101,0.95)')
    }

    if (selected) {
      const p = project(selected.lat, selected.lon)
      if (p) {
        const [x, y] = p
        // Dark halo for contrast, then a white ring with a center dot.
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 4
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.fill()
      }
    }
  }, [map, markers, projection, selected, size.h, size.w])

  const hoverLeft = hover ? Math.max(8, Math.min(hover.x + 14, size.w - 208)) : 0
  const hoverTop = hover ? Math.max(8, Math.min(hover.y + 14, size.h - 76)) : 0

  return (
    <div
      className="mapWrap"
      ref={containerRef}
      onClick={(e) => {
        const at = locate(e)
        if (at) onPickPoint(at.lat, at.lon)
      }}
      onPointerMove={(e) => {
        if (!map) return
        const at = locate(e)
        if (!at) {
          setHover(null)
          return
        }
        const cell = readCell(map, at.lat, at.lon)
        setHover(cell ? { ...at, ...cell } : null)
      }}
      onPointerLeave={() => setHover(null)}
    >
      <canvas
        ref={baseCanvasRef}
        className="mapCanvas"
        role="img"
        aria-label="Global crescent visibility map. Use the location search to inspect a point; pointer users can also select a point on the map."
      />
      <canvas ref={overlayCanvasRef} className="mapOverlayCanvas" aria-hidden="true" />

      {hover && map ? (
        <div className="mapHover" style={{ left: hoverLeft, top: hoverTop }}>
          <div className="mapHoverCoords mono">{fmtLatLon(hover.lat, hover.lon, 1)}</div>
          <div className="mapHoverCat">
            <span className="mapHoverSwatch" style={{ background: cssColor(CATEGORY_COLORS[hover.code]) }} />
            <span className="mapHoverCode">{shortCode(hover.code)}</span>
            {CATEGORY_LABELS_SHORT[hover.code] ?? '—'}
          </div>
          {hover.q != null || hover.age != null ? (
            <div className="mapHoverQ mono">
              {hover.q != null ? `q ${fmtNum(hover.q, 3)}` : ''}
              {hover.q != null && hover.age != null ? ' · ' : ''}
              {hover.age != null ? `${fmtNum(hover.age, 1)}h old` : ''}
            </div>
          ) : null}
        </div>
      ) : null}

      {!map && error ? (
        <div className="mapVeil mapErrorVeil" role="alert">
          <span>Could not load the visibility grid: {error}</span>
          {onRetry ? (
            <button
              className="btn btnSmall"
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRetry()
              }}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : !map && emptyMessage ? (
        <div className="mapVeil" role="status">
          {emptyMessage}
        </div>
      ) : !map ? (
        <div className="mapVeil" role="status">
          <span className="spinner" aria-hidden="true" />
          Computing visibility grid…
        </div>
      ) : loading ? (
        <div className="mapUpdating" role="status">
          <span className="spinner" aria-hidden="true" />
          Updating…
        </div>
      ) : null}
    </div>
  )
}
