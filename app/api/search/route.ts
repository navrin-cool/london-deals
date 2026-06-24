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
