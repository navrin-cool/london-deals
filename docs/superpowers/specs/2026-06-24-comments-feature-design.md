# Comments Feature — Design Spec

**Date:** 2026-06-24
**Project:** london-deals (Next.js 14 + Supabase + Leaflet, deployed on Vercel)
**Scope:** Add named-but-unauthenticated comments with thumbs-up likes to venue establishments. Comments appear inside the existing DealModal beneath the deals list.

---

## Context

The existing app allows users to search for bars/pubs/restaurants in London, save venues to a shared Supabase database, and attach deals per day of the week. The map defaults to Haggerston station. This spec adds the one missing feature from the original requirements: comments on establishments.

---

## Data Model

### New table: `comments`

```sql
CREATE TABLE comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  author_name  TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  likes        INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_venue_id ON comments(venue_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read comments"   ON comments;
DROP POLICY IF EXISTS "Public insert comments" ON comments;
DROP POLICY IF EXISTS "Public delete comments" ON comments;

CREATE POLICY "Public read comments"   ON comments FOR SELECT USING (true);
CREATE POLICY "Public insert comments" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete comments" ON comments FOR DELETE USING (true);
```

Deletion auth (name-matching) is enforced at the API layer, not RLS, since RLS cannot inspect the request body.

### RPC function: `increment_comment_likes`

```sql
CREATE OR REPLACE FUNCTION increment_comment_likes(comment_id uuid)
RETURNS void AS $$
  UPDATE comments SET likes = likes + 1 WHERE id = comment_id;
$$ LANGUAGE sql;
```

Atomic increment avoids race conditions on the likes counter.

### `supabase-schema.sql`

The new table DDL and RPC are appended to `supabase-schema.sql` so it remains the single source of truth for database setup.

### TypeScript type

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

---

## API Routes

### `GET /api/comments?venue_id=<uuid>`
Returns all comments for a venue ordered by `created_at DESC`. Returns `[]` if no comments exist.

### `POST /api/comments`
Body: `{ venue_id: string, author_name: string, body: string }`

Validation:
- `author_name` and `body` must be non-empty after trimming
- Returns 400 with `{ error }` if validation fails

On success: inserts and returns the new `Comment` object.

### `DELETE /api/comments/[id]`
Body: `{ author_name: string }`

Logic:
1. Fetch the comment by ID
2. If not found: return 404
3. Compare `author_name.trim().toLowerCase()` against stored value (case-insensitive)
4. If mismatch: return 403 `{ error: "Name doesn't match" }`
5. If match: delete and return 200

### `POST /api/comments/[id]/like`
No body required. Calls `increment_comment_likes` RPC and returns `{ likes: number }` with the updated count.

---

## UI Changes — DealModal

The DealModal (`components/DealModal.tsx`) gains a Comments section inserted between the deals list and the "Add a deal" form.

### Comments section structure

```
[ Comments (3) ]           ← section header with count

[ Jane D.  ·  2 days ago ]
  Great happy hour deals, staff are friendly!
  [ 👍 4 ]  [ 🗑 ]         ← like button + delete (shows on hover)

[ Add a comment ]
  Your name:  [____________]   ← persisted to localStorage
  Comment:    [____________]
              [   Post     ]
```

### Like button behaviour
- Filled/active state when `localStorage` key `ld_liked_comments` (JSON array of comment IDs) contains this comment's ID
- On click: calls `POST /api/comments/[id]/like`, adds ID to `ld_liked_comments`, updates count optimistically
- Already-liked button is disabled to prevent repeat clicks in the same session

### Delete flow
- Trash icon appears on comment hover/focus
- Clicking replaces the icon with an inline input: `[ author name ] [ Confirm ]`
- On confirm: calls `DELETE /api/comments/[id]` with the entered name
- On 403: shows inline error "Name doesn't match — try again"
- On success: removes comment from list optimistically

### Add comment form
- "Your name" input: pre-filled from `localStorage` key `ld_author_name`, saved back on submit
- "Comment" textarea: cleared after successful post
- "Post" button disabled while submitting or if either field is empty
- On success: new comment prepended to the list (no full re-fetch needed)

### Loading & error states
- Comments fetch triggered when modal opens
- Loading: skeleton placeholder (two grey rows)
- Fetch failure: "Couldn't load comments" with a "Retry" link
- Post failure: inline error below the form

---

## localStorage Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `ld_author_name` | string | Persists user's display name across sessions |
| `ld_liked_comments` | JSON `string[]` | Tracks comment IDs liked by this browser |

---

## Out of Scope

- Comment editing (post is final)
- Pagination (comments are fetched all at once; venues are unlikely to have hundreds)
- Moderation / reporting
- Rate limiting (acceptable for an informal community app at this scale)
- Authentication

---

## Files Changed

| File | Change |
|------|--------|
| `supabase-schema.sql` | Append `comments` table DDL + RPC function |
| `types/index.ts` | Add `Comment` interface |
| `app/api/comments/route.ts` | New — GET + POST |
| `app/api/comments/[id]/route.ts` | New — DELETE |
| `app/api/comments/[id]/like/route.ts` | New — POST (like increment) |
| `components/DealModal.tsx` | Add Comments section |
