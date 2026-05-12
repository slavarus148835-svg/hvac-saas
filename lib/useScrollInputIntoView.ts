"use client";

import { useEffect } from "react";

/**
 * В Telegram Mini App клавиатура часто перекрывает поле.
 * Плавно прокручиваем активный input/textarea/select в видимую область.
 */
export function useScrollInputIntoView(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const onFocusIn = (ev: Event) => {
      const t = ev.target;
      if (
        !(t instanceof HTMLInputElement) &&
        !(t instanceof HTMLTextAreaElement) &&
        !(t instanceof HTMLSelectElement)
      ) {
        return;
      }
      window.setTimeout(() => {
        t.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 320);
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [enabled]);
}
