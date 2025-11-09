import { Card } from "@/components/ui/card";
import { TrendingUp, Wallet, Briefcase } from "lucide-react";
import PriceDisplay from "../shared/PriceDisplay";
import PercentageChange from "../shared/PercentageChange";
import StatCard from "../shared/StatCard";
import { formatCurrency, formatNumber } from "@/lib/number-format";
import { usePriceFlash } from "@/hooks/usePriceFlash";

interface PortfolioSummaryProps {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  cashBalance: number;
  holdingsCount: number;
  totalPnL: number;
  initialDeposit: number;
}

export default function PortfolioSummary({
  totalValue,
  dayChange,
  dayChangePercent,
  cashBalance,
  holdingsCount,
  totalPnL,
  initialDeposit,
}: PortfolioSummaryProps) {
  const safeTotalValue = Number.isFinite(totalValue) ? totalValue : 0;
  const safeInitialDeposit = Number.isFinite(initialDeposit) ? initialDeposit : 0;
  const safeDayChange = Number.isFinite(dayChange) ? dayChange : 0;
  const safeTotalPnL = Number.isFinite(totalPnL) ? totalPnL : safeTotalValue - safeInitialDeposit;
  const safeDayChangePercent = Number.isFinite(dayChangePercent) ? dayChangePercent : 0;
  const safeCashBalance = Number.isFinite(cashBalance) ? cashBalance : 0;
  const safeHoldingsCount = Number.isFinite(holdingsCount) ? holdingsCount : 0;

  const signedDayChange = `${safeDayChange >= 0 ? "+" : "-"}${formatCurrency(
    Math.abs(safeDayChange),
  )}`;
  const signedTotalPnL = `${safeTotalPnL >= 0 ? "+" : "-"}${formatCurrency(
    Math.abs(safeTotalPnL),
  )}`;
  const dayFlash = usePriceFlash(safeDayChange);
  const pnlFlash = usePriceFlash(safeTotalPnL);
  const percentFlash = usePriceFlash(safeDayChangePercent);

  return (
    <Card className="p-6" data-testid="portfolio-summary">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Portfolio Summary</h2>
          <div className="flex items-end gap-3">
            <PriceDisplay price={safeTotalValue} size="lg" />
            <span className={percentFlash}>
              <PercentageChange value={safeDayChangePercent} size="md" />
            </span>
          </div>
          <div
            className={`text-sm font-medium mt-2 ${
              safeDayChange >= 0 ? "text-success" : "text-danger"
            } ${dayFlash}`}
          >
            {signedDayChange} today
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Wallet}
            label="Cash Balance"
            value={formatCurrency(safeCashBalance)}
          />
          <StatCard
            icon={Briefcase}
            label="Holdings"
            value={formatNumber(safeHoldingsCount, { maximumFractionDigits: 0 })}
            subtitle="Teams"
          />
          <StatCard
            icon={TrendingUp}
            label="Total P&L"
            value={signedTotalPnL}
            flashValue={safeTotalPnL}
          />
          <StatCard
            icon={TrendingUp}
            label="Day P&L"
            value={signedDayChange}
            flashValue={safeDayChange}
          />
        </div>
      </div>
    </Card>
  );
}
