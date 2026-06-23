'use client'

import { useState, useEffect } from 'react'
import { Venue, Deal, DayOfWeek } from '@/types'

type DayConfig = { key: DayOfWeek; label: string; activeClass: string; chipClass: string }

const DAYS: DayConfig[] = [
  { key: 'monday',    label: 'Monday',    activeClass: 'bg-blue-600 text-white',    chipClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'tuesday',   label: 'Tuesday',   activeClass: 'bg-violet-600 text-white',  chipClass: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  { key: 'wednesday', label: 'Wednesday', activeClass: 'bg-emerald-600 text-white', chipClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'thursday',  label: 'Thursday',  activeClass: 'bg-orange-600 text-white',  chipClass: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { key: 'friday',    label: 'Friday',    activeClass: 'bg-red-600 text-white',     chipClass: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'saturday',  label: 'Saturday',  activeClass: 'bg-pink-600 text-white',    chipClass: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  { key: 'sunday',    label: 'Sunday',    activeClass: 'bg-yellow-500 text-slate-900', chipClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
]

interface Props {
  venue: Venue
  onClose: () => void
  onUpdate: () => void
}

export default function DealModal({ venue, onClose, onUpdate }: Props) {
  const [deals, setDeals] = useState<Deal[]>(venue.deals ?? [])
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Sync deals when venue prop updates (e.g. after re-fetch)
  useEffect(() => {
    setDeals(venue.deals ?? [])
  }, [venue])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAdd = async () => {
    if (!description.trim()) { setError('Please enter a deal description'); return }
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venue.id, day_of_week: selectedDay, description: description.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      const newDeal: Deal = await res.json()
      setDeals((prev) => [...prev, newDeal])
      setDescription('')
      onUpdate()
    } catch {
      setError('Failed to add deal — please try again.')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (dealId: string) => {
    setDeletingId(dealId)
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setDeals((prev) => prev.filter((d) => d.id !== dealId))
      onUpdate()
    } catch {
      setError('Failed to remove deal.')
    } finally {
      setDeletingId(null)
    }
  }

  const dealsByDay = DAYS.reduce(
    (acc, d) => { acc[d.key] = deals.filter((deal) => deal.day_of_week === d.key); return acc },
    {} as Record<DayOfWeek, Deal[]>
  )

  const hasDays = DAYS.some((d) => dealsByDay[d.key].length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-start gap-3">
          <span className="text-3xl mt-0.5">
            {venue.type === 'restaurant' ? '🍽️' : '🍺'}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white leading-tight">{venue.name}</h2>
            <p className="text-sm text-slate-400 mt-0.5 truncate">{venue.address}</p>
            <span className="text-xs text-slate-600 capitalize">{venue.type}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800 flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Deals list */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          {!hasDays && (
            <div className="py-6 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-slate-400 text-sm">No deals added yet.</p>
              <p className="text-slate-600 text-xs mt-1">Use the form below to add the first one!</p>
            </div>
          )}

          {DAYS.map((day) => {
            const dayDeals = dealsByDay[day.key]
            if (!dayDeals.length) return null
            return (
              <div key={day.key} className={`rounded-xl border p-3 ${day.chipClass}`}>
                <div className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md mb-2.5 border ${day.chipClass}`}>
                  {day.label}
                </div>
                <div className="space-y-2">
                  {dayDeals.map((deal) => (
                    <div key={deal.id} className="flex items-start gap-2 group">
                      <p className="flex-1 text-sm text-slate-200 leading-snug">{deal.description}</p>
                      <button
                        onClick={() => handleDelete(deal.id)}
                        disabled={deletingId === deal.id}
                        className="flex-shrink-0 text-slate-600 hover:text-red-400 disabled:opacity-40 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Remove deal"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Add deal form */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex-shrink-0">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-3">
            Add a deal
          </p>

          {/* Day picker */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DAYS.map((day) => (
              <button
                key={day.key}
                onClick={() => setSelectedDay(day.key)}
                className={`
                  px-2.5 py-1 rounded-md text-xs font-semibold transition-all
                  ${selectedDay === day.key
                    ? `${day.activeClass} ring-2 ring-white/20 scale-105`
                    : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                  }
                `}
              >
                {day.label.slice(0, 3)}
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() }
            }}
            placeholder="e.g. 2-for-1 cocktails 5–8pm, 50% off food, happy hour all night…"
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none transition-colors"
          />

          {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}

          <button
            onClick={handleAdd}
            disabled={adding || !description.trim()}
            className="mt-3 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            {adding ? 'Adding…' : 'Add Deal'}
          </button>
        </div>
      </div>
    </div>
  )
}
