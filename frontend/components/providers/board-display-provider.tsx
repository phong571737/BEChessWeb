"use client";

import { createContext, useContext, useEffect, useState } from "react";

type BoardDisplayContextValue = {
  flipped: boolean;
  showEvaluation: boolean;
  toggleFlipped: () => void;
  toggleEvaluation: () => void;
};

const BoardDisplayContext = createContext<BoardDisplayContextValue | undefined>(undefined);

export function BoardDisplayProvider({ children }: { children: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(true);

  useEffect(() => {
    setFlipped(localStorage.getItem("board-flipped") === "true");
    setShowEvaluation(localStorage.getItem("board-show-evaluation") !== "false");
  }, []);

  const toggleFlipped = () => setFlipped((value) => {
    localStorage.setItem("board-flipped", String(!value));
    return !value;
  });
  const toggleEvaluation = () => setShowEvaluation((value) => {
    localStorage.setItem("board-show-evaluation", String(!value));
    return !value;
  });

  return <BoardDisplayContext.Provider value={{ flipped, showEvaluation, toggleFlipped, toggleEvaluation }}>{children}</BoardDisplayContext.Provider>;
}

export function useBoardDisplay() {
  const context = useContext(BoardDisplayContext);
  if (!context) throw new Error("useBoardDisplay must be used within BoardDisplayProvider");
  return context;
}
