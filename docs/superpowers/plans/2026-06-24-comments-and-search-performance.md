# Comments + Search Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named-but-unauthenticated comments with likes to venue modals, and eliminate Overpass API latency by pre-importing all London venues into Supabase with fast indexed queries.

**Architecture:** All venue data moves from live Overpass API calls into Supabase via a one-time bulk import script. Search and nearby queries hit Supabase with trigram and bounding-box indexes. Comments are a new Supabase table with an atomic RPC for likes. A pin-drop flow lets users add missing venues directly on the map.

**Tech Stack:** Next.js 14, TypeScript, Supabase (`@supabase/supabase-js`), Leaflet, Tailwind CSS, `tsx` (via `npx`), `dotenv`

## Global Constraints

- Next.js 14 App Router — all API routes use `NextRequest`/`NextResponse`
- Supabase anon key only — no service role key; RLS policies cover all access
- No test framework installed — verify each task via `curl` commands and browser inspection
- Tailwind dark theme: `bg-slate-900`, `text-slate-*`, amber accent `#f59e0b`
- All API routes live under `app/api/`; components under `components/`
- `supabase-schema.sql` is the single source of truth for all DDL — always append, never replace

---

## Task 1: Diagnose and fix existing Supabase schema

**Files:**
- Modify: `supabase-schema.sql` (no code changes — run as-is in Supabase)
- Read: `.env.local`

**Interfaces:**
- Produces: working Supabase connection with `venues` and `deals` tables accessible

- [ ] **Step 1: Verify env vars are set**

Open `.env.local` and confirm both values are present and non-empty:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

If either is missing: go to your Supabase project → Settings → API → copy the Project URL and `anon public` key.

- [ ] **Step 2: Run the base schema in Supabase SQL Editor**

Open your Supabase project → SQL Editor → New query. Paste the entire contents of `supabase-schema.sql` and click Run.

Expected: no errors. If you see "relation already exists" that is fine — the schema uses `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS` guards.

Common errors and fixes:
- `"permission denied for schema public"` → go to Settings → Database → enable "Enable Row Level Security by default" is OFF, then retry
- `"already exists"` on index → safe to ignore, the `IF NOT EXISTS` guards should prevent this; if it persists, click the error to see which line and skip re-running that line

- [ ] **Step 3: Verify connectivity via dev server**

```bash
cd /Users/navrinsecker/london-deals && npm run dev
```

Open http://localhost:3000. The sidebar should show the venue list without the red "Database not connected" banner. If the banner appears, check browser console for the actual error from `/api/venues`.

- [ ] **Step 4: Commit confirmation note**

No code changes needed in this task. Move on once the app loads without the database error banner.

---

## Task 2: Append schema additions to `supabase-schema.sql` and apply in Supabase

**Files:**
- Modify: `supabase-schema.sql`

**Interfaces:**
- Produces: `comments` table, `increment_comment_likes` RPC, `idx_venues_name_trgm` GIN index, `idx_venues_lat_lng` index

- [ ] **Step 1: Append the new SQL sections to `supabase-schema.sql`**

Open `supabase-schema.sql` and add the following at the very end of the file:

```sql
-- ─── Performance indexes ─────────────────────────────────────────────────────
-- Required before the bulk import (Task 5) for fast search and nearby queries.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_lat_lng   ON venues (lat, lng);

-- ─── Comments ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  author_name  TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  likes        INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_venue_id ON comments(venue_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read comments"   ON comments;
DROP POLICY IF EXISTS "Public insert comments" ON comments;
DROP POLICY IF EXISTS "Public delete comments" ON comments;

CREATE POLICY "Public read comments"   ON comments FOR SELECT USING (true);
CREATE POLICY "Public insert comments" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete comments" ON comments FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION increment_comment_likes(comment_id uuid)
RETURNS void AS $$
  UPDATE comments SET likes = likes + 1 WHERE id = comment_id;
$$ LANGUAGE sql;
```

- [ ] **Step 2: Run the new sections in Supabase SQL Editor**

Copy only the newly appended SQL (from `CREATE EXTENSION` to the end of the `increment_comment_likes` function) and run it in Supabase SQL Editor.

Expected: no errors. The `pg_trgm` extension may say "already exists" — that is fine.

