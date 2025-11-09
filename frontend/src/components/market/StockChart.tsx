"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { cn } from "@/lib/utils";
import {
  ChartRange,
  CHART_RANGE_SEQUENCE,
  getRangeLabel,
} from "@/lib/chart-range";

interface DataPoint {
  time: string;
  price: number;
  timestamp?: number | null;
}

interface StockChartProps {
  teamName: string;
  data: DataPoint[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  price: number;
  weekChangePercent?: number | null;
  monthChangePercent?: number | null;
  priceDomain?: [number, number];
  rangeChangePercent?: number | null;
  allChangePercent?: number | null;
  onFocusPointChange?: (point: { price: number; timestamp?: number | null } | null) => void;
}

const CHART_MARGINS = { top: 20, right: 24, bottom: 24, left: 12 };
const DEFAULT_PRICE_DOMAIN: [number, number] = [0, 250];
const SHORT_TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const FULL_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

const formatTickLabel = (range: ChartRange, timestamp?: number | null) => {
  if (!Number.isFinite(timestamp ?? NaN)) return "";
  const date = new Date(timestamp!);
  switch (range) {
    case "1MIN":
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    case "5MIN":
    case "1H":
    case "1D":
      return date.toLocaleTimeString(undefined, SHORT_TIME);
    case "1W":
      return date.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit" });
    case "ALL":
    default:
      return date.toLocaleDateString(undefined, FULL_DATE);
  }
};

const formatDisplayTimestamp = (range: ChartRange, timestamp?: number | null, fallback?: string) => {
  if (!Number.isFinite(timestamp ?? NaN)) return fallback ?? "—";
  const date = new Date(timestamp!);
  if (range === "1MIN") {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (range === "5MIN" || range === "1H" || range === "1D") {
    return date.toLocaleTimeString(undefined, SHORT_TIME);
  }
  if (range === "1W") {
    return date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatPrice = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  }).format(v);

const formatPercent = (v?: number | null) => {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  return `${sign}${Math.abs(v).toFixed(2)}%`;
};

export default function StockChart({
  teamName,
  data,
  range,
  onRangeChange,
  price,
  weekChangePercent,
  monthChangePercent,
  priceDomain,
  rangeChangePercent,
  allChangePercent,
  onFocusPointChange,
}: StockChartProps) {
  const gradientId = useMemo(
    () => `grad-${Math.random().toString(36).slice(2)}`,
    []
  );
  const [active, setActive] = useState<DataPoint | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DataPoint | null>(null);
  const [dragEnd, setDragEnd] = useState<DataPoint | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  const latest = data.at(-1);
  const display = active ?? latest;
  const priceFlash = usePriceFlash(price);
  const timeFlash = usePriceFlash(display?.timestamp ?? 0);
  const weekFlash = usePriceFlash(weekChangePercent ?? 0);
  const monthFlash = usePriceFlash(monthChangePercent ?? 0);

  const latestIndex = data.length - 1;
  const latestPoint = latestIndex >= 0 ? data[latestIndex] : null;
  const formatPointPrice = (point?: DataPoint | null) => (point ? formatPrice(point.price) : null);
  const formatPointTime = (point?: DataPoint | null) =>
    point ? formatDisplayTimestamp(range, point.timestamp ?? null, point.time) : null;
  const latestPriceLabel = formatPointPrice(latestPoint);
  const latestTimeLabel = formatPointTime(latestPoint);

  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const obs = new ResizeObserver(([entry]) =>
      setChartSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [isDragging]);

  const domain = useMemo(() => {
    if (priceDomain) return priceDomain;
    if (!data.length) return DEFAULT_PRICE_DOMAIN;
    const prices = data.map((point) => point.price).filter((price) => Number.isFinite(price));
    if (!prices.length) return DEFAULT_PRICE_DOMAIN;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return DEFAULT_PRICE_DOMAIN;
    const padding = Math.max((max - min || max || 1) * 0.1, 1);
    const lower = Math.max(0, min - padding);
    const upper = max + padding;
    if (lower === upper) {
      return [Math.max(0, lower - 1), upper + 1];
    }
    return [lower, upper] as [number, number];
  }, [priceDomain, data]);
  const displayPrice = display?.price ?? price;
  const formatPointLabel = (point?: DataPoint | null) =>
    point ? formatDisplayTimestamp(range, point.timestamp ?? null, point.time) : "—";
  const displayTime = formatPointLabel(display);

  const selection = useMemo(() => {
    if (!dragStart || !dragEnd || !hasDragged) return null;
    const i1 = data.findIndex(
      (d) => d.timestamp === dragStart.timestamp && d.price === dragStart.price,
    );
    const i2 = data.findIndex(
      (d) => d.timestamp === dragEnd.timestamp && d.price === dragEnd.price,
    );
    if (i1 === -1 || i2 === -1 || i1 === i2) return null;
    const [minI, maxI] = i1 < i2 ? [i1, i2] : [i2, i1];
    return { start: data[minI], end: data[maxI] };
  }, [dragStart, dragEnd, hasDragged, data]);

  const selectionDiff = useMemo(() => {
    if (!selection) return null;
    const change = selection.end.price - selection.start.price;
    const pct = (change / selection.start.price) * 100;
    return { change, pct };
  }, [selection]);

  const handleMouseMove = (e: any) => {
    const pt = e?.activePayload?.[0]?.payload as DataPoint | undefined;
    if (!pt) return;
    setActive(pt);
    if (isDragging && dragStart) {
      if (pt.timestamp !== dragStart.timestamp) setHasDragged(true);
      setDragEnd(pt);
    }
  };

  const handleMouseDown = (e: any) => {
    const pt = e?.activePayload?.[0]?.payload as DataPoint | undefined;
    if (!pt) return;
    setDragging(true);
    setHasDragged(false);
    setDragStart(pt);
    setDragEnd(pt);
  };

  const handleMouseUp = () => setDragging(false);
  const handleMouseLeave = () => {
    setActive(null);
    setDragging(false);
  };

  useEffect(() => {
    const overlayPoint = active && !isDragging ? active : latestPoint;
    if (!onFocusPointChange) return;
    if (overlayPoint) {
      onFocusPointChange({
        price: overlayPoint.price,
        timestamp: overlayPoint.timestamp ?? null,
      });
    } else if (latestPoint) {
      onFocusPointChange({
        price: latestPoint.price,
        timestamp: latestPoint.timestamp ?? null,
      });
    } else {
      onFocusPointChange(null);
    }
  }, [active, isDragging, latestPoint, onFocusPointChange]);

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{teamName}</p>
            <div className="flex items-baseline gap-3">
              <span className={`text-4xl font-semibold tracking-tight ${priceFlash}`}>
                {formatPrice(displayPrice)}
              </span>
            </div>
            <div className={`text-xs text-muted-foreground ${timeFlash}`}>
              Updated {displayTime}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-right sm:text-left sm:flex sm:flex-wrap">
            {[
              {
                label: "1W",
                value: weekChangePercent,
                flash: weekFlash,
              },
              {
                label: "1M",
                value: monthChangePercent,
                flash: monthFlash,
              },
              {
                label: "Change",
                value: rangeChangePercent,
              },
              {
                label: "All-time",
                value: allChangePercent,
              },
            ].map(({ label, value, flash }) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    "font-medium",
                    (value ?? 0) >= 0 ? "text-success" : "text-destructive",
                    flash,
                  )}
                >
                  {formatPercent(value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Range buttons */}
        <div className="flex gap-2">
          {CHART_RANGE_SEQUENCE.map((tf) => (
            <Button
              key={tf}
              variant={range === tf ? "default" : "ghost"}
              size="sm"
              onClick={() => onRangeChange(tf)}
            >
              {getRangeLabel(tf)}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <div ref={chartRef} className="relative h-80 select-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={CHART_MARGINS}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="10%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="90%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatTickLabel(range, value)}
                minTickGap={16}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(v) => formatPrice(v).replace("$", "")}
                tickLine={false}
                axisLine={false}
                domain={domain}
                width={60}
              />
              <Tooltip content={() => null} />

              <Area
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />

              {/* Custom overlay */}
              <Customized
                component={
                  ((props: any) => {
                    const { xAxisMap, yAxisMap } = props;
                    if (!xAxisMap || !data.length) return null;

                    const xAxis = xAxisMap[Object.keys(xAxisMap)[0]];
                    const yAxis = yAxisMap
                      ? yAxisMap[Object.keys(yAxisMap)[0]]
                      : null;
                    if (!xAxis) return null;

                    const scaleX = xAxis.scale;
                    const scaleY = yAxis?.scale;
                    const getX = (ts?: number | null, fallbackIndex = 0) => scaleX(ts ?? fallbackIndex);
                    const getY = (p: number) => (scaleY ? scaleY(p) : 0);
                    const findPointIndex = (point?: DataPoint | null) => {
                      if (!point) return -1;
                      return data.findIndex(
                        (d) => d.timestamp === point.timestamp && d.price === point.price,
                      );
                    };
                    const resolveX = (point?: DataPoint | null) => {
                      if (!point) return null;
                      const idx = findPointIndex(point);
                      const fallbackIndex = idx === -1 ? data.length - 1 : idx;
                      return getX(point.timestamp, fallbackIndex);
                    };

                    const elems: ReactNode[] = [];

                    if (selection && hasDragged) {
                      const startX = resolveX(selection.start);
                      const endX = resolveX(selection.end);
                      if (startX != null && endX != null) {
                        const w = Math.abs(endX - startX);
                        if (w > 3) {
                          elems.push(
                            <rect
                              key="selection"
                              x={Math.min(startX, endX)}
                              y={CHART_MARGINS.top}
                              width={w}
                              height={
                                chartSize.height -
                                CHART_MARGINS.top -
                                CHART_MARGINS.bottom
                              }
                              fill="rgba(255,255,255,0.08)"
                            />
                          );
                        }
                      }
                    }

                    if (active?.timestamp != null && !isDragging) {
                      const activeX = resolveX(active);
                      if (activeX != null) {
                        const y = getY(active.price);
                        elems.push(
                          <line
                            key="cross-v"
                            x1={activeX}
                            x2={activeX}
                            y1={CHART_MARGINS.top}
                            y2={chartSize.height - CHART_MARGINS.bottom}
                            stroke="rgba(255,255,255,0.6)"
                            strokeDasharray="2 2"
                          />,
                          <line
                            key="cross-h"
                            x1={CHART_MARGINS.left}
                            x2={chartSize.width - CHART_MARGINS.right}
                            y1={y}
                            y2={y}
                            stroke="rgba(255,255,255,0.4)"
                            strokeDasharray="2 2"
                          />
                        );
                      }
                    }

                    const overlayPoint = active && !isDragging ? active : latestPoint;
                    const overlayX = resolveX(overlayPoint);

                    if (overlayPoint && overlayX != null && scaleY) {
                      const overlayPrice = formatPointPrice(overlayPoint) ?? latestPriceLabel;
                      const overlayTime = formatPointTime(overlayPoint) ?? latestTimeLabel;
                      const overlayY = getY(overlayPoint.price);
                      const priceLabelWidth = Math.max((overlayPrice?.length ?? 0) * 8 + 16, 72);
                      const priceLabelHeight = 22;
                      const priceLabelX = CHART_MARGINS.left;
                      const priceLabelY = Math.min(
                        Math.max(overlayY - priceLabelHeight / 2, CHART_MARGINS.top),
                        chartSize.height - CHART_MARGINS.bottom - priceLabelHeight,
                      );
                      const accentColor = overlayPoint === latestPoint ? "rgba(125,211,252,0.6)" : "rgba(56,189,248,0.85)";

                      elems.push(
                        <line
                          key="overlay-price-line"
                          x1={CHART_MARGINS.left}
                          x2={chartSize.width - CHART_MARGINS.right}
                          y1={overlayY}
                          y2={overlayY}
                          stroke={accentColor}
                          strokeDasharray="4 4"
                        />,
                        <g key="overlay-price-label">
                          <rect
                            x={priceLabelX}
                            y={priceLabelY}
                            width={priceLabelWidth}
                            height={priceLabelHeight}
                            rx={6}
                            fill="rgba(15,23,42,0.9)"
                            stroke={accentColor}
                          />
                          <text
                            x={priceLabelX + priceLabelWidth / 2}
                            y={priceLabelY + priceLabelHeight / 2 + 4}
                            fill="#e2e8f0"
                            textAnchor="middle"
                            fontSize="12"
                            fontFamily="var(--font-mono, monospace)"
                          >
                            {overlayPrice}
                          </text>
                        </g>
                      );

                      if (overlayTime) {
                        const timeLabelWidth = Math.max(overlayTime.length * 7 + 20, 90);
                        const timeLabelHeight = 20;
                        const timeLabelX = Math.min(
                          Math.max(overlayX - timeLabelWidth / 2, CHART_MARGINS.left),
                          chartSize.width - CHART_MARGINS.right - timeLabelWidth,
                        );
                        const timeLabelY = chartSize.height - CHART_MARGINS.bottom + 6;

                        elems.push(
                          <line
                            key="overlay-time-line"
                            x1={overlayX}
                            x2={overlayX}
                            y1={CHART_MARGINS.top}
                            y2={chartSize.height - CHART_MARGINS.bottom}
                            stroke={accentColor}
                            strokeDasharray="4 4"
                          />,
                          <g key="overlay-time-label">
                            <rect
                              x={timeLabelX}
                              y={timeLabelY}
                              width={timeLabelWidth}
                              height={timeLabelHeight}
                              rx={6}
                              fill="rgba(15,23,42,0.9)"
                              stroke={accentColor}
                            />
                            <text
                              x={timeLabelX + timeLabelWidth / 2}
                              y={timeLabelY + timeLabelHeight / 2 + 4}
                              fill="#e2e8f0"
                              textAnchor="middle"
                              fontSize="11"
                              fontFamily="var(--font-mono, monospace)"
                            >
                              {overlayTime}
                            </text>
                          </g>
                        );
                      }
                    }

                    return <g>{elems}</g>;
                  }) as React.FC<any>
                }
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Selection Info */}
          {selection && selectionDiff && (
            <div className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center gap-3 rounded-lg border bg-background/95 px-3 py-1 text-sm shadow-lg">
              <span
                className={`font-semibold ${
                  selectionDiff.change >= 0
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {`${selectionDiff.change >= 0 ? "+" : ""}${formatPrice(
                  Math.abs(selectionDiff.change)
                )}`}{" "}
                ({formatPercent(selectionDiff.pct)})
              </span>
              <span className="text-xs text-muted-foreground">
                {formatPointLabel(selection.start)} → {formatPointLabel(selection.end)}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setDragStart(null);
                  setDragEnd(null);
                  setHasDragged(false);
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
