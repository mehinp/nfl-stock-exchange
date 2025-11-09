import TeamLogo from "@/components/shared/TeamLogo";

interface FieldPositionProps {
  yardline?: number | null;
  posteam?: string | null;
  defteam?: string | null;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const formatBallSpot = (yardline?: number | null, posteam?: string | null, defteam?: string | null) => {
  if (typeof yardline !== "number") return "--";
  
  // CRITICAL FIX: If your CSV column is "yards_to_endzone" (yards to OFFENSE's endzone),
  // you need to convert it to yardline_100 (yards to OPPONENT's endzone)
  // by subtracting from 100
  const yardsToOpponentEndzone = 100 - yardline; // This converts yards_to_endzone to yardline_100
  
  const offense = posteam ?? "OFF";
  const defense = defteam ?? "DEF";
  
  // Now yardsToOpponentEndzone tells us how far from the opponent's goal line
  if (yardsToOpponentEndzone > 50) {
    // Past midfield, on opponent's side
    return `${defense}${100 - yardsToOpponentEndzone}`;
  }
  // On own side of field
  return `${offense}${yardsToOpponentEndzone}`;
};

const yardMarkers = [10, 20, 30, 40, 50, 60, 70, 80, 90];

export default function FieldPosition({ yardline, posteam, defteam }: FieldPositionProps) {
  const yardlineValue = typeof yardline === "number" ? yardline : 50;
  
  // CRITICAL FIX: Convert yards_to_endzone to yardline_100 format
  const yardsToOpponentEndzone = 100 - yardlineValue;
  
  // Progress bar should show how close to scoring (0% = own goal line, 100% = opponent's goal line)
  const offenseProgress = clamp(yardsToOpponentEndzone);
  const indicatorPosition = clamp(offenseProgress, 5, 95);
  
  const ballSpot = formatBallSpot(yardline, posteam, defteam);
  const offense = posteam ?? "OFF";
  const defense = defteam ?? "DEF";
  const driveLabel = posteam && defteam ? `${offense} -> ${defense}` : "Drive in progress";
  const progressFill = `${offenseProgress}%`;

  return (
    <div className="rounded-[44px] border border-white/5 bg-[#050506] p-8 space-y-8 shadow-[0_30px_50px_rgba(0,0,0,0.45)]">
      <div className="flex items-end justify-between text-white">
        <div>
          <p className="text-[11px] uppercase tracking-[0.5em] text-white/40">Field Position</p>
          <p className="mt-2 text-2xl font-semibold tracking-[0.25em] text-white/80">{ballSpot}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.4em] text-white/40">Possession</p>
          <p className="mt-2 text-lg font-semibold tracking-[0.35em] text-white/80">{offense}</p>
        </div>
      </div>

      <div className="relative h-24 rounded-full border border-white/10 bg-gradient-to-r from-[#131417] via-[#060608] to-[#131417] p-3">
        <div className="relative h-full w-full overflow-hidden rounded-full border border-white/5 bg-black/40">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/25 via-white/10 to-transparent"
            style={{ width: progressFill }}
          />
          <div className="absolute inset-0 flex items-center justify-between px-8 text-[10px] uppercase tracking-[0.6em] text-white/40">
            <span>{offense}</span>
            <span>{defense}</span>
          </div>
          {yardMarkers.map((marker) => (
            <div
              key={marker}
              className="pointer-events-none absolute top-4 flex -translate-x-1/2 flex-col items-center text-[9px] uppercase tracking-[0.4em] text-white/30"
              style={{ left: `${marker}%` }}
            >
              <span className="h-3 w-px bg-white/25" />
              {marker === 50 && <span className="mt-1 text-[9px] tracking-[0.5em]">50</span>}
            </div>
          ))}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 transition-all duration-300"
            style={{ left: `${indicatorPosition}%` }}
          >
            <div className="flex h-08 w-07 items-center justify-center rounded-full border border-white/10 bg-black/80 shadow-[0_10px_35px_rgba(0,0,0,0.55)] backdrop-blur">
              <TeamLogo teamName={offense} abbreviation={offense} size="sm" />
            </div>
            <span className="rounded-full border border-white/10 bg-black/80 px-4 py-1 text-sm font-mono text-white shadow-lg">{ballSpot}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/60">
        <div>
          <p className="text-[10px] text-white/40">Current Drive</p>
          <p className="mt-1 font-semibold text-white/80">{driveLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/40">Ball Spot</p>
          <p className="mt-1 font-mono text-white/80">{ballSpot}</p>
        </div>
      </div>
    </div>
  );
}
