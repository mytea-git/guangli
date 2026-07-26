"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const STORAGE_KEY = "guangli-theme";

function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) || "system";
    setThemeState(saved);
    applyTheme(saved);
  }, []);

  const setTheme = useCallback((choice: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, choice);
    setThemeState(choice);
    applyTheme(choice);
  }, []);

  return { theme, setTheme };
}
