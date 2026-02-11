"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type FontTheme = "current" | "proxima" | "montserrat" | "sofia" | "gotham";

interface FontThemeOption {
  value: FontTheme;
  label: string;
}

interface FontThemeContextValue {
  theme: FontTheme;
  setTheme: (theme: FontTheme) => void;
  options: FontThemeOption[];
}

const FONT_THEME_KEY = "mia-font-theme";

export const FONT_OPTIONS: FontThemeOption[] = [
  { value: "current", label: "Текущий (Cormorant + Manrope)" },
  { value: "proxima", label: "12S: Proxima Nova" },
  { value: "montserrat", label: "12S альтернатива: Montserrat" },
  { value: "sofia", label: "12S альтернатива: Sofia Pro" },
  { value: "gotham", label: "12S альтернатива: Gotham" }
];

const FontThemeContext = createContext<FontThemeContextValue | null>(null);

interface FontThemeProviderProps {
  children: ReactNode;
}

export function FontThemeProvider({ children }: FontThemeProviderProps) {
  const [theme, setThemeState] = useState<FontTheme>("montserrat");

  useEffect(() => {
    const saved = localStorage.getItem(FONT_THEME_KEY) as FontTheme | null;

    if (saved && FONT_OPTIONS.some((option) => option.value === saved)) {
      setThemeState(saved);
      return;
    }

    setThemeState("montserrat");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.fontTheme = theme;
    localStorage.setItem(FONT_THEME_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      options: FONT_OPTIONS
    }),
    [theme]
  );

  return <FontThemeContext.Provider value={value}>{children}</FontThemeContext.Provider>;
}

export function useFontTheme() {
  const context = useContext(FontThemeContext);

  if (!context) {
    throw new Error("useFontTheme must be used inside FontThemeProvider");
  }

  return context;
}
