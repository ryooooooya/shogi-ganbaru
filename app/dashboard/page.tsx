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
  const color = pct >= 60 ? '#16a34a' : pct >= 45 ? '#ca8a04' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', transition: 'width 0.6s ease', borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 13, color: '#6b7280', minWidth: 60, textAlign: 'right' }}>
        {wins}/{total} ({pct}%)
      </span>
    </div>
  )
}

function StatTable({ title, data }: { title: string; data: Record<string, { wins: number; total: number }> }) {
  const sorted = Object.entries(data).sort((a, b) => b[1].total - a[1].total)
  if (sorted.length === 0) return null
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(([label, s]) => (
          <div key={label}>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{label}</div>
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

  // Y軸をデータに合わせて自動調整（最低200、上限3000）
  const maxAbs = Math.max(200, ...evals.map(e => Math.abs(e.score)))
  const MAX_SCORE = Math.min(3000, Math.ceil(maxAbs * 1.2 / 100) * 100) // 20%余白、100単位に切り上げ

  const clamp = (v: number) => Math.max(-MAX_SCORE, Math.min(MAX_SCORE, v))
  const toX = (i: number) => PAD_X + (i / Math.max(evals.length - 1, 1)) * chartW
  const toY = (score: number) => PAD_Y + chartH / 2 - (clamp(score) / MAX_SCORE) * (chartH / 2)

  const zeroY = toY(0)

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

  let linePath = ''
  for (let i = 0; i < evals.length; i++) {
    const x = toX(i)
    const y = toY(evals[i].score)
    linePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  }

  const blunderSet = new Set((blunders ?? []).map(b => b.move_num))

  // グリッド線: データ範囲に応じて適切な間隔を計算
  const gridStep = MAX_SCORE <= 300 ? 100 : MAX_SCORE <= 600 ? 200 : MAX_SCORE <= 1500 ? 500 : 1000
  const gridLines: number[] = [0]
  for (let v = gridStep; v <= MAX_SCORE; v += gridStep) {
    gridLines.push(v)
    gridLines.push(-v)
  }

  const fmtScore = (v: number) => {
    if (v === 0) return '0'
    const abs = Math.abs(v)
    const label = abs >= 1000 ? `${abs / 1000}k` : `${abs}`
    return v > 0 ? `+${label}` : `-${label}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="grad-pos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="grad-neg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {gridLines.map(v => (
        <g key={v}>
          <line x1={PAD_X} y1={toY(v)} x2={W - PAD_X} y2={toY(v)}
            stroke={v === 0 ? '#9ca3af' : '#e5e7eb'} strokeWidth={v === 0 ? 1 : 0.5} />
          <text x={PAD_X - 4} y={toY(v) + 4} textAnchor="end"
            fill="#9ca3af" fontSize="9">{fmtScore(v)}</text>
        </g>
      ))}

      <path d={positivePath} fill="url(#grad-pos)" />
      <path d={negativePath} fill="url(#grad-neg)" />
      <path d={linePath} fill="none" stroke="#6b7280" strokeWidth="1.5" />

      {evals.map((ev, i) =>
        blunderSet.has(ev.move_num) ? (
          <circle key={i} cx={toX(i)} cy={toY(ev.score)} r="4"
            fill="#dc2626" stroke="#ffffff" strokeWidth="1.5" />
        ) : null
      )}

      {evals.length > 0 && (
        <>
          <text x={PAD_X} y={H - 4} fill="#9ca3af" fontSize="9">1</text>
          <text x={W - PAD_X} y={H - 4} textAnchor="end" fill="#9ca3af" fontSize="9">{evals[evals.length - 1].move_num}</text>
          <text x={W / 2} y={H - 4} textAnchor="middle" fill="#9ca3af" fontSize="9">手数</text>
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

  const runEngineAnalysis = async (gameId: string) => {
    setPendingAnalysis(prev => new Set(prev).add(gameId))
    fetch('/api/engine-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    }).catch(() => {})
  }

  const stats = calcStats(games)

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Noto Sans JP', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #e5e7eb', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, background: '#ffffff' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span style={{ color: '#d97706' }}>将棋</span><span style={{ color: '#1e293b' }}>コーチ</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#9ca3af' }}>
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
            border: `2px dashed ${dragging ? '#d97706' : '#d1d5db'}`,
            borderRadius: 12,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(217,119,6,0.04)' : '#ffffff',
            transition: 'all 0.2s',
          }}
        >
          <input id="kif-input" type="file" accept=".kif,.KIF" multiple style={{ display: 'none' }}
            onChange={e => e.target.files && uploadFiles(e.target.files)} />
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#9823;</div>
          <div style={{ fontSize: 14, color: '#9ca3af' }}>
            {uploading ? '保存中...' : 'KIFファイルをドロップ or タップして選択'}
          </div>
          {uploadMsg && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{uploadMsg}</div>
          )}
        </div>

        {/* Advice Card */}
        {advice ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(217,119,6,0.08) 0%, rgba(220,38,38,0.04) 100%)',
            border: '1px solid rgba(217,119,6,0.2)',
            borderRadius: 12,
            padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>
                次の一局これに気をつけて
              </div>
              <button
                onClick={regenerateAdvice}
                disabled={adviceLoading}
                style={{
                  background: adviceStale ? 'rgba(217,119,6,0.1)' : '#f3f4f6',
                  border: `1px solid ${adviceStale ? 'rgba(217,119,6,0.3)' : '#d1d5db'}`,
                  borderRadius: 6,
                  color: adviceStale ? '#d97706' : '#6b7280',
                  fontSize: 12,
                  padding: '4px 10px',
                  cursor: adviceLoading ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {adviceLoading ? '生成中...' : adviceStale ? '更新あり・再生成' : '再生成'}
              </button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-wrap' }}>
              {advice}
            </div>
          </div>
        ) : stats.total > 0 && (
          <div style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '20px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 12 }}>
              AI分析済みの対局からアドバイスを生成できます
            </div>
            <button
              onClick={regenerateAdvice}
              disabled={adviceLoading}
              style={{
                background: 'rgba(217,119,6,0.08)',
                border: '1px solid rgba(217,119,6,0.2)',
                borderRadius: 8,
                color: '#d97706',
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: '総対局', value: stats.total },
                { label: '勝率', value: `${stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0}%` },
                { label: '勝利数', value: stats.wins },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>{value}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{label}</div>
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
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>読み込み中...</div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
            KIFファイルをアップロードして棋譜を追加してください
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>対局一覧</div>
            {games.map(game => (
              <div key={game.id} style={{
                background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: game.result === '勝ち' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                  fontSize: 12, fontWeight: 700,
                  color: game.result === '勝ち' ? '#16a34a' : '#dc2626',
                  flexShrink: 0,
                }}>
                  {game.result === '勝ち' ? '勝' : '負'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    vs {game.opponent ?? '不明'}
                    <span style={{ marginLeft: 4, fontSize: 12, color: '#9ca3af' }}>{game.my_side}</span>
                    {game.evals && (
                      <span style={{
                        fontSize: 10, color: '#16a34a', background: 'rgba(22,163,74,0.06)',
                        border: '1px solid rgba(22,163,74,0.15)', borderRadius: 4,
                        padding: '1px 5px', lineHeight: '16px',
                      }}>
                        解析済
                      </span>
                    )}
                    {pendingAnalysis.has(game.id) && !game.evals && (
                      <span style={{
                        fontSize: 10, color: '#d97706', background: 'rgba(217,119,6,0.06)',
                        border: '1px solid rgba(217,119,6,0.15)', borderRadius: 4,
                        padding: '1px 5px', lineHeight: '16px',
                      }}>
                        解析中...
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {game.my_sentype} / 相手: {game.opp_sentype} / {game.total_moves}手
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>
                  {game.game_date ? new Date(game.game_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : ''}
                </div>
                {!game.evals && !pendingAnalysis.has(game.id) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); runEngineAnalysis(game.id) }}
                    style={{
                      flexShrink: 0, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 6,
                      color: '#d97706', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
                    }}
                  >
                    形勢解析
                  </button>
                )}
                <button
                  onClick={() => analyze(game)}
                  style={{
                    flexShrink: 0, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6,
                    color: '#6b7280', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
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
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24,
              width: '100%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                vs {selectedGame.opponent} — {selectedGame.result}
              </div>
              <button onClick={() => { setSelectedGame(null); setComment('') }}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer' }}>&#215;</button>
            </div>

            {/* 評価値グラフ */}
            {selectedGame.evals && selectedGame.evals.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.05em' }}>評価値グラフ（先手視点）</div>
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 8px', border: '1px solid #e5e7eb' }}>
                  <EvalGraph evals={selectedGame.evals} blunders={selectedGame.blunders} />
                </div>
              </div>
            )}

            {/* 敗着セクション */}
            {selectedGame.blunders && selectedGame.blunders.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.05em' }}>敗着候補</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...selectedGame.blunders]
                    .sort((a, b) => b.drop - a.drop)
                    .map((b, i) => (
                    <div key={i} style={{
                      background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.12)',
                      borderRadius: 8, padding: '10px 14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>
                          {b.move_num}手目
                        </span>
                        <span style={{ fontSize: 14, color: '#374151' }}>{b.move}</span>
                        <span style={{ fontSize: 12, color: '#dc2626', marginLeft: 'auto' }}>
                          -{b.drop}pt
                        </span>
                      </div>
                      {b.best_move_ja && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          代替手: {b.best_move_ja}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analyzing ? (
              <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                AIコーチが棋譜を分析中...
              </div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-wrap' }}>
                {comment}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
