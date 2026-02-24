// app/api/engine-analyze/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const ENGINE_API_URL = process.env.ENGINE_API_URL ?? 'https://shogi-engine.fly.dev'

export async function POST(req: Request) {
  try {
    const { gameId } = await req.json()
    if (!gameId) return NextResponse.json({ error: 'gameId が必要です' }, { status: 400 })

    // 棋譜取得
    const { data: game } = await supabase
      .from('games')
      .select('kif_raw, evals')
      .eq('id', gameId)
      .single()

    if (!game) return NextResponse.json({ error: '棋譜が見つかりません' }, { status: 404 })
    if (game.evals) return NextResponse.json({ ok: true, cached: true })

    // Fairy-Stockfish APIに送信
    const res = await fetch(`${ENGINE_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kif: game.kif_raw }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => 'unknown')
      console.error('Engine API error:', res.status, detail)
      return NextResponse.json({ error: 'エンジン解析に失敗しました' }, { status: 502 })
    }

    const result = await res.json()

    // gamesテーブルに保存
    const { error } = await supabase
      .from('games')
      .update({ evals: result.evals, blunders: result.blunders })
      .eq('id', gameId)

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: 'DB更新に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cached: false })
  } catch (e) {
    console.error('Engine analyze error:', e)
    const message = e instanceof Error ? e.message : '不明なエラー'
    return NextResponse.json({ error: `解析に失敗しました: ${message}` }, { status: 500 })
  }
}
