"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useFontTheme } from "@/components/providers/font-theme-provider";

export function FooterFontSwitcher() {
  const { theme, setTheme, options } = useFontTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        className="inline-flex items-center gap-1.5 border border-border px-3 py-2 text-xs uppercase tracking-[0.08em] text-text-secondary"
      >
        Шрифт
        <ChevronDown size={13} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 min-w-[260px] border border-border bg-white p-1 shadow-lg">
          {options.map((option) => {
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs uppercase tracking-[0.08em] ${
                  active ? "bg-text-primary text-white" : "hover:bg-bg-secondary"
                }`}
              >
                <span>{option.label}</span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
