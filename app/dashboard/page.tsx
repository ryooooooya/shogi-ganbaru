'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type EvalData = {
  move_num: number
  move: string
  score: number
  best_move_usi: string
  best_move_ja: string
}

type Blunder = EvalData & { drop: number }

type Game = {
  id: string
  game_date: string
  my_side: string
  opponent: string
  total_moves: number
  result: '勝ち' | '負け' | '不明'
  my_sentype: string
  opp_sentype: string
  evals: EvalData[] | null
  blunders: Blunder[] | null
}

type Stats = {
  total: number
  wins: number
  byMySentype: Record<string, { wins: number; total: number }>
  byOppSentype: Record<string, { wins: number; total: number }>
  bySide: Record<string, { wins: number; total: number }>
}

function calcStats(games: Game[]): Stats {
  const stats: Stats = {
    total: games.length,
    wins: 0,
    byMySentype: {},
    byOppSentype: {},
    bySide: {},
  }
  for (const g of games) {
    const win = g.result === '勝ち'
    if (win) stats.wins++

    for (const [key, val] of [
      ['byMySentype', g.my_sentype],
      ['byOppSentype', g.opp_sentype],
      ['bySide', g.my_side],
    ] as const) {
      if (!stats[key][val]) stats[key][val] = { wins: 0, total: 0 }
      stats[key][val].total++
      if (win) stats[key][val].wins++
    }
  }
  return stats
}

function WinRateBar({ wins, total }: { wins: number; total: number }) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0
  const color = pct >= 60 ? '#4ade80' : pct >= 45 ? '#facc15' : '#f87171'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#1e293b', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', transition: 'width 0.6s ease', borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 13, color: '#94a3b8', minWidth: 60, textAlign: 'right' }}>
        {wins}/{total} ({pct}%)
      </span>
    </div>
  )
}

function StatTable({ title, data }: { title: string; data: Record<string, { wins: number; total: number }> }) {
  const sorted = Object.entries(data).sort((a, b) => b[1].total - a[1].total)
  if (sorted.length === 0) return null
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(([label, s]) => (
          <div key={label}>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>{label}</div>
            <WinRateBar wins={s.wins} total={s.total} />
          </div>
        ))}
      </div>
    </div>
  )
}

function EvalGraph({ evals, blunders }: { evals: EvalData[]; blunders: Blunder[] | null }) {
  const W = 540, H = 200, PAD_X = 40, PAD_Y = 20
  const chartW = W - PAD_X * 2
  const chartH = H - PAD_Y * 2
  const MAX_SCORE = 3000

  const clamp = (v: number) => Math.max(-MAX_SCORE, Math.min(MAX_SCORE, v))
  const toX = (i: number) => PAD_X + (i / Math.max(evals.length - 1, 1)) * chartW
  const toY = (score: number) => PAD_Y + chartH / 2 - (clamp(score) / MAX_SCORE) * (chartH / 2)

  const zeroY = toY(0)

  // 塗りつぶし用パス（先手有利=青、後手有利=赤）
  // 0基準線からの塗りつぶし
  let positivePath = `M ${toX(0)} ${zeroY}`
  let negativePath = `M ${toX(0)} ${zeroY}`

  for (let i = 0; i < evals.length; i++) {
    const x = toX(i)
    const score = clamp(evals[i].score)
    if (score >= 0) {
      positivePath += ` L ${x} ${toY(score)}`
    } else {
      positivePath += ` L ${x} ${zeroY}`
    }
  }
  positivePath += ` L ${toX(evals.length - 1)} ${zeroY} Z`

  for (let i = 0; i < evals.length; i++) {
    const x = toX(i)
    const score = clamp(evals[i].score)
    if (score <= 0) {
      negativePath += ` L ${x} ${toY(score)}`
    } else {
      negativePath += ` L ${x} ${zeroY}`
    }
  }
  negativePath += ` L ${toX(evals.length - 1)} ${zeroY} Z`

  // ライン
  let linePath = ''
  for (let i = 0; i < evals.length; i++) {
    const x = toX(i)
    const y = toY(evals[i].score)
    linePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  }

  // 敗着マーカー
  const blunderSet = new Set((blunders ?? []).map(b => b.move_num))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="grad-pos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="grad-neg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* 背景グリッド */}
      {[-2000, -1000, 0, 1000, 2000].map(v => (
        <g key={v}>
          <line x1={PAD_X} y1={toY(v)} x2={W - PAD_X} y2={toY(v)}
            stroke={v === 0 ? '#475569' : '#1e293b'} strokeWidth={v === 0 ? 1 : 0.5} />
          <text x={PAD_X - 4} y={toY(v) + 4} textAnchor="end"
            fill="#475569" fontSize="9">{v === 0 ? '0' : v > 0 ? `+${v / 1000}k` : `${v / 1000}k`}</text>
        </g>
      ))}

      {/* 塗りつぶし */}
      <path d={positivePath} fill="url(#grad-pos)" />
      <path d={negativePath} fill="url(#grad-neg)" />

      {/* ライン */}
      <path d={linePath} fill="none" stroke="#94a3b8" strokeWidth="1.5" />

      {/* 敗着マーカー */}
      {evals.map((ev, i) =>
        blunderSet.has(ev.move_num) ? (
          <circle key={i} cx={toX(i)} cy={toY(ev.score)} r="4"
            fill="#ef4444" stroke="#0f172a" strokeWidth="1.5" />
        ) : null
      )}

      {/* X軸ラベル */}
      {evals.length > 0 && (
        <>
          <text x={PAD_X} y={H - 4} fill="#475569" fontSize="9">1</text>
          <text x={W - PAD_X} y={H - 4} textAnchor="end" fill="#475569" fontSize="9">{evals[evals.length - 1].move_num}</text>
          <text x={W / 2} y={H - 4} textAnchor="middle" fill="#475569" fontSize="9">手数</text>
        </>
      )}
    </svg>
  )
}

