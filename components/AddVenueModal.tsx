'use client'

import { useState } from 'react'
import { Venue } from '@/types'

interface Props {
  lat: number
  lng: number
  onClose: () => void
  onAdded: (venue: Venue) => void
}

export default function AddVenueModal({ lat, lng, onClose, onAdded }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'bar' | 'pub' | 'restaurant'>('bar')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async () => {
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, lat, lng, address: 'London' }),
      })
      if (!res.ok) throw new Error('Failed')
      const venue: Venue = await res.json()
      onAdded(venue)
    } catch {
      setError('Failed to add venue — please try again.')
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-white mb-4">Add Venue</h2>

        <label className="block text-xs text-slate-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="e.g. The Dove"
          autoFocus
          className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white placeholder-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 mb-3 transition-colors"
        />

        <label className="block text-xs text-slate-400 mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'bar' | 'pub' | 'restaurant')}
          className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 mb-4 transition-colors appearance-none"
        >
          <option value="bar">Bar</option>
          <option value="pub">Pub</option>
          <option value="restaurant">Restaurant</option>
        </select>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={adding || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white transition-colors"
          >
            {adding ? 'Adding…' : 'Add Venue'}
          </button>
        </div>
      </div>
    </div>
  )
}
