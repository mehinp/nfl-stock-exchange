from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import numpy as np
import joblib
import nfl_data_py as nfl

app = FastAPI(title="PBP One-Endpoint API")

STATE = {}

def engineer(pbp: pd.DataFrame) -> pd.DataFrame:
    df = pbp.copy()
    df["score_diff"] = df["score_differential"].abs()
    df["is_close_game"] = (df["score_diff"] <= 8).astype(int)
    df["is_very_close"] = (df["score_diff"] <= 3).astype(int)
    df["is_fourth_qtr"] = (df["qtr"] == 4).astype(int)
    df["is_crunch_time"] = ((df["qtr"] == 4) & (df["game_seconds_remaining"] < 300)).astype(int)
    df["is_final_2min"] = ((df["qtr"] == 4) & (df["game_seconds_remaining"] < 120)).astype(int)
    df["leverage_index"] = (
        df["is_close_game"] * (1 + df["is_fourth_qtr"]) *
        (1 + df["is_crunch_time"]) * (1 + df["is_final_2min"])
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
        "down","ydstogo","yardline_100","qtr","game_seconds_remaining","score_differential",
        "in_red_zone","in_fg_range","field_position_value","third_down","long_distance","short_yardage",
        "is_close_game","is_very_close","is_fourth_qtr","is_crunch_time","is_final_2min","leverage_index"
    ]
    id_cols = ["game_id","play_id","wp","qtr"]
    df_clean = df[feature_cols + id_cols].dropna()
    return df_clean, feature_cols

def sustained_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["game_id","play_id"]).copy()
    wp = df["wp"].values
    qtr = df["qtr"].values
    trailing = np.minimum(wp, 1 - wp)
    n = len(df)
    label = np.zeros(n, dtype=int)
    rising_streak = falling_streak = outside_band = 0
    one_active = two_active = False
    for i in range(1, n):
        rise = trailing[i] > trailing[i-1]
        drop = trailing[i] < trailing[i-1]
        delta = trailing[i] - trailing[i-1]
        if not one_active:
            if trailing[i-1] < 0.35:
                rising_streak = rising_streak + 1 if rise else 0
                if rising_streak >= 5: one_active = True
                if any(trailing[max(0,i-k)] < 0.35 and trailing[i] >= 0.45 for k in range(3,6)): one_active = True
                if trailing[i-1] <= 0.30 and delta >= 0.15: one_active = True
        if one_active:
            falling_streak = falling_streak + 1 if drop else 0
            if falling_streak >= 3 or delta <= -0.15 or (1 - trailing[i]) <= 0.40:
                one_active = False
                falling_streak = 0
        if qtr[i] == 4:
            if 0.40 <= trailing[i] <= 0.60:
                two_active = True
                outside_band = 0
            else:
                outside_band += 1
                if outside_band >= 4: two_active = False
        else:
            two_active = False
            outside_band = 0
        label[i] = 2 if two_active else (1 if one_active else 0)
    out = df[["game_id","play_id","qtr","wp"]].copy()
    out["signal"] = label
    return out

def _expected_feature_names(model, fallback_cols):
    if hasattr(model, "feature_names_in_"):
        return list(model.feature_names_in_)
    return list(fallback_cols)

def _predict_aligned(model, X: pd.DataFrame) -> np.ndarray:
    names = _expected_feature_names(model, X.columns)
    X2 = X.reindex(columns=names, fill_value=0).apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return model.predict_proba(X2.to_numpy())[:, 1]

def _load_sequence(date: str, t1: str, t2: str, model_dir: str) -> pd.DataFrame:
    season = int(date[:4])
    pbp = nfl.import_pbp_data([season])
    mask_date = pbp["game_date"] == date
    mask = ((pbp["home_team"]==t1)&(pbp["away_team"]==t2)) | ((pbp["home_team"]==t2)&(pbp["away_team"]==t1))
    pbp = pbp[mask_date & mask].copy()
    if pbp.empty:
        raise HTTPException(404, "No game found for those parameters.")
    pbp = pbp[pbp["play_type"].isin(["pass","run"])].dropna(subset=[
        "down","ydstogo","yardline_100","qtr","game_seconds_remaining","score_differential","wp"
    ])
    df = engineer(pbp)
    df, feats = select_features(df)
    X = df[feats].copy()
    md = Path(model_dir)
    rf  = joblib.load(md / "rf_model.pkl")
    lr  = joblib.load(md / "lr_model.pkl")
    xgb = joblib.load(md / "xgb_model.pkl")
    lgb = joblib.load(md / "lgb_model.pkl")
    p_rf  = _predict_aligned(rf,  X)
    p_xgb = _predict_aligned(xgb, X)
    p_lgb = _predict_aligned(lgb, X)
    p_lr  = _predict_aligned(lr,  X)
    p = 0.35*p_xgb + 0.35*p_lgb + 0.2*p_rf + 0.1*p_lr
    base = pd.DataFrame({
        "game_id": df["game_id"].values,
        "play_id": df["play_id"].values,
        "wp": df["wp"].values,
        "qtr": df["qtr"].values,
        "prob": p,
    })
    ss = sustained_signals(base[["game_id","play_id","wp","qtr"]])
    out = base.merge(ss, on=["game_id","play_id"], how="left")
    ctx_cols = ["game_id","play_id","posteam","defteam","down","ydstogo","yardline_100","game_seconds_remaining","desc"]
    out = out.merge(pbp[ctx_cols], on=["game_id","play_id"], how="left").sort_values(["game_id","play_id"]).reset_index(drop=True)
    return out

def _key(date, t1, t2): return f"{date}:{t1}:{t2}"

@app.get("/next")
def next_play(
    date: str,
    team1: str,
    team2: str,
    model_dir: str = "models/pretrained",
    reset: int = 0,
    peek: int = 0,
    verbose: int = 0
):
    t1 = team1.upper(); t2 = team2.upper()
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
        minimal.update({
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
        })
    if not peek:
        st["i"] = i + 1
    return minimal