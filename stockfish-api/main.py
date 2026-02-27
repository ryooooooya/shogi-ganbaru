"""Fairy-Stockfish 評価値API"""

import asyncio
import os
import subprocess
import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from kif_converter import kif_to_moves

app = FastAPI(title="Shogi Engine API")
logger = logging.getLogger("engine")

ENGINE_PATH = os.environ.get("ENGINE_PATH", "/usr/local/bin/fairy-stockfish")
DEPTH = int(os.environ.get("ENGINE_DEPTH", "12"))
THREADS = int(os.environ.get("ENGINE_THREADS", "1"))
HASH_MB = int(os.environ.get("ENGINE_HASH", "64"))
TOP_BLUNDERS = 3


class AnalyzeRequest(BaseModel):
    kif: str


class EvalItem(BaseModel):
    move_num: int
    move: str
    score: int
    best_move_usi: str
    best_move_ja: str


class BlunderItem(EvalItem):
    drop: int


class AnalyzeResponse(BaseModel):
    evals: list[EvalItem]
    blunders: list[BlunderItem]


async def _run_engine(moves: list[str]) -> list[dict]:
    """Fairy-Stockfishで各局面を評価する。"""
    proc = await asyncio.create_subprocess_exec(
        ENGINE_PATH,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    assert proc.stdin and proc.stdout

    async def send(cmd: str):
        proc.stdin.write((cmd + "\n").encode())
        await proc.stdin.drain()

    async def read_until(prefix: str) -> str:
        while True:
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=30)
            decoded = line.decode().strip()
            if decoded.startswith(prefix):
                return decoded

    # 初期化
    await send("usi")
    await read_until("usiok")

    await send(f"setoption name USI_Variant value shogi")
    await send(f"setoption name Threads value {THREADS}")
    await send(f"setoption name Hash value {HASH_MB}")
    await send("isready")
    await read_until("readyok")

    results: list[dict] = []

    # 初期局面の評価
    await send("position startpos")
    await send(f"go depth {DEPTH}")
    info_line = ""
    best_line = ""
    while True:
        line = await asyncio.wait_for(proc.stdout.readline(), timeout=30)
        decoded = line.decode().strip()
        if "score" in decoded and "depth" in decoded:
            info_line = decoded
        if decoded.startswith("bestmove"):
            best_line = decoded
            break

    score = _parse_score(info_line)
    best_usi = best_line.split()[1] if len(best_line.split()) > 1 else ""
    results.append({"move_num": 0, "move": "開始局面", "score": score,
                     "best_move_usi": best_usi, "best_move_ja": ""})

    # 各手の後の局面を評価
    for i, move in enumerate(moves):
        move_list = " ".join(moves[: i + 1])
        await send(f"position startpos moves {move_list}")
        await send(f"go depth {DEPTH}")

        info_line = ""
        best_line = ""
        while True:
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=30)
            decoded = line.decode().strip()
            if "score" in decoded and "depth" in decoded:
                info_line = decoded
            if decoded.startswith("bestmove"):
                best_line = decoded
                break

        # スコアは手番視点 → 先手視点に統一
        raw_score = _parse_score(info_line)
        # i+1手目の後: i+1が奇数なら先手が指した後(後手の手番)→後手視点→反転
        # i+1が偶数なら後手が指した後(先手の手番)→先手視点→そのまま
        is_gote_turn = (i + 1) % 2 == 1  # 1手目の後は後手の手番
        sente_score = -raw_score if is_gote_turn else raw_score

        best_usi = best_line.split()[1] if len(best_line.split()) > 1 else ""

        results.append({
            "move_num": i + 1,
            "move": move,
            "score": sente_score,
            "best_move_usi": best_usi,
            "best_move_ja": "",
        })

    await send("quit")
    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        proc.kill()

    return results


def _parse_score(info_line: str) -> int:
    """infoラインからスコアを抽出する。mate の場合は±30000に変換。"""
    parts = info_line.split()
    try:
        idx = parts.index("score")
        if parts[idx + 1] == "cp":
            return int(parts[idx + 2])
        elif parts[idx + 1] == "mate":
            mate_in = int(parts[idx + 2])
            return 30000 if mate_in > 0 else -30000
    except (ValueError, IndexError):
        pass
    return 0


def _find_blunders(evals: list[dict]) -> list[dict]:
    """評価値の落差が大きい上位N手を敗着として返す。"""
    drops: list[dict] = []
    for i in range(1, len(evals)):
        prev_score = evals[i - 1]["score"]
        curr_score = evals[i]["score"]

        # 手番: 奇数手目は先手、偶数手目は後手
        is_sente_move = evals[i]["move_num"] % 2 == 1

        # 先手視点でのスコア変化
        if is_sente_move:
            # 先手の手: 先手にとってスコアが落ちた = curr < prev
            drop = prev_score - curr_score
        else:
            # 後手の手: 後手にとってスコアが落ちた = curr > prev (先手視点では上昇=後手不利)
            drop = curr_score - prev_score

        if drop > 50:  # 50cp以上の悪手のみ
            drops.append({**evals[i], "drop": drop})

    drops.sort(key=lambda x: x["drop"], reverse=True)
    return drops[:TOP_BLUNDERS]


@app.get("/health")
async def health():
    return {"status": "ok", "engine": ENGINE_PATH}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    result = kif_to_moves(req.kif)
    if not result.usi_moves:
        raise HTTPException(status_code=400, detail="KIFのパースに失敗しました")

    try:
        evals = await _run_engine(result.usi_moves)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="エンジンがタイムアウトしました")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"エンジンが見つかりません: {ENGINE_PATH}",
        )

    # 日本語指し手をevalsに反映
    for ev in evals:
        idx = ev["move_num"] - 1  # 0手目は開始局面
        if 0 <= idx < len(result.ja_moves):
            ev["move"] = result.ja_moves[idx]

    blunders = _find_blunders(evals)

    return AnalyzeResponse(
        evals=[EvalItem(**{k: v for k, v in e.items() if k != "drop"}) for e in evals],
        blunders=[BlunderItem(**b) for b in blunders],
    )
