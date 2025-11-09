import { Card } from "@/components/ui/card";
import { TrendingUp, DollarSign, BarChart3, Target } from "lucide-react";
import { formatCurrency } from "@/lib/number-format";
import { usePriceFlash } from "@/hooks/usePriceFlash";

interface PortfolioStatsProps {
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  totalPnL: number;
  initialDeposit: number;
  dayChange: number;
  dayChangePercent: number;
}

export default function PortfolioStats({
  totalValue,
  totalCost,
  cashBalance,
  totalPnL,
  initialDeposit,
  dayChange,
  dayChangePercent,
}: PortfolioStatsProps) {
  const safeTotalCost = Number.isFinite(totalCost) && totalCost > 0 ? totalCost : 0;
  const safeCashBalance =
    Number.isFinite(cashBalance) && cashBalance > 0 ? cashBalance : 0;
  const safeInitialDeposit =
    Number.isFinite(initialDeposit) && initialDeposit !== 0 ? initialDeposit : 0;
  const totalProfitLoss = Number.isFinite(totalPnL) ? totalPnL : 0;
  const totalProfitLossPercent =
    safeInitialDeposit !== 0 ? (totalProfitLoss / safeInitialDeposit) * 100 : 0;
  const normalizedDayChange = Number.isFinite(dayChange) ? dayChange : 0;
  const normalizedDayChangePercent = Number.isFinite(dayChangePercent)
    ? dayChangePercent
    : 0;

  type CardConfig = {
    icon: typeof DollarSign;
    label: string;
    value: string;
    valueRaw: number;
    subtitle: string;
    percentIntent?: "positive" | "negative";
  };

  const cards: CardConfig[] = [
    {
      icon: DollarSign,
      label: "Cash Balance",
      value: formatCurrency(safeCashBalance),
      valueRaw: safeCashBalance,
      subtitle: "Available to trade",
    },
    {
      icon: BarChart3,
      label: "Total Cost",
      value: formatCurrency(safeTotalCost),
      valueRaw: safeTotalCost,
      subtitle: "Capital deployed",
    },
    {
      icon: TrendingUp,
      label: "Total P&L",
      value: `${totalProfitLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totalProfitLoss))}`,
      valueRaw: totalProfitLoss,
      subtitle: `${totalProfitLossPercent >= 0 ? "+" : "-"}${Math.abs(totalProfitLossPercent).toFixed(2)}%`,
      percentIntent: totalProfitLoss >= 0 ? "positive" : "negative",
    },
    {
      icon: Target,
      label: "Day Change",
      value: `${normalizedDayChange >= 0 ? "+" : "-"}${formatCurrency(Math.abs(normalizedDayChange))}`,
      valueRaw: normalizedDayChange,
      subtitle: `${normalizedDayChangePercent >= 0 ? "+" : "-"}${Math.abs(normalizedDayChangePercent).toFixed(2)}%`,
      percentIntent: normalizedDayChange >= 0 ? "positive" : "negative",
    },
  ] as const;

  const StatMetric = ({ card }: { card: CardConfig }) => {
    const flashClass = usePriceFlash(card.valueRaw);
    const Icon = card.icon;
    const percentClass =
      card.percentIntent === "positive"
        ? "text-success"
        : card.percentIntent === "negative"
          ? "text-destructive"
          : "text-muted-foreground";

    return (
      <div className="rounded-2xl border bg-card/80 p-5 shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between text-muted-foreground gap-2">
          <span className="text-sm font-medium">{card.label}</span>
          <Icon className="h-4 w-4" />
        </div>

        <div className={`mt-2 text-2l font-mono font-semibold tracking-tight ${flashClass}`}>
          {card.value}
        </div>
        <span className={`text-xs font-medium ${card.percentIntent ? percentClass : "text-muted-foreground"}`}>
          {card.subtitle}
        </span>
      </div>
    );
  };

  return (
    <Card className="p-6" data-testid="portfolio-stats">
      <h2 className="text-lg font-semibold mb-4">Performance Stats</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <StatMetric key={card.label} card={card} />
        ))}
      </div>
    </Card>
  );
}
