import { useQuery, useMutation } from "@tanstack/react-query";
import { executeTrade, fetchPortfolio } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
  });
}

type TradeInput = {
  action: "buy" | "sell";
  teamName: string;
  quantity: number;
};

export function useTrade() {
  return useMutation({
    mutationFn: ({ action, teamName, quantity }: TradeInput) =>
      executeTrade(action, {
        team_name: teamName,
        quantity,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
}
