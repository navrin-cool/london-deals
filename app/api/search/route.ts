import { NextRequest, NextResponse } from 'next/server'

const LONDON_BBOX = '51.28,-0.51,51.69,0.33'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json([])
  }

  // Sanitise query to prevent Overpass injection
  const safeQuery = q.replace(/["\[\]()]/g, '')

  const overpassQuery = `[out:json][timeout:15];
(
  node["amenity"~"^(bar|pub|restaurant)$"]["name"~"${safeQuery}",i](${LONDON_BBOX});
  way["amenity"~"^(bar|pub|restaurant)$"]["name"~"${safeQuery}",i](${LONDON_BBOX});
);
out center 25;`

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      next: { revalidate: 300 },
    })

    if (!response.ok) throw new Error(`Overpass error: ${response.status}`)

    const data = await response.json()

    const results = (data.elements as any[])
      .filter((el) => el.tags?.name)
      .map((el) => {
        const lat = el.type === 'way' ? el.center?.lat : el.lat
        const lng = el.type === 'way' ? el.center?.lon : el.lon
        if (!lat || !lng) return null

        const addressParts = [
          el.tags['addr:housenumber'],
          el.tags['addr:street'],
          el.tags['addr:suburb'],
        ].filter(Boolean)

        return {
          osm_id: `${el.type}/${el.id}`,
          name: el.tags.name as string,
          lat: lat as number,
          lng: lng as number,
          type: el.tags.amenity as string,
          address: addressParts.length ? addressParts.join(' ') : 'London',
        }
      })
      .filter(Boolean)
      .slice(0, 20)

    return NextResponse.json(results)
  } catch (err) {
    console.error('Overpass search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
