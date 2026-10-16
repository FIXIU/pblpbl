"use client";

import React, { useState } from "react";
import {
  sendControl,
  configureAntiGlare,
  triggerAntiGlareSnapshot,
} from "@/lib/api";
import {
  Flame,
  Cpu,
  Clock,
  Sparkles,
  Sliders,
  Power,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface ControlPanelProps {
  currentMode: string;
  currentPower: number;
  antiGlareEnabled: boolean;
  antiGlareInterval: number;
  onRefresh?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  currentMode,
  currentPower,
  antiGlareEnabled,
  antiGlareInterval,
  onRefresh,
}) => {
  const [selectedTab, setSelectedTab] = useState<string>("manual");

  // Manual state
  const [manualPower, setManualPower] = useState<number>(currentPower || 30.0);

  // PID state
  const [pidSetpoint, setPidSetpoint] = useState<number>(60.0);
  const [pidSource, setPidSource] = useState<string>("MLX90640_ROI_AVG");
  const [pidKp, setPidKp] = useState<number>(3.5);
  const [pidKi, setPidKi] = useState<number>(0.08);
  const [pidKd, setPidKd] = useState<number>(2.0);

  // Profile state
  const [heatMinutes, setHeatMinutes] = useState<number>(3);
  const [heatPower, setHeatPower] = useState<number>(60);
  const [coolMinutes, setCoolMinutes] = useState<number>(5);

  // Anti-glare state
  const [agInterval, setAgInterval] = useState<number>(antiGlareInterval || 30);
  const [agActive, setAgActive] = useState<boolean>(antiGlareEnabled);

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const getErrMsg = (err: unknown) =>
    err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd komunikacji";

  const handleApplyManual = async (powerVal: number) => {
    setLoading(true);
    try {
      await sendControl({ mode: "MANUAL_PWM", power_pct: powerVal });
      setManualPower(powerVal);
      showMsg(`Ustawiono moc lampy: ${powerVal}%`);
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      showMsg(getErrMsg(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTurnOff = async () => {
    setLoading(true);
    try {
      await sendControl({ mode: "OFF" });
      setManualPower(0);
      showMsg("Wyłączono lampę grzewczą (0%)");
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      showMsg(getErrMsg(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPid = async () => {
    setLoading(true);
    try {
      await sendControl({
        mode: "PID_HOLD",
        setpoint_temp: pidSetpoint,
        feedback_source: pidSource,
        kp: pidKp,
        ki: pidKi,
        kd: pidKd,
      });
      showMsg(`PID aktywny: Cel ${pidSetpoint}°C (${pidSource === "MLX90640_ROI_AVG" ? "Wierzch" : "Spód"})`);
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      showMsg(getErrMsg(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartProfile = async () => {
    setLoading(true);
    try {
      const steps = [
        {
          name: `Grzanie ${heatPower}%`,
          duration_sec: heatMinutes * 60,
          power_pct: heatPower,
        },
        {
          name: "Chłodzenie swobodne",
          duration_sec: coolMinutes * 60,
          power_pct: 0.0,
        },
      ];
      await sendControl({ mode: "EXPERIMENT_PROFILE", profile_steps: steps });
      showMsg(`Uruchomiono cykl: ${heatMinutes}m grzania (${heatPower}%) + ${coolMinutes}m chłodzenia`);
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      showMsg(getErrMsg(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAntiGlare = async () => {
    const next = !agActive;
    setAgActive(next);
    try {
      await configureAntiGlare(next, agInterval);
      showMsg(`Tryb antyrefleksyjny: ${next ? "WŁĄCZONY" : "WYŁĄCZONY"}`);
    } catch (err: unknown) {
      showMsg(getErrMsg(err), "error");
    }
  };

  const handleTriggerSingleSnapshot = async () => {
    try {
      await triggerAntiGlareSnapshot();
      showMsg("Zaplanowano czysty pomiar bez odbić IR na kolejną sekundę!");
    } catch (err: unknown) {
      showMsg(getErrMsg(err), "error");
    }
  };

  const handleSliderVal = (setter: (v: number) => void) => (val: number | readonly number[]) => {
    if (typeof val === "number") {
      setter(val);
    } else if (Array.isArray(val) && val.length > 0) {
      setter(val[0]);
    }
  };

  return (
    <Card className="flex flex-col gap-3 border-border/80 bg-card/80 backdrop-blur-xs shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-1 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Sterowanie Stacją & Przekaźnikiem SSR-40DA
          </CardTitle>
        </div>
        <Badge variant="outline" className="font-mono text-[11px] gap-1 px-2 py-0">
          Tryb: <span className="font-bold text-primary">{currentMode}</span>
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4 pb-4">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border ${
              feedback.type === "success"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-destructive/10 text-destructive border-destructive/20"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Tab Selection */}
        <Tabs value={selectedTab} onValueChange={(val) => setSelectedTab(val as string)}>
          <TabsList className="grid grid-cols-4 w-full h-8">
            <TabsTrigger value="manual" className="text-xs">
              Ręczny %
            </TabsTrigger>
            <TabsTrigger value="pid" className="text-xs">
              PID Temp
            </TabsTrigger>
            <TabsTrigger value="profile" className="text-xs">
              Cykl Test
            </TabsTrigger>
            <TabsTrigger value="antiglare" className="text-xs">
              Odbicia IR
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MANUAL PWM */}
          <TabsContent value="manual" className="mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Moc promiennika (PWM 2.0s period):</span>
              <span className="font-mono text-base font-bold text-primary tabular-nums">
                {manualPower}%
              </span>
            </div>

            <Slider
              min={0}
              max={100}
              step={5}
              value={[manualPower]}
              onValueChange={handleSliderVal(setManualPower)}
              className="py-2"
            />

            {/* Quick step presets */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {[0, 25, 50, 75, 100].map((val) => (
                <Button
                  key={val}
                  type="button"
                  variant={manualPower === val ? "default" : "outline"}
                  size="xs"
                  onClick={() => handleApplyManual(val)}
                  className="font-mono text-xs font-semibold h-7"
                >
                  {val}%
                </Button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={() => handleApplyManual(manualPower)}
                disabled={loading}
                className="flex-1 font-semibold text-xs h-8"
              >
                <Flame className="size-3.5 mr-1" />
                Zastosuj Moc ({manualPower}%)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTurnOff}
                disabled={loading}
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                <Power className="size-3.5 mr-1" />
                Wyłącz
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: PID CONTROL */}
          <TabsContent value="pid" className="mt-3 flex flex-col gap-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60 bg-muted/20">
              <span className="text-muted-foreground">Temperatura zadana:</span>
              <div className="flex items-center gap-1.5 font-mono">
                <Input
                  type="number"
                  min={20}
                  max={100}
                  step={1}
                  value={pidSetpoint}
                  onChange={(e) => setPidSetpoint(Number(e.target.value))}
                  className="w-20 h-7 text-center font-bold text-cyan-400 font-mono text-xs"
                />
                <span className="text-muted-foreground">°C</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60 bg-muted/20">
              <span className="text-muted-foreground">Sensor sprzężenia zwrotnego:</span>
              <select
                value={pidSource}
                onChange={(e) => setPidSource(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="MLX90640_ROI_AVG">Wierzch (MLX90640 ROI Średnia)</option>
                <option value="MAX6675">Spód (MAX6675 Termopara)</option>
              </select>
            </div>

            {/* PID Tuning parameters */}
            <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-border/60 bg-muted/20">
              <span className="text-muted-foreground text-[11px] font-medium">Wzmocnienia pętli PID (Kp / Ki / Kd):</span>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">Kp (P)</span>
                  <Input
                    type="number"
                    step={0.1}
                    value={pidKp}
                    onChange={(e) => setPidKp(Number(e.target.value))}
                    className="h-7 text-center font-mono text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">Ki (I)</span>
                  <Input
                    type="number"
                    step={0.01}
                    value={pidKi}
                    onChange={(e) => setPidKi(Number(e.target.value))}
                    className="h-7 text-center font-mono text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-0.5">Kd (D)</span>
                  <Input
                    type="number"
                    step={0.1}
                    value={pidKd}
                    onChange={(e) => setPidKd(Number(e.target.value))}
                    className="h-7 text-center font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleApplyPid}
              disabled={loading}
              className="w-full font-semibold text-xs h-8 bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              <Cpu className="size-3.5 mr-1" />
              Uruchom Regulator PID
            </Button>
          </TabsContent>

          {/* TAB 3: EXPERIMENT PROFILE */}
          <TabsContent value="profile" className="mt-3 flex flex-col gap-3 text-xs">
            <p className="text-[11px] text-muted-foreground">
              Automatyczny protokół badawczy: Grzanie próbki zadaną mocą przez określony czas, a następnie rejestracja naturalnej kinetyki stygnięcia.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/80 bg-muted/20">
                <span className="font-semibold text-amber-400 text-xs">1. Faza Grzania</span>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Czas trwania:</span>
                  <span className="font-mono font-bold">{heatMinutes} min</span>
                </div>
                <Slider
                  min={1}
                  max={30}
                  value={[heatMinutes]}
                  onValueChange={handleSliderVal(setHeatMinutes)}
                />
                <div className="flex items-center justify-between text-[11px] mt-1">
                  <span className="text-muted-foreground">Moc lampy:</span>
                  <span className="font-mono font-bold text-amber-400">{heatPower}%</span>
                </div>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={[heatPower]}
                  onValueChange={handleSliderVal(setHeatPower)}
                />
              </div>

              <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/80 bg-muted/20">
                <span className="font-semibold text-cyan-400 text-xs">2. Faza Chłodzenia</span>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Czas trwania:</span>
                  <span className="font-mono font-bold">{coolMinutes} min</span>
                </div>
                <Slider
                  min={1}
                  max={30}
                  value={[coolMinutes]}
                  onValueChange={handleSliderVal(setCoolMinutes)}
                />
                <p className="text-[10px] text-muted-foreground mt-2">
                  Lampa automatycznie wyłączana do 0% w celu pomiaru stałej czasowej chłodzenia.
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleStartProfile}
              disabled={loading}
              className="w-full font-semibold text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Clock className="size-3.5 mr-1" />
              Rozpocznij Cykl Badawczy ({heatMinutes + coolMinutes} min)
            </Button>
          </TabsContent>

          {/* TAB 4: ANTI-GLARE */}
          <TabsContent value="antiglare" className="mt-3 flex flex-col gap-3 text-xs">
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Żarnik kwarcowy emituje intensywne pasmo IR, które odbija się od powłok metalicznych/refleksyjnych w obiektyw kamery MLX90640.
              Tryb ten wyłącza SSR na 1.5 sekundy, czeka na wygaszenie poświaty żarnika i pobiera niezakłóconą ramkę emisyjności.
            </div>

            <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/80 bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-foreground text-xs block">
                    Cykliczne pomiary bez odbić
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Automatycznie co {agInterval} sekund wygaszaj lampę na 1.5s
                  </span>
                </div>
                <Button
                  type="button"
                  variant={agActive ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleAntiGlare}
                  className={`font-semibold text-xs ${
                    agActive ? "bg-purple-600 hover:bg-purple-500 text-white" : ""
                  }`}
                >
                  {agActive ? "WŁĄCZONE" : "WYŁĄCZONE"}
                </Button>
              </div>

              <div className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted-foreground">Interwał cyklu antyrefleksyjnego:</span>
                  <span className="font-mono font-bold text-purple-400">{agInterval} s</span>
                </div>
                <Slider
                  min={15}
                  max={120}
                  step={5}
                  value={[agInterval]}
                  onValueChange={handleSliderVal(setAgInterval)}
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={handleTriggerSingleSnapshot}
              className="w-full font-semibold text-xs h-8 bg-purple-700 hover:bg-purple-600 text-white"
            >
              <Sparkles className="size-3.5 mr-1" />
              Wykonaj Czysty Pomiar Teraz
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
