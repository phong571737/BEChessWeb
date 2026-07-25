"use client";

import { createContext, useContext, useEffect, useState } from "react";

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
  showEvaluation: boolean;
  boardColorTheme: BoardColorTheme;
  boardColors: BoardColors;
  toggleFlipped: () => void;
  toggleEvaluation: () => void;
  setBoardColorTheme: (theme: Exclude<BoardColorTheme, "custom">) => void;
  setCustomBoardColors: (colors: BoardColors) => void;
};

const BoardDisplayContext = createContext<BoardDisplayContextValue | undefined>(undefined);

export function BoardDisplayProvider({ children }: { children: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(true);
  const [boardColorTheme, setBoardColorThemeState] = useState<BoardColorTheme>("classic");
  const [customBoardColors, setCustomBoardColorsState] = useState<BoardColors>(BOARD_COLOR_PRESETS.classic);

  useEffect(() => {
    setFlipped(localStorage.getItem("board-flipped") === "true");
    setShowEvaluation(localStorage.getItem("board-show-evaluation") !== "false");
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

  const toggleFlipped = () => setFlipped((value) => {
    localStorage.setItem("board-flipped", String(!value));
    return !value;
  });
  const toggleEvaluation = () => setShowEvaluation((value) => {
    localStorage.setItem("board-show-evaluation", String(!value));
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
  const boardColors = boardColorTheme === "custom" ? customBoardColors : BOARD_COLOR_PRESETS[boardColorTheme];

  return <BoardDisplayContext.Provider value={{ flipped, showEvaluation, boardColorTheme, boardColors, toggleFlipped, toggleEvaluation, setBoardColorTheme, setCustomBoardColors }}>{children}</BoardDisplayContext.Provider>;
}

export function useBoardDisplay() {
  const context = useContext(BoardDisplayContext);
  if (!context) throw new Error("useBoardDisplay must be used within BoardDisplayProvider");
  return context;
}
