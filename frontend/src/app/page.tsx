"use client";

import React, { useState } from "react";
import { useTelemetrySocket } from "@/hooks/useTelemetrySocket";
import { EmergencyStopBar } from "@/components/layout/EmergencyStopBar";
import { BottomNav, NavTab } from "@/components/layout/BottomNav";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ThermalHeatmapCanvas } from "@/components/thermal/ThermalHeatmapCanvas";
import { LiveTempChart } from "@/components/charts/LiveTempChart";
import { ControlPanel } from "@/components/control/ControlPanel";
import { SessionManager } from "@/components/sessions/SessionManager";
import {
  Wifi,
  WifiOff,
  Flame,
  LayoutDashboard,
  Camera,
  Activity,
  Sliders,
  FolderDown,
  Sparkles,
  Info,
} from "lucide-react";
import { sendControl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function StationDashboardPage() {
  const { telemetry, isConnected, history } = useTelemetrySocket();
  const [activeTab, setActiveTab] = useState<NavTab>("studio");

  // Fallback defaults if telemetry is not yet connected
  const tBack = telemetry?.t_back ?? 22.0;
  const tSurfAvg = telemetry?.t_surf_avg ?? 22.0;
  const tSurfMax = telemetry?.t_surf_max ?? 22.0;
  const deltaTInsulation = telemetry?.delta_t_insulation ?? 0.0;
  const deltaTUniformity = telemetry?.delta_t_uniformity ?? 0.0;
  const ssrPowerPct = telemetry?.ssr_power_pct ?? 0.0;
  const ssrActive = telemetry?.ssr_active ?? false;
  const mode = telemetry?.mode ?? "OFF";
  const safetyTripped = telemetry?.safety_triggered ?? false;
  const safetyMessage = telemetry?.safety_message ?? null;
  const roi = telemetry?.roi ?? { x_min: 8, x_max: 24, y_min: 6, y_max: 18 };
  const thermalFrame = telemetry?.thermal_frame ?? [];
  const isCleanSnapshot = telemetry?.is_clean_snapshot ?? false;
  const antiGlareActive = telemetry?.anti_glare_active ?? false;

  const session = telemetry?.session ?? {
    is_active: false,
    session_name: "",
    coating_name: "",
    elapsed_sec: 0,
    sample_count: 0,
    filename: null,
    start_time: null,
  };

  const handleQuickPower = async (pct: number) => {
    try {
      await sendControl({ mode: "MANUAL_PWM", power_pct: pct });
    } catch (err) {
      console.error("Quick power command failed", err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 md:pb-8">
      {/* 1. Top Instrument & Emergency Cutoff Header */}
      <EmergencyStopBar
        safetyTripped={safetyTripped}
        safetyMessage={safetyMessage}
        isConnected={isConnected}
      />

      {/* 2. Laboratory Status Bar & View Navigation */}
      <div className="w-full border-b border-border/60 bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
          {/* Connection Status & Stream Frequency */}
          <div className="flex items-center gap-3">
            {isConnected ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                <Wifi className="size-3.5" />
                <span className="font-medium">Strumień 4 Hz aktywny</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-500 font-mono animate-pulse">
                <WifiOff className="size-3.5" />
                <span className="font-medium">Łączenie ze stacją badawczą...</span>
              </div>
            )}

            {session.is_active && (
              <Badge
                variant="outline"
                className="font-mono text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1.5 py-0.5"
              >
                <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Rejestracja:</span>
                <span className="font-bold underline">{session.coating_name}</span>
                <span className="text-[10px] text-muted-foreground">({session.elapsed_sec.toFixed(0)}s)</span>
              </Badge>
            )}

            {antiGlareActive && (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex font-mono text-[11px] text-purple-400 border-purple-500/30 bg-purple-500/10 gap-1"
              >
                <Sparkles className="size-3" />
                Anty-odblask IR
              </Badge>
            )}
          </div>

          {/* Desktop / Tablet View Navigation Switcher */}
          <div className="hidden md:flex items-center rounded-lg border border-border bg-background/80 p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab("studio")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === "studio"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="size-3.5" />
              <span>Studio (Kokpit)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("thermal")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === "thermal"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Camera className="size-3.5" />
              <span>Termowizja</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("charts")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === "charts"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Activity className="size-3.5" />
              <span>Wykresy</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("control")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === "control"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="size-3.5" />
              <span>Sterowanie SSR</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === "sessions"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderDown className="size-3.5" />
              <span>Sesje CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 flex flex-col gap-4">
        {/* Primary Laboratory Telemetry KPI Cards */}
        <KpiCards
          tBack={tBack}
          tSurfAvg={tSurfAvg}
          tSurfMax={tSurfMax}
          deltaTInsulation={deltaTInsulation}
          deltaTUniformity={deltaTUniformity}
          ssrPowerPct={ssrPowerPct}
          ssrActive={ssrActive}
          mode={mode}
        />

        {/* Quick Power Actuator Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-card/60 border border-border/80 shadow-xs">
          <div className="flex items-center gap-2">
            <Flame className={`size-4 ${ssrActive ? "text-amber-400 animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium text-foreground">Szybka nastawa mocy lampy:</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[0, 25, 50, 75, 100].map((val) => (
              <Button
                key={val}
                type="button"
                variant={ssrPowerPct === val && mode === "MANUAL_PWM" ? "default" : "outline"}
                size="xs"
                onClick={() => handleQuickPower(val)}
                className={`font-mono text-xs h-7 px-2.5 font-bold ${
                  ssrPowerPct === val && mode === "MANUAL_PWM"
                    ? "bg-amber-500 hover:bg-amber-600 text-black border-transparent shadow-xs"
                    : "border-border hover:bg-muted"
                }`}
              >
                {val}%
              </Button>
            ))}
          </div>
        </div>

        {/* VIEW 1: STUDIO (COCKPIT - ALL-IN-ONE VIEW FOR RESEARCH WORKSTATION) */}
        {activeTab === "studio" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left: Thermal Vision Station */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <ThermalHeatmapCanvas
                thermalFrame={thermalFrame}
                roi={roi}
                isCleanSnapshot={isCleanSnapshot}
              />
            </div>

            {/* Right: Real-time Kinetics & SSR Controller */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <LiveTempChart data={history} />
              <ControlPanel
                currentMode={mode}
                currentPower={ssrPowerPct}
                antiGlareEnabled={telemetry?.anti_glare_active ?? false}
                antiGlareInterval={30}
              />
            </div>

            {/* Bottom Row: Session Manager & CSV Data Archive */}
            <div className="lg:col-span-12">
              <SessionManager
                activeSession={{
                  is_active: session.is_active,
                  session_name: session.session_name,
                  coating_name: session.coating_name,
                  elapsed_sec: session.elapsed_sec,
                  sample_count: session.sample_count,
                }}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: FOCUSED THERMAL VISION */}
        {activeTab === "thermal" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8">
              <ThermalHeatmapCanvas
                thermalFrame={thermalFrame}
                roi={roi}
                isCleanSnapshot={isCleanSnapshot}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="p-4 rounded-xl border border-border bg-card/80 text-xs flex flex-col gap-2.5">
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <Info className="size-4 text-primary" />
                  Metodyka Pomiaru Termowizyjnego
                </span>
                <p className="text-muted-foreground leading-relaxed text-[11px]">
                  Kamera MLX90640 o polu widzenia 110° rejestruje rozkład temperatur z powierzchni badanej blachy o wymiarach 10×15 cm.
                </p>
                <div className="flex flex-col gap-1.5 font-mono text-[11px] pt-1 border-t border-border/60">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Średnia ROI (T_surf):</span>
                    <span className="font-bold text-amber-400">{tSurfAvg.toFixed(2)}°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Maksimum próbki:</span>
                    <span className="font-bold text-rose-400">{tSurfMax.toFixed(2)}°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Niejednorodność:</span>
                    <span className="font-bold text-foreground">±{(deltaTUniformity / 2).toFixed(2)}°C</span>
                  </div>
                </div>
              </div>

              <ControlPanel
                currentMode={mode}
                currentPower={ssrPowerPct}
                antiGlareEnabled={telemetry?.anti_glare_active ?? false}
                antiGlareInterval={30}
              />
            </div>
          </div>
        )}

        {/* VIEW 3: FOCUSED REAL-TIME CHARTS */}
        {activeTab === "charts" && (
          <div className="flex flex-col gap-4">
            <LiveTempChart data={history} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl border border-border bg-card/80 text-xs flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px]">Średnia T_powierzchni:</span>
                <span className="text-xl font-mono font-bold text-amber-400">{tSurfAvg.toFixed(2)}°C</span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card/80 text-xs flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px]">Spód płyty T_back:</span>
                <span className="text-xl font-mono font-bold text-cyan-400">{tBack.toFixed(2)}°C</span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card/80 text-xs flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px]">ΔT Izolacji termicznej:</span>
                <span className="text-xl font-mono font-bold text-emerald-400">{deltaTInsulation.toFixed(2)}°C</span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card/80 text-xs flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px]">Moc grzałki SSR-40DA:</span>
                <span className="text-xl font-mono font-bold text-primary">{ssrPowerPct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: FOCUSED SSR CONTROL */}
        {activeTab === "control" && (
          <div className="max-w-2xl mx-auto w-full flex flex-col gap-4">
            <ControlPanel
              currentMode={mode}
              currentPower={ssrPowerPct}
              antiGlareEnabled={telemetry?.anti_glare_active ?? false}
              antiGlareInterval={30}
            />
          </div>
        )}

        {/* VIEW 5: SESSIONS & CSV ARCHIVE */}
        {activeTab === "sessions" && (
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-4">
            <SessionManager
              activeSession={{
                is_active: session.is_active,
                session_name: session.session_name,
                coating_name: session.coating_name,
                elapsed_sec: session.elapsed_sec,
                sample_count: session.sample_count,
              }}
            />
          </div>
        )}
      </main>

      {/* 4. Ergonomic Bottom Navigation Bar (Visible on mobile screens) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        isRecording={session.is_active}
      />
    </div>
  );
}
