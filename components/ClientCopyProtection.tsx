"use client";

import { useEffect } from "react";

export function ClientCopyProtection() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase();
      if (e.ctrlKey && (k === "u" || (e.shiftKey && k === "i"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const blockMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("keydown", blockKeys, true);
    window.addEventListener("contextmenu", blockMenu);
    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      window.removeEventListener("contextmenu", blockMenu);
    };
  }, []);
  return null;
}
