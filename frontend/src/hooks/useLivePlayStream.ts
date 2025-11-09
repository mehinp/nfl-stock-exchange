import { useEffect, useMemo, useState } from "react";
import { STATIC_LIVE_PLAYS } from "@/data/live-play-data";

export type StreamStatus = "connecting" | "open" | "error";

export interface LivePlay {
  index: number;
  play_id: string;
  drive_id?: string;
  qtr: number;
  wp: number;
  signal: number;
  desc: string;
  posteam?: string | null;
  defteam?: string | null;
  down?: number | null;
  ydstogo?: number | null;
  yardline_100?: number | null;
  game_seconds_remaining?: number | null;
  posteam_score?: number | null;
  defteam_score?: number | null;
  home_score?: number;
  away_score?: number;
  play_type?: string;
  yards_gained?: number | null;
  scoring_play?: boolean;
  yards_to_endzone?: number | null;
  ball_location_team?: string | null;
  ball_location_yard?: number | null;
  ballSpotLabel?: string | null;
  clock?: string;
  flashEvent?: boolean;
}

interface UseLivePlayStreamOptions {
  streamUrl?: string;
  maxPlays?: number;
  replayIntervalMs?: number;
}

const QUARTER_DURATION_SECONDS = 900;

const getQuarterClock = (seconds?: number | null) => {
  if (typeof seconds !== "number") return null;
  return seconds % QUARTER_DURATION_SECONDS;
};

const enhancedPlays = (() => {
  const plays = [...STATIC_LIVE_PLAYS];
  const fourthQuarterIndices: number[] = [];
  plays.forEach((play, idx) => {
    if (play.qtr >= 4) {
      fourthQuarterIndices.push(idx);
    }
  });
  if (fourthQuarterIndices.length >= 3) {
    const triggerIndex = fourthQuarterIndices[2];
    plays[triggerIndex] = { ...plays[triggerIndex], flashEvent: true };
  }
  return plays;
})();

const STARTING_PLAY_INDEX = (() => {
  const exactIndex = enhancedPlays.findIndex((play) => {
    if (play.qtr !== 3) return false;
    const clock = getQuarterClock(play.game_seconds_remaining);
    return clock !== null && clock <= 300;
  });
  if (exactIndex !== -1) return exactIndex;
  const fallback = enhancedPlays.findIndex((play) => play.qtr >= 3);
  return fallback === -1 ? 0 : fallback;
})();

export function useLivePlayStream({
  streamUrl: _streamUrl,
  maxPlays = 200,
  replayIntervalMs = 1200,
}: UseLivePlayStreamOptions) {
  const [plays, setPlays] = useState<LivePlay[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [error] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pointer = STARTING_PLAY_INDEX;
    setPlays([]);
    setStatus("connecting");

    const emitNext = () => {
      if (cancelled) return;
      const play = enhancedPlays[pointer];
      if (!play) return;
      setPlays((prev) => [play, ...prev].slice(0, maxPlays));
      pointer += 1;
      if (pointer < enhancedPlays.length) {
        timer = window.setTimeout(emitNext, replayIntervalMs);
      }
    };

    let timer = window.setTimeout(() => {
      if (cancelled) return;
      setStatus("open");
      emitNext();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [maxPlays, replayIntervalMs]);

  const sortedPlays = useMemo(() => [...plays].sort((a, b) => b.index - a.index), [plays]);

  return { plays: sortedPlays, status, error };
}
