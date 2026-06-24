import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const venue_id    = searchParams.get('venue_id')
  const visitor_name = searchParams.get('visitor_name')

  // User's full list
  if (visitor_name && !venue_id) {
    const { data: rows, error: e1 } = await supabase
      .from('want_to_visit')
      .select('venue_id')
      .eq('visitor_name', visitor_name)
      .order('created_at', { ascending: false })
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    const ids = (rows ?? []).map((r) => r.venue_id)
    if (ids.length === 0) return NextResponse.json([])

    const { data: venues, error: e2 } = await supabase
      .from('venues')
      .select('*, deals(*)')
      .in('id', ids)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    // Preserve order (most-recently-added first)
    const ordered = ids.map((id) => venues?.find((v) => v.id === id)).filter(Boolean)
    return NextResponse.json(ordered)
  }

  // Count + on-list status for a single venue
  if (venue_id) {
    const { data, error } = await supabase
      .from('want_to_visit')
      .select('visitor_name')
      .eq('venue_id', venue_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const names = (data ?? []).map((r) => r.visitor_name)
    const on_list = visitor_name ? names.includes(visitor_name) : false
    return NextResponse.json({ count: names.length, on_list })
  }

  return NextResponse.json({ error: 'Provide venue_id or visitor_name' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const { venue_id, visitor_name } = await request.json()
  if (!venue_id || !visitor_name?.trim()) {
    return NextResponse.json({ error: 'Missing venue_id or visitor_name' }, { status: 400 })
  }
  const { error } = await supabase
    .from('want_to_visit')
    .upsert({ venue_id, visitor_name: visitor_name.trim() }, { onConflict: 'venue_id,visitor_name' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { venue_id, visitor_name } = await request.json()
  if (!venue_id || !visitor_name?.trim()) {
    return NextResponse.json({ error: 'Missing venue_id or visitor_name' }, { status: 400 })
  }
  const { error } = await supabase
    .from('want_to_visit')
    .delete()
    .eq('venue_id', venue_id)
    .eq('visitor_name', visitor_name.trim())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
