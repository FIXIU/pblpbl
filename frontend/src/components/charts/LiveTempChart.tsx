"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { ChartDataPoint } from "@/hooks/useTelemetrySocket";
import { Activity, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LiveTempChartProps {
  data: ChartDataPoint[];
}

interface TooltipPayloadItem {
  color: string;
  name: string;
  value?: number;
  dataKey: string;
  unit?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-border bg-background/95 p-2.5 shadow-xl backdrop-blur-md text-xs font-mono">
        <div className="flex items-center gap-1.5 text-muted-foreground pb-1.5 mb-1.5 border-b border-border text-[11px]">
          <Clock className="size-3" />
          <span>Czas: {label}</span>
        </div>
        <div className="flex flex-col gap-1">
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-[11px]">{entry.name}:</span>
              </span>
              <span className="font-bold text-foreground tabular-nums">
                {entry.value !== undefined ? entry.value.toFixed(2) : "--"}
                {entry.unit || (entry.dataKey === "ssr_power_pct" ? "%" : "°C")}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const LiveTempChart: React.FC<LiveTempChartProps> = ({ data }) => {
  return (
    <Card className="flex flex-col gap-3 border-border/80 bg-card/80 backdrop-blur-xs shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-1 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-emerald-400" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Kinetics & Profile Termiczne w Czasie Rzeczywistym
          </CardTitle>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground px-2 py-0">
          Bufor 30s • 4 Hz
        </Badge>
      </CardHeader>

      <CardContent className="px-2 pb-3 sm:px-4 sm:pb-4">
        <div className="w-full h-64 sm:h-72 lg:h-80">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground gap-2 font-mono">
              <Activity className="size-5 animate-pulse text-muted-foreground/60" />
              <span>Oczekiwanie na strumień danych telemetrycznych (4 Hz)...</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                <XAxis
                  dataKey="timeStr"
                  stroke="oklch(1 0 0 / 40%)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="temp"
                  stroke="oklch(1 0 0 / 40%)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  unit="°C"
                />
                <YAxis
                  yAxisId="power"
                  orientation="right"
                  stroke="oklch(1 0 0 / 40%)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  iconType="circle"
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="t_surf_avg"
                  name="T_surf Średnia"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="t_surf_max"
                  name="T_surf Max"
                  stroke="#f43f5e"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="t_back"
                  name="T_spodu (MAX6675)"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="power"
                  type="stepAfter"
                  dataKey="ssr_power_pct"
                  name="Moc SSR (%)"
                  stroke="#eab308"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
