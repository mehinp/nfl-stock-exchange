import { useMemo } from "react";
import Navbar from "@/components/Navbar";
import PortfolioSummary from "@/components/dashboard/PortfolioSummary";
import TrendingTeams from "@/components/dashboard/TrendingTeams";
import QuickTradeWidget from "@/components/dashboard/QuickTradeWidget";
import PortfolioInsights from "@/components/dashboard/PortfolioInsights";
import { formatCurrency, formatPercent } from "@/lib/number-format";
import { useTeams } from "@/hooks/useTeams";
import { useMarketNavigation } from "@/hooks/useMarketNavigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getTeamAbbreviation } from "@/lib/utils";
import type { TeamMarketInformation } from "@/lib/api";
import { usePortfolio } from "@/hooks/usePortfolio";
import { buildPortfolioSnapshot } from "@/lib/portfolio-utils";

const PRICE_MULTIPLIER = 1;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const priceUSD = (value: unknown) => toNumber(value) * PRICE_MULTIPLIER;

type NormalizedTeam = {
  id: string;
  name: string;
  abbreviation: string;
  price: number;
  weekChangePercent?: number | null;
};

const normalizeTeams = (teams: TeamMarketInformation[]): NormalizedTeam[] => {
  const grouped = new Map<
    string,
    Array<TeamMarketInformation & { timestampValue: number }>
  >();

  teams.forEach((team) => {
    const list = grouped.get(team.team_name) ?? [];
    list.push({
      ...team,
      timestampValue: team.timestamp ? new Date(team.timestamp).getTime() : -Infinity,
    });
    grouped.set(team.team_name, list);
  });

  const changeFrom = (
    currentPrice: number,
    reference?: (TeamMarketInformation & { timestampValue: number }) | null,
  ) => {
    if (!reference) return null;
    const refPrice = priceUSD(reference.value ?? reference.price);
    if (!refPrice) return null;
    return ((currentPrice - refPrice) / refPrice) * 100;
  };

  const referenceFor = (
    sorted: Array<TeamMarketInformation & { timestampValue: number }>,
    windowMs: number,
    latestTs: number,
  ) => {
    const threshold = latestTs - windowMs;
    return (
      [...sorted]
        .reverse()
        .find(
          (entry) =>
            entry.timestampValue <= threshold && entry.timestampValue !== -Infinity,
        ) || sorted[0]
    );
  };

  return Array.from(grouped.entries()).map(([name, entries], index) => {
    const sorted = entries.sort((a, b) => a.timestampValue - b.timestampValue);
    const latest = sorted[sorted.length - 1];
    const latestTs = latest?.timestampValue ?? Date.now();
    const weekRef = referenceFor(sorted, WEEK_MS, latestTs);
    const price = priceUSD(latest?.value ?? latest?.price);

    return {
      id: `${name}-${latest?.timestamp ?? index}`,
      name,
      abbreviation: getTeamAbbreviation(name),
      price,
      weekChangePercent: changeFrom(price, weekRef),
    };
  });
};

export default function Dashboard() {
  const { data: teams, isLoading: isTeamsLoading } = useTeams();
  const { data: portfolioData, isLoading: isPortfolioLoading } = usePortfolio();
  const navigateToMarket = useMarketNavigation();

  const normalizedTeams = useMemo(() => (teams ? normalizeTeams(teams) : []), [teams]);

  const trendingTeams = useMemo(() => {
    if (!normalizedTeams.length) return [];
    return normalizedTeams
      .sort(
        (a, b) =>
          Math.abs(b.weekChangePercent ?? 0) - Math.abs(a.weekChangePercent ?? 0),
      )
      .slice(0, 5)
      .map((team) => ({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        price: team.price,
        changePercent: team.weekChangePercent ?? 0,
      }));
  }, [normalizedTeams]);

  const quickTradeTeams = useMemo(
    () =>
      normalizedTeams.map((team) => ({
        id: team.name,
        name: team.name,
        abbreviation: team.abbreviation,
        price: team.price,
      })),
    [normalizedTeams],
  );

  const portfolioSnapshot = useMemo(
    () => buildPortfolioSnapshot(portfolioData, teams),
    [portfolioData, teams],
  );

  const portfolioInsights = useMemo(() => {
    const totalValue = portfolioSnapshot.totalValue;

    const sortedByDayChange = [...portfolioSnapshot.holdings].sort(
      (a, b) => (b.dayChangePercent ?? 0) - (a.dayChangePercent ?? 0),
    );
    const bestPerformer = sortedByDayChange[0];
    const worstPerformer = sortedByDayChange[sortedByDayChange.length - 1];

    const highlights = [
      {
        label: "Best Performer",
        value: bestPerformer
          ? `${bestPerformer.team.abbreviation} ${formatPercent(bestPerformer.dayChangePercent)}`
          : "—",
        description: bestPerformer
          ? `${bestPerformer.quantity} shares • ${formatCurrency(bestPerformer.currentPrice)}`
          : "Start trading to track performance",
        trend: bestPerformer?.dayChangePercent,
      },
      {
        label: "Worst Performer",
        value: worstPerformer
          ? `${worstPerformer.team.abbreviation} ${formatPercent(worstPerformer.dayChangePercent)}`
          : "—",
        description: worstPerformer
          ? `${worstPerformer.quantity} shares • ${formatCurrency(worstPerformer.currentPrice)}`
          : "All positions flat",
        trend: worstPerformer?.dayChangePercent,
      },
    ];

    const totalAllocBase = portfolioSnapshot.totalValue || 0;
    let allocations =
      totalAllocBase > 0
        ? portfolioSnapshot.holdings
            .map((holding) => ({
              label: holding.team.abbreviation || holding.team.name,
              percentage: (holding.totalValue / totalAllocBase) * 100,
            }))
            .sort((a, b) => b.percentage - a.percentage)
        : [];

    if (allocations.length > 3) {
      const others = allocations.slice(3).reduce((sum, entry) => sum + entry.percentage, 0);
      allocations = allocations.slice(0, 3);
      if (others > 0.5) {
        allocations.push({ label: "Other", percentage: others });
      }
    }

    if (totalAllocBase > 0 && portfolioSnapshot.cashBalance > 0) {
      allocations.push({
        label: "Cash",
        percentage: (portfolioSnapshot.cashBalance / totalAllocBase) * 100,
      });
    }

    if (!allocations.length && portfolioSnapshot.cashBalance > 0) {
      allocations = [
        {
          label: "Cash",
          percentage: 100,
        },
      ];
    }

    return { highlights, allocations };
  }, [portfolioSnapshot]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Your portfolio at a glance</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {isPortfolioLoading && isTeamsLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : (
                <PortfolioSummary
                  totalValue={portfolioSnapshot.totalValue}
                  dayChange={portfolioSnapshot.dayChangeValue}
                  dayChangePercent={portfolioSnapshot.dayChangePercent}
                  cashBalance={portfolioSnapshot.cashBalance}
                  holdingsCount={portfolioSnapshot.holdingsCount}
                />
              )}
            </div>
            <div>
              {isTeamsLoading ? (
                <Skeleton className="h-[340px] w-full" />
              ) : (
                <QuickTradeWidget teams={quickTradeTeams} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {isTeamsLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <TrendingTeams teams={trendingTeams} onTeamSelect={navigateToMarket} />
            )}
            <PortfolioInsights
              highlights={portfolioInsights.highlights}
              allocations={portfolioInsights.allocations}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
