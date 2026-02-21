// lib/kif-parser.ts

export interface GameRecord {
  game_date: string | null
  my_side: '先手' | '後手' | '不明'
  opponent: string | null
  total_moves: number
  result: '勝ち' | '負け' | '不明'
  my_sentype: string
  opp_sentype: string
  kif_raw: string
}

const MY_NAME = process.env.SHOGI_WARS_USERNAME ?? ''

export function parseKif(kif: string): GameRecord | null {
  const lines = kif.split('\n')
  let gameDate: string | null = null
  let sente = ''
  let gote = ''
  const moves: { num: number; move: string }[] = []

  for (const line of lines) {
    if (line.startsWith('開始日時：')) {
      gameDate = line.replace('開始日時：', '').trim()
    } else if (line.startsWith('先手：')) {
      sente = line.replace('先手：', '').trim()
    } else if (line.startsWith('後手：')) {
      gote = line.replace('後手：', '').trim()
    } else {
      const m = line.match(/^\s*(\d+)\s+(.+?)\s+\(/)
      if (m) moves.push({ num: parseInt(m[1]), move: m[2].trim() })
    }
  }

  if (moves.length === 0) return null

  const mySide: '先手' | '後手' | '不明' =
    sente === MY_NAME ? '先手' : gote === MY_NAME ? '後手' : '不明'
  const opponent = mySide === '先手' ? gote : mySide === '後手' ? sente : null
  const totalMoves = moves[moves.length - 1].num

  let result: '勝ち' | '負け' | '不明' = '不明'
  for (const line of lines) {
    if (line.includes('先手の勝ち')) { result = sente === MY_NAME ? '勝ち' : '負け'; break }
    if (line.includes('後手の勝ち')) { result = gote === MY_NAME ? '勝ち' : '負け'; break }
  }

  const myParity = mySide === '先手' ? 1 : 0
  const myMoves = moves.filter(m => m.num % 2 === myParity).map(m => m.move)
  const oppMoves = moves.filter(m => m.num % 2 !== myParity).map(m => m.move)

  return {
    game_date: gameDate,
    my_side: mySide,
    opponent,
    total_moves: totalMoves,
    result,
    my_sentype: detectSentype(myMoves, mySide === '先手' ? '八' : '二'),
    opp_sentype: detectSentype(oppMoves, mySide === '先手' ? '二' : '八'),
    kif_raw: kif,
  }
}

function detectSentype(moves: string[], rank: string): string {
  if (moves.some(m => m.includes(`４${rank}飛`))) return '右四間飛車'
  if (moves.some(m => m.includes(`５${rank}飛`))) return '中飛車'
  if (moves.some(m => m.includes(`３${rank}飛`))) return '三間飛車'
  if (moves.some(m => m.includes(`２${rank}飛`) || m.includes(`８${rank}飛`))) return '向かい飛車'
  return '居飛車系'
}
