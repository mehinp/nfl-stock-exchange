import json
from pathlib import Path


def setup_api_keys():
    print("=" * 60)
    print("NFL SWING DETECTOR - API KEY SETUP")
    print("=" * 60)
    print("\nThis will configure API keys.")
    print("Press Enter to skip any optional API.\n")

    keys = {}

    print("\nREDDIT API (FREE - Optional)")
    print("Get keys at: https://www.reddit.com/prefs/apps")
    reddit_client_id = input("Reddit Client ID: ").strip()
    reddit_client_secret = input("Reddit Client Secret: ").strip()
    reddit_user_agent = input("User Agent (default: nfl_swing_bot/1.0): ").strip() or "nfl_swing_bot/1.0"

    keys['reddit'] = {
        'client_id': reddit_client_id,
        'client_secret': reddit_client_secret,
        'user_agent': reddit_user_agent
    }

    print("\nTWITTER/X API (Optional - Paid)")
    use_twitter = input("Do you have Twitter API access? (y/n): ").lower() == 'y'

    if use_twitter:
        twitter_bearer = input("Twitter Bearer Token: ").strip()
        keys['twitter'] = {
            'bearer_token': twitter_bearer,
            'api_key': '',
            'api_secret': ''
        }
    else:
        keys['twitter'] = {
            'bearer_token': '',
            'api_key': '',
            'api_secret': ''
        }

    print("\nTHE ODDS API (Free tier: 500 requests/month)")
    print("Get key at: https://the-odds-api.com/")
    odds_key = input("Odds API Key (or press Enter to skip): ").strip()

    keys['odds_api'] = {
        'api_key': odds_key
    }

    keys['espn'] = {
        'enabled': True
    }

    config_dir = Path('config')
    config_dir.mkdir(exist_ok=True)

    config_file = config_dir / 'keys.json'
    with open(config_file, 'w') as f:
        json.dump(keys, f, indent=2)

    print("\nAPI keys saved to config/keys.json")
    print("\nEnabled APIs:")
    if keys['reddit']['client_id']:
        print("  - Reddit")
    if keys['twitter']['bearer_token']:
        print("  - Twitter")
    if keys['odds_api']['api_key']:
        print("  - Odds API")
    print("  - ESPN (always enabled)")

    print("\nSetup complete")


if __name__ == "__main__":
    setup_api_keys()