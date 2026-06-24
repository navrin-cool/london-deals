import { NextRequest, NextResponse } from 'next/server'

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]

async function queryOverpass(query: string): Promise<any> {
  const body = `data=${encodeURIComponent(query)}`
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'LondonDeals/1.0 (https://london-deals-ten.vercel.app)',
    'Accept': 'application/json',
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 14000)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return await res.json()
      console.warn(`Nearby: ${endpoint} returned ${res.status}`)
    } catch (err: any) {
      clearTimeout(timer)
      console.warn(`Nearby: ${endpoint} failed: ${err.message}`)
    }
  }
  throw new Error('All Overpass endpoints failed')
}

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

  const overpassQuery =
    `[out:json][timeout:12];` +
    `(node["amenity"~"bar|pub|restaurant"](${south},${west},${north},${east});` +
    `way["amenity"~"bar|pub|restaurant"](${south},${west},${north},${east}););` +
    `out center 150;`

  try {
    const data = await queryOverpass(overpassQuery)

    const results = (data.elements as any[])
      .filter((el) => el.tags?.name)
      .map((el) => {
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
            [el.tags['addr:housenumber'], el.tags['addr:street']]
              .filter(Boolean).join(' ') || 'London',
        }
      })
      .filter(Boolean)

    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    })
  } catch (err) {
    console.error('Nearby error:', err)
    return NextResponse.json([]) // fail silently — map still works without nearby layer
  }
}
