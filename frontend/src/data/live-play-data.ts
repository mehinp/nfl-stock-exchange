import type { LivePlay } from "@/hooks/useLivePlayStream";
import rawPlays from "@/data/live-play-seq.json";

type RawPlay = {
  index: number;
  play_id: string;
  drive_id: string;
  qtr: number;
  clock?: string;
  clock_seconds?: number | null;
  desc: string;
  play_type: string;
  yards_gained?: number | null;
  scoring_play: boolean;
  home_score: number;
  away_score: number;
  down?: number | null;
  distance?: number | null;
  yards_to_endzone?: number | null;
  yardline_raw?: number | null;
  end_yardline?: number | null;
  possession_team?: string | null;
  defense_team?: string | null;
  ball_location_team?: string | null;
  ball_location_yard?: number | null;
  win_prob_teamA?: number | null;
};

const HOME_TEAM = "LA";
const AWAY_TEAM = "SF";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const computeHomeWinProbability = (homeScore: number, awayScore: number, winProbTeamA?: number | null) => {
  if (typeof winProbTeamA === "number") {
    // win_prob_teamA already reflects the home (Team A) win probability
    return clamp(winProbTeamA, 0, 1);
  }
  const diff = homeScore - awayScore;
  const normalized = Math.tanh(diff / 14);
  return clamp(0.5 + normalized / 2, 0, 1);
};

const toLivePlay = (play: RawPlay): LivePlay => {
  const yardline100 =
    typeof play.yards_to_endzone === "number" ? play.yards_to_endzone : play.end_yardline ?? null;
  const posteam = play.possession_team ?? null;
  const defteam = play.defense_team ?? null;
  const posteamScore =
    posteam === HOME_TEAM ? play.home_score : posteam === AWAY_TEAM ? play.away_score : null;
  const defteamScore =
    posteam === HOME_TEAM ? play.away_score : posteam === AWAY_TEAM ? play.home_score : null;
  const ballSpotLabel =
    play.ball_location_team && typeof play.ball_location_yard === "number"
      ? `${play.ball_location_team}${play.ball_location_yard}`
      : null;

  return {
    index: play.index,
    play_id: play.play_id,
    drive_id: play.drive_id,
    qtr: play.qtr,
    signal: 0,
    clock: play.clock,
    desc: play.desc,
    play_type: play.play_type,
    yards_gained: play.yards_gained ?? null,
    scoring_play: play.scoring_play,
    home_score: play.home_score,
    away_score: play.away_score,
    down: play.down ?? null,
    ydstogo: play.distance ?? null,
    yards_to_endzone: play.yards_to_endzone ?? null,
    yardline_100: yardline100,
    posteam,
    defteam,
    posteam_score: posteamScore,
    defteam_score: defteamScore,
    game_seconds_remaining: play.clock_seconds ?? null,
    wp: computeHomeWinProbability(play.home_score, play.away_score, play.win_prob_teamA),
    ball_location_team: play.ball_location_team ?? null,
    ball_location_yard: play.ball_location_yard ?? null,
    ballSpotLabel,
  };
};

export const STATIC_LIVE_PLAYS: LivePlay[] = (rawPlays as RawPlay[]).map(toLivePlay);
