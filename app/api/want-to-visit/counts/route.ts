import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/want-to-visit/counts?venue_ids=id1,id2,...
// Returns { [venue_id]: count }
export async function GET(request: NextRequest) {
  const ids = (new URL(request.url).searchParams.get('venue_ids') ?? '')
    .split(',')
    .filter(Boolean)

  if (ids.length === 0) return NextResponse.json({})

  const { data, error } = await supabase
    .from('want_to_visit')
    .select('venue_id')
    .in('venue_id', ids)

  if (error) return NextResponse.json({})

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.venue_id] = (counts[row.venue_id] ?? 0) + 1
  }
  return NextResponse.json(counts)
}
