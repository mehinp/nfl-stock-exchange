import argparse
import requests
import sys
import os

def prompt(s):
    try:
        return input(s).strip()
    except EOFError:
        return ""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=os.getenv("API_BASE","http://localhost:8000"))
    ap.add_argument("--date")
    ap.add_argument("--team1")
    ap.add_argument("--team2")
    ap.add_argument("--model_dir", default="models/pretrained")
    args = ap.parse_args()

    if not args.date:
        args.date = prompt("date (YYYY-MM-DD): ")
    if not args.team1:
        args.team1 = prompt("team1 (e.g., BUF): ")
    if not args.team2:
        args.team2 = prompt("team2 (e.g., BAL): ")

    session = requests.Session()
    print(f"[api] {args.api}", file=sys.stderr)
    print("[enter] press Enter to send next play; Ctrl+C to quit", file=sys.stderr)

    while True:
        try:
            _ = input()
        except EOFError:
            break
        except KeyboardInterrupt:
            break

        try:
            r = session.get(
                f"{args.api}/next",
                params={
                    "date": args.date,
                    "team1": args.team1,
                    "team2": args.team2,
                    "model_dir": args.model_dir,
                    "verbose": 1
                },
                timeout=20
            )
            if r.status_code != 200:
                print(f"[err] GET /next -> {r.status_code} {r.text[:200]}", file=sys.stderr)
                continue
            obj = r.json()
            if obj.get("done"):
                print("done", flush=True)
                break

            gid = obj["game_id"]
            print(f"Q{obj['qtr']} {obj['game_seconds_remaining']}s {obj['desc']}", flush=True)

            payload = {
                "play_id": str(obj["play_id"]),
                "qtr": int(obj["qtr"]),
                "wp": float(obj["wp"]),
                "signal": int(obj["signal"]),
                "desc": str(obj["desc"]),
                "prob": float(obj.get("prob", 0.0)),
                "posteam": obj.get("posteam"),
                "defteam": obj.get("defteam"),
                "down": int(obj.get("down", 0)),
                "ydstogo": int(obj.get("ydstogo", 0)),
                "yardline_100": int(obj.get("yardline_100", 0)),
                "game_seconds_remaining": int(obj.get("game_seconds_remaining", 0))
            }

            post_url = f"{args.api}/games/{gid}/plays"
            pr = session.post(post_url, json=payload, timeout=10)
            if pr.status_code != 202:
                print(f"[warn] POST {post_url} -> {pr.status_code} {pr.text[:200]}", file=sys.stderr)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[step_err] {e}", file=sys.stderr)

if __name__ == "__main__":
    main()