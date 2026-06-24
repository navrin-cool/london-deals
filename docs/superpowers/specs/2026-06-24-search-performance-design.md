# Search Performance + Manual Venue Addition — Design Spec

**Date:** 2026-06-24
**Project:** london-deals (Next.js 14 + Supabase + Leaflet, deployed on Vercel)
**Scope:** Eliminate Overpass API latency from the search and nearby-venues flows by pre-importing all London venues into Supabase. Add a pin-drop flow for manually adding venues that aren't in the imported data.

---

## Problem

All three slow spots in the current app share the same root cause: every search query and every map-pan triggers a live Overpass API request, which takes 5–20 seconds and occasionally times out. The fix is to move venue data into Supabase so queries hit the local database instead.

---

## Approach

**One-time bulk import** of all ~3,000–5,000 bars/pubs/restaurants in London from Overpass into the existing `venues` table. After import, search and nearby queries hit Supabase directly. Overpass is no longer used at runtime.

---

## Schema Changes

No new tables. Two additions to `supabase-schema.sql`:

```sql
-- Trigram extension for fast fuzzy name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING GIN (name gin_trgm_ops);

-- Fast bounding-box range scan for nearby queries
CREATE INDEX IF NOT EXISTS idx_venues_lat_lng ON venues (lat, lng);
```

These are append-only additions — safe to run against an existing database. The `venues` table schema is unchanged.

---

## Import Script

**File:** `scripts/import-london-venues.ts`

**Run once locally:**
```bash
npx ts-node scripts/import-london-venues.ts
```

**Behaviour:**
1. Queries Overpass for all `amenity~bar|pub|restaurant` nodes and ways within `LONDON_BBOX` (`51.28,-0.51,51.69,0.33`)
2. Maps results to the `venues` schema: `osm_id`, `name`, `lat`, `lng`, `type`, `address`
3. Skips any element missing a name or valid coordinates
4. Bulk upserts into Supabase in batches of 500 using `.upsert({ onConflict: 'osm_id' })` — safe to re-run without creating duplicates
5. Logs progress: `Imported 500 / 4231…` etc.

**Expected result:** ~3,000–5,000 rows in `venues`, all with `osm_id` set, `deals` empty.

**Re-running:** Safe at any time. Existing venue rows (those with deals attached) are updated in-place via `osm_id` conflict resolution; their `deals` are unaffected.

---

## Updated API Routes

### `GET /api/search?q=<string>&lat=<number>&lng=<number>`

- `lat` and `lng` are the current map viewport centre (optional but sent by the client)
- Queries Supabase: `name ILIKE '%q%'` — the trigram GIN index makes this fast
- Returns up to 20 results
- If `lat`/`lng` provided: sorts results by Euclidean distance from viewport centre in JavaScript (no PostGIS required at this scale)
- Overpass is removed entirely from this route

### `GET /api/nearby?bbox=south,west,north,east`

- Interface unchanged — `MapComponent` sends the same bbox string as before
- Queries Supabase: `WHERE lat BETWEEN south AND north AND lng BETWEEN west AND east`
- Returns up to 150 results (same cap as before)
- The `idx_venues_lat_lng` index makes this a fast range scan
- Overpass is removed entirely from this route

---

## Client-Side Changes

### `page.tsx`
- New `mapCenter: { lat: number; lng: number }` state, initialised to `HAGGERSTON`
- Updated on every `moveend` event from `MapComponent` via a new `onCenterChange` callback
- `mapCenter` passed to `SearchPanel` so it can include `lat`/`lng` in search requests
- New `pinDropMode: boolean` state — controls the pin-drop cursor and banner
- New `onPinDropped(lat: number, lng: number)` handler — exits pin-drop mode and opens `AddVenueModal`

### `MapComponent`
- New `pinDropMode: boolean` prop
- New `onCenterChange(lat: number, lng: number)` prop — called on `moveend`
- New `onPinDropped(lat: number, lng: number)` prop
- While `pinDropMode` is true:
  - Map cursor set to `crosshair` via CSS class on the container div
  - Floating banner: *"Click anywhere on the map to place the venue"* with a Cancel button
  - Next map click calls `onPinDropped` with the clicked coordinates and places a temporary pulsing marker
  - Clicking the Cancel button exits pin-drop mode without placing a marker

### `SearchPanel`
- Accepts new `mapCenter: { lat: number; lng: number }` prop
- Includes `&lat=<lat>&lng=<lng>` in the search request URL
- Persistent **"+ Add Venue"** button below the search input, above the venue list — always visible regardless of search state
- Clicking it calls a new `onStartPinDrop` prop (triggers pin-drop mode in `page.tsx`)
- Empty search results state also shows: *"Not listed? Drop a pin on the map →"* link that triggers the same `onStartPinDrop`

---

## New Component: `AddVenueModal`

**File:** `components/AddVenueModal.tsx`

Opened by `page.tsx` after `onPinDropped` fires.

**Fields:**
- **Name** — text input, required
- **Type** — select: `bar` | `pub` | `restaurant`

**Behaviour:**
- "Add Venue" button POSTs to `/api/venues` with `{ name, type, lat, lng, address: 'London' }`
- On success: closes modal, immediately opens the existing `DealModal` so the user can add a deal, re-fetches venues list
- On cancel: removes the temporary dropped pin, returns map to normal mode
- Validates that name is non-empty before enabling the submit button

**Note:** Venues added via this flow have no `osm_id` (set to `null`). They will not be overwritten by future re-runs of the import script (which matches on `osm_id`).

---

## Files Changed

| File | Change |
|------|--------|
| `supabase-schema.sql` | Append trigram extension + two indexes |
| `scripts/import-london-venues.ts` | New — one-time bulk import script |
| `app/api/search/route.ts` | Replace Overpass with Supabase ILIKE + distance sort |
| `app/api/nearby/route.ts` | Replace Overpass with Supabase bounding-box query |
| `app/page.tsx` | Add `mapCenter`, `pinDropMode`, `onPinDropped` state + `AddVenueModal` |
| `components/MapComponent.tsx` | Add `pinDropMode`, `onCenterChange`, `onPinDropped` props |
| `components/SearchPanel.tsx` | Add `mapCenter` prop, `onStartPinDrop` prop, "+ Add Venue" button |
| `components/AddVenueModal.tsx` | New — name + type form for manually added venues |

---

## Out of Scope

- PostGIS / spatial indexing (Euclidean distance sort is sufficient for ~20 results)
- Scheduled re-imports (data staleness is acceptable for a deals app)
- Removing venues from Supabase when they close (manual curation only)
- Geocoding by address (pin-drop covers the use case)
