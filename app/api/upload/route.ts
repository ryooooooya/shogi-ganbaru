// app/api/upload/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseKif } from '@/lib/kif-parser'

export async function POST(req: Request) {
  const formData = await req.formData()
  const files = formData.getAll('kif') as File[]

  if (files.length === 0)
    return NextResponse.json({ error: 'KIFファイルがありません' }, { status: 400 })

  let saved = 0, skipped = 0
  const errors: string[] = []

  for (const file of files) {
    const text = await file.text()
    const record = parseKif(text)
    if (!record) { errors.push(`${file.name}: パース失敗`); continue }

    // 重複チェック
    const { data: existing } = await supabase
      .from('games').select('id')
      .eq('game_date', record.game_date)
      .eq('opponent', record.opponent)
      .maybeSingle()

    if (existing) { skipped++; continue }

    const { error } = await supabase.from('games').insert(record)
    if (error) errors.push(`${file.name}: ${error.message}`)
    else saved++
  }

  return NextResponse.json({ ok: true, saved, skipped, errors })
}
