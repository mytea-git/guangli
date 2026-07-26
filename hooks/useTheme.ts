"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const STORAGE_KEY = "guangli-theme";

function resolveDark(choice: ThemeChoice): boolean {
  if (choice === "dark") return true;
  if (choice === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(choice: ThemeChoice) {
  document.documentElement.classList.toggle("dark", resolveDark(choice));
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolvedDark, setResolvedDark] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) || "system";
    setThemeState(saved);
    setResolvedDark(resolveDark(saved));
    applyTheme(saved);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) || "system";
      if (current === "system") {
        setResolvedDark(mq.matches);
        applyTheme(current);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((choice: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, choice);
    setThemeState(choice);
    setResolvedDark(resolveDark(choice));
    applyTheme(choice);
  }, []);

  return { theme, setTheme, resolvedDark };
}
