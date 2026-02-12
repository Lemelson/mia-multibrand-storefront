"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  maxWidth?: string;
  children: React.ReactNode;
  ariaLabel: string;
}

export function SidePanel({
  open,
  onClose,
  side,
  maxWidth = "max-w-md",
  children,
  ariaLabel
}: SidePanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* Lock body scroll while the panel is open */
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  const slideFrom = side === "left" ? "-100%" : "100%";

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[390] bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={`fixed inset-y-0 ${side === "left" ? "left-0" : "right-0"} z-[400] h-screen w-full ${maxWidth} overflow-auto bg-white px-6 py-6`}
            initial={{ x: slideFrom }}
            animate={{ x: 0 }}
            exit={{ x: slideFrom }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            aria-label={ariaLabel}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
