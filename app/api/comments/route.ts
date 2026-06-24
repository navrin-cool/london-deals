import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const venue_id = searchParams.get('venue_id')

  if (!venue_id) {
    return NextResponse.json({ error: 'venue_id required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('venue_id', venue_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { venue_id, author_name, body: commentBody } = body

  if (!venue_id || !author_name?.trim() || !commentBody?.trim()) {
    return NextResponse.json(
      { error: 'venue_id, author_name and body are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({ venue_id, author_name: author_name.trim(), body: commentBody.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
