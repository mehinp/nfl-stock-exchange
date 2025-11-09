import type { LivePlay } from "@/hooks/useLivePlayStream";
import { cn } from "@/lib/utils";
import TeamLogo from "@/components/shared/TeamLogo";

interface LiveScoreboardProps {
  play?: LivePlay;
  homeTeam?: string | null;
  awayTeam?: string | null;
}

const formatClock = (seconds?: number | null) => {
  if (typeof seconds !== "number") return "--:--";
  const remainder = seconds % 900;
  const mins = Math.floor(remainder / 60);
  const secs = remainder % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatBallSpot = (yardline?: number | null, posteam?: string | null, defteam?: string | null) => {
  if (typeof yardline !== "number") return "--";

  const yardsFromPosteamEndzone = 100 - yardline;
  const offenseSide = posteam ?? "OFF";
  const defenseSide = defteam ?? "DEF";

  if (yardsFromPosteamEndzone > 50) {
    return `${defenseSide}${yardsFromPosteamEndzone - 50}`;
  }
  return `${offenseSide}${50 - yardsFromPosteamEndzone}`;
};

const formatScore = (value?: number | null) => (typeof value === "number" ? value : "--");

const normalizeTeamKey = (value?: string | null) => value?.trim().toUpperCase() ?? "";

export default function LiveScoreboard({ play, homeTeam, awayTeam }: LiveScoreboardProps) {
  const homeWP = play?.wp ?? 0.5;
  const awayWP = 1 - homeWP;
  const homeScore = formatScore(play?.home_score);
  const awayScore = formatScore(play?.away_score);
  const normalizedPossession = normalizeTeamKey(play?.posteam);
  const homeLogoKey = homeTeam ?? play?.posteam ?? "HOME";
  const awayLogoKey = awayTeam ?? play?.defteam ?? "AWAY";
  const scoreboardTeams = [
    {
      role: "HOME",
      displayName: homeTeam ?? homeLogoKey ?? "HOME",
      logoKey: homeLogoKey,
      score: homeScore,
      wp: homeWP,
    },
    {
      role: "AWAY",
      displayName: awayTeam ?? awayLogoKey ?? "AWAY",
      logoKey: awayLogoKey,
      score: awayScore,
      wp: awayWP,
    },
  ];

  return (
    <div className="rounded-3xl bg-[#0B0B0B] border border-white/5 shadow-2xl p-6 text-white space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
          </span>
          <span className="text-sm tracking-[0.3em] text-red-200">LIVE</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/70">
          <span>Q{play?.qtr ?? "-"}</span>
          <span>{formatClock(play?.game_seconds_remaining)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 text-white">
        {scoreboardTeams.map(({ role, displayName, logoKey, score, wp }) => {
          const normalizedLogoKey = normalizeTeamKey(logoKey);
          const hasPossession = normalizedLogoKey.length > 0 && normalizedLogoKey === normalizedPossession;
          return (
            <div
              key={role}
              className={cn(
                "relative rounded-[32px] bg-[#141414] border border-white/5 px-6 py-6 flex flex-col items-center gap-3 text-center transition-shadow duration-300",
                hasPossession && "border-red-500/40 shadow-[0_0_45px_rgba(239,68,68,0.45)]",
              )}
            >
              {hasPossession && (
                <span className="absolute -top-3 right-3 flex items-center gap-1 rounded-full bg-red-500/90 px-3 py-1 text-xs font-semibold shadow-[0_0_18px_rgba(239,68,68,0.65)]">
                  🏈 In Possession
                </span>
              )}
              <span className="px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] rounded-full bg-white/10 text-white/80">
                {role}
              </span>
              <div
                className={cn(
                  "relative rounded-full p-1 bg-gradient-to-br from-white/20 via-white/5 to-transparent",
                  hasPossession && "from-red-400/60 via-red-500/30",
                )}
              >
                <TeamLogo
                  teamName={logoKey}
                  abbreviation={normalizedLogoKey || role}
                  size="lg"
                  className={cn(
                    "rounded-full bg-black/70 border border-white/5 shadow-inner",
                    hasPossession && "border-red-400/40 shadow-[0_0_25px_rgba(239,68,68,0.35)]",
                  )}
                />
              </div>
              <div className="space-y-2">
                <p className="text-4xl font-bold tracking-wide">{displayName}</p>
                <p className="text-3xl font-mono">{score}</p>
                <p className="text-sm text-white/70">WP {(wp * 100).toFixed(1)}%</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-4 text-xs uppercase tracking-wide text-white/60">
        <div>
          <p>Win Prob</p>
          <p className="text-2xl font-mono text-white">{((play?.wp ?? 0) * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p>Down & Dist</p>
          <p className="text-2xl font-mono text-white">
            {play?.down ?? "-"} & {play?.ydstogo ?? "-"}
          </p>
        </div>
        <div>
          <p>Ball On</p>
          <p className="text-2xl font-mono text-white">
            {formatBallSpot(play?.yardline_100, play?.posteam, play?.defteam)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 text-xs uppercase tracking-wide text-white/60">
        <div>
          <p>Offense</p>
          <p className="text-2xl font-semibold text-white">{play?.posteam ?? "--"}</p>
        </div>
        <div>
          <p>Defense</p>
          <p className="text-2xl font-semibold text-white">{play?.defteam ?? "--"}</p>
        </div>
      </div>

      <p className={cn("text-sm leading-relaxed text-white/80", !play && "text-center")}>
        {play?.desc ?? "Waiting for the first snap..."}
      </p>
    </div>
  );
}
