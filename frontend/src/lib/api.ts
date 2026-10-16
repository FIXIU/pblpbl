/**
 * REST API client for Sztuczny Dach testbed backend.
 */

export interface SystemStatus {
  status: string;
  simulation_mode: boolean;
  mode: string;
  ssr_power_pct: number;
  safety_tripped: boolean;
  safety_message: string | null;
  roi: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  session: {
    is_active: boolean;
    session_name: string;
    coating_name: string;
    filename: string | null;
    elapsed_sec: number;
    sample_count: number;
    start_time: string | null;
  };
  anti_glare_enabled: boolean;
  anti_glare_interval_sec: number;
}

export interface SessionInfo {
  filename: string;
  size_bytes: number;
  modified_at: string;
}

export function getBackendBaseUrl(): string {
  if (typeof window !== "undefined") {
    // If environment variable is configured, use it
    if (process.env.NEXT_PUBLIC_BACKEND_URL) {
      return process.env.NEXT_PUBLIC_BACKEND_URL;
    }
    // Default to same host on port 8000
    const host = window.location.hostname;
    return `http://${host}:8000`;
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

export function getTelemetryWsUrl(): string {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }
    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${host}:8000/ws/telemetry`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/telemetry";
}

export async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch(`${getBackendBaseUrl()}/api/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export async function sendControl(payload: {
  mode: string;
  power_pct?: number;
  setpoint_temp?: number;
  feedback_source?: string;
  kp?: number;
  ki?: number;
  kd?: number;
  profile_steps?: Array<{ name: string; duration_sec: number; power_pct: number }>;
}): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update control mode");
  }
  return res.json();
}

export async function updateRoi(roi: {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
}): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/roi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(roi),
  });
  if (!res.ok) throw new Error("Failed to update ROI");
  return res.json();
}

export async function configureAntiGlare(enabled: boolean, interval_sec?: number): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/anti-glare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, interval_sec }),
  });
  if (!res.ok) throw new Error("Failed to configure anti-glare");
  return res.json();
}

export async function triggerAntiGlareSnapshot(): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/anti-glare/trigger`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to trigger clean snapshot");
  return res.json();
}

export async function startRecordingSession(
  session_name: string,
  coating_name: string
): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_name, coating_name }),
  });
  if (!res.ok) throw new Error("Failed to start session");
  return res.json();
}

export async function stopRecordingSession(): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/session/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to stop session");
  return res.json();
}

export async function fetchSessions(): Promise<SessionInfo[]> {
  const res = await fetch(`${getBackendBaseUrl()}/api/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  const data = await res.json();
  return data.sessions || [];
}

export function getDownloadUrl(filename: string): string {
  return `${getBackendBaseUrl()}/api/sessions/${encodeURIComponent(filename)}/download`;
}

export async function deleteSession(filename: string): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/sessions/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete session file");
  return res.json();
}

export async function emergencyStop(): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/emergency-stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to trigger emergency stop");
  return res.json();
}

export async function emergencyReset(): Promise<unknown> {
  const res = await fetch(`${getBackendBaseUrl()}/api/emergency-reset`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Cannot reset emergency lockout");
  }
  return res.json();
}
