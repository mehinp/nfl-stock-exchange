import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TeamLogo from "../shared/TeamLogo";
import PercentageChange from "../shared/PercentageChange";
import { formatCurrency, formatNumber } from "@/lib/number-format";

interface StockHoldingCardProps {
  team: {
    name: string;
    abbreviation: string;
  };
  shares: number;
  avgCost: number;
  currentPrice: number;
  onSell?: () => void;
  onSelectTeam?: (teamName: string) => void;
}

export default function StockHoldingCard({
  team,
  shares,
  avgCost,
  currentPrice,
  onSell,
  onSelectTeam,
}: StockHoldingCardProps) {
  const totalValue = shares * currentPrice;
  const totalCost = shares * avgCost;
  const profitLoss = totalValue - totalCost;
  const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
  const formattedShares = formatNumber(shares, { maximumFractionDigits: 0 });
  const formattedAvgCost = formatCurrency(avgCost);
  const formattedCurrentPrice = formatCurrency(currentPrice);
  const formattedTotalValue = formatCurrency(totalValue);
  const formattedPnL = `${profitLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(profitLoss))}`;
  const canSell = shares > 0 && Boolean(onSell);

  return (
    <Card
      className="p-4 border-l-4 border-l-primary cursor-pointer hover-elevate"
      data-testid={`stock-holding-${team.abbreviation}`}
      onClick={() => onSelectTeam?.(team.name)}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <TeamLogo teamName={team.name} abbreviation={team.abbreviation} size="md" />
            <div>
              <div className="font-semibold">{team.name}</div>
              <div className="text-sm text-muted-foreground">{formattedShares} shares</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!canSell}
            onClick={(event) => {
              event.stopPropagation();
              onSell?.();
            }}
            data-testid="button-sell"
          >
            Sell
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Avg Cost</div>
            <div className="font-mono font-semibold">{formattedAvgCost}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Current</div>
            <div className="font-mono font-semibold">{formattedCurrentPrice}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Value</div>
            <div className="font-mono font-semibold">{formattedTotalValue}</div>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">P&L</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono font-semibold ${profitLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                {formattedPnL}
              </span>
              <PercentageChange value={profitLossPercent} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
