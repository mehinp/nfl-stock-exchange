import { useMemo } from "react";
import Navbar from "@/components/Navbar";
import StockHoldingCard from "@/components/portfolio/StockHoldingCard";
import PerformanceChart from "@/components/portfolio/PerformanceChart";
import TransactionHistory from "@/components/portfolio/TransactionHistory";
import PortfolioStats from "@/components/portfolio/PortfolioStats";
import { useMarketNavigation } from "@/hooks/useMarketNavigation";
import { usePortfolio, useTrade } from "@/hooks/usePortfolio";
import { useTeams } from "@/hooks/useTeams";
import { buildPortfolioSnapshot, type EnrichedHolding } from "@/lib/portfolio-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Portfolio() {
  const navigateToMarket = useMarketNavigation();
  const { data: portfolioData, isLoading: isPortfolioLoading } = usePortfolio();
  const { data: teams, isLoading: isTeamsLoading } = useTeams();
  const tradeMutation = useTrade();
  const { toast } = useToast();

  const snapshot = useMemo(
    () => buildPortfolioSnapshot(portfolioData, teams),
    [portfolioData, teams],
  );

  const holdingsLoading = isPortfolioLoading || isTeamsLoading;

  const handleSellHolding = (holding: EnrichedHolding) => {
    if (!holding.quantity || tradeMutation.isPending) return;

    const quantityToSell = holding.quantity;
    tradeMutation.mutate(
      {
        action: "sell",
        teamName: holding.team.name,
        quantity: quantityToSell,
      },
      {
        onSuccess: (data) => {
          toast({
            title: "Sell order completed",
            description: `Sold ${quantityToSell} ${quantityToSell === 1 ? "share" : "shares"} of ${holding.team.name} @ $${Number(
              data.price,
            ).toFixed(2)}`,
          });
        },
        onError: (error) => {
          toast({
            title: "Sell order failed",
            description: error instanceof Error ? error.message : "Unable to complete trade.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
            <p className="text-muted-foreground">Manage your team holdings and track performance</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {holdingsLoading ? <Skeleton className="h-[360px] w-full" /> : <PerformanceChart />}

              <div>
                <h2 className="text-xl font-semibold mb-4">Your Holdings</h2>
                {holdingsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : snapshot.holdings.length ? (
                  <div className="grid grid-cols-1 gap-4">
                    {snapshot.holdings.map((holding) => (
                      <StockHoldingCard
                        key={holding.id}
                        team={holding.team}
                        shares={holding.quantity}
                        avgCost={holding.avgCost}
                        currentPrice={holding.currentPrice}
                        onSell={() => handleSellHolding(holding)}
                        onSelectTeam={navigateToMarket}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You don&apos;t hold any teams yet. Start trading to build your portfolio.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {holdingsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <PortfolioStats
                  totalValue={snapshot.totalValue}
                  totalCost={snapshot.totalCost}
                  cashBalance={snapshot.cashBalance}
                  initialDeposit={snapshot.initialDeposit}
                  dayChange={snapshot.dayChangeValue}
                  dayChangePercent={snapshot.dayChangePercent}
                />
              )}

              <TransactionHistory
                transactions={snapshot.transactions}
                onSelectTeam={navigateToMarket}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
