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

export type ChartRange = "1W" | "1M" | "ALL";

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
}

const RANGES: ChartRange[] = ["1W", "1M", "ALL"];
const CHART_MARGINS = { top: 20, right: 24, bottom: 24, left: 12 };
const DEFAULT_PRICE_DOMAIN: [number, number] = [0, 250];

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

  const domain = priceDomain ?? DEFAULT_PRICE_DOMAIN;
  const latest = data.at(-1);
  const display = active ?? latest;
  const displayPrice = display?.price ?? price;
  const displayTime = display?.time ?? "—";

  const selection = useMemo(() => {
    if (!dragStart || !dragEnd || !hasDragged) return null;
    const i1 = data.findIndex((d) => d.time === dragStart.time);
    const i2 = data.findIndex((d) => d.time === dragEnd.time);
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
      if (pt.time !== dragStart.time) setHasDragged(true);
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

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{teamName}</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tracking-tight">
                {formatPrice(displayPrice)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Updated {displayTime}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                1W
              </p>
              <p
                className={`font-medium ${
                  (weekChangePercent ?? 0) >= 0
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {formatPercent(weekChangePercent)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                1M
              </p>
              <p
                className={`font-medium ${
                  (monthChangePercent ?? 0) >= 0
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {formatPercent(monthChangePercent)}
              </p>
            </div>
          </div>
        </div>

        {/* Range buttons */}
        <div className="flex gap-2">
          {RANGES.map((tf) => (
            <Button
              key={tf}
              variant={range === tf ? "default" : "ghost"}
              size="sm"
              onClick={() => onRangeChange(tf)}
            >
              {tf}
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
                dataKey="time"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
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
                    const getX = (t: string) => scaleX(t);
                    const getY = (p: number) => (scaleY ? scaleY(p) : 0);

                    const elems: ReactNode[] = [];

                    // Selection shading
                    if (selection && hasDragged) {
                      const x1 = getX(selection.start.time);
                      const x2 = getX(selection.end.time);
                      const w = Math.abs(x2 - x1);
                      if (w > 3) {
                        elems.push(
                          <rect
                            key="selection"
                            x={Math.min(x1, x2)}
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

                    // Crosshair
                    if (active?.time && !isDragging) {
                      const x = getX(active.time);
                      const y = getY(active.price);
                      elems.push(
                        <line
                          key="cross-v"
                          x1={x}
                          x2={x}
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
                {selection.start.time} → {selection.end.time}
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
