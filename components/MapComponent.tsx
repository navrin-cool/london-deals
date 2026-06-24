'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Venue, DayOfWeek, SearchResult } from '@/types'

const HAGGERSTON = { lat: 51.5393, lng: -0.0762 }
const DEFAULT_ZOOM = 15
const NEARBY_MIN_ZOOM = 13

function initIcons() {
  // eslint-disable-next-line
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

// Three marker states
type MarkerState = 'highlighted' | 'has-deals' | 'no-deals' | 'nearby'

function pinIcon(state: MarkerState, type: string) {
  const emoji = type === 'restaurant' ? '🍽️' : '🍺'
  let bg: string, size: number, alpha: number, ring: string, glow: string

  switch (state) {
    case 'highlighted':
      bg = '#f59e0b'; size = 42; alpha = 1
      ring = '2.5px solid rgba(255,255,255,0.95)'
      glow = '0 0 0 3px rgba(245,158,11,0.35), 0 3px 10px rgba(0,0,0,0.4)'
      break
    case 'has-deals':
      bg = '#92400e'; size = 34; alpha = 0.85
      ring = '2px solid rgba(255,255,255,0.7)'
      glow = '0 2px 6px rgba(0,0,0,0.3)'
      break
    case 'no-deals':
      bg = '#57534e'; size = 30; alpha = 0.75
      ring = '1.5px solid rgba(255,255,255,0.5)'
      glow = '0 1px 4px rgba(0,0,0,0.25)'
      break
    case 'nearby':
    default:
      bg = '#a8a29e'; size = 30; alpha = 0.6
      ring = '1.5px solid rgba(255,255,255,0.5)'
      glow = '0 1px 4px rgba(0,0,0,0.2)'
  }

  const fs = Math.round(size * 0.43)
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      width:${size}px;height:${size}px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      border:${ring};
      box-shadow:${glow};
      opacity:${alpha};
      cursor:pointer;
    "><span style="transform:rotate(45deg);font-size:${fs}px;line-height:1;">${emoji}</span></div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

function focusIcon(type: string) {
  const emoji = type === 'restaurant' ? '🍽️' : '🍺'
  return L.divIcon({
    className: '',
    html: `<div class="ld-focus-pulse" style="
      background:#2563eb;width:46px;height:46px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      border:3px solid white;
      box-shadow:0 4px 18px rgba(37,99,235,0.55);
    "><span style="font-size:22px;">${emoji}</span></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -30],
  })
}

function tip(html: string) {
  return { permanent: false as const, direction: 'top' as const, className: 'ld-tooltip', offset: [0, -6] as [number, number] }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Props {
  venues: Venue[]
  focusVenue: SearchResult | null
  selectedDay: DayOfWeek | 'all'
  onVenueClick: (venue: Venue) => void
  onNearbyClick: (venue: SearchResult) => void
  pinDropMode: boolean
  onCenterChange: (lat: number, lng: number) => void
  onPinDropped: (lat: number, lng: number) => void
  onNearbyUpdate?: (venues: SearchResult[]) => void
}

export default function MapComponent({ venues, focusVenue, selectedDay, onVenueClick, onNearbyClick, pinDropMode, onCenterChange, onPinDropped, onNearbyUpdate }: Props) {
  const divRef       = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const nearbyLayer  = useRef<L.LayerGroup | null>(null)
  const venueLayer   = useRef<L.LayerGroup | null>(null)
  const focusLayer   = useRef<L.LayerGroup | null>(null)
  const onClickRef         = useRef(onVenueClick)
  const onNearbyRef        = useRef(onNearbyClick)
  const fetchingRef        = useRef(false)
  const onCenterChangeRef  = useRef(onCenterChange)
  const onPinDroppedRef    = useRef(onPinDropped)
  const pinDropModeRef     = useRef(pinDropMode)
  const onNearbyUpdateRef  = useRef(onNearbyUpdate)
  const [nearbyVenues, setNearbyVenues] = useState<SearchResult[]>([])

  useEffect(() => { onClickRef.current         = onVenueClick    }, [onVenueClick])
  useEffect(() => { onNearbyRef.current        = onNearbyClick   }, [onNearbyClick])
  useEffect(() => { onCenterChangeRef.current  = onCenterChange  }, [onCenterChange])
  useEffect(() => { onPinDroppedRef.current    = onPinDropped    }, [onPinDropped])
  useEffect(() => { pinDropModeRef.current     = pinDropMode     }, [pinDropMode])
  useEffect(() => { onNearbyUpdateRef.current  = onNearbyUpdate  }, [onNearbyUpdate])

  const fetchNearby = useCallback(async (map: L.Map) => {
    if (fetchingRef.current) return
    if (map.getZoom() < NEARBY_MIN_ZOOM) {
      setNearbyVenues([])
      onNearbyUpdateRef.current?.([])
      return
    }

    fetchingRef.current = true
    const b = map.getBounds()
    const bbox = [
      b.getSouth().toFixed(4),
      b.getWest().toFixed(4),
      b.getNorth().toFixed(4),
      b.getEast().toFixed(4),
    ].join(',')

    try {
      const res = await fetch(`/api/nearby?bbox=${encodeURIComponent(bbox)}`)
      if (res.ok) {
        const data = await res.json()
        setNearbyVenues(data)
        onNearbyUpdateRef.current?.(data)
      }
    } finally {
      fetchingRef.current = false
    }
  }, [])

  // Initialise map once
  useEffect(() => {
    if (mapRef.current || !divRef.current) return
    initIcons()

    const map = L.map(divRef.current, {
      center: [HAGGERSTON.lat, HAGGERSTON.lng],
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    })

    // CartoDB Voyager — clean, warm, very readable
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
          '© <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Layer order matters: nearby sits below venue markers, focus on top
    nearbyLayer.current = L.layerGroup().addTo(map)
    venueLayer.current  = L.layerGroup().addTo(map)
    focusLayer.current  = L.layerGroup().addTo(map)
    mapRef.current = map

    fetchNearby(map)

    let moveTimer: ReturnType<typeof setTimeout>
    const onMove = () => {
      clearTimeout(moveTimer)
      moveTimer = setTimeout(() => fetchNearby(map), 900)
      const c = map.getCenter()
      onCenterChangeRef.current(c.lat, c.lng)
    }
    map.on('moveend', onMove)

    return () => {
      clearTimeout(moveTimer)
      map.off('moveend', onMove)
      map.remove()
      mapRef.current = null
    }
  }, [fetchNearby])

  // Render DB venue markers
  useEffect(() => {
    if (!venueLayer.current) return
    venueLayer.current.clearLayers()

    venues.forEach((venue) => {
      const hasDeals = (venue.deals?.length ?? 0) > 0
      const onSelectedDay =
        selectedDay === 'all'
          ? hasDeals
          : (venue.deals?.some((d) => d.day_of_week === selectedDay) ?? false)

      const state: MarkerState = onSelectedDay
        ? 'highlighted'
        : hasDeals
          ? 'has-deals'
          : 'no-deals'

      const icon   = pinIcon(state, venue.type)
      const marker = L.marker([venue.lat, venue.lng], { icon })

      const relevantDeals =
        selectedDay !== 'all'
          ? (venue.deals?.filter((d) => d.day_of_week === selectedDay) ?? [])
          : (venue.deals ?? [])

      let tooltipHtml: string
      const safeName = escHtml(venue.name)
      if (onSelectedDay) {
        tooltipHtml =
          `<strong>${safeName}</strong><br>` +
          `<span style="color:#f59e0b">🎉 ${relevantDeals.length} deal${relevantDeals.length !== 1 ? 's' : ''}</span>`
      } else if (hasDeals) {
        tooltipHtml =
          `<strong>${safeName}</strong><br>` +
          `<span style="color:#a8a29e">${venue.deals!.length} deal${venue.deals!.length !== 1 ? 's' : ''} — other days</span>`
      } else {
        tooltipHtml =
          `<strong>${safeName}</strong><br>` +
          `<span style="color:#a8a29e">No deals yet — click to add one</span>`
      }

      marker.bindTooltip(tooltipHtml, tip(tooltipHtml))
      marker.on('click', () => onClickRef.current(venue))
      venueLayer.current?.addLayer(marker)
    })
  }, [venues, selectedDay])

  // Render nearby markers — skip any venue already shown in the venue layer
  useEffect(() => {
    if (!nearbyLayer.current) return
    nearbyLayer.current.clearLayers()

    const dbOsmIds = new Set(venues.map((v) => v.osm_id).filter(Boolean))
    const dbIds    = new Set(venues.map((v) => v.id))

    nearbyVenues
      .filter((nv) => !dbIds.has(nv.id) && !(nv.osm_id && dbOsmIds.has(nv.osm_id)))
      .forEach((nv) => {
        const icon   = pinIcon('nearby', nv.type)
        const marker = L.marker([nv.lat, nv.lng], { icon })
        const html   = `<strong>${escHtml(nv.name)}</strong><br><span style="color:#a8a29e">Click to add a deal</span>`
        marker.bindTooltip(html, tip(html))
        marker.on('click', () => onNearbyRef.current(nv))
        nearbyLayer.current?.addLayer(marker)
      })
  }, [nearbyVenues, venues])

  // Pan/zoom to focused search result
  useEffect(() => {
    if (!focusLayer.current || !mapRef.current) return
    focusLayer.current.clearLayers()
    if (!focusVenue) return

    mapRef.current.flyTo([focusVenue.lat, focusVenue.lng], 17, { animate: true, duration: 0.75 })

    L.marker([focusVenue.lat, focusVenue.lng], { icon: focusIcon(focusVenue.type) })
      .addTo(focusLayer.current)
      .bindTooltip(escHtml(focusVenue.name), {
        permanent: true, direction: 'top', className: 'ld-tooltip', offset: [0, -8],
      })
      .openTooltip()
  }, [focusVenue])

  // Pin-drop click handler — attaches only when pinDropMode is true
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pinDropMode) return  // early return when false — no cleanup needed

    const handlePinClick = (e: L.LeafletMouseEvent) => {
      onPinDroppedRef.current(e.latlng.lat, e.latlng.lng)
    }

    map.on('click', handlePinClick)
    return () => { map.off('click', handlePinClick) }
  }, [pinDropMode])

  return (
    <div className="relative w-full h-full">
      <div
        ref={divRef}
        className="w-full h-full"
        style={{ cursor: pinDropMode ? 'crosshair' : '' }}
      />
      {pinDropMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3 pointer-events-auto">
          <span className="text-sm font-medium whitespace-nowrap">
            Click anywhere on the map to place the venue
          </span>
        </div>
      )}
    </div>
  )
}
