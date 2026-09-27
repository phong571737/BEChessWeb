"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { SERVER_EVENT } from "@/lib/constants/socket";
import { useSocket } from "@/components/providers/socket-provider";

export const BOARD_COLOR_PRESETS = {
  classic: { light: "#e8e8e8", dark: "#7b6040" },
  ocean: { light: "#dceef7", dark: "#3478a6" },
  forest: { light: "#e4f0df", dark: "#527a43" },
  royal: { light: "#e9e4ff", dark: "#6956b8" },
  slate: { light: "#dce4ec", dark: "#52677b" },
  rosewood: { light: "#f3e2d1", dark: "#945b45" },
} as const;

export type BoardColorTheme = keyof typeof BOARD_COLOR_PRESETS | "custom";
export type BoardColors = { light: string; dark: string };

type BoardDisplayContextValue = {
  flipped: boolean;
  boardColorTheme: BoardColorTheme;
  boardColors: BoardColors;
  homeEvaluationVisible: boolean;
  homeSuggestionsVisible: boolean;
  homeBoardOrder: string[];
  toggleFlipped: () => void;
  setBoardColorTheme: (theme: Exclude<BoardColorTheme, "custom">) => void;
  setCustomBoardColors: (colors: BoardColors) => void;
  setHomeEvaluationVisible: (visible: boolean) => void;
  setHomeSuggestionsVisible: (visible: boolean) => void;
  setHomeBoardOrder: (order: string[]) => void;
};

type BroadcastSettingsPayload = {
  homeEvaluationVisible?: boolean;
  homeSuggestionsVisible?: boolean;
  homeBoardOrder?: string[];
};

const BoardDisplayContext = createContext<BoardDisplayContextValue | undefined>(undefined);

export function BoardDisplayProvider({ children }: { children: React.ReactNode }) {
  const socket = useSocket();
  const [flipped, setFlipped] = useState(false);
  const [boardColorTheme, setBoardColorThemeState] = useState<BoardColorTheme>("classic");
  const [customBoardColors, setCustomBoardColorsState] = useState<BoardColors>(BOARD_COLOR_PRESETS.classic);
  const [homeEvaluationVisible, setHomeEvaluationVisibleState] = useState(true);
  const [homeSuggestionsVisible, setHomeSuggestionsVisibleState] = useState(true);
  const [homeBoardOrder, setHomeBoardOrderState] = useState<string[]>([]);

  useEffect(() => {
    setFlipped(localStorage.getItem("board-flipped") === "true");
    const savedTheme = localStorage.getItem("board-color-theme") as BoardColorTheme | null;
    if (savedTheme && (savedTheme === "custom" || savedTheme in BOARD_COLOR_PRESETS)) {
      setBoardColorThemeState(savedTheme);
    }
    try {
      const savedColors = JSON.parse(localStorage.getItem("board-custom-colors") || "null") as BoardColors | null;
      if (savedColors?.light && savedColors?.dark) setCustomBoardColorsState(savedColors);
    } catch {
      // Ignore invalid browser storage and keep the default chessboard palette.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applySettings = (payload: BroadcastSettingsPayload) => {
      if (typeof payload.homeEvaluationVisible === "boolean") {
        setHomeEvaluationVisibleState(payload.homeEvaluationVisible);
      }
      if (typeof payload.homeSuggestionsVisible === "boolean") {
        setHomeSuggestionsVisibleState(payload.homeSuggestionsVisible);
      }
      if (Array.isArray(payload.homeBoardOrder)) {
        setHomeBoardOrderState(payload.homeBoardOrder.filter((value): value is string => typeof value === "string"));
      }
    };
    const loadSettings = async () => {
      try {
        const response = await fetch("/broadcast-settings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Broadcast settings request failed: ${response.status}`);
        const payload = await response.json() as BroadcastSettingsPayload;
        if (!cancelled) applySettings(payload);
      } catch (error) {
        console.warn("Unable to load home display settings", error);
      }
    };

    socket?.on(SERVER_EVENT.BROADCAST_SETTINGS_UPDATED, applySettings);
    void loadSettings();
    return () => {
      cancelled = true;
      socket?.off(SERVER_EVENT.BROADCAST_SETTINGS_UPDATED, applySettings);
    };
  }, [socket]);

  const toggleFlipped = () => setFlipped((value) => {
    localStorage.setItem("board-flipped", String(!value));
    return !value;
  });
  const setBoardColorTheme = (theme: Exclude<BoardColorTheme, "custom">) => {
    setBoardColorThemeState(theme);
    localStorage.setItem("board-color-theme", theme);
  };
  const setCustomBoardColors = (colors: BoardColors) => {
    setCustomBoardColorsState(colors);
    setBoardColorThemeState("custom");
    localStorage.setItem("board-custom-colors", JSON.stringify(colors));
    localStorage.setItem("board-color-theme", "custom");
  };
  const setHomeEvaluationVisible = (visible: boolean) => {
    void persistHomeDisplaySetting({ homeEvaluationVisible: visible }).then((settings) => {
      if (typeof settings?.homeEvaluationVisible === "boolean") {
        setHomeEvaluationVisibleState(settings.homeEvaluationVisible);
      }
    });
  };
  const setHomeSuggestionsVisible = (visible: boolean) => {
    void persistHomeDisplaySetting({ homeSuggestionsVisible: visible }).then((settings) => {
      if (typeof settings?.homeSuggestionsVisible === "boolean") {
        setHomeSuggestionsVisibleState(settings.homeSuggestionsVisible);
      }
    });
  };
  const setHomeBoardOrder = (order: string[]) => {
    void persistHomeDisplaySetting({ homeBoardOrder: order }).then((settings) => {
      if (Array.isArray(settings?.homeBoardOrder)) {
        setHomeBoardOrderState(settings.homeBoardOrder);
      }
    });
  };
  const boardColors = boardColorTheme === "custom" ? customBoardColors : BOARD_COLOR_PRESETS[boardColorTheme];

  return <BoardDisplayContext.Provider value={{ flipped, boardColorTheme, boardColors, homeEvaluationVisible, homeSuggestionsVisible, homeBoardOrder, toggleFlipped, setBoardColorTheme, setCustomBoardColors, setHomeEvaluationVisible, setHomeSuggestionsVisible, setHomeBoardOrder }}>{children}</BoardDisplayContext.Provider>;
}

async function persistHomeDisplaySetting(patch: BroadcastSettingsPayload): Promise<BroadcastSettingsPayload | null> {
  try {
    const response = await apiFetch("/broadcast-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(`Broadcast settings update failed: ${response.status}`);
    return await response.json() as BroadcastSettingsPayload;
  } catch (error) {
    console.error("Unable to update home display settings", error);
    return null;
  }
}

export function useBoardDisplay() {
  const context = useContext(BoardDisplayContext);
  if (!context) throw new Error("useBoardDisplay must be used within BoardDisplayProvider");
  return context;
}
