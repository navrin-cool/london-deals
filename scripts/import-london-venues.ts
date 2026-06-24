import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const LONDON_BBOX = '51.28,-0.51,51.69,0.33'
const BATCH_SIZE = 500
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]

interface VenueRow {
  osm_id: string
  name: string
  lat: number
  lng: number
  type: string
  address: string
}

async function queryOverpass(query: string): Promise<any> {
  const body = `data=${encodeURIComponent(query)}`
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'LondonDeals/1.0',
    Accept: 'application/json',
  }
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return await res.json()
      console.warn(`${endpoint} → ${res.status}`)
    } catch (err: any) {
      clearTimeout(timer)
      console.warn(`${endpoint} failed: ${err.message}`)
    }
  }
  throw new Error('All Overpass endpoints failed')
}

async function main() {
  const query =
    `[out:json][timeout:90];` +
    `(node["amenity"~"bar|pub|restaurant"](${LONDON_BBOX});` +
    `way["amenity"~"bar|pub|restaurant"](${LONDON_BBOX}););` +
    `out center;`

  console.log('Fetching London venues from Overpass (this may take 30–60 seconds)…')
  const data = await queryOverpass(query)

  const venues: VenueRow[] = (data.elements as any[])
    .filter((el: any) => el.tags?.name)
    .map((el: any) => {
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
          [el.tags['addr:housenumber'], el.tags['addr:street'], el.tags['addr:suburb']]
            .filter(Boolean)
            .join(' ') || 'London',
      }
    })
    .filter((v: any): v is VenueRow => v !== null)

  console.log(`Fetched ${venues.length} venues. Upserting in batches of ${BATCH_SIZE}…`)

  let imported = 0
  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const batch = venues.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('venues')
      .upsert(batch, { onConflict: 'osm_id' })
    if (error) {
      console.error(`Batch ${i}–${i + batch.length} failed: ${error.message}`)
    } else {
      imported += batch.length
      console.log(`  Imported ${imported} / ${venues.length}`)
    }
  }
  console.log(`Done! ${imported} venues in Supabase.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
