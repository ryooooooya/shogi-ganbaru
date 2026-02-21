// app/api/advice/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// GET: キャッシュ済みアドバイスを返す + stale判定
export async function GET() {
  try {
    // 最新のアドバイスを取得
    const { data: advice } = await supabase
      .from('advice_summary')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!advice) {
      return NextResponse.json({ advice: null, stale: false })
    }

    // 現在の分析数を取得して stale 判定
    const { count } = await supabase
      .from('analyses')
      .select('*', { count: 'exact', head: true })

    const stale = (count ?? 0) > (advice.analysis_count ?? 0)

    return NextResponse.json({
      advice: advice.content,
      stale,
      createdAt: advice.created_at,
    })
  } catch (e) {
    console.error('Advice GET error:', e)
    const message = e instanceof Error ? e.message : '不明なエラー'
    return NextResponse.json({ error: `取得に失敗しました: ${message}` }, { status: 500 })
  }
}

// POST: 全分析コメントから Claude でアドバイスを生成・保存
export async function POST() {
  try {
    // 最新30件の分析コメントを取得
    const { data: analyses } = await supabase
      .from('analyses')
      .select('comment, game_id')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!analyses || analyses.length === 0) {
      return NextResponse.json({ error: '分析データがありません。先に対局のAI分析を実行してください。' }, { status: 400 })
    }

    // 分析コメントを結合
    const comments = analyses.map((a, i) => `【分析${i + 1}】\n${a.comment}`).join('\n\n')

    const prompt = `あなたは将棋コーチです。以下は将棋ウォーズ2級のプレイヤーの過去の対局分析コメント一覧です。

これらを総合的に読み、このプレイヤーが**次の一局で特に気をつけるべきこと**を2〜3個、具体的にアドバイスしてください。

ルール:
- 各アドバイスは1〜2文で簡潔に
- 繰り返し指摘されているパターンや弱点を優先
- 「〜しましょう」のような前向きな表現で
- アドバイスは改行で区切り、番号なし・箇条書きなし
- 合計100字以内に収めてください

---分析コメント一覧---
${comments}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = (message.content[0] as { text: string }).text

    // 現在の分析数を記録
    const { count } = await supabase
      .from('analyses')
      .select('*', { count: 'exact', head: true })

    // 保存
    await supabase.from('advice_summary').insert({
      content,
      analysis_count: count ?? 0,
    })

    return NextResponse.json({ advice: content, stale: false })
  } catch (e) {
    console.error('Advice POST error:', e)
    const message = e instanceof Error ? e.message : '不明なエラー'
    return NextResponse.json({ error: `アドバイス生成に失敗しました: ${message}` }, { status: 500 })
  }
}
