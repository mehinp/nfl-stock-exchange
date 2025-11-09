import PortfolioSummary from '../dashboard/PortfolioSummary';

export default function PortfolioSummaryExample() {
  return (
    <div className="p-6">
      <PortfolioSummary
        totalValue={12543.20}
        dayChange={432.10}
        dayChangePercent={3.56}
        cashBalance={5432.10}
        holdingsCount={8}
        totalPnL={2543.20}
        initialDeposit={10000}
      />
    </div>
  );
}
