import os
import time
from pathlib import Path
import sys
import logging
from typing import Dict, Any, List, Optional
import threading

import joblib
import numpy as np
import pandas as pd
import requests

sys.path.append(".")
from data_sources.espn_live import ESPNLiveDataCollector
from config.settings import SWING_THRESHOLD, MODEL_WEIGHTS, MONITORING_INTERVAL
from features.comprehensive_features import ComprehensiveFeatureEngine

try:
    from scripts.pbp_api import sustained_signals
except Exception:
    sustained_signals = None

log = logging.getLogger("live_monitor")
if not log.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

DEFAULT_FRONTEND_ENDPOINTS = [
    "http://localhost:8000/ingest",
    "http://localhost:8000/update",
    "http://localhost:8000/events",
    "http://localhost:8000/next_push",
]


def _first_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _quarter_value(row: pd.Series) -> int:
    for k in ["qtr", "quarter", "period", "period_number"]:
        v = row.get(k)
        if v is None:
            continue
        try:
            if isinstance(v, str):
                d = "".join(ch for ch in v if ch.isdigit())
                if d:
                    return int(d)
            return int(v)
        except Exception:
            continue
    return 0


def _ensure_sorted(df: pd.DataFrame) -> pd.DataFrame:
    qcol = _first_col(df, ["qtr", "quarter", "period", "period_number"])
    tcol = _first_col(df, ["game_seconds_remaining", "secs_remaining", "clock_seconds", "seconds_remaining"])
    pid = _first_col(df, ["play_id", "id", "uid"])
    cols = [c for c in [qcol, tcol, pid] if c is not None]
    if cols:
        return df.sort_values(cols, kind="mergesort")
    return df


def _safe_int(x) -> Optional[int]:
    try:
        if x is None or (isinstance(x, float) and np.isnan(x)):
            return None
        if isinstance(x, str) and x.strip() == "":
            return None
        return int(float(x))
    except Exception:
        return None


