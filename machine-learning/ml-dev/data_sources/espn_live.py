import requests
import pandas as pd
from datetime import datetime
import time


class ESPNLiveDataCollector:

    def __init__(self):
        self.base_url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
        self.session = requests.Session()
        self.cache = {}
        self.cache_ttl = 3

    def get_live_games(self):
        url = f"{self.base_url}/scoreboard"
        response = self.session.get(url)
        data = response.json()

        live_games = []
        for event in data.get('events', []):
            status = event['status']['type']['state']

            comp = event['competitions'][0]
            home = comp['competitors'][0]
            away = comp['competitors'][1]

            game_info = {
                'game_id': event['id'],
                'status': status,
                'home_team': home['team']['abbreviation'],
                'away_team': away['team']['abbreviation'],
                'home_score': int(home['score']),
                'away_score': int(away['score']),
                'quarter': event['status']['period'],
                'clock': event['status']['displayClock'],
                'is_live': status == 'in'
            }

            situation = comp.get('situation', {})
            if situation:
                game_info.update({
                    'possession': situation.get('possession'),
                    'down': situation.get('down'),
                    'distance': situation.get('distance'),
                    'yardline': situation.get('yardLine'),
                    'down_distance_text': situation.get('shortDownDistanceText', '')
                })

            live_games.append(game_info)

        return [g for g in live_games if g['is_live']]

    def get_play_by_play(self, game_id):
        url = f"{self.base_url}/summary?event={game_id}"

        cache_key = f"pbp_{game_id}"
        if cache_key in self.cache:
            cached_time, cached_data = self.cache[cache_key]
            if time.time() - cached_time < self.cache_ttl:
                return cached_data

        response = self.session.get(url)
        data = response.json()

        plays = []
        drives_data = data.get('drives', {})
        all_drives = drives_data.get('previous', []) + [drives_data.get('current', {})]

        for drive in all_drives:
            if not drive or 'plays' not in drive:
                continue

            for play in drive.get('plays', []):
                play_info = {
                    'play_id': play['id'],
                    'game_id': game_id,
                    'drive_id': drive.get('id'),
                    'quarter': play['period']['number'],
                    'clock': play['clock']['displayValue'],
                    'play_text': play['text'],
                    'play_type': play['type']['text'],
                    'yards_gained': play.get('statYardage', 0),
                    'scoring_play': play.get('scoringPlay', False),
                    'home_score': play.get('homeScore', 0),
                    'away_score': play.get('awayScore', 0),
                }

                start = play.get('start', {})
                if start:
                    play_info.update({
                        'down': start.get('down'),
                        'distance': start.get('distance'),
                        'yardline': start.get('yardLine'),
                        'yards_to_endzone': start.get('yardsToEndzone')
                    })

                end = play.get('end', {})
                if end:
                    play_info['end_yardline'] = end.get('yardLine')

                plays.append(play_info)

        df = pd.DataFrame(plays)

        self.cache[cache_key] = (time.time(), df)

        return df

    def get_win_probability(self, game_id):
        url = f"{self.base_url}/summary?event={game_id}"
        response = self.session.get(url)
        data = response.json()

        wp_data = data.get('winprobability', [])
        if not wp_data:
            return None

        latest = wp_data[-1]

        wp_history = []
        for wp in wp_data[-10:]:
            wp_history.append({
                'play_id': wp.get('playId'),
                'home_wp': wp.get('homeWinPercentage', 50),
                'tie_wp': wp.get('tiePercentage', 0),
                'seconds_left': wp.get('secondsLeft', 0)
            })

        return {
            'current_home_wp': latest.get('homeWinPercentage', 50),
            'current_away_wp': 100 - latest.get('homeWinPercentage', 50),
            'history': wp_history,
            'play_id': latest.get('playId')
        }

    def get_injuries_from_plays(self, game_id):
        pbp = self.get_play_by_play(game_id)

        if pbp.empty:
            return []

        injury_keywords = [
            'injured', 'injury', 'hurt', 'questionable to return',
            'doubtful', 'out for the game', 'evaluated', 'medical tent',
            'cart', 'carted off', 'stretcher', 'limping'
        ]

        injuries = []
        for _, play in pbp.iterrows():
            text = play['play_text'].lower()

            if any(keyword in text for keyword in injury_keywords):
                severity = 'LOW'
                if any(word in text for word in ['cart', 'stretcher', 'out for']):
                    severity = 'CRITICAL'
                elif any(word in text for word in ['questionable', 'doubtful', 'evaluated']):
                    severity = 'MEDIUM'

                injuries.append({
                    'play_id': play['play_id'],
                    'quarter': play['quarter'],
                    'clock': play['clock'],
                    'text': play['play_text'],
                    'severity': severity,
                    'timestamp': datetime.now().isoformat()
                })

        return injuries

    def get_comprehensive_game_state(self, game_id):
        live_games = self.get_live_games()
        game = next((g for g in live_games if g['game_id'] == game_id), None)

        if not game:
            return None

        pbp = self.get_play_by_play(game_id)
        wp = self.get_win_probability(game_id)
        injuries = self.get_injuries_from_plays(game_id)

        return {
            'game_state': game,
            'play_by_play': pbp,
            'win_probability': wp,
            'injuries': injuries,
            'timestamp': datetime.now().isoformat()
        }