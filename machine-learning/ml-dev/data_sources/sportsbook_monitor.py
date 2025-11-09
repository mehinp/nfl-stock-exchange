import requests
from datetime import datetime


class SportsbookLineMonitor:

    def __init__(self):
        self.line_history = {}

    def get_mock_line_data(self, game_id):
        return {
            'spread': 0.0,
            'moneyline_home': 0,
            'moneyline_away': 0,
            'total': 0.0,
            'timestamp': datetime.now()
        }

    def detect_sharp_money(self, game_id):
        return {
            'sharp_detected': False,
            'spread_movement': 0.0,
            'reverse_line_movement': False
        }