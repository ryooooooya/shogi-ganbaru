// app/api/analyze/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(req: Request) {
  const { gameId } = await req.json()
  if (!gameId) return NextResponse.json({ error: 'gameId が必要です' }, { status: 400 })

  // 既存の分析があれば返す
  const { data: existing } = await supabase
    .from('analyses').select('comment').eq('game_id', gameId).maybeSingle()
  if (existing) return NextResponse.json({ comment: existing.comment, cached: true })

  // 棋譜取得
  const { data: game } = await supabase
    .from('games').select('kif_raw, my_side, opponent, result, total_moves').eq('id', gameId).single()
  if (!game) return NextResponse.json({ error: '棋譜が見つかりません' }, { status: 404 })

  const prompt = `あなたは将棋のコーチです。以下の棋譜を分析して、プレイヤーへのコーチングコメントを日本語で提供してください。

プレイヤー情報: ${game.my_side}番・${game.result}・${game.total_moves}手・相手: ${game.opponent}

分析の観点:
1. 序盤の駒組みの評価（右四間飛車の形として適切だったか）
2. 仕掛けのタイミングや方向性
3. 形勢が傾いたと思われるポイント
4. 終盤の寄せ・受けの評価
5. 次回に向けた具体的なアドバイス1〜2点

将棋ウォーズ2級のプレイヤー向けに、わかりやすく200〜300字程度で書いてください。

---棋譜---
${game.kif_raw}`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const comment = (message.content[0] as { text: string }).text

  // 保存
  await supabase.from('analyses').insert({ game_id: gameId, comment })

  return NextResponse.json({ comment, cached: false })
}
