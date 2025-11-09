import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, GroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
import xgboost as xgb
import lightgbm as lgb
import joblib
from pathlib import Path
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline

class CustomSwingModelTrainer:
    def __init__(self):
        self.models = {}
        self.scaler = StandardScaler()
        self.feature_names = []

    def load_and_prepare_data(self):
        import nfl_data_py as nfl
        seasons = [2021, 2022, 2023]
        pbp = nfl.import_pbp_data(seasons)
        pbp = pbp[pbp['play_type'].isin(['pass', 'run'])].copy()
        pbp = pbp.dropna(subset=['down','ydstogo','yardline_100','qtr','game_seconds_remaining','score_differential'])
        return pbp

    def engineer_features(self, pbp):
        df = pbp.copy()
        df['score_diff'] = df['score_differential'].abs()
        df['is_close_game'] = (df['score_diff'] <= 8).astype(int)
        df['is_very_close'] = (df['score_diff'] <= 3).astype(int)
        df['is_fourth_qtr'] = (df['qtr'] == 4).astype(int)
        df['is_crunch_time'] = ((df['qtr'] == 4) & (df['game_seconds_remaining'] < 300)).astype(int)
        df['is_final_2min'] = ((df['qtr'] == 4) & (df['game_seconds_remaining'] < 120)).astype(int)
        df['leverage_index'] = (df['is_close_game'] * (1 + df['is_fourth_qtr']) * (1 + df['is_crunch_time']) * (1 + df['is_final_2min']))
        df['in_red_zone'] = (df['yardline_100'] <= 20).astype(int)
        df['in_fg_range'] = (df['yardline_100'] <= 35).astype(int)
        df['field_position_value'] = 100 - df['yardline_100']
        df['third_down'] = (df['down'] == 3).astype(int)
        df['long_distance'] = (df['ydstogo'] >= 7).astype(int)
        df['short_yardage'] = (df['ydstogo'] <= 2).astype(int)
        df['wp_change'] = df.groupby('game_id')['wp'].diff()
        df['wp_change_abs'] = df['wp_change'].abs()
        for lag in [3,5]:
            df[f'wp_change_{lag}plays'] = df.groupby('game_id')['wp'].transform(lambda x: x - x.shift(lag))
            df[f'wp_change_{lag}plays_abs'] = df[f'wp_change_{lag}plays'].abs()
        df['turnover'] = ((df['interception'] == 1) | (df['fumble_lost'] == 1)).astype(int)
        df['fourth_down_failed'] = ((df['down'] == 4) & (df['series_result'] == 'Turnover on downs')).astype(int)
        df['score_change'] = df.groupby('game_id')['score_differential'].diff().abs()
        return df

    def create_labels(self, df):
        df = df.sort_values(['game_id', 'play_id']).copy()
        K = 5
        df['wp_prevK'] = df.groupby('game_id')['wp'].shift(K)
        df['to_center'] = np.sign(0.5 - df['wp_prevK'])
        df['wp_move_to_center'] = (df['wp'] - df['wp_prevK']) * df['to_center']
        df['wp_d'] = df.groupby('game_id')['wp'].diff()
        df['dir_match'] = (np.sign(df['wp_d']) == df['to_center']).astype(int)
        df['dir_hits'] = df.groupby('game_id')['dir_match'].rolling(K, min_periods=K).sum().reset_index(level=0,
                                                                                                        drop=True)
        sustained = ((df['wp_move_to_center'] >= 0.15) & (df['dir_hits'] >= 3) & (df['wp'].between(0.35, 0.65))).astype(
            int)
        late_close = (((df['qtr'] == 4) & (df['wp'].between(0.40, 0.60))).astype(int))
        df['is_swing'] = np.where(late_close == 1, 1, sustained)
        df.drop(columns=['wp_prevK', 'to_center', 'wp_move_to_center', 'wp_d', 'dir_match', 'dir_hits'], inplace=True)
        return df

    def select_features(self, df):
        feature_cols = [
            'down','ydstogo','yardline_100','qtr','game_seconds_remaining','score_differential',
            'in_red_zone','in_fg_range','field_position_value','third_down','long_distance','short_yardage',
            'is_close_game','is_very_close','is_fourth_qtr','is_crunch_time','is_final_2min','leverage_index'
        ]
        id_cols = ['game_id','play_id']
        keep = [c for c in feature_cols if c in df.columns]
        df_clean = df[keep + id_cols + ['is_swing']].dropna()
        self.feature_names = keep
        return df_clean, keep

    def split_data(self, df, feature_cols):
        X_all = df[feature_cols].copy()
        y_all = df['is_swing'].astype(int)
        groups = df['game_id']
        gkf = GroupKFold(n_splits=5)
        train_idx, test_idx = next(gkf.split(X_all, y_all, groups=groups))
        X_temp, X_test = X_all.iloc[train_idx], X_all.iloc[test_idx]
        y_temp, y_test = y_all.iloc[train_idx], y_all.iloc[test_idx]
        X_train, X_val, y_train, y_val = train_test_split(X_temp, y_temp, test_size=0.2, stratify=y_temp, random_state=42)
        return X_train, X_val, X_test, y_train, y_val, y_test

    def train_xgboost(self, X_train, y_train, X_val, y_val):
        scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
        model = xgb.XGBClassifier(n_estimators=300,max_depth=6,learning_rate=0.05,subsample=0.8,colsample_bytree=0.8,scale_pos_weight=scale_pos_weight,eval_metric='logloss',random_state=42,n_jobs=-1)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        self.models['xgb'] = model
        return model

    def train_lightgbm(self, X_train, y_train, X_val, y_val):
        base = lgb.LGBMClassifier(n_estimators=300, max_depth=6, learning_rate=0.05,
                                  num_leaves=31, subsample=0.8, colsample_bytree=0.8,
                                  random_state=42, n_jobs=-1)
        base.fit(X_train, y_train)
        calib = CalibratedClassifierCV(base, method='isotonic', cv='prefit')
        calib.fit(X_val, y_val)
        self.models['lgb'] = calib
        return calib

    def train_random_forest(self, X_train, y_train, X_val, y_val):
        model = RandomForestClassifier(n_estimators=300,max_depth=12,min_samples_split=10,min_samples_leaf=5,class_weight='balanced',random_state=42,n_jobs=-1,max_features='sqrt')
        model.fit(X_train, y_train)
        self.models['rf'] = model
        return model

    def train_logistic_regression(self, X_train, y_train, X_val, y_val):
        model = Pipeline([
            ('sc', StandardScaler()),
            ('lr', LogisticRegression(C=0.5, class_weight='balanced', max_iter=2000, random_state=42))
        ])
        model.fit(X_train, y_train)
        self.models['lr'] = model
        return model

    def pick_threshold(self, model, X_val, y_val):
        p = model.predict_proba(X_val)[:, 1]
        from sklearn.metrics import f1_score
        best_t, best_f1 = 0.5, -1
        for t in np.linspace(0.3, 0.8, 51):
            f = f1_score(y_val, (p >= t).astype(int))
            if f > best_f1:
                best_t, best_f1 = t, f
        return best_t

    def evaluate_models(self, X_test, y_test):
        for model_name, model in self.models.items():
            X_test_input = X_test
            y_pred_proba = model.predict_proba(X_test_input)[:, 1]
            y_pred = (y_pred_proba >= 0.5).astype(int)
            print(model_name.upper())
            print(classification_report(y_test, y_pred, digits=3))
            print(f"ROC-AUC: {roc_auc_score(y_test, y_pred_proba):.4f}")

    def save_models(self, output_dir='models/pretrained'):
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        for model_name, model in self.models.items():
            model_path = Path(output_dir) / f'{model_name}_model.pkl'
            joblib.dump(model, model_path)
        joblib.dump(self.feature_names, Path(output_dir) / 'feature_names.pkl')

    def train_complete_pipeline(self):
        pbp = self.load_and_prepare_data()
        df = self.engineer_features(pbp)
        df = self.create_labels(df)
        df_clean, feature_cols = self.select_features(df)
        X_train, X_val, X_test, y_train, y_val, y_test = self.split_data(df_clean, feature_cols)
        self.train_xgboost(X_train, y_train, X_val, y_val)
        self.train_lightgbm(X_train, y_train, X_val, y_val)
        self.train_random_forest(X_train, y_train, X_val, y_val)
        self.train_logistic_regression(X_train, y_train, X_val, y_val)
        self.evaluate_models(X_test, y_test)
        self.save_models()
        return self.models