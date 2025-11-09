import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import type { LivePlay } from "@/hooks/useLivePlayStream";
import { Flame, Zap } from "lucide-react";

interface BettingOpportunityCardProps {
  play?: LivePlay;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(value)),
  );

export default function BettingOpportunityCard({ play }: BettingOpportunityCardProps) {
  const signal = play?.signal ?? 0;
  const isActive = signal >= 1;

  const recommended = useMemo(() => {
    if (!isActive) return 0;
    const base = signal === 2 ? 750 : 350;
    const winProb = play?.wp ?? 0.5;
    return base + (winProb - 0.5) * 400;
  }, [signal, play?.wp, isActive]);

  const [stake, setStake] = useState(Math.max(100, recommended));

  const handleBet = () => {
    if (!play) return;
    console.log("Placing bet", { stake, play });
  };

  if (!play) {
    return (
      <Card className="p-6 space-y-4 border-dashed">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Flame className="w-4 h-4" />
          <p className="text-sm">Waiting for first play...</p>
        </div>
      </Card>
    );
  }

  if (!isActive) {
    return (
      <Card className="p-6 space-y-3 border-dashed">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap className="w-4 h-4" />
          <p className="text-sm">No flash window right now. Stay ready.</p>
        </div>
        <p className="text-xs text-muted-foreground">{play.desc}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-5 shadow-lg border-primary/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Flash Opportunity</p>
          <h2 className="text-2xl font-semibold">{play.posteam ?? "Unknown"} Momentum</h2>
        </div>
        <Badge className="flex items-center gap-2 bg-red-500/10 text-red-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-400" />
          </span>
          Window Open
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{play.desc}</p>

      <div className="rounded-xl bg-muted/40 p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Recommended Stake</span>
          <span className="font-mono text-lg">{formatCurrency(recommended)}</span>
        </div>
        <Slider
          value={[stake]}
          min={100}
          max={1500}
          step={50}
          onValueChange={([value]) => setStake(value)}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(100)}</span>
          <span>{formatCurrency(1500)}</span>
        </div>
      </div>

      <Button className="w-full h-12 text-lg" onClick={handleBet}>
        Send {formatCurrency(stake)}
      </Button>
    </Card>
  );
}
