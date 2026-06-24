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