export default function Dashboard() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [comment, setComment] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [advice, setAdvice] = useState<string | null>(null)
  const [adviceStale, setAdviceStale] = useState(false)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [pendingAnalysis, setPendingAnalysis] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchGames = useCallback(async () => {
    const res = await fetch('/api/games')
    const data = await res.json()
    setGames(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  const fetchAdvice = useCallback(async () => {
    const res = await fetch('/api/advice')
    const data = await res.json()
    if (data.advice) setAdvice(data.advice)
    if (data.stale) setAdviceStale(true)
  }, [])

  const regenerateAdvice = async () => {
    setAdviceLoading(true)
    const res = await fetch('/api/advice', { method: 'POST' })
    const data = await res.json()
    if (data.advice) {
      setAdvice(data.advice)
      setAdviceStale(false)
    }
    setAdviceLoading(false)
  }

  useEffect(() => { fetchGames(); fetchAdvice() }, [fetchGames, fetchAdvice])

  // ポーリング: pendingAnalysis にIDがある間、5秒ごとにgamesを再取得
  useEffect(() => {
    if (pendingAnalysis.size === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }

    pollRef.current = setInterval(async () => {
      const res = await fetch('/api/games')
      const data = await res.json()
      if (!Array.isArray(data)) return
      setGames(data)

      // 解析完了したIDをpendingから除外
      const stillPending = new Set<string>()
      for (const id of pendingAnalysis) {
        const g = data.find((g: Game) => g.id === id)
        if (g && !g.evals) stillPending.add(id)
      }
      if (stillPending.size < pendingAnalysis.size) setPendingAnalysis(stillPending)
    }, 5000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pendingAnalysis])

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.name.endsWith('.kif') || f.name.endsWith('.KIF'))
    if (arr.length === 0) { setUploadMsg('KIFファイルを選択してください'); return }
    setUploading(true)
    setUploadMsg('')
    const form = new FormData()
    arr.forEach(f => form.append('kif', f))
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()
    setUploadMsg(`${data.saved}局追加 / ${data.skipped}局スキップ${data.errors?.length ? ` / エラー${data.errors.length}件` : ''}`)
    setUploading(false)
    fetchGames()

    // バックグラウンドでエンジン解析を開始
    if (data.savedIds && data.savedIds.length > 0) {
      setPendingAnalysis(new Set(data.savedIds))
      for (const id of data.savedIds) {
        fetch('/api/engine-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: id }),
        }).catch(() => {})
      }
    }
  }

  const analyze = async (game: Game) => {
    setSelectedGame(game)
    setComment('')
    setAnalyzing(true)
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: game.id }),
    })
    const data = await res.json()
    setComment(data.comment ?? data.error ?? 'エラーが発生しました')
    if (!data.cached) setAdviceStale(true)
    setAnalyzing(false)
  }

  const stats = calcStats(games)

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: '#e2e8f0', fontFamily: "'Noto Sans JP', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span style={{ color: '#f59e0b' }}>将棋</span>コーチ
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#475569' }}>
          {games.length > 0 && `${games.length}局`}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Upload */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files) }}
          onClick={() => document.getElementById('kif-input')?.click()}
          style={{
            border: `2px dashed ${dragging ? '#f59e0b' : '#1e293b'}`,
            borderRadius: 12,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(245,158,11,0.05)' : '#0a0f1e',
            transition: 'all 0.2s',
          }}
        >
          <input id="kif-input" type="file" accept=".kif,.KIF" multiple style={{ display: 'none' }}
            onChange={e => e.target.files && uploadFiles(e.target.files)} />
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#9823;</div>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            {uploading ? '保存中...' : 'KIFファイルをドロップ or タップして選択'}
          </div>
          {uploadMsg && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#4ade80' }}>{uploadMsg}</div>
          )}
        </div>

        {/* Advice Card */}
        {advice ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(239,68,68,0.08) 100%)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 12,
            padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                次の一局これに気をつけて
              </div>
              <button
                onClick={regenerateAdvice}
                disabled={adviceLoading}
                style={{
                  background: adviceStale ? 'rgba(245,158,11,0.2)' : '#1e293b',
                  border: `1px solid ${adviceStale ? 'rgba(245,158,11,0.4)' : '#334155'}`,
                  borderRadius: 6,
                  color: adviceStale ? '#f59e0b' : '#94a3b8',
                  fontSize: 12,
                  padding: '4px 10px',
                  cursor: adviceLoading ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {adviceLoading ? '生成中...' : adviceStale ? '更新あり・再生成' : '再生成'}
              </button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
              {advice}
            </div>
          </div>
        ) : stats.total > 0 && (
          <div style={{
            background: '#0a0f1e',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: '20px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>
              AI分析済みの対局からアドバイスを生成できます
            </div>
            <button
              onClick={regenerateAdvice}
              disabled={adviceLoading}
              style={{
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 8,
                color: '#f59e0b',
                fontSize: 14,
                fontWeight: 600,
                padding: '8px 20px',
                cursor: adviceLoading ? 'wait' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {adviceLoading ? '生成中...' : 'アドバイスを生成する'}
            </button>
          </div>
        )}

        {/* Stats */}
        {stats.total > 0 && (
          <>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: '総対局', value: stats.total },
                { label: '勝率', value: `${stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0}%` },
                { label: '勝利数', value: stats.wins },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{value}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <StatTable title="自分の戦型" data={stats.byMySentype} />
              <StatTable title="相手の戦型" data={stats.byOppSentype} />
            </div>
            <StatTable title="先後別" data={stats.bySide} />
          </>
        )}

        {/* Game list */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#475569', padding: 40 }}>読み込み中...</div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#475569', padding: 40 }}>
            KIFファイルをアップロードして棋譜を追加してください
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>対局一覧</div>
            {games.map(game => (
              <div key={game.id} style={{
                background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#334155')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: game.result === '勝ち' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                  fontSize: 12, fontWeight: 700,
                  color: game.result === '勝ち' ? '#4ade80' : '#f87171',
                  flexShrink: 0,
                }}>
                  {game.result === '勝ち' ? '勝' : '負'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    vs {game.opponent ?? '不明'}
                    <span style={{ marginLeft: 4, fontSize: 12, color: '#475569' }}>{game.my_side}</span>
                    {game.evals && (
                      <span style={{
                        fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.1)',
                        border: '1px solid rgba(74,222,128,0.2)', borderRadius: 4,
                        padding: '1px 5px', lineHeight: '16px',
                      }}>
                        解析済
                      </span>
                    )}
                    {pendingAnalysis.has(game.id) && !game.evals && (
                      <span style={{
                        fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4,
                        padding: '1px 5px', lineHeight: '16px',
                      }}>
                        解析中...
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {game.my_sentype} / 相手: {game.opp_sentype} / {game.total_moves}手
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#475569', flexShrink: 0 }}>
                  {game.game_date ? new Date(game.game_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : ''}
                </div>
                <button
                  onClick={() => analyze(game)}
                  style={{
                    flexShrink: 0, background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                    color: '#94a3b8', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
                  }}
                >
                  AI分析
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analysis modal */}
      {selectedGame && (
        <div
          onClick={() => { setSelectedGame(null); setComment('') }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: 24,
              width: '100%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                vs {selectedGame.opponent} — {selectedGame.result}
              </div>
              <button onClick={() => { setSelectedGame(null); setComment('') }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>&#215;</button>
            </div>

            {/* 評価値グラフ */}
            {selectedGame.evals && selectedGame.evals.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>評価値グラフ（先手視点）</div>
                <div style={{ background: '#020817', borderRadius: 8, padding: '12px 8px', border: '1px solid #1e293b' }}>
                  <EvalGraph evals={selectedGame.evals} blunders={selectedGame.blunders} />
                </div>
              </div>
            )}

            {/* 敗着セクション */}
            {selectedGame.blunders && selectedGame.blunders.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>敗着候補</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...selectedGame.blunders]
                    .sort((a, b) => b.drop - a.drop)
                    .map((b, i) => (
                    <div key={i} style={{
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                      borderRadius: 8, padding: '10px 14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                          {b.move_num}手目
                        </span>
                        <span style={{ fontSize: 14, color: '#e2e8f0' }}>{b.move}</span>
                        <span style={{ fontSize: 12, color: '#f87171', marginLeft: 'auto' }}>
                          -{b.drop}pt
                        </span>
                      </div>
                      {b.best_move_ja && (
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                          代替手: {b.best_move_ja}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analyzing ? (
              <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                AIコーチが棋譜を分析中...
              </div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.8, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                {comment}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
