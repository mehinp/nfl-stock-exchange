import { useQuery } from "@tanstack/react-query";
import {
  authSession,
  fetchPortfolioHistory,
  PortfolioValueHistory,
} from "@/lib/api";

export function usePortfolioValueHistory() {
  const token = authSession.getToken();

  return useQuery<PortfolioValueHistory>({
    queryKey: ["portfolio-value-history", token],
    queryFn: fetchPortfolioHistory,
    enabled: !!token,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
