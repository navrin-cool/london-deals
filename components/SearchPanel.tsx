'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Venue, SearchResult, DayOfWeek } from '@/types'

const DAY_COLORS: Record<string, string> = {
  monday:    'bg-blue-500/20 text-blue-400',
  tuesday:   'bg-violet-500/20 text-violet-400',
  wednesday: 'bg-emerald-500/20 text-emerald-400',
  thursday:  'bg-orange-500/20 text-orange-400',
  friday:    'bg-red-500/20 text-red-400',
  saturday:  'bg-pink-500/20 text-pink-400',
  sunday:    'bg-yellow-500/20 text-yellow-400',
}

function venueEmoji(type: string) {
  return type === 'restaurant' ? '🍽️' : '🍺'
}

interface Props {
  selectedDay: DayOfWeek | 'all'
  venues: Venue[]
  loading: boolean
  onVenueSelect: (venue: SearchResult | null) => void
  onOpenDeals: (venue: Venue) => void
  onAddFromSearch: (result: SearchResult) => void
}

export default function SearchPanel({
  selectedDay,
  venues,
  loading,
  onVenueSelect,
  onOpenDeals,
  onAddFromSearch,
}: Props) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)

  // Build a set of known osm_ids for quick lookup
  const knownOsmIds = new Set(venues.map((v) => v.osm_id).filter(Boolean))
  const venueByOsmId = new Map(venues.map((v) => [v.osm_id, v]))

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    setSearchError('')
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSearchResults(data)
    } catch {
      setSearchError('Search failed — try again')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setSearchResults([])
      onVenueSelect(null)
      return
    }
    debounceRef.current = setTimeout(() => search(query.trim()), 500)
    return () => clearTimeout(debounceRef.current)
  }, [query, search, onVenueSelect])

  const clearSearch = () => {
    setQuery('')
    setSearchResults([])
    onVenueSelect(null)
    inputRef.current?.focus()
  }

  const handleResultClick = (result: SearchResult) => {
    onVenueSelect(result)
  }

  const handleAddDeal = (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation()
    const existing = venueByOsmId.get(result.osm_id)
    if (existing) {
      onOpenDeals(existing)
    } else {
      onAddFromSearch(result)
    }
  }

  const isSearchMode = query.trim().length >= 2

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search input */}
      <div className="p-3 border-b border-slate-800 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-sm">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bars, pubs, restaurants…"
            className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 border border-slate-700 focus:border-amber-500/50 transition-colors"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-base leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isSearchMode ? (
          <>
            {/* Search results */}
            <div className="px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-widest flex items-center gap-2">
              {searching ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Searching…
                </span>
              ) : (
                <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {searchError && (
              <div className="px-3 py-2 text-xs text-red-400">{searchError}</div>
            )}

            {!searching && searchResults.length === 0 && !searchError && (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                No venues found for &ldquo;{query}&rdquo;
              </div>
            )}

            {searchResults.map((result) => {
              const alreadySaved = knownOsmIds.has(result.osm_id)
              return (
                <button
                  key={result.osm_id}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left p-3 border-b border-slate-800/60 hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5 flex-shrink-0">
                      {venueEmoji(result.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate group-hover:text-white">
                        {result.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{result.address}</p>
                      <span className="text-xs text-slate-600 capitalize">{result.type}</span>
                    </div>
                    <button
                      onClick={(e) => handleAddDeal(result, e)}
                      className={`
                        flex-shrink-0 text-xs px-2.5 py-1 rounded-md font-medium transition-colors
                        ${alreadySaved
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'bg-amber-500 text-white hover:bg-amber-400'
                        }
                      `}
                    >
                      {alreadySaved ? 'Deals' : '+ Deal'}
                    </button>
                  </div>
                </button>
              )
            })}
          </>
        ) : (
          <>
            {/* Saved venues — filter client-side to only show venues with deals */}
            {(() => {
              const displayVenues = venues.filter((v) =>
                selectedDay === 'all'
                  ? (v.deals?.length ?? 0) > 0
                  : v.deals?.some((d) => d.day_of_week === selectedDay)
              )
              return (
                <>
            <div className="px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-widest">
              {loading ? 'Loading…' : (
                selectedDay === 'all'
                  ? `${displayVenues.length} venue${displayVenues.length !== 1 ? 's' : ''} with deals`
                  : `${displayVenues.length} venue${displayVenues.length !== 1 ? 's' : ''} with deals on ${selectedDay}`
              )}
            </div>

            {!loading && displayVenues.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-4xl mb-3">🍺</div>
                <p className="text-slate-400 text-sm font-medium">No deals here yet!</p>
                <p className="text-slate-600 text-xs mt-1">
                  Search for a venue above and click <span className="text-amber-500">+ Deal</span> to add the first one.
                </p>
              </div>
            )}

            {displayVenues.map((venue) => {
              const days = [...new Set(venue.deals?.map((d) => d.day_of_week) ?? [])]
              return (
                <button
                  key={venue.id}
                  onClick={() => onOpenDeals(venue)}
                  className="w-full text-left p-3 border-b border-slate-800/60 hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5 flex-shrink-0">
                      {venueEmoji(venue.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate group-hover:text-white">
                        {venue.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{venue.address}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {days.map((d) => (
                          <span
                            key={d}
                            className={`text-xs px-1.5 py-0.5 rounded capitalize font-medium ${DAY_COLORS[d] ?? 'bg-slate-700 text-slate-400'}`}
                          >
                            {d.slice(0, 3)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0 mt-0.5">
                      {venue.deals?.length ?? 0} deal{(venue.deals?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              )
            })}
                </>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
