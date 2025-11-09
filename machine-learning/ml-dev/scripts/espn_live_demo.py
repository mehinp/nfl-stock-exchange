import argparse
import time
import requests
import sys

def get_event_id(date, team1, team2):
    url = f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={date.replace('-','')}"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    data = r.json()
    for ev in data.get("events", []):
        cid = ev["competitions"][0]
        comps = cid["competitors"]
        teams = {c["team"]["abbreviation"].upper(): c for c in comps}
        if team1.upper() in teams and team2.upper() in teams:
            return ev["id"]
    return None

def fetch_latest_play(event_id):
    url = f"https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{event_id}/competitions/{event_id}/plays"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    data = r.json()
    items = data.get("items", [])
    if not items:
        return None
    last = items[-1]
    r2 = requests.get(last["$ref"], timeout=10)
    r2.raise_for_status()
    pl = r2.json()
    play_id = str(pl.get("id"))
    qtr = int(pl.get("period", 0))
    clock = pl.get("clock", {}).get("displayValue", "")
    text = pl.get("text", "")
    return {"play_id": play_id, "qtr": qtr, "clock": clock, "desc": text}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--team1", required=True)
    ap.add_argument("--team2", required=True)
    ap.add_argument("--push", default=None)
    ap.add_argument("--interval", type=float, default=1.0)
    args = ap.parse_args()

    event_id = get_event_id(args.date, args.team1, args.team2)
    if not event_id:
        print("no_event", file=sys.stderr)
        sys.exit(1)

    seen = set()
    while True:
        try:
            pl = fetch_latest_play(event_id)
            if pl and pl["play_id"] not in seen:
                seen.add(pl["play_id"])
                print(f"{pl['qtr']} {pl['clock']} {pl['desc']}", flush=True)
                if args.push:
                    payload = {"play_id": pl["play_id"], "qtr": pl["qtr"], "wp": 0.0, "signal": 0, "desc": pl["desc"], "clock": pl["clock"]}
                    try:
                        requests.post(f"{args.push}/games/{event_id}/plays", json=payload, timeout=5)
                    except Exception as e:
                        print(f"push_err {e}", file=sys.stderr)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"poll_err {e}", file=sys.stderr)
        time.sleep(args.interval)

if __name__ == "__main__":
    main()