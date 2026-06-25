'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import SearchPanel from '@/components/SearchPanel'
import FilterBar from '@/components/FilterBar'
import DealModal from '@/components/DealModal'
import AddVenueModal from '@/components/AddVenueModal'
import { Venue, DayOfWeek, SearchResult } from '@/types'

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#f5f0eb] flex items-center justify-center">
      <div className="text-stone-400 text-sm">Loading map…</div>
    </div>
  ),
})

export default function Home() {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | 'all'>('all')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [dbError, setDbError] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [modalVenue, setModalVenue] = useState<Venue | null>(null)
  const [focusVenue, setFocusVenue] = useState<SearchResult | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Open sidebar by default on desktop after hydration
  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true)
  }, [])

  const HAGGERSTON = { lat: 51.5393, lng: -0.0762 }
  const [mapCenter, setMapCenter]   = useState(HAGGERSTON)
  const [pinDropMode, setPinDropMode] = useState(false)
  const [droppedPin, setDroppedPin]  = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyVenues, setNearbyVenues] = useState<SearchResult[]>([])
  const [wtvCounts, setWtvCounts] = useState<Record<string, number>>({})

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const fetchVenues = useCallback(async () => {
    try {
      const url =
        selectedDay === 'all' ? '/api/venues' : `/api/venues?day=${selectedDay}`
      const res = await fetch(url)
      if (res.ok) {
        setVenues(await res.json())
        setDbError(false)
      } else {
        setDbError(true)
      }
    } catch {
      setDbError(true)
    } finally {
      setLoadingVenues(false)
    }
  }, [selectedDay])

  useEffect(() => {
    setLoadingVenues(true)
    fetchVenues()
    const interval = setInterval(fetchVenues, 30_000)
    return () => clearInterval(interval)
  }, [fetchVenues])

  useEffect(() => {
    if (nearbyVenues.length === 0) { setWtvCounts({}); return }
    const ids = nearbyVenues.map((v) => v.id).filter(Boolean)
    if (ids.length === 0) return
    fetch(`/api/want-to-visit/counts?venue_ids=${ids.join(',')}`)
      .then((r) => r.json())
      .then((data) => setWtvCounts(data ?? {}))
      .catch(() => {})
  }, [nearbyVenues])

  const handleDealUpdate = useCallback(async () => {
    fetchVenues()
    if (modalVenue) {
      const res = await fetch(`/api/venues/${modalVenue.id}`)
      if (res.ok) setModalVenue(await res.json())
    }
  }, [fetchVenues, modalVenue])

  const handleOpenDeals = useCallback((venue: Venue) => {
    setModalVenue(venue)
  }, [])

  const handleStartPinDrop = useCallback(() => {
    setPinDropMode(true)
    setSidebarOpen(false)
  }, [])

  const handlePinDropped = useCallback((lat: number, lng: number) => {
    setPinDropMode(false)
    setDroppedPin({ lat, lng })
  }, [])

  const handleCancelAddVenue = useCallback(() => {
    setDroppedPin(null)
    setSidebarOpen(true)
  }, [])

  const handleVenueAdded = useCallback((venue: Venue) => {
    setDroppedPin(null)
    setModalVenue(venue)
    fetchVenues()
  }, [fetchVenues])

  // Open venue modal — GET by osm_id first (fast for imported venues), POST to create if new
  const handleAddFromSearch = useCallback(
    async (result: SearchResult) => {
      try {
        // Fast path by osm_id (imported venues — covers the bulk 14K set)
        if (result.osm_id) {
          const getRes = await fetch(`/api/venues?osm_id=${encodeURIComponent(result.osm_id)}`)
          if (getRes.ok) {
            const venue = await getRes.json()
            if (venue) { setModalVenue(venue); return }
          }
        }
        // Fast path by UUID id (user-created venues without osm_id)
        if (result.id) {
          const getRes = await fetch(`/api/venues/${encodeURIComponent(result.id)}`)
          if (getRes.ok) {
            const venue = await getRes.json()
            if (venue && !venue.error) { setModalVenue(venue); return }
          }
        }
        // Slow path: create a new venue (pin-dropped venues without osm_id)
        const res = await fetch('/api/venues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        })
        if (res.ok) {
          const venue = await res.json()
          setModalVenue(venue)
          fetchVenues()
        } else {
          const body = await res.json().catch(() => ({}))
          if (res.status === 500) {
            showToast('Database not set up yet — run the SQL schema in Supabase first.')
          } else {
            showToast(body.error ?? 'Failed to add venue — please try again.')
          }
        }
      } catch {
        showToast('Network error — check your connection.')
      }
    },
    [fetchVenues, showToast]
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">

      {/* Mobile backdrop — closes sidebar when tapped */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar
          Mobile:  fixed overlay, slides in/out with translate-x
          Desktop: flex item, collapses with width transition            */}
      <div
        className={`
          flex flex-col bg-slate-900 border-r border-slate-800 shadow-2xl
          fixed inset-y-0 left-0 z-50 w-80 max-w-[90vw]
          transition-all duration-300
          md:relative md:inset-auto md:z-10 md:flex-shrink-0
          ${sidebarOpen
            ? 'translate-x-0 md:w-80'
            : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden'
          }
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex-shrink-0 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-2xl">🍺</span>
              London Deals
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Find &amp; share pub, bar &amp; restaurant deals
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden flex-shrink-0 text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors mt-0.5"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* DB setup warning */}
        {dbError && (
          <div className="mx-3 mt-3 p-3 bg-red-900/40 border border-red-700/50 rounded-lg flex-shrink-0">
            <p className="text-red-300 text-xs font-semibold">Database not connected</p>
            <p className="text-red-400/80 text-xs mt-1">
              Run <code className="bg-red-900/50 px-1 rounded">supabase-schema.sql</code> in your Supabase SQL Editor, then check your Vercel env vars.
            </p>
          </div>
        )}

        <FilterBar selectedDay={selectedDay} onDayChange={setSelectedDay} />

        <SearchPanel
          selectedDay={selectedDay}
          venues={venues}
          nearbyVenues={nearbyVenues}
          wtvCounts={wtvCounts}
          loading={loadingVenues}
          onVenueSelect={setFocusVenue}
          onOpenDeals={handleOpenDeals}
          onAddFromSearch={handleAddFromSearch}
          mapCenter={mapCenter}
          onStartPinDrop={handleStartPinDrop}
        />
      </div>

      {/* Map area — isolate contains Leaflet's internal z-indices (200-700) */}
      <div className="flex-1 relative isolate">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-4 left-4 z-[800] bg-white/90 hover:bg-white border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg px-3 py-2 text-sm font-medium shadow-md transition-all backdrop-blur-sm"
        >
          {sidebarOpen ? '← Hide' : '☰ Menu'}
        </button>

        <MapComponent
          venues={venues}
          focusVenue={focusVenue}
          selectedDay={selectedDay}
          onVenueClick={handleOpenDeals}
          onNearbyClick={handleAddFromSearch}
          pinDropMode={pinDropMode}
          onCenterChange={(lat, lng) => setMapCenter({ lat, lng })}
          onPinDropped={handlePinDropped}
          onNearbyUpdate={setNearbyVenues}
        />
      </div>

      {/* Deal modal */}
      {modalVenue && (
        <DealModal
          venue={modalVenue}
          onClose={() => setModalVenue(null)}
          onUpdate={handleDealUpdate}
        />
      )}

      {droppedPin && (
        <AddVenueModal
          lat={droppedPin.lat}
          lng={droppedPin.lng}
          onClose={handleCancelAddVenue}
          onAdded={handleVenueAdded}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-white text-sm px-4 py-3 rounded-xl shadow-2xl max-w-sm text-center animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  )
}
