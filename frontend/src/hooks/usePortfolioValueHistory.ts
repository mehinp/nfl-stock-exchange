import { useQuery } from "@tanstack/react-query";
import {
  authSession,
  fetchPortfolioHistory,
  fetchPortfolioHistoryRecomputed,
  fetchPortfolioCurrentBalance,
  PortfolioLiveHistoryResponse,
  PortfolioRecomputedHistoryPoint,
} from "@/lib/api";

type HistoryLikePoint =
  | {
      timestamp?: string | null;
      balance?: string | number | null;
    }
  | (PortfolioRecomputedHistoryPoint & { balance?: string | number | null });

type NormalizedHistoryPoint = { timestamp: string; balance: string };

const normalizeHistoryPoints = (points: HistoryLikePoint[]): NormalizedHistoryPoint[] =>
  points
    .map<NormalizedHistoryPoint | null>((point) => {
      const timestamp = point.timestamp;
      if (!timestamp) return null;
      const balanceSource =
        point.balance ??
        (point as PortfolioRecomputedHistoryPoint).current_total_account_value ??
        (point as PortfolioRecomputedHistoryPoint).current_cash_balance ??
        null;
      if (balanceSource === null || balanceSource === undefined) return null;
      const balanceString =
        typeof balanceSource === "string" ? balanceSource : balanceSource.toString();
      if (!balanceString.trim()) return null;
      return { timestamp, balance: balanceString };
    })
    .filter((point): point is NormalizedHistoryPoint => Boolean(point))
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

async function fetchPortfolioHistoryWithVerification(): Promise<PortfolioLiveHistoryResponse> {
  const live = await fetchPortfolioHistory();
  let normalized = normalizeHistoryPoints(live.history ?? []);
  let userId = live.user_id;
  let derivedInitialDeposit = live.initial_deposit;
  let derivedCashBalance = live.current_cash_balance;
  let derivedAccountValue = live.current_total_account_value;

  if (!normalized.length) {
    const recomputed = await fetchPortfolioHistoryRecomputed();
    const recomputedSource: HistoryLikePoint[] =
      (recomputed.history ?? []).map((point) => ({
        timestamp: point.timestamp,
        balance:
          point.current_total_account_value ??
          point.current_cash_balance ??
          point.pnl ??
          null,
      })) ?? [];
    normalized = normalizeHistoryPoints(recomputedSource);
    userId = userId ?? recomputed.user_id;
    if (!derivedInitialDeposit) {
      derivedInitialDeposit = recomputed.history?.[0]?.initial_deposit;
    }
    if (!derivedCashBalance) {
      derivedCashBalance = recomputed.history?.at(-1)?.current_cash_balance;
    }
    if (!derivedAccountValue) {
      derivedAccountValue = recomputed.history?.at(-1)?.current_total_account_value;
    }
  }

  try {
    const current = await fetchPortfolioCurrentBalance();
    if (current?.timestamp && current?.balance) {
      const currentTs = new Date(current.timestamp).getTime();
      if (Number.isFinite(currentTs)) {
        const lastTs = normalized.length
          ? new Date(normalized[normalized.length - 1].timestamp).getTime()
          : -Infinity;
        if (!normalized.length || currentTs > lastTs) {
          normalized.push({
            timestamp: current.timestamp,
            balance: current.balance,
          });
        }
        derivedAccountValue = current.balance;
      }
    }
  } catch {
    // Ignore current snapshot errors and rely on whatever history we already collected.
  }

  const response: PortfolioLiveHistoryResponse = {
    user_id: userId ?? 0,
    history: normalized,
  };

  if (derivedInitialDeposit) {
    response.initial_deposit = derivedInitialDeposit;
  }

  if (derivedCashBalance) {
    response.current_cash_balance = derivedCashBalance;
  }

  if (derivedAccountValue) {
    response.current_total_account_value = derivedAccountValue;
  } else if (normalized.length) {
    response.current_total_account_value = normalized[normalized.length - 1].balance;
  }

  return response;
}

export function usePortfolioValueHistory() {
  const token = authSession.getToken();

  return useQuery<PortfolioLiveHistoryResponse>({
    queryKey: ["portfolio-value-history", token],
    queryFn: fetchPortfolioHistoryWithVerification,
    enabled: !!token,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    placeholderData: (previousData) => previousData,
  });
}
