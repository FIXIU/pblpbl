"use client";

import React from "react";
import { Thermometer, Activity, Sliders, FolderDown, LayoutDashboard } from "lucide-react";

export type NavTab = "studio" | "thermal" | "charts" | "control" | "sessions";

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isRecording?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  isRecording = false,
}) => {
  const tabs = [
    { id: "studio" as NavTab, label: "Studio", icon: LayoutDashboard },
    { id: "thermal" as NavTab, label: "Kamera", icon: Thermometer },
    { id: "charts" as NavTab, label: "Wykresy", icon: Activity },
    { id: "control" as NavTab, label: "SSR", icon: Sliders },
    {
      id: "sessions" as NavTab,
      label: "Sesje",
      icon: FolderDown,
      badge: isRecording ? "REC" : undefined,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md px-3 py-1.5 md:hidden">
      <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer relative ${
                isActive
                  ? "text-primary font-bold bg-muted/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon className={`size-4.5 ${isActive ? "stroke-[2.5]" : "stroke-2"}`} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-3 px-1 rounded-full bg-red-600 text-[8px] font-bold text-white animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
