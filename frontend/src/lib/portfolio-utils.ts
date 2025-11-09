import { getTeamAbbreviation } from "@/lib/utils";
import type {
  PortfolioResponse,
  TeamMarketInformation,
  PortfolioTrade,
  PortfolioPosition,
  PortfolioLiveHistoryPoint,
  PortfolioLiveHistoryResponse,
} from "@/lib/api";

const PRICE_MULTIPLIER = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_WEEKS_MS = DAY_MS * 14;
const MAX_HISTORY_DAYS = 90;
const DEFAULT_INITIAL_DEPOSIT = 10000;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseMaybeNumber = (value: unknown, fallback = NaN) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const normalized = value.replace(/[$,\s]/g, "");
    if (!normalized) return fallback;
    return toNumber(normalized, fallback);
  }
  return toNumber(value, fallback);
};

const priceUSD = (value: unknown) => toNumber(value) * PRICE_MULTIPLIER;

type TeamMetrics = {
  price: number;
  dayChangePercent: number;
  referencePrice: number;
};

export const parsePortfolioDate = (value?: string | null) => {
  if (!value) return new Date(NaN);

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const numericParts = value
    .split(/[^0-9]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
    .filter((num) => Number.isFinite(num));

  if (numericParts.length >= 3) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = numericParts;
    return new Date(year, month - 1, day, hour, minute, second);
  }

  return new Date(NaN);
};

const deriveTradesFromPositions = (positions: PortfolioPosition[] | undefined): PortfolioTrade[] =>
  (positions ?? []).map((position, index) => ({
    id: `position-${index}`,
    team_name: position.team_name,
    action: "buy",
    quantity: position.quantity,
    price: position.avg_buy_price ?? position.avg_price ?? "0",
    timestamp: position.last_transaction ?? "",
  }));

const computeTeamMetrics = (teams?: TeamMarketInformation[]) => {
  const grouped = new Map<string, Array<{ price: number; timestamp: number }>>();

  teams?.forEach((team) => {
    const timestamp = team.timestamp ? new Date(team.timestamp).getTime() : -Infinity;
    const price = priceUSD(team.value ?? team.price);
    const list = grouped.get(team.team_name) ?? [];
    list.push({ price, timestamp });
    grouped.set(team.team_name, list);
  });

  const metrics = new Map<string, TeamMetrics>();

  grouped.forEach((entries, teamName) => {
    const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
    const latest = sorted[sorted.length - 1];
    if (!latest) return;

    const threshold = latest.timestamp - DAY_MS;
    const reference =
      [...sorted]
        .reverse()
        .find((entry) => entry.timestamp <= threshold && entry.timestamp !== -Infinity) ||
      sorted[0];

    const dayChangePercent =
      reference && reference.price
        ? ((latest.price - reference.price) / reference.price) * 100
        : 0;

    metrics.set(teamName, {
      price: latest.price,
      dayChangePercent,
      referencePrice: reference?.price ?? latest.price,
    });
  });

  return metrics;
};

export type EnrichedHolding = {
  id: string;
  team: { name: string; abbreviation: string };
  quantity: number;
  avgCost: number;
  currentPrice: number;
  dayChangePercent: number;
  totalValue: number;
  totalCost: number;
};

export type PortfolioSnapshot = {
  holdings: EnrichedHolding[];
  cashBalance: number;
  totalValue: number;
  totalCost: number;
  totalUnrealizedPnL: number;
  initialDeposit: number;
  dayChangeValue: number;
  dayChangePercent: number;
  holdingsCount: number;
  chartPoints: { date: string; value: number; timestamp?: number }[];
  transactions: SnapshotTransaction[];
};

export type SnapshotTransaction = {
  id: string;
  date: string;
  type: "buy" | "sell";
  team: { name: string; abbreviation: string };
  shares: number;
  price: number;
  avgBuyPrice: number | null;
};

const normalizeTrades = (trades: PortfolioTrade[] | undefined) =>
  (trades ?? []).map((trade) => {
    const parsedDate = parsePortfolioDate(trade.timestamp);
    const timestampValue = parsedDate.getTime();
    const hasValidTimestamp = Number.isFinite(timestampValue);
    const avgBuyPriceNumber = trade.avg_buy_price ? toNumber(trade.avg_buy_price) : null;
    return {
      ...trade,
      priceNumber: toNumber(trade.price),
      avgBuyPriceNumber,
      timestampValue: hasValidTimestamp ? timestampValue : -Infinity,
    };
  });

