from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import numpy as np
import joblib
import nfl_data_py as nfl
import asyncio
import json
from typing import Dict, Any, Optional

app = FastAPI(title="PBP One-Endpoint API")

STATE: Dict[str, Any] = {}
GAMES: Dict[str, Dict[str, Any]] = {}


def engineer(pbp: pd.DataFrame) -> pd.DataFrame:
    df = pbp.copy()
    df["score_diff"] = df["score_differential"].abs()
    df["is_close_game"] = (df["score_diff"] <= 8).astype(int)
    df["is_very_close"] = (df["score_diff"] <= 3).astype(int)
    df["is_fourth_qtr"] = (df["qtr"] == 4).astype(int)
    df["is_crunch_time"] = ((df["qtr"] == 4) & (df["game_seconds_remaining"] < 300)).astype(int)
    df["is_final_2min"] = ((df["qtr"] == 4) & (df["game_seconds_remaining"] < 120)).astype(int)
    df["leverage_index"] = (
            df["is_close_game"]
            * (1 + df["is_fourth_qtr"])
            * (1 + df["is_crunch_time"])
            * (1 + df["is_final_2min"])
    )
    df["in_red_zone"] = (df["yardline_100"] <= 20).astype(int)
    df["in_fg_range"] = (df["yardline_100"] <= 35).astype(int)
    df["field_position_value"] = 100 - df["yardline_100"]
    df["third_down"] = (df["down"] == 3).astype(int)
    df["long_distance"] = (df["ydstogo"] >= 7).astype(int)
    df["short_yardage"] = (df["ydstogo"] <= 2).astype(int)
    return df


def select_features(df: pd.DataFrame):
    feature_cols = [
        "down",
        "ydstogo",
        "yardline_100",
        "qtr",
        "game_seconds_remaining",
        "score_differential",
        "in_red_zone",
        "in_fg_range",
        "field_position_value",
        "third_down",
        "long_distance",
        "short_yardage",
        "is_close_game",
        "is_very_close",
        "is_fourth_qtr",
        "is_crunch_time",
        "is_final_2min",
        "leverage_index",
    ]
    feature_cols = list(dict.fromkeys(feature_cols))
    id_cols = ["game_id", "play_id", "wp", "qtr"]
    df_clean = df[feature_cols + id_cols].dropna()
    return df_clean, feature_cols


def sustained_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["game_id", "play_id"]).reset_index(drop=True)
    wp_arr = df["wp"].to_numpy(dtype=float).reshape(-1)
    qtr_arr = df["qtr"].to_numpy().reshape(-1)

    n = wp_arr.shape[0]
    label = np.zeros(n, dtype=int)

    rising_streak = 0
    falling_streak = 0
    outside_band = 0
    one_active = False
    two_active = False

    for i in range(1, n):
        prev_tr = min(wp_arr[i - 1], 1.0 - wp_arr[i - 1])
        curr_tr = min(wp_arr[i], 1.0 - wp_arr[i])

        rise = curr_tr > prev_tr
        drop = curr_tr < prev_tr
        delta = curr_tr - prev_tr

        if not one_active:
            if prev_tr < 0.35:
                rising_streak = rising_streak + 1 if rise else 0
                if rising_streak >= 5:
                    one_active = True
                if any(
                        min(wp_arr[max(0, i - k)], 1.0 - wp_arr[max(0, i - k)]) < 0.35
                        and curr_tr >= 0.45
                        for k in range(3, 6)
                ):
                    one_active = True
                if prev_tr <= 0.30 and delta >= 0.15:
                    one_active = True

        if one_active:
            falling_streak = falling_streak + 1 if drop else 0
            if falling_streak >= 3 or delta <= -0.15 or (1.0 - curr_tr) <= 0.40:
                one_active = False
                falling_streak = 0

        q = qtr_arr[i]
        if hasattr(q, "item"):
            q = q.item()
        q = int(q)

        if q == 4:
            if 0.40 <= curr_tr <= 0.60:
                two_active = True
                outside_band = 0
            else:
                outside_band += 1
                if outside_band >= 4:
                    two_active = False
        else:
            two_active = False
            outside_band = 0

        label[i] = 2 if two_active else (1 if one_active else 0)

    out = df[["game_id", "play_id", "qtr", "wp"]].copy()
    out["signal"] = label
    return out


def _predict_aligned(model, X: pd.DataFrame) -> np.ndarray:
    X2 = X.copy()
    X2 = X2.loc[:, ~X2.columns.duplicated()]
    if hasattr(model, "feature_names_in_"):
        names = list(dict.fromkeys(model.feature_names_in_))
        for c in names:
            if c not in X2.columns:
                X2[c] = 0.0
        X2 = X2[names]
    X2 = X2.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    proba = model.predict_proba(X2)[:, 1]
    return np.asarray(proba, dtype=float).reshape(-1)


