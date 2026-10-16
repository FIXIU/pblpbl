"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getThermalColor, ColormapType, getColormapGradientCss } from "@/lib/colormaps";
import { updateRoi, triggerAntiGlareSnapshot } from "@/lib/api";
import { Crosshair, Sparkles, Camera } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ROI {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
}

interface ThermalHeatmapCanvasProps {
  thermalFrame: number[]; // 768 values
  roi: ROI;
  isCleanSnapshot?: boolean;
  onRoiChange?: (roi: ROI) => void;
}

const GRID_W = 32;
const GRID_H = 24;
const DEFAULT_MIN_TEMP = 20.0;
const DEFAULT_MAX_TEMP = 80.0;

export const ThermalHeatmapCanvas: React.FC<ThermalHeatmapCanvasProps> = ({
  thermalFrame,
  roi,
  isCleanSnapshot = false,
  onRoiChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [colormap, setColormap] = useState<ColormapType>("inferno");
  const [autoScale, setAutoScale] = useState<boolean>(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Crosshair / Point inspection
  const [inspectedPoint, setInspectedPoint] = useState<{
    x: number;
    y: number;
    temp: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // Dragging ROI state
  const [isDraggingRoi, setIsDraggingRoi] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [localRoi, setLocalRoi] = useState<ROI>(roi);

  // Dynamic or manual temperature bounds
  const { effectiveMinTemp, effectiveMaxTemp } = React.useMemo(() => {
    if (autoScale && thermalFrame && thermalFrame.length === 768) {
      let min = Infinity;
      let max = -Infinity;
      for (const t of thermalFrame) {
        if (t < min) min = t;
        if (t > max) max = t;
      }
      if (min < max && isFinite(min) && isFinite(max)) {
        return {
          effectiveMinTemp: Math.floor(min * 10) / 10,
          effectiveMaxTemp: Math.ceil(max * 10) / 10,
        };
      }
    }
    return {
      effectiveMinTemp: DEFAULT_MIN_TEMP,
      effectiveMaxTemp: DEFAULT_MAX_TEMP,
    };
  }, [autoScale, thermalFrame]);

  const activeRoi = isDraggingRoi ? localRoi : roi;

  // Render heatmap with smooth bilinear interpolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !thermalFrame || thermalFrame.length !== 768) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use an offscreen canvas at native 32x24 to draw raw color pixels
    const offscreen = document.createElement("canvas");
    offscreen.width = GRID_W;
    offscreen.height = GRID_H;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const imgData = offCtx.createImageData(GRID_W, GRID_H);
    const data = imgData.data;

    for (let i = 0; i < 768; i++) {
      const temp = thermalFrame[i];
      const [r, g, b] = getThermalColor(temp, effectiveMinTemp, effectiveMaxTemp, colormap);
      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }

    offCtx.putImageData(imgData, 0, 0);

    // Upscale onto main canvas using browser's smooth bilinear scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }, [thermalFrame, effectiveMinTemp, effectiveMaxTemp, colormap]);

  // Handle click/touch inspection
  const handleCanvasInteraction = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !thermalFrame || thermalFrame.length !== 768) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) return;

    // Map to 32x24 grid coordinates
    const gridX = Math.floor((clickX / rect.width) * GRID_W);
    const gridY = Math.floor((clickY / rect.height) * GRID_H);
    const clampedX = Math.max(0, Math.min(GRID_W - 1, gridX));
    const clampedY = Math.max(0, Math.min(GRID_H - 1, gridY));

    const temp = thermalFrame[clampedY * GRID_W + clampedX] || 0.0;
    setInspectedPoint({
      x: clampedX,
      y: clampedY,
      temp,
      canvasX: clickX,
      canvasY: clickY,
    });
  };

  // Convert ROI grid coords to canvas percentage
  const roiStyle = {
    left: `${(activeRoi.x_min / GRID_W) * 100}%`,
    top: `${(activeRoi.y_min / GRID_H) * 100}%`,
    width: `${((activeRoi.x_max - activeRoi.x_min + 1) / GRID_W) * 100}%`,
    height: `${((activeRoi.y_max - activeRoi.y_min + 1) / GRID_H) * 100}%`,
  };

  // Touch / mouse ROI dragging
  const handleRoiDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setLocalRoi(roi);
    setIsDraggingRoi(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX, y: clientY });
  };

  const handleRoiDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRoi || !dragStart || !canvasRef.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const rect = canvasRef.current.getBoundingClientRect();
      const dxPx = clientX - dragStart.x;
      const dyPx = clientY - dragStart.y;

      const dGridX = Math.round((dxPx / rect.width) * GRID_W);
      const dGridY = Math.round((dyPx / rect.height) * GRID_H);

      if (dGridX !== 0 || dGridY !== 0) {
        const roiWidth = localRoi.x_max - localRoi.x_min;
        const roiHeight = localRoi.y_max - localRoi.y_min;

        const newXMin = Math.max(0, Math.min(GRID_W - 1 - roiWidth, localRoi.x_min + dGridX));
        const newYMin = Math.max(0, Math.min(GRID_H - 1 - roiHeight, localRoi.y_min + dGridY));

        setLocalRoi({
          x_min: newXMin,
          x_max: newXMin + roiWidth,
          y_min: newYMin,
          y_max: newYMin + roiHeight,
        });
        setDragStart({ x: clientX, y: clientY });
      }
    },
    [isDraggingRoi, dragStart, localRoi]
  );

  const handleRoiDragEnd = useCallback(() => {
    if (isDraggingRoi) {
      setIsDraggingRoi(false);
      setDragStart(null);
      // Persist to backend
      updateRoi(localRoi).catch(() => {});
      if (onRoiChange) onRoiChange(localRoi);
    }
  }, [isDraggingRoi, localRoi, onRoiChange]);

  useEffect(() => {
    if (isDraggingRoi) {
      window.addEventListener("mousemove", handleRoiDragMove);
      window.addEventListener("mouseup", handleRoiDragEnd);
      window.addEventListener("touchmove", handleRoiDragMove);
      window.addEventListener("touchend", handleRoiDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleRoiDragMove);
        window.removeEventListener("mouseup", handleRoiDragEnd);
        window.removeEventListener("touchmove", handleRoiDragMove);
        window.removeEventListener("touchend", handleRoiDragEnd);
      };
    }
  }, [isDraggingRoi, handleRoiDragMove, handleRoiDragEnd]);

  const handleTriggerCleanSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      await triggerAntiGlareSnapshot();
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setSnapshotLoading(false), 2000);
    }
  };

  const handleResetRoi = () => {
    const defaultRoi = { x_min: 8, x_max: 24, y_min: 6, y_max: 18 };
    setLocalRoi(defaultRoi);
    updateRoi(defaultRoi).catch(() => {});
    if (onRoiChange) onRoiChange(defaultRoi);
  };

  return (
    <Card className="flex flex-col gap-3 border-border/80 bg-card/80 backdrop-blur-xs shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span>Kamera Termowizyjna MLX90640</span>
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground px-1.5 py-0">
              32×24 • 110° FOV
            </Badge>
          </CardTitle>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          {isCleanSnapshot && (
            <Badge
              variant="secondary"
              className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] gap-1 font-semibold animate-pulse"
            >
              <Sparkles className="size-3" />
              Czysty Pomiar IR
            </Badge>
          )}

          {/* Colormap toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              variant={colormap === "inferno" ? "default" : "ghost"}
              size="xs"
              onClick={() => setColormap("inferno")}
              className="text-[11px] h-6 px-2 font-medium"
            >
              Inferno
            </Button>
            <Button
              variant={colormap === "ironbow" ? "default" : "ghost"}
              size="xs"
              onClick={() => setColormap("ironbow")}
              className="text-[11px] h-6 px-2 font-medium"
            >
              Ironbow
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4 pb-4">
        {/* Viewport Canvas Frame */}
        <div
          ref={containerRef}
          className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black/90 border border-border shadow-inner touch-none select-none"
          onClick={(e) => handleCanvasInteraction(e.clientX, e.clientY)}
        >
          <canvas
            ref={canvasRef}
            width={320}
            height={240}
            className="w-full h-full object-fill block cursor-crosshair"
          />

          {/* Interactive ROI Bounding Box Overlay for 10x15 cm plate */}
          <div
            style={roiStyle}
            onMouseDown={handleRoiDragStart}
            onTouchStart={handleRoiDragStart}
            className={`absolute border-2 border-emerald-400/90 bg-emerald-500/10 cursor-move transition-shadow ${
              isDraggingRoi ? "ring-2 ring-emerald-300 shadow-lg border-emerald-300" : "hover:border-emerald-300"
            }`}
          >
            {/* ROI Tag */}
            <div className="absolute top-1 left-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/30 pointer-events-none">
              PŁYTA 10×15 cm
            </div>

            {/* Corner anchor point */}
            <div className="absolute bottom-1 right-1 size-2.5 rounded-full bg-emerald-400 border border-black shadow pointer-events-none" />
          </div>

          {/* Tap / Click Inspection Crosshair */}
          {inspectedPoint && (
            <div
              style={{ left: inspectedPoint.canvasX, top: inspectedPoint.canvasY }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center z-10"
            >
              <Crosshair className="size-5 text-cyan-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
              <div className="mt-1 px-2 py-0.5 rounded bg-background/95 text-[10px] font-mono text-cyan-400 border border-cyan-500/40 shadow-lg whitespace-nowrap">
                ({inspectedPoint.x}, {inspectedPoint.y}):{" "}
                <span className="font-bold text-foreground">{inspectedPoint.temp.toFixed(1)}°C</span>
              </div>
            </div>
          )}
        </div>

        {/* Scale Legend & Options */}
        <div className="flex flex-col gap-2">
          {/* Colormap gradient bar */}
          <div
            className="h-2 w-full rounded-full border border-border/80 shadow-xs"
            style={{ background: getColormapGradientCss(colormap) }}
          />

          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
            <span className="font-semibold">{effectiveMinTemp.toFixed(1)}°C</span>
            <div className="flex items-center gap-1.5">
              <Button
                variant={autoScale ? "secondary" : "outline"}
                size="xs"
                onClick={() => setAutoScale(!autoScale)}
                className="h-6 text-[11px] font-mono"
              >
                Auto: {autoScale ? "ON" : "OFF"}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleResetRoi}
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                title="Resetuj obszar ROI do domyślnego 10x15 cm"
              >
                Reset ROI
              </Button>
            </div>
            <span className="font-semibold">{effectiveMaxTemp.toFixed(1)}°C</span>
          </div>
        </div>

        {/* Quick Optics Snapshot Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
          <span className="text-[11px] text-muted-foreground text-center sm:text-left">
            Dotknij siatki, aby zmierzyć temperaturę punktu. Przeciągnij ramkę, aby dopasować ROI próbki.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerCleanSnapshot}
            disabled={snapshotLoading}
            className="shrink-0 text-xs gap-1.5 border-primary/30 hover:bg-primary/10 text-primary w-full sm:w-auto"
          >
            <Sparkles className={`size-3.5 ${snapshotLoading ? "animate-spin" : ""}`} />
            Snapshot bez odbić IR
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
