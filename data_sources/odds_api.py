import requests
import time
from datetime import datetime
from config.api_keys import api_keys


class OddsAPIMonitor:

    def __init__(self):
        self.api_key = api_keys.get_odds_api_key()
        self.base_url = "https://api.the-odds-api.com/v4"
        self.session = requests.Session()
        self.line_history = {}

        if not self.api_key:
            print("Warning: Odds API key not configured. Odds tracking disabled.")
            self.enabled = False
        else:
            self.enabled = True

    def get_live_nfl_odds(self):
        if not self.enabled:
            return []

        url = f"{self.base_url}/sports/americanfootball_nfl/odds"
        params = {
            'apiKey': self.api_key,
            'regions': 'us',
            'markets': 'h2h,spreads,totals',
            'oddsFormat': 'american'
        }

        try:
            response = self.session.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Odds API error: {e}")
            return []

    def get_odds_for_game(self, home_team, away_team):
        all_odds = self.get_live_nfl_odds()

        for game in all_odds:
            if (home_team in game['home_team'] and away_team in game['away_team']) or \
                    (away_team in game['home_team'] and home_team in game['away_team']):
                return self._parse_game_odds(game)

        return None

    def _parse_game_odds(self, game_data):
        parsed = {
            'game_id': game_data['id'],
            'home_team': game_data['home_team'],
            'away_team': game_data['away_team'],
            'commence_time': game_data['commence_time'],
            'bookmakers': []
        }

        for bookmaker in game_data.get('bookmakers', []):
            book_odds = {
                'name': bookmaker['title'],
                'markets': {}
            }

            for market in bookmaker.get('markets', []):
                market_type = market['key']

                if market_type == 'h2h':
                    for outcome in market['outcomes']:
                        book_odds['markets'][f"{outcome['name']}_ml"] = outcome['price']

                elif market_type == 'spreads':
                    for outcome in market['outcomes']:
                        book_odds['markets'][f"{outcome['name']}_spread"] = outcome['point']
                        book_odds['markets'][f"{outcome['name']}_spread_odds"] = outcome['price']

                elif market_type == 'totals':
                    for outcome in market['outcomes']:
                        book_odds['markets'][f"total_{outcome['name']}"] = outcome['point']
                        book_odds['markets'][f"total_{outcome['name']}_odds"] = outcome['price']

            parsed['bookmakers'].append(book_odds)

        return parsed

    def track_line_movement(self, game_id, home_team, away_team):
        current_odds = self.get_odds_for_game(home_team, away_team)

        if not current_odds:
            return None

        if game_id not in self.line_history:
            self.line_history[game_id] = []

        self.line_history[game_id].append({
            'timestamp': datetime.now(),
            'odds': current_odds
        })

        if len(self.line_history[game_id]) < 2:
            return {
                'movement_detected': False,
                'current_odds': current_odds
            }

        previous = self.line_history[game_id][-2]

        movement = self._calculate_odds_movement(
            previous['odds'],
            current_odds
        )

        return {
            'movement_detected': movement['significant'],
            'spread_movement': movement['spread_change'],
            'ml_movement': movement['ml_change'],
            'total_movement': movement['total_change'],
            'sharp_indicator': movement['sharp_money'],
            'current_odds': current_odds
        }

    def _calculate_odds_movement(self, old_odds, new_odds):
        movement = {
            'spread_change': 0.0,
            'ml_change': 0,
            'total_change': 0.0,
            'significant': False,
            'sharp_money': False
        }

        if old_odds['bookmakers'] and new_odds['bookmakers']:
            old_book = old_odds['bookmakers'][0]['markets']
            new_book = new_odds['bookmakers'][0]['markets']

            old_spread = old_book.get(f"{old_odds['home_team']}_spread", 0)
            new_spread = new_book.get(f"{new_odds['home_team']}_spread", 0)
            movement['spread_change'] = abs(new_spread - old_spread)

            old_ml = old_book.get(f"{old_odds['home_team']}_ml", 0)
            new_ml = new_book.get(f"{new_odds['home_team']}_ml", 0)
            movement['ml_change'] = abs(new_ml - old_ml)

            old_total = old_book.get('total_over', 0)
            new_total = new_book.get('total_over', 0)
            movement['total_change'] = abs(new_total - old_total)

            movement['significant'] = (
                    movement['spread_change'] >= 1.5 or
                    movement['ml_change'] >= 50 or
                    movement['total_change'] >= 1.0
            )

            movement['sharp_money'] = movement['significant'] and movement['spread_change'] >= 2.0

        return movement