const computeInitialDeposit = (
  cashBalance: number,
  trades: ReturnType<typeof normalizeTrades>,
) => {
  const netCashFlow = trades.reduce((sum, trade) => {
    const tradeValue = trade.priceNumber * trade.quantity;
    return sum + (trade.action === "sell" ? tradeValue : -tradeValue);
  }, 0);

  const initialDeposit = cashBalance - netCashFlow;
  return initialDeposit > 0 ? initialDeposit : 0;
};

const buildPortfolioHistory = (
  trades: ReturnType<typeof normalizeTrades>,
  holdings: EnrichedHolding[],
) => {
  const sorted = trades
    .slice()
    .filter((trade) => Number.isFinite(trade.timestampValue))
    .sort((a, b) => a.timestampValue - b.timestampValue);

  const history: { date: string; value: number; timestamp: number }[] = [];
  const positions = new Map<string, { quantity: number; lastPrice: number }>();

  const pushPoint = (timestamp: number) => {
    const holdingsValue = Array.from(positions.values()).reduce(
      (sum, position) => sum + position.quantity * position.lastPrice,
      0,
    );
    history.push({
      date: new Date(timestamp).toISOString(),
      timestamp,
      value: holdingsValue,
    });
  };

  const firstTimestamp = sorted[0]?.timestampValue;
  if (Number.isFinite(firstTimestamp)) {
    pushPoint((firstTimestamp as number) - 1);
  }

  sorted.forEach((trade) => {
    const existing = positions.get(trade.team_name) ?? {
      quantity: 0,
      lastPrice: trade.priceNumber,
    };

    if (trade.action === "buy") {
      existing.quantity += trade.quantity;
    } else {
      existing.quantity = Math.max(existing.quantity - trade.quantity, 0);
    }

    existing.lastPrice = trade.priceNumber;
    if (existing.quantity > 0) {
      positions.set(trade.team_name, existing);
    } else {
      positions.delete(trade.team_name);
    }

    pushPoint(trade.timestampValue);
  });

  const now = Date.now();
  const currentHoldingsValue = holdings.reduce((sum, holding) => sum + holding.totalValue, 0);
  history.push({
    date: new Date(now).toISOString(),
    timestamp: now,
    value: currentHoldingsValue,
  });

  return history;
};

const simulateTwoWeekHistory = (
  history: { date: string; value: number; timestamp: number }[],
  fallbackDeposit: number,
  finalHoldingsValue: number,
) => {
  const normalizedInitial =
    Number.isFinite(fallbackDeposit) && fallbackDeposit > 0 ? fallbackDeposit : DEFAULT_INITIAL_DEPOSIT;
  if (!history.length) {
    const now = Date.now();
    return [
      {
        date: new Date(now - TWO_WEEKS_MS).toISOString(),
        timestamp: now - TWO_WEEKS_MS,
        value: normalizedInitial,
      },
      {
        date: new Date(now).toISOString(),
        timestamp: now,
        value: finalHoldingsValue,
      },
    ];
  }

  const sortedHistory = history
    .slice()
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const latestTimestamp = sortedHistory[sortedHistory.length - 1]?.timestamp ?? Date.now();
  const startTimestamp = latestTimestamp - TWO_WEEKS_MS;

  if ((sortedHistory[0]?.timestamp ?? Infinity) > startTimestamp) {
    sortedHistory.unshift({
      date: new Date(startTimestamp).toISOString(),
      timestamp: startTimestamp,
      value: normalizedInitial,
    });
  }

  sortedHistory[sortedHistory.length - 1] = {
    date: new Date(latestTimestamp).toISOString(),
    timestamp: latestTimestamp,
    value: finalHoldingsValue,
  };

  const dailyPoints: typeof sortedHistory = [];
  let cursor = 1;
  let currentValue = sortedHistory[0].value;

  for (let ts = startTimestamp; ts <= latestTimestamp; ts += DAY_MS) {
    while (cursor < sortedHistory.length && (sortedHistory[cursor].timestamp ?? 0) <= ts) {
      currentValue = sortedHistory[cursor].value;
      dailyPoints.push(sortedHistory[cursor]);
      cursor += 1;
    }

    dailyPoints.push({
      date: new Date(ts).toISOString(),
      timestamp: ts,
      value: currentValue,
    });
  }

  if ((dailyPoints[dailyPoints.length - 1]?.timestamp ?? 0) < latestTimestamp) {
    dailyPoints.push({
      date: new Date(latestTimestamp).toISOString(),
      timestamp: latestTimestamp,
      value: finalHoldingsValue,
    });
  } else {
    dailyPoints[dailyPoints.length - 1] = {
      ...dailyPoints[dailyPoints.length - 1],
      value: finalHoldingsValue,
    };
  }

  const combined = [...dailyPoints]
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .reduce<typeof dailyPoints>((acc, point) => {
      const last = acc[acc.length - 1];
      if (!last || (last.timestamp ?? 0) !== (point.timestamp ?? 0)) {
        acc.push(point);
      } else {
        acc[acc.length - 1] = point;
      }
      return acc;
    }, []);

  return combined;
};

