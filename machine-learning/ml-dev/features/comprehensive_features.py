import pandas as pd
import numpy as np
from datetime import datetime


class ComprehensiveFeatureEngine:

    def __init__(self):
        self.game_memory = {}

    def extract_features_from_live_data(self, game_data):
        game_state = game_data['game_state']
        pbp = game_data['play_by_play']
        wp = game_data['win_probability']
        injuries = game_data['injuries']

        if pbp.empty:
            return self.get_default_features()

        latest = pbp.iloc[-1]
        recent_10 = pbp.tail(10)
        recent_5 = pbp.tail(5)

        features = {}

        features['wp'] = wp['current_home_wp'] / 100 if wp else 0.5

        if len(pbp) >= 2:
            prev_wp = self._estimate_wp_from_score(pbp.iloc[-2])
            features['wp_change_abs'] = abs(features['wp'] - prev_wp)
        else:
            features['wp_change_abs'] = 0

        if len(pbp) >= 4:
            prev_wp_3 = self._estimate_wp_from_score(pbp.iloc[-4])
            features['wp_change_3plays_abs'] = abs(features['wp'] - prev_wp_3)
        else:
            features['wp_change_3plays_abs'] = 0

        if len(pbp) >= 6:
            prev_wp_5 = self._estimate_wp_from_score(pbp.iloc[-6])
            features['wp_change_5plays_abs'] = abs(features['wp'] - prev_wp_5)
        else:
            features['wp_change_5plays_abs'] = 0

        for window in [3, 5, 10]:
            window_data = recent_10.tail(window) if len(recent_10) >= window else recent_10
            if not window_data.empty:
                features[f'rolling_epa_{window}'] = window_data['yards_gained'].mean() / 10
                features[f'rolling_epa_std_{window}'] = window_data['yards_gained'].std() / 10 if len(
                    window_data) > 1 else 0
                features[f'rolling_wp_std_{window}'] = 0.05
            else:
                features[f'rolling_epa_{window}'] = 0
                features[f'rolling_epa_std_{window}'] = 0
                features[f'rolling_wp_std_{window}'] = 0

        turnover_keywords = ['INTERCEPTED', 'FUMBLE']
        features['turnover'] = int(any(kw in latest.get('play_text', '').upper() for kw in turnover_keywords))
        features['explosive_play'] = int(latest.get('yards_gained', 0) >= 20)
        features['scoring_play'] = int(latest.get('scoring_play', False))
        features['sack'] = int('sack' in latest.get('play_text', '').lower())
        features['fourth_down_attempt'] = int(latest.get('down') == 4)
        features['fourth_down_converted'] = 0
        features['fourth_down_failed'] = 0

        score_diff = game_state['home_score'] - game_state['away_score']
        features['score_diff'] = abs(score_diff)
        features['is_close_game'] = int(features['score_diff'] <= 8)
        features['is_very_close'] = int(features['score_diff'] <= 3)
        features['is_fourth_qtr'] = int(game_state['quarter'] == 4)

        seconds_remaining = self._parse_clock_to_seconds(game_state.get('clock', '15:00'), game_state['quarter'])

        features['is_crunch_time'] = int(features['is_fourth_qtr'] and seconds_remaining < 300)
        features['is_final_2min'] = int(features['is_fourth_qtr'] and seconds_remaining < 120)

        features['leverage_index'] = (
                features['is_close_game'] *
                (1 + features['is_fourth_qtr']) *
                (1 + features['is_crunch_time']) *
                (1 + features['is_final_2min'])
        )

        yardline = latest.get('yardline', 50)
        if yardline is None:
            yardline = 50

        features['in_red_zone'] = int(yardline <= 20)
        features['in_fg_range'] = int(yardline <= 35)
        features['field_position_value'] = 100 - yardline

        down = latest.get('down', 1)
        ydstogo = latest.get('distance', 10)

        if down is None:
            down = 1
        if ydstogo is None:
            ydstogo = 10

        features['third_down'] = int(down == 3)
        features['long_distance'] = int(ydstogo >= 7)
        features['short_yardage'] = int(ydstogo <= 2)

        features['down'] = down
        features['ydstogo'] = ydstogo
        features['yardline_100'] = yardline
        features['qtr'] = game_state['quarter']
        features['game_seconds_remaining'] = seconds_remaining
        features['yards_gained'] = latest.get('yards_gained', 0)
        features['epa'] = latest.get('yards_gained', 0) / 10

        return features

    def _estimate_wp_from_score(self, play_row):
        try:
            home_score = play_row.get('home_score', 0)
            away_score = play_row.get('away_score', 0)
            diff = home_score - away_score

            wp = 0.5 + (diff / 50)
            return max(0, min(1, wp))
        except:
            return 0.5

    def _parse_clock_to_seconds(self, clock_str, quarter):
        try:
            parts = clock_str.split(':')
            minutes = int(parts[0])
            seconds = int(parts[1])
            quarter_seconds = minutes * 60 + seconds

            quarters_left = max(4 - quarter, 0)
            return quarters_left * 900 + quarter_seconds
        except:
            return 900

    def get_default_features(self):
        feature_names = [
            'wp', 'wp_change_abs', 'wp_change_3plays_abs', 'wp_change_5plays_abs',
            'rolling_epa_3', 'rolling_epa_5', 'rolling_epa_10',
            'rolling_epa_std_3', 'rolling_epa_std_5', 'rolling_epa_std_10',
            'rolling_wp_std_3', 'rolling_wp_std_5', 'rolling_wp_std_10',
            'turnover', 'explosive_play', 'scoring_play', 'sack',
            'fourth_down_attempt', 'fourth_down_converted', 'fourth_down_failed',
            'score_diff', 'is_close_game', 'is_very_close',
            'is_fourth_qtr', 'is_crunch_time', 'is_final_2min', 'leverage_index',
            'in_red_zone', 'in_fg_range', 'field_position_value',
            'third_down', 'long_distance', 'short_yardage',
            'down', 'ydstogo', 'yardline_100', 'qtr', 'game_seconds_remaining',
            'yards_gained', 'epa'
        ]
        return {feat: 0 for feat in feature_names}