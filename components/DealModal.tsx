'use client'

import { useState, useEffect, useCallback } from 'react'
import { Venue, Deal, DayOfWeek, Comment } from '@/types'

type DayConfig = { key: DayOfWeek; label: string; activeClass: string; chipClass: string }

const DAYS: DayConfig[] = [
  { key: 'monday',    label: 'Monday',    activeClass: 'bg-blue-600 text-white',       chipClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'tuesday',   label: 'Tuesday',   activeClass: 'bg-violet-600 text-white',     chipClass: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  { key: 'wednesday', label: 'Wednesday', activeClass: 'bg-emerald-600 text-white',    chipClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'thursday',  label: 'Thursday',  activeClass: 'bg-orange-600 text-white',     chipClass: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { key: 'friday',    label: 'Friday',    activeClass: 'bg-red-600 text-white',        chipClass: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'saturday',  label: 'Saturday',  activeClass: 'bg-pink-600 text-white',       chipClass: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  { key: 'sunday',    label: 'Sunday',    activeClass: 'bg-yellow-500 text-slate-900', chipClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
]

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`
}

function timeRange(start?: string | null, end?: string | null): string {
  if (start && end) return `${fmt12(start)} – ${fmt12(end)}`
  if (start) return `From ${fmt12(start)}`
  if (end) return `Until ${fmt12(end)}`
  return ''
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  venue: Venue
  onClose: () => void
  onUpdate: () => void
}

export default function DealModal({ venue, onClose, onUpdate }: Props) {
  // — Deal state —
  const [deals, setDeals] = useState<Deal[]>(venue.deals ?? [])
  const [selectedDays, setSelectedDays] = useState<Set<DayOfWeek>>(new Set())
  const [description, setDescription] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dealError, setDealError] = useState('')

  // — Want to visit state —
  const [wtvCount, setWtvCount] = useState(0)
  const [isOnMyList, setIsOnMyList] = useState(false)
  const [visitorName, setVisitorName] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [wtvError, setWtvError] = useState('')

  // — Comment state —
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentsError, setCommentsError] = useState(false)
  const [authorName, setAuthorName] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [deleteNameInputId, setDeleteNameInputId] = useState<string | null>(null)
  const [deleteNameValue, setDeleteNameValue] = useState('')
  const [deleteCommentError, setDeleteCommentError] = useState<string | null>(null)

  // Sync deals when venue prop updates
  useEffect(() => { setDeals(venue.deals ?? []) }, [venue])

  // Load persisted names + liked IDs from localStorage
  useEffect(() => {
    const author = localStorage.getItem('ld_author_name')
    if (author) setAuthorName(author)
    const visitor = localStorage.getItem('ld_visitor_name')
    if (visitor) setVisitorName(visitor)
    try {
      const liked = localStorage.getItem('ld_liked_comments')
      if (liked) setLikedIds(new Set(JSON.parse(liked)))
    } catch {}
  }, [])

  // Fetch want-to-visit count + status
  useEffect(() => {
    const stored = localStorage.getItem('ld_visitor_name') ?? ''
    const qs = stored ? `?venue_id=${venue.id}&visitor_name=${encodeURIComponent(stored)}` : `?venue_id=${venue.id}`
    fetch(`/api/want-to-visit${qs}`)
      .then((r) => r.json())
      .then((d) => { setWtvCount(d.count ?? 0); setIsOnMyList(d.on_list ?? false) })
      .catch(() => {})
  }, [venue.id])

  // Fetch comments when modal opens
  const fetchComments = useCallback(async () => {
    setCommentsLoading(true)
    setCommentsError(false)
    try {
      const res = await fetch(`/api/comments?venue_id=${venue.id}`)
      if (!res.ok) throw new Error('Failed')
      setComments(await res.json())
    } catch {
      setCommentsError(true)
    } finally {
      setCommentsLoading(false)
    }
  }, [venue.id])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const NAMES = ['Navrin', 'Eilish', 'Tayla', 'Nic']

  // — Want to visit handlers —
  const handleToggleWtv = async () => {
    if (!visitorName) { setShowNamePrompt(true); return }
    const next = !isOnMyList
    setIsOnMyList(next)
    setWtvCount((c) => c + (next ? 1 : -1))
    setWtvError('')
    try {
      const res = await fetch('/api/want-to-visit', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venue.id, visitor_name: visitorName }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setIsOnMyList(!next)
      setWtvCount((c) => c + (next ? -1 : 1))
      setWtvError('Could not save — try again')
    }
  }

  const handleSelectName = async (name: string) => {
    setVisitorName(name)
    localStorage.setItem('ld_visitor_name', name)
    setShowNamePrompt(false)
    setWtvError('')
    setIsOnMyList(true)
    setWtvCount((c) => c + 1)
    try {
      const res = await fetch('/api/want-to-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venue.id, visitor_name: name }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setIsOnMyList(false)
      setWtvCount((c) => c - 1)
      setWtvError('Could not save — try again')
    }
  }

  // — Deal handlers —
  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const handleAddDeal = async () => {
    if (!description.trim()) { setDealError('Please enter a deal description'); return }
    if (selectedDays.size === 0) { setDealError('Select at least one day'); return }
    setAdding(true)
    setDealError('')
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          days: [...selectedDays],
          description: description.trim(),
          start_time: startTime || null,
          end_time: endTime || null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const newDeals: Deal[] = await res.json()
      setDeals((prev) => [...prev, ...newDeals])
      setDescription('')
      setSelectedDays(new Set())
      setStartTime('')
      setEndTime('')
      onUpdate()
    } catch {
      setDealError('Failed to add deal — please try again.')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteDeal = async (dealId: string) => {
    setDeletingId(dealId)
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setDeals((prev) => prev.filter((d) => d.id !== dealId))
      onUpdate()
    } catch {
      setDealError('Failed to remove deal.')
    } finally {
      setDeletingId(null)
    }
  }

  // — Comment handlers —
  const handleLike = async (commentId: string) => {
    if (likedIds.has(commentId)) return
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likes: c.likes + 1 } : c))
    const newLiked = new Set([...likedIds, commentId])
    setLikedIds(newLiked)
    localStorage.setItem('ld_liked_comments', JSON.stringify([...newLiked]))
    await fetch(`/api/comments/${commentId}/like`, { method: 'POST' })
  }

  const handleDeleteCommentConfirm = async (commentId: string) => {
    setDeletingCommentId(commentId)
    setDeleteCommentError(null)
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: deleteNameValue }),
      })
      if (res.status === 403) {
        setDeleteCommentError("Name doesn't match — try again")
        return
      }
      if (!res.ok) throw new Error('Failed')
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      setDeleteNameInputId(null)
      setDeleteNameValue('')
    } catch {
      setDeleteCommentError('Failed to delete — try again')
    } finally {
      setDeletingCommentId(null)
    }
  }

  const handlePostComment = async () => {
    if (!authorName.trim() || !commentBody.trim()) return
    setPosting(true)
    setPostError('')
    localStorage.setItem('ld_author_name', authorName.trim())
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venue.id, author_name: authorName.trim(), body: commentBody.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      const newComment: Comment = await res.json()
      setComments((prev) => [newComment, ...prev])
      setCommentBody('')
    } catch {
      setPostError('Failed to post — please try again.')
    } finally {
      setPosting(false)
    }
  }

  const dealsByDay = DAYS.reduce(
    (acc, d) => { acc[d.key] = deals.filter((deal) => deal.day_of_week === d.key); return acc },
    {} as Record<DayOfWeek, Deal[]>
  )
  const hasDays = DAYS.some((d) => dealsByDay[d.key].length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-start gap-3">
          <span className="text-3xl mt-0.5">{venue.type === 'restaurant' ? '🍽️' : '🍺'}</span>
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

        {/* Want to visit */}
        <div className="px-5 py-3 border-b border-slate-800">
          {showNamePrompt ? (
            <div>
              <p className="text-xs text-slate-400 mb-2">Who are you?</p>
              <div className="flex gap-2 flex-wrap">
                {NAMES.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleSelectName(name)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    {name}
                  </button>
                ))}
                <button
                  onClick={() => setShowNamePrompt(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-400 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleWtv}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  isOnMyList ? 'text-amber-400 hover:text-amber-300' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                <span className="text-base">{isOnMyList ? '★' : '☆'}</span>
                {isOnMyList ? `On ${visitorName}'s list` : 'Want to visit'}
              </button>
              {wtvCount > 0 && (
                <span className="text-xs text-slate-500">
                  {wtvCount} {wtvCount === 1 ? 'person' : 'people'}
                </span>
              )}
              {wtvError && <span className="text-xs text-red-400">{wtvError}</span>}
            </div>
          )}
        </div>

        {/* Scrollable body — deals + comments */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          {/* Deals section */}
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 leading-snug">{deal.description}</p>
                        {timeRange(deal.start_time, deal.end_time) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            🕐 {timeRange(deal.start_time, deal.end_time)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteDeal(deal.id)}
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

          {/* Comments section */}
          <div className="border-t border-slate-800 pt-4 mt-2">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-3 flex items-center gap-2">
              Comments
              {!commentsLoading && (
                <span className="normal-case font-normal text-slate-600">({comments.length})</span>
              )}
            </p>

            {commentsLoading && (
              <div className="space-y-4">
                {[0, 1].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-2.5 bg-slate-800 rounded w-1/3" />
                    <div className="h-2.5 bg-slate-800 rounded w-full" />
                    <div className="h-2.5 bg-slate-800 rounded w-2/3" />
                  </div>
                ))}
              </div>
            )}

            {commentsError && (
              <p className="text-slate-500 text-sm">
                Couldn&apos;t load comments.{' '}
                <button onClick={fetchComments} className="text-amber-400 hover:text-amber-300 underline">
                  Retry
                </button>
              </p>
            )}

            {!commentsLoading && !commentsError && (
              <>
                {comments.length === 0 && (
                  <p className="text-slate-600 text-sm mb-4">No comments yet — be the first!</p>
                )}
                {comments.map((comment) => (
                  <div key={comment.id} className="group mb-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-300">{comment.author_name}</span>
                      <span className="text-xs text-slate-600">{relativeTime(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-snug mb-2">{comment.body}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => handleLike(comment.id)}
                        disabled={likedIds.has(comment.id)}
                        className={`flex items-center gap-1 text-xs transition-colors ${
                          likedIds.has(comment.id)
                            ? 'text-amber-400 cursor-default'
                            : 'text-slate-500 hover:text-amber-400'
                        }`}
                      >
                        👍 {comment.likes}
                      </button>

                      {deleteNameInputId === comment.id ? (
                        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                          <input
                            type="text"
                            value={deleteNameValue}
                            onChange={(e) => setDeleteNameValue(e.target.value)}
                            placeholder="Your name to confirm"
                            autoFocus
                            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-500/50"
                          />
                          <button
                            onClick={() => handleDeleteCommentConfirm(comment.id)}
                            disabled={deletingCommentId === comment.id || !deleteNameValue.trim()}
                            className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                          >
                            {deletingCommentId === comment.id ? '…' : 'Delete'}
                          </button>
                          <button
                            onClick={() => { setDeleteNameInputId(null); setDeleteNameValue(''); setDeleteCommentError(null) }}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            Cancel
                          </button>
                          {deleteCommentError && (
                            <span className="text-xs text-red-400 w-full">{deleteCommentError}</span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDeleteNameInputId(comment.id); setDeleteNameValue(''); setDeleteCommentError(null) }}
                          className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          aria-label="Delete comment"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Add comment form */}
            <div className="mt-4 pt-4 border-t border-slate-800/60">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-3">
                Add a comment
              </p>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white placeholder-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 mb-2 transition-colors"
              />
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="What do you think of this place?"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white placeholder-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none transition-colors"
              />
              {postError && <p className="text-red-400 text-xs mt-1">{postError}</p>}
              <button
                onClick={handlePostComment}
                disabled={posting || !authorName.trim() || !commentBody.trim()}
                className="mt-2 w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>

        {/* Add deal form footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex-shrink-0">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-3">
            Add a deal
          </p>

          {/* Day multi-select */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DAYS.map((day) => {
              const active = selectedDays.has(day.key)
              return (
                <button
                  key={day.key}
                  onClick={() => toggleDay(day.key)}
                  className={`
                    px-2.5 py-1 rounded-md text-xs font-semibold transition-all
                    ${active
                      ? `${day.activeClass} ring-2 ring-white/20 scale-105`
                      : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                    }
                  `}
                >
                  {day.label.slice(0, 3)}
                </button>
              )
            })}
          </div>

          {/* Time range (optional) */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-xs text-slate-600 mb-1 block">From (optional)</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-colors [color-scheme:dark]"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-600 mb-1 block">To (optional)</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddDeal() } }}
            placeholder="e.g. 2-for-1 cocktails, 50% off food, happy hour…"
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none transition-colors"
          />
          {dealError && <p className="text-red-400 text-xs mt-1.5">{dealError}</p>}
          <button
            onClick={handleAddDeal}
            disabled={adding || !description.trim() || selectedDays.size === 0}
            className="mt-3 w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            {adding ? 'Adding…' : selectedDays.size > 1 ? `Add Deal (${selectedDays.size} days)` : 'Add Deal'}
          </button>
        </div>
      </div>
    </div>
  )
}
