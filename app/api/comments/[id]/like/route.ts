import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  const { error } = await supabase.rpc('increment_comment_likes', { comment_id: id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data, error: fetchError } = await supabase
    .from('comments')
    .select('likes')
    .eq('id', id)
    .single()

  if (fetchError || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ likes: data.likes })
}
