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
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
      try {
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
            Find &amp; share pub, bar &amp; restaurant deals
          </p>
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
          loading={loadingVenues}
          onVenueSelect={setFocusVenue}
          onOpenDeals={handleOpenDeals}
          onAddFromSearch={handleAddFromSearch}
        />
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-4 left-4 z-20 bg-white/90 hover:bg-white border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg px-3 py-2 text-sm font-medium shadow-md transition-all backdrop-blur-sm"
        >
          {sidebarOpen ? '← Hide' : '☰ Menu'}
        </button>

        <MapComponent
          venues={venues}
          focusVenue={focusVenue}
          selectedDay={selectedDay}
          onVenueClick={handleOpenDeals}
          onNearbyClick={handleAddFromSearch}
          pinDropMode={false}
          onCenterChange={() => {}}
          onPinDropped={() => {}}
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

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-white text-sm px-4 py-3 rounded-xl shadow-2xl max-w-sm text-center animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  )
}
