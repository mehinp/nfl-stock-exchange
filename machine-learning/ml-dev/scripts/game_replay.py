import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


PROB_THRESH = 0.60


def load_game_pbp(game_date, team_a, team_b):
    import nfl_data_py as nfl

    date = pd.to_datetime(game_date).date()
    season = date.year

    pbp = nfl.import_pbp_data([season])
    pbp["game_date"] = pd.to_datetime(pbp["game_date"]).dt.date

    mask = (
        (pbp["game_date"] == date)
        & (pbp["home_team"].isin([team_a, team_b]))
        & (pbp["away_team"].isin([team_a, team_b]))
    )

    game = pbp[mask].copy()
    if game.empty:
        raise ValueError("No game found for that date and team combination")

    game = game[game["play_type"].isin(["pass", "run"])].copy()
    game = game.dropna(
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
    return game


def engineer(pbp):
    df = pbp.copy()
    df["score_diff"] = df["score_differential"].abs()
    df["is_close_game"] = (df["score_diff"] <= 8).astype(int)
    df["is_very_close"] = (df["score_diff"] <= 3).astype(int)
    df["is_fourth_qtr"] = (df["qtr"] == 4).astype(int)
    df["is_crunch_time"] = (
        (df["qtr"] == 4) & (df["game_seconds_remaining"] < 300)
    ).astype(int)
    df["is_final_2min"] = (
        (df["qtr"] == 4) & (df["game_seconds_remaining"] < 120)
    ).astype(int)
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


def select_features(df):
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
    id_cols = ["game_id", "play_id", "wp", "qtr"]
    df_clean = df[feature_cols + id_cols].dropna()
    return df_clean, feature_cols


def compute_signals(df):
    wp = df["wp"].values.astype(float)
    trail = np.minimum(wp, 1.0 - wp)
    n = len(df)
    signal = np.zeros(n, dtype=int)

    active1 = False
    down_streak = 0

    active2 = False
    close_streak = 0
    out_streak = 0

    qtr = df["qtr"].values.astype(int)

    for i in range(n):
        tp = trail[i]
        prev_tp = trail[i - 1] if i > 0 else tp

        if not active1:
            big_jump = False
            if i > 0 and prev_tp <= 0.30 and (tp - prev_tp) >= 0.15:
                big_jump = True

            rise_cond = False
            if i >= 4:
                seg = trail[i - 4 : i + 1]
                if seg[0] < 0.35 and np.all(np.diff(seg) > 0):
                    rise_cond = True

            if not rise_cond:
                for L in (3, 4, 5):
                    if i >= L - 1:
                        seg = trail[i - L + 1 : i + 1]
                        if (
                            seg[0] < 0.35
                            and np.all(np.diff(seg) > 0)
                            and seg[-1] >= 0.45
                        ):
                            rise_cond = True
                            break

            if big_jump or rise_cond:
                active1 = True
                down_streak = 0
        else:
            delta = tp - prev_tp
            if delta <= 0:
                down_streak += 1
            else:
                down_streak = 0
            if delta <= -0.15 or down_streak >= 3:
                active1 = False
                down_streak = 0

        fav = np.maximum(wp[i], 1.0 - wp[i])
        close_now = qtr[i] == 4 and 0.4 <= fav <= 0.6

        if close_now:
            close_streak += 1
            out_streak = 0
            if close_streak >= 4:
                active2 = True
        else:
            if active2:
                out_streak += 1
                if out_streak >= 4:
                    active2 = False
                    close_streak = 0
                    out_streak = 0
            else:
                close_streak = 0
                out_streak = 0

        if active2:
            signal[i] = 2
        elif active1:
            signal[i] = 1
        else:
            signal[i] = 0

    out = df[["game_id", "play_id", "qtr", "wp"]].copy()
    out["signal"] = signal
    return out


def build_game_dataframe(game_date, team_a, team_b, model_dir="models/pretrained"):
    pbp = load_game_pbp(game_date, team_a, team_b)
    df_eng = engineer(pbp)
    df_clean, feats = select_features(df_eng)

    X = df_clean[feats].copy()
    games = df_clean[["game_id", "play_id", "wp", "qtr"]].copy()

    model_dir = Path(model_dir)
    rf = joblib.load(model_dir / "rf_model.pkl")
    lr = joblib.load(model_dir / "lr_model.pkl")
    xgbm = joblib.load(model_dir / "xgb_model.pkl")
    lgbm = joblib.load(model_dir / "lgb_model.pkl")

    p_rf = rf.predict_proba(X)[:, 1]
    p_xgb = xgbm.predict_proba(X)[:, 1]
    p_lgb = lgbm.predict_proba(X)[:, 1]
    p_lr = lr.predict_proba(X)[:, 1]

    p = 0.35 * p_xgb + 0.35 * p_lgb + 0.2 * p_rf + 0.1 * p_lr
    pred = (p >= PROB_THRESH).astype(int)

    base = pd.DataFrame(
        {
            "game_id": games["game_id"].values,
            "play_id": games["play_id"].values,
            "wp": games["wp"].values,
            "qtr": games["qtr"].values,
            "prob": p,
            "pred": pred,
        }
    )

    sig = compute_signals(base)
    base = base.merge(
        sig[["game_id", "play_id", "signal"]],
        on=["game_id", "play_id"],
        how="left",
    )

    keep_cols = [
        "game_id",
        "play_id",
        "qtr",
        "wp",
        "posteam",
        "defteam",
        "down",
        "ydstogo",
        "yardline_100",
        "game_seconds_remaining",
        "desc",
    ]
    pbp_small = df_eng.loc[df_clean.index, keep_cols].copy()

    out = base.merge(
        pbp_small,
        on=["game_id", "play_id", "qtr", "wp"],
        how="left",
        validate="one_to_one",
    )

    out = out.sort_values("play_id").reset_index(drop=True)
    return out


class GameReplay:
    def __init__(self, df):
        self.df = df.sort_values("play_id").reset_index(drop=True)
        self.idx = 0

    def next_play(self):
        if self.idx >= len(self.df):
            return None
        row = self.df.iloc[self.idx]
        self.idx += 1
        return row


def format_play(row):
    return (
        f"{row.game_id}  "
        f"{int(row.play_id):4d}  "
        f"Q{int(row.qtr)}  "
        f"wp={row.wp:.3f}  "
        f"prob={row.prob:.3f}  "
        f"sig={int(row.signal)}  "
        f"{str(row.posteam)} @ {str(row.defteam)}  "
        f"down={int(row.down)}  "
        f"ytg={int(row.ydstogo)}  "
        f"yl={int(row.yardline_100)}  "
        f"t={int(row.game_seconds_remaining)}  "
        f"{row.desc}"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="Game date YYYY-MM-DD")
    parser.add_argument("--team1", required=True, help="One team code, e.g. SF")
    parser.add_argument("--team2", required=True, help="Other team code, e.g. LA")
    parser.add_argument(
        "--model_dir",
        default="models/pretrained",
        help="Directory with trained model pickles",
    )
    args = parser.parse_args()

    df = build_game_dataframe(args.date, args.team1.upper(), args.team2.upper(), args.model_dir)
    replay = GameReplay(df)

    print(f"Game {df['game_id'].iloc[0]} loaded with {len(df)} plays.")
    print("Press Enter for next play, or q then Enter to quit.")

    while True:
        row = replay.next_play()
        if row is None:
            print("End of game.")
            break
        print(format_play(row))
        cmd = input().strip().lower()
        if cmd == "q":
            break


if __name__ == "__main__":
    main()
