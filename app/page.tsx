'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import SearchPanel from '@/components/SearchPanel'
import FilterBar from '@/components/FilterBar'
import DealModal from '@/components/DealModal'
import { Venue, DayOfWeek, SearchResult } from '@/types'

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center">
      <div className="text-slate-500 text-sm">Loading map…</div>
    </div>
  ),
})

export default function Home() {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | 'all'>('all')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [modalVenue, setModalVenue] = useState<Venue | null>(null)
  const [focusVenue, setFocusVenue] = useState<SearchResult | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const fetchVenues = useCallback(async () => {
    try {
      const url =
        selectedDay === 'all' ? '/api/venues' : `/api/venues?day=${selectedDay}`
      const res = await fetch(url)
      if (res.ok) setVenues(await res.json())
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

  // Create venue in DB then open modal
  const handleAddFromSearch = useCallback(
    async (result: SearchResult) => {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      if (res.ok) {
        const venue = await res.json()
        setModalVenue(venue)
        fetchVenues()
      }
    },
    [fetchVenues]
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <div
        className={`
          flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 z-10 shadow-2xl
          transition-all duration-300
          ${sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex-shrink-0">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🍺</span>
            London Deals
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Find & share pub, bar &amp; restaurant deals
          </p>
        </div>

        <FilterBar selectedDay={selectedDay} onDayChange={setSelectedDay} />

        <SearchPanel
          selectedDay={selectedDay}
          venues={venues}
          loading={loadingVenues}
          onVenueSelect={setFocusVenue}
          onOpenDeals={handleOpenDeals}
          onAddFromSearch={handleAddFromSearch}
        />
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        {/* Toggle sidebar button */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-4 left-4 z-20 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg px-3 py-2 text-sm font-medium shadow-lg transition-all backdrop-blur-sm"
        >
          {sidebarOpen ? '← Hide' : '☰ Menu'}
        </button>

        <MapComponent
          venues={venues}
          focusVenue={focusVenue}
          selectedDay={selectedDay}
          onVenueClick={handleOpenDeals}
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
    </div>
  )
}
