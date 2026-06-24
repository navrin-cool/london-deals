import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const day = searchParams.get('day')
  const osmId = searchParams.get('osm_id')

  // Single-venue lookup by osm_id (used by sidebar click)
  if (osmId) {
    const { data, error } = await supabase
      .from('venues')
      .select('*, deals(*)')
      .eq('osm_id', osmId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(data)
  }

  // List: only return venues that have at least one deal (keeps payload small)
  const { data, error } = await supabase
    .from('venues')
    .select('*, deals(*)')
    .not('deals', 'is', null)
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let venues = ((data ?? []) as any[]).filter((v) => v.deals?.length > 0)

  if (day && day !== 'all') {
    venues = venues.filter((v) =>
      v.deals?.some((d: any) => d.day_of_week === day)
    )
  }

  return NextResponse.json(venues)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, lat, lng, type, address, osm_id } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 })
  }

  if (osm_id) {
    const { data: existing } = await supabase
      .from('venues')
      .select('*, deals(*)')
      .eq('osm_id', osm_id)
      .maybeSingle()

    if (existing) return NextResponse.json(existing)
  }

  const { data, error } = await supabase
    .from('venues')
    .insert({
      name: name.trim(),
      address: address || 'London',
      lat,
      lng,
      type: type || 'bar',
      osm_id: osm_id ?? null,
    })
    .select('*, deals(*)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
