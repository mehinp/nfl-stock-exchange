import { useLocation } from "wouter";
import { findTeamMetadata } from "@/data/team-metadata";

export function useMarketNavigation() {
  const [, navigate] = useLocation();

  return (teamName: string | null | undefined) => {
    if (!teamName) return;
    const meta = findTeamMetadata(teamName);
    const target = meta?.city ?? teamName;

    navigate(`/market?=${encodeURIComponent(target)}`);
  };
}
