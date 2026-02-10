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

const FONT_OPTIONS: FontThemeOption[] = [
  { value: "current", label: "Current (Cormorant + Manrope)" },
  { value: "proxima", label: "12S: Proxima Nova" },
  { value: "montserrat", label: "12S Alt: Montserrat" },
  { value: "sofia", label: "12S Alt: Sofia Pro" },
  { value: "gotham", label: "12S Alt: Gotham" }
];

const FontThemeContext = createContext<FontThemeContextValue | null>(null);

interface FontThemeProviderProps {
  children: ReactNode;
}

export function FontThemeProvider({ children }: FontThemeProviderProps) {
  const [theme, setThemeState] = useState<FontTheme>("current");

  useEffect(() => {
    const saved = localStorage.getItem(FONT_THEME_KEY) as FontTheme | null;

    if (saved && FONT_OPTIONS.some((option) => option.value === saved)) {
      setThemeState(saved);
    }
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
