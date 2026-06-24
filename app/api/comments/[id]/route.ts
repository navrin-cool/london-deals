import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const body = await request.json()
  const { author_name } = body

  if (!author_name?.trim()) {
    return NextResponse.json({ error: 'author_name required' }, { status: 400 })
  }

  const { data: comment, error: fetchError } = await supabase
    .from('comments')
    .select('author_name')
    .eq('id', id)
    .single()

  if (fetchError || !comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  if (comment.author_name.trim().toLowerCase() !== author_name.trim().toLowerCase()) {
    return NextResponse.json({ error: "Name doesn't match" }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('comments')
    .delete()
    .eq('id', id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
