"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Type } from "lucide-react";
import { useFontTheme } from "@/components/providers/font-theme-provider";

export function FooterFontSwitcher() {
  const { theme, setTheme, options } = useFontTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = options.find((option) => option.value === theme) ?? options[0];

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 border border-border px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-text-secondary transition hover:text-text-primary"
      >
        <Type size={13} />
        Шрифт: {active.label}
        <ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-[calc(100%+8px)] right-0 z-30 min-w-[260px] border border-border bg-white p-1 shadow-lg"
        >
          {options.map((option) => {
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                  isActive ? "bg-text-primary text-white" : "hover:bg-bg-secondary"
                }`}
              >
                <span className="flex flex-col">
                  <span className="text-xs uppercase tracking-[0.08em]">{option.label}</span>
                  <span className={`text-[11px] ${isActive ? "text-white/70" : "text-text-muted"}`}>
                    {option.hint}
                  </span>
                </span>
                {isActive && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
