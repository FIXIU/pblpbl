"use client";

import React from "react";
import { Flame, ShieldCheck, Layers, Thermometer } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface KpiCardsProps {
  tBack: number;
  tSurfAvg: number;
  tSurfMax: number;
  deltaTInsulation: number;
  deltaTUniformity: number;
  ssrPowerPct: number;
  ssrActive: boolean;
  mode: string;
}

export const KpiCards: React.FC<KpiCardsProps> = ({
  tBack,
  tSurfAvg,
  tSurfMax,
  deltaTInsulation,
  deltaTUniformity,
  ssrPowerPct,
  ssrActive,
  mode,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/* 1. Surface ROI Avg Temperature */}
      <Card className="relative overflow-hidden border-border/80 bg-card/80 backdrop-blur-xs shadow-sm hover:border-amber-500/40 transition-colors">
        <div className="absolute top-0 inset-x-0 h-1 bg-amber-500/80" />
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5 sm:px-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
            <Thermometer className="size-3.5 shrink-0" />
            <span className="truncate">T_powierzchni (ROI)</span>
          </span>
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground px-1.5 py-0 h-4.5 border-border">
            Max: {tSurfMax.toFixed(1)}°C
          </Badge>
        </CardHeader>
        <CardContent className="px-3.5 pb-3 sm:px-4">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {tSurfAvg.toFixed(1)}
            </span>
            <span className="font-mono text-xs sm:text-sm text-amber-400 font-semibold">°C</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate font-sans">
            MLX90640 • Jednor.: ±{(deltaTUniformity / 2).toFixed(1)}°C
          </p>
        </CardContent>
      </Card>

      {/* 2. Underside Substrate Temperature */}
      <Card className="relative overflow-hidden border-border/80 bg-card/80 backdrop-blur-xs shadow-sm hover:border-cyan-500/40 transition-colors">
        <div className="absolute top-0 inset-x-0 h-1 bg-cyan-500/80" />
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5 sm:px-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
            <Layers className="size-3.5 shrink-0" />
            <span className="truncate">T_spodu (Płyta)</span>
          </span>
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground px-1.5 py-0 h-4.5 border-border">
            SPI0
          </Badge>
        </CardHeader>
        <CardContent className="px-3.5 pb-3 sm:px-4">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {tBack.toFixed(1)}
            </span>
            <span className="font-mono text-xs sm:text-sm text-cyan-400 font-semibold">°C</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate font-sans">
            Termopara typu K (MAX6675)
          </p>
        </CardContent>
      </Card>

      {/* 3. Insulation & Reflectivity Delta */}
      <Card className="relative overflow-hidden border-border/80 bg-card/80 backdrop-blur-xs shadow-sm hover:border-emerald-500/40 transition-colors">
        <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500/80" />
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5 sm:px-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="truncate">ΔT Izolacji</span>
          </span>
          <Badge
            variant="secondary"
            className="font-mono text-[10px] text-emerald-400 px-1.5 py-0 h-4.5 bg-emerald-500/10 border border-emerald-500/20"
          >
            T_surf - T_back
          </Badge>
        </CardHeader>
        <CardContent className="px-3.5 pb-3 sm:px-4">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {deltaTInsulation > 0 ? `+${deltaTInsulation.toFixed(1)}` : deltaTInsulation.toFixed(1)}
            </span>
            <span className="font-mono text-xs sm:text-sm text-emerald-400 font-semibold">°C</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate font-sans">
            Efektywność chłodząca powłoki
          </p>
        </CardContent>
      </Card>

      {/* 4. SSR Lamp Power */}
      <Card className="relative overflow-hidden border-border/80 bg-card/80 backdrop-blur-xs shadow-sm hover:border-orange-500/40 transition-colors">
        <div className="absolute top-0 inset-x-0 h-1 bg-orange-500/80" />
        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3.5 sm:px-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-orange-400">
            <Flame className={`size-3.5 shrink-0 ${ssrActive ? "animate-pulse text-orange-400" : "text-muted-foreground"}`} />
            <span className="truncate">Moc Promiennika</span>
          </span>
          <Badge
            variant={ssrActive ? "default" : "secondary"}
            className={`font-mono text-[10px] px-1.5 py-0 h-4.5 ${
              ssrActive ? "bg-orange-600 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {ssrActive ? "GRZANIE" : "IDLE"}
          </Badge>
        </CardHeader>
        <CardContent className="px-3.5 pb-3 sm:px-4">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {ssrPowerPct.toFixed(0)}
            </span>
            <span className="font-mono text-xs sm:text-sm text-orange-400 font-semibold">%</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate font-sans">
            SSR-40DA • Tryb: {mode}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
