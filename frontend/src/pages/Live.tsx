import Navbar from "@/components/Navbar";
import FieldPosition from "@/components/live/FieldPosition";
import BettingOpportunityCard from "@/components/live/BettingOpportunityCard";
import PlayFeed from "@/components/live/PlayFeed";
import LiveScoreboard from "@/components/live/LiveScoreboard";
import { useLivePlayStream } from "@/hooks/useLivePlayStream";
import { Badge } from "@/components/ui/badge";
import FlashPickShowcase from "@/components/live/FlashPickShowcase";

const DEFAULT_STREAM_PATH = "/live-stream/games/2024_03_SF_LA/stream";
const STREAM_URL =
  (import.meta.env.VITE_LIVE_STREAM_URL as string | undefined)?.trim() || DEFAULT_STREAM_PATH;

const deriveTeams = (url: string) => {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const gameId = parts.find((part) => part.includes("_")) ?? "";
    const tokens = gameId.split("_");
    if (tokens.length >= 4) {
      const away = tokens[tokens.length - 2]?.toUpperCase() ?? null;
      const home = tokens[tokens.length - 1]?.toUpperCase() ?? null;
      return { home, away };
    }
  } catch {
    // ignore
  }
  return { home: null, away: null };
};

export default function Live() {
  const { plays, status, error } = useLivePlayStream({ streamUrl: STREAM_URL });
  const latestPlay = plays[0];
  const { home, away } = deriveTeams(STREAM_URL);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Live Plays</h1>
            <Badge variant={status === "open" ? "default" : status === "connecting" ? "secondary" : "destructive"}>
              {status === "open" ? "Streaming" : status === "connecting" ? "Connecting..." : "Reconnecting"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Real-time feed straight from the ngrok play stream. Track the marching line, see leverage windows, and get a
            pulse on WP swings.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </header>

        <LiveScoreboard play={latestPlay} homeTeam={home} awayTeam={away} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <FieldPosition yardline={latestPlay?.yardline_100} posteam={latestPlay?.posteam} defteam={latestPlay?.defteam} />
            <PlayFeed plays={plays} homeTeam={home} awayTeam={away} />
          </div>

          <div className="space-y-4">
            <BettingOpportunityCard play={latestPlay} />
            <FlashPickShowcase play={latestPlay} homeTeam={home} awayTeam={away} />
          </div>
        </div>
      </main>
    </div>
  );
}
