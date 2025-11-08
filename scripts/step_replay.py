import pandas as pd
import numpy as np
import joblib
from pathlib import Path
import nfl_data_py as nfl


GAME_ID = "2024_03_SF_LA"
PROB_THRESH = 0.60
K = 5


def load_holdout():
    pbp = nfl.import_pbp_data([2024])
    pbp = pbp[pbp["play_type"].isin(["pass", "run"])].copy()
    pbp = pbp.dropna(subset=[
        "down", "ydstogo", "yardline_100", "qtr",
        "game_seconds_remaining", "score_differential", "wp"
    ])
    return pbp


def engineer(pbp):
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


def select_features(df):
    feature_cols = [
        "down","ydstogo","yardline_100","qtr","game_seconds_remaining","score_differential",
        "in_red_zone","in_fg_range","field_position_value","third_down","long_distance","short_yardage",
        "is_close_game","is_very_close","is_fourth_qtr","is_crunch_time","is_final_2min","leverage_index"
    ]
    id_cols = ["game_id","play_id","wp"]
    df_clean = df[feature_cols + id_cols].dropna()
    return df_clean, feature_cols


def sustained_signals(df):
    df = df.sort_values(["game_id","play_id"]).copy()
    wp = df["wp"].values
    qtr = df["qtr"].values
    trailing = np.minimum(wp, 1 - wp)
    n = len(df)
    label = np.zeros(n, dtype=int)
    rising_streak = falling_streak = outside_band = 0
    one_active = two_active = False
    for i in range(1, n):
        rise = trailing[i] > trailing[i - 1]
        drop = trailing[i] < trailing[i - 1]
        delta = trailing[i] - trailing[i - 1]
        if not one_active:
            if trailing[i - 1] < 0.35:
                rising_streak = rising_streak + 1 if rise else 0
                if rising_streak >= 5:
                    one_active = True
                if any(trailing[max(0, i - k)] < 0.35 and trailing[i] >= 0.45 for k in range(3, 6)):
                    one_active = True
                if trailing[i - 1] <= 0.30 and delta >= 0.15:
                    one_active = True
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
                if outside_band >= 4:
                    two_active = False
        else:
            two_active = False
            outside_band = 0
        label[i] = 2 if two_active else (1 if one_active else 0)
    out = df[["game_id","play_id","qtr","wp"]].copy()
    out["signal"] = label
    return out


def _predict_aligned(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "feature_names_in_"):
        names = list(model.feature_names_in_)
    else:
        names = list(X.columns)
    X2 = X.reindex(columns=names, fill_value=0)
    X2 = X2.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return model.predict_proba(X2.to_numpy())[:, 1]


def load_pbp(game_id: str):
    pbp = load_holdout()
    return pbp[pbp["game_id"] == game_id].copy()


def attach_context(o):
    pbp = load_pbp(GAME_ID)
    keep = [
        "game_id","play_id","qtr","wp","posteam","defteam","down","ydstogo",
        "yardline_100","game_seconds_remaining","desc"
    ]
    pbp_small = pbp[keep].copy()
    merged = o.merge(
        pbp_small,
        on=["game_id","play_id"],
        how="left",
        validate="one_to_one",
        suffixes=("", "_pbp")
    )
    for c in ["qtr","wp"]:
        if f"{c}_pbp" in merged.columns:
            merged[c] = merged[f"{c}_pbp"]
            merged.drop(columns=[f"{c}_pbp"], inplace=True)
    return merged


def simulate_stepwise(model_dir="models/pretrained"):
    df = load_holdout()
    df = engineer(df)
    if GAME_ID:
        df = df[df["game_id"] == GAME_ID].copy()
    df, feats = select_features(df)
    X = df[feats].copy()
    games = df[["game_id","play_id","wp","qtr"]].copy()

    rf = joblib.load(Path(model_dir) / "rf_model.pkl")
    lr = joblib.load(Path(model_dir) / "lr_model.pkl")
    xgbm = joblib.load(Path(model_dir) / "xgb_model.pkl")
    lgbm = joblib.load(Path(model_dir) / "lgb_model.pkl")

    p_rf = _predict_aligned(rf, X)
    p_xgb = _predict_aligned(xgbm, X)
    p_lgb = _predict_aligned(lgbm, X)
    p_lr = _predict_aligned(lr, X)
    p = 0.35 * p_xgb + 0.35 * p_lgb + 0.2 * p_rf + 0.1 * p_lr
    pred = (p >= PROB_THRESH).astype(int)

    base = pd.DataFrame({
        "game_id": games["game_id"].values,
        "play_id": games["play_id"].values,
        "wp": games["wp"].values,
        "qtr": games["qtr"].values,
        "prob": p,
        "pred": pred
    })

    ss = sustained_signals(base[["game_id","play_id","wp","qtr"]])
    out = base.merge(ss, on=["game_id","play_id"], how="left").sort_values(["game_id","play_id"])
    out = attach_context(out)
    return out


def main():
    o = simulate_stepwise()
    pd.set_option("display.max_colwidth", None)
    pd.set_option("display.width", 220)
    cols = [
        "game_id","play_id","qtr","wp","signal","posteam","defteam","down",
        "ydstogo","yardline_100","game_seconds_remaining","desc"
    ]
    plays = o[cols].reset_index(drop=True)

    print(f"Loaded {len(plays)} plays for {GAME_ID}. Press Enter for next play, 'q' to quit.\n")

    i = 0
    while i < len(plays):
        print(plays.iloc[i].to_string())
        cmd = input()
        if cmd.strip().lower().startswith("q"):
            break
        i += 1


if __name__ == "__main__":
    main()