type PricePoint = { timestamp: number; price: number };

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const buildHoldingsPerformanceHistory = (
  trades: ReturnType<typeof normalizeTrades>,
  holdings: EnrichedHolding[],
  marketTeams: TeamMarketInformation[] | undefined,
) => {
  const relevantTeams = new Set<string>();
  holdings.forEach((holding) => relevantTeams.add(holding.team.name));
  trades.forEach((trade) => relevantTeams.add(trade.team_name));

  if (!relevantTeams.size) {
    return [];
  }

  const teamHistories = new Map<string, PricePoint[]>();
  marketTeams?.forEach((entry) => {
    if (!relevantTeams.has(entry.team_name)) return;
    const timestamp = parsePortfolioDate(entry.timestamp).getTime();
    if (!Number.isFinite(timestamp)) return;
    const price = priceUSD(entry.value ?? entry.price);
    if (!price || price < 0) return;
    const list = teamHistories.get(entry.team_name) ?? [];
    list.push({ timestamp, price });
    teamHistories.set(entry.team_name, list);
  });

  teamHistories.forEach((history, team) => {
    const sorted = history
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .reduce<PricePoint[]>((acc, point) => {
        const last = acc[acc.length - 1];
        if (!last || last.timestamp !== point.timestamp) {
          acc.push(point);
        } else {
          acc[acc.length - 1] = point;
        }
        return acc;
      }, [])
      .filter((point) => Number.isFinite(point.timestamp));

    if (sorted.length) {
      teamHistories.set(team, sorted);
    } else {
      teamHistories.delete(team);
    }
  });

  const sortedTrades = trades
    .slice()
    .filter((trade) => Number.isFinite(trade.timestampValue) && trade.timestampValue !== -Infinity)
    .sort((a, b) => a.timestampValue - b.timestampValue);

  const earliestPriceTimestamp = (() => {
    let minTs = Infinity;
    teamHistories.forEach((history) => {
      if (history.length) {
        minTs = Math.min(minTs, history[0].timestamp);
      }
    });
    return minTs;
  })();

  const latestPriceTimestamp = (() => {
    let maxTs = 0;
    teamHistories.forEach((history) => {
      if (history.length) {
        maxTs = Math.max(maxTs, history[history.length - 1].timestamp);
      }
    });
    return maxTs;
  })();

  const earliestTradeTimestamp = sortedTrades[0]?.timestampValue ?? Infinity;
  const earliestCandidate = Math.min(earliestPriceTimestamp, earliestTradeTimestamp);
  const now = Date.now();
  const endTimestamp = Math.max(
    latestPriceTimestamp,
    sortedTrades[sortedTrades.length - 1]?.timestampValue ?? 0,
    now,
  );

  const baseStart = Number.isFinite(earliestCandidate)
    ? earliestCandidate
    : endTimestamp - TWO_WEEKS_MS;
  const maxLookback = endTimestamp - MAX_HISTORY_DAYS * DAY_MS;
  const startTimestamp = startOfDay(Math.max(baseStart, maxLookback));

  const timelineSet = new Set<number>();
  for (let ts = startTimestamp; ts <= endTimestamp; ts += DAY_MS) {
    timelineSet.add(ts);
  }
  sortedTrades.forEach((trade) => timelineSet.add(trade.timestampValue));
  timelineSet.add(endTimestamp);

  const timeline = Array.from(timelineSet).sort((a, b) => a - b);
  if (!timeline.length) {
    return [];
  }

  const baselinePrices = new Map<string, number>();
  holdings.forEach((holding) => {
    const fallbackPrice =
      holding.currentPrice ||
      holding.avgCost ||
      (holding.quantity ? holding.totalValue / holding.quantity : 0);
    if (fallbackPrice > 0) {
      baselinePrices.set(holding.team.name, fallbackPrice);
    }
  });
  sortedTrades.forEach((trade) => {
    if (!baselinePrices.has(trade.team_name) && trade.priceNumber > 0) {
      baselinePrices.set(trade.team_name, trade.priceNumber);
    }
  });

  type PriceCursor = {
    history: PricePoint[];
    index: number;
    current: number;
    fallback: number;
  };

  const cursors = new Map<string, PriceCursor>();
  const ensureCursor = (team: string): PriceCursor => {
    if (!cursors.has(team)) {
      const history = teamHistories.get(team) ?? [];
      const fallback = baselinePrices.get(team) ?? 0;
      const initial = history[0]?.price ?? fallback;
      cursors.set(team, {
        history,
        index: 0,
        current: initial,
        fallback: initial || fallback,
      });
    }
    return cursors.get(team)!;
  };

  const resolvePrice = (team: string, timestamp: number) => {
    const cursor = ensureCursor(team);
    const { history } = cursor;
    if (!history.length) {
      return cursor.current || cursor.fallback;
    }

    if (timestamp < history[0].timestamp) {
      cursor.current = history[0].price ?? cursor.fallback;
      return cursor.current;
    }

    while (
      cursor.index + 1 < history.length &&
      history[cursor.index + 1].timestamp <= timestamp
    ) {
      cursor.index += 1;
      cursor.current = history[cursor.index]?.price ?? cursor.current;
    }

    cursor.current = history[cursor.index]?.price ?? cursor.current ?? cursor.fallback;
    return cursor.current;
  };

  const positions = new Map<string, number>();
  let tradeIndex = 0;

  const series: { date: string; value: number; timestamp: number }[] = [];

  for (const timestamp of timeline) {
    while (
      tradeIndex < sortedTrades.length &&
      sortedTrades[tradeIndex].timestampValue <= timestamp
    ) {
      const trade = sortedTrades[tradeIndex];
      const currentQty = positions.get(trade.team_name) ?? 0;

      if (trade.action === "buy") {
        positions.set(trade.team_name, currentQty + trade.quantity);
      } else {
        positions.set(trade.team_name, Math.max(currentQty - trade.quantity, 0));
      }
      tradeIndex += 1;
    }

    const holdingsValue = Array.from(positions.entries()).reduce((sum, [team, qty]) => {
      if (qty <= 0) return sum;
      const price = resolvePrice(team, timestamp);
      return sum + qty * price;
    }, 0);

    series.push({
      date: new Date(timestamp).toISOString(),
      timestamp,
      value: holdingsValue,
    });
  }

  const finalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.totalValue, 0);
  if (series.length) {
    series[series.length - 1] = {
      ...series[series.length - 1],
      value: finalHoldingsValue,
    };
  }

  return series.filter((point, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return prev.value !== point.value || prev.timestamp !== point.timestamp;
  });
};

