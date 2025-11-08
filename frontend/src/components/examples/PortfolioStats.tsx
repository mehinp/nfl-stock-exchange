import PortfolioStats from '../portfolio/PortfolioStats';

export default function PortfolioStatsExample() {
  return (
    <div className="p-6">
      <PortfolioStats
        totalValue={12543.20}
        totalCost={11200.50}
        cashBalance={2350.75}
        initialDeposit={10000}
        dayChange={432.10}
        dayChangePercent={3.56}
      />
    </div>
  );
}
