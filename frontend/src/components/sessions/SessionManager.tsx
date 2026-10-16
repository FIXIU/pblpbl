"use client";

import React, { useState, useEffect } from "react";
import {
  startRecordingSession,
  stopRecordingSession,
  fetchSessions,
  getDownloadUrl,
  deleteSession,
  SessionInfo,
} from "@/lib/api";
import {
  FileText,
  Download,
  Trash2,
  Play,
  Square,
  RefreshCw,
  FolderDown,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SessionManagerProps {
  activeSession: {
    is_active: boolean;
    session_name: string;
    coating_name: string;
    elapsed_sec: number;
    sample_count: number;
  };
  onSessionStateChange?: () => void;
}

const SAMPLE_PRESETS = [
  "Cool_Roof_TiO2_Biała",
  "Farba_Termoizolacyjna_Ceramiczna",
  "Blacha_Ocynk_Surowa_Ref",
  "Powłoka_Aluminiowa_HighAlbedo",
  "Czarna_Matowa_Absorber_Test",
];

export const SessionManager: React.FC<SessionManagerProps> = ({
  activeSession,
  onSessionStateChange,
}) => {
  const [sessionName, setSessionName] = useState("Test_01");
  const [coatingName, setCoatingName] = useState("Cool_Roof_TiO2_Biała");
  const [savedSessions, setSavedSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const loadSessionsList = async () => {
    try {
      const list = await fetchSessions();
      setSavedSessions(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchSessions()
      .then((list) => {
        if (!ignore) setSavedSessions(list);
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleStart = async () => {
    if (!coatingName.trim()) {
      showMsg("Wpisz nazwę próbki powłoki przed rozpoczęciem", "error");
      return;
    }
    setLoading(true);
    try {
      await startRecordingSession(sessionName, coatingName);
      showMsg(`Rozpoczęto rejestrację próbek do pliku CSV!`);
      if (onSessionStateChange) onSessionStateChange();
      await loadSessionsList();
    } catch (err: unknown) {
      showMsg(err instanceof Error ? err.message : "Błąd rozpoczęcia sesji", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await stopRecordingSession();
      showMsg("Zakończono rejestrację. Plik CSV został pomyślnie zapisany!");
      if (onSessionStateChange) onSessionStateChange();
      await loadSessionsList();
    } catch (err: unknown) {
      showMsg(err instanceof Error ? err.message : "Błąd zatrzymania sesji", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Czy na pewno usunąć plik pomiarowy ${filename}?`)) return;
    try {
      await deleteSession(filename);
      showMsg(`Usunięto ${filename}`);
      await loadSessionsList();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Card className="flex flex-col gap-3 border-border/80 bg-card/80 backdrop-blur-xs shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-1 px-4 pt-4">
        <div className="flex items-center gap-2">
          <FolderDown className="size-4 text-emerald-400" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Rejestrator Próbek i Archiwum CSV
          </CardTitle>
        </div>

        {activeSession.is_active && (
          <Badge
            variant="destructive"
            className="font-mono text-[10px] gap-1 px-2 py-0 animate-pulse bg-red-600"
          >
            <span className="size-1.5 rounded-full bg-white" />
            REC: {activeSession.elapsed_sec.toFixed(0)}s ({activeSession.sample_count} próbek)
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-4 pb-4">
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

        {/* Section 1: Session Recorder Controls */}
        {!activeSession.is_active ? (
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-[11px] font-medium">
                Nazwa badanej powłoki dachowej (specimen):
              </label>
              <Input
                type="text"
                value={coatingName}
                onChange={(e) => setCoatingName(e.target.value)}
                placeholder="np. Farba_Refleksyjna_TiO2"
                className="h-8 text-xs font-medium"
              />
              {/* Presets quick tags */}
              <div className="flex flex-wrap gap-1 mt-1">
                {SAMPLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCoatingName(preset)}
                    className="text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-[11px] font-medium">
                Identyfikator serii pomiarowej:
              </label>
              <Input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="np. Test_01"
                className="h-8 text-xs font-mono"
              />
            </div>

            <Button
              type="button"
              onClick={handleStart}
              disabled={loading}
              className="w-full font-semibold text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Play className="size-3.5 mr-1" />
              Rozpocznij Rejestrację Telemetrii (.CSV)
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3 rounded-lg border border-border bg-muted/20 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Badana Powłoka:</span>
              <span className="font-semibold text-emerald-400">{activeSession.coating_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Seria pomiarowa:</span>
              <span className="font-mono text-foreground">{activeSession.session_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Czas trwania pomiaru:</span>
              <span className="font-mono font-bold text-foreground">
                {activeSession.elapsed_sec.toFixed(1)} s
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Liczba zebranych ramek:</span>
              <span className="font-mono font-bold text-primary">
                {activeSession.sample_count} rekordów (4 Hz)
              </span>
            </div>

            <Button
              type="button"
              variant="destructive"
              onClick={handleStop}
              disabled={loading}
              className="w-full font-semibold text-xs h-8"
            >
              <Square className="size-3.5 mr-1" />
              Zakończ i Zapisz Plik CSV
            </Button>
          </div>
        )}

        {/* Section 2: Saved Files Archive Table */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Zapisane Zbiory CSV</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={loadSessionsList}
              className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
              title="Odśwież listę plików"
            >
              <RefreshCw className="size-3 mr-1" />
              Odśwież
            </Button>
          </div>

          {savedSessions.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs font-mono">
              Brak zapisanych plików sesji w katalogu data/sessions/.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {savedSessions.map((s) => (
                <div
                  key={s.filename}
                  className="flex items-center justify-between p-2 rounded-lg border border-border/60 bg-muted/20 hover:border-border transition text-xs"
                >
                  <div className="flex items-center gap-2 overflow-hidden pr-2">
                    <FileText className="size-4 text-emerald-400 shrink-0" />
                    <div className="flex flex-col truncate">
                      <span className="font-mono text-[11px] text-foreground truncate font-medium">
                        {s.filename}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {(s.size_bytes / 1024).toFixed(1)} KB •{" "}
                        {new Date(s.modified_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={getDownloadUrl(s.filename)}
                      download
                      className="inline-flex items-center justify-center size-7 rounded-md bg-secondary hover:bg-emerald-600 text-secondary-foreground hover:text-white transition"
                      title="Pobierz plik CSV"
                    >
                      <Download className="size-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.filename)}
                      className="inline-flex items-center justify-center size-7 rounded-md bg-secondary hover:bg-destructive text-muted-foreground hover:text-white transition cursor-pointer"
                      title="Usuń plik"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