type HistorySource = PortfolioLiveHistoryResponse | PortfolioLiveHistoryPoint[] | undefined;

export function buildPortfolioSnapshot(
  portfolio: PortfolioResponse | undefined,
  marketTeams: TeamMarketInformation[] | undefined,
  historySource?: HistorySource,
): PortfolioSnapshot {
  if (!portfolio) {
    return {
      holdings: [],
      cashBalance: 0,
      totalValue: 0,
      totalCost: 0,
      totalUnrealizedPnL: 0,
      dayChangeValue: 0,
      dayChangePercent: 0,
      holdingsCount: 0,
      initialDeposit: 0,
      chartPoints: [],
      transactions: [],
    };
  }

  const historyPoints = Array.isArray(historySource)
    ? historySource
    : historySource?.history ?? [];

  const historyInitialDeposit = Array.isArray(historySource)
    ? NaN
    : parseMaybeNumber(historySource?.initial_deposit, NaN);

  const parsedHistory =
    historyPoints
      ?.map((point) => {
        const timestamp = parsePortfolioDate(point.timestamp).getTime();
        const balance = toNumber(point.balance, NaN);
        return Number.isFinite(timestamp) && Number.isFinite(balance)
          ? { timestamp, balance }
          : null;
      })
      .filter((point): point is { timestamp: number; balance: number } => Boolean(point))
      .sort((a, b) => a.timestamp - b.timestamp) ?? [];

  const latestHistoryPoint = parsedHistory.at(-1);

  const reportedCashBalance = parseMaybeNumber(
    portfolio.balance ??
      portfolio.cash_balance ??
      (portfolio as { cashBalance?: unknown }).cashBalance,
    NaN,
  );
  const hasReportedCashBalance = Number.isFinite(reportedCashBalance);
  const baselineCashBalance = hasReportedCashBalance ? reportedCashBalance : 0;
  const metrics = computeTeamMetrics(marketTeams);
  const tradeSource =
    portfolio.trades && portfolio.trades.length > 0
      ? portfolio.trades
      : deriveTradesFromPositions(portfolio.positions);
  const trades = normalizeTrades(tradeSource);
  const reportedInitialDeposit = parseMaybeNumber(
    portfolio.initial_deposit ??
      (portfolio as { initialDeposit?: unknown }).initialDeposit,
    NaN,
  );

  const holdings: EnrichedHolding[] = portfolio.positions
    .filter((position) => position.quantity > 0)
    .map((position, index) => {
      const metric = metrics.get(position.team_name);
      const avgCost = toNumber(position.avg_buy_price ?? position.avg_price);
      const currentPrice = toNumber(position.current_price, metric?.price ?? avgCost);
      const totalValue = toNumber(
        position.position_value,
        currentPrice * position.quantity,
      );
      const totalCost = toNumber(position.cost_basis, avgCost * position.quantity);
      const unrealized = toNumber(
        position.unrealized_pnl,
        totalValue - totalCost,
      );
      const dayChangePercent =
        totalCost > 0
          ? (unrealized / totalCost) * 100
          : metric?.dayChangePercent ?? 0;

      return {
        id: `${position.team_name}-${index}`,
        team: {
          name: position.team_name,
          abbreviation: getTeamAbbreviation(position.team_name),
        },
        quantity: position.quantity,
        avgCost,
        currentPrice,
        dayChangePercent,
        totalValue,
        totalCost,
      };
    });

  const holdingsValue = holdings.reduce((sum, holding) => sum + holding.totalValue, 0);
  const totalCost = holdings.reduce((sum, holding) => sum + holding.totalCost, 0);
  let totalUnrealizedPnL = toNumber(
    portfolio.total_unrealized_pnl,
    holdings.reduce((sum, holding) => sum + (holding.totalValue - holding.totalCost), 0),
  );

  const historyBalance = latestHistoryPoint?.balance ?? NaN;
  const reportedAccountValue = toNumber(portfolio.total_value, NaN);

  let totalValue = Number.isFinite(historyBalance)
    ? historyBalance
    : Number.isFinite(reportedAccountValue)
      ? reportedAccountValue
      : holdingsValue + baselineCashBalance;

  let cashBalance = totalValue - holdingsValue;

  if (!Number.isFinite(cashBalance)) {
    cashBalance = baselineCashBalance;
    totalValue = holdingsValue + cashBalance;
  }

  if (cashBalance < 0 && Math.abs(cashBalance) < 0.01) {
    cashBalance = 0;
  }

  const derivedInitialDepositFromBalance =
    Number.isFinite(cashBalance) && Number.isFinite(totalCost)
      ? cashBalance + totalCost
      : NaN;
  const inferredInitialDeposit = computeInitialDeposit(
    Number.isFinite(cashBalance) ? cashBalance : baselineCashBalance,
    trades,
  );

  const initialDeposit =
    Number.isFinite(reportedInitialDeposit) && reportedInitialDeposit > 0
      ? reportedInitialDeposit
      : Number.isFinite(historyInitialDeposit) && historyInitialDeposit > 0
        ? historyInitialDeposit
        : Number.isFinite(derivedInitialDepositFromBalance) && derivedInitialDepositFromBalance > 0
          ? derivedInitialDepositFromBalance
          : inferredInitialDeposit > 0
            ? inferredInitialDeposit
            : DEFAULT_INITIAL_DEPOSIT;

  const latestBalanceForPnL = Number.isFinite(latestHistoryPoint?.balance)
    ? latestHistoryPoint!.balance
    : totalValue;
  totalUnrealizedPnL = Number.isFinite(latestBalanceForPnL)
    ? latestBalanceForPnL - initialDeposit
    : 0;

  const holdingsHistory = buildHoldingsPerformanceHistory(trades, holdings, marketTeams);
  const chartPoints =
    holdingsHistory.length > 1
      ? holdingsHistory
        : simulateTwoWeekHistory(
            buildPortfolioHistory(trades, holdings),
            initialDeposit,
            holdingsValue,
          );

  const now = Date.now();
  const latestPoint = chartPoints[chartPoints.length - 1];
  const latestTimestamp = latestPoint?.timestamp ?? now;
  const referenceThreshold = latestTimestamp - DAY_MS;
  const resolvedReferencePoint =
    [...chartPoints]
      .reverse()
      .find((point) => (point.timestamp ?? 0) <= referenceThreshold) ?? latestPoint;

  const referenceValue =
    resolvedReferencePoint && resolvedReferencePoint !== latestPoint
      ? resolvedReferencePoint.value
      : initialDeposit;

  const fallbackReference = Number.isFinite(referenceValue) ? referenceValue! : null;
  const fallbackDayChangeValue =
    latestPoint && fallbackReference !== null ? latestPoint.value - fallbackReference : 0;
  const fallbackDayChangePercent =
    fallbackReference !== null && fallbackReference !== 0
      ? (fallbackDayChangeValue / fallbackReference) * 100
      : 0;

  let dayChangeValue = fallbackDayChangeValue;
  let dayChangePercent = fallbackDayChangePercent;

  if (parsedHistory.length >= 2 && latestHistoryPoint) {
    const referenceHistoryPoint = [...parsedHistory]
      .reverse()
      .find((point) => point.timestamp <= latestHistoryPoint.timestamp - DAY_MS);

    if (referenceHistoryPoint) {
      dayChangeValue = latestHistoryPoint.balance - referenceHistoryPoint.balance;
      dayChangePercent =
        referenceHistoryPoint.balance !== 0
          ? (dayChangeValue / referenceHistoryPoint.balance) * 100
          : 0;
    } else if (initialDeposit !== 0) {
      dayChangeValue = latestHistoryPoint.balance - initialDeposit;
      dayChangePercent = (dayChangeValue / initialDeposit) * 100;
    }
  }

  const transactions: SnapshotTransaction[] = trades
    .slice()
    .sort((a, b) => b.timestampValue - a.timestampValue)
    .map((trade) => {
      const hasValidTimestamp =
        Number.isFinite(trade.timestampValue) && trade.timestampValue !== -Infinity;

      let isoDate: string;
      if (hasValidTimestamp) {
        isoDate = new Date(trade.timestampValue).toISOString();
      } else {
        const fallbackDate = parsePortfolioDate(trade.timestamp);
        isoDate = Number.isNaN(fallbackDate.getTime())
          ? new Date().toISOString()
          : fallbackDate.toISOString();
      }

      return {
        id: trade.id,
        date: isoDate,
        type: trade.action,
        team: {
          name: trade.team_name,
          abbreviation: getTeamAbbreviation(trade.team_name),
        },
        shares: trade.quantity,
        price: trade.priceNumber,
        avgBuyPrice: trade.avgBuyPriceNumber,
      };
    });

  return {
    holdings,
    cashBalance,
    totalValue,
    totalCost,
    totalUnrealizedPnL,
    initialDeposit,
    dayChangeValue,
    dayChangePercent,
    holdingsCount: holdings.length,
    chartPoints,
    transactions,
  };
}
