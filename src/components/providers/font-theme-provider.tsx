"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type FontTheme = "new" | "montserrat" | "prata" | "forum" | "tenor";

interface FontThemeOption {
  value: FontTheme;
  label: string;
  hint: string;
}

interface FontThemeContextValue {
  theme: FontTheme;
  setTheme: (theme: FontTheme) => void;
  options: FontThemeOption[];
}

const FONT_THEME_KEY = "mia-font-theme";
const DEFAULT_THEME: FontTheme = "new";

export const FONT_OPTIONS: FontThemeOption[] = [
  { value: "new", label: "Новые", hint: "Playfair Display + Manrope" },
  { value: "montserrat", label: "Прежние", hint: "Montserrat" },
  { value: "prata", label: "Prata", hint: "Prata + Manrope" },
  { value: "forum", label: "Forum", hint: "Forum + Inter" },
  { value: "tenor", label: "Tenor", hint: "Tenor Sans + Manrope" }
];

const FontThemeContext = createContext<FontThemeContextValue | null>(null);

export function FontThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<FontTheme>(DEFAULT_THEME);

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
    () => ({ theme, setTheme: setThemeState, options: FONT_OPTIONS }),
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
