// app/api/analyze/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(req: Request) {
  try {
    const { gameId } = await req.json()
    if (!gameId) return NextResponse.json({ error: 'gameId が必要です' }, { status: 400 })

    // 既存の分析があれば返す
    const { data: existing } = await supabase
      .from('analyses').select('comment').eq('game_id', gameId).maybeSingle()
    if (existing) return NextResponse.json({ comment: existing.comment, cached: true })

    // 棋譜取得
    const { data: game } = await supabase
      .from('games').select('kif_raw, my_side, opponent, result, total_moves, blunders').eq('id', gameId).single()
    if (!game) return NextResponse.json({ error: '棋譜が見つかりません' }, { status: 404 })

    // 敗着情報をプロンプトに追加
    let blunderInfo = ''
    if (game.blunders && Array.isArray(game.blunders) && game.blunders.length > 0) {
      const items = game.blunders.map((b: { move_num: number; move: string; drop: number; best_move_ja: string }) =>
        `  - ${b.move_num}手目 ${b.move}（評価値 -${b.drop}pt 下落、代替手: ${b.best_move_ja || b.move}）`
      ).join('\n')
      blunderInfo = `\n\n【エンジン解析による敗着候補】\n${items}\nこれらの手について特に言及してください。`
    }

    const prompt = `あなたは将棋のコーチです。以下の棋譜を分析して、プレイヤーへのコーチングコメントを日本語で提供してください。

【重要】指導対象のプレイヤーは「${game.my_side}」側です。棋譜中の${game.my_side}の指し手がこのプレイヤーの手です。${game.my_side === '先手' ? '後手' : '先手'}（${game.opponent}）は対戦相手です。
プレイヤーの${game.my_side}の指し手を中心に分析・アドバイスしてください。

対局結果: ${game.result}（${game.total_moves}手）${blunderInfo}

分析の観点:
1. 序盤の駒組みの評価
2. 仕掛けのタイミングや方向性
3. 形勢が傾いたと思われるポイント
4. 終盤の寄せ・受けの評価
5. 次回に向けた具体的なアドバイス1〜2点

将棋ウォーズ2級のプレイヤー向けに、わかりやすく200〜300字程度で書いてください。

---棋譜---
${game.kif_raw}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const comment = (message.content[0] as { text: string }).text

    // 保存
    await supabase.from('analyses').insert({ game_id: gameId, comment })

    return NextResponse.json({ comment, cached: false })
  } catch (e) {
    console.error('Analyze error:', e)
    const message = e instanceof Error ? e.message : '不明なエラー'
    return NextResponse.json({ error: `分析に失敗しました: ${message}` }, { status: 500 })
  }
}
