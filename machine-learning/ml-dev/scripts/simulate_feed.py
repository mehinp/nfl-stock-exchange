import pandas as pd
import numpy as np
import joblib
from pathlib import Path

GAME_ID = "2024_03_SF_LA"
PROB_THRESH = 0.60
K = 5


def load_holdout():
    import nfl_data_py as nfl
    pbp = nfl.import_pbp_data([2024])
    pbp = pbp[pbp['play_type'].isin(['pass', 'run'])].copy()
    pbp = pbp.dropna(subset=['down', 'ydstogo', 'yardline_100', 'qtr',
                             'game_seconds_remaining', 'score_differential', 'wp'])
    return pbp


def engineer(pbp):
    df = pbp.copy()
    df['score_diff'] = df['score_differential'].abs()
    df['is_close_game'] = (df['score_diff'] <= 8).astype(int)
    df['is_very_close'] = (df['score_diff'] <= 3).astype(int)
    df['is_fourth_qtr'] = (df['qtr'] == 4).astype(int)
    df['is_crunch_time'] = ((df['qtr'] == 4) & (df['game_seconds_remaining'] < 300)).astype(int)
    df['is_final_2min'] = ((df['qtr'] == 4) & (df['game_seconds_remaining'] < 120)).astype(int)
    df['leverage_index'] = (
            df['is_close_game'] *
            (1 + df['is_fourth_qtr']) *
            (1 + df['is_crunch_time']) *
            (1 + df['is_final_2min'])
    )
    df['in_red_zone'] = (df['yardline_100'] <= 20).astype(int)
    df['in_fg_range'] = (df['yardline_100'] <= 35).astype(int)
    df['field_position_value'] = 100 - df['yardline_100']
    df['third_down'] = (df['down'] == 3).astype(int)
    df['long_distance'] = (df['ydstogo'] >= 7).astype(int)
    df['short_yardage'] = (df['ydstogo'] <= 2).astype(int)
    return df


def select_features(df):
    feature_cols = [
        'down', 'ydstogo', 'yardline_100', 'qtr', 'game_seconds_remaining', 'score_differential',
        'in_red_zone', 'in_fg_range', 'field_position_value', 'third_down', 'long_distance', 'short_yardage',
        'is_close_game', 'is_very_close', 'is_fourth_qtr', 'is_crunch_time', 'is_final_2min', 'leverage_index'
    ]
    # FIX: include 'qtr' in id_cols so downstream code has it
    id_cols = ['game_id', 'play_id', 'wp', 'qtr']
    df_clean = df[feature_cols + id_cols].dropna()
    return df_clean, feature_cols


def sustained_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["game_id", "play_id"]).copy()

    wp = np.asarray(df["wp"].to_numpy(), dtype=float).reshape(-1)
    qtr = np.asarray(df["qtr"].to_numpy()).reshape(-1)

    n = wp.shape[0]
    label = np.zeros(n, dtype=int)

    rising_streak = 0
    falling_streak = 0
    outside_band = 0
    one_active = False
    two_active = False

    for i in range(1, n):
        prev_tr = min(wp[i - 1], 1.0 - wp[i - 1])
        curr_tr = min(wp[i], 1.0 - wp[i])

        rise = curr_tr > prev_tr
        drop = curr_tr < prev_tr
        delta = curr_tr - prev_tr

        if not one_active:
            if prev_tr < 0.35:
                rising_streak = rising_streak + 1 if rise else 0
                if rising_streak >= 5:
                    one_active = True
                if any(
                        min(wp[max(0, i - k)], 1.0 - wp[max(0, i - k)]) < 0.35 and curr_tr >= 0.45
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

        q = qtr[i]
        try:
            q = int(q.item() if hasattr(q, "item") else q)
        except Exception:
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


def load_pbp(game_id: str):
    pbp = load_holdout()
    return pbp[pbp["game_id"] == game_id].copy()


def attach_context(o):
    pbp = load_pbp(GAME_ID)
    keep = [
        'game_id', 'play_id', 'qtr', 'wp',
        'posteam', 'defteam', 'down', 'ydstogo',
        'yardline_100', 'game_seconds_remaining', 'desc'
    ]
    pbp_small = pbp[keep].copy()
    merged = o.merge(
        pbp_small,
        on=['game_id', 'play_id'],
        how='left',
        validate='one_to_one',
        suffixes=('', '_pbp')
    )
    for c in ['qtr', 'wp']:
        if f'{c}_pbp' in merged.columns:
            merged[c] = merged[f'{c}_pbp']
            merged.drop(columns=[f'{c}_pbp'], inplace=True)

    # Remove any duplicate columns that might have been created
    merged = merged.loc[:, ~merged.columns.duplicated()]

    return merged


def simulate(model_dir='models/pretrained'):
    df = load_holdout()
    df = engineer(df)
    if GAME_ID:
        df = df[df["game_id"] == GAME_ID].copy()
    df, feats = select_features(df)
    X = df[feats].copy()
    games = df[['game_id', 'play_id', 'wp', 'qtr']].copy()

    rf = joblib.load(Path(model_dir) / 'rf_model.pkl')
    lr = joblib.load(Path(model_dir) / 'lr_model.pkl')
    xgbm = joblib.load(Path(model_dir) / 'xgb_model.pkl')
    lgbm = joblib.load(Path(model_dir) / 'lgb_model.pkl')

    p_rf = rf.predict_proba(X)[:, 1]
    p_xgb = xgbm.predict_proba(X)[:, 1]
    p_lgb = lgbm.predict_proba(X)[:, 1]
    p_lr = lr.predict_proba(X)[:, 1]
    p = 0.35 * p_xgb + 0.35 * p_lgb + 0.2 * p_rf + 0.1 * p_lr
    pred = (p >= PROB_THRESH).astype(int)

    base = pd.DataFrame({
        'game_id': games['game_id'].values,
        'play_id': games['play_id'].values,
        'wp': games['wp'].values,
        'qtr': games['qtr'].values,
        'prob': p,
        'pred': pred
    })

    ss = sustained_signals(base[['game_id', 'play_id', 'wp', 'qtr']])
    out = base.merge(ss, on=['game_id', 'play_id'], how='left').sort_values(['game_id', 'play_id'])

    # Remove any duplicate columns that might have been created
    out = out.loc[:, ~out.columns.duplicated()]

    return out


if __name__ == '__main__':
    o = simulate()
    o = attach_context(o)
    pd.set_option('display.max_rows', None)
    pd.set_option('display.max_colwidth', None)
    pd.set_option('display.width', 220)
    cols = ['game_id', 'play_id', 'qtr', 'wp', 'signal',
            'posteam', 'defteam', 'down', 'ydstogo', 'yardline_100',
            'game_seconds_remaining', 'desc']
    print(o[cols].to_string(index=False))