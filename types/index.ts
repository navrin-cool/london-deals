export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface Deal {
  id: string
  venue_id: string
  day_of_week: DayOfWeek
  description: string
  start_time?: string | null
  end_time?: string | null
  created_at?: string
}

export interface Venue {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  type: string
  osm_id?: string
  created_at?: string
  deals?: Deal[]
}

export interface SearchResult {
  osm_id: string
  name: string
  lat: number
  lng: number
  type: string
  address: string
}

export interface Comment {
  id: string
  venue_id: string
  author_name: string
  body: string
  likes: number
  created_at: string
}
