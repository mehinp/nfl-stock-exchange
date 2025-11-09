import { Card } from "@/components/ui/card";
import { useMemo, useState } from "react";
import StockChart from "@/components/market/StockChart";
import { usePortfolioValueHistory } from "@/hooks/usePortfolioValueHistory";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioLiveHistoryPoint } from "@/lib/api";
import { ChartRange, filterPointsByRange } from "@/lib/chart-range";

type ChartPoint = { time: string; price: number; timestamp: number };

export default function PerformanceChart() {
  const [range, setRange] = useState<ChartRange>("1D");
  const { data: portfolioHistory, isLoading, error } = usePortfolioValueHistory();

  const {
    chartData,
    latestValue,
    weekChangePercent,
    monthChangePercent,
    priceDomain,
  } = useMemo(() => {
      if (!portfolioHistory || !portfolioHistory.history.length) {
        return {
          chartData: [],
          latestValue: 0,
          weekChangePercent: null,
          monthChangePercent: null,
          priceDomain: undefined,
        };
      }

      const DAY_MS = 24 * 60 * 60 * 1000;
      const WEEK_MS = DAY_MS * 7;
      const MONTH_MS = WEEK_MS * 4;

      const historyPoints: ChartPoint[] = portfolioHistory.history
        .map((point: PortfolioLiveHistoryPoint): ChartPoint | null => {
          const timestamp = new Date(point.timestamp).getTime();
          const balance = Number.parseFloat(point.balance ?? "0");
          if (!Number.isFinite(timestamp) || Number.isNaN(balance)) return null;
          return {
            time: new Date(timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            price: balance,
            timestamp,
          };
        })
        .filter((point): point is ChartPoint => Boolean(point))
        .sort((a, b) => a.timestamp - b.timestamp);

      if (!historyPoints.length) {
        return {
          chartData: [],
          latestValue: 0,
          weekChangePercent: null,
          monthChangePercent: null,
          priceDomain: undefined,
        };
      }

      const normalized = historyPoints;

      const latest = normalized[normalized.length - 1];
      const latestTs = latest?.timestamp ?? Date.now();

      const referenceFor = (
        sorted: typeof normalized,
        windowMs: number,
        latestTimestamp: number,
      ) => {
        const threshold = latestTimestamp - windowMs;
        return (
          [...sorted]
            .reverse()
            .find((entry) => entry.timestamp && entry.timestamp <= threshold) ||
          sorted[0]
        );
      };

      const changeFrom = (
        currentPrice: number,
        reference?: { price: number } | null,
      ) => {
        if (!reference?.price) return null;
        if (!currentPrice) return null;
        return ((currentPrice - reference.price) / reference.price) * 100;
      };

      const weekRef = referenceFor(normalized, WEEK_MS, latestTs);
      const monthRef = referenceFor(normalized, MONTH_MS, latestTs);

      const filtered = filterPointsByRange(normalized, range);
      const displayPoints = filtered.length ? filtered : normalized.slice(-1);

      const values = displayPoints.map((point) => point.price);
      const max = Math.max(...values, 0);
      const min = Math.min(...values, max);
      const padding = Math.max((max - min || max || 1) * 0.05, 5);
      const domain: [number, number] = [
        Math.max(0, min - padding),
        Math.max(max + padding, min + padding),
      ];

      return {
        chartData: displayPoints,
        latestValue: latest?.price ?? 0,
        weekChangePercent: changeFrom(latest?.price ?? 0, weekRef),
        monthChangePercent: changeFrom(latest?.price ?? 0, monthRef),
        priceDomain: domain,
      };
    }, [portfolioHistory, range]);

  if (isLoading) {
    return (
      <Card className="p-6" data-testid="performance-chart">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-80 w-full" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6" data-testid="performance-chart">
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Unable to load portfolio history
          </p>
        </div>
      </Card>
    );
  }

  if (!chartData.length) {
    return (
      <Card className="p-6" data-testid="performance-chart">
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No portfolio data yet. Start trading to see your performance!
          </p>
        </div>
      </Card>
    );
  }

  const displayPrice = latestValue;

  return (
    <Card className="p-6" data-testid="performance-chart">
      <StockChart
        teamName="Total Account Value"
        data={chartData}
        range={range}
        onRangeChange={setRange}
        price={displayPrice}
        weekChangePercent={weekChangePercent}
        monthChangePercent={monthChangePercent}
        priceDomain={priceDomain}
      />
    </Card>
  );
}
