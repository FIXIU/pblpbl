/**
 * Scientific and Thermal Colormaps for MLX90640 Heatmap Rendering.
 * Supports Inferno (perceptually uniform) and Ironbow (classic FLIR thermography).
 */

export type ColormapType = "inferno" | "ironbow";

// Inferno Colormap control anchors [normalized_val, r, g, b]
const INFERNO_STOPS: [number, number, number, number][] = [
  [0.0, 0, 0, 4],
  [0.15, 40, 11, 84],
  [0.3, 101, 21, 110],
  [0.45, 159, 42, 99],
  [0.6, 212, 72, 66],
  [0.75, 245, 125, 21],
  [0.9, 250, 193, 39],
  [1.0, 252, 255, 164],
];

// Ironbow Colormap control anchors [normalized_val, r, g, b]
const IRONBOW_STOPS: [number, number, number, number][] = [
  [0.0, 0, 0, 0],
  [0.15, 24, 0, 130],
  [0.3, 100, 0, 140],
  [0.5, 200, 20, 90],
  [0.7, 240, 90, 0],
  [0.85, 255, 190, 0],
  [1.0, 255, 255, 255],
];

function interpolateColor(
  normalized: number,
  stops: [number, number, number, number][]
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, normalized));

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];

    if (clamped >= t0 && clamped <= t1) {
      const factor = (clamped - t0) / (t1 - t0);
      const r = Math.round(r0 + factor * (r1 - r0));
      const g = Math.round(g0 + factor * (g1 - g0));
      const b = Math.round(b0 + factor * (b1 - b0));
      return [r, g, b];
    }
  }

  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

export function getThermalColor(
  temp: number,
  minTemp: number,
  maxTemp: number,
  colormap: ColormapType = "inferno"
): [number, number, number] {
  const range = Math.max(1.0, maxTemp - minTemp);
  const normalized = (temp - minTemp) / range;
  const stops = colormap === "ironbow" ? IRONBOW_STOPS : INFERNO_STOPS;
  return interpolateColor(normalized, stops);
}

/**
 * Returns a CSS linear-gradient string for scale legends.
 */
export function getColormapGradientCss(colormap: ColormapType): string {
  const stops = colormap === "ironbow" ? IRONBOW_STOPS : INFERNO_STOPS;
  const parts = stops.map(
    ([pos, r, g, b]) => `rgb(${r}, ${g}, ${b}) ${Math.round(pos * 100)}%`
  );
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
