# scripts/espn_live_demo.py
import argparse, time, sys, re
from pathlib import Path
import runpy, requests, pandas as pd, numpy as np

def load_helpers():
    sim_path = Path(__file__).resolve().parent / "simulate_feed.py"
    ns = runpy.run_path(str(sim_path), run_name="simulate_feed")
    return ns["sustained_signals"]

sustained_signals = load_helpers()

def get_json(url, timeout=15):
    r = requests.get(url, timeout=timeout, headers={"User-Agent":"espn-live-demo/1.0"})
    r.raise_for_status()
    return r.json()

def find_event_id(iso_date, t1, t2):
    yyyymmdd = iso_date.replace("-", "")
    sb = get_json(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={yyyymmdd}")
    events = sb.get("events", [])
    tset = {t1.upper(), t2.upper()}
    for ev in events:
        cid = ev["competitions"][0]
        comps = cid["competitors"]
        abbrs = {c["team"]["abbreviation"].upper() for c in comps}
        if abbrs == tset:
            return ev["id"]
    raise SystemExit(f"No ESPN event found on {iso_date} for {t1} vs {t2}")

def collect_collection(url):
    out = []
    while url:
        j = get_json(url)
        items = j.get("items") or []
        out.extend(items)
        url = j.get("next", {}).get("href")
    return out

def extract_plays(event_id):
    base = f"https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{event_id}/competitions/{event_id}"
    plays = collect_collection(base + "/plays")
    rows = []
    for it in plays:
        pid = it.get("id")
        seq = it.get("sequence", 0)
        qtr = it.get("period", {}).get("number")
        clock = it.get("clock", "0:00")
        text = it.get("text") or it.get("shortText") or ""
        rows.append({"play_id": str(pid), "sequence": float(seq), "qtr": int(qtr or 0), "clock": clock, "desc": text})
    return pd.DataFrame(rows).sort_values("sequence").reset_index(drop=True)

def extract_probs(event_id):
    base = f"https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{event_id}/competitions/{event_id}"
    items = collect_collection(base + "/probabilities")
    rows = []
    for it in items:
        pid = it.get("play", {}).get("$ref") or ""
        pid_match = re.search(r"/plays/(\d+)", pid)
        play_id = pid_match.group(1) if pid_match else None
        home_pct = it.get("homeWinPercentage")
        away_pct = it.get("awayWinPercentage")
        period = it.get("period", {}).get("number")
        if home_pct is None and "lastModified" in it and isinstance(it["lastModified"], dict):
            detail = it.get("detail", {})
            home_pct = detail.get("homeWinPercentage")
            away_pct = detail.get("awayWinPercentage")
        if home_pct is None or away_pct is None or play_id is None:
            continue
        wp = float(max(home_pct, away_pct))  # ESPN gives win% for each side; choose leading side as wp
        rows.append({"play_id": str(play_id), "qtr": int(period or 0), "wp": wp})
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    # keep the latest prob per play_id (if duplicates appear)
    return (df.sort_values(["play_id","qtr"])
              .drop_duplicates(subset=["play_id"], keep="last")
              .reset_index(drop=True))

def build_frame(event_id):
    p = extract_plays(event_id)
    pr = extract_probs(event_id)
    if p.empty or pr.empty:
        return pd.DataFrame()
    df = p.merge(pr, on=["play_id","qtr"], how="left")
    df = df.dropna(subset=["wp"])
    base = df[["play_id","qtr","wp"]].copy()
    base["game_id"] = str(event_id)
    base["play_id"] = base["play_id"].astype(str)
    sig = sustained_signals(base[["game_id","play_id","wp","qtr"]])
    out = base.merge(sig[["game_id","play_id","signal"]], on=["game_id","play_id"], how="left")
    out = out.merge(df[["play_id","sequence","clock","desc"]], on="play_id", how="left")
    out = out.sort_values("sequence").reset_index(drop=True)
    return out

def fmt(row):
    return f"{row['play_id']:>6}  Q{int(row['qtr'])}  {str(row['clock']).rjust(5)}  wp={row['wp']:.3f}  sig={int(row['signal']) if not pd.isna(row['signal']) else 0}  {row['desc']}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)             # YYYY-MM-DD
    ap.add_argument("--team1", required=True)
    ap.add_argument("--team2", required=True)
    ap.add_argument("--interval", type=float, default=3)
    ap.add_argument("--max_idle", type=int, default=900)
    args = ap.parse_args()

    event_id = find_event_id(args.date, args.team1, args.team2)
    print(f"ESPN event_id: {event_id}  ({args.team1.upper()} vs {args.team2.upper()} on {args.date})")
    seen = set()
    idle = 0
    last_printed = None

    while True:
        try:
            df = build_frame(event_id)
            if not df.empty:
                new_rows = [r for _, r in df.iterrows() if r["play_id"] not in seen]
                if new_rows:
                    last = new_rows[-1]
                    # mark all seen up to latest known play
                    for pid in df["play_id"].tolist():
                        seen.add(pid)
                    line = fmt(last)
                    if line != last_printed:
                        print(line, flush=True)
                        last_printed = line
                    idle = 0
                else:
                    idle += args.interval
            else:
                idle += args.interval
        except requests.HTTPError as e:
            print(f"[HTTP {e.response.status_code}] retrying…", file=sys.stderr)
            idle += args.interval
        except Exception as e:
            print(f"[warn] {e}", file=sys.stderr)
            idle += args.interval

        if idle >= args.max_idle:
            print("No new plays; exiting.")
            break
        time.sleep(args.interval)

if __name__ == "__main__":
    main()
