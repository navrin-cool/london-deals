import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const day = searchParams.get('day')

  const { data, error } = await supabase
    .from('venues')
    .select('*, deals(*)')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let venues = (data ?? []) as any[]

  // Day filter: only used when a specific day is requested (for sidebar filtering)
  if (day && day !== 'all') {
    venues = venues.filter((v) =>
      v.deals?.some((d: any) => d.day_of_week === day)
    )
  }
  // No day filter → return ALL DB venues so the map can show grey markers
  // for venues that exist but have no deals yet

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
