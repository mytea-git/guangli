"use client";

import { CheckCircle2, XCircle, Info } from "lucide-react";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils/cn";

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const COLOR = {
  success: "text-emerald-600 border-emerald-200 dark:border-emerald-900",
  error: "text-red-600 border-red-200 dark:border-red-900",
  info: "text-neutral-600 border-neutral-200 dark:border-neutral-700",
} as const;

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm shadow-md dark:bg-neutral-900",
              COLOR[t.variant],
            )}
          >
            <Icon size={15} />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