def _load_sequence(date: str, t1: str, t2: str, model_dir: str) -> pd.DataFrame:
    season = int(date[:4])
    pbp = nfl.import_pbp_data([season])
    mask_date = pbp["game_date"] == date
    mask = (
                   (pbp["home_team"] == t1) & (pbp["away_team"] == t2)
           ) | ((pbp["home_team"] == t2) & (pbp["away_team"] == t1))
    pbp = pbp[mask_date & mask].copy()
    if pbp.empty:
        raise HTTPException(404, "No game found for those parameters.")

    pbp = pbp[pbp["play_type"].isin(["pass", "run"])].dropna(
        subset=[
            "down",
            "ydstogo",
            "yardline_100",
            "qtr",
            "game_seconds_remaining",
            "score_differential",
            "wp",
        ]
    )

    df_feats = engineer(pbp)
    df_feats, feats = select_features(df_feats)
    X = df_feats[feats].copy()
    n_rows = len(df_feats)

    md = Path(model_dir)
    rf = joblib.load(md / "rf_model.pkl")
    lr = joblib.load(md / "lr_model.pkl")
    xgb = joblib.load(md / "xgb_model.pkl")
    lgb = joblib.load(md / "lgb_model.pkl")

    p_rf = _predict_aligned(rf, X)
    p_xgb = _predict_aligned(xgb, X)
    p_lgb = _predict_aligned(lgb, X)
    p_lr = _predict_aligned(lr, X)

    def _ensure_len(a: np.ndarray, n: int) -> np.ndarray:
        a = np.asarray(a, dtype=float).reshape(-1)
        if a.shape[0] != n:
            raise HTTPException(
                500,
                f"Model prediction length {a.shape[0]} does not match feature rows {n}",
            )
        return a

    p_rf = _ensure_len(p_rf, n_rows)
    p_xgb = _ensure_len(p_xgb, n_rows)
    p_lgb = _ensure_len(p_lgb, n_rows)
    p_lr = _ensure_len(p_lr, n_rows)

    p = (0.35 * p_xgb + 0.35 * p_lgb + 0.20 * p_rf + 0.10 * p_lr).astype(float)

    base = df_feats[["game_id", "play_id", "wp", "qtr"]].copy()
    base["prob"] = p

    # compute signal and merge ONLY signal back, to avoid wp/qtr duplication
    ss = sustained_signals(base[["game_id", "play_id", "wp", "qtr"]])
    ss_signal = ss[["game_id", "play_id", "signal"]]
    out = base.merge(ss_signal, on=["game_id", "play_id"], how="left")

    ctx_cols = [
        "game_id",
        "play_id",
        "posteam",
        "defteam",
        "down",
        "ydstogo",
        "yardline_100",
        "game_seconds_remaining",
        "desc",
    ]
    ctx = pbp[ctx_cols].copy()
    out = (
        out.merge(ctx, on=["game_id", "play_id"], how="left")
        .sort_values(["game_id", "play_id"])
        .reset_index(drop=True)
    )

    # Remove any duplicate columns that might have been created
    out = out.loc[:, ~out.columns.duplicated()]

    return out


def _key(date, t1, t2):
    return f"{date}:{t1}:{t2}"


@app.get("/next")
def next_play(
        date: str = Query(...),
        team1: str = Query(...),
        team2: str = Query(...),
        model_dir: str = Query("models/pretrained"),
        reset: bool = Query(False),
        peek: bool = Query(False),
        verbose: bool = Query(False),
):
    t1 = team1.upper()
    t2 = team2.upper()
    key = _key(date, t1, t2)
    if reset or key not in STATE:
        rows = _load_sequence(date, t1, t2, model_dir)
        STATE[key] = {"rows": rows, "i": 0}
    st = STATE[key]
    i = st["i"]
    rows = st["rows"]
    if i >= len(rows):
        return {"done": True, "remaining": 0}
    row = rows.iloc[i]
    minimal = {
        "signal": int(row["signal"]) if not pd.isna(row["signal"]) else 0,
        "wp": float(row["wp"]),
        "desc": str(row["desc"]),
    }
    if verbose:
        minimal.update(
            {
                "game_id": row["game_id"],
                "play_id": int(row["play_id"]),
                "qtr": int(row["qtr"]),
                "prob": float(row["prob"]),
                "posteam": row["posteam"],
                "defteam": row["defteam"],
                "down": int(row["down"]),
                "ydstogo": int(row["ydstogo"]),
                "yardline_100": int(row["yardline_100"]),
                "game_seconds_remaining": int(row["game_seconds_remaining"]),
                "remaining": int(len(rows) - (i + 1)),
            }
        )
    if not peek:
        st["i"] = i + 1
    return minimal


def ensure_game(game_id: str):
    if game_id not in GAMES:
        GAMES[game_id] = {"plays": [], "event": asyncio.Event()}


def add_play(game_id: str, play: dict):
    ensure_game(game_id)
    GAMES[game_id]["plays"].append(play)
    GAMES[game_id]["event"].set()
    GAMES[game_id]["event"].clear()


class PlayIn(BaseModel):
    play_id: str
    qtr: int
    wp: float
    signal: int = 0
    desc: str = ""
    clock: Optional[str] = None
    prob: Optional[float] = None
    posteam: Optional[str] = None
    defteam: Optional[str] = None
    down: Optional[int] = None
    ydstogo: Optional[int] = None
    yardline_100: Optional[int] = None
    game_seconds_remaining: Optional[int] = None


@app.post("/games/{game_id}/plays", status_code=202)
async def push_play(game_id: str, payload: PlayIn):
    add_play(game_id, payload.model_dump())
    return {"accepted": True, "count": len(GAMES[game_id]["plays"])}


@app.get("/games/{game_id}/stream")
async def sse_stream(
        game_id: str, request: Request, since: int = -1, heartbeat: float = 15.0
):
    ensure_game(game_id)

    async def event_gen():
        last_idx = since
        while True:
            if await request.is_disconnected():
                break
            plays = GAMES[game_id]["plays"]
            while len(plays) - 1 > last_idx:
                last_idx += 1
                payload = {"index": last_idx, "play": plays[last_idx]}
                yield f"data: {json.dumps(payload)}\n\n"
            try:
                await asyncio.wait_for(GAMES[game_id]["event"].wait(), timeout=heartbeat)
            except asyncio.TimeoutError:
                yield f": ping {last_idx}\n\n"
                continue

    return StreamingResponse(event_gen(), media_type="text/event-stream")