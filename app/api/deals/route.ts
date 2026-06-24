import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { venue_id, days, description, start_time, end_time } = body

  if (!venue_id || !Array.isArray(days) || days.length === 0 || !description?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const valid = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
  if (days.some((d: string) => !valid.includes(d))) {
    return NextResponse.json({ error: 'Invalid day_of_week value' }, { status: 400 })
  }

  const rows = days.map((day: string) => ({
    venue_id,
    day_of_week: day,
    description: description.trim(),
    start_time: start_time || null,
    end_time:   end_time   || null,
  }))

  const { data, error } = await supabase
    .from('deals')
    .insert(rows)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