- [ ] **Step 3: Verify the comments table exists**

In Supabase SQL Editor:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'comments' ORDER BY ordinal_position;
```

Expected output: rows for `id`, `venue_id`, `author_name`, `body`, `likes`, `created_at`.

- [ ] **Step 4: Commit**

```bash
cd /Users/navrinsecker/london-deals
git add supabase-schema.sql
git commit -m "feat: add comments table, likes RPC, and venue search/nearby indexes"
```

---

## Task 3: Add `Comment` type and comments API routes

**Files:**
- Modify: `types/index.ts`
- Create: `app/api/comments/route.ts`
- Create: `app/api/comments/[id]/route.ts`
- Create: `app/api/comments/[id]/like/route.ts`

**Interfaces:**
- Consumes: `supabase` client from `@/lib/supabase`, `comments` table from Task 2
- Produces:
  - `Comment` interface: `{ id: string, venue_id: string, author_name: string, body: string, likes: number, created_at: string }`
  - `GET /api/comments?venue_id=<uuid>` → `Comment[]`
  - `POST /api/comments` body `{ venue_id, author_name, body }` → `Comment`
  - `DELETE /api/comments/[id]` body `{ author_name }` → `200 | 403 | 404`
  - `POST /api/comments/[id]/like` → `{ likes: number }`

- [ ] **Step 1: Add `Comment` interface to `types/index.ts`**

Add after the existing `SearchResult` interface:

```ts
export interface Comment {
  id: string
  venue_id: string
  author_name: string
  body: string
  likes: number
  created_at: string
}
```

- [ ] **Step 2: Create `app/api/comments/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const venue_id = searchParams.get('venue_id')

  if (!venue_id) {
    return NextResponse.json({ error: 'venue_id required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('venue_id', venue_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { venue_id, author_name, body: commentBody } = body

  if (!venue_id || !author_name?.trim() || !commentBody?.trim()) {
    return NextResponse.json(
      { error: 'venue_id, author_name and body are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({ venue_id, author_name: author_name.trim(), body: commentBody.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/api/comments/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const body = await request.json()
  const { author_name } = body

  if (!author_name?.trim()) {
    return NextResponse.json({ error: 'author_name required' }, { status: 400 })
  }

  const { data: comment, error: fetchError } = await supabase
    .from('comments')
    .select('author_name')
    .eq('id', id)
    .single()

  if (fetchError || !comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  if (comment.author_name.trim().toLowerCase() !== author_name.trim().toLowerCase()) {
    return NextResponse.json({ error: "Name doesn't match" }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('comments')
    .delete()
    .eq('id', id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create `app/api/comments/[id]/like/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  const { error } = await supabase.rpc('increment_comment_likes', { comment_id: id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data, error: fetchError } = await supabase
    .from('comments')
    .select('likes')
    .eq('id', id)
    .single()

  if (fetchError || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ likes: data.likes })
}
```

- [ ] **Step 5: Verify routes with curl (dev server must be running)**

```bash
# First, get a venue id from the DB
curl -s "http://localhost:3000/api/venues" | head -c 200

# POST a comment (replace VENUE_ID with a real UUID from the above)
curl -s -X POST http://localhost:3000/api/comments \
  -H "Content-Type: application/json" \
  -d '{"venue_id":"VENUE_ID","author_name":"Test User","body":"Great spot!"}' | jq .

# GET comments for that venue
curl -s "http://localhost:3000/api/comments?venue_id=VENUE_ID" | jq .

# Like the comment (replace COMMENT_ID with id from POST response)
curl -s -X POST http://localhost:3000/api/comments/COMMENT_ID/like | jq .

# Delete with wrong name → expect 403
curl -s -X DELETE http://localhost:3000/api/comments/COMMENT_ID \
  -H "Content-Type: application/json" \
  -d '{"author_name":"Wrong Name"}' | jq .

# Delete with correct name → expect {"ok":true}
curl -s -X DELETE http://localhost:3000/api/comments/COMMENT_ID \
  -H "Content-Type: application/json" \
  -d '{"author_name":"Test User"}' | jq .
```

Expected for wrong name: `{"error":"Name doesn't match"}` with HTTP 403.
Expected for correct name: `{"ok":true}` with HTTP 200.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts app/api/comments/
git commit -m "feat: add comments API routes and Comment type"
```

---

## Task 4: Add comments section to `DealModal`

**Files:**
- Modify: `components/DealModal.tsx`

**Interfaces:**
- Consumes: `Comment` from `@/types`, `GET /api/comments`, `POST /api/comments`, `DELETE /api/comments/[id]`, `POST /api/comments/[id]/like`
- Produces: updated DealModal with comments list + add-comment form below the deals list

- [ ] **Step 1: Replace `components/DealModal.tsx` with the updated version**

```tsx
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
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dealError, setDealError] = useState('')

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

  // Load author name + liked comment IDs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ld_author_name')
    if (saved) setAuthorName(saved)
    try {
      const liked = localStorage.getItem('ld_liked_comments')
      if (liked) setLikedIds(new Set(JSON.parse(liked)))
    } catch {}
  }, [])

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

  // — Deal handlers —
  const handleAddDeal = async () => {
    if (!description.trim()) { setDealError('Please enter a deal description'); return }
    setAdding(true)
    setDealError('')
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
                      <p className="flex-1 text-sm text-slate-200 leading-snug">{deal.description}</p>
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
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddDeal() } }}
            placeholder="e.g. 2-for-1 cocktails 5–8pm, 50% off food, happy hour all night…"
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500/50 text-white placeholder-slate-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none transition-colors"
          />
          {dealError && <p className="text-red-400 text-xs mt-1.5">{dealError}</p>}
          <button
            onClick={handleAddDeal}
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
```

- [ ] **Step 2: Verify in browser**

Start the dev server (`npm run dev`). Open any venue in the DealModal. Confirm:
- Comments section appears below the deals list with a "Comments (0)" header
- Two grey skeleton rows appear briefly while loading
- "No comments yet" message shows once loaded
- Typing a name and comment then clicking Post adds the comment to the list
- Hovering a comment reveals the trash icon
- Clicking trash shows the inline name-confirm input
- Entering wrong name shows "Name doesn't match — try again"
- Entering correct name removes the comment
- Clicking 👍 increments the count and turns the button amber; reloading the modal and re-liking is blocked (button stays amber and disabled)
- Your name is pre-filled after posting once (from localStorage)

- [ ] **Step 3: Commit**

```bash
git add components/DealModal.tsx
git commit -m "feat: add comments section to DealModal with likes and delete-by-name"
```

---

## Task 5: Build and run the London venues import script

**Files:**
- Create: `scripts/import-london-venues.ts`

**Interfaces:**
- Consumes: Supabase `venues` table, `.env.local` for credentials, Overpass API (one-time only)
- Produces: ~3,000–5,000 rows in `venues` table with `osm_id`, `name`, `lat`, `lng`, `type`, `address`

- [ ] **Step 1: Install `dotenv` as a dev dependency**

```bash
cd /Users/navrinsecker/london-deals && npm install --save-dev dotenv
```

Expected: `dotenv` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create `scripts/import-london-venues.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const LONDON_BBOX = '51.28,-0.51,51.69,0.33'
const BATCH_SIZE = 500
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]

interface VenueRow {
  osm_id: string
  name: string
  lat: number
  lng: number
  type: string
  address: string
}

async function queryOverpass(query: string): Promise<any> {
  const body = `data=${encodeURIComponent(query)}`
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'LondonDeals/1.0',
    Accept: 'application/json',
  }
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return await res.json()
      console.warn(`${endpoint} → ${res.status}`)
    } catch (err: any) {
      clearTimeout(timer)
      console.warn(`${endpoint} failed: ${err.message}`)
    }
  }
  throw new Error('All Overpass endpoints failed')
}

async function main() {
  const query =
    `[out:json][timeout:90];` +
    `(node["amenity"~"bar|pub|restaurant"](${LONDON_BBOX});` +
    `way["amenity"~"bar|pub|restaurant"](${LONDON_BBOX}););` +
    `out center;`

  console.log('Fetching London venues from Overpass (this may take 30–60 seconds)…')
  const data = await queryOverpass(query)

  const venues: VenueRow[] = (data.elements as any[])
    .filter((el: any) => el.tags?.name)
    .map((el: any) => {
      const lat = el.type === 'way' ? el.center?.lat : el.lat
      const lng = el.type === 'way' ? el.center?.lon : el.lon
      if (!lat || !lng) return null
      return {
        osm_id: `${el.type}/${el.id}`,
        name: el.tags.name as string,
        lat: lat as number,
        lng: lng as number,
        type: el.tags.amenity as string,
        address:
          [el.tags['addr:housenumber'], el.tags['addr:street'], el.tags['addr:suburb']]
            .filter(Boolean)
            .join(' ') || 'London',
      }
    })
    .filter((v: any): v is VenueRow => v !== null)

  console.log(`Fetched ${venues.length} venues. Upserting in batches of ${BATCH_SIZE}…`)

  let imported = 0
  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const batch = venues.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('venues')
      .upsert(batch, { onConflict: 'osm_id' })
    if (error) {
      console.error(`Batch ${i}–${i + batch.length} failed: ${error.message}`)
    } else {
      imported += batch.length
      console.log(`  Imported ${imported} / ${venues.length}`)
    }
  }
  console.log(`Done! ${imported} venues in Supabase.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Run the import script**

```bash
cd /Users/navrinsecker/london-deals && npx tsx scripts/import-london-venues.ts
```

This will take 30–90 seconds (Overpass query) then stream batch progress. Expected output:
```
Fetching London venues from Overpass (this may take 30–60 seconds)…
Fetched 4183 venues. Upserting in batches of 500…
  Imported 500 / 4183
  Imported 1000 / 4183
  ...
Done! 4183 venues in Supabase.
```

If Overpass times out, wait a few minutes and retry — the upsert is idempotent.

- [ ] **Step 4: Verify row count in Supabase**

In Supabase SQL Editor:
```sql
SELECT COUNT(*) FROM venues;
SELECT type, COUNT(*) FROM venues GROUP BY type ORDER BY count DESC;
```

Expected: 3,000–6,000 total rows; `bar`, `pub`, `restaurant` types.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-london-venues.ts package.json package-lock.json
git commit -m "feat: add London venues bulk import script"
```

---

## Task 6: Replace Overpass with Supabase in `/api/search` and `/api/nearby`

**Files:**
- Modify: `app/api/search/route.ts`
- Modify: `app/api/nearby/route.ts`

**Interfaces:**
- Consumes: Supabase `venues` table (populated by Task 5), `idx_venues_name_trgm` and `idx_venues_lat_lng` indexes from Task 2
- Produces:
  - `GET /api/search?q=<string>&lat=<number>&lng=<number>` → `SearchResult[]` (up to 20, sorted by distance from viewport)
  - `GET /api/nearby?bbox=<south,west,north,east>` → `SearchResult[]` (up to 150, cached 5 min)

- [ ] **Step 1: Replace `app/api/search/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (!q || q.length < 2) return NextResponse.json([])

  const { data, error } = await supabase
    .from('venues')
    .select('id, osm_id, name, lat, lng, type, address')
    .ilike('name', `%${q}%`)
    .limit(50)

  if (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed — try again' }, { status: 500 })
  }

  let results = (data ?? []) as any[]

  if (!isNaN(lat) && !isNaN(lng)) {
    results = results.sort((a, b) => {
      const dA = (a.lat - lat) ** 2 + (a.lng - lng) ** 2
      const dB = (b.lat - lat) ** 2 + (b.lng - lng) ** 2
      return dA - dB
    })
  }

  return NextResponse.json(results.slice(0, 20))
}
```

- [ ] **Step 2: Replace `app/api/nearby/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const bbox = searchParams.get('bbox')

  if (!bbox) return NextResponse.json([])

  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return NextResponse.json([])

  const [south, west, north, east] = parts

  if (south < 51.0 || north > 52.0 || west < -0.8 || east > 0.5) {
    return NextResponse.json([])
  }

  const { data, error } = await supabase
    .from('venues')
    .select('id, osm_id, name, lat, lng, type, address')
    .gte('lat', south)
    .lte('lat', north)
    .gte('lng', west)
    .lte('lng', east)
    .limit(150)

  if (error) {
    console.error('Nearby error:', error)
    return NextResponse.json([])
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  })
}
```

- [ ] **Step 3: Verify speed in browser**

With dev server running, open http://localhost:3000. Type 3+ characters in the search box. Results should appear within 200–500ms (no more 5–20 second waits). Pan the map — nearby grey pins should appear almost instantly.

Also verify via curl:
```bash
# Search — should return results in under 1 second
time curl -s "http://localhost:3000/api/search?q=dove&lat=51.5393&lng=-0.0762" | jq 'length'

# Nearby — should return results in under 500ms
time curl -s "http://localhost:3000/api/nearby?bbox=51.53,-0.09,51.55,-0.06" | jq 'length'
```

- [ ] **Step 4: Commit**

```bash
git add app/api/search/route.ts app/api/nearby/route.ts
git commit -m "perf: replace Overpass with Supabase for search and nearby queries"
```

---

## Task 7: Add pin-drop mode and center tracking to `MapComponent`

**Files:**
- Modify: `components/MapComponent.tsx`

**Interfaces:**
- Consumes: existing `Props` interface
- Produces updated `Props`:
  ```ts
  interface Props {
    venues: Venue[]
    focusVenue: SearchResult | null
    selectedDay: DayOfWeek | 'all'
    onVenueClick: (venue: Venue) => void
    onNearbyClick: (venue: SearchResult) => void
    pinDropMode: boolean
    onCenterChange: (lat: number, lng: number) => void
    onPinDropped: (lat: number, lng: number) => void
  }
  ```
- Produces: crosshair cursor + floating banner when `pinDropMode` is true; `onCenterChange` fires on `moveend`; `onPinDropped` fires on map click when `pinDropMode` is true

- [ ] **Step 1: Update the `Props` interface in `MapComponent.tsx`**

Replace the existing `interface Props` block:

```ts
interface Props {
  venues: Venue[]
  focusVenue: SearchResult | null
  selectedDay: DayOfWeek | 'all'
  onVenueClick: (venue: Venue) => void
  onNearbyClick: (venue: SearchResult) => void
  pinDropMode: boolean
  onCenterChange: (lat: number, lng: number) => void
  onPinDropped: (lat: number, lng: number) => void
}
```

- [ ] **Step 2: Update the component signature and add new refs**

Replace the existing function signature line:

```ts
export default function MapComponent({ venues, focusVenue, selectedDay, onVenueClick, onNearbyClick, pinDropMode, onCenterChange, onPinDropped }: Props) {
```

Add three new refs alongside the existing ones (after `const fetchingRef = useRef(false)`):

```ts
const onCenterChangeRef  = useRef(onCenterChange)
const onPinDroppedRef    = useRef(onPinDropped)
const pinDropModeRef     = useRef(pinDropMode)
```

Add three new `useEffect` calls to keep refs in sync (alongside the existing `onClickRef`/`onNearbyRef` effects):

```ts
useEffect(() => { onCenterChangeRef.current  = onCenterChange  }, [onCenterChange])
useEffect(() => { onPinDroppedRef.current    = onPinDropped    }, [onPinDropped])
useEffect(() => { pinDropModeRef.current     = pinDropMode     }, [pinDropMode])
```

- [ ] **Step 3: Add `onCenterChange` to the map `moveend` handler**

Inside the map initialisation `useEffect`, find the existing `onMove` function and update it:

```ts
const onMove = () => {
  clearTimeout(moveTimer)
  moveTimer = setTimeout(() => fetchNearby(map), 900)
  const c = map.getCenter()
  onCenterChangeRef.current(c.lat, c.lng)
}
```

- [ ] **Step 4: Add the pin-drop click handler `useEffect`**

Add this new `useEffect` after the focus layer effect:

```ts
useEffect(() => {
  const map = mapRef.current
  if (!map) return

  const handlePinClick = (e: L.LeafletMouseEvent) => {
    if (!pinDropModeRef.current) return
    onPinDroppedRef.current(e.latlng.lat, e.latlng.lng)
  }

  if (pinDropMode) {
    map.on('click', handlePinClick)
    return () => { map.off('click', handlePinClick) }
  }
}, [pinDropMode])
```

- [ ] **Step 5: Update the return JSX to support crosshair + banner**

Replace the existing `return <div ref={divRef} className="w-full h-full" />` with:

```tsx
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
```

- [ ] **Step 6: Verify in browser**

The map should still load normally. Center tracking and pin-drop are wired up but not yet triggerable from the UI (that comes in Task 9). Confirm no TypeScript errors:

```bash
cd /Users/navrinsecker/london-deals && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/MapComponent.tsx
git commit -m "feat: add pin-drop mode and center tracking to MapComponent"
```

---

## Task 8: Update `SearchPanel` with viewport-aware search and "+ Add Venue" button

**Files:**
- Modify: `components/SearchPanel.tsx`

**Interfaces:**
- Consumes: existing `Props` + new `mapCenter: { lat: number; lng: number }` and `onStartPinDrop: () => void`
- Produces: search requests include `&lat=&lng=`; always-visible "+ Add Venue" button; empty-state pin-drop link

- [ ] **Step 1: Update the `Props` interface in `SearchPanel.tsx`**

Replace the existing `interface Props`:

```ts
interface Props {
  selectedDay: DayOfWeek | 'all'
  venues: Venue[]
  loading: boolean
  onVenueSelect: (venue: SearchResult | null) => void
  onOpenDeals: (venue: Venue) => void
  onAddFromSearch: (result: SearchResult) => void
  mapCenter: { lat: number; lng: number }
  onStartPinDrop: () => void
}
```

- [ ] **Step 2: Update the component signature**

```ts
export default function SearchPanel({
  selectedDay,
  venues,
  loading,
  onVenueSelect,
  onOpenDeals,
  onAddFromSearch,
  mapCenter,
  onStartPinDrop,
}: Props) {
```

- [ ] **Step 3: Include `lat`/`lng` in the search fetch call**

Find the line:
```ts
const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
```

Replace with:
```ts
const res = await fetch(
  `/api/search?q=${encodeURIComponent(q)}&lat=${mapCenter.lat}&lng=${mapCenter.lng}`
)
```

- [ ] **Step 4: Add the "+ Add Venue" button**

After the closing `</div>` of the search input section (the `p-3 border-b` div), add:

```tsx
{/* Add Venue button */}
<div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
  <button
    onClick={onStartPinDrop}
    className="w-full text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-lg py-2 transition-colors"
  >
    + Add Venue
  </button>
</div>
```

- [ ] **Step 5: Add the empty-state pin-drop link**

Find the empty search results block:
```tsx
{!searching && searchResults.length === 0 && !searchError && (
  <div className="px-4 py-8 text-center text-slate-500 text-sm">
    No venues found for &ldquo;{query}&rdquo;
  </div>
)}
```

Replace with:
```tsx
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
```

- [ ] **Step 6: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

`page.tsx` will error because it hasn't been updated yet to pass the new props — that is expected and will be fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add components/SearchPanel.tsx
git commit -m "feat: viewport-aware search and add-venue button in SearchPanel"
```

---

## Task 9: Create `AddVenueModal` and wire everything into `page.tsx`

**Files:**
- Create: `components/AddVenueModal.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `MapComponent` props (`pinDropMode`, `onCenterChange`, `onPinDropped`), `SearchPanel` props (`mapCenter`, `onStartPinDrop`), `POST /api/venues`
- Produces: complete pin-drop flow — user clicks "+ Add Venue" → sidebar collapses → crosshair cursor → click map → AddVenueModal → on submit → DealModal opens

- [ ] **Step 1: Create `components/AddVenueModal.tsx`**

```tsx
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
```

- [ ] **Step 2: Update `app/page.tsx` — add imports**

At the top of the file, add the `AddVenueModal` import after the existing component imports:

```ts
import AddVenueModal from '@/components/AddVenueModal'
```

Also update the dynamic import for `MapComponent` — the existing signature is changing, but the dynamic import itself doesn't need updating since it imports by path.

- [ ] **Step 3: Add new state to `page.tsx`**

Add these four new state declarations inside the `Home` component, after the existing `useState` declarations:

```ts
const HAGGERSTON = { lat: 51.5393, lng: -0.0762 }
const [mapCenter, setMapCenter]   = useState(HAGGERSTON)
const [pinDropMode, setPinDropMode] = useState(false)
const [droppedPin, setDroppedPin]  = useState<{ lat: number; lng: number } | null>(null)
```

- [ ] **Step 4: Add new callbacks to `page.tsx`**

Add these four callbacks after the existing `handleOpenDeals` callback:

```ts
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
```

- [ ] **Step 5: Update the `SearchPanel` JSX in `page.tsx`**

Find the `<SearchPanel` usage and add the two new props:

```tsx
<SearchPanel
  selectedDay={selectedDay}
  venues={venues}
  loading={loadingVenues}
  onVenueSelect={setFocusVenue}
  onOpenDeals={handleOpenDeals}
  onAddFromSearch={handleAddFromSearch}
  mapCenter={mapCenter}
  onStartPinDrop={handleStartPinDrop}
/>
```

- [ ] **Step 6: Update the `MapComponent` JSX in `page.tsx`**

Find the `<MapComponent` usage and add the three new props:

```tsx
<MapComponent
  venues={venues}
  focusVenue={focusVenue}
  selectedDay={selectedDay}
  onVenueClick={handleOpenDeals}
  onNearbyClick={handleAddFromSearch}
  pinDropMode={pinDropMode}
  onCenterChange={(lat, lng) => setMapCenter({ lat, lng })}
  onPinDropped={handlePinDropped}
/>
```

- [ ] **Step 7: Add `AddVenueModal` to the JSX render**

After the `{modalVenue && <DealModal ... />}` block, add:

```tsx
{droppedPin && (
  <AddVenueModal
    lat={droppedPin.lat}
    lng={droppedPin.lng}
    onClose={handleCancelAddVenue}
    onAdded={handleVenueAdded}
  />
)}
```

- [ ] **Step 8: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Full end-to-end browser test**

With dev server running:

1. **Search speed**: type "eagle" in the search box — results appear in under 500ms
2. **Nearby pins**: pan around Haggerston — grey ghost pins appear almost instantly for all bars/pubs/restaurants
3. **Viewport sorting**: search "bar" near Dalston — results closest to the current map view appear first
4. **Add Venue button**: click "+ Add Venue" in the sidebar — sidebar collapses, map goes to crosshair cursor, banner appears
5. **Pin drop**: click anywhere on the map — `AddVenueModal` opens with name + type fields
6. **Cancel**: click Cancel — modal closes, sidebar reopens, cursor returns to normal
7. **Add venue**: enter a name, select type, click "Add Venue" — venue is saved, DealModal opens immediately so a deal can be added
8. **Empty search + pin-drop**: search for something obscure, see "Not listed? Drop a pin →" link, click it — same pin-drop flow triggers

- [ ] **Step 10: Commit**

```bash
git add components/AddVenueModal.tsx app/page.tsx
git commit -m "feat: pin-drop venue addition with AddVenueModal and page.tsx wiring"
```

---

## Self-Review Checklist

- [x] **Spec coverage (comments):** `comments` table ✓ Task 2, `Comment` type ✓ Task 3, GET/POST/DELETE/like routes ✓ Task 3, DealModal comments section ✓ Task 4, localStorage `ld_author_name`/`ld_liked_comments` ✓ Task 4, skeleton loading ✓ Task 4, retry on error ✓ Task 4
- [x] **Spec coverage (search performance):** pg_trgm + indexes ✓ Task 2, import script ✓ Task 5, `/api/search` Supabase ✓ Task 6, `/api/nearby` Supabase ✓ Task 6, `mapCenter` state ✓ Task 9, `onCenterChange` ✓ Task 7, `pinDropMode` ✓ Tasks 7+9, `onPinDropped` ✓ Tasks 7+9, "+ Add Venue" button ✓ Task 8, empty-state link ✓ Task 8, `AddVenueModal` ✓ Task 9
- [x] **Type consistency:** `Comment` defined in Task 3, consumed in Task 4. `Venue` imported in `AddVenueModal` from `@/types`. `mapCenter` shape `{ lat, lng }` consistent across Tasks 7, 8, 9. `onPinDropped(lat, lng)` signature consistent in `MapComponent` (Task 7) and `page.tsx` (Task 9).
- [x] **Placeholders:** None.
