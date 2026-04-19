"use client";

import { usePathname } from "next/navigation";
import { ReportProblemFab } from "@/components/ReportProblemFab";

/** На главной только два CTA — без третьей кнопки «Сообщить о проблеме». */
export function ReportProblemFabGate() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const dense =
    pathname === "/calculator" ||
    pathname === "/pricing" ||
    pathname === "/services" ||
    pathname === "/history";

  return (
    <ReportProblemFab
      layout={dense ? "top" : "bottom"}
      fabBottomExtraPx={dense ? 0 : 0}
    />
  );
}
