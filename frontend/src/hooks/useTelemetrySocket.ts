"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getTelemetryWsUrl } from "@/lib/api";

export interface TelemetryData {
  timestamp: number;
  mode: string;
  ssr_power_pct: number;
  ssr_active: boolean;
  t_back: number;
  t_surf_avg: number;
  t_surf_max: number;
  t_surf_min: number;
  delta_t_uniformity: number;
  delta_t_insulation: number;
  roi: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  is_clean_snapshot: boolean;
  anti_glare_active: boolean;
  safety_triggered: boolean;
  safety_message: string | null;
  session: {
    is_active: boolean;
    session_name: string;
    coating_name: string;
    filename: string | null;
    elapsed_sec: number;
    sample_count: number;
    start_time: string | null;
  };
  thermal_frame: number[];
}

export interface ChartDataPoint {
  timeStr: string;
  elapsedSec: number;
  t_surf_avg: number;
  t_surf_max: number;
  t_back: number;
  ssr_power_pct: number;
}

const MAX_HISTORY_POINTS = 120; // ~30 seconds of 4 Hz data

export function useTelemetrySocket() {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [history, setHistory] = useState<ChartDataPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    try {
      const url = getTelemetryWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: TelemetryData = JSON.parse(event.data);
          if (data && data.thermal_frame) {
            setTelemetry(data);

            // Append to chart history
            const now = new Date();
            const timeStr = now.toTimeString().split(" ")[0];
            const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);

            const point: ChartDataPoint = {
              timeStr,
              elapsedSec: elapsed,
              t_surf_avg: data.t_surf_avg,
              t_surf_max: data.t_surf_max,
              t_back: data.t_back,
              ssr_power_pct: data.ssr_power_pct,
            };

            setHistory((prev) => {
              const next = [...prev, point];
              if (next.length > MAX_HISTORY_POINTS) {
                return next.slice(next.length - MAX_HISTORY_POINTS);
              }
              return next;
            });
          }
        } catch {
          // Non-JSON or pong message
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Schedule auto-reconnect in 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current();
        }, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, 3000);
    }
  }, []);

  useEffect(() => {
    connectRef.current = connect;
    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const sendWsCommand = useCallback((cmd: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  return { telemetry, isConnected, history, sendWsCommand };
}
