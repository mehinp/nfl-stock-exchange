import { Card } from "@/components/ui/card";
import { useMemo, useState } from "react";
import StockChart, { ChartRange } from "@/components/market/StockChart";
import { usePortfolioValueHistory } from "@/hooks/usePortfolioValueHistory";
import { Skeleton } from "@/components/ui/skeleton";

export default function PerformanceChart() {
  const [range, setRange] = useState<ChartRange>("ALL");
  const { data: portfolioHistory, isLoading, error } = usePortfolioValueHistory();

  const { chartData, latestValue, weekChangePercent, monthChangePercent, priceDomain } =
    useMemo(() => {
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

      // Convert history to chart format
      const normalized = portfolioHistory.history.map((point) => {
        const timestamp = new Date(point.timestamp).getTime();
        const totalValue = parseFloat(point.total_value);
        
        const dateLabel = new Date(timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        
        return {
          time: dateLabel,
          price: totalValue,
          timestamp,
          cashBalance: parseFloat(point.cash_balance),
          holdingsValue: parseFloat(point.holdings_value),
        };
      });

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

      const values = normalized.map((point) => point.price);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = Math.max((max - min) * 0.1, min * 0.05 || 10);
      const domain: [number, number] = [Math.max(0, min - padding), max + padding];

      return {
        chartData: normalized,
        latestValue: latest?.price ?? 0,
        weekChangePercent: changeFrom(latest?.price ?? 0, weekRef),
        monthChangePercent: changeFrom(latest?.price ?? 0, monthRef),
        priceDomain: domain,
      };
    }, [portfolioHistory]);

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

  const hasCurrentTotalValue =
    portfolioHistory?.current_total_value != null &&
    portfolioHistory.current_total_value !== "" &&
    Number.isFinite(Number(portfolioHistory.current_total_value));
  const displayPrice = hasCurrentTotalValue
    ? Number(portfolioHistory?.current_total_value)
    : latestValue;

  return (
    <Card className="p-6" data-testid="performance-chart">
      <StockChart
        teamName="Portfolio Value"
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
