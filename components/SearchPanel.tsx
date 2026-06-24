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

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`
}

function dealTime(start?: string | null, end?: string | null): string {
  if (start && end) return `${fmt12(start)}–${fmt12(end)}`
  if (start) return `from ${fmt12(start)}`
  if (end) return `until ${fmt12(end)}`
  return ''
}

interface Props {
  selectedDay: DayOfWeek | 'all'
  venues: Venue[]
  nearbyVenues: SearchResult[]
  wtvCounts: Record<string, number>
  loading: boolean
  onVenueSelect: (venue: SearchResult | null) => void
  onOpenDeals: (venue: Venue) => void
  onAddFromSearch: (result: SearchResult) => void
  mapCenter: { lat: number; lng: number }
  onStartPinDrop: () => void
}

export default function SearchPanel({
  selectedDay,
  venues,
  nearbyVenues,
  wtvCounts,
  loading,
  onVenueSelect,
  onOpenDeals,
  onAddFromSearch,
  mapCenter,
  onStartPinDrop,
}: Props) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeTab, setActiveTab] = useState<'nearby' | 'mylist'>('nearby')
  const [myList, setMyList] = useState<Venue[]>([])
  const [myListLoading, setMyListLoading] = useState(false)
  const [visitorName, setVisitorName] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const name = localStorage.getItem('ld_visitor_name') ?? ''
    setVisitorName(name)
  }, [])

  useEffect(() => {
    if (activeTab !== 'mylist') return
    const name = localStorage.getItem('ld_visitor_name') ?? ''
    if (!name) return
    setMyListLoading(true)
    fetch(`/api/want-to-visit?visitor_name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data) => setMyList(Array.isArray(data) ? data : []))
      .catch(() => setMyList([]))
      .finally(() => setMyListLoading(false))
  }, [activeTab])

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
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&lat=${mapCenter.lat}&lng=${mapCenter.lng}`
      )
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

  const openVenue = (result: SearchResult) => {
    onVenueSelect(result)
    const existing = venueByOsmId.get(result.osm_id)
    if (existing) {
      onOpenDeals(existing)
    } else {
      onAddFromSearch(result)
    }
  }

  const handleResultClick = (result: SearchResult) => {
    openVenue(result)
  }

  const handleAddDeal = (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation()
    openVenue(result)
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

      {/* Add Venue button */}
      <div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
        <button
          onClick={onStartPinDrop}
          className="w-full text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-lg py-2 transition-colors"
        >
          + Add Venue
        </button>
      </div>

      {/* Tabs: Nearby / My List */}
      <div className="flex border-b border-slate-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab('nearby')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'nearby'
              ? 'text-amber-400 border-b-2 border-amber-400'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Nearby
        </button>
        <button
          onClick={() => setActiveTab('mylist')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'mylist'
              ? 'text-amber-400 border-b-2 border-amber-400'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          ★ My List
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {activeTab === 'mylist' ? (
          <>
            {!visitorName && (
              <div className="px-4 py-10 text-center">
                <div className="text-4xl mb-3">★</div>
                <p className="text-slate-400 text-sm font-medium">Your list is empty</p>
                <p className="text-slate-600 text-xs mt-1">Click &ldquo;Want to visit&rdquo; on a venue to start your list.</p>
              </div>
            )}
            {visitorName && myListLoading && (
              <div className="px-4 py-6 text-center">
                <p className="text-slate-500 text-sm animate-pulse">Loading your list…</p>
              </div>
            )}
            {visitorName && !myListLoading && myList.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-4xl mb-3">★</div>
                <p className="text-slate-400 text-sm font-medium">No venues saved yet</p>
                <p className="text-slate-600 text-xs mt-1">Click &ldquo;Want to visit&rdquo; on any venue to add it here.</p>
              </div>
            )}
            {visitorName && !myListLoading && myList.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-widest">
                  {myList.length} saved venue{myList.length !== 1 ? 's' : ''}
                </div>
                {myList.map((venue) => (
                  <button
                    key={venue.id}
                    onClick={() => onOpenDeals(venue)}
                    className="w-full text-left p-3 border-b border-slate-800/60 hover:bg-slate-800/60 transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base mt-0.5 flex-shrink-0">{venueEmoji(venue.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate group-hover:text-white">
                          {venue.name}
                          {wtvCounts[venue.id] != null && wtvCounts[venue.id] > 0 && (
                            <span className="ml-1.5 text-amber-400 text-xs">★{wtvCounts[venue.id]}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{venue.address}</p>
                        {venue.deals && venue.deals.length > 0 && (
                          <p className="text-xs text-slate-600 mt-0.5">{venue.deals.length} deal{venue.deals.length !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </>
        ) : isSearchMode ? (
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
                <p>No venues found for &ldquo;{query}&rdquo;</p>
                <button
                  onClick={onStartPinDrop}
                  className="mt-3 text-amber-400 hover:text-amber-300 text-xs underline underline-offset-2"
                >
                  Not listed? Drop a pin on the map →
                </button>
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
            {/* Nearby venues sorted by distance from map center */}
            {(() => {
              // Merge nearby venues with saved deal data, sort by distance
              const sidebarItems = nearbyVenues
                .map((nv) => {
                  const saved = venueByOsmId.get(nv.osm_id) ?? null
                  return { ...nv, deals: saved?.deals ?? [], savedVenue: saved }
                })
                .sort((a, b) => {
                  const da = (a.lat - mapCenter.lat) ** 2 + (a.lng - mapCenter.lng) ** 2
                  const db = (b.lat - mapCenter.lat) ** 2 + (b.lng - mapCenter.lng) ** 2
                  return da - db
                })

              const filtered = selectedDay === 'all'
                ? sidebarItems
                : sidebarItems.filter((item) => item.deals.some((d) => d.day_of_week === selectedDay))

              return (
                <>
                  <div className="px-3 py-2 text-xs text-slate-500 font-medium uppercase tracking-widest">
                    {loading ? 'Loading…' : nearbyVenues.length === 0
                      ? 'Move map to load venues'
                      : selectedDay === 'all'
                        ? `${sidebarItems.length} venue${sidebarItems.length !== 1 ? 's' : ''} nearby`
                        : `${filtered.length} venue${filtered.length !== 1 ? 's' : ''} with deals on ${selectedDay}`
                    }
                  </div>

                  {!loading && nearbyVenues.length === 0 && (
                    <div className="px-4 py-10 text-center">
                      <div className="text-4xl mb-3">🗺️</div>
                      <p className="text-slate-400 text-sm font-medium">No venues in view</p>
                      <p className="text-slate-600 text-xs mt-1">Zoom in or pan to a London area to see venues.</p>
                    </div>
                  )}

                  {!loading && nearbyVenues.length > 0 && filtered.length === 0 && selectedDay !== 'all' && (
                    <div className="px-4 py-10 text-center">
                      <div className="text-4xl mb-3">🍺</div>
                      <p className="text-slate-400 text-sm font-medium">No deals on {selectedDay}</p>
                      <p className="text-slate-600 text-xs mt-1">
                        Click any venue to add a deal for that day.
                      </p>
                    </div>
                  )}

                  {(selectedDay === 'all' ? sidebarItems : filtered).map((item) => {
                    const relevantDeals = selectedDay === 'all'
                      ? item.deals
                      : item.deals.filter((d) => d.day_of_week === selectedDay)
                    const days = [...new Set(relevantDeals.map((d) => d.day_of_week))]

                    return (
                      <button
                        key={item.osm_id}
                        onClick={() => {
                          if (item.savedVenue) onOpenDeals(item.savedVenue)
                          else onAddFromSearch(item)
                        }}
                        className="w-full text-left p-3 border-b border-slate-800/60 hover:bg-slate-800/60 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base mt-0.5 flex-shrink-0">{venueEmoji(item.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-100 truncate group-hover:text-white">
                              {item.name}
                              {wtvCounts[item.id] > 0 && (
                                <span className="ml-1.5 text-amber-400 text-xs">★{wtvCounts[item.id]}</span>
                              )}
                            </p>
                            {relevantDeals.length > 0 ? (
                              <div className="mt-0.5">
                                <p className="text-xs text-slate-300 truncate">
                                  {relevantDeals[0].description}
                                  {dealTime(relevantDeals[0].start_time, relevantDeals[0].end_time) && (
                                    <span className="text-slate-500"> · {dealTime(relevantDeals[0].start_time, relevantDeals[0].end_time)}</span>
                                  )}
                                </p>
                                {relevantDeals.length > 1 && (
                                  <p className="text-xs text-slate-600">+{relevantDeals.length - 1} more deal{relevantDeals.length > 2 ? 's' : ''}</p>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 truncate">{item.address}</p>
                            )}
                            {days.length > 0 && (
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
                            )}
                          </div>
                          {item.deals.length > 0 && (
                            <span className="text-xs text-slate-600 flex-shrink-0 mt-0.5">
                              {item.deals.length} deal{item.deals.length !== 1 ? 's' : ''}
                            </span>
                          )}
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
