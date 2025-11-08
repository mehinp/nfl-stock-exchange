import TransactionHistory from '../portfolio/TransactionHistory';

export default function TransactionHistoryExample() {
  const mockTransactions = [
    {
      id: '1',
      date: '2025-11-08',
      type: 'buy' as const,
      team: { name: 'Kansas City Chiefs', abbreviation: 'KC' },
      shares: 5,
      price: 145.50,
      avgBuyPrice: 140.25,
    },
    {
      id: '2',
      date: '2025-11-07',
      type: 'sell' as const,
      team: { name: 'Miami Dolphins', abbreviation: 'MIA' },
      shares: 3,
      price: 118.20,
      avgBuyPrice: 110.35,
    },
    {
      id: '3',
      date: '2025-11-06',
      type: 'buy' as const,
      team: { name: 'Baltimore Ravens', abbreviation: 'BAL' },
      shares: 8,
      price: 132.40,
      avgBuyPrice: 128.0,
    },
  ];

  return (
    <div className="p-6">
      <TransactionHistory transactions={mockTransactions} />
    </div>
  );
}
