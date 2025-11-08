import os
from pathlib import Path
import json


class APIKeyManager:

    def __init__(self):
        self.config_path = Path('config/keys.json')
        self.keys = self._load_keys()

    def _load_keys(self):
        keys = {}

        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                keys = json.load(f)

        keys.setdefault('reddit', {
            'client_id': os.getenv('REDDIT_CLIENT_ID', ''),
            'client_secret': os.getenv('REDDIT_CLIENT_SECRET', ''),
            'user_agent': os.getenv('REDDIT_USER_AGENT', 'nfl_swing_detector/1.0')
        })

        keys.setdefault('twitter', {
            'bearer_token': os.getenv('TWITTER_BEARER_TOKEN', ''),
            'api_key': os.getenv('TWITTER_API_KEY', ''),
            'api_secret': os.getenv('TWITTER_API_SECRET', ''),
        })

        keys.setdefault('odds_api', {
            'api_key': os.getenv('ODDS_API_KEY', '')
        })

        keys.setdefault('espn', {
            'enabled': True
        })

        return keys

    def save_keys(self, keys_dict):
        self.config_path.parent.mkdir(exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(keys_dict, f, indent=2)
        self.keys = keys_dict

    def get_reddit_credentials(self):
        return self.keys['reddit']

    def get_twitter_credentials(self):
        return self.keys['twitter']

    def get_odds_api_key(self):
        return self.keys['odds_api']['api_key']

    def has_reddit(self):
        creds = self.keys['reddit']
        return bool(creds['client_id'] and creds['client_secret'])

    def has_twitter(self):
        return bool(self.keys['twitter']['bearer_token'])

    def has_odds_api(self):
        return bool(self.keys['odds_api']['api_key'])


api_keys = APIKeyManager()