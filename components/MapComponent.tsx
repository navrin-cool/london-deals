'use client'

import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Venue, DayOfWeek, SearchResult } from '@/types'

// Haggerston Overground station
const HAGGERSTON = { lat: 51.5393, lng: -0.0762 }
const DEFAULT_ZOOM = 15

function initLeafletIcons() {
  // eslint-disable-next-line
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

function makeVenueIcon(type: string, hasDeals: boolean, highlight: boolean) {
  const emoji = type === 'restaurant' ? '🍽️' : '🍺'
  const size  = highlight ? 46 : hasDeals ? 40 : 32
  const bg    = highlight ? '#f59e0b' : hasDeals ? '#d97706' : '#475569'
  const glow  = highlight ? 'box-shadow:0 0 0 4px rgba(245,158,11,0.3),0 4px 16px rgba(0,0,0,0.5);' : hasDeals ? 'box-shadow:0 2px 8px rgba(0,0,0,0.4);' : 'box-shadow:0 1px 4px rgba(0,0,0,0.3);'
  const fs    = Math.round(size * 0.45)

  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      width:${size}px;height:${size}px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      border:2px solid rgba(255,255,255,${hasDeals ? '0.9' : '0.5'});
      ${glow}
      transition:all .2s;
    "><span style="transform:rotate(45deg);font-size:${fs}px;line-height:1;">${emoji}</span></div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

function makeFocusIcon(emoji: string) {
  return L.divIcon({
    className: '',
    html: `<div class="ld-focus-pulse" style="
      background:#3b82f6;
      width:44px;height:44px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      border:3px solid white;
      box-shadow:0 4px 16px rgba(59,130,246,0.5);
    "><span style="font-size:22px;">${emoji}</span></div>`,
    iconSize:    [44, 44],
    iconAnchor:  [22, 22],
    popupAnchor: [0, -28],
  })
}

interface Props {
  venues: Venue[]
  focusVenue: SearchResult | null
  selectedDay: DayOfWeek | 'all'
  onVenueClick: (venue: Venue) => void
}

export default function MapComponent({ venues, focusVenue, selectedDay, onVenueClick }: Props) {
  const mapDivRef   = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<L.Map | null>(null)
  const venueLayer  = useRef<L.LayerGroup | null>(null)
  const focusLayer  = useRef<L.LayerGroup | null>(null)
  const clickRef    = useRef(onVenueClick)

  useEffect(() => { clickRef.current = onVenueClick }, [onVenueClick])

  // Initialise map once
  useEffect(() => {
    if (mapRef.current || !mapDivRef.current) return

    initLeafletIcons()

    const map = L.map(mapDivRef.current, {
      center: [HAGGERSTON.lat, HAGGERSTON.lng],
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    })

    // CartoDB Dark Matter tiles — looks great on dark UI
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(map)

    // Zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    venueLayer.current = L.layerGroup().addTo(map)
    focusLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update venue markers when venues or selectedDay changes
  useEffect(() => {
    if (!venueLayer.current) return

    venueLayer.current.clearLayers()

    venues.forEach((venue) => {
      const hasDeals = (venue.deals?.length ?? 0) > 0
      const dealCount = venue.deals?.length ?? 0

      // When a day is filtered, highlight venues that have deals on that day
      const dayMatch =
        selectedDay === 'all' ||
        (venue.deals?.some((d) => d.day_of_week === selectedDay) ?? false)
      const highlight = dayMatch && hasDeals

      const icon = makeVenueIcon(venue.type, hasDeals, highlight)
      const marker = L.marker([venue.lat, venue.lng], { icon })

      const dayDeals =
        selectedDay !== 'all'
          ? venue.deals?.filter((d) => d.day_of_week === selectedDay) ?? []
          : venue.deals ?? []

      const tooltipContent = `
        <div>
          <strong style="color:#f1f5f9">${venue.name}</strong>
          ${highlight
            ? `<br><span style="color:#f59e0b;font-size:11px">🎉 ${dayDeals.length} deal${dayDeals.length !== 1 ? 's' : ''}</span>`
            : hasDeals
              ? `<br><span style="color:#94a3b8;font-size:11px">${dealCount} total deal${dealCount !== 1 ? 's' : ''}</span>`
              : ''
          }
        </div>
      `

      marker.bindTooltip(tooltipContent, {
        permanent: false,
        direction: 'top',
        className: 'ld-tooltip',
        offset: [0, -8],
      })

      marker.on('click', () => clickRef.current(venue))

      venueLayer.current?.addLayer(marker)
    })
  }, [venues, selectedDay])

  // Focus on searched venue
  useEffect(() => {
    if (!focusLayer.current || !mapRef.current) return

    focusLayer.current.clearLayers()

    if (!focusVenue) return

    mapRef.current.flyTo([focusVenue.lat, focusVenue.lng], 17, { animate: true, duration: 0.8 })

    const emoji = focusVenue.type === 'restaurant' ? '🍽️' : '🍺'
    const icon  = makeFocusIcon(emoji)

    L.marker([focusVenue.lat, focusVenue.lng], { icon })
      .addTo(focusLayer.current!)
      .bindTooltip(focusVenue.name, {
        permanent: true,
        direction: 'top',
        className: 'ld-tooltip',
        offset: [0, -8],
      })
      .openTooltip()
  }, [focusVenue])

  return <div ref={mapDivRef} className="w-full h-full" />
}
