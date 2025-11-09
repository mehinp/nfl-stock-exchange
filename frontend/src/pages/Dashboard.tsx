import { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchTeamHistory } from "@/lib/api";
import { usePortfolio } from "@/hooks/usePortfolio";
import { buildPortfolioSnapshot } from "@/lib/portfolio-utils";
import { usePortfolioValueHistory } from "@/hooks/usePortfolioValueHistory";

const PRICE_MULTIPLIER = 1;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const priceUSD = (value: unknown) => toNumber(value) * PRICE_MULTIPLIER;

const normalizeTimestamp = (timestamp?: string) => {
  if (!timestamp) return NaN;
  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) ? time : NaN;
};

const pickWeekReferencePrice = (history: TeamMarketInformation[]): number | null => {
  if (!history.length) return null;
  const enriched = history
    .map((entry, index) => ({
      ...entry,
      timestampValue: normalizeTimestamp(entry.timestamp) || index,
    }))
    .sort((a, b) => a.timestampValue - b.timestampValue);

  const latest = enriched[enriched.length - 1];
  const latestPrice = priceUSD(latest.value ?? latest.price);
  const latestTs = latest.timestampValue || Date.now();
  const threshold = latestTs - WEEK_MS;
  const reference =
    [...enriched]
      .reverse()
      .find((entry) => entry.timestampValue <= threshold) ?? enriched[0];
  const refPrice = priceUSD(reference.value ?? reference.price);
  if (!latestPrice || !refPrice || !Number.isFinite(refPrice) || refPrice === 0) {
    return null;
  }
  return refPrice;
};

const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

type NormalizedTeam = {
  id: string;
  name: string;
  abbreviation: string;
  price: number;
};

const normalizeTeams = (teams: TeamMarketInformation[]): NormalizedTeam[] => {
  return teams.map((team, index) => {
    const price = priceUSD(team.value ?? team.price);
    return {
      id: `${team.team_name}-${team.timestamp ?? index}`,
      name: team.team_name,
      abbreviation: getTeamAbbreviation(team.team_name),
      price,
    };
  });
};

export default function Dashboard() {
  const { data: teams, isLoading: isTeamsLoading } = useTeams();
  const { data: portfolioData, isLoading: isPortfolioLoading } = usePortfolio();
  const { data: portfolioHistory } = usePortfolioValueHistory();
  const navigateToMarket = useMarketNavigation();
  const [referencePrices, setReferencePrices] = useState<Record<string, number>>({});
  const pendingRefs = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!teams?.length) return;
    const missing = teams
      .map((team) => team.team_name)
      .filter(
        (name) => referencePrices[name] === undefined && !pendingRefs.current.has(name),
      );
    if (!missing.length) return;

    let cancelled = false;

    const fetchReferences = async () => {
      for (const chunk of chunkArray(missing, 6)) {
        chunk.forEach((name) => pendingRefs.current.add(name));
        const results = await Promise.allSettled(
          chunk.map((name) => fetchTeamHistory(name)),
        );
        if (cancelled) {
          chunk.forEach((name) => pendingRefs.current.delete(name));
          return;
        }
        const updates: Record<string, number> = {};
        results.forEach((result, index) => {
          const teamName = chunk[index];
          pendingRefs.current.delete(teamName);
          if (result.status === "fulfilled") {
            const referencePrice = pickWeekReferencePrice(result.value);
            if (referencePrice !== null) {
              updates[teamName] = referencePrice;
            }
          }
        });
        if (Object.keys(updates).length) {
          setReferencePrices((prev) => ({ ...prev, ...updates }));
        }
      }
    };

    fetchReferences();

    return () => {
      cancelled = true;
      pendingRefs.current.clear();
    };
  }, [teams, referencePrices]);

  const normalizedTeams = useMemo(() => (teams ? normalizeTeams(teams) : []), [teams]);

  const trendingTeams = useMemo(() => {
    if (!normalizedTeams.length) return [];
    return normalizedTeams
      .map((team) => {
        const refPrice = referencePrices[team.name];
        const changePercent =
          refPrice && refPrice !== 0 ? ((team.price - refPrice) / refPrice) * 100 : 0;
        return {
          id: team.id,
          name: team.name,
          abbreviation: team.abbreviation,
          price: team.price,
          changePercent,
        };
      })
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 5);
  }, [normalizedTeams, referencePrices]);

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

  const portfolioSnapshot = buildPortfolioSnapshot(
    portfolioData,
    teams,
    portfolioHistory,
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
                  totalPnL={portfolioSnapshot.totalUnrealizedPnL}
                  initialDeposit={portfolioSnapshot.initialDeposit}
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
