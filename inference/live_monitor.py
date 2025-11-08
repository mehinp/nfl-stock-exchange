import pandas as pd
import numpy as np
import time
from datetime import datetime
import joblib
from pathlib import Path
import sys

sys.path.append('.')

from data_sources.espn_live import ESPNLiveDataCollector
from features.comprehensive_features import ComprehensiveFeatureEngine
from config.settings import SWING_THRESHOLD, MODEL_WEIGHTS, MONITORING_INTERVAL


class LiveSwingMonitor:

    def __init__(self):
        print("Initializing Live Swing Monitor...")

        self.load_models()

        self.espn = ESPNLiveDataCollector()
        self.feature_engine = ComprehensiveFeatureEngine()

        print("Live Swing Monitor ready")

    def load_models(self):
        print("Loading trained models...")

        models_dir = Path('models/pretrained')

        if not models_dir.exists():
            raise FileNotFoundError(
                "Models not found. Please train models first:\n"
                "python run_system.py -> Option 1"
            )

        self.models = {}

        model_files = {
            'xgb': 'xgb_model.pkl',
            'lgb': 'lgb_model.pkl',
            'rf': 'rf_model.pkl',
            'lr': 'lr_model.pkl'
        }

        for model_name, filename in model_files.items():
            model_path = models_dir / filename
            if model_path.exists():
                self.models[model_name] = joblib.load(model_path)
                print(f"  Loaded {model_name}")

        self.scaler = joblib.load(models_dir / 'scaler.pkl')
        self.feature_names = joblib.load(models_dir / 'feature_names.pkl')

        print(f"Loaded {len(self.models)} models")

    def predict_swing(self, features_df):
        features_df = features_df[self.feature_names]

        ensemble_pred = 0.0

        for model_name, model in self.models.items():
            if model_name == 'lr':
                X_input = self.scaler.transform(features_df)
            else:
                X_input = features_df

            pred = model.predict_proba(X_input)[:, 1][0]
            ensemble_pred += pred * MODEL_WEIGHTS[model_name]

        return ensemble_pred

    def monitor_game(self, game_id):
        print(f"\nMonitoring game {game_id}")

        last_play_id = None

        while True:
            try:
                game_data = self.espn.get_comprehensive_game_state(game_id)

                if not game_data:
                    print("Game not live")
                    time.sleep(10)
                    continue

                pbp = game_data['play_by_play']
                if pbp.empty:
                    time.sleep(5)
                    continue

                latest_play = pbp.iloc[-1]
                if latest_play['play_id'] == last_play_id:
                    time.sleep(MONITORING_INTERVAL)
                    continue

                last_play_id = latest_play['play_id']

                features = self.feature_engine.extract_features_from_live_data(game_data)
                features_df = pd.DataFrame([features])

                swing_prob = self.predict_swing(features_df)

                if swing_prob >= SWING_THRESHOLD:
                    self.alert_swing(game_data, swing_prob, features)

                time.sleep(MONITORING_INTERVAL)

            except KeyboardInterrupt:
                print("\nMonitoring stopped")
                break
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(5)

    def alert_swing(self, game_data, swing_prob, features):
        print("\n" + "=" * 60)
        print("SWING DETECTED")
        print("=" * 60)

        game_state = game_data['game_state']
        print(f"Game: {game_state['away_team']} @ {game_state['home_team']}")
        print(
            f"Score: {game_state['away_team']} {game_state['away_score']} - {game_state['home_team']} {game_state['home_score']}")
        print(f"Quarter: {game_state['quarter']}, Clock: {game_state.get('clock', 'N/A')}")
        print(f"\nSwing Probability: {swing_prob:.1%}")

        print(f"\nKey Factors:")
        print(f"  WP Change: {features.get('wp_change_abs', 0):.1%}")
        print(f"  Score Differential: {features.get('score_diff', 0)}")
        print(f"  Leverage Index: {features.get('leverage_index', 0):.2f}")
        print(f"  Turnover: {'Yes' if features.get('turnover', 0) else 'No'}")

        injuries = game_data.get('injuries', [])
        if injuries:
            print(f"\nInjuries Detected: {len(injuries)}")
            for inj in injuries[:3]:
                print(f"  - {inj['text'][:80]}")

        print("=" * 60 + "\n")

    def monitor_all_live_games(self):
        while True:
            try:
                live_games = self.espn.get_live_games()

                if not live_games:
                    print("No live games. Checking again in 60 seconds...")
                    time.sleep(60)
                    continue

                print(f"\nFound {len(live_games)} live games:")
                for game in live_games:
                    print(f"  {game['away_team']} @ {game['home_team']}")

                for game in live_games:
                    self.monitor_game(game['game_id'])

            except KeyboardInterrupt:
                print("\nStopped monitoring")
                break
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(30)