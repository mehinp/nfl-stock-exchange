import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import StockChart, { ChartRange } from "@/components/market/StockChart";
import { useTeams } from "@/hooks/useTeams";
import { getTeamAbbreviation, getTeamDivision } from "@/lib/utils";
import { findTeamMetadata } from "@/data/team-metadata";
import { fetchTeamHistory } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TeamLogo from "@/components/shared/TeamLogo";
import { formatCurrency, formatNumber, formatRange } from "@/lib/number-format";
import { useTrade } from "@/hooks/usePortfolio";
import { useToast } from "@/hooks/use-toast";

type RangeStats = { low: number; high: number };

type NormalizedTeam = {
  id: string;
  name: string;
  abbreviation: string;
  price: number;
  value?: number;
  volume?: number;
  division: string;
  timestamp?: string;
  changePercent?: number | null;
  weekChangePercent?: number | null;
  monthChangePercent?: number | null;
  weekRange?: RangeStats | null;
  monthRange?: RangeStats | null;
};

const PRICE_MULTIPLIER = 1;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = WEEK_MS * 4;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const priceUSD = (value: unknown) => toNumber(value) * PRICE_MULTIPLIER;
const PLACEHOLDER = "\u2014";

export default function Market() {
  const [location] = useLocation();
  const { data: teams, isLoading, isError, error } = useTeams();
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>("1W");
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState(1);
  const [pendingAction, setPendingAction] = useState<"buy" | "sell" | null>(null);
  const tradeMutation = useTrade();
  const { toast } = useToast();

  const normalizedTeams = useMemo<NormalizedTeam[]>(() => {
    if (!teams) return [];

    const grouped = new Map<
      string,
      Array<
        (typeof teams)[number] & {
          timestampValue: number;
        }
      >
    >();

    teams.forEach((team) => {
      const list = grouped.get(team.team_name) ?? [];
      list.push({
        ...team,
        timestampValue: team.timestamp ? new Date(team.timestamp).getTime() : -Infinity,
      });
      grouped.set(team.team_name, list);
    });

    const computeRange = (
      entries: Array<(typeof teams)[number] & { timestampValue: number }>,
    ) => {
      if (!entries.length) return null;
      const prices = entries.map((entry) => priceUSD(entry.value ?? entry.price));
      return {
        low: Math.min(...prices),
        high: Math.max(...prices),
      };
    };

    const changeFrom = (
      currentPrice: number,
      reference?: (typeof teams)[number] & { timestampValue: number } | null,
    ) => {
      if (!reference) return null;
      const refPrice = priceUSD(reference.value ?? reference.price);
      if (!refPrice) return null;
      return ((currentPrice - refPrice) / refPrice) * 100;
    };

    const referenceFor = (
      sorted: Array<(typeof teams)[number] & { timestampValue: number }>,
      windowMs: number,
      latestTs: number,
    ) => {
      const threshold = latestTs - windowMs;
      return (
        [...sorted]
          .reverse()
          .find(
            (entry) =>
              entry.timestampValue <= threshold && entry.timestampValue !== -Infinity,
          ) || sorted[0]
      );
    };

    return Array.from(grouped.entries())
      .map(([name, entries], index) => {
        const sorted = entries.sort((a, b) => a.timestampValue - b.timestampValue);
        const latest = sorted[sorted.length - 1];
        const previous = sorted[sorted.length - 2];
        const latestTs = latest?.timestampValue ?? Date.now();

        const baseValue = latest?.value ?? latest?.price;
        const price = priceUSD(baseValue);
        const weekRef = referenceFor(sorted, WEEK_MS, latestTs);
        const monthRef = referenceFor(sorted, MONTH_MS, latestTs);
        const weekEntries = sorted.filter((entry) => entry.timestampValue >= latestTs - WEEK_MS);
        const monthEntries = sorted.filter(
          (entry) => entry.timestampValue >= latestTs - MONTH_MS,
        );

        return {
          id: `${name}-${latest?.timestamp ?? index}`,
          name,
          abbreviation: getTeamAbbreviation(name),
          price,
          value: toOptionalNumber(latest?.value),
          volume: toOptionalNumber(latest?.volume),
          division: getTeamDivision(name),
          timestamp: latest?.timestamp,
          changePercent: changeFrom(price, previous),
          weekChangePercent: changeFrom(price, weekRef),
          monthChangePercent: changeFrom(price, monthRef),
          weekRange: computeRange(weekEntries),
          monthRange: computeRange(monthEntries),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams]);

  useEffect(() => {
    if (!selectedTeamName && normalizedTeams.length > 0) {
      setSelectedTeamName(normalizedTeams[0].name);
    }
  }, [normalizedTeams, selectedTeamName]);

  useEffect(() => {
    if (typeof window === "undefined" || !normalizedTeams.length) return;
    const params = new URLSearchParams(window.location.search);
    const requestedTeam = params.get("team");
    if (!requestedTeam) return;

    const normalizedQuery = requestedTeam.toLowerCase();
    const match = normalizedTeams.find((team) => {
      if (team.name.toLowerCase() === normalizedQuery) return true;
      const city = findTeamMetadata(team.name)?.city?.toLowerCase();
      return city === normalizedQuery;
    });

    if (match && match.name !== selectedTeamName) {
      setSelectedTeamName(match.name);
    }
  }, [location, normalizedTeams, selectedTeamName]);

  const selectedTeam = useMemo(
    () => normalizedTeams.find((team) => team.name === selectedTeamName) ?? null,
    [normalizedTeams, selectedTeamName],
  );

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["team-history", selectedTeam?.name],
    queryFn: () => fetchTeamHistory(selectedTeam!.name),
    enabled: Boolean(selectedTeam?.name),
    staleTime: 15000,
  });

  const chartData = useMemo(() => {
    if (!historyData || historyData.length === 0) {
      if (!selectedTeam) return [];
      return [
        {
          time: new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          price: selectedTeam.price,
          timestamp: Date.now(),
        },
      ];
    }

    const points = historyData
      .slice()
      .sort(
        (a, b) =>
          new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime(),
      )
      .map((entry) => {
        const entryDate = entry.timestamp ? new Date(entry.timestamp) : null;
        const pointPrice = priceUSD(entry.value ?? entry.price);
        return {
          time:
            entryDate && !Number.isNaN(entryDate.getTime())
              ? entryDate.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : PLACEHOLDER,
          price: pointPrice,
          timestamp: entryDate?.getTime() ?? null,
        };
      });

    const latestTs = points[points.length - 1]?.timestamp ?? Date.now();
    const firstNonZeroIndex = points.findIndex((point) => point.price > 0);
    const trimmedPoints =
      firstNonZeroIndex > 0 ? points.slice(firstNonZeroIndex) : points;

    const threshold =
      chartRange === "ALL"
        ? null
        : chartRange === "1W"
          ? latestTs - WEEK_MS
          : latestTs - MONTH_MS;
    const filtered = threshold
      ? trimmedPoints.filter(
          (point) => point.timestamp === null || point.timestamp >= threshold,
        )
      : trimmedPoints;
    return filtered.length ? filtered : points.slice(-1);
  }, [historyData, selectedTeam, chartRange]);

  const handleQuantityChange = (value: number) => {
    setQuantity(Math.max(1, Number.isFinite(value) ? value : 1));
  };

  const handleTradeSubmit = (action: "buy" | "sell") => {
    if (!selectedTeam) return;
    const teamName = selectedTeam.name;
    const toastLabel = selectedTeam.name;
    const currentQuantity = quantity;

    setPendingAction(action);
    tradeMutation.mutate(
      {
        action,
        teamName,
        quantity: currentQuantity,
      },
      {
        onSuccess: (data) => {
          toast({
            title: "Trade executed",
            description: `${action === "buy" ? "Bought" : "Sold"} ${currentQuantity} ${currentQuantity === 1 ? "share" : "shares"} of ${toastLabel} @ $${Number(data.price).toFixed(2)}`,
          });
        },
        onError: (err: unknown) => {
          toast({
            title: "Trade failed",
            description: err instanceof Error ? err.message : "Unable to complete trade.",
            variant: "destructive",
          });
        },
        onSettled: () => {
          setPendingAction(null);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Market</h1>
            <p className="text-muted-foreground">
              Browse and trade NFL team stocks powered by real-time data.
            </p>
          </div>

          {isError && (
            <Card className="p-4 border-destructive/50 bg-destructive/10 text-destructive">
              Unable to load team data: {(error as Error)?.message ?? "Unknown error"}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-sm">
                  <Label htmlFor="team-select" className="mb-2 inline-block">
                    Select Ticker
                  </Label>
                  <Select
                    value={selectedTeamName ?? undefined}
                    onValueChange={(value) => setSelectedTeamName(value)}
                    disabled={!normalizedTeams.length}
                  >
                    <SelectTrigger id="team-select">
                      <SelectValue placeholder="Choose a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {normalizedTeams.map((team) => (
                        <SelectItem key={team.id} value={team.name}>
                          {team.abbreviation} &mdash; {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTeam && (
                  <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3">
                    <TeamLogo
                      teamName={selectedTeam.name}
                      abbreviation={selectedTeam.abbreviation}
                      size="md"
                    />
                    <div>
                      <p className="text-sm font-semibold">{selectedTeam.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedTeam.division}</p>
                    </div>
                  </div>
                )}
              </div>

              {selectedTeam ? (
                isHistoryLoading ? (
                  <Skeleton className="h-96 w-full" />
                ) : (
                  <StockChart
                    teamName={selectedTeam.name}
                    data={chartData}
                    range={chartRange}
                    onRangeChange={setChartRange}
                    price={selectedTeam.price}
                    weekChangePercent={selectedTeam.weekChangePercent}
                    monthChangePercent={selectedTeam.monthChangePercent}
                  />
                )
              ) : (
                <Card className="p-6 h-96 flex items-center justify-center text-muted-foreground">
                  Select a team to view its price history.
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Order Ticket</p>
                    <p className="text-lg font-semibold">
                      {selectedTeam ? selectedTeam.abbreviation : "Select a team"}
                    </p>
                  </div>
                  {selectedTeam && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase">Last Price</p>
                      <p className="text-xl font-semibold">
                        {formatCurrency(selectedTeam.price)}
                      </p>
                    </div>
                  )}
                </div>

                <Tabs
                  value={orderType}
                  onValueChange={(value) => setOrderType(value as "buy" | "sell")}
                  className="mt-4"
                >
                  <TabsList className="grid grid-cols-2">
                    <TabsTrigger value="buy">Buy</TabsTrigger>
                    <TabsTrigger value="sell">Sell</TabsTrigger>
                  </TabsList>
                  <TabsContent value="buy">
                    <OrderForm
                      type="buy"
                      quantity={quantity}
                      onQuantityChange={handleQuantityChange}
                      onSubmit={() => handleTradeSubmit("buy")}
                      totalLabel={formatCurrency(
                        selectedTeam ? selectedTeam.price * quantity : 0,
                      )}
                      disabled={!selectedTeam}
                      isSubmitting={pendingAction === "buy" && tradeMutation.isPending}
                    />
                  </TabsContent>
                  <TabsContent value="sell">
                    <OrderForm
                      type="sell"
                      quantity={quantity}
                      onQuantityChange={handleQuantityChange}
                      onSubmit={() => handleTradeSubmit("sell")}
                      totalLabel={formatCurrency(
                        selectedTeam ? selectedTeam.price * quantity : 0,
                      )}
                      disabled={!selectedTeam}
                      isSubmitting={pendingAction === "sell" && tradeMutation.isPending}
                    />
                  </TabsContent>
                </Tabs>
              </Card>

              {selectedTeam && (
                <Card className="p-4">
                  <div className="space-y-3 text-sm">
                    <StatRow
                      label="All-time Change"
                      value={formatPercent(selectedTeam.changePercent)}
                      intent={
                        (selectedTeam.changePercent ?? 0) >= 0 ? "positive" : "negative"
                      }
                    />
                    <StatRow
                      label="1W Change"
                      value={formatPercent(selectedTeam.weekChangePercent)}
                      intent={
                        (selectedTeam.weekChangePercent ?? 0) >= 0
                          ? "positive"
                          : "negative"
                      }
                    />
                    <StatRow
                      label="1M Change"
                      value={formatPercent(selectedTeam.monthChangePercent)}
                      intent={
                        (selectedTeam.monthChangePercent ?? 0) >= 0
                          ? "positive"
                          : "negative"
                      }
                    />
                    <StatRow
                      label="1W Range"
                      value={
                        selectedTeam.weekRange
                          ? formatRange(
                              selectedTeam.weekRange.low,
                              selectedTeam.weekRange.high,
                              (val) => formatCurrency(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            )
                          : PLACEHOLDER
                      }
                    />
                    <StatRow
                      label="1M Range"
                      value={
                        selectedTeam.monthRange
                          ? formatRange(
                              selectedTeam.monthRange.low,
                              selectedTeam.monthRange.high,
                              (val) => formatCurrency(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            )
                          : PLACEHOLDER
                      }
                    />
                    <StatRow
                      label="Volume"
                      value={formatNumber(selectedTeam.volume, {
                        maximumFractionDigits: 0,
                      })}
                    />
                    <StatRow
                      label="Updated"
                      value={
                        selectedTeam.timestamp
                          ? new Date(selectedTeam.timestamp).toLocaleString()
                          : PLACEHOLDER
                      }
                    />
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatRow({
  label,
  value,
  intent = "neutral",
}: {
  label: string;
  value: string;
  intent?: "neutral" | "positive" | "negative";
}) {
  const valueClass =
    intent === "positive"
      ? "text-success"
      : intent === "negative"
        ? "text-destructive"
        : "text-foreground";

  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return PLACEHOLDER;
  const formatted = Math.abs(value).toFixed(2);
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatted}%`;
}

interface OrderFormProps {
  type: "buy" | "sell";
  quantity: number;
  onQuantityChange: (value: number) => void;
  onSubmit: () => void;
  totalLabel: string;
  disabled?: boolean;
  isSubmitting?: boolean;
}

function OrderForm({
  type,
  quantity,
  onQuantityChange,
  onSubmit,
  totalLabel,
  disabled,
  isSubmitting,
}: OrderFormProps) {
  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSubmit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${type}-quantity`}>Quantity</Label>
        <Input
          id={`${type}-quantity`}
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => onQuantityChange(Math.max(1, Number(event.target.value) || 1))}
          className="font-mono"
        />
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estimated total</span>
          <span className="font-mono">{totalLabel}</span>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={disabled || isSubmitting}>
        {isSubmitting
          ? "Submitting..."
          : type === "buy"
            ? "Place Buy Order"
            : "Place Sell Order"}
      </Button>
    </form>
  );
}
