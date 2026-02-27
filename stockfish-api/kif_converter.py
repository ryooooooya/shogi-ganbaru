"""KIF棋譜をUSI形式の指し手列に変換する"""

import shogi
import shogi.KIF
import io
import re
from typing import NamedTuple


class KifMoves(NamedTuple):
    usi_moves: list[str]
    ja_moves: list[str]  # 元のKIF日本語表記


# 全角→半角数字
_ZEN2HAN = str.maketrans("０１２３４５６７８９", "0123456789")

# 漢数字→半角数字
_KAN2HAN = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
            "六": "6", "七": "7", "八": "8", "九": "9"}

# 駒名→USI文字
_PIECE_USI = {
    "歩": "P", "香": "L", "桂": "N", "銀": "S", "金": "G",
    "角": "B", "飛": "R", "玉": "K", "王": "K",
}


def _extract_ja_moves(kif_text: str) -> list[str]:
    """KIFテキストから日本語指し手リストを抽出する。"""
    ja: list[str] = []
    for line in kif_text.split("\n"):
        m = re.match(r"^\s*\d+\s+(.+?)\s+\(", line.strip())
        if m:
            move_str = m.group(1).strip()
            if move_str in ("投了", "中断", "反則勝ち", "反則負け", "千日手", "持将棋"):
                break
            ja.append(move_str)
    return ja


def kif_to_moves(kif_text: str) -> KifMoves:
    """KIF文字列からUSI指し手リストと日本語指し手リストを返す。"""
    ja_moves = _extract_ja_moves(kif_text)

    # python-shogiのparse_strを試す
    try:
        game = shogi.KIF.Parser.parse_str(kif_text)
        raw_moves = None
        if isinstance(game, dict) and "moves" in game:
            raw_moves = game["moves"]
        elif isinstance(game, list) and len(game) > 0:
            if isinstance(game[0], dict) and "moves" in game[0]:
                raw_moves = game[0]["moves"]

        if raw_moves:
            moves: list[str] = []
            board = shogi.Board()
            for move in raw_moves:
                if isinstance(move, str):
                    if move in ("resign", "win", "abort"):
                        break
                    if len(move) <= 5 and move[0] in "123456789abcdefghi":
                        board.push_usi(move)
                        moves.append(move)
                    else:
                        break
                else:
                    try:
                        board.push(move)
                        moves.append(move.usi())
                    except Exception:
                        break
            if moves:
                return KifMoves(moves, ja_moves)
    except Exception:
        pass

    # フォールバック: 自前パーサー
    usi_moves = _fallback_parse(kif_text)
    return KifMoves(usi_moves, ja_moves)


def _fallback_parse(kif_text: str) -> list[str]:
    """python-shogiで読めない場合の簡易パーサー。

    KIF形式の指し手行を読み取り、python-shogiのBoardで
    合法手と照合してUSI形式に変換する。
    """
    lines = kif_text.split("\n")
    board = shogi.Board()
    moves: list[str] = []
    prev_to_sq = None  # 「同」対応用

    for line in lines:
        line = line.strip()
        # 指し手行: "   1 ７六歩(77)   ( 0:03/00:00:03)"
        m = re.match(r"^\s*\d+\s+(.+?)\s+\(", line)
        if not m:
            continue

        move_str = m.group(1).strip()

        # 投了・中断
        if move_str in ("投了", "中断", "反則勝ち", "反則負け", "千日手", "持将棋"):
            break

        usi_move = _japanese_move_to_usi(move_str, board, prev_to_sq)
        if usi_move is None:
            break

        try:
            board.push_usi(usi_move)
        except Exception:
            break

        # 移動先を記録（「同」対応）
        to_file = int(usi_move[2], 36) if usi_move[2].isalpha() else ord(usi_move[2]) - ord("1")
        to_rank = int(usi_move[3], 36) if usi_move[3].isalpha() else ord(usi_move[3]) - ord("1")
        prev_to_sq = (to_file, to_rank)

        moves.append(usi_move)

    return moves


def _japanese_move_to_usi(
    move_str: str, board: shogi.Board, prev_to_sq: tuple[int, int] | None
) -> str | None:
    """日本語指し手文字列をUSI形式に変換する。

    boardの合法手と照合し、移動先・駒種が一致するものを返す。
    """
    move_str = move_str.translate(_ZEN2HAN)

    # 打ち駒判定
    is_drop = "打" in move_str

    # 成り判定
    is_promote = "成" in move_str and "不成" not in move_str
    is_no_promote = "不成" in move_str

    # 「同」の場合は前の手の移動先を使う
    if move_str.startswith("同"):
        if prev_to_sq is None:
            return None
        to_file, to_rank = prev_to_sq
    else:
        # 移動先マスを取得（例: "7六" → (6, 5)）
        coords = re.findall(r"[1-9]", move_str[:4])
        if len(coords) < 2:
            # 漢数字の段
            file_m = re.match(r"([1-9])", move_str)
            rank_str = ""
            for ch in move_str[1:]:
                if ch in _KAN2HAN:
                    rank_str = _KAN2HAN[ch]
                    break
            if not file_m or not rank_str:
                return None
            to_file = 9 - int(file_m.group(1))  # USI: 1→a=0 ... 9→i=8, but file 9→0, 1→8
            to_rank = int(rank_str) - 1
        else:
            to_file = 9 - int(coords[0])
            to_rank = int(coords[1]) - 1

    # USIでのマス: file=a-i (0-8=9筋-1筋), rank=a-i (0-8=1段-9段)
    to_usi = chr(ord("a") + to_file) + chr(ord("a") + to_rank)

    # 合法手から候補を絞る
    for legal_move in board.legal_moves:
        usi = legal_move.usi()

        # 移動先が一致するかチェック
        if usi[2:4] != to_usi:
            continue

        if is_drop:
            # 打ち駒: USI形式は "P*5e" のような形
            if "*" not in usi:
                continue
            # 駒種のチェック
            piece_char = usi[0]
            for ja_name, usi_name in _PIECE_USI.items():
                if ja_name in move_str and usi_name == piece_char:
                    return usi
        else:
            # 移動: 成り/不成のチェック
            if "*" in usi:
                continue
            if is_promote and not usi.endswith("+"):
                continue
            if is_no_promote and usi.endswith("+"):
                continue
            if not is_promote and not is_no_promote and usi.endswith("+"):
                continue
            return usi

    return None
