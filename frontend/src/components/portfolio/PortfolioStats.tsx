import { Card } from "@/components/ui/card";
import { TrendingUp, DollarSign, BarChart3, Target } from "lucide-react";
import { formatCurrency } from "@/lib/number-format";

interface PortfolioStatsProps {
  totalValue: number;
  totalCost: number;
  initialDeposit: number;
  dayChange: number;
  dayChangePercent: number;
}

export default function PortfolioStats({
  totalValue,
  totalCost,
  initialDeposit,
  dayChange,
  dayChangePercent,
}: PortfolioStatsProps) {
  const safeTotalCost = totalCost > 0 ? totalCost : 0;
  const safeInitialDeposit = initialDeposit > 0 ? initialDeposit : 0;
  const totalProfitLoss = totalValue - safeInitialDeposit;
  const totalProfitLossPercent =
    safeInitialDeposit > 0 ? (totalProfitLoss / safeInitialDeposit) * 100 : 0;
  const normalizedDayChangePercent = Number.isFinite(dayChangePercent)
    ? dayChangePercent
    : 0;

  type CardConfig = {
    icon: typeof DollarSign;
    label: string;
    value: string;
    subtitle: string;
    percentIntent?: "positive" | "negative";
  };

  const cards: CardConfig[] = [
    {
      icon: DollarSign,
      label: "Total Value",
      value: formatCurrency(totalValue),
      subtitle: "Portfolio equity",
    },
    {
      icon: BarChart3,
      label: "Total Cost",
      value: formatCurrency(safeTotalCost),
      subtitle: "Capital deployed",
    },
    {
      icon: TrendingUp,
      label: "Total P&L",
      value: `${totalProfitLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totalProfitLoss))}`,
      subtitle: `${totalProfitLossPercent >= 0 ? "+" : "-"}${Math.abs(totalProfitLossPercent).toFixed(2)}%`,
      percentIntent: totalProfitLoss >= 0 ? "positive" : "negative",
    },
    {
      icon: Target,
      label: "Day Change",
      value: `${dayChange >= 0 ? "+" : "-"}${formatCurrency(Math.abs(dayChange))}`,
      subtitle: `${normalizedDayChangePercent >= 0 ? "+" : "-"}${Math.abs(normalizedDayChangePercent).toFixed(2)}%`,
      percentIntent: dayChange >= 0 ? "positive" : "negative",
    },
  ] as const;

  return (
    <Card className="p-6" data-testid="portfolio-stats">
      <h2 className="text-lg font-semibold mb-4">Performance Stats</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          const isChangeCard = Boolean(card.percentIntent);
          const percentClass =
            card.percentIntent === "positive"
              ? "text-success"
              : card.percentIntent === "negative"
                ? "text-destructive"
                : "text-muted-foreground";

          return (
            <div
              key={card.label}
              className="rounded-2xl border bg-card/80 p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between text-muted-foreground gap-2">
                <span className="text-sm font-medium">{card.label}</span>
                <Icon className="h-4 w-4" />
              </div>

              <div className="mt-2 text-2l font-mono font-semibold tracking-tight">
                {card.value}
              </div>
              <span
                className={`text-xs font-medium ${
                  isChangeCard ? percentClass : "text-muted-foreground"
                }`}
              >
                {card.subtitle}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
