"use client";

import React, { useState } from "react";
import { PowerOff, RefreshCw, ShieldAlert, Cpu, Activity, AlertTriangle } from "lucide-react";
import { emergencyStop, emergencyReset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface EmergencyStopBarProps {
  safetyTripped: boolean;
  safetyMessage: string | null;
  isConnected?: boolean;
  onAction?: () => void;
}

export const EmergencyStopBar: React.FC<EmergencyStopBarProps> = ({
  safetyTripped,
  safetyMessage,
  isConnected = true,
  onAction,
}) => {
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleStop = async () => {
    try {
      await emergencyStop();
      if (onAction) onAction();
    } catch (err) {
      console.error("Emergency stop failed", err);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setResetError(null);
    try {
      await emergencyReset();
      if (onAction) onAction();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Błąd resetu blokady bezpieczeństwa. Upewnij się, że próbka ostygła poniżej 60°C.";
      setResetError(msg);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
        {/* Left: Station Identity & Hardware Specs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span
                className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${
                  isConnected ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span
                className={`relative inline-flex size-2.5 rounded-full ${
                  isConnected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-bold tracking-tight text-foreground sm:text-base">
                  SZTUCZNY DACH
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline font-mono">
                  {"// Cool Roof Testbed"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                <span>RPi 5 · RP1</span>
                <span>•</span>
                <span>MLX90640 + MAX6675</span>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-border/60">
            <Badge variant="outline" className="font-mono text-[11px] gap-1 py-0 h-5">
              <Activity className="size-3 text-primary" />
              4 Hz Telemetria
            </Badge>
            <Badge variant="secondary" className="font-mono text-[11px] gap-1 py-0 h-5">
              <Cpu className="size-3" />
              PWM 2.0s
            </Badge>
          </div>
        </div>

        {/* Right: Emergency Cutoff Button */}
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStop}
            className="font-bold tracking-wide shadow-md shadow-destructive/20 active:scale-95 transition-transform"
          >
            <PowerOff className="size-4 mr-1.5" />
            <span className="hidden sm:inline">STOP AWARYJNY</span>
            <span className="sm:hidden">STOP</span>
          </Button>
        </div>
      </div>

      {/* Safety Alert Screen Modal / Banner when tripped */}
      {safetyTripped && (
        <div className="border-t border-destructive/40 bg-destructive/15 px-4 py-3 animate-pulse">
          <div className="mx-auto max-w-7xl">
            <Alert variant="destructive" className="border-destructive/50 bg-background/95 shadow-xl">
              <ShieldAlert className="size-5 text-destructive" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
                <div>
                  <AlertTitle className="text-destructive font-bold text-sm tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="size-4" />
                    BLOKADA BEZPIECZEŃSTWA AKTYWNA (WATCHDOG CUTOFF)
                  </AlertTitle>
                  <AlertDescription className="text-xs text-foreground/80 mt-1">
                    {safetyMessage || "Przekaźnik SSR-40DA został natychmiast odłączony sprzętowo (GPIO LOW)."}
                  </AlertDescription>
                  {resetError && (
                    <div className="mt-2 text-xs text-destructive-foreground bg-destructive/30 rounded p-1.5 font-medium border border-destructive/40">
                      {resetError}
                    </div>
                  )}
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReset}
                  disabled={isResetting}
                  className="shrink-0 self-start sm:self-center font-semibold"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isResetting ? "animate-spin" : ""}`} />
                  Odblokuj System (Reset)
                </Button>
              </div>
            </Alert>
          </div>
        </div>
      )}
    </header>
  );
};
