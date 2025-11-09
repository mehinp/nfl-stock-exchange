import { Card } from "@/components/ui/card";
import type { LivePlay } from "@/hooks/useLivePlayStream";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import TeamLogo from "@/components/shared/TeamLogo";

interface PlayFeedProps {
  plays: LivePlay[];
  homeTeam?: string | null;
  awayTeam?: string | null;
}

const formatBallSpot = (play: LivePlay) => {
  if (typeof play.yardline_100 !== "number") return "--";
  
  // CRITICAL FIX: If your CSV column is "yards_to_endzone" (yards to OFFENSE's endzone),
  // you need to convert it to yardline_100 (yards to OPPONENT's endzone)
  const yardsToOpponentEndzone = 100 - play.yardline_100;
  
  const offenseSide = play.posteam ?? "OFF";
  const defenseSide = play.defteam ?? "DEF";
  
  if (yardsToOpponentEndzone > 50) {
    // Past midfield, on opponent's side
    return `${defenseSide}${100 - yardsToOpponentEndzone}`;
  }
  // On own side of field
  return `${offenseSide}${yardsToOpponentEndzone}`;
};

const formatClock = (seconds?: number | null) => {
  if (typeof seconds !== "number") return "--:--";
  const remainder = seconds % 900;
  const mins = Math.floor(remainder / 60);
  const secs = remainder % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const groupPlaysByDrive = (plays: LivePlay[]) => {
  const chronological = [...plays].sort((a, b) => a.index - b.index);
  const drives: { id: string; offense: string; plays: LivePlay[] }[] = [];
  let current: { id: string; offense: string; plays: LivePlay[] } | null = null;

  chronological.forEach((play) => {
    const offense = play.posteam ?? "OFF";
    const shouldStart = !current || current.offense !== offense;
    if (shouldStart) {
      current = { id: `${play.index}-${offense}`, offense, plays: [] };
      drives.unshift(current);
    }
    if (current) {
      current.plays.unshift(play);
    }
  });
  return drives.slice(0, 4);
};

export default function PlayFeed({ plays, homeTeam, awayTeam }: PlayFeedProps) {
  const drives = groupPlaysByDrive(plays);
  const [openId, setOpenId] = useState<string | null>(drives[0]?.id ?? null);

  if (!drives.length) {
    return <Card className="p-6 text-sm text-muted-foreground bg-[#0f0f0f] border-white/5">No plays yet.</Card>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Recent Drives</h2>
      <div className="space-y-3">
        {drives.map((drive) => (
          <Card key={drive.id} className="bg-[#0f0f0f] border-white/5 text-white">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-sm uppercase tracking-wide text-white/70"
              onClick={() =>
                setOpenId((prev) => (prev === drive.id ? null : drive.id))
              }
            >
              <span className="flex items-center gap-2">
                <TeamLogo
                  teamName={drive.offense}
                  abbreviation={drive.offense}
                  size="sm"
                  className="bg-transparent rounded-full"
                />
                Drive · {drive.offense}
              </span>
              <ChevronDown className={`w-4 h-4 transition ${openId === drive.id ? "rotate-180" : ""}`} />
            </button>
            {openId === drive.id && (
              <div className="px-4 pb-4 space-y-3">
                {drive.plays.map((play) => (
                  <div
                    key={play.play_id ?? `${play.index}-${play.desc}`}
                    className="rounded-2xl bg-black/30 border border-white/5 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span className="font-mono">Q{play.qtr}</span>
                      <span>{formatClock(play.game_seconds_remaining)}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-white/90">{play.desc}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-white/60 pt-2 border-t border-white/5">
                      <div>
                        <p className="uppercase tracking-wide">Home WP</p>
                        <p className="font-mono text-base text-white">{(play.wp * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Down</p>
                        <p className="font-mono text-base text-white">
                          {play.down ?? "-"} & {play.ydstogo ?? "-"}
                        </p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Ball On</p>
                        <p className="font-mono text-base text-white">{formatBallSpot(play)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