class LiveSwingMonitor:
    def __init__(self):
        self.collector = ESPNLiveDataCollector()
        self.fe_engine = ComprehensiveFeatureEngine()
        self.models: Dict[str, Any] = {}
        self.scaler = None
        self.feature_names: Optional[List[str]] = None

        # Configure API base from environment or use default
        api_base = os.getenv("API_BASE", "http://localhost:8000")
        self.frontend_endpoints = [api_base]

        self.replay_event_id = os.getenv("REPLAY_EVENT_ID")
        self.replay_pace = float(os.getenv("REPLAY_PACE_SECONDS", "2.5"))
        self.poll_seconds = float(os.getenv("POLL_SECONDS", "1.0"))
        self.cooldown_seconds = float(os.getenv("COOLDOWN_SECONDS", "5.0"))
        self.poll_burst_seconds = float(os.getenv("POLL_BURST_SECONDS", "20"))
        self._threads: Dict[str, threading.Thread] = {}
        self._stops: Dict[str, threading.Event] = {}

    def load_models(self) -> None:
        models_dir = Path(MODEL_WEIGHTS)
        if not models_dir.exists():
            raise FileNotFoundError(f"Models directory not found at {models_dir}.")
        for p in models_dir.glob("*.pkl"):
            name = p.stem.lower()
            obj = joblib.load(p)
            if "scaler" in name:
                self.scaler = obj
            elif name in ("feature_names", "features", "feature_list"):
                try:
                    self.feature_names = list(obj)
                except Exception:
                    pass
            elif hasattr(obj, "predict_proba"):
                self.models[name] = obj
        try:
            if self.feature_names is None and hasattr(self.fe_engine, "required_features"):
                self.feature_names = list(self.fe_engine.required_features())
        except Exception:
            pass

    def _fe_transform(self, latest: pd.DataFrame, context: pd.DataFrame) -> pd.DataFrame:
        tries = [
            ("transform", {"X": latest, "context": context}),
            ("transform", {"df": latest, "context": context}),
            ("build_features", {"df": latest, "context": context}),
            ("build_features", {"X": latest, "context": context}),
            ("make_features", {"df": latest, "context": context}),
            ("make_features", {"X": latest, "context": context}),
            ("featurize", {"df": latest, "context": context}),
            ("featurize", {"X": latest, "context": context}),
        ]
        for name, kwargs in tries:
            fn = getattr(self.fe_engine, name, None)
            if callable(fn):
                try:
                    out = fn(**kwargs)
                    if isinstance(out, pd.DataFrame):
                        return out
                    if isinstance(out, dict):
                        return pd.DataFrame([out])
                    if isinstance(out, tuple) and len(out) and isinstance(out[0], pd.DataFrame):
                        return out[0]
                except Exception:
                    continue
        try:
            if callable(self.fe_engine):
                out = self.fe_engine(latest, context=context)
                if isinstance(out, pd.DataFrame):
                    return out
                if isinstance(out, dict):
                    return pd.DataFrame([out])
        except Exception:
            pass
        return latest.select_dtypes(include=[np.number]).copy()

    def _compute_features_for_latest(self, pbp_df: pd.DataFrame) -> Optional[pd.DataFrame]:
        if pbp_df is None or pbp_df.empty:
            return None
        pbp_df = _ensure_sorted(pbp_df)
        latest = pbp_df.iloc[-1:].copy()
        feats = self._fe_transform(latest, context=pbp_df)
        if feats is None or feats.empty:
            return None
        if self.feature_names is None:
            self.feature_names = [c for c in feats.columns if np.issubdtype(feats[c].dtype, np.number)]
        cols = list(self.feature_names) if self.feature_names is not None else [c for c in feats.columns if
                                                                                np.issubdtype(feats[c].dtype,
                                                                                              np.number)]
        aligned = pd.DataFrame({c: feats[c] if c in feats.columns else 0.0 for c in cols}, index=feats.index)
        X = aligned.astype("float32")
        if self.scaler is not None:
            try:
                X.loc[:, :] = self.scaler.transform(X.values)
            except Exception:
                pass
        return X

    def _predict_swing_prob(self, X: Optional[pd.DataFrame]) -> float:
        if X is None or X.empty or not self.models:
            return 0.0
        probs = []
        for _, model in self.models.items():
            try:
                p = float(model.predict_proba(X.values)[:, 1][0])
                probs.append(p)
            except Exception:
                continue
        if not probs:
            return 0.0
        return float(np.mean(probs))

    def _update_signal(self, game_id: str, qtr: int, win_prob: float) -> Optional[int]:
        if sustained_signals is None:
            return None
        if not hasattr(self, "_sigstate"):
            self._sigstate = {}
        if game_id not in self._sigstate:
            self._sigstate[game_id] = {"qtrs": [], "wps": []}
        st = self._sigstate[game_id]
        st["qtrs"].append(int(qtr))
        st["wps"].append(float(win_prob))
        try:
            label = sustained_signals(st["qtrs"], st["wps"])
            return int(label)
        except Exception:
            return None

    def _clock_value(self, row: pd.Series) -> str:
        for k in ["clock", "clock_display", "displayClock", "clock_str", "time"]:
            v = row.get(k)
            if v is not None:
                return str(v)
        return ""

    def _play_id_value(self, row: pd.Series) -> str:
        for k in ["play_id", "id", "uid"]:
            v = row.get(k)
            if v is not None and str(v) != "":
                return str(v)
        return ""

    def _build_payload(self, game: Dict[str, Any], play_row: pd.Series, swing_prob: float, signal: Optional[int],
                       win_prob: Optional[float]) -> Dict[str, Any]:
        game_id = str(game.get("id") or game.get("game_id"))
        play_id = self._play_id_value(play_row)

        return {
            "play_id": str(play_id) if play_id else "",
            "qtr": int(_quarter_value(play_row)),
            "wp": float(win_prob) if win_prob is not None else 0.5,
            "signal": int(signal) if signal is not None else 0,
            "desc": str(play_row.get("play_desc") or play_row.get("text") or play_row.get("desc") or ""),
            "prob": float(max(0.0, min(1.0, swing_prob))),
            "posteam": play_row.get("posteam") or play_row.get("offense"),
            "defteam": play_row.get("defteam") or play_row.get("defense"),
            "down": _safe_int(play_row.get("down")) or 0,
            "ydstogo": _safe_int(play_row.get("ydstogo")) or 0,
            "yardline_100": _safe_int(play_row.get("yardline_100")) or 0,
            "game_seconds_remaining": _safe_int(play_row.get("game_seconds_remaining")) or 0,
        }

    def _push_to_api(self, game_id: str, payload: Dict[str, Any]) -> None:
        # Use the same endpoint pattern as step_replay: /games/{game_id}/plays
        for base_url in self.frontend_endpoints:
            # Extract base URL (remove any endpoint path if present)
            if "/ingest" in base_url:
                api_base = base_url.replace("/ingest", "")
            elif "/update" in base_url:
                api_base = base_url.replace("/update", "")
            elif "/events" in base_url:
                api_base = base_url.replace("/events", "")
            elif "/next_push" in base_url:
                api_base = base_url.replace("/next_push", "")
            else:
                api_base = base_url

            post_url = f"{api_base}/games/{game_id}/plays"
            try:
                r = requests.post(post_url, json=payload, timeout=10)
                if r.status_code == 202:
                    return
            except Exception:
                continue

    def _process_new_play(self, game: Dict[str, Any], pbp_df: pd.DataFrame, latest_row: pd.Series) -> None:
        X = self._compute_features_for_latest(pbp_df)
        swing_prob = self._predict_swing_prob(X)
        win_prob = None
        try:
            wp_info = getattr(self.collector, "get_current_win_prob", None)
            if callable(wp_info):
                wp_val = wp_info(str(game.get("id") or game.get("game_id")))
                if isinstance(wp_val, dict):
                    home_wp = float(wp_val.get("current_home_wp", 0.5))
                    away_wp = float(wp_val.get("current_away_wp", 0.5))
                    win_prob = max(home_wp, away_wp)
                elif isinstance(wp_val, (float, int)):
                    win_prob = float(wp_val)
        except Exception:
            pass
        qtr = _quarter_value(latest_row)
        signal = self._update_signal(str(game.get("id") or game.get("game_id")), qtr,
                                     win_prob if win_prob is not None else 0.5)
        payload = self._build_payload(game, latest_row, swing_prob, signal, win_prob)

        # Print to terminal in the same format as step_replay.py
        game_id = str(game.get("id") or game.get("game_id"))
        clock = self._clock_value(latest_row)
        desc = latest_row.get("play_desc") or latest_row.get("text") or latest_row.get("desc") or ""
        print(f"Q{qtr} {clock} {desc}", flush=True)

        # Push to API endpoints using the same payload format as step_replay
        self._push_to_api(game_id, payload)

    def _game_worker(self, game: Dict[str, Any], stop_evt: threading.Event) -> None:
        game_id = str(game.get("id") or game.get("game_id"))
        last_play_id: Optional[str] = None
        last_len: Optional[int] = None
        cooldown_until = 0.0
        while not stop_evt.is_set():
            now = time.time()
            if now < cooldown_until:
                time.sleep(min(self.cooldown_seconds, cooldown_until - now))
                continue
            try:
                pbp_df = self.collector.get_play_by_play(game_id)
            except Exception:
                time.sleep(self.poll_seconds)
                continue
            if pbp_df is None or pbp_df.empty:
                time.sleep(self.poll_seconds)
                continue
            pbp_df = _ensure_sorted(pbp_df)
            latest = pbp_df.iloc[-1]
            pid = self._play_id_value(latest)
            l = len(pbp_df)
            if pid and pid != last_play_id:
                self._process_new_play(game, pbp_df, latest)
                last_play_id = pid
                last_len = l
                cooldown_until = time.time() + self.cooldown_seconds
                continue
            if last_len is None or l != last_len:
                last_len = l
            time.sleep(self.poll_seconds)

    def _replay_tick(self, event_id: str) -> None:
        try:
            pbp_df = self.collector.get_play_by_play(event_id)
        except Exception:
            time.sleep(self.replay_pace)
            return
        if pbp_df is None or pbp_df.empty:
            time.sleep(self.replay_pace)
            return
        pbp_df = _ensure_sorted(pbp_df)
        idx = getattr(self, "_replay_idx", -1) + 1
        if idx >= len(pbp_df):
            time.sleep(self.replay_pace)
            return
        context_df = pbp_df.iloc[: idx + 1].copy()
        latest = pbp_df.iloc[idx]
        game_stub = {"id": event_id, "home_abbr": None, "away_abbr": None, "home_team": None, "away_team": None,
                     "game_id": event_id}

        # Process and print in same format
        self._process_new_play(game_stub, context_df, latest)

        self._replay_idx = idx
        time.sleep(self.replay_pace)

    def run(self) -> None:
        self.load_models()

        # Print startup information similar to step_replay
        print(f"[api] {self.frontend_endpoints[0]}", file=sys.stderr)
        print("[monitor] Live game monitoring started", file=sys.stderr)
        print("[enter] Monitoring all live NFL games on ESPN API", file=sys.stderr)

        while True:
            try:
                live_games = self.collector.get_live_games()
            except Exception:
                time.sleep(max(5, MONITORING_INTERVAL))
                continue
            ids_now = set(str(g.get("id") or g.get("game_id")) for g in (live_games or []))
            for gid, evt in list(self._stops.items()):
                if gid not in ids_now:
                    evt.set()
                    t = self._threads.pop(gid, None)
                    if t and t.is_alive():
                        t.join(timeout=0.1)
                    self._stops.pop(gid, None)
            if not live_games:
                if self.replay_event_id:
                    self._replay_tick(self.replay_event_id)
                    continue
                time.sleep(MONITORING_INTERVAL)
                continue
            for g in live_games:
                gid = str(g.get("id") or g.get("game_id"))
                if gid in self._threads and self._threads[gid].is_alive():
                    continue
                stop_evt = threading.Event()
                self._stops[gid] = stop_evt
                t = threading.Thread(target=self._game_worker, args=(g, stop_evt), daemon=True)
                self._threads[gid] = t
                t.start()
            time.sleep(self.poll_burst_seconds)


if __name__ == "__main__":
    LiveSwingMonitor().